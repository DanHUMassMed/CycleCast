# 🚴 CycleCast

A mobile-first **Progressive Web App (PWA)** podcast player built for cyclists. Stream or download episodes before a ride, then play them back hands-free with large on-screen controls, variable speed, and full lockscreen media integration — all without needing to touch your phone.

---

## ✨ Features

- 🔍 **Podcast Search** — Search millions of podcasts via the PodcastIndex API
- 📥 **Offline Library** — Download episodes to IndexedDB for fully offline playback
- 🎚️ **Variable Speed** — Cycle through 1×, 1.25×, 1.5×, 1.75×, and 2× playback
- ⏩ **Configurable Skip** — Adjustable rewind/forward intervals (default 15s / 30s)
- 🗂️ **Drag-to-Reorder Queue** — Reorder the offline library with drag-and-drop
- 🚴 **Bike Mode** — Fullscreen player with huge touch targets designed for gloved hands
- 📱 **Media Session API** — Lockscreen controls, Now Playing artwork, headphone button support
- 🔒 **Wake Lock** — Keeps the screen on during Bike Mode so the display never dims
- ♻️ **Auto-update** — Detects new versions via `version.json` and hot-swaps the Service Worker
- ⚙️ **Configurable Backend URL** — Point to any self-hosted backend from the Config tab

---

## Architecture

CycleCast is a two-tier application: a **Python/FastAPI backend** that acts as a secure API proxy, and a **React/TypeScript PWA frontend** that handles all user interaction and offline storage.

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser / PWA                             │
│                                                                  │
│   ┌────────────┐   ┌──────────────┐   ┌──────────────────────┐   │
│   │  HomeView  │   │ BikePlayView │   │    ConfigView        │   │
│   │ (Search +  │   │ (Fullscreen  │   │ (Speed, Skips,       │   │
│   │  Library)  │   │  Bike Mode)  │   │  Backend URL)        │   │
│   └────────────┘   └──────────────┘   └──────────────────────┘   │
│              │             │                    │                │
│        ┌─────┴─────────────┴────────────────────┘                │
│        ↓                                                         │
│   ┌──────────────────────────────────────────────────────┐       │
│   │                  AudioProvider (Context)             │       │
│   │  ┌─────────────────────┐  ┌─────────────────────┐    │       │
│   │  │  PlaybackContext    │  │  SettingsContext    │    │       │
│   │  │  isPlaying, seek,   │  │  speed, skip mode,  │    │       │
│   │  │  load, play, pause  │  │  backend URL, etc.  │    │       │
│   │  └─────────────────────┘  └─────────────────────┘    │       │
│   │         ↓                                            │       │
│   │  ┌───────────-──┐  ┌─────-─────────┐  ┌───────────┐  │       │
│   │  │useAudioPlayer│  │useMediaSession│  │useWakeLock│  │       │
│   │  └────────────-─┘  └────-──────────┘  └───────────┘  │       │
│   └──────────────────────────────────────────────────────┘       │
│                                                                  │
│   ┌──────────────────────────────────────────────────────┐       │
│   │            IndexedDB (idb-keyval)                    │       │
│   │    Audio Blobs  │  Episode Metadata  │  Sort Order   │       │
│   └──────────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────┘
                          │  HTTP
                          ↓
