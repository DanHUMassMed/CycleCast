import { useState, useCallback, useEffect } from 'react';
import { getAudioFile, saveAudioFile, deleteAudioFile, checkStorageQuota, addEpisodeToLibrary, removeEpisodeFromLibrary } from '../utils/storage';
import type { SavedEpisodeMetadata } from '../utils/storage';

interface UseEpisodeDownloadOptions {
  audioKey: string;
  sourceUrl: string;
  metadata?: Omit<SavedEpisodeMetadata, 'downloadedAt'>;
  onDownloadStateChange?: (isDownloaded: boolean) => void;
}

export const useEpisodeDownload = ({ audioKey, sourceUrl, metadata, onDownloadStateChange }: UseEpisodeDownloadOptions) => {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [storageInfo, setStorageInfo] = useState<{usage: number; quota: number}>({ usage: 0, quota: 0 });
  const [error, setError] = useState<string | null>(null);

  const checkState = useCallback(async () => {
    const existing = await getAudioFile(audioKey);
    const isLocal = !!existing;
    setIsDownloaded(isLocal);
    onDownloadStateChange?.(isLocal);
    
    const quota = await checkStorageQuota();
    setStorageInfo(quota);
  }, [audioKey, onDownloadStateChange]);

  useEffect(() => {
    checkState();
  }, [checkState]);

  const download = async () => {
    try {
      setIsDownloading(true);
      setError(null);
      setProgress(10); 

      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      
      setProgress(50);
      const blob = await response.blob();
      setProgress(90);

      await saveAudioFile(audioKey, blob);
      
      if (metadata) {
        await addEpisodeToLibrary(metadata);
      }

      setIsDownloaded(true);
      onDownloadStateChange?.(true);
      
      const quota = await checkStorageQuota();
      setStorageInfo(quota);
    } catch (err) {
      console.error('Download failed', err);
      setError('Download failed. Please check network connection.');
    } finally {
      setIsDownloading(false);
      setProgress(0);
    }
  };

  const remove = async () => {
    await deleteAudioFile(audioKey);
    if (metadata) {
      await removeEpisodeFromLibrary(metadata.id);
    }
    setIsDownloaded(false);
    onDownloadStateChange?.(false);
    
    const quota = await checkStorageQuota();
    setStorageInfo(quota);
  };

  return { isDownloaded, isDownloading, progress, storageInfo, error, download, remove, clearError: () => setError(null) };
};
