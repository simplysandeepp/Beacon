import { useState, useEffect } from 'react';
import { wakeBackend, checkBackendHealth, waitForBackend } from '@/lib/backend-wake';

/**
 * Hook to ensure backend is awake before making API calls
 * Usage:
 * 
 * const { isReady, isWaking, error } = useBackendWake();
 * 
 * if (isWaking) return <Loading />;
 * if (!isReady) return <Error />;
 * // Make API calls...
 */
export function useBackendWake(autoWake: boolean = true) {
  const [isReady, setIsReady] = useState(false);
  const [isWaking, setIsWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!autoWake) return;

    async function ensureBackendReady() {
      setIsWaking(true);
      setError(null);

      try {
        // First check if already ready
        const alreadyReady = await checkBackendHealth();
        if (alreadyReady) {
          setIsReady(true);
          setIsWaking(false);
          return;
        }

        // Wake the backend
        const wakeResult = await wakeBackend();
        if (!wakeResult.success) {
          setError('Failed to wake backend');
          setIsWaking(false);
          return;
        }

        // Wait for it to be ready
        const ready = await waitForBackend();
        setIsReady(ready);
        
        if (!ready) {
          setError('Backend did not respond in time');
        }
      } catch (err) {
        setError('Unexpected error waking backend');
        console.error('[useBackendWake]', err);
      } finally {
        setIsWaking(false);
      }
    }

    ensureBackendReady();
  }, [autoWake]);

  return { isReady, isWaking, error };
}
