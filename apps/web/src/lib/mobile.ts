import { useSyncExternalStore } from 'react';
import { create } from 'zustand';

/** Phones (≤767 px): the app switches to its own two-pane navigation instead of shrinking the desktop. */
const Q = '(max-width: 767px)';
const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(Q) : null;
export const isMobileNow = () => !!mq?.matches;
export function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      mq?.addEventListener('change', cb);
      return () => mq?.removeEventListener('change', cb);
    },
    isMobileNow,
    () => false,
  );
}

/** Which pane a phone shows: the navigation (servers + channels) or the content (chat/call). */
export const useMobilePane = create<{ pane: 'nav' | 'content' }>()(() => ({ pane: 'nav' }));
export const showNav = () => useMobilePane.setState({ pane: 'nav' });
export const showContent = () => useMobilePane.setState({ pane: 'content' });

/**
 * Keyboard-aware height on phones. iOS Safari overlays the keyboard instead of shrinking the page, which
 * left an empty strip (bottom safe area + padding) between the message field and the keyboard.
 * We size the app to the *visible* viewport and drop the bottom safe-area padding while the keyboard is open.
 */
export function installViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const sync = () => {
    root.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
    const kb = window.innerHeight - vv.height > 120;
    root.dataset.kb = kb ? 'open' : 'closed';
    if (kb && window.scrollY) window.scrollTo(0, 0); // iOS scrolls the page under the keyboard
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
}

/** Generic media-query hook (tablet, landscape phone, reduced motion…). */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
      m?.addEventListener('change', cb);
      return () => m?.removeEventListener('change', cb);
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false),
    () => false,
  );
}
export const TABLET = '(min-width: 768px) and (max-width: 1023px)';
export const SHORT = '(max-height: 520px)';
