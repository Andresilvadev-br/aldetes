import { create } from 'zustand';
import { desktop, type NowPlaying } from './desktop';

/** System "now playing" (desktop app only: Windows media sessions / Linux MPRIS). */
export const useMedia = create<{ np: NowPlaying | null }>()(() => ({ np: null }));

let installed = false;
export function installMediaBridge() {
  if (installed || !desktop?.onMedia) return;
  installed = true;
  void desktop.getMedia().then((np) => useMedia.setState({ np }));
  desktop.onMedia((np) => useMedia.setState({ np }));
}

export const mediaCommand = (cmd: 'toggle' | 'next' | 'prev') => desktop?.mediaCommand(cmd);

/** Current position, extrapolated from the last sample while playing. */
export function mediaPosition(np: NowPlaying, now = Date.now()) {
  if (np.positionMs === null || np.durationMs === null) return null;
  const p = np.playing ? np.positionMs + (now - np.sampledAt) : np.positionMs;
  return Math.min(np.durationMs, Math.max(0, p));
}

export const fmtMs = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
