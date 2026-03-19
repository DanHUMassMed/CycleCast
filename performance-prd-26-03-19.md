# PRD: Performance Fixes & Screen Lock Toggle

**Date:** 2026-03-19  
**Status:** Draft  
**Project:** CycleCast — Cycling-optimized podcast PWA  
**Stack:** React 18 + TypeScript + Vite + MUI + vite-plugin-pwa

---

## 1. Problem Statement

Users report that their phone **overheats during extended podcast playback** in Bike Mode. Two root causes have been identified through code review, along with a missing user-facing control:

1. **Wake Lock infinite re-acquire loop** — the `useWakeLock` hook acquires and releases the screen wake lock in a tight cycle due to a React dependency-array bug, causing sustained CPU and display-controller load.
2. **High-frequency re-render cascade** — the HTML5 `<audio>` element fires `timeupdate` events ~4 times per second; each event triggers a React state update that cascades through the entire component tree via an un-memoized context value, generating hundreds of unnecessary style recalculations per second.
3. **No user control over Screen Lock** — the wake lock is unconditionally acquired whenever Bike Mode is entered and there is no way for the user to disable it.

This PRD specifies the changes needed to resolve all three issues.

---

## 2. Background & Technical Context

### 2.1 Current Architecture

CycleCast is a single-page PWA with three tabs: **Home**, **Bike Mode**, and **Config**.

```
main.tsx
  └─ App.tsx (ThemeProvider + AudioProvider)
       └─ AppContent.tsx (tab router)
            ├─ HomeView.tsx          (display: none when inactive)
            ├─ BikePlayView.tsx      (conditionally rendered when tab === 1)
            └─ ConfigView.tsx        (display: none when inactive)
```

Audio playback state lives in a single `AudioProvider` context (`context/AudioContext.tsx`) which consumes the `useAudioPlayer` hook and the `useMediaSession` hook. The provider exposes two React contexts:

| Context | Consumers | Values |
|---------|-----------|--------|
| `PlaybackContext` | `BikePlayView`, `AppContent`, `HomeView`, `SearchPodcasts` | `isPlaying`, `currentTime`, `duration`, `activePlaybackRate`, `currentTrackMetadata`, `loadEpisode`, `play`, `pause`, `seek`, `skipToNext`, `skipToPrevious`, `cyclePlaybackRate`, `resetPlaybackRate`, `audioRef` |
| `SettingsContext` | `ConfigView`, `SearchPodcasts`, `EpisodeRow` | `defaultPlaybackRate`, `skipIntervals`, `skipMode`, `backendUrl`, and their updaters |

### 2.2 The Wake Lock Hook Today

**File:** `src/hooks/useWakeLock.ts` (50 lines)

```typescript
export const useWakeLock = () => {
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        const lock = await navigator.wakeLock.request('screen');
        setWakeLock(lock);
        lock.addEventListener('release', () => {
          setWakeLock(null);
        });
      }
    } catch (err) {
      console.error(`Wake Lock error: `, err);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLock !== null) {
      await wakeLock.release();
      setWakeLock(null);
    }
  }, [wakeLock]);

  useEffect(() => {
    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);

  return { requestWakeLock, releaseWakeLock, isLocked: wakeLock !== null };
};
```

**The bug:** `releaseWakeLock` has `[wakeLock]` in its `useCallback` dependency array, so its identity changes every time `wakeLock` state changes. Because `releaseWakeLock` is in the `useEffect` dependency array, the effect re-runs whenever a lock is acquired or released. The sequence is:

1. Mount → effect runs → `requestWakeLock()` → lock acquired → `setWakeLock(lock)` → state update
2. `wakeLock` state changed → `releaseWakeLock` recreated → effect cleanup runs → `releaseWakeLock()` → lock released → `setWakeLock(null)` → state update  
3. `wakeLock` state changed → `releaseWakeLock` recreated → effect runs again → go to step 1

