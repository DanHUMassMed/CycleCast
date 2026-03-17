import React, { useState, useEffect } from 'react';
import { Box, BottomNavigation, BottomNavigationAction } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';
import SettingsIcon from '@mui/icons-material/Settings';
import { HomeView } from './components/HomeView';
import { BikePlayView } from './components/BikePlayView';
import { ConfigView } from './components/ConfigView';
import { useAudio } from './context/AudioContext';

const AppContent = () => {
  const [tabIndex, setTabIndex] = useState(0);
  const { resetPlaybackRate, isPlaying } = useAudio();

  // Auto-navigate to Bike Mode if playback starts while on the Home screen
  useEffect(() => {
    if (isPlaying && tabIndex === 0) {
      setTabIndex(1);
    }
  }, [isPlaying]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    if (tabIndex === 1 && newValue !== 1) {
      resetPlaybackRate(); // Exiting bike mode
    }
    setTabIndex(newValue);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', bgcolor: '#000' }}>
      
      {/* Main Content Area */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <Box sx={{ display: tabIndex === 0 ? 'block' : 'none', height: '100%' }}>
           <HomeView />
        </Box>
        
        {/* We use conditional rendering instead of display:none for BikePlayView so WakeLock only binds when active */}
        {tabIndex === 1 && <BikePlayView onExitBikePlay={() => setTabIndex(0)} />}
        
        <Box sx={{ display: tabIndex === 2 ? 'block' : 'none', height: '100%' }}>
           <ConfigView />
        </Box>
      </Box>

      {/* Bottom Navigation */}
      {tabIndex !== 1 && (
        <BottomNavigation
          showLabels
          value={tabIndex}
          onChange={handleTabChange}
          sx={{
            bgcolor: '#111',
            borderTop: '1px solid #333',
            pb: 'env(safe-area-inset-bottom)', // Support iOS home indicator
            height: 'calc(56px + env(safe-area-inset-bottom))',
            '& .MuiBottomNavigationAction-root': { color: '#888' },
            '& .Mui-selected': { color: '#1db954' },
          }}
        >
          <BottomNavigationAction label="Home" icon={<HomeIcon />} />
          <BottomNavigationAction label="Bike Mode" icon={<DirectionsBikeIcon />} />
          <BottomNavigationAction label="Config" icon={<SettingsIcon />} />
        </BottomNavigation>
      )}

    </Box>
  );
};

export default AppContent;
