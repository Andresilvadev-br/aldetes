import { create } from 'zustand';
import { desktop } from './desktop';

/**
 * PWA plumbing (browser only — the desktop app has its own updater):
 * - registers the shell service worker (a new build = a new SW that WAITS),
 * - keeps the install prompt (Android/Chrome) for a discreet "Instalar" button,
 * - tracks online/offline for an honest banner.
 */
interface PwaState {
  updateReady: boolean;
  canInstall: boolean;
  online: boolean;
  standalone: boolean;
}
export const usePwa = create<PwaState>()(() => ({
  updateReady: false,
  canInstall: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  standalone: typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true),
}));

let deferredPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;
let waiting: ServiceWorker | null = null;

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function installPwa() {
  window.addEventListener('online', () => usePwa.setState({ online: true }));
  window.addEventListener('offline', () => usePwa.setState({ online: false }));
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as typeof deferredPrompt;
    usePwa.setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ canInstall: false, standalone: true }));

  if (desktop || import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker
    .register(`./sw.js?v=${encodeURIComponent(__BUILD_ID__)}`, { scope: './' })
    .then((reg) => {
      const watch = (sw: ServiceWorker | null) => {
        if (!sw) return;
        const check = () => {
          // "installed" while another SW controls the page → a new version is waiting for a safe moment
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = sw;
            usePwa.setState({ updateReady: true });
          }
        };
        check();
        sw.addEventListener('statechange', check);
      };
      watch(reg.waiting);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      setInterval(() => void reg.update().catch(() => {}), 30 * 60_000);
    })
    .catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

/** Activate the waiting version (the caller makes sure we're not in a call). */
export function applyWebUpdate() {
  waiting?.postMessage('SKIP_WAITING');
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const r = await deferredPrompt.userChoice;
  deferredPrompt = null;
  usePwa.setState({ canInstall: false });
  return r.outcome === 'accepted';
}
