'use client';

import { useEffect, useState } from 'react';
import { wakeBackend, waitForBackend } from '@/lib/backend-wake';

/**
 * BackendWakeProvider
 * Automatically wakes the backend when the app loads
 * Shows a loading state while backend is starting up
 */
export function BackendWakeProvider({ children }: { children: React.ReactNode }) {
  const [isWaking, setIsWaking] = useState(true);
  const [wakeMessage, setWakeMessage] = useState('Connecting to backend...');

  useEffect(() => {
    async function initBackend() {
      // Wake the backend
      const wakeResult = await wakeBackend();
      
      if (wakeResult.success) {
        setWakeMessage('Backend starting up... (~30 seconds)');
        
        // Wait for backend to be ready
        const ready = await waitForBackend();
        
        if (ready) {
          setWakeMessage('Connected!');
          setTimeout(() => setIsWaking(false), 500);
        } else {
          setWakeMessage('Backend is taking longer than expected. You can still browse.');
          setTimeout(() => setIsWaking(false), 2000);
        }
      } else {
        // Backend might already be running or unreachable
        setIsWaking(false);
      }
    }

    initBackend();
  }, []);

  if (!isWaking) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800/50 border border-slate-700">
          <div className="w-8 h-8 border-4 border-slate-600 border-t-white rounded-full animate-spin" />
        </div>
        <p className="text-slate-400 text-sm">{wakeMessage}</p>
      </div>
    </div>
  );
}
