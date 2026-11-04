import { useEffect, useRef } from 'react';
import { motion, useAnimate } from 'motion/react';
import { getPrefs } from '@/lib/prefs';
import { playSound } from '@/lib/sounds';

/**
 * Brand intro, every launch (~1.7s, skip with any click/key):
 * light pulse → the two capsules spring up and lean into an "A" → the voice dot pops and
 * sends out sound waves → the wordmark types in → everything lifts away into the app.
 */
export function Intro({ onDone }: { onDone: () => void }) {
  const [scope, animate] = useAnimate();
  const done = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (done.current) return;
      done.current = true;
      onDone();
    };
    const p = getPrefs();
    if (p.reduceMotion || p.motion === 'performance' || !p.introAnimation) {
      finish();
      return;
    }
    const skip = () => {
      if (done.current) return;
      void animate(scope.current, { opacity: 0 }, { duration: 0.18 }).then(finish);
    };
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });

    const S = { type: 'spring', stiffness: 380, damping: 22, mass: 0.9 } as const;
    (async () => {
      animate('.glow', { opacity: [0, 1, 0.75], scale: [0.6, 1.15, 1] }, { duration: 0.9, ease: 'easeOut' });
      animate('.leg-l', { y: [60, 0], rotate: [0, 21], opacity: [0, 1] }, { ...S, delay: 0.12 });
      await animate('.leg-r', { y: [60, 0], rotate: [0, -21], opacity: [0, 1] }, { ...S, delay: 0.22 });
      if (done.current) return;
      if (getPrefs().uiSounds) playSound('join');
      animate('.dot', { scale: [0, 1.35, 1], opacity: [0, 1] }, { type: 'spring', stiffness: 600, damping: 16 });
      animate('.wave', { scale: [0.6, 2.6], opacity: [0.8, 0] }, { duration: 0.9, ease: 'easeOut', delay: (i: number) => i * 0.14 });
      animate('.letter', { opacity: [0, 1], y: [10, 0], filter: ['blur(4px)', 'blur(0px)'] }, { duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: (i: number) => 0.12 + i * 0.035 });
      await new Promise((r) => setTimeout(r, 820));
      if (done.current) return;
      animate('.stack', { scale: 0.9, y: -18 }, { duration: 0.32, ease: [0.4, 0, 1, 1] });
      await animate(scope.current, { opacity: 0 }, { duration: 0.32, ease: 'easeIn' });
      finish();
    })();
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, []);

  return (
    <div ref={scope} className="fixed inset-0 z-[200] flex items-center justify-center bg-bg-rail" aria-hidden>
      <div className="glow pointer-events-none absolute h-[520px] w-[520px] rounded-full opacity-0" style={{ background: 'radial-gradient(circle, rgb(var(--brand) / .35), rgb(var(--brand-2) / .12) 45%, transparent 70%)' }} />
      <div className="stack relative flex flex-col items-center">
        <div className="relative flex h-32 w-32 items-center justify-center">
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
        <div className="mt-3 flex text-[44px] font-black tracking-[-0.04em] text-fg-strong">
          {'aldetes'.split('').map((c, i) => (
            <span key={i} className="letter inline-block opacity-0">
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
