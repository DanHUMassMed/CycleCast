import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { getLibraryMetadata } from '../utils/storage';
import { PLAYBACK_RATES, DEFAULT_SKIP } from '../config/playerConfig';
import type { SkipMode } from '../config/playerConfig';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import type { TrackMetadata } from '../hooks/useAudioPlayer';
import { useMediaSession } from '../hooks/useMediaSession';

interface PlaybackContextType {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  activePlaybackRate: number;
  currentTrackMetadata: TrackMetadata | null;
  loadEpisode: (info: TrackMetadata) => void;
  cyclePlaybackRate: () => void;
  resetPlaybackRate: () => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  skipToNext: () => void;
  skipToPrevious: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

interface SettingsContextType {
  defaultPlaybackRate: number;
  skipIntervals: { rewind: number; forward: number };
  skipMode: SkipMode;
  backendUrl: string;
  screenLockEnabled: boolean;
  updateDefaultPlaybackRate: (rate: number) => void;
  updateSkipIntervals: (rewind: number, forward: number) => void;
  updateSkipMode: (mode: SkipMode) => void;
  updateBackendUrl: (url: string) => void;
  updateScreenLockEnabled: (enabled: boolean) => void;
}

export const PlaybackContext = createContext<PlaybackContextType | null>(null);
export const SettingsContext = createContext<SettingsContextType | null>(null);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within AudioProvider');
  return context;
};

