import { useState, useRef, useEffect, useCallback } from 'react';

export const useWakeLock = (enabled: boolean = true) => {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const requestWakeLock = useCallback(async () => {
    if (wakeLockRef.current) return;
    try {
      if ('wakeLock' in navigator) {
        const lock = await navigator.wakeLock.request('screen');
        wakeLockRef.current = lock;
        setIsLocked(true);
        
        lock.addEventListener('release', () => {
          console.log('Wake Lock was released');
          wakeLockRef.current = null;
          setIsLocked(false);
        });
        
        console.log('Wake Lock acquired');
      }
    } catch (err) {
      console.error(`Wake Lock error: `, err);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      releaseWakeLock();
      return;
    }

    requestWakeLock();
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [enabled, requestWakeLock, releaseWakeLock]);

  return { requestWakeLock, releaseWakeLock, isLocked };
};