┌────────────────────────────────────┐
│        FastAPI Backend (Python)    │
│                                    │
│  GET /api/search   ─────────────┐  │
│  GET /api/episodes ─────────────┼──┼──► PodcastIndex API
│  GET /api/stream   ─────────────┘  │    (HMAC-SHA1 auth)
└────────────────────────────────────┘
```

### Backend (`/backend`)

A lightweight **FastAPI** proxy server. Its sole job is to keep the PodcastIndex API credentials secret and work around browser CORS restrictions.

| File | Purpose |
|---|---|
| `main.py` | All three API endpoints + streaming proxy logic |
| `pyproject.toml` | Python project definition (`uv`-compatible) |
| `run.sh` | Starts `uvicorn` with the right host/port |
| `.env` | `APIKey`, `APISecret`, `ALLOWED_ORIGINS` (not committed) |

**Endpoints:**

- `GET /api/search?q=<term>` — Proxies `/search/byterm` to PodcastIndex
- `GET /api/episodes?id=<feedId>` — Proxies `/episodes/byfeedid`, returns the 10 latest
- `GET /api/stream?url=<audioUrl>` — Streaming proxy that pipes audio chunks with Range header support so iOS Safari can seek properly

Authentication uses a **HMAC-SHA1** signature regenerated on every request (`API_KEY + API_SECRET + unix_timestamp`), as required by PodcastIndex.

---

### Frontend (`/cyclecast`)

A **Vite + React 19 + TypeScript** PWA.

#### Views

| Component | Route (tab) | Description |
|---|---|---|
| `HomeView` | Tab 0 — Home | Search podcasts, browse results, view offline library, download/remove episodes, drag-to-reorder queue |
| `BikePlayView` | Tab 1 — Bike Mode | Fullscreen player with large controls, speed cycling, skips; hides bottom nav |
| `ConfigView` | Tab 2 — Config | Adjust default speed, rewind/forward intervals, skip mode, backend URL, check for updates |

Auto-navigation: when playback starts while on the Home tab, the app automatically switches to Bike Mode.

#### State Management — `AudioProvider`

All playback and settings state lives in a single **React Context provider** (`AudioProvider` in `context/AudioContext.tsx`). It exposes two separate contexts to prevent unnecessary re-renders:

- **`PlaybackContext`** — consumed via `usePlayback()` hook. Contains: `isPlaying`, `currentTime`, `duration`, `activePlaybackRate`, `currentTrackMetadata`, and all control functions (`play`, `pause`, `seek`, `loadEpisode`, `skipToNext`, `skipToPrevious`, `cyclePlaybackRate`, `resetPlaybackRate`).

- **`SettingsContext`** — consumed via `useSettings()` hook. Contains: `defaultPlaybackRate`, `skipIntervals`, `skipMode`, `backendUrl`, and their respective updaters. All settings are persisted to `localStorage`.

#### Hooks

| Hook | Purpose |
|---|---|
| `useAudioPlayer` | Creates and manages an `HTMLAudioElement` imperatively; handles blob vs. stream URL switching for offline episodes |
| `useMediaSession` | Wires the browser Media Session API (lockscreen controls, `seekto`, `nexttrack`, `previoustrack`) |
| `useEpisodeDownload` | Manages per-episode download state, progress, and `IndexedDB` CRUD via `idb-keyval` |
| `useWakeLock` | Acquires/releases the Screen Wake Lock API when Bike Mode is active |
| `useVersionCheck` | Fetches `/version.json` to detect new deploys, triggers Service Worker swap and page reload |
| `usePlayback` | Thin re-export of `PlaybackContext` with a null-safety guard |

#### Offline Storage

`src/utils/storage.ts` wraps **`idb-keyval`** for all IndexedDB access:

- Audio blobs are stored under the key `podcast-<episodeId>`
- Episode metadata (title, artwork, URL, sort order) is stored as a JSON array
- `getLibraryMetadata()` returns the ordered array used for queue navigation

#### Configuration

`src/config/playerConfig.ts` contains constants shared across the app:

```ts
export const PLAYBACK_RATES = [1.0, 1.25, 1.5, 1.75, 2.0];
export const DEFAULT_SKIP = { rewind: 15, forward: 30 };
export type SkipMode = 'chapter' | 'podcast';
```

#### PWA / Service Worker

Configured via **`vite-plugin-pwa`** in `vite.config.ts`. The app is fully installable and works offline for downloaded episodes. The Service Worker caches app assets; `version.json` is fetched with `cache: 'no-store'` to always detect the latest deploy.

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.13
- [`uv`](https://github.com/astral-sh/uv) (recommended Python package manager)
- A [PodcastIndex](https://podcastindex.org) API key + secret (free)

---

### Backend Setup

```bash
cd backend

