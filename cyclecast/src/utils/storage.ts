import { get, set, del } from 'idb-keyval';

export interface SavedEpisodeMetadata {
  id: number;
  showId: number;
  showTitle: string;
  episodeTitle: string;
  artworkUrl: string;
  enclosureUrl: string;
  downloadedAt: number;
}

const LIBRARY_METADATA_KEY = 'cyclecast_library_metadata';

export const getLibraryMetadata = async (): Promise<SavedEpisodeMetadata[]> => {
  try {
    const data = await get<SavedEpisodeMetadata[]>(LIBRARY_METADATA_KEY);
    return data || [];
  } catch (error) {
    console.error('Failed to retrieve library metadata', error);
    return [];
  }
};

export const addEpisodeToLibrary = async (episode: Omit<SavedEpisodeMetadata, 'downloadedAt'>): Promise<void> => {
  try {
    const library = await getLibraryMetadata();
    const existingIndex = library.findIndex(e => e.id === episode.id);
    
    const newEpisode: SavedEpisodeMetadata = {
      ...episode,
      downloadedAt: Date.now()
    };

    if (existingIndex >= 0) {
      library[existingIndex] = newEpisode; // overwrite if already exists
    } else {
      library.push(newEpisode);
    }
    
    await set(LIBRARY_METADATA_KEY, library);
  } catch (error) {
    console.error('Failed to add episode to library metadata', error);
    throw error;
  }
};

export const updateLibraryOrder = async (orderedLibrary: SavedEpisodeMetadata[]): Promise<void> => {
  try {
    await set(LIBRARY_METADATA_KEY, orderedLibrary);
  } catch (error) {
    console.error('Failed to update library order', error);
    throw error;
  }
};

export const removeEpisodeFromLibrary = async (id: number): Promise<void> => {
  try {
    const library = await getLibraryMetadata();
    const updatedLibrary = library.filter(e => e.id !== id);
    await set(LIBRARY_METADATA_KEY, updatedLibrary);
  } catch (error) {
    console.error('Failed to remove episode from library metadata', error);
    throw error;
  }
};

export const saveAudioFile = async (key: string, blob: Blob): Promise<void> => {
  try {
    await set(key, blob);
    console.log(`Saved audio under key: ${key}`);
  } catch (error) {
    console.error('Failed to save audio to IndexedDB', error);
    throw error;
  }
};

export const getAudioFile = async (key: string): Promise<Blob | undefined> => {
  try {
    return await get<Blob>(key);
  } catch (error) {
    console.error(`Failed to retrieve audio for key: ${key}`, error);
    return undefined;
  }
};

export const deleteAudioFile = async (key: string): Promise<void> => {
  try {
    await del(key);
    console.log(`Deleted audio array under key: ${key}`);
  } catch (error) {
    console.error(`Failed to delete audio from IndexedDB`, error);
  }
};

export const checkStorageQuota = async (): Promise<{ usage: number; quota: number }> => {
  if (navigator.storage && navigator.storage.estimate) {
    const estimation = await navigator.storage.estimate();
    return {
      usage: estimation.usage || 0,
      quota: estimation.quota || 0,
    };
  }
  return { usage: 0, quota: 0 };
};
