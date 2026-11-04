/**
 * Live avatars: one shared requestAnimationFrame loop drives every speaking ring on screen.
 * It reads the REAL signal LiveKit already gives us (isSpeaking + audioLevel) — the animation never
 * invents activity — then smooths it (fast attack, slow release + hysteresis) so the ring breathes
 * instead of flashing on every peak. Only transform/opacity are written (compositor-only, no React
 * re-render). The loop sleeps when the tab is hidden, when nothing is registered, and in reduced motion
 * the ring just switches on/off.
 */
import { getParticipant } from './voice';
import { getPrefs } from './prefs';

interface Entry {
  identity: string;
  ring: HTMLElement;
  v: number;
  on: boolean;
}
const entries = new Set<Entry>();
let raf = 0;

const reduced = () => getPrefs().reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function frame() {
  raf = 0;
  if (!entries.size || document.hidden) return;
  const calm = reduced();
  for (const e of entries) {
    const p = getParticipant(e.identity);
    const talking = !!p && p.isMicrophoneEnabled && p.isSpeaking;
    const target = talking ? Math.min(1, 0.35 + (p!.audioLevel ?? 0) * 2.4) : 0;
    e.v += (target - e.v) * (target > e.v ? 0.3 : 0.07);
    // hysteresis: turn on above 0.12, off below 0.04 → no flicker around the threshold
    if (!e.on && e.v > 0.12) e.on = true;
    else if (e.on && e.v < 0.04) e.on = false;
    if (calm) {
      e.ring.style.opacity = talking ? '1' : '0';
      e.ring.style.transform = '';
    } else {
      e.ring.style.opacity = e.on ? String(Math.min(1, 0.45 + e.v * 0.55)) : '0';
      e.ring.style.transform = `scale(${(1 + e.v * 0.1).toFixed(3)})`;
    }
  }
  raf = requestAnimationFrame(frame);
}

function wake() {
  if (!raf && entries.size && !document.hidden) raf = requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', wake);

export function trackVoiceLevel(identity: string, ring: HTMLElement) {
  const e: Entry = { identity, ring, v: 0, on: false };
  ring.style.opacity = '0';
  entries.add(e);
  wake();
  return () => {
    entries.delete(e);
  };
}
