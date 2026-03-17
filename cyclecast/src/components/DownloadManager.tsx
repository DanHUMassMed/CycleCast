import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import OfflinePinIcon from '@mui/icons-material/OfflinePin';
import { saveAudioFile, deleteAudioFile, checkStorageQuota, getAudioFile } from '../utils/storage';

interface DownloadManagerProps {
  audioUrl: string;
  audioKey: string;
  onDownloadStateChange?: (isDownloaded: boolean) => void;
}

export const DownloadManager: React.FC<DownloadManagerProps> = ({ audioUrl, audioKey, onDownloadStateChange }) => {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [storageInfo, setStorageInfo] = useState<{usage: number; quota: number}>({ usage: 0, quota: 0 });

  useEffect(() => {
    // Check initial state
    const initCheck = async () => {
      const existing = await getAudioFile(audioKey);
      const isLocal = !!existing;
      setIsDownloaded(isLocal);
      onDownloadStateChange?.(isLocal);
      
      const quota = await checkStorageQuota();
      setStorageInfo(quota);
    };
    initCheck();
  }, [audioKey, onDownloadStateChange]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const downloadAudio = async () => {
    try {
      setIsDownloading(true);
      setProgress(10); // Indicate start

      // Using fetch to get the Blob (This might take a while for 89MB)
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      
      // We don't have accurate progress without ReadableStream, so simulate it
      setProgress(50);
      
      const blob = await response.blob();
      setProgress(90);

      await saveAudioFile(audioKey, blob);
      setIsDownloaded(true);
      onDownloadStateChange?.(true);
      
      const quota = await checkStorageQuota();
      setStorageInfo(quota);

    } catch (err) {
      console.error('Download failed', err);
      alert('Download failed. Please check network connection.');
    } finally {
      setIsDownloading(false);
      setProgress(0);
    }
  };

  const removeAudio = async () => {
    await deleteAudioFile(audioKey);
    setIsDownloaded(false);
    onDownloadStateChange?.(false);
    
    const quota = await checkStorageQuota();
    setStorageInfo(quota);
  };

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
          onClick={removeAudio}
        >
          Remove Download
        </Button>
      ) : (
        <Button 
          variant="contained" 
          fullWidth 
          startIcon={<DownloadIcon />}
          sx={{ bgcolor: '#333', color: '#fff', '&:hover': { bgcolor: '#444' } }}
          onClick={downloadAudio}
        >
          Download for Offline (89MB)
        </Button>
      )}
    </Box>
  );
};
