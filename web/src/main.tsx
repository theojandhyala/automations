import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import DeadsetApp from './DeadsetApp';
import './styles.css';
import './command-center.css';
import './command-center-v2.css';
import './command-center-mark.css';
import './arc-reactor.css';
import './operations.css';
import './mission-control.css';
import './jarvis-system.css';
import './protocol-forge.css';
import './system-views.css';
import './sovereign-system.css';
import './deadset-brand.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      {import.meta.env.VITE_DEADSET_HQ === 'true' ? <DeadsetApp /> : <App />}
    </BrowserRouter>
  </React.StrictMode>,
);
