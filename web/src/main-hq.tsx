import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import './deadset-brand.css';
import DeadsetApp from './DeadsetApp';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><DeadsetApp /></BrowserRouter></React.StrictMode>,
);
