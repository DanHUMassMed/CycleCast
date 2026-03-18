import { useEffect } from 'react';
import type { TrackMetadata } from './useAudioPlayer';

interface MediaSessionProps {
  duration: number;
  currentTime: number;
  playbackRate: number;
  metadata: TrackMetadata | null;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onNext: () => void;
  onPrev: () => void;
}

export const useMediaSession = ({
  duration,
  currentTime,
  playbackRate,
  metadata,
  onPlay,
  onPause,
  onSeek,
  onNext,
  onPrev
}: MediaSessionProps) => {
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', onPlay);
      navigator.mediaSession.setActionHandler('pause', onPause);
      navigator.mediaSession.setActionHandler('previoustrack', onPrev);
      navigator.mediaSession.setActionHandler('nexttrack', onNext);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) onSeek(details.seekTime);
      });
    }
    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      }
    };
  }, [onPlay, onPause, onPrev, onNext, onSeek]);

  useEffect(() => {
    if ('mediaSession' in navigator && metadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: metadata.title,
        artist: metadata.showTitle,
        artwork: [
          { src: metadata.artworkUrl, sizes: '512x512', type: 'image/jpeg' }
        ]
      });
    }
  }, [metadata]);

  useEffect(() => {
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && !isNaN(duration) && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: playbackRate || 1,
          position: currentTime
        });
      } catch (err) {
        // Ignore position state errors
      }
    }
  }, [currentTime, duration, playbackRate]);
};
