# CycleCast — Code Review
**Date:** 2026-03-18  
**Scope:** Full repository (`backend/main.py`, `cyclecast/src/`)  
**Focus:** SOLID Principles + General Code Quality

---

## Executive Summary

CycleCast is a clean, purposeful PWA. The domain is well-understood, the UI patterns are sensible, and the code is easy to read. The main architectural concern is that `AudioContext.tsx` has grown into a **God Object** — it owns state, storage I/O, business logic, and platform integrations simultaneously. Backend violations are minor and easy to fix. Overall health: **B+**, strong for an early-stage project.

---

## SOLID Analysis

### S — Single Responsibility Principle

#### 🔴 `AudioContext.tsx` (Critical)

**Problem:** The provider does too many jobs at once:
1. Manages the raw `<audio>` DOM element
2. Persists and reads settings from `localStorage`
3. Queries IndexedDB to resolve local-vs-remote sources
4. Implements playlist navigation (next/previous episode)
5. Manages Media Session metadata and action handlers

Any change to how settings are persisted requires editing the same file that controls audio playback. Any change to playlist ordering logic touches the same module that manages the `<audio>` element lifetime.

**Recommended refactor:**

```
src/
  services/
    AudioPlayer.ts        ← owns HTMLAudioElement, play/pause/seek/rate
    MediaSessionManager.ts ← coordinates navigator.mediaSession
  hooks/
    useSettings.ts        ← reads/writes localStorage, exposes typed settings
    usePlaylist.ts        ← skipToNext/skipToPrevious, queries storage
  context/
    AudioContext.tsx      ← thin glue: composes the above, exposes unified API
```

This way `AudioContext` becomes an orchestrator, not an implementer.

---

#### 🟡 `SearchPodcasts.tsx` — Two responsibilities in one component

`SearchPodcasts` renders the search UI **and** owns the download state machine (download, remove, track progress). The `EpisodeRow` sub-component is already a hint that download logic wants to be separate.

**Recommendation:** Extract an `useEpisodeDownload(episodeId, enclosureUrl)` hook that owns `isDownloaded / isDownloading` state and the fetch + blob save logic. `EpisodeRow` then becomes purely presentational.

---

#### 🟡 `DownloadManager.tsx` — Redundant storage logic

`DownloadManager.tsx` duplicates the download + remove logic that also lives in `SearchPodcasts.tsx` / `EpisodeRow`. `formatBytes` is a pure utility defined inline.

**Recommendation:**
- Move `formatBytes` to `src/utils/format.ts`.
- Centralise download/remove into the `useEpisodeDownload` hook mentioned above, and have both `DownloadManager` and `EpisodeRow` consume it.

---

#### 🟡 `HomeView.tsx` — Polling inside a view component

`HomeView` runs a 2-second `setInterval` to refresh the library and also owns the drag-and-drop persistence logic. Polling and storage interaction are business-layer concerns.

**Recommendation:** Extract a `useLibrary()` hook that owns the interval and exposes `{ library, reorder, remove }`. `HomeView` becomes a pure renderer.

---

#### 🟢 `backend/main.py` — Acceptable for current size

The backend is still small enough that a single module is fine. One note: `get_podcast_index_headers()` mutates nothing and has no side effects — it is a pure function and should stay that way (it does). Good.

---

### O — Open/Closed Principle

#### 🟡 `PLAYBACK_RATES` is closed to extension

```typescript
// AudioContext.tsx
const PLAYBACK_RATES = [1.0, 1.25, 1.5, 2.0];
```

The available rates are a module-level constant. Adding a new rate or making rates user-configurable requires editing `AudioContext.tsx` directly.

**Recommendation:** Expose `PLAYBACK_RATES` from a dedicated `src/config/playerConfig.ts` file, or accept it as a prop/setting. This lets the config layer evolve without touching playback logic.

---

#### 🟡 Skip mode is a string union, not extensible

```typescript
skipMode: 'chapter' | 'podcast'
```

Adding a third mode (e.g. `'playlist'`) requires changes in `AudioContext`, `ConfigView`, `BikePlayView`, and the `updateSkipMode` storage key. A registry or strategy pattern would isolate the change.

**Recommendation (pragmatic):** At minimum, define the union in a shared constants file so the "set of modes" is changed in one place:

