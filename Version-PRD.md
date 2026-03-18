# CycleCast — Manual Version Check PRD
**Date:** 2026-03-18

---

## Problem

CycleCast is a PWA installed on users' home screens. Unlike App Store apps there is no automatic "update available" badge. Users have no way to know a new version has been deployed, and stale service worker caches may keep them on old code indefinitely.

## Goal

Add a **"Check for Updates"** button to the **Configuration** page so users can manually detect and apply new releases with a single tap.

---

## User Story

> As a CycleCast user, I want to tap a button on the Config page that tells me whether I'm on the latest version, and if not, immediately updates the app.

---

## Functional Requirements

### 1. Version Metadata File
| Detail | Value |
|---|---|
| File | `public/version.json` |
| Format | `{ "version": "1.0.0" }` |
| Cache | Must be fetched with `cache: "no-store"` to bypass SW cache |
| Maintenance | Manually increment on every release |

### 2. "Check for Updates" Button (ConfigView)
- Placed at the **bottom** of the existing Config page, inside its own bordered section (consistent with existing card style).
- Shows the **current version** label at all times (e.g. `v1.0.0`).
- Button label: **Check for Updates**.
- On tap:
  1. Fetch `version.json` with `{ cache: "no-store" }`.
  2. Compare fetched version against `localStorage.getItem('cyclecast_app_version')`.
  3. **If different** → store the new version, trigger SW update + `window.location.reload()`.
  4. **If same** → display a Snackbar: *"You're on the latest version."*
  5. **On error** → display a Snackbar: *"Unable to check for updates."*

### 3. Service Worker Integration
- On detecting a new version, call `navigator.serviceWorker.getRegistration()` then `reg.update()`.
- If `reg.waiting` exists, post a `{ type: "SKIP_WAITING" }` message before reloading.
- Update `sw.js` to handle `SKIP_WAITING` by calling `self.skipWaiting()`.

### 4. First-Run Seeding
- On app boot (in `AudioProvider` or `main.tsx`), if `cyclecast_app_version` is not in `localStorage`, fetch `version.json` and store the value silently. This prevents a false "update available" on first install.

---

## Proposed Files

| Action | File | Purpose |
|---|---|---|
| **NEW** | `public/version.json` | Static version metadata |
| **NEW** | `src/hooks/useVersionCheck.ts` | Hook: fetch, compare, trigger SW update |
| **MODIFY** | `src/components/ConfigView.tsx` | Add version label + button + Snackbar |
| **MODIFY** | `public/sw.js` (if exists) | Add `SKIP_WAITING` message handler |

---

## UI Sketch

```
┌─────────────────────────────────┐
│  Configuration                  │
│  ┌───────────────────────────┐  │
│  │  Rewind / Forward sliders │  │
│  │  Speed slider             │  │
│  │  Skip Mode toggle         │  │
│  │  Backend URL              │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │  App Version  v1.0.0      │  │
│  │  [ Check for Updates  ]   │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

---

## Out of Scope

- Automatic background update polling.
- In-app changelogs / release notes.
- Server-push notifications for new versions.

---

## Acceptance Criteria

1. `version.json` exists in `public/` and is served without caching.
2. Config page displays the current version string.
3. Tapping "Check for Updates" when on the latest version shows a confirmation Snackbar.
4. Tapping "Check for Updates" when a new version is deployed triggers a reload to the new version.
5. Network errors are caught and surfaced gracefully in a Snackbar.
