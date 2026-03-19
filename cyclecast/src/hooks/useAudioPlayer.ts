import { useState, useRef, useEffect, useCallback } from 'react';
import { getAudioFile } from '../utils/storage';

export interface TrackMetadata {
  id: number;
  url: string;
  title: string;
  showTitle: string;
  artworkUrl: string;
}

export const useAudioPlayer = (activePlaybackRate: number) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTrackMetadata, setCurrentTrackMetadata] = useState<TrackMetadata | null>(null);
  const currentObjectURLRef = useRef<string | null>(null);
  const lastReportedTimeRef = useRef(0);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.preload = 'metadata';

    const handleTimeUpdate = () => {
      const now = audio.currentTime;
      if (Math.abs(now - lastReportedTimeRef.current) >= 1) {
        lastReportedTimeRef.current = now;
        setCurrentTime(now);
      }
    };
    const handleDurationChange = () => setDuration(audio.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (currentObjectURLRef.current) {
        URL.revokeObjectURL(currentObjectURLRef.current);
        currentObjectURLRef.current = null;
      }
    };
  }, []);

  // Update playback rate when the prop changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = activePlaybackRate;
    }
  }, [activePlaybackRate]);

  const loadEpisode = useCallback(async (info: TrackMetadata) => {
    setCurrentTrackMetadata(info);

    if (audioRef.current) {
      audioRef.current.pause();

      if (currentObjectURLRef.current) {
        URL.revokeObjectURL(currentObjectURLRef.current);
        currentObjectURLRef.current = null;
      }

      const localBlob = await getAudioFile(`podcast-${info.id}`);
      let sourceUrl = info.url;

      if (localBlob) {
        console.log(`useAudioPlayer: Found local blob for podcast-${info.id}. Skipping network stream.`);
        sourceUrl = URL.createObjectURL(localBlob);
        currentObjectURLRef.current = sourceUrl;
      }

      audioRef.current.src = sourceUrl;
      audioRef.current.load();
      audioRef.current.playbackRate = activePlaybackRate;
      try {
        await audioRef.current.play();
      } catch (err) {
        console.error('Autoplay failed on loadEpisode', err);
      }
    }
  }, [activePlaybackRate]);

  const play = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = activePlaybackRate;
      audioRef.current.play().catch(console.error);
    }
  }, [activePlaybackRate]);

  const pause = useCallback(() => audioRef.current?.pause(), []);
  
  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      let safeTime = Math.max(0, time);
      if (duration) safeTime = Math.min(safeTime, duration);
      audioRef.current.currentTime = safeTime;
    }
  }, [duration]);

  return {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    currentTrackMetadata,
    loadEpisode,
    play,
    pause,
    seek,
  };
};
