# CycleCast — Phased Refactoring Plan
**Based on:** `code-review-26-03-18.md`

This document outlines a phased approach to implementing the SOLID principles recommendations and general code quality improvements. **At the end of each phase, work stops to allow for independent review and manual testing.**

---

## Phase 1: Critical Fixes & Quick Wins

**Goals:** Address explicit bugs, security flags, and small organizational debt.

**Tasks:**
1. **Fix WakeLock Bug:** Update `useWakeLock.ts` to auto-acquire the lock on mount, or explicitly call `requestWakeLock()` in `BikePlayView.tsx`.
2. **Security:** Update `backend/main.py` to read `allow_origins` from an environment variable (`ALLOWED_ORIGINS`).
3. **OCP:** Extract `PLAYBACK_RATES` and `SkipMode` from `AudioContext.tsx` into a new `src/config/playerConfig.ts` file.
4. **Correctness (Media Session):** Fix the stale closure bug in `AudioContext.tsx` by wrapping the Media Session next/prev track handlers in a `useEffect` that updates when `skipIntervals` changes.
5. **Polish:** Remove the redundant `MediaMetadata` set call on initial load inside `AudioContext.tsx`.

🛑 **STOP & REVIEW 1:** Test WakeLock acquisition when entering Bike Mode, test that Media Session keys correctly skip with updated intervals, ensure backend starts with correct origins.

---

## Phase 2: UI Polish & Duplicate Logic Cleanup

**Goals:** Improve UI feedback and unify simple duplicated logic before moving to heavier structural changes.

**Tasks:**
1. **Error Handling:** Replace `alert()` calls in `SearchPodcasts.tsx` and `DownloadManager.tsx` with MUI `Snackbar` components.
2. **Download UI:** Remove the hardcoded "(89MB)" string from `DownloadManager.tsx`.
3. **Download Logic (DRY):** Extract the download/remove logic shared by `EpisodeRow` (in `SearchPodcasts`) and `DownloadManager` into a single `useEpisodeDownload(id, enclosureUrl)` hook.

🛑 **STOP & REVIEW 2:** Test downloading an episode using the new hook, check offline playback, verify error alerts now show as Snackbars, and test removing downloads.

---

## Phase 3: Abstraction of External Dependencies (DIP)

**Goals:** Decouple React components from direct `fetch` calls and raw `localStorage` interactions.

**Tasks:**
1. **API Abstraction:** Create an `IPodcastApiClient` (e.g., in `src/services/podcastApiClient.ts`) and swap out direct `fetch()` calls in `SearchPodcasts.tsx`.
2. **Settings Abstraction:** Create a `SettingsStore` in `src/services/settingsStore.ts` to abstract all `localStorage` reads/writes currently hardcoded inside `AudioContext.tsx`.
3. **Library Logic (SRP):** Extract the polling and drag-and-drop state off `HomeView.tsx` into a `useLibrary` hook.

🛑 **STOP & REVIEW 3:** Test podcast search, episode fetching, settings persistence (playback speed/skips), and offline library drag-and-drop. No UI changes should be visible, but data flow should be intact.

---

## Phase 4: Interface Segregation (ISP)

**Goals:** Split the massive `AudioContext` interface so consumers only subscribe to what they need, minimizing unnecessary re-renders.

**Tasks:**
1. Create `PlaybackContext` (play, pause, seek, current track metadata).
2. Create `SettingsContext` (playback rates, skip intervals, skip modes, backend URLs).
3. Create `PlayerStateContext` (if shared state is needed between playback and settings that doesn't fit neatly into the other two).
4. Update consumers (`BikePlayView`, `ConfigView`, `HomeView`, `SearchPodcasts`, `AppContent`) to use the new focused contexts instead of `useAudio()`.

🛑 **STOP & REVIEW 4:** Verify that the BikePlay UI still controls audio correctly, config settings update the player properly, and playing an episode from Home/Search still works cleanly.

---

## Phase 5: The God Object Refactor (SRP)

**Goals:** Reduce the physical complexity of the `AudioProvider` file by extracting pure services.

**Tasks:**
1. **Extract `AudioPlayer.ts`:** Move the literal `HTMLAudioElement` creation and raw DOM event listeners into an independent class or service module.
2. **Extract `MediaSessionManager.ts`:** Move the `navigator.mediaSession` handlers out to an independent service module.
3. **Recompose the Provider:** Re-wire the new `AudioProvider` component to merely compose these internal services (`AudioPlayer`, `SettingsStore`, `MediaSessionManager`) and provide their state to React.

🛑 **STOP & REVIEW 5:** Comprehensive regression test. Test audio playback, background playback (Media Session), seeking, speed changes, playlist skipping, and persistence.
