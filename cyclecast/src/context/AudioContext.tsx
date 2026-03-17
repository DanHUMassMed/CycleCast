import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { getAudioFile, getLibraryMetadata } from '../utils/storage';

const PLAYBACK_RATES = [1.0, 1.25, 1.5, 2.0];
const DEFAULT_SKIP = { rewind: 15, forward: 30 };

interface AudioContextType {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  activePlaybackRate: number;
  defaultPlaybackRate: number;
  skipIntervals: { rewind: number; forward: number };
  skipMode: 'chapter' | 'podcast';
  currentTrackMetadata: { id: number; url: string; title: string; showTitle: string; artworkUrl: string } | null;
  loadEpisode: (info: { id: number; url: string; title: string; showTitle: string; artworkUrl: string }) => void;
  cyclePlaybackRate: () => void;
  resetPlaybackRate: () => void;
  updateDefaultPlaybackRate: (rate: number) => void;
  updateSkipIntervals: (rewind: number, forward: number) => void;
  updateSkipMode: (mode: 'chapter' | 'podcast') => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  skipToNext: () => void;
  skipToPrevious: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const AudioContext = createContext<AudioContextType | null>(null);

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) throw new Error('useAudio must be used within AudioProvider');
  return context;
};

// 89MB proxy file for phase 1 validation as requested in plan
const AUDIO_URL = 'http://192.168.1.59:8000/Last-Week-in-AI-236.mp3';

export const AudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTrackMetadata, setCurrentTrackMetadata] = useState<{ id: number; url: string; title: string; showTitle: string; artworkUrl: string } | null>(null);
  const currentObjectURLRef = useRef<string | null>(null);

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

  const [skipMode, setSkipMode] = useState<'chapter' | 'podcast'>(() => {
    const saved = localStorage.getItem('cyclecast_skip_mode');
    return (saved as 'chapter' | 'podcast') || 'podcast';
  });

  useEffect(() => {
    let objectUrl: string | null = null;
    let audio: HTMLAudioElement | null = null;

    const initAudio = async () => {
      // 1. Check Offline Storage First
      const localBlob = await getAudioFile('poc-audio');
      
      let sourceUrl = AUDIO_URL;
      if (localBlob) {
        console.log("AudioContext: Using local IndexedDB Blob for playback!");
        objectUrl = URL.createObjectURL(localBlob);
        sourceUrl = objectUrl;
      } else {
        console.log("AudioContext: Using remote network stream.");
      }

      audio = new Audio(sourceUrl);
      audioRef.current = audio;

      audio.preload = 'metadata';

      const handleTimeUpdate = () => setCurrentTime(audio!.currentTime);
      const handleDurationChange = () => setDuration(audio!.duration);
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('durationchange', handleDurationChange);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);

      audio.playbackRate = activePlaybackRate;

      // Handle iOS Media Session
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Phase 1 POC',
          artist: 'CycleCast',
          artwork: [
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }
          ]
        });

        navigator.mediaSession.setActionHandler('play', () => audio!.play());
        navigator.mediaSession.setActionHandler('pause', () => audio!.pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => seek(Math.max(0, audio!.currentTime - skipIntervals.rewind)));
        navigator.mediaSession.setActionHandler('nexttrack', () => seek(audio!.currentTime + skipIntervals.forward));
      }
    };

    initAudio();

    return () => {
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, []); // Note: leaving deps empty intentionally to mimic singleton audio init on mount

  // Update Media Session position state periodically
  useEffect(() => {
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && !isNaN(duration) && duration > 0) {
      navigator.mediaSession.setPositionState({
        duration: duration,
        playbackRate: audioRef.current?.playbackRate || 1,
        position: currentTime
      });
    }
  }, [currentTime, duration]);

  const loadEpisode = useCallback(async (info: { id: number; url: string; title: string; showTitle: string; artworkUrl: string }) => {
    setCurrentTrackMetadata({
      id: info.id,
      url: info.url,
      title: info.title,
      showTitle: info.showTitle,
      artworkUrl: info.artworkUrl
    });

    if (audioRef.current) {
      audioRef.current.pause();

      if (currentObjectURLRef.current) {
        URL.revokeObjectURL(currentObjectURLRef.current);
        currentObjectURLRef.current = null;
      }

      // Check if we have downloaded this in IndexedDB
      const localBlob = await getAudioFile(`podcast-${info.id}`);
      let sourceUrl = info.url;

      if (localBlob) {
        console.log(`AudioContext: Found local blob for podcast-${info.id}. Skipping network stream.`);
        sourceUrl = URL.createObjectURL(localBlob);
        currentObjectURLRef.current = sourceUrl;
      }

      audioRef.current.src = sourceUrl;
      audioRef.current.load();
      try {
        await audioRef.current.play();
      } catch (err) {
        console.error("Autoplay failed on loadEpisode", err);
      }
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: info.title,
        artist: info.showTitle,
        artwork: [
          { src: info.artworkUrl, sizes: '512x512', type: 'image/jpeg' } // PodcastIndex mostly returns jpegs
        ]
      });
    }
  }, []);

  const play = () => audioRef.current?.play();
  const pause = () => audioRef.current?.pause();
  
  const seek = (time: number) => {
    if (audioRef.current) {
      let safeTime = Math.max(0, time);
      if (duration) safeTime = Math.min(safeTime, duration);
      audioRef.current.currentTime = safeTime;
    }
  };

  const cyclePlaybackRate = useCallback(() => {
    setActivePlaybackRate(prev => {
      const currentIndex = PLAYBACK_RATES.indexOf(prev);
      const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length];
      
      if (audioRef.current) {
        audioRef.current.playbackRate = nextRate;
      }
      return nextRate;
    });
  }, []);

  const resetPlaybackRate = useCallback(() => {
    setActivePlaybackRate(defaultPlaybackRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = defaultPlaybackRate;
    }
  }, [defaultPlaybackRate]);

  const updateDefaultPlaybackRate = useCallback((rate: number) => {
    setDefaultPlaybackRate(rate);
    localStorage.setItem('cyclecast_default_speed', rate.toString());
    
    // Also update active rate if it matches the old default (meaning user hasn't overriden it in BikePlay yet)
    setActivePlaybackRate(prevActive => {
      if (prevActive === defaultPlaybackRate) {
        if (audioRef.current) audioRef.current.playbackRate = rate;
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

  const updateSkipMode = useCallback((mode: 'chapter' | 'podcast') => {
    setSkipMode(mode);
    localStorage.setItem('cyclecast_skip_mode', mode);
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
      seek(currentTime - 300);
    }
  }, [skipMode, currentTime, duration, currentTrackMetadata, loadEpisode]);

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
      // Stub for chapter skip - skip forwards 5 minutes for now
      seek(currentTime + 300);
    }
  }, [skipMode, currentTime, duration, currentTrackMetadata, loadEpisode]);

  return (
    <AudioContext.Provider value={{
      isPlaying, currentTime, duration, 
      activePlaybackRate, defaultPlaybackRate, skipIntervals, skipMode,
      currentTrackMetadata, loadEpisode,
      cyclePlaybackRate, resetPlaybackRate, updateDefaultPlaybackRate, 
      updateSkipIntervals, updateSkipMode, play, pause, seek,
      skipToNext, skipToPrevious, audioRef 
    }}>
      {children}
    </AudioContext.Provider>
  );
};
