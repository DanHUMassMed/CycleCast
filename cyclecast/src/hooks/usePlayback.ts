import { useContext } from 'react';
import { PlaybackContext } from '../context/AudioContext';

export const usePlayback = () => {
  const context = useContext(PlaybackContext);
  if (!context) throw new Error('usePlayback must be used within AudioProvider');
  return context;
};