This produces a **rapid acquire → release → acquire loop** that:
- Prevents the display controller from entering low-power idle
- Holds a CPU frequency boost on iOS/Android (the wake lock hardware path blocks frequency downscaling)
- Generates sustained OS-level IPC traffic

### 2.3 The `timeupdate` Render Cascade Today

**File:** `src/hooks/useAudioPlayer.ts` — within the initialization `useEffect`:

```typescript
const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
audio.addEventListener('timeupdate', handleTimeUpdate);
```

The browser fires `timeupdate` approximately **4 times per second** (per the HTML5 spec, every 250ms ± jitter). Each call to `setCurrentTime(audio.currentTime)` triggers a state update in `useAudioPlayer`, which re-renders `AudioProvider`.

**File:** `src/context/AudioContext.tsx` — at the bottom of `AudioProvider`:

```typescript
const playbackValue: PlaybackContextType = {
  isPlaying, currentTime, duration, activePlaybackRate, currentTrackMetadata,
  loadEpisode, cyclePlaybackRate, resetPlaybackRate, play, pause, seek,
  skipToNext, skipToPrevious, audioRef
};

return (
  <SettingsContext.Provider value={settingsValue}>
    <PlaybackContext.Provider value={playbackValue}>
      {children}
    </PlaybackContext.Provider>
  </SettingsContext.Provider>
);
```

`playbackValue` is a **new object literal on every render**. React context uses reference equality (`Object.is`) to decide whether consumers should re-render. Because `playbackValue` is a new object 4×/sec, **every consumer of `PlaybackContext` re-renders 4×/sec**, including:

- `BikePlayView` (the only component that actually displays `currentTime`)
- `AppContent` (uses `isPlaying` and `resetPlaybackRate`)
- `HomeView` (uses `loadEpisode`)
- `SearchPodcasts` (uses `loadEpisode`)

Each re-render involves:
- React fiber-tree reconciliation (diffing)
- MUI `sx` prop CSS-in-JS class generation (emotion)
- DOM style recalculations
- Potential composite-layer repaints (especially the `filter: blur(10px)` background in BikePlayView)

Over a 60-minute ride at 4 Hz, this is **14,400 unnecessary full-tree re-renders**.

Additionally, two `useCallback`s in `AudioContext.tsx` include `currentTime` in their dependency arrays:

```typescript
const skipToPrevious = useCallback(async () => {
  // ...
  seek(currentTime - 300);
}, [skipMode, currentTime, duration, currentTrackMetadata, loadEpisode]);

const skipToNext = useCallback(async () => {
  // ...
  seek(currentTime + skipIntervals.forward);
}, [skipMode, currentTime, duration, currentTrackMetadata, loadEpisode, skipIntervals.forward, seek]);
```

Because `currentTime` changes 4×/sec, these callbacks are **recreated 4×/sec**, which further destabilizes the context value reference.

---

## 3. Goals

| # | Goal | Success Metric |
|---|------|----------------|
| G1 | Eliminate the wake lock acquire/release loop | Wake lock acquired exactly once per Bike Mode session; re-acquired only after a genuine `visibilitychange` event |
| G2 | Reduce render frequency during playback by ≥75% | `currentTime` state updates throttled to ≤1 Hz |
| G3 | Isolate `currentTime` renders to only components that display it | `HomeView`, `SearchPodcasts`, `ConfigView`, and `AppContent` do **not** re-render on time ticks |
| G4 | Give users a toggle to enable/disable Screen Lock | New "Keep Screen On" toggle in Config page, persisted to `localStorage`, defaulting to **enabled** |
| G5 | No playback regressions | Seek, skip, play/pause, playback rate, media session lock-screen controls all continue to work correctly |

---

## 4. Non-Goals