# Copy and fill in credentials
cp .env.example .env   # or create .env manually

# Install deps with uv
uv sync

# Run the dev server (defaults to port 8002)
./run.sh
# or: python main.py
```

**`.env` file:**

```env
APIKey=your_podcastindex_api_key
APISecret=your_podcastindex_api_secret
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
HOST=0.0.0.0
PORT=8002
```

---

### Frontend Setup

```bash
cd cyclecast

# Install dependencies
npm install

# Create environment file
echo "VITE_BACKEND_URL=http://localhost:8002/api" > .env

# Start the dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

> **Tip:** To test on a phone over your local network, set `VITE_BACKEND_URL` to your machine's LAN IP (e.g. `http://192.168.1.x:8002/api`) and run `vite --host`.

---

### Production Build

```bash
# Build the frontend
cd cyclecast
npm run build
# Output lands in cyclecast/dist/

# Deploy both to your server
./deploy.sh
```

`deploy.sh` uses `scp` to copy `cyclecast/dist/` to the web server document root and push the backend files to the server.

---

## Updating the App Version

After deploying a new build, bump the version in `cyclecast/public/version.json`:

```json
{ "version": "1.0.2" }
```

Users who open the app will receive an update prompt (or an automatic reload) on their next visit thanks to the `useVersionCheck` hook.

---

## Project Structure

```
CycleCast/
├── backend/                  # FastAPI API proxy
│   ├── main.py               # All endpoints
│   ├── pyproject.toml        # Python project manifest
│   └── run.sh                # Start script
│
├── cyclecast/                # React PWA frontend
│   ├── public/
│   │   └── version.json      # Client-side version tracking
│   ├── src/
│   │   ├── main.tsx          # App entry point
│   │   ├── App.tsx           # Wraps AudioProvider around AppContent
│   │   ├── AppContent.tsx    # Tab routing + bottom navigation
│   │   ├── components/
│   │   │   ├── HomeView.tsx        # Search + offline library
│   │   │   ├── BikePlayView.tsx    # Fullscreen bike player
│   │   │   ├── ConfigView.tsx      # Settings page
│   │   │   ├── SearchPodcasts.tsx  # Search UI + results
│   │   │   └── DownloadManager.tsx # Download button + progress
│   │   ├── context/
│   │   │   └── AudioContext.tsx    # PlaybackContext + SettingsContext provider
│   │   ├── hooks/
│   │   │   ├── useAudioPlayer.ts   # HTMLAudioElement management
│   │   │   ├── useMediaSession.ts  # Lockscreen / headphone controls
│   │   │   ├── useEpisodeDownload.ts # IndexedDB download flow
│   │   │   ├── useWakeLock.ts      # Screen Wake Lock API
│   │   │   ├── useVersionCheck.ts  # Version bump detection
│   │   │   └── usePlayback.ts      # PlaybackContext re-export hook
│   │   ├── config/
│   │   │   └── playerConfig.ts     # Shared constants (speeds, skips)
│   │   └── utils/
│   │       └── storage.ts          # idb-keyval wrappers for IndexedDB
│   ├── vite.config.ts        # Vite + PWA plugin config
│   └── package.json
│
├── deploy.sh                 # scp deploy script
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19 + TypeScript |
| Build tool | Vite |
| UI components | MUI (Material UI v7) |
| Drag & drop | dnd-kit |
| Offline storage | idb-keyval (IndexedDB) |
| PWA | vite-plugin-pwa (Workbox) |
| Backend framework | FastAPI |
| Backend runtime | Uvicorn |
| HTTP client | httpx (async) |
| Podcast data | PodcastIndex API |

---

## License

MIT — see [LICENSE](LICENSE).
