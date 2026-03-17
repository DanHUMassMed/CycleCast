import React from 'react';
import { Box, Typography } from '@mui/material';
import FastRewindIcon from '@mui/icons-material/FastRewind';
import FastForwardIcon from '@mui/icons-material/FastForward';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import CloseIcon from '@mui/icons-material/Close';
import SpeedIcon from '@mui/icons-material/Speed';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import { useAudio } from '../context/AudioContext';
import { useWakeLock } from '../hooks/useWakeLock';

interface BikePlayViewProps {
  onExitBikePlay: () => void;
}

export const BikePlayView: React.FC<BikePlayViewProps> = ({ onExitBikePlay }) => {
  const { 
    isPlaying, currentTime, duration, skipIntervals, activePlaybackRate, skipMode,
    play, pause, seek, cyclePlaybackRate, currentTrackMetadata, skipToNext, skipToPrevious 
  } = useAudio();
  
  const [flashZone, setFlashZone] = React.useState<string | null>(null);
  
  // Enforce WakeLock when this view is mounted
  useWakeLock();

  const handleFeedback = (zone: string) => {
    // Attempt physical vibration if supported
    if (navigator.vibrate) navigator.vibrate(50);
    // Visual high-contrast flash
    setFlashZone(zone);
    setTimeout(() => setFlashZone(null), 150);
  };

  const handleRewind = () => {
    handleFeedback('rewind');
    seek(currentTime - skipIntervals.rewind);
  };
  
  const handleForward = () => {
    handleFeedback('forward');
    seek(currentTime + skipIntervals.forward);
  };
  
  const togglePlay = () => {
    handleFeedback('playpause');
    isPlaying ? pause() : play();
  };

  const handleCycleSpeed = () => {
    handleFeedback('speed');
    cyclePlaybackRate();
  };

  const onSkipPrev = () => {
    handleFeedback('skip_prev');
    skipToPrevious();
  };

  const onSkipNext = () => {
    handleFeedback('skip_next');
    skipToNext();
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh', // use dvh for mobile browsers
        bgcolor: '#000',
        color: '#ccff00', // high contrast neon green/yellow
        overflow: 'hidden',
        position: 'relative',
        '&::before': currentTrackMetadata ? {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `url(${currentTrackMetadata.artworkUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.15, // Keep it dim so neon UI pops
          filter: 'blur(10px)',
          zIndex: 0,
          pointerEvents: 'none'
        } : {}
      }}
    >
      {/* Top Safe Area & Exit Button */}
      <Box
        onClick={onExitBikePlay}
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 2,
          pt: 'env(safe-area-inset-top, 16px)',
          bgcolor: '#111',
          borderBottom: '2px solid #333',
          cursor: 'pointer',
          userSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
          '&:active': { bgcolor: '#222' }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', color: '#fff' }}>
          <CloseIcon sx={{ mr: 1, fontSize: '2rem' }} />
          <Typography variant="h5" fontWeight="bold">Exit</Typography>
        </Box>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#aaa' }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </Typography>
      </Box>

      {/* Metadata Text Area */}
      {currentTrackMetadata ? (
        <Box
          sx={{
            width: '100%',
            p: 2,
            bgcolor: 'rgba(0, 0, 0, 0.6)',
            borderBottom: '2px solid #333',
            position: 'relative',
            zIndex: 1,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: '80px' // give it some fat padding so it fits well with the massive controls
          }}
        >
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#fff', mb: 0.5 }} noWrap>
            {currentTrackMetadata.title}
          </Typography>
          <Typography variant="body1" sx={{ color: '#aaa' }} noWrap>
            {currentTrackMetadata.showTitle}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ p: 2, borderBottom: '2px solid #333', position: 'relative', zIndex: 1, textAlign: 'center', minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body1" sx={{ color: '#888' }}>
            No episode selected.
          </Typography>
        </Box>
      )}

      {/* Massive 3 Vertical Stripes */}
      <Box sx={{ display: 'flex', flex: 1, position: 'relative', zIndex: 1 }}>
        {/* Left Stripe: Rewind */}
        <Box
          onClick={handleRewind}
          sx={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            borderRight: '2px solid #333',
            cursor: 'pointer',
            userSelect: 'none',
            bgcolor: flashZone === 'rewind' ? '#ff3300' : 'transparent',
            transition: 'background-color 0.1s',
            // Disable default touch highlighting
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <FastRewindIcon sx={{ fontSize: '4rem', mb: 1, color: flashZone === 'rewind' ? '#000' : '#ffb700' }} />
            <Typography variant="h5" fontWeight="bold" color={flashZone === 'rewind' ? '#000' : '#ccff00'}>
              -{skipIntervals.rewind}s
            </Typography>
          </Box>
        </Box>

        {/* Middle Stripe: Play/Pause */}
        <Box
          onClick={togglePlay}
          sx={{
            flex: 1.2,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            borderRight: '2px solid #333',
            cursor: 'pointer',
            userSelect: 'none',
            bgcolor: flashZone === 'playpause' ? '#fff' : (isPlaying ? '#111' : '#1a2600'),
            transition: 'background-color 0.1s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {isPlaying ? (
            <PauseIcon sx={{ fontSize: '6rem', color: flashZone === 'playpause' ? '#000' : '#ccff00' }} />
          ) : (
            <PlayArrowIcon sx={{ fontSize: '6rem', color: flashZone === 'playpause' ? '#000' : '#ccff00' }} />
          )}
        </Box>

        {/* Right Stripe: Forward */}
        <Box
          onClick={handleForward}
          sx={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            bgcolor: flashZone === 'forward' ? '#00ffcc' : 'transparent',
            transition: 'background-color 0.1s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <FastForwardIcon sx={{ fontSize: '4rem', mb: 1, color: flashZone === 'forward' ? '#000' : '#ffb700' }} />
            <Typography variant="h5" fontWeight="bold" color={flashZone === 'forward' ? '#000' : '#ccff00'}>
              +{skipIntervals.forward}s
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Chapter / Podcast Skip Dual Button Row */}
      <Box sx={{ display: 'flex', width: '100%', borderTop: '2px solid #444', position: 'relative', zIndex: 1 }}>
        <Box
          onClick={onSkipPrev}
          sx={{
            flex: 1,
            py: 3,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            borderRight: '2px solid #444',
            cursor: 'pointer',
            userSelect: 'none',
            bgcolor: flashZone === 'skip_prev' ? '#ff3300' : '#222',
            transition: 'background-color 0.1s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <SkipPreviousIcon sx={{ fontSize: '2.5rem', mr: 1, color: flashZone === 'skip_prev' ? '#000' : '#fff' }} />
          <Typography variant="h6" fontWeight="bold" sx={{ color: flashZone === 'skip_prev' ? '#000' : '#fff' }}>
            PREV {skipMode === 'chapter' ? 'CHAP' : 'CAST'}
          </Typography>
        </Box>
        <Box
          onClick={onSkipNext}
          sx={{
            flex: 1,
            py: 3,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            bgcolor: flashZone === 'skip_next' ? '#00ffcc' : '#222',
            transition: 'background-color 0.1s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Typography variant="h6" fontWeight="bold" sx={{ color: flashZone === 'skip_next' ? '#000' : '#fff' }}>
            NEXT {skipMode === 'chapter' ? 'CHAP' : 'CAST'}
          </Typography>
          <SkipNextIcon sx={{ fontSize: '2.5rem', ml: 1, color: flashZone === 'skip_next' ? '#000' : '#fff' }} />
        </Box>
      </Box>

      {/* Massive Full-Width Speed Toggle */}
      <Box
        onClick={handleCycleSpeed}
        sx={{
          width: '100%',
          py: 3, // Fat vertical padding for easy tapping
          bgcolor: flashZone === 'speed' ? '#00ffcc' : '#222',
          borderTop: '2px solid #444',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background-color 0.1s',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <SpeedIcon sx={{ fontSize: '2rem', mr: 2, color: flashZone === 'speed' ? '#000' : '#fff' }} />
        <Typography variant="h5" fontWeight="bold" sx={{ color: flashZone === 'speed' ? '#000' : '#fff' }}>
          SPEED: {activePlaybackRate}x
        </Typography>
      </Box>

      <Box sx={{ pb: 'env(safe-area-inset-bottom, 16px)', bgcolor: flashZone === 'speed' ? '#00ffcc' : '#222', position: 'relative', zIndex: 1 }} />
    </Box>
  );
};
