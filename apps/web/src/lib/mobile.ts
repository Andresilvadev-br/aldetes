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
