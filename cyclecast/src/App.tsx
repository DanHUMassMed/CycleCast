import { AudioProvider } from './context/AudioContext';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#000',
      paper: '#121212'
    }
  },
  typography: {
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
  }
});

import AppContent from './AppContent';

function MainApp() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <AudioProvider>
        <AppContent />
      </AudioProvider>
    </ThemeProvider>
  );
}

export default MainApp;
