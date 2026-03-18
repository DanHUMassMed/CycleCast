import React, { useState } from 'react';
import { Box, TextField, List, ListItem, ListItemAvatar, Avatar, ListItemText, Typography, CircularProgress, IconButton, Button, Snackbar, Alert } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import OfflinePinIcon from '@mui/icons-material/OfflinePin';
import DeleteIcon from '@mui/icons-material/Delete';
import { useSettings } from '../context/AudioContext';
import { usePlayback } from '../hooks/usePlayback';
import { useEpisodeDownload } from '../hooks/useEpisodeDownload';

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


const EpisodeRow: React.FC<{ ep: Episode, showData: PodcastSearchResult, handlePlayEpisode: (ep: Episode, show: PodcastSearchResult) => void }> = ({ ep, showData, handlePlayEpisode }) => {
  const { backendUrl } = useSettings();
  const proxyUrl = `${backendUrl}/stream?url=${encodeURIComponent(ep.enclosureUrl)}`;
  const { isDownloaded, isDownloading, error, download, remove, clearError } = useEpisodeDownload({
    audioKey: `podcast-${ep.id}`,
    sourceUrl: proxyUrl,
    metadata: {
      id: ep.id,
      showId: showData.id,
      showTitle: showData.title,
      episodeTitle: ep.title,
      artworkUrl: showData.image,
      enclosureUrl: ep.enclosureUrl
    }
  });

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
              <IconButton onClick={remove} sx={{ color: '#f44336', mr: 1, '&:hover': { bgcolor: '#ffebee' } }}>
                <DeleteIcon />
              </IconButton>
            </>
          ) : (
            <IconButton onClick={download} sx={{ color: '#888', mr: 1, '&:hover': { color: '#fff' } }}>
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
      <Snackbar open={!!error} autoHideDuration={6000} onClose={clearError} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={clearError} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
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
  const [error, setError] = useState<string | null>(null);

  const { loadEpisode } = usePlayback();
  const { backendUrl } = useSettings();

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    setEpisodes([]);
    setSelectedShow(null);

    try {
      const response = await fetch(`${backendUrl}/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (data.feeds) {
        setResults(data.feeds);
      }
    } catch (err) {
      console.error("Search failed", err);
      setError("Search failed. Ensure the Python proxy is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectShow = async (feedId: number) => {
    setSelectedShow(feedId);
    setLoadingEpisodes(true);
    setEpisodes([]);

    try {
      const response = await fetch(`${backendUrl}/episodes?id=${feedId}`);
      const data = await response.json();
      if (data.items) {
        setEpisodes(data.items);
      }
    } catch (err) {
      console.error("Failed to fetch episodes", err);
      setError("Failed to fetch episodes.");
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const handlePlayEpisode = (ep: Episode, show: PodcastSearchResult) => {
    // The Audio stream proxy needs the raw enclosure URL
    const proxyUrl = `${backendUrl}/stream?url=${encodeURIComponent(ep.enclosureUrl)}`;
    
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

      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};