- Fixing `setPositionState` IPC frequency (separate, lower-priority issue)
- Replacing the 2-second polling in HomeView (separate concern)
- Pre-blurring artwork to eliminate the CSS `filter: blur()` GPU cost
- Adding unit tests (the project currently has none; adding a test framework is out of scope)

---

## 5. Detailed Requirements

### 5.1 Fix #1 — Wake Lock Infinite Loop

#### 5.1.1 Root Cause Fix

Replace `useState` for the wake lock sentinel with `useRef`. This makes `requestWakeLock` and `releaseWakeLock` callback identities stable (no state-change → no dependency-array churn → no effect re-run).

#### 5.1.2 Guard Against Double-Acquire

Add an early return in `requestWakeLock` if a lock is already held (`wakeLockRef.current !== null`). The current code has no such guard.

#### 5.1.3 Visibility Re-acquire

Keep the `visibilitychange` listener. The Screen Wake Lock API specification states that the lock is automatically released when the page becomes hidden, so re-acquiring on `visible` is correct behavior — but only if the user has Screen Lock **enabled** (see §5.3).

#### 5.1.4 Expose an `isLocked` Derived Value

Since a ref doesn't trigger re-renders, if any UI ever needs to display lock status, expose it via a minimal state boolean that is set only in the `release` and `request` success paths. For the current UI this is not consumed anywhere visually, so it can remain as an informational return value.

#### 5.1.5 Revised `useWakeLock` Implementation

The hook must accept an `enabled` parameter so it can be controlled by the new Screen Lock setting:

```typescript
import { useRef, useEffect, useCallback, useState } from 'react';

export const useWakeLock = (enabled: boolean = true) => {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const requestWakeLock = useCallback(async () => {
    if (wakeLockRef.current) return;  // already held — no-op
    try {
      if ('wakeLock' in navigator) {
        const lock = await navigator.wakeLock.request('screen');
        wakeLockRef.current = lock;
        setIsLocked(true);
        lock.addEventListener('release', () => {
          wakeLockRef.current = null;
          setIsLocked(false);
          console.log('Wake Lock was released');
        });
        console.log('Wake Lock acquired');
      }
    } catch (err) {
      console.error('Wake Lock error:', err);
    }
  }, []);  // stable — no dependencies

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      // The 'release' event listener above will null the ref and update state
    }
  }, []);  // stable — no dependencies

  useEffect(() => {
    if (!enabled) {
      // If the user has turned off Screen Lock, release any existing lock
      releaseWakeLock();
      return;
    }

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [enabled, requestWakeLock, releaseWakeLock]);
  // requestWakeLock and releaseWakeLock are now stable,
  // so `enabled` is the only value that can re-trigger this effect.

  return { isLocked };
};
```

**Key changes from current code:**
1. `wakeLock` stored in a `useRef` instead of `useState` — no re-renders on acquire/release
2. `requestWakeLock` has an early-return guard (`if (wakeLockRef.current) return`)
3. Both callbacks have empty dependency arrays → stable identity → effect runs only once (or when `enabled` changes)
4. Accepts an `enabled` boolean to support the Screen Lock toggle
5. `isLocked` is a minimal state boolean for informational purposes only

---

### 5.2 Fix #2 — Throttle `timeupdate` and Memoize Context Values

#### 5.2.1 Throttle `setCurrentTime` to 1 Hz

In `useAudioPlayer.ts`, replace the direct `setCurrentTime(audio.currentTime)` handler with a throttled version that only updates state when the time has changed by ≥1 second:

```typescript
const lastReportedTimeRef = useRef(0);

const handleTimeUpdate = () => {
  const now = audio.currentTime;
  if (Math.abs(now - lastReportedTimeRef.current) >= 1) {
    lastReportedTimeRef.current = now;
    setCurrentTime(now);
  }
};
```

**Rationale:** The time display in `BikePlayView` shows `M:SS` format. Sub-second updates are invisible to the user. Reducing from ~4 Hz to ~1 Hz eliminates 75% of state updates with zero user-visible impact.

