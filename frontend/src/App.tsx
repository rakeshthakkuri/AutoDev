import type { ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LandingPage from './components/LandingPage';
import GenerationPage from './pages/GenerationPage';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import ErrorBoundary from './components/ErrorBoundary';
import BackendConnectionBanner from './components/BackendConnectionBanner';
import { useSettingsStore } from './store/settings';
import './App.css';

function SafePage({ Page }: { Page: ComponentType | null | undefined }) {
  if (Page == null) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Loading...</div>;
  }
  return <Page />;
}

function AnimatedRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SafePage Page={LandingPage} />} />
      <Route path="/generate" element={<SafePage Page={GenerationPage} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  const theme = useSettingsStore((s) => s.theme);
  const isDark = theme === 'dark';

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <a href="#main-content" className="skip-to-content">Skip to content</a>
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: isDark ? '#161b22' : '#ffffff',
              color: isDark ? '#e6edf3' : '#1f2328',
              borderRadius: '12px',
              border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
              fontSize: '14px',
              fontFamily: 'Outfit, -apple-system, BlinkMacSystemFont, sans-serif',
              padding: '12px 16px',
              boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.1)',
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
        <BackendConnectionBanner />
        <KeyboardShortcuts />
        <div id="main-content">
          <AnimatedRoutes />
        </div>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
