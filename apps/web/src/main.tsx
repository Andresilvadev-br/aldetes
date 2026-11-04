import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css';
import { App } from './App';
import { initApi } from './lib/api';
import { applyAppearance } from './lib/prefs';
import { installCursorLight } from './lib/motion';
import { installMediaBridge } from './lib/media';
import { installActivity } from './lib/activity';
import { installPwa } from './lib/pwa';
import { installViewport } from './lib/mobile';

applyAppearance();
const syncHidden = () => (document.documentElement.dataset.hidden = String(document.hidden));
document.addEventListener('visibilitychange', syncHidden);
syncHidden();
installCursorLight();

// Test hook (dev builds only): lets automated E2E tests inspect the LiveKit room and store.
if (import.meta.env.DEV) {
  const [{ getRoom, useVoice }, { useStore }] = await Promise.all([import('./lib/voice'), import('./store')]);
  (window as any).__aldetes = { getRoom, useVoice, useStore };
}
await initApi();

// The desktop's floating Live Island window loads the same bundle with this hash:
// it renders only the capsule (no login, no socket, no intro).
if (window.location.hash.startsWith('#/island-overlay')) {
  const { IslandOverlay } = await import('./pages/IslandOverlay');
  createRoot(document.getElementById('root')!).render(<IslandOverlay />);
} else {
  installMediaBridge();
  installActivity();
  installPwa();
  installViewport();
  // Voice SDK: not needed to open the app; fetch it quietly once the app is idle so joining a call stays instant.
  setTimeout(() => {
    const go = () => void import('./lib/lk').then((m) => m.loadLiveKit());
    'requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 4000 }) : go();
  }, 2500);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  );
}
