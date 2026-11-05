import type { Transition } from 'motion/react';

/**
 * Motion vocabulary (physics by intent). Springs are interruptible and keep velocity,
 * so reversing a panel mid-way never "teleports".
 */
/**
 * Duration tokens (seconds), from the product spec:
 * instant 80–130 ms (press/hover/toggle) · short 150–230 ms (menu, tooltip, reaction) ·
 * spatial 240–380 ms (video focus, grid ↔ stage, island) · structural 290–450 ms (joining a call, recomposition) ·
 * composition ≤ 450 ms (release showcase, intro hand-off). Never longer: a UI that waits on its own animation feels slow.
 * Everything animates transform/opacity; reduced motion collapses them (MotionConfig + data-reduce-motion).
 */
export const dur = { instant: 0.11, short: 0.18, spatial: 0.3, structural: 0.38, composition: 0.45 } as const;
export const ease = { out: [0.22, 1, 0.36, 1] as const, inOut: [0.65, 0, 0.35, 1] as const };

export const spring = {
  /** clicks, presses, small toggles */
  snappy: { type: 'spring', stiffness: 700, damping: 38, mass: 0.6 } satisfies Transition,
  /** tabs, active indicators, menus */
  responsive: { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 } satisfies Transition,
  /** cards, panels, modals */
  gentle: { type: 'spring', stiffness: 340, damping: 32, mass: 0.9 } satisfies Transition,
  /** the Live Island morph */
  island: { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } satisfies Transition,
  /** stage/tiles reorganizing (≈ 300 ms, no bounce on video) */
  stage: { type: 'spring', stiffness: 300, damping: 36, mass: 1 } satisfies Transition,
};

/** Delegated cursor light: updates --mx/--my on the hovered [data-glow] element (one listener, rAF-throttled). */
export function installCursorLight() {
  let raf = 0;
  let last: { el: HTMLElement; x: number; y: number } | null = null;
  window.addEventListener(
    'pointermove',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-glow]') as HTMLElement | null;
      if (!el) return;
      last = { el, x: e.clientX, y: e.clientY };
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!last) return;
        const r = last.el.getBoundingClientRect();
        last.el.style.setProperty('--mx', `${last.x - r.left}px`);
        last.el.style.setProperty('--my', `${last.y - r.top}px`);
      });
    },
    { passive: true },
  );
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
