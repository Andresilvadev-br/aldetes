import { useCallback, useRef } from 'react';
import { create } from 'zustand';

/**
 * UltraMotion 3.0 — fluidity budget, measured (never assumed).
 * - Frames: every 20 s, while the window is visible, ~0.5–1 s of rAF timestamps (60 frames) is sampled (no permanent rAF loop, no
 *   fake FPS timers). A frame is "dropped" when it takes > 1.5× the display's own frame time, so the rule is the same
 *   at 60, 120, 144 or 165 Hz.
 * - Input latency: Event Timing API (PerformanceObserver 'event'), the browser's own measure from input to next paint.
 * - High load (≥ 25% dropped frames in two samples in a row (~40 s), or a stream/game reported by the app) sets
 *   <html data-load="high">: CSS pauses ambient/decorative loops until things calm down. Nothing functional changes.
 */
export interface PerfState {
  hz: number | null;
  frameMs: number | null;
  droppedPct: number | null;
  inputP75: number | null;
  high: boolean;
}
export const usePerf = create<PerfState>()(() => ({ hz: null, frameMs: null, droppedPct: null, inputP75: null, high: false }));

let started = false;
let streak = 0;
let calm = 0;
let externalLoad = false;
const latencies: number[] = [];

function setHigh(on: boolean) {
  const high = on || externalLoad;
  if (usePerf.getState().high === high) return;
  usePerf.setState({ high });
  document.documentElement.dataset.load = high ? 'high' : 'normal';
}

/** Desktop app: a live stream/game also counts as high load (keeps the GPU for the game/encoder). */
export function setExternalLoad(on: boolean) {
  externalLoad = on;
  setHigh(usePerf.getState().high && !on ? streak >= 2 : on);
}

function sample() {
  if (document.hidden) return;
  const t: number[] = [];
  const tick = (now: number) => {
    t.push(now);
    if (t.length < 60 && !document.hidden) requestAnimationFrame(tick);
    else finish(t);
  };
  requestAnimationFrame(tick);
}

function finish(t: number[]) {
  if (t.length < 20) return;
  const d = t.slice(1).map((v, i) => v - t[i]!);
  const sorted = [...d].sort((a, b) => a - b);
  const base = sorted[Math.floor(sorted.length * 0.25)]!; // the display's frame time (robust to hiccups)
  const dropped = d.filter((x) => x > base * 1.5).length / d.length;
  usePerf.setState({ hz: Math.round(1000 / base), frameMs: +base.toFixed(2), droppedPct: Math.round(dropped * 100) });
  if (dropped >= 0.25) {
    streak++;
    calm = 0;
  } else {
    calm++;
    if (calm >= 2) streak = 0;
  }
  setHigh(streak >= 2 ? true : calm >= 2 ? false : usePerf.getState().high);
}

export function startPerfMonitor() {
  if (started || typeof window === 'undefined') return;
  started = true;
  document.documentElement.dataset.load = 'normal';
  setTimeout(sample, 2500);
  setInterval(sample, 20000);
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        latencies.push(e.duration);
        if (latencies.length > 60) latencies.shift();
      }
      const s = [...latencies].sort((a, b) => a - b);
      usePerf.setState({ inputP75: Math.round(s[Math.floor(s.length * 0.75)] ?? 0) });
    });
    po.observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  } catch {
    /* Event Timing not supported: latency stays "—" */
  }
}

// ---------- pause decorative animations that are off screen (one shared observer) ----------
let io: IntersectionObserver | null = null;
/**
 * Ref callback for animated decorations (.cz scenes): paused while scrolled out of view. Unobserves on unmount
 * (React calls the ref with null), so detached nodes are never kept alive.
 */
export function useOffscreenPause() {
  const cur = useRef<HTMLElement | null>(null);
  return useCallback((el: HTMLElement | null) => {
    if (cur.current && io) io.unobserve(cur.current);
    cur.current = el;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    io ??= new IntersectionObserver((entries) => {
      for (const e of entries) (e.target as HTMLElement).dataset.offscreen = String(!e.isIntersecting);
    });
    io.observe(el);
  }, []);
}
