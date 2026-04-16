import { useEffect } from 'react';
import { GenerationStore } from '../store/generation';
import { AlertCircle } from 'lucide-react';

/**
 * Shows a slim banner when the backend is not reachable.
 * Relies on the store's health-check-based `backendConnected` state.
 */
export default function BackendConnectionBanner() {
  const backendConnected = GenerationStore((s) => s.backendConnected);
  const checkHealth = GenerationStore((s) => s.checkHealth);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15_000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  if (backendConnected) return null;

  return (
    <div className="backend-connection-banner" role="alert">
      <AlertCircle size={18} />
      <span>
        <strong>Unable to reach backend service.</strong> Please check the connection and try again.
      </span>
    </div>
  );
}
