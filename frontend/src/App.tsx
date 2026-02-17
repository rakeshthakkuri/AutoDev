import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import GenerationPage from './pages/GenerationPage';
import ErrorBoundary from './components/ErrorBoundary';
import { GenerationStore } from './store/generation';
import './App.css';

function App() {
  const { files, isGenerating } = GenerationStore();
  const hasProject = Object.keys(files).length > 0;

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route 
            path="/generate" 
            element={<GenerationPage />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