export const AudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {

  // Settings state persisted via localStorage
  const [defaultPlaybackRate, setDefaultPlaybackRate] = useState<number>(() => {
    const saved = localStorage.getItem('cyclecast_default_speed');
    return saved ? parseFloat(saved) : 1.0;
  });

  // Active rate for current session (can be overriden in BikePlay)
  const [activePlaybackRate, setActivePlaybackRate] = useState<number>(defaultPlaybackRate);

  const [skipIntervals, setSkipIntervals] = useState(() => {
    const saved = localStorage.getItem('cyclecast_skips');
    return saved ? JSON.parse(saved) : DEFAULT_SKIP;
  });

  const [skipMode, setSkipMode] = useState<SkipMode>(() => {
    const saved = localStorage.getItem('cyclecast_skip_mode');
    return (saved as SkipMode) || 'podcast';
  });

  const [backendUrl, setBackendUrl] = useState<string>(() => {
    return localStorage.getItem('cyclecast_backend_url') || import.meta.env.VITE_BACKEND_URL || 'https://api.cyclecast.higginscompany.com/api';
  });

  const [screenLockEnabled, setScreenLockEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('cyclecast_screen_lock');
    return saved !== null ? saved === 'true' : true;
  });

  const {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    currentTrackMetadata,
    loadEpisode,
    play,
    pause,
    seek,
  } = useAudioPlayer(activePlaybackRate);

  const cyclePlaybackRate = useCallback(() => {
    setActivePlaybackRate(prev => {
      const currentIndex = PLAYBACK_RATES.indexOf(prev);
      return PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length];
    });
  }, []);

  const resetPlaybackRate = useCallback(() => {
    setActivePlaybackRate(defaultPlaybackRate);
  }, [defaultPlaybackRate]);

  const updateDefaultPlaybackRate = useCallback((rate: number) => {
    setDefaultPlaybackRate(rate);
    localStorage.setItem('cyclecast_default_speed', rate.toString());
    
    // Also update active rate if it matches the old default (meaning user hasn't overriden it in BikePlay yet)
    setActivePlaybackRate(prevActive => {
      if (prevActive === defaultPlaybackRate) {
        return rate;
      }
      return prevActive;
    });
  }, [defaultPlaybackRate]);

  const updateSkipIntervals = useCallback((rewind: number, forward: number) => {
    const newSkips = { rewind, forward };
    setSkipIntervals(newSkips);
    localStorage.setItem('cyclecast_skips', JSON.stringify(newSkips));
  }, []);

  const updateSkipMode = useCallback((mode: SkipMode) => {
    setSkipMode(mode);
    localStorage.setItem('cyclecast_skip_mode', mode);
  }, []);

  const updateBackendUrl = useCallback((url: string) => {
    setBackendUrl(url);
    localStorage.setItem('cyclecast_backend_url', url);
  }, []);

  const updateScreenLockEnabled = useCallback((enabled: boolean) => {
    setScreenLockEnabled(enabled);
    localStorage.setItem('cyclecast_screen_lock', String(enabled));
  }, []);

  const skipToPrevious = useCallback(async () => {
    if (skipMode === 'podcast') {
      const library = await getLibraryMetadata();
      if (library.length === 0) return;

      const currentIndex = library.findIndex(ep => ep.id === currentTrackMetadata?.id);
      
      let prevIndex = 0;
      if (currentIndex > 0) {
        prevIndex = currentIndex - 1;
      } else if (currentIndex === 0 || currentIndex === -1) {
        prevIndex = library.length - 1; // Wrap around safely
      }

      const prevEp = library[prevIndex];
      loadEpisode({
        id: prevEp.id,
        url: prevEp.enclosureUrl,
        title: prevEp.episodeTitle,
        showTitle: prevEp.showTitle,
        artworkUrl: prevEp.artworkUrl
      });
    } else {
      // Stub for chapter skip - skip backwards 5 minutes for now
      const now = audioRef.current?.currentTime ?? 0;
      seek(now - 300);
    }
  }, [skipMode, currentTrackMetadata, loadEpisode, seek, audioRef]);

  const skipToNext = useCallback(async () => {
    if (skipMode === 'podcast') {
      const library = await getLibraryMetadata();
      if (library.length === 0) return;

      const currentIndex = library.findIndex(ep => ep.id === currentTrackMetadata?.id);
      
      let nextIndex = 0;
      if (currentIndex >= 0 && currentIndex < library.length - 1) {
        nextIndex = currentIndex + 1;
      } else if (currentIndex === library.length - 1 || currentIndex === -1) {
        nextIndex = 0; // Wrap around to start
      }

      const nextEp = library[nextIndex];
      loadEpisode({
        id: nextEp.id,
        url: nextEp.enclosureUrl,
        title: nextEp.episodeTitle,
        showTitle: nextEp.showTitle,
        artworkUrl: nextEp.artworkUrl
      });
    } else {
      const now = audioRef.current?.currentTime ?? 0;
      seek(now + skipIntervals.forward);
    }
  }, [skipMode, currentTrackMetadata, loadEpisode, skipIntervals.forward, seek, audioRef]);

  useMediaSession({
    duration,
    currentTime,
    playbackRate: activePlaybackRate,
    metadata: currentTrackMetadata,
    onPlay: play,
    onPause: pause,
    onSeek: seek,
    onNext: skipToNext,
    onPrev: skipToPrevious
  });

  const settingsValue = useMemo<SettingsContextType>(() => ({
    defaultPlaybackRate, skipIntervals, skipMode, backendUrl, screenLockEnabled,
    updateDefaultPlaybackRate, updateSkipIntervals, updateSkipMode, updateBackendUrl, updateScreenLockEnabled
  }), [defaultPlaybackRate, skipIntervals, skipMode, backendUrl, screenLockEnabled, 
       updateDefaultPlaybackRate, updateSkipIntervals, updateSkipMode, updateBackendUrl, updateScreenLockEnabled]);

  const playbackValue = useMemo<PlaybackContextType>(() => ({
    isPlaying, currentTime, duration, activePlaybackRate, currentTrackMetadata,
    loadEpisode, cyclePlaybackRate, resetPlaybackRate, play, pause, seek,
    skipToNext, skipToPrevious, audioRef 
  }), [isPlaying, currentTime, duration, activePlaybackRate, currentTrackMetadata,
       loadEpisode, cyclePlaybackRate, resetPlaybackRate, play, pause, seek,
       skipToNext, skipToPrevious, audioRef]);

  return (
    <SettingsContext.Provider value={settingsValue}>
      <PlaybackContext.Provider value={playbackValue}>
        {children}
      </PlaybackContext.Provider>
    </SettingsContext.Provider>
  );
};