**Edge case — seeking:** When the user seeks, the `timeupdate` after a seek may jump by more than 1 second, so the threshold comparison (`Math.abs(now - lastReportedTimeRef.current) >= 1`) correctly allows the update through immediately.

#### 5.2.2 Memoize `playbackValue` and `settingsValue` in `AudioContext.tsx`

Wrap both context value objects in `useMemo`:

```typescript
const settingsValue = useMemo<SettingsContextType>(() => ({
  defaultPlaybackRate,
  skipIntervals,
  skipMode,
  backendUrl,
  updateDefaultPlaybackRate,
  updateSkipIntervals,
  updateSkipMode,
  updateBackendUrl,
}), [
  defaultPlaybackRate, skipIntervals, skipMode, backendUrl,
  updateDefaultPlaybackRate, updateSkipIntervals, updateSkipMode, updateBackendUrl,
]);

const playbackValue = useMemo<PlaybackContextType>(() => ({
  isPlaying,
  currentTime,
  duration,
  activePlaybackRate,
  currentTrackMetadata,
  loadEpisode,
  cyclePlaybackRate,
  resetPlaybackRate,
  play,
  pause,
  seek,
  skipToNext,
  skipToPrevious,
  audioRef,
}), [
  isPlaying, currentTime, duration, activePlaybackRate, currentTrackMetadata,
  loadEpisode, cyclePlaybackRate, resetPlaybackRate, play, pause, seek,
  skipToNext, skipToPrevious, audioRef,
]);
```

**Effect:** `settingsValue` will only change when a setting is actually modified. `playbackValue` still changes on every `currentTime` tick (~1 Hz after throttling), but components consuming only `SettingsContext` (ConfigView, SearchPodcasts, EpisodeRow) will no longer re-render during playback.

#### 5.2.3 Remove `currentTime` from `skipToNext` / `skipToPrevious` Dependency Arrays

The `skipToPrevious` and `skipToNext` callbacks in `AudioContext.tsx` currently close over `currentTime`, causing them to be recreated ~4×/sec (or ~1×/sec after throttling). Since these callbacks only need `currentTime` at the moment they are invoked, they should read it from the audio ref instead:

**`skipToPrevious` — chapter-mode branch:**
```typescript
const skipToPrevious = useCallback(async () => {
  if (skipMode === 'podcast') {
    // ... podcast skip logic (unchanged, doesn't use currentTime)
  } else {
    const now = audioRef.current?.currentTime ?? 0;
    seek(now - 300);
  }
}, [skipMode, currentTrackMetadata, loadEpisode, seek, audioRef]);
```

**`skipToNext` — chapter-mode branch:**
```typescript
const skipToNext = useCallback(async () => {
  if (skipMode === 'podcast') {
    // ... podcast skip logic (unchanged)
  } else {
    const now = audioRef.current?.currentTime ?? 0;
    seek(now + skipIntervals.forward);
  }
}, [skipMode, currentTrackMetadata, loadEpisode, skipIntervals.forward, seek, audioRef]);
```

**Effect:** Both callbacks are now stable during normal playback (they only change when `skipMode`, `currentTrackMetadata`, or `skipIntervals` change), which further reduces unnecessary `playbackValue` reference churn.

---

### 5.3 Feature — Screen Lock Toggle in Config

#### 5.3.1 New Setting: `screenLockEnabled`

| Property | Value |
|----------|-------|
| `localStorage` key | `cyclecast_screen_lock` |
| Type | `boolean` |
| Default | `true` (screen lock is on by default — preserves current behavior) |
| UI label | "Keep Screen On" |
| UI description | "Prevents the screen from dimming during Bike Mode. Disable to save battery." |
| Location in Config page | Below the "Track Skip Mode" toggle group, above the "Backend API URL" section |

#### 5.3.2 Context Changes

Add the following to `SettingsContextType` in `AudioContext.tsx`:

