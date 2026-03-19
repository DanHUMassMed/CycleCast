# CycleCast Performance Review — 2026-03-19

> **Symptom under investigation:** Phone overheats during extended podcast playback in Bike Mode.

This review covers every source file in `cyclecast/src/`. Findings are ordered by estimated thermal impact (highest first).

---

## 1. 🔴 Wake Lock — Infinite Re-acquire Loop (CRITICAL)

**File:** [`useWakeLock.ts`](file:///Users/dan/Code/Vibe_Coding/CycleCast/cyclecast/src/hooks/useWakeLock.ts)

### What's happening

```ts
// line 32-46
useEffect(() => {
  requestWakeLock();                          // ← called on every mount

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      requestWakeLock();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    releaseWakeLock();                        // ← in cleanup
  };
}, [requestWakeLock, releaseWakeLock]);       // ← THESE CHANGE EVERY RENDER
```

`releaseWakeLock` closes over `wakeLock` state and is recreated via `useCallback` whenever `wakeLock` changes (line 29). After the initial `requestWakeLock()` succeeds, `setWakeLock(lock)` triggers a state update → the dependency array fires → the effect tears down (calling `releaseWakeLock`) → the effect re-runs (calling `requestWakeLock` again), forming a **tight acquire → release → acquire loop**.

### Why this overheats the phone

Each `navigator.wakeLock.request('screen')` is a privileged OS call. Rapidly calling it in a loop prevents the display controller from entering its low-power idle state and keeps the GPU compositing pipeline active. On iOS/Android WebKit, the screen-wake hardware path also holds a CPU boost that blocks frequency downscaling. The result is sustained high CPU frequency + display backlight, both major sources of thermal load.

### Recommendation

Use a ref instead of state for the sentinel so the callback identities are stable:

```ts
const wakeLockRef = useRef<WakeLockSentinel | null>(null);

const requestWakeLock = useCallback(async () => {
  if (wakeLockRef.current) return;            // already held
  try {
    if ('wakeLock' in navigator) {
      const lock = await navigator.wakeLock.request('screen');
      wakeLockRef.current = lock;
      lock.addEventListener('release', () => {
        wakeLockRef.current = null;
      });
    }
  } catch (err) {
    console.error('Wake Lock error:', err);
  }
}, []);

const releaseWakeLock = useCallback(async () => {
  await wakeLockRef.current?.release();
  wakeLockRef.current = null;
}, []);

useEffect(() => {
  requestWakeLock();
  const handler = () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  };
  document.addEventListener('visibilitychange', handler);
  return () => {
    document.removeEventListener('visibilitychange', handler);
    releaseWakeLock();
  };
}, []);  // stable — runs once
```

This acquires the lock once and re-acquires only after a genuine visibility change.

---

## 2. 🔴 `timeupdate` Drives a Global Re-render Cascade (CRITICAL)

**Files:** [`useAudioPlayer.ts`](file:///Users/dan/Code/Vibe_Coding/CycleCast/cyclecast/src/hooks/useAudioPlayer.ts) → [`AudioContext.tsx`](file:///Users/dan/Code/Vibe_Coding/CycleCast/cyclecast/src/context/AudioContext.tsx) → every consumer

### What's happening

```ts
// useAudioPlayer.ts, line 25
const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
```

The browser fires `timeupdate` roughly **4 times per second**. Each call to `setCurrentTime` triggers a state change in the `useAudioPlayer` hook, which is consumed inside `AudioProvider`. Because `currentTime` is included in the `playbackValue` context object (line 197), **every context consumer re-renders 4×/sec**.

### Thermal impact

Every re-render means React's reconciliation (diffing, fiber tree walk), MUI's `sx` prop CSS-in-JS recalculation, and DOM mutations. At 4 Hz with the entire BikePlayView + AppContent tree, this is hundreds of unnecessary style recalculations per second. On a mobile CPU with limited L2 cache, this sustained JS workload directly translates to heat.

### Recommendation

**A. Throttle `setCurrentTime` to ~1 Hz.** The user doesn't perceive sub-second time display changes during podcast playback.

```ts
const lastTimeRef = useRef(0);
const handleTimeUpdate = () => {
  const now = audio.currentTime;
  if (Math.abs(now - lastTimeRef.current) >= 1) {
    lastTimeRef.current = now;
    setCurrentTime(now);
  }
};
```

**B. Split the context so `currentTime` doesn't ripple to all consumers.** Only `BikePlayView` (for the time display) and `useMediaSession` (for `setPositionState`) need `currentTime`. The other consumers (HomeView, ConfigView, SearchPodcasts) only need `loadEpisode`, `isPlaying`, etc. See Finding #4 for details.

---

## 3. 🟠 `setPositionState` Called on Every `currentTime` Tick (HIGH)

**File:** [`useMediaSession.ts`](file:///Users/dan/Code/Vibe_Coding/CycleCast/cyclecast/src/hooks/useMediaSession.ts)

### What's happening

```ts
// line 60-72
useEffect(() => {
  if (...) {
    navigator.mediaSession.setPositionState({
      duration, playbackRate, position: currentTime
    });
  }
}, [currentTime, duration, playbackRate]);
```

This effect runs every time `currentTime` changes — up to 4× per second. `setPositionState` is an IPC call to the OS media transport (lock screen controls, notification shade). Each call involves serialization, cross-process communication, and a UI update in the system-level media widget.

### Why this matters

Frequent IPC is expensive on mobile. The system media session widget repaints on each call, and the OS may throttle or queue these updates, adding to CPU backpressure. Browsers like mobile Safari and Chrome have their own internal debouncing, but calling it this often still creates unnecessary work.

### Recommendation

Throttle calls to once every 5–10 seconds. The lock-screen scrubber interpolates position between updates, so infrequent calls are fine:

```ts
const lastPositionUpdateRef = useRef(0);

useEffect(() => {
  if ('mediaSession' in navigator && ... && duration > 0) {
    const now = Date.now();
    if (now - lastPositionUpdateRef.current < 5000) return;
    lastPositionUpdateRef.current = now;

    try {
      navigator.mediaSession.setPositionState({
        duration, playbackRate: playbackRate || 1, position: currentTime
      });
    } catch {}
  }
}, [currentTime, duration, playbackRate]);
```

---

## 4. 🟠 Context Value Objects Recreated Every Render (HIGH)

**File:** [`AudioContext.tsx`](file:///Users/dan/Code/Vibe_Coding/CycleCast/cyclecast/src/context/AudioContext.tsx#L191-L200)

### What's happening

```ts
// lines 191-200
const settingsValue: SettingsContextType = { ... };
const playbackValue: PlaybackContextType = { ... };
```

These objects are recreated on **every render** of `AudioProvider`. Because of `timeupdate` driving ~4 renders/sec, both context values get new object references 4×/sec. React's context comparison is by reference (`Object.is`), so every consumer sees a "changed" context and re-renders, even if only `currentTime` actually changed.

### Recommendation

Wrap each value object in `useMemo`:

```ts
const settingsValue = useMemo(() => ({
  defaultPlaybackRate, skipIntervals, skipMode, backendUrl,
  updateDefaultPlaybackRate, updateSkipIntervals, updateSkipMode, updateBackendUrl
}), [defaultPlaybackRate, skipIntervals, skipMode, backendUrl,
     updateDefaultPlaybackRate, updateSkipIntervals, updateSkipMode, updateBackendUrl]);

const playbackValue = useMemo(() => ({
  isPlaying, currentTime, duration, activePlaybackRate, currentTrackMetadata,
  loadEpisode, cyclePlaybackRate, resetPlaybackRate, play, pause, seek,
  skipToNext, skipToPrevious, audioRef
}), [isPlaying, currentTime, duration, activePlaybackRate, currentTrackMetadata,
     loadEpisode, cyclePlaybackRate, resetPlaybackRate, play, pause, seek,
     skipToNext, skipToPrevious, audioRef]);
```

This ensures `settingsValue` only changes when a setting actually changes, completely insulating `ConfigView`, `SearchPodcasts`, and `EpisodeRow` from the `timeupdate` render storm.

---

## 5. 🟠 CSS `filter: blur()` Background on BikePlayView (MEDIUM-HIGH)

**File:** [`BikePlayView.tsx`](file:///Users/dan/Code/Vibe_Coding/CycleCast/cyclecast/src/components/BikePlayView.tsx#L86-L100)

### What's happening

```ts
'&::before': currentTrackMetadata ? {
  backgroundImage: `url(${currentTrackMetadata.artworkUrl})`,
  backgroundSize: 'cover',
  opacity: 0.15,
  filter: 'blur(10px)',       // ← expensive GPU composite layer
} : {}
```

`filter: blur()` on a full-viewport pseudo-element forces the GPU to maintain a separate compositing layer and apply a Gaussian blur shader on every composite. On most mobile GPUs this is cheap for static content, but because the `sx` prop object is **recreated on every render** (including the 4×/sec `timeupdate` renders), MUI regenerates styles, which can cause the browser to re-paint and re-composite the blur layer.

### Recommendation

Two things:
1. **Pre-blur the artwork** at download time (canvas API or server-side) and use a plain `background-image` with no CSS filter.
2. At minimum, extract the `sx` object into a `useMemo` or a constant outside the component so MUI doesn't regenerate the CSS class on every render.

---

## 6. 🟡 2-Second Polling Interval in HomeView (MEDIUM)

**File:** [`HomeView.tsx`](file:///Users/dan/Code/Vibe_Coding/CycleCast/cyclecast/src/components/HomeView.tsx#L96-L109)

### What's happening

```ts
const interval = setInterval(fetchLibrary, 2000);
```

Every 2 seconds, `fetchLibrary` reads from IndexedDB (`getLibraryMetadata`), allocates a new array, and conditionally calls `setLibrary`. This polls even when the user is in **Bike Mode** (the HomeSiew is rendered with `display: none`).

### Why this matters

IndexedDB reads are asynchronous and involve IPC with the browser's storage process. Every 2 seconds, this creates a microtask chain: IndexedDB read → deserialization → array comparison → potential state update. During a 60-minute ride that's 1,800 unnecessary IndexedDB reads.

### Recommendation

1. **Stop polling when not visible.** Use `document.visibilityState` or track the active tab index:
   ```ts
   useEffect(() => {
     if (tabIndex !== 0) return;  // only poll when HomeView is active
     const interval = setInterval(fetchLibrary, 5000);
     return () => clearInterval(interval);
   }, [tabIndex]);
   ```
2. **Replace polling with events.** After `addEpisodeToLibrary` / `removeEpisodeFromLibrary`, dispatch a custom event or use a shared state atom to notify HomeView to refresh. This eliminates the timer entirely.

---

## 7. 🟡 `skipToNext` / `skipToPrevious` Read IndexedDB on Every Call (LOW-MEDIUM)

**File:** [`AudioContext.tsx`](file:///Users/dan/Code/Vibe_Coding/CycleCast/cyclecast/src/context/AudioContext.tsx#L124-L177)

### What's happening

```ts
const skipToNext = useCallback(async () => {
  const library = await getLibraryMetadata(); // IndexedDB read
  ...
}, [...]);
```

Every skip-track button press triggers an IndexedDB read. The library metadata is small, but IndexedDB reads are asynchronous and involve process-level IPC.

### Recommendation

Cache the library metadata in memory (e.g., a ref or state) and update the cache on add/remove. The library changes rarely compared to skip frequency.

---

## 8. 🟡 Multiple `useCallback` Dependencies on Volatile Values (LOW-MEDIUM)

**File:** [`AudioContext.tsx`](file:///Users/dan/Code/Vibe_Coding/CycleCast/cyclecast/src/context/AudioContext.tsx#L150)

### What's happening

```ts
const skipToPrevious = useCallback(async () => {
  ...
  seek(currentTime - 300);
}, [skipMode, currentTime, duration, currentTrackMetadata, loadEpisode]);
```

`currentTime` changes ~4×/sec, so `skipToPrevious` and `skipToNext` are **re-created 4 times per second**. Since they're included in `playbackValue`, this contributes to the context thrashing described in Finding #4.

### Recommendation

Instead of closing over `currentTime`, read it from the audio ref at call time:

```ts
const skipToPrevious = useCallback(async () => {
  if (skipMode !== 'podcast') {
    const now = audioRef.current?.currentTime ?? 0;
    seek(now - 300);
    return;
  }
  // ... podcast skip logic
}, [skipMode, currentTrackMetadata, loadEpisode, seek, audioRef]);
```

This removes `currentTime` and `duration` from the dependency array, making the callback identity stable during normal playback.

---

## 9. 🟢 Potential ObjectURL Memory Leak (LOW — correctness, not thermal)

**File:** [`useAudioPlayer.ts`](file:///Users/dan/Code/Vibe_Coding/CycleCast/cyclecast/src/hooks/useAudioPlayer.ts#L53-L82)

### What's happening

```ts
const loadEpisode = useCallback(async (info: TrackMetadata) => {
  ...
  if (currentObjectURLRef.current) {
    URL.revokeObjectURL(currentObjectURLRef.current);
  }
  ...
}, [activePlaybackRate]);
```

`loadEpisode` is recreated whenever `activePlaybackRate` changes. The old closure's `currentObjectURLRef` is shared (it's a ref), so this is safe. However, the cleanup function in the main `useEffect` (line 35-43) does **not** revoke the ObjectURL on unmount:

```ts
return () => {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  // ← missing: URL.revokeObjectURL(currentObjectURLRef.current)
};
```

### Recommendation

Add `URL.revokeObjectURL(currentObjectURLRef.current)` to the unmount cleanup. While not a heat source, leaked large blob URLs keep audio data in memory.

---

## Summary: Root Cause of Phone Overheating

The heating issue is almost certainly a combination of **Findings #1 and #2**:

| Finding | Impact | Heat mechanism |
|---------|--------|----------------|
| #1 Wake Lock loop | 🔴 Critical | OS wake lock acquire/release tight loop → CPU boost stays on, display never idles |
| #2 `timeupdate` re-render cascade | 🔴 Critical | 4 full React tree re-renders/sec → sustained JS + style recalc CPU load |
| #3 `setPositionState` spam | 🟠 High | ~4 IPC calls/sec to system media widget |
| #4 Un-memoized context | 🟠 High | Amplifies #2 by re-rendering all consumers, not just time-displaying ones |
| #5 CSS blur re-composite | 🟠 Medium-High | GPU composite churn on each of the 4×/sec re-renders |

### Prioritized fix order

1. **Fix the wake lock loop** (#1) — likely the single biggest thermal contributor
2. **Throttle `timeupdate` to 1 Hz** (#2) — reduces render work by 75%
3. **Memoize context values** (#4) — eliminates re-renders for non-time consumers
4. **Throttle `setPositionState`** (#3) — eliminates IPC spam
5. **Stabilize skip callbacks** (#8) — eliminates unnecessary callback recreation
6. **Address blur & polling** (#5, #6) — secondary improvements
