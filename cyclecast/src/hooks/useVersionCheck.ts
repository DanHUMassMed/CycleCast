import { useState, useCallback } from 'react';

interface VersionCheckResult {
  checking: boolean;
  message: string | null;
  messageType: 'success' | 'error' | null;
  checkForUpdates: () => Promise<void>;
  clearMessage: () => void;
}

const VERSION_STORAGE_KEY = 'cyclecast_app_version';

export const useVersionCheck = (): VersionCheckResult => {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null);

  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    setMessage(null);

    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch version info');
      const data: { version: string } = await res.json();

      const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY);

      if (!storedVersion || data.version !== storedVersion) {
        // Store the new version before reloading
        localStorage.setItem(VERSION_STORAGE_KEY, data.version);

        // Try to activate a waiting service worker first for instant swap
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            } else {
              await reg.update();
            }
          }
        }

        // Reload to pick up new assets
        window.location.reload();
      } else {
        setMessage("You're on the latest version.");
        setMessageType('success');
      }
    } catch (err) {
      console.error('Version check failed', err);
      setMessage('Unable to check for updates. Please try again.');
      setMessageType('error');
    } finally {
      setChecking(false);
    }
  }, []);

  const clearMessage = useCallback(() => {
    setMessage(null);
    setMessageType(null);
  }, []);

  return { checking, message, messageType, checkForUpdates, clearMessage };
};

/** Call once on app boot to seed the stored version without a visible update flow. */
export const seedVersionOnFirstRun = async () => {
  if (localStorage.getItem(VERSION_STORAGE_KEY)) return; // already seeded
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data: { version: string } = await res.json();
    localStorage.setItem(VERSION_STORAGE_KEY, data.version);
  } catch {
    // Silently ignore on first run
  }
};
