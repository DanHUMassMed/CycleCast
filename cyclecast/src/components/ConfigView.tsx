import React, { useState } from 'react';
import {
  Typography,
  Box,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Container,
  TextField,
  Button,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import { useSettings } from '../context/AudioContext';
import { useVersionCheck } from '../hooks/useVersionCheck';

const marks = [
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 45, label: '45s' },
  { value: 60, label: '60s' },
];

export const ConfigView: React.FC = () => {
  const { 
    skipIntervals, updateSkipIntervals, 
    defaultPlaybackRate, updateDefaultPlaybackRate, 
    skipMode, updateSkipMode,
    backendUrl, updateBackendUrl
  } = useSettings();
  const { checking, message, messageType, checkForUpdates, clearMessage } = useVersionCheck();
  const currentVersion = localStorage.getItem('cyclecast_app_version') || '—';
  
  const [tempUrl, setTempUrl] = useState(backendUrl);
  
  // Real-time state updates instead of waiting for "Save" since it's a page now
  const handleRewindChange = (_: Event, val: number | number[]) => {
    updateSkipIntervals(val as number, skipIntervals.forward);
  };

  const handleForwardChange = (_: Event, val: number | number[]) => {
    updateSkipIntervals(skipIntervals.rewind, val as number);
  };

  const handleSpeedChange = (_: Event, val: number | number[]) => {
    updateDefaultPlaybackRate(val as number);
  };

  const handleSkipModeChange = (_: React.MouseEvent<HTMLElement>, val: 'chapter' | 'podcast' | null) => {
    if (val) updateSkipMode(val);
  };

  return (
    <Container 
      maxWidth="sm" 
      sx={{ 
        height: '100%',
        bgcolor: '#000',
        color: '#fff',
        pt: 'env(safe-area-inset-top, 16px)',
        pb: 4
      }}
    >
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 4, mt: 2, px: 2 }}>
        Configuration
      </Typography>
      
      <Box sx={{ bgcolor: '#1a1a1a', p: 3, borderRadius: '16px' }}>
        <Box sx={{ mb: 4 }}>
          <Typography gutterBottom sx={{ color: '#ffb700' }}>
            Rewind Interval (-{skipIntervals.rewind}s)
          </Typography>
          <Slider
            value={skipIntervals.rewind}
            onChange={handleRewindChange}
            step={null}
            marks={marks}
            min={5}
            max={60}
            sx={{
              color: '#ffb700',
              '& .MuiSlider-markLabel': { color: '#888' },
              '& .MuiSlider-markLabelActive': { color: '#fff' }
            }}
          />
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography gutterBottom sx={{ color: '#00ffcc' }}>
            Fast Forward Interval (+{skipIntervals.forward}s)
          </Typography>
          <Slider
            value={skipIntervals.forward}
            onChange={handleForwardChange}
            step={null}
            marks={marks}
            min={5}
            max={60}
            sx={{
              color: '#00ffcc',
              '& .MuiSlider-markLabel': { color: '#888' },
              '& .MuiSlider-markLabelActive': { color: '#fff' }
            }}
          />
        </Box>

        <Box sx={{ mb: 4, pt: 3, borderTop: '1px solid #333' }}>
          <Typography gutterBottom sx={{ color: '#fff' }}>
            Default Playback Speed ({defaultPlaybackRate}x)
          </Typography>
          <Slider
            value={defaultPlaybackRate}
            onChange={handleSpeedChange}
            step={0.25}
            marks={[
              { value: 1.0, label: '1x' },
              { value: 1.25, label: '1.25x' },
              { value: 1.5, label: '1.5x' },
              { value: 1.75, label: '1.75x' },
              { value: 2.0, label: '2x' },
            ]}
            min={1.0}
            max={2.0}
            sx={{
              color: '#fff',
              '& .MuiSlider-markLabel': { color: '#888' },
              '& .MuiSlider-markLabelActive': { color: '#fff' }
            }}
          />
        </Box>

        <Box sx={{ pt: 3, borderTop: '1px solid #333' }}>
          <Typography gutterBottom sx={{ color: '#fff' }}>
            Track Skip Mode (|&lt; and &gt;|)
          </Typography>
          <ToggleButtonGroup
            value={skipMode}
            exclusive
            onChange={handleSkipModeChange}
            fullWidth
            sx={{
              mt: 1,
              '& .MuiToggleButton-root': { color: '#888', borderColor: '#333' },
              '& .Mui-selected': { color: '#000 !important', bgcolor: '#1db954 !important', fontWeight: 'bold' }
            }}
          >
            <ToggleButton value="podcast">Podcast</ToggleButton>
            <ToggleButton value="chapter">Chapter (5m)</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ pt: 3, mt: 3, borderTop: '1px solid #333' }}>
          <Typography gutterBottom sx={{ color: '#fff' }}>
            Backend API URL
          </Typography>
          <TextField
            fullWidth
            variant="outlined"
            value={tempUrl}
            onChange={(e) => setTempUrl(e.target.value)}
            onBlur={() => updateBackendUrl(tempUrl)}
            sx={{
              mt: 1,
              input: { color: '#fff' },
              '& .MuiOutlinedInput-root': {
                '& fieldset': { borderColor: '#555' },
                '&:hover fieldset': { borderColor: '#888' },
                '&.Mui-focused fieldset': { borderColor: '#1db954' },
              }
            }}
          />
        </Box>

        {/* Version / Update Checker */}
        <Box sx={{ pt: 3, mt: 3, borderTop: '1px solid #333' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography sx={{ color: '#aaa', fontSize: '0.85rem' }}>
              App Version
            </Typography>
            <Typography sx={{ color: '#fff', fontWeight: 'bold', fontFamily: 'monospace' }}>
              v{currentVersion}
            </Typography>
          </Box>
          <Button
            fullWidth
            variant="outlined"
            startIcon={checking ? <CircularProgress size={16} sx={{ color: '#1db954' }} /> : <SystemUpdateAltIcon />}
            disabled={checking}
            onClick={checkForUpdates}
            sx={{
              color: '#1db954',
              borderColor: '#1db954',
              '&:hover': { borderColor: '#1ed760', color: '#1ed760', bgcolor: 'rgba(29, 185, 84, 0.08)' },
              '&:disabled': { borderColor: '#333', color: '#555' },
            }}
          >
            {checking ? 'Checking…' : 'Check for Updates'}
          </Button>
        </Box>
      </Box>

      <Snackbar
        open={!!message}
        autoHideDuration={5000}
        onClose={clearMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={clearMessage} severity={messageType ?? 'info'} sx={{ width: '100%' }}>
          {message}
        </Alert>
      </Snackbar>
    </Container>
  );
};
