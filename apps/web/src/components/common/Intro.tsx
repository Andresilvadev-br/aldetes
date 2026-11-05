import { useEffect, useRef } from 'react';
import { motion, useAnimate } from 'motion/react';
import { getPrefs, setPrefs } from '@/lib/prefs';
import { playSound } from '@/lib/sounds';
import { desktop } from '@/lib/desktop';

const version = () => (desktop?.version && desktop.version !== '0.0.0' ? desktop.version : __APP_VERSION__);

/** Should the intro play now? (modes: always / first launch of this version / off; never with reduced motion) */
export function introWanted() {
  const p = getPrefs();
  if (p.reduceMotion || p.motion === 'performance' || matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const mode = p.introMode ?? (p.introAnimation ? 'always' : 'off');
  if (mode === 'off') return false;
  if (mode === 'version') return p.introSeenVersion !== version();
  return true;
}

/**
 * Signature intro (~1.9 s), drawn over the app while it really loads underneath (never waits for the network,
 * never blocks a call, an update or the window):
 *  00 INÍCIO     deep background with a subtle light pulse — never a still black screen
 *  01 CONEXÃO    the two capsules converge and lean into the Aldetes "A" (optional micro-sound: UI sounds pref)
 *  02 REVELAÇÃO  the voice dot pops and sends sound waves, the wordmark types in, a very slow camera push
 *  03 PASSAGEM   the symbol travels to a real spot of the interface (the home button) and reveals the Pulse
 * Skip: any key, any click, or the "Pular" button.
 */
export function Intro({ onDone }: { onDone: () => void }) {
  const [scope, animate] = useAnimate();
  const done = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (done.current) return;
      done.current = true;
      setPrefs({ introSeenVersion: version() });
      onDone();
    };
    if (!introWanted()) {
      finish();
      return;
    }
    const skip = () => {
      if (done.current) return;
      void animate(scope.current, { opacity: 0 }, { duration: 0.16 }).then(finish);
    };
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });

    const S = { type: 'spring', stiffness: 380, damping: 22, mass: 0.9 } as const;
    (async () => {
      // 00 — início
      animate('.glow', { opacity: [0, 1, 0.75], scale: [0.6, 1.15, 1] }, { duration: 0.9, ease: 'easeOut' });
      animate('.pulse', { opacity: [0, 0.5, 0], scale: [0.4, 1.6] }, { duration: 1.4, ease: 'easeOut' });
      // 01 — conexão
      animate('.leg-l', { x: [-26, 0], y: [40, 0], rotate: [-10, 21], opacity: [0, 1] }, { ...S, delay: 0.14 });
      await animate('.leg-r', { x: [26, 0], y: [40, 0], rotate: [10, -21], opacity: [0, 1] }, { ...S, delay: 0.22 });
      if (done.current) return;
      if (getPrefs().uiSounds) playSound('join');
      // 02 — revelação (camera push: barely noticeable)
      animate('.camera', { scale: [1, 1.035] }, { duration: 1.2, ease: 'easeOut' });
      animate('.dot', { scale: [0, 1.35, 1], opacity: [0, 1] }, { type: 'spring', stiffness: 600, damping: 16 });
      animate('.wave', { scale: [0.6, 2.6], opacity: [0.8, 0] }, { duration: 0.9, ease: 'easeOut', delay: (i: number) => i * 0.14 });
      animate('.letter', { opacity: [0, 1], y: [10, 0], filter: ['blur(4px)', 'blur(0px)'] }, { duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: (i: number) => 0.12 + i * 0.035 });
      await new Promise((r) => setTimeout(r, 780));
      if (done.current) return;
      // 03 — passagem: the symbol flies to the home button of the real interface (if it is already there)
      const mark = scope.current?.querySelector('.mark') as HTMLElement | null;
      const target = document.querySelector('nav[aria-label="Servidores"] button[aria-label="Mensagens diretas"]') as HTMLElement | null;
      const tr = target?.getBoundingClientRect();
      const mr = mark?.getBoundingClientRect();
      animate('.word', { opacity: 0, y: -8 }, { duration: 0.22, ease: 'easeIn' });
      animate('.glow, .wave, .pulse', { opacity: 0 }, { duration: 0.25 });
      if (tr && mr && tr.width > 0) {
        const dx = tr.left + tr.width / 2 - (mr.left + mr.width / 2);
        const dy = tr.top + tr.height / 2 - (mr.top + mr.height / 2);
        animate('.backdrop', { opacity: 0 }, { duration: 0.42, ease: 'easeInOut', delay: 0.06 });
        await animate('.mark', { x: dx, y: dy, scale: tr.width / mr.width }, { duration: 0.45, ease: [0.65, 0, 0.35, 1] });
        await animate('.mark', { opacity: 0 }, { duration: 0.12 });
      } else {
        animate('.camera', { scale: 0.9, y: -18 }, { duration: 0.32, ease: [0.4, 0, 1, 1] });
        await animate(scope.current, { opacity: 0 }, { duration: 0.32, ease: 'easeIn' });
      }
      finish();
    })();
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, []);

  return (
    <div ref={scope} className="pointer-events-auto fixed inset-0 z-[200] flex items-center justify-center" data-testid="intro">
      <div className="backdrop absolute inset-0 bg-bg-rail" />
      <div className="glow pointer-events-none absolute h-[520px] w-[520px] rounded-full opacity-0" style={{ background: 'radial-gradient(circle, rgb(var(--brand) / .35), rgb(var(--brand-2) / .12) 45%, transparent 70%)' }} />
      <div className="pulse pointer-events-none absolute h-[300px] w-[300px] rounded-full border border-[rgb(var(--brand)/0.35)] opacity-0" />
      <div className="camera relative flex flex-col items-center">
        <div className="mark relative flex h-32 w-32 items-center justify-center">
          {[0, 1].map((i) => (
            <span key={i} className="wave absolute h-10 w-10 rounded-full border-2 opacity-0" style={{ borderColor: 'rgb(var(--brand))', top: 'calc(50% + 4px)', left: 'calc(50% - 20px)', marginTop: -20 }} />
          ))}
          <svg width="128" height="128" viewBox="0 0 64 64" className="relative overflow-visible">
            <defs>
              <linearGradient id="intro-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="rgb(var(--brand))" />
                <stop offset="1" stopColor="rgb(var(--brand-2))" />
              </linearGradient>
            </defs>
            <motion.rect className="leg-l" x="17" y="10" width="10.5" height="44" rx="5.25" fill="url(#intro-g)" style={{ opacity: 0 }} />
            <motion.rect className="leg-r" x="36.5" y="10" width="10.5" height="44" rx="5.25" fill="url(#intro-g)" fillOpacity=".9" style={{ opacity: 0 }} />
            <motion.circle className="dot" cx="32" cy="38" r="4.8" fill="rgb(var(--bg-rail))" stroke="#fff" strokeWidth="3.2" style={{ opacity: 0 }} />
          </svg>
        </div>
        <div className="word mt-3 flex text-[44px] font-black tracking-[-0.04em] text-fg-strong" aria-hidden>
          {'aldetes'.split('').map((c, i) => (
            <span key={i} className="letter inline-block opacity-0">
              {c}
            </span>
          ))}
        </div>
      </div>
      <button className="absolute bottom-8 right-8 rounded-xl px-3 py-1.5 text-sm font-semibold text-fg-faint hover:bg-line/10 hover:text-fg-strong phone:hidden" aria-label="Pular abertura">
        Pular
      </button>
    </div>
  );
}
