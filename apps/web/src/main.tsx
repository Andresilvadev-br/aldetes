import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css';
import { App } from './App';
import { initApi } from './lib/api';
import { applyAppearance } from './lib/prefs';
import { installCursorLight } from './lib/motion';

applyAppearance();
installCursorLight();

// Test hook (dev builds only): lets automated E2E tests inspect the LiveKit room and store.
if (import.meta.env.DEV) {
  const [{ getRoom, useVoice }, { useStore }] = await Promise.all([import('./lib/voice'), import('./store')]);
  (window as any).__aldetes = { getRoom, useVoice, useStore };
}
await initApi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
