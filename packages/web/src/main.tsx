import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { App } from './App.js';
import { AudioProvider } from './audio/AudioContext.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <AudioProvider>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </AudioProvider>,
);