```typescript
interface SettingsContextType {
  // ... existing fields ...
  screenLockEnabled: boolean;
  updateScreenLockEnabled: (enabled: boolean) => void;
}
```

Add state and updater in `AudioProvider`:

```typescript
const [screenLockEnabled, setScreenLockEnabled] = useState<boolean>(() => {
  const saved = localStorage.getItem('cyclecast_screen_lock');
  return saved !== null ? saved === 'true' : true; // default to true
});

const updateScreenLockEnabled = useCallback((enabled: boolean) => {
  setScreenLockEnabled(enabled);
  localStorage.setItem('cyclecast_screen_lock', String(enabled));
}, []);
```

Include both in the `settingsValue` memo.

#### 5.3.3 Plumbing to `BikePlayView`

`BikePlayView` currently calls `useWakeLock()` unconditionally:

```typescript
// BikePlayView.tsx, line 29
useWakeLock();
```

Change this to read the setting and pass it through:

```typescript
import { useSettings } from '../context/AudioContext';

// Inside the component:
const { screenLockEnabled } = useSettings();
useWakeLock(screenLockEnabled);
```

`BikePlayView` already imports `useSettings` on line 11, so only the destructured field and the `useWakeLock` call need to change.

#### 5.3.4 Config Page UI

Add a new section in `ConfigView.tsx` between the "Track Skip Mode" toggle and the "Backend API URL" text field. Use an MUI `Switch` component:

```tsx
import { Switch, FormControlLabel } from '@mui/material';

// Inside the component, destructure the new setting:
const { screenLockEnabled, updateScreenLockEnabled, /* ...existing... */ } = useSettings();

// In the JSX, new section:
<Box sx={{ pt: 3, mt: 3, borderTop: '1px solid #333' }}>
  <FormControlLabel
    control={
      <Switch
        checked={screenLockEnabled}
        onChange={(e) => updateScreenLockEnabled(e.target.checked)}
        sx={{
          '& .MuiSwitch-switchBase.Mui-checked': { color: '#1db954' },
          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#1db954' },
        }}
      />
    }
    label={
      <Box>
        <Typography sx={{ color: '#fff' }}>Keep Screen On</Typography>
        <Typography variant="caption" sx={{ color: '#888' }}>
          Prevents the screen from dimming during Bike Mode. Disable to save battery.
        </Typography>
      </Box>
    }
    sx={{ alignItems: 'flex-start', ml: 0 }}
  />
</Box>
```

#### 5.3.5 Behavior Matrix

| `screenLockEnabled` | User in Bike Mode | Wake Lock |
|---|---|---|
| `true` | Yes | Acquired; re-acquired on visibility change |
| `true` | No | Not acquired (BikePlayView is unmounted) |
| `false` | Yes | Not acquired; existing lock released if previously acquired |
| `false` | No | Not acquired |

---

## 6. Files Changed

| File | Change Type | Summary |
|------|------------|---------|
| `src/hooks/useWakeLock.ts` | **Modify** | Replace `useState` with `useRef` for sentinel. Accept `enabled` parameter. Stabilize callback identities. Add double-acquire guard. |
| `src/hooks/useAudioPlayer.ts` | **Modify** | Throttle `handleTimeUpdate` to fire `setCurrentTime` at ≤1 Hz using a ref-based threshold comparison. |
| `src/context/AudioContext.tsx` | **Modify** | (1) Add `screenLockEnabled` + `updateScreenLockEnabled` to `SettingsContextType` and `AudioProvider`. (2) Wrap `settingsValue` and `playbackValue` in `useMemo`. (3) Remove `currentTime` and `duration` from `skipToNext`/`skipToPrevious` dependency arrays; read from `audioRef` at call time instead. |
| `src/components/BikePlayView.tsx` | **Modify** | Pass `screenLockEnabled` from `useSettings()` to `useWakeLock(screenLockEnabled)`. |
| `src/components/ConfigView.tsx` | **Modify** | Add "Keep Screen On" `Switch` toggle, wired to `screenLockEnabled` / `updateScreenLockEnabled`. Import `Switch` and `FormControlLabel` from MUI. |

