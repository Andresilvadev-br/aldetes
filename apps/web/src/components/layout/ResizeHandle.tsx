import { useRef } from 'react';
import clsx from 'clsx';

/**
 * Column resize handle: pointer drag (rAF-throttled, width written to a CSS variable so React doesn't re-render per
 * frame), arrow keys for keyboard users, double-click to restore the default. The caller clamps and persists.
 */
export function ResizeHandle({ side, label, value, min, max, def, onPreview, onCommit }: { side: 'left' | 'right'; label: string; value: number; min: number; max: number; def: number; onPreview: (px: number) => void; onCommit: (px: number) => void }) {
  const drag = useRef<{ x: number; w: number; cur: number; raf: number } | null>(null);
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)));
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      title={`${label} — arraste; duplo clique restaura`}
      className={clsx('group relative z-10 w-2 shrink-0 cursor-col-resize touch-none outline-none', side === 'left' ? '-mr-1' : '-ml-1')}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, w: value, cur: value, raf: 0 };
        document.documentElement.style.cursor = 'col-resize';
        document.documentElement.style.userSelect = 'none';
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.cur = clamp(d.w + (side === 'left' ? e.clientX - d.x : d.x - e.clientX));
        if (!d.raf)
          d.raf = requestAnimationFrame(() => {
            if (!drag.current) return;
            drag.current.raf = 0;
            onPreview(drag.current.cur);
          });
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        document.documentElement.style.cursor = '';
        document.documentElement.style.userSelect = '';
        if (d) {
          cancelAnimationFrame(d.raf);
          onCommit(d.cur);
        }
      }}
      onDoubleClick={() => onCommit(def)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 32 : 8;
        const dir = side === 'left' ? 1 : -1;
        if (e.key === 'ArrowRight') (e.preventDefault(), onCommit(clamp(value + step * dir)));
        if (e.key === 'ArrowLeft') (e.preventDefault(), onCommit(clamp(value - step * dir)));
        if (e.key === 'Home') (e.preventDefault(), onCommit(def));
      }}
    >
      <span className="absolute inset-y-3 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-brand/0 transition-colors duration-150 group-hover:bg-brand/50 group-focus-visible:bg-brand group-active:bg-brand" />
    </div>
  );
}
