import { useState } from 'react';
import { AlertCircle, X, Copy, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface ErrorDetails {
  code?: string;
  message: string;
  details?: Record<string, any>;
}

interface ErrorDisplayProps {
  error: ErrorDetails | null;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export default function ErrorDisplay({ error, onRetry, onDismiss }: ErrorDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!error) return null;

  const copyErrorDetails = () => {
    const errorText = JSON.stringify(error, null, 2);
    navigator.clipboard.writeText(errorText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSuggestions = (code?: string) => {
    if (!code) {
      return [
        'Check if the backend server is reachable',
        'Verify your network connection',
        'Check browser console for more details'
      ];
    }

    switch (code) {
      case 'NETWORK_ERROR':
        return [
          'Check if the backend server is reachable',
          'Verify your network connection',
          'Check browser console for CORS or network errors'
        ];
      case 'MODEL_LOAD_ERROR':
        return [
          'Check that GEMINI_API_KEY (or your configured provider key) is set in backend/.env',
          'Check backend logs for LLM initialization errors',
          'Restart the backend server (Node) and try again'
        ];
      case 'GENERATION_ERROR':
        return [
          'Try simplifying your prompt',
          'Check backend logs for more details',
          'Restart the backend server'
        ];
      case 'VALIDATION_ERROR':
        return [
          'The generated code had syntax errors',
          'Try rephrasing your prompt',
          'Check the validation details below'
        ];
      default:
        return [
          'Check the backend logs',
          'Try a simpler prompt',
          'Restart the backend server'
        ];
    }
  };

  return (
    <div className="error-display">
      <div className="error-header">
        <div className="error-icon-text">
          <AlertCircle size={20} />
          <div>
            <h3>Error: {error.message}</h3>
            {error.code && <span className="error-code">{error.code}</span>}
            {error.details?.partialSuccess && typeof error.details?.filesGenerated === 'number' && error.details.filesGenerated > 0 && (
              <p className="error-partial-success">{error.details.filesGenerated} file{error.details.filesGenerated !== 1 ? 's' : ''} were generated before the error. You can retry or adjust your prompt.</p>
            )}
          </div>
        </div>
        <div className="error-actions">
          {onRetry && (
            <button onClick={onRetry} className="retry-button">
              <RefreshCw size={16} />
              Retry
            </button>
          )}
          {onDismiss && (
            <button onClick={onDismiss} className="dismiss-button">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {error.code && (
        <div className="error-suggestions">
          <p>Suggestions:</p>
          <ul>
            {getSuggestions(error.code).map((suggestion, i) => (
              <li key={i}>{suggestion}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="error-details-toggle">
        <button onClick={() => setShowDetails(!showDetails)}>
          {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {showDetails ? 'Hide' : 'Show'} Technical Details
        </button>
        <button onClick={copyErrorDetails} className="copy-button">
          <Copy size={14} />
          {copied ? 'Copied!' : 'Copy Error'}
        </button>
      </div>

      {showDetails && (
        <div className="error-details">
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
