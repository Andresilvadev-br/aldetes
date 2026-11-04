import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createContext, useEffect, useRef } from 'react';

/** Phones: whether the route's content screen is really on screen (hidden → render the logic, not the chat). */
export const MobileContentVisible = createContext(true);

/** Phones (≤767 px): the app switches to its own two-pane navigation instead of shrinking the desktop. */
const Q = '(max-width: 767px), (pointer: coarse) and (max-height: 500px)';
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

/**
 * Phone navigation is tied to the browser history, so the app's ← button, Android's back button and the
 * iOS back swipe all do the same thing and nothing is lost:
 * - an entry pushed with state { m: 'content' } (or any pushed channel URL) shows the chat/call screen,
 * - redirects use state { m: 'nav' } so "back" returns to the channel list, not to the chat.
 */
export type MobilePane = 'nav' | 'content';
export type MobileTab = 'servers' | 'dms' | 'notifications' | 'you';

let navigateRef: ((to: string | number, opts?: { replace?: boolean; state?: unknown }) => void) | null = null;
export const registerMobileNavigate = (fn: typeof navigateRef) => (navigateRef = fn);

export function paneFor(pathname: string, state: unknown): MobilePane {
  const m = (state as { m?: MobilePane } | null)?.m;
  if (m) return m;
  // a pushed URL that names a channel (or the friends page) is a content screen
  return /^\/channels\/(@me|\d+)\/\d+/.test(pathname) ? 'content' : 'nav';
}

/** Open a chat/call/friends screen (pushes history, so back returns here). */
export function openContent(path: string) {
  if (!navigateRef) return;
  navigateRef(path, { state: { m: 'content' } });
}
/** Back to the list (uses history when there is an in-app entry to return to). */
export function mobileBack() {
  if (!navigateRef) return;
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx > 0) navigateRef(-1);
  else navigateRef(window.location.hash.slice(1) || '/channels/@me', { replace: true, state: { m: 'nav' } });
}
/** Legacy helpers (desktop ignores them) */
export const showContent = () => {};
export const showNav = () => mobileBack();

export const useMobileTab = create<{ tab: MobileTab; lastServer: string | null }>()(() => {
  try {
    const t = sessionStorage.getItem('aldetes.mtab') as MobileTab | null;
    return { tab: t ?? 'servers', lastServer: localStorage.getItem('aldetes.mserver') };
  } catch {
    return { tab: 'servers', lastServer: null };
  }
});
export function setMobileTab(tab: MobileTab) {
  useMobileTab.setState({ tab });
  try {
    sessionStorage.setItem('aldetes.mtab', tab);
  } catch {
    /* ignore */
  }
}

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
    root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
    const kb = window.innerHeight - vv.height > 120;
    root.dataset.kb = kb ? 'open' : 'closed';

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

/** iOS Safari (not installed as an app) has its own edge back-swipe; ours would fight it. */
export const nativeBackSwipe = () => {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
};

/**
 * Phones: an overlay (sheet, menu, modal, settings) gets its own history entry, so Android's back button and the
 * iOS back swipe close the overlay instead of leaving the screen. Closing it normally removes that entry again.
 * Survives React StrictMode's double mount (the entry is created once per overlay instance).
 */
export function useBackToClose(onClose: () => void, enabled = true) {
  const close = useRef(onClose);
  close.current = onClose;
  const marker = useRef<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!enabled || !isMobileNow()) return;
    mounted.current = true;
    if (!marker.current) {
      marker.current = Math.random().toString(36).slice(2);
      window.history.pushState({ ...(window.history.state ?? {}), overlay: marker.current }, '');
    }
    const onPop = () => {
      if (marker.current && (window.history.state as { overlay?: string } | null)?.overlay !== marker.current) {
        marker.current = null;
        close.current();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      mounted.current = false;
      setTimeout(() => {
        if (mounted.current || !marker.current) return; // StrictMode remount, or already popped
        const m = marker.current;
        marker.current = null;
        if ((window.history.state as { overlay?: string } | null)?.overlay === m) window.history.back();
      }, 0);
    };
  }, [enabled]);
}

/**
 * Long-press = the context menu (message actions, member options, channel options…).
 * Android Chrome already fires `contextmenu` on long-press; iOS Safari never does, so we synthesize it there.
 * The tap that ends a long-press is swallowed, so the row underneath doesn't also open.
 */
export function installLongPress() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number; t: EventTarget | null } | null = null;
  let nativeFired = false;
  let swallowUntil = 0;
  let firedFromTouch = false;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    start = null;
  };
  window.addEventListener('contextmenu', () => {
    nativeFired = true; // Android (or a mouse): nothing to synthesize
  }, true);
  window.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return cancel();
      const t = e.touches[0]!;
      start = { x: t.clientX, y: t.clientY, t: e.target };
      nativeFired = false;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!start || nativeFired) return;
        const el = start.t as Element | null;
        if (!el || el.closest('input, textarea, [contenteditable="true"], video, [data-no-longpress]')) return;
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y }));
        firedFromTouch = true;
        navigator.vibrate?.(12);
        cancel();
      }, 480);
    },
    { passive: true },
  );
  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) cancel();
  }, { passive: true });
  window.addEventListener('touchend', () => {
    // the finger lifting after our long-press must not also "click" the row (or the sheet's backdrop)
    if (firedFromTouch) swallowUntil = Date.now() + 450;
    firedFromTouch = false;
    cancel();
  }, { passive: true });
  window.addEventListener('touchcancel', cancel, { passive: true });
  window.addEventListener('click', (e) => {
    if (Date.now() < swallowUntil) {
      e.preventDefault();
      e.stopPropagation();
      swallowUntil = 0;
    }
  }, true);
}
