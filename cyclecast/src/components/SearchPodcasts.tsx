import React, { useState } from 'react';
import { Box, TextField, List, ListItem, ListItemAvatar, Avatar, ListItemText, Typography, CircularProgress, IconButton, Button } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import OfflinePinIcon from '@mui/icons-material/OfflinePin';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAudio } from '../context/AudioContext';
import { saveAudioFile, deleteAudioFile, getAudioFile, addEpisodeToLibrary, removeEpisodeFromLibrary } from '../utils/storage';

interface PodcastSearchResult {
  id: number;
  title: string;
  image: string;
  author: string;
}

interface Episode {
  id: number;
  title: string;
  enclosureUrl: string;
  duration: number;
}

const BACKEND_URL = 'http://192.168.1.59:8001/api';

const EpisodeRow: React.FC<{ ep: Episode, showData: PodcastSearchResult, handlePlayEpisode: (ep: Episode, show: PodcastSearchResult) => void }> = ({ ep, showData, handlePlayEpisode }) => {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  React.useEffect(() => {
    getAudioFile(`podcast-${ep.id}`).then(blob => {
      setIsDownloaded(!!blob);
    });
  }, [ep.id]);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      // We don't want to use the proxy for downloads, just fetch directly here or proxy? 
      // Proxy handles CORS. So use the proxy!
      const proxyUrl = `${BACKEND_URL}/stream?url=${encodeURIComponent(ep.enclosureUrl)}`;
      const req = await fetch(proxyUrl);
      if (!req.ok) throw new Error("Fetch failed");
      const blob = await req.blob();
      await saveAudioFile(`podcast-${ep.id}`, blob);
      
      // Save rich metadata so we can display it offline in the Library tab
      await addEpisodeToLibrary({
        id: ep.id,
        showId: showData.id,
        showTitle: showData.title,
        episodeTitle: ep.title,
        artworkUrl: showData.image,
        enclosureUrl: ep.enclosureUrl
      });

      setIsDownloaded(true);
    } catch (e) {
      console.error(e);
      alert("Failed to download episode");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRemove = async () => {
    await deleteAudioFile(`podcast-${ep.id}`);
    await removeEpisodeFromLibrary(ep.id);
    setIsDownloaded(false);
  };

  return (
    <ListItem 
      sx={{ borderBottom: '1px solid #333', py: 2 }}
      secondaryAction={
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {isDownloading ? (
             <CircularProgress size={24} sx={{ color: '#1db954', mr: 2 }} />
          ) : isDownloaded ? (
            <>
              <OfflinePinIcon fontSize="small" sx={{ color: '#1db954', mr: 1 }} />
              <IconButton onClick={handleRemove} sx={{ color: '#f44336', mr: 1, '&:hover': { bgcolor: '#ffebee' } }}>
                <DeleteIcon />
              </IconButton>
            </>
          ) : (
            <IconButton onClick={handleDownload} sx={{ color: '#888', mr: 1, '&:hover': { color: '#fff' } }}>
              <DownloadIcon />
            </IconButton>
          )}

          <IconButton onClick={() => handlePlayEpisode(ep, showData)} sx={{ color: '#1db954', bgcolor: '#222' }}>
            <PlayArrowIcon />
          </IconButton>
        </Box>
      }
    >
      <ListItemText 
        primary={<Typography variant="body2" sx={{ color: '#fff', pr: 4 }}>{ep.title}</Typography>}
      />
    </ListItem>
  );
};

export const SearchPodcasts: React.FC = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PodcastSearchResult[]>([]);
  
  const [selectedShow, setSelectedShow] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const { loadEpisode } = useAudio();

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    setEpisodes([]);
    setSelectedShow(null);

    try {
      const response = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (data.feeds) {
        setResults(data.feeds);
      }
    } catch (err) {
      console.error("Search failed", err);
      alert("Search failed. Ensure the Python proxy is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectShow = async (feedId: number) => {
    setSelectedShow(feedId);
    setLoadingEpisodes(true);
    setEpisodes([]);

    try {
      const response = await fetch(`${BACKEND_URL}/episodes?id=${feedId}`);
      const data = await response.json();
      if (data.items) {
        setEpisodes(data.items);
      }
    } catch (err) {
      console.error("Failed to fetch episodes", err);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const handlePlayEpisode = (ep: Episode, show: PodcastSearchResult) => {
    // The Audio stream proxy needs the raw enclosure URL
    const proxyUrl = `${BACKEND_URL}/stream?url=${encodeURIComponent(ep.enclosureUrl)}`;
    
    // Pass metadata and the proxied URL to our singleton AudioContext
    loadEpisode({
      id: ep.id,
      url: proxyUrl,
      title: ep.title,
      showTitle: show.title,
      artworkUrl: show.image
    });
  };

  return (
    <Box sx={{ width: '100%', mt: 4, mb: 4, bgcolor: '#1a1a1a', borderRadius: '16px', p: 2 }}>
      <Typography variant="h6" fontWeight="bold" sx={{ mb: 2, color: '#ffb700' }}>
        Discover Podcasts
      </Typography>
      
      <Box sx={{ display: 'flex', mb: 2 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search Podcast Index..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          sx={{ 
            input: { color: '#fff' },
            '& .MuiOutlinedInput-root': {
              '& fieldset': { borderColor: '#555' },
              '&:hover fieldset': { borderColor: '#888' },
              '&.Mui-focused fieldset': { borderColor: '#1db954' },
            }
          }}
        />
        <IconButton onClick={handleSearch} sx={{ ml: 1, bgcolor: '#1db954', color: '#000', '&:hover': { bgcolor: '#1ed760' } }}>
          <SearchIcon />
        </IconButton>
      </Box>

      {loading && <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 2, color: '#1db954' }} />}

      {results.length > 0 && !selectedShow && (
        <List sx={{ maxHeight: '300px', overflowY: 'auto' }}>
          {results.map((show) => (
            <ListItem 
              key={show.id} 
              onClick={() => handleSelectShow(show.id)}
              sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#222' }, borderRadius: '8px' }}
            >
              <ListItemAvatar>
                <Avatar src={show.image} variant="rounded" sx={{ width: 56, height: 56, mr: 2 }} />
              </ListItemAvatar>
              <ListItemText 
                primary={<Typography fontWeight="bold" sx={{ color: '#fff' }}>{show.title}</Typography>}
                secondary={<Typography variant="caption" sx={{ color: '#aaa' }}>{show.author}</Typography>}
              />
            </ListItem>
          ))}
        </List>
      )}

      {loadingEpisodes && <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 2, color: '#00ffcc' }} />}

      {selectedShow && episodes.length > 0 && (
        <Box>
          <Button 
            onClick={() => setSelectedShow(null)} 
            sx={{ color: '#888', mb: 2, fontSize: '0.8rem' }}
          >
            ← Back to Results
          </Button>
          <List sx={{ maxHeight: '400px', overflowY: 'auto' }}>
            {episodes.map((ep) => {
              const showData = results.find(r => r.id === selectedShow);
              if (!showData) return null;
              return <EpisodeRow key={ep.id} ep={ep} showData={showData} handlePlayEpisode={handlePlayEpisode} />;
            })}
          </List>
        </Box>
      )}
    </Box>
  );
};
