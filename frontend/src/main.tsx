import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// Monaco Editor internally uses CancellationTokens for its language-service workers.
// When the editor unmounts or its model changes (e.g. during generation), Monaco cancels
// those in-flight async operations and rejects their promises with
//   { type: 'cancelation', msg: 'operation is manually canceled' }
// This is expected behaviour, not a real error. Suppress it so the console stays clean.
window.addEventListener('unhandledrejection', (event) => {
  const r = event.reason;
  if (r && typeof r === 'object' && r.type === 'cancelation') {
    event.preventDefault();
  }
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

const AppComponent = App ?? (() => <div style={{ padding: '2rem', textAlign: 'center' }}>Failed to load app</div>);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppComponent />
    </ErrorBoundary>
  </React.StrictMode>,
)
