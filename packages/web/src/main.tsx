import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import './styles/global.css';
import { App } from './App.js';
import { AudioProvider } from './audio/AudioContext.js';
import { HardErrorFallback } from './components/overlays/ErrorFallbacks.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <ErrorBoundary FallbackComponent={HardErrorFallback}>
    <AudioProvider>
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </AudioProvider>
  </ErrorBoundary>,
);