```typescript
// src/config/playerConfig.ts
export const SKIP_MODES = ['chapter', 'podcast'] as const;
export type SkipMode = typeof SKIP_MODES[number];
```

---

### L — Liskov Substitution Principle

LSP is less directly applicable in a React/hook-based codebase, but there is one relevant case:

#### 🟡 `useWakeLock` does not auto-request on mount

The hook exposes `requestWakeLock` but callers must remember to invoke it. `BikePlayView` calls `useWakeLock()` but never calls `requestWakeLock()` from the returned interface — the lock is never actually acquired.

**Specific bug:** `useWakeLock()` is called on line 27 of `BikePlayView.tsx` but neither `requestWakeLock` nor `releaseWakeLock` is called. The hook manages re-acquisition on visibility change, but only if `wakeLock !== null` — meaning the initial lock is never set.

**Recommendation:** If the hook's contract is "acquire a WakeLock while this component is mounted", it should request on mount and release on unmount internally:

```typescript
useEffect(() => {
  requestWakeLock();
  return () => { releaseWakeLock(); };
}, []);
```

This makes the hook fulfil its own contract without depending on callers to initialise it correctly.

---

### I — Interface Segregation Principle

#### 🔴 `AudioContextType` — fat interface

Every consumer of `useAudio()` receives the full interface with 17 members regardless of what it actually needs:

| Consumer | Uses |
|---|---|
| `BikePlayView` | `isPlaying, currentTime, duration, skipIntervals, activePlaybackRate, skipMode, play, pause, seek, cyclePlaybackRate, currentTrackMetadata, skipToNext, skipToPrevious` |
| `ConfigView` | `skipIntervals, updateSkipIntervals, defaultPlaybackRate, updateDefaultPlaybackRate, skipMode, updateSkipMode, backendUrl, updateBackendUrl` |
| `HomeView` | `loadEpisode` |
| `SearchPodcasts` | `loadEpisode, backendUrl` |
| `AppContent` | `resetPlaybackRate, isPlaying` |

`ConfigView` never touches playback controls; `HomeView` never reads settings. They are all coupled to every change in `AudioContextType`.

**Recommendation:** Split into focused contexts:

```typescript
// Playback controls — consumed by BikePlayView, AppContent
const PlaybackContext = createContext<PlaybackContextType>(...);

// User settings — consumed by ConfigView  
const SettingsContext = createContext<SettingsContextType>(...);

// Shared state needed by both
const PlayerStateContext = createContext<PlayerStateType>(...);
```

This also makes testing significantly easier — you can mock only the slice a component needs.

---

### D — Dependency Inversion Principle

#### 🔴 `SearchPodcasts.tsx` and `DownloadManager.tsx` — direct `fetch()` calls

Both components call `fetch()` directly against the backend URL, constructing URLs inline. The components are tightly coupled to the transport layer.

```typescript
// SearchPodcasts.tsx line 125
const response = await fetch(`${backendUrl}/search?q=${encodeURIComponent(query)}`);

// SearchPodcasts.tsx line 43
const req = await fetch(proxyUrl);
```

**Recommendation:** Introduce a `PodcastApiClient` abstraction:

```typescript
// src/services/podcastApiClient.ts
export interface IPodcastApiClient {
  searchPodcasts(query: string): Promise<PodcastSearchResult[]>;
  getEpisodes(feedId: number): Promise<Episode[]>;
  getStreamUrl(enclosureUrl: string): string;
}

export const createPodcastApiClient = (baseUrl: string): IPodcastApiClient => ({
  searchPodcasts: async (q) => { ... },
  getEpisodes: async (id) => { ... },
  getStreamUrl: (url) => `${baseUrl}/stream?url=${encodeURIComponent(url)}`,
});
```

Components depend on the interface, not on `fetch` + URL string construction. This also becomes trivially mockable for tests.

---

#### 🟡 `AudioContext.tsx` — direct `localStorage` access

Settings are read and written directly from `localStorage` within component callbacks, creating tight coupling to the browser storage API.

```typescript
// AudioContext.tsx line 51
const saved = localStorage.getItem('cyclecast_default_speed');

// AudioContext.tsx line 211
localStorage.setItem('cyclecast_default_speed', rate.toString());
```

**Recommendation:** Create a `SettingsStore` abstraction:

```typescript
// src/services/settingsStore.ts
export interface ISettingsStore {
  get<K extends keyof AppSettings>(key: K): AppSettings[K];
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;
}
```

