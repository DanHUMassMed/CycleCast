import React from 'react';
import { Box, Typography, Button, CircularProgress, Snackbar, Alert } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import OfflinePinIcon from '@mui/icons-material/OfflinePin';
import { useEpisodeDownload } from '../hooks/useEpisodeDownload';
import { formatBytes } from '../utils/format';

interface DownloadManagerProps {
  audioUrl: string;
  audioKey: string;
  onDownloadStateChange?: (isDownloaded: boolean) => void;
}

export const DownloadManager: React.FC<DownloadManagerProps> = ({ audioUrl, audioKey, onDownloadStateChange }) => {
  const { isDownloaded, isDownloading, progress, storageInfo, error, download, remove, clearError } = useEpisodeDownload({
    audioKey,
    sourceUrl: audioUrl,
    onDownloadStateChange
  });

  return (
    <Box sx={{ 
      mt: 4, mb: 2, p: 2, 
      bgcolor: '#1a1a1a', 
      borderRadius: '12px',
      border: '1px solid #333'
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2" sx={{ color: '#aaa' }}>
          Offline Storage 
          {storageInfo.quota > 0 && ` (${formatBytes(storageInfo.usage)} / ${formatBytes(storageInfo.quota)})`}
        </Typography>
        
        {isDownloaded && (
          <Box sx={{ display: 'flex', alignItems: 'center', color: '#1db954' }}>
            <OfflinePinIcon fontSize="small" sx={{ mr: 0.5 }} />
            <Typography variant="caption" fontWeight="bold">Ready Offline</Typography>
          </Box>
        )}
      </Box>

      {isDownloading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 1 }}>
          <CircularProgress size={24} sx={{ color: '#1db954', mr: 2 }} variant={progress > 10 ? "determinate" : "indeterminate"} value={progress} />
          <Typography sx={{ color: '#1db954' }}>Downloading... {progress}%</Typography>
        </Box>
      ) : isDownloaded ? (
        <Button 
          variant="outlined" 
          color="error" 
          fullWidth 
          startIcon={<DeleteIcon />}
          onClick={remove}
        >
          Remove Download
        </Button>
      ) : (
        <Button 
          variant="contained" 
          fullWidth 
          startIcon={<DownloadIcon />}
          sx={{ bgcolor: '#333', color: '#fff', '&:hover': { bgcolor: '#444' } }}
          onClick={download}
        >
          Download for Offline
        </Button>
      )}

      <Snackbar open={!!error} autoHideDuration={6000} onClose={clearError} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={clearError} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};
