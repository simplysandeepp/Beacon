/**
 * Backend Wake Utility
 * Automatically wakes up the Render backend when users visit the frontend
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://beacon-rlw1.onrender.com';
const WAKE_ENDPOINT = `${BACKEND_URL}/wake`;
const HEALTH_ENDPOINT = `${BACKEND_URL}/healthz`;

// Track if we've already attempted to wake the backend in this session
let wakeAttempted = false;
let isBackendReady = false;

/**
 * Wake up the backend server
 * Call this when the app loads or before making API calls
 */
export async function wakeBackend(): Promise<{ success: boolean; message: string }> {
  // Only attempt once per session
  if (wakeAttempted) {
    return { success: true, message: 'Wake already attempted' };
  }

  wakeAttempted = true;

  try {
    console.log('[Backend Wake] Pinging backend...');
    
    const response = await fetch(WAKE_ENDPOINT, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[Backend Wake] Backend is waking up:', data);
      isBackendReady = false;
      
      return {
        success: true,
        message: `Backend waking up. Ready in ~${data.estimated_ready_seconds || 30}s`
      };
    } else {
      console.warn('[Backend Wake] Wake endpoint returned non-OK status:', response.status);
      return { success: false, message: 'Backend wake failed' };
    }
  } catch (error) {
    console.warn('[Backend Wake] Failed to wake backend:', error);
    return { success: false, message: 'Backend unreachable' };
  }
}

/**
 * Check if backend is ready to handle requests
 */
export async function checkBackendHealth(): Promise<boolean> {
  if (isBackendReady) return true;

  try {
    const response = await fetch(HEALTH_ENDPOINT, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      isBackendReady = true;
      console.log('[Backend Wake] Backend is ready');
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Wait for backend to be ready (with timeout)
 * @param maxWaitMs Maximum time to wait in milliseconds (default: 45000ms = 45s)
 * @param checkIntervalMs How often to check (default: 3000ms = 3s)
 */
export async function waitForBackend(
  maxWaitMs: number = 45000,
  checkIntervalMs: number = 3000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const ready = await checkBackendHealth();
    if (ready) return true;

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }

  console.warn('[Backend Wake] Backend did not become ready within timeout');
  return false;
}

/**
 * Reset wake state (useful for testing or manual retry)
 */
export function resetWakeState() {
  wakeAttempted = false;
  isBackendReady = false;
}