This makes the settings layer swappable (e.g., move to `IndexedDB` or a remote config later) without touching the context.

---

#### 🟡 `backend/main.py` — unconfigurable CORS origin

```python
# main.py line 17
allow_origins=["*"],  # In production, restrict this
```

The comment acknowledges this debt but the fix is straightforward:

```python
# Read from environment
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, ...)
```

Add `ALLOWED_ORIGINS=https://cyclecast.higginscompany.com` to `.env`. This is also a **security issue**, not just a design issue.

---

## Additional Issues (Not Strictly SOLID)

### 🔴 WakeLock is never acquired (Bug)
As noted under LSP: `BikePlayView` calls `useWakeLock()` but discards the returned `{ requestWakeLock }`. The screen will dim during rides. The hook needs to auto-acquire on mount or `BikePlayView` needs to call `requestWakeLock()`.

---

### 🟡 `HomeView` polling is crude

A 2-second polling loop is used to keep the library in sync with downloads happening in `SearchPodcasts`:

```typescript
// HomeView.tsx line 107
const interval = setInterval(fetchLibrary, 2000);
```

**Better approach:** Use a custom event or a shared React state / React Query for the library list. Both tabs would share a single in-memory state, eliminating the poll entirely and preventing the re-render on every tick.

---

### 🟡 Download size is hardcoded in UI

```tsx
// DownloadManager.tsx line 126
Download for Offline (89MB)
```

This is a magic number baked into JSX. It should come from the episode metadata or be omitted.

---

### 🟡 `loadEpisode` dependency array is stale

```typescript
// AudioContext.tsx line 177
}, []); // empty deps — skipIntervals not captured
```

The `seek` call on lines 105–106 inside `initAudio` captures `skipIntervals` at init time from the closure. If the user changes skip intervals, the Media Session handlers will use the stale values. Either use a `ref` for `skipIntervals` or move the handler registration into its own `useEffect` that re-runs when `skipIntervals` changes.

---

### 🟡 `alert()` used for errors

Multiple places use `alert()` for error feedback:
- `SearchPodcasts.tsx` line 62
- `SearchPodcasts.tsx` line 132
- `DownloadManager.tsx` line 66

`alert()` blocks the main thread and looks out of place in a polished PWA. Replace with a toast/snackbar component (MUI's `Snackbar` + `Alert` is already in the dependency tree).

---

### 🟡 `mediaSession` metadata set twice on load

In `AudioContext.tsx`, `navigator.mediaSession.metadata` is set once during `initAudio()` (hardcoded to "Phase 1 POC") and again inside `loadEpisode()`. The first one is always overwritten and should be removed.

---

### 🟢 What's working well

- **`storage.ts`** is a clean, focused data access layer. It does one thing and does it well.
- **`useWakeLock.ts`** is a well-structured hook — it just needs auto-acquire on mount.
- **`AppContent.tsx`** is correctly thin. Navigation concerns live here and nowhere else.
- **`BikePlayView`** correctly separates visual feedback (`flashZone`) from audio logic.
- The streaming proxy in `main.py` is thoughtfully handled: the `client` lifecycle is correctly scoped outside the `StreamingResponse` generator so the connection stays open, and the Range header is forwarded for iOS seek support.

---

## Prioritised Action Plan

| Priority | Issue | Effort |
|---|---|---|
| 🔴 Bug | `useWakeLock` never acquires lock in `BikePlayView` | S (< 1h) |
| 🔴 ISP | Split `AudioContextType` into focused sub-contexts | L (2–3 days) |
| 🔴 DIP | Extract `PodcastApiClient` service | M (half day) |
| 🟡 SRP | Extract `useLibrary`, `useSettings`, `usePlaylist` hooks | M (1 day) |
| 🟡 DIP | Abstract `localStorage` into a `SettingsStore` | S (2h) |
| 🟡 Security | Restrict CORS origins via env var in `main.py` | S (30 min) |
| 🟡 Polish | Replace `alert()` with MUI `Snackbar` | S (2h) |
| 🟡 Correctness | Fix stale `skipIntervals` in Media Session handlers | S (1h) |
| 🟡 OCP | Move `PLAYBACK_RATES` and `SkipMode` to `playerConfig.ts` | S (30 min) |
| 🟢 Polish | Remove duplicate hardcoded `MediaMetadata` on init | XS (15 min) |
