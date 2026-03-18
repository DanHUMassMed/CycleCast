import React, { useEffect, useState } from 'react';
import { Container, Typography, Box, List, ListItem, ListItemAvatar, Avatar, ListItemText, IconButton } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import { SearchPodcasts } from './SearchPodcasts';
import { getLibraryMetadata, removeEpisodeFromLibrary, deleteAudioFile, updateLibraryOrder } from '../utils/storage';
import type { SavedEpisodeMetadata } from '../utils/storage';
import { usePlayback } from '../hooks/usePlayback';
import { 
  DndContext, 
  closestCenter, 
  PointerSensor, 
  useSensor, 
  useSensors
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { 
  SortableContext, 
  verticalListSortingStrategy, 
  arrayMove,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableEpisodeRowProps {
  ep: SavedEpisodeMetadata;
  isLast: boolean;
  onRemove: (id: number) => void;
  onPlay: (ep: SavedEpisodeMetadata) => void;
}

const SortableEpisodeRow: React.FC<SortableEpisodeRowProps> = ({ ep, isLast, onRemove, onPlay }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: ep.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : 1,
    boxShadow: isDragging ? '0px 10px 20px rgba(0,0,0,0.5)' : 'none',
    backgroundColor: isDragging ? '#1a1a1a' : 'transparent',
    borderBottom: isLast ? 'none' : '1px solid #222',
  };

  return (
    <ListItem 
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      sx={{ py: 1.5 }}
      secondaryAction={
        <Box sx={{ display: 'flex' }} onPointerDown={(e) => e.stopPropagation() /* Prevent drag when clicking buttons */}>
          <IconButton onClick={() => onRemove(ep.id)} sx={{ color: '#888', mr: 1, '&:hover': { color: '#f44336' } }}>
            <DeleteIcon />
          </IconButton>
          <IconButton onClick={() => onPlay(ep)} sx={{ color: '#000', bgcolor: '#1db954', '&:hover': { bgcolor: '#1ed760' } }}>
            <PlayArrowIcon />
          </IconButton>
        </Box>
      }
    >
      <ListItemAvatar>
        <Avatar src={ep.artworkUrl} variant="rounded" sx={{ width: 48, height: 48, mr: 2 }} />
      </ListItemAvatar>
      <ListItemText 
        primary={<Typography variant="body2" fontWeight="bold" noWrap sx={{ color: '#fff' }}>{ep.episodeTitle}</Typography>}
        secondary={<Typography variant="caption" noWrap sx={{ color: '#aaa' }}>{ep.showTitle}</Typography>}
        sx={{ pr: 6 }}
      />
    </ListItem>
  );
};

export const HomeView: React.FC = () => {
  const [library, setLibrary] = useState<SavedEpisodeMetadata[]>([]);
  const { loadEpisode } = usePlayback();

  // Require user to hold for 250ms with a small movement tolerance before a drag begins
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  // Load library on mount. Use poll unless we are actively reordering.
  useEffect(() => {
    const fetchLibrary = async () => {
      const data = await getLibraryMetadata();
      // Only set if library has not been populated yet, or lengths differ, to avoid wiping ordered states
      setLibrary(prev => {
        if (prev.length === 0 || prev.length !== data.length) return data;
        return prev;
      });
    };

    fetchLibrary();
    const interval = setInterval(fetchLibrary, 2000);
    return () => clearInterval(interval);
  }, []);

  const handlePlayOffline = (ep: SavedEpisodeMetadata) => {
    loadEpisode({
      id: ep.id,
      url: ep.enclosureUrl, // Will be intercepted by AudioContext since it's downloaded
      title: ep.episodeTitle,
      showTitle: ep.showTitle,
      artworkUrl: ep.artworkUrl
    });
  };

  const handleRemoveOffline = async (id: number) => {
    await deleteAudioFile(`podcast-${id}`);
    await removeEpisodeFromLibrary(id);
    setLibrary(prev => prev.filter(ep => ep.id !== id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLibrary((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        
        const newArr = arrayMove(items, oldIndex, newIndex);
        
        // Push the new order to IndexedDB so AudioContext sees it
        updateLibraryOrder(newArr).catch(console.error);
        
        return newArr;
      });
    }
  };

  return (
    <Container
      maxWidth="sm"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        pb: 'env(safe-area-inset-bottom)',
        pt: 'env(safe-area-inset-top, 16px)',
        bgcolor: '#000',
        color: '#fff',
      }}
    >
      <Typography variant="h4" sx={{ fontWeight: 'bold', mt: 2, mb: 1, px: 2 }}>
        Cycle Cast
      </Typography>

      {/* Offline Library Section */}
      <Box sx={{ px: 2, mb: 4 }}>
        <Typography variant="h6" sx={{ color: '#1db954', fontWeight: 'bold', mb: 2 }}>
          Offline Library
        </Typography>

        {library.length === 0 ? (
          <Box sx={{ bgcolor: '#111', p: 3, borderRadius: '12px', textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: '#888' }}>
              Your library is empty. Search and download podcasts below.
            </Typography>
          </Box>
        ) : (
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={library.map(ep => ep.id)}
              strategy={verticalListSortingStrategy}
            >
              <List sx={{ bgcolor: '#111', borderRadius: '12px', overflow: 'hidden' }}>
                {library.map((ep, index) => (
                  <SortableEpisodeRow 
                    key={ep.id}
                    ep={ep}
                    isLast={index === library.length - 1}
                    onRemove={handleRemoveOffline}
                    onPlay={handlePlayOffline}
                  />
                ))}
              </List>
            </SortableContext>
          </DndContext>
        )}
      </Box>

      {/* Discovery & Search component */}
      <Box sx={{ px: 2, pb: 4 }}>
        <SearchPodcasts />
      </Box>
    </Container>
  );
};
