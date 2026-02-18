import { GenerationStore } from '../store/generation';
import { AlertCircle } from 'lucide-react';

/**
 * Shows a slim banner when the backend (port 5001) is not reachable.
 * Explains ERR_CONNECTION_REFUSED and how to fix it.
 */
export default function BackendConnectionBanner() {
  const backendConnected = GenerationStore((s) => s.backendConnected);

  if (backendConnected) return null;

  return (
    <div className="backend-connection-banner" role="alert">
      <AlertCircle size={18} />
      <span>
        <strong>Backend not running.</strong> Generation won&apos;t work until you start the backend.
        Run in the project folder: <code>cd backend && npm run dev</code>
      </span>
    </div>
  );
}