No files are created or deleted.

---

## 7. Verification Plan

### 7.1 Wake Lock Loop Fix

1. **Open the app in Chrome DevTools → Application → Service Workers panel** (or use `chrome://flags` to enable Wake Lock logging).
2. Enter Bike Mode and **observe the console** — there should be exactly **one** `"Wake Lock acquired"` log. Previously there would be a rapid stream of acquire/release logs.
3. Put the browser tab in the background (switch tabs), then bring it back — verify a **single** re-acquire log appears.
4. Navigate out of Bike Mode — verify a **single** `"Wake Lock was released"` log appears.
5. Toggle Screen Lock off in Config, re-enter Bike Mode — verify **no** wake lock log appears.
6. Toggle Screen Lock on in Config while in Bike Mode — verify the lock is acquired.

### 7.2 `timeupdate` Throttle

1. Temporarily add a `console.log` inside the throttled `handleTimeUpdate` to count calls.
2. Play a podcast for 10 seconds — expect approximately **10 logs** (1/sec), not ~40 (4/sec).
3. Seek forward — verify the time display updates **immediately** (the ≥1s delta threshold allows the seek-jump through).
4. Verify the `M:SS` time display in BikePlayView still ticks every second.

### 7.3 Context Memoization

1. Use React DevTools → Profiler → "Highlight updates when components render".
2. Play a podcast while on the **Config** tab — verify `ConfigView` shows **zero** highlight flashes (it previously flashed 4×/sec).
3. Play a podcast while on the **Home** tab — verify the library list does **not** flash.
4. Switch to Bike Mode — verify `BikePlayView` flashes approximately once per second (correctly, for the time display), not 4×/sec.

### 7.4 Screen Lock Toggle

1. Open Config → verify "Keep Screen On" toggle is present and defaults to **on**.
2. Toggle it off → verify `localStorage.getItem('cyclecast_screen_lock')` is `"false"`.
3. Enter Bike Mode with toggle off → verify screen is **allowed to dim** (on a real phone, the screen will auto-lock after the OS timeout).
4. Toggle it on → verify screen **stays on** (wake lock re-acquired).
5. Kill and reopen the app → verify the toggle state is persisted.

### 7.5 Regression Checklist

| Feature | Test |
|---------|------|
| Play/Pause | Tap play, tap pause — audio responds |
| Seek (rewind/forward) | Tap rewind/forward bars in Bike Mode — time jumps correctly |
| Skip to next/previous podcast | Press skip buttons — next/previous podcast loads |
| Playback rate cycling | Tap speed button — rate cycles through 1×→1.25×→…→2×→1× |
| Media Session (lock screen) | Lock the phone → verify lock screen shows track metadata and controls work |
| Offline playback | Download an episode → play offline → verify audio plays from IndexedDB blob |
| Config persistence | Change settings → kill app → reopen → verify all settings retained |

---

## 8. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Throttling `currentTime` to 1 Hz makes the seek bar feel laggy | Low — BikePlayView has no seek bar, only a time label | If a seek bar is added later, it can read directly from `audioRef.current.currentTime` via `requestAnimationFrame` instead of state |
| `useMemo` on context values adds cognitive overhead for future developers | Low | Add a code comment explaining **why** the memo exists |
| iOS Safari doesn't support the Wake Lock API | Known platform gap — already the case today | The `if ('wakeLock' in navigator)` guard handles this gracefully; the toggle will simply have no effect on unsupported browsers |
| Changing `isLocked` from `useState`-driven to a ref + minimal state could break consumers | None currently — `isLocked` is returned by `useWakeLock` but never read by any component | Safe to proceed; the hook still returns `isLocked` for future use |
