import { create } from 'zustand';

export type AccentName = 'rosa' | 'roxo' | 'azul' | 'verde' | 'laranja' | 'vermelho';

/** Accent pairs (start → end of the gradient), as RGB triplets. */
export const ACCENTS: Record<AccentName, { label: string; a: [number, number, number]; b: [number, number, number] }> = {
  rosa: { label: 'Rosa', a: [255, 45, 120], b: [193, 60, 255] },
  roxo: { label: 'Roxo', a: [139, 92, 246], b: [192, 132, 252] },
  azul: { label: 'Azul', a: [14, 165, 233], b: [99, 102, 241] },
  verde: { label: 'Verde', a: [34, 197, 94], b: [16, 185, 129] },
  laranja: { label: 'Laranja', a: [249, 115, 22], b: [245, 158, 11] },
  vermelho: { label: 'Vermelho', a: [239, 68, 68], b: [244, 63, 94] },
};

export interface Prefs {
  theme: 'dark' | 'light' | 'system';
  fontSize: number;
  compact: boolean;
  reduceMotion: boolean;
  accent: AccentName;
  oled: boolean;
  motion: 'ultra' | 'balanced' | 'performance';
  uiSounds: boolean;
  cursorLight: boolean;
  desktopNotifications: boolean;
  notificationSounds: boolean;
  inputDeviceId: string;
  outputDeviceId: string;
  videoDeviceId: string;
  inputVolume: number; // 0..2
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  voiceMode: 'vad' | 'ptt';
  pttKey: string; // KeyboardEvent.code
  pttReleaseDelay: number;
  userVolumes: Record<string, number>; // userId -> 0..2
  localMutes: Record<string, boolean>;
  favorites: string[]; // channel ids
  streamQuality: '720p30' | '720p60' | '1080p30' | '1080p60';
}

const defaults: Prefs = {
  theme: 'dark',
  fontSize: 15,
  compact: false,
  reduceMotion: false,
  accent: 'rosa',
  oled: false,
  motion: 'ultra',
  uiSounds: true,
  cursorLight: true,
  desktopNotifications: true,
  notificationSounds: true,
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  videoDeviceId: '',
  inputVolume: 1,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  voiceMode: 'vad',
  pttKey: 'Backquote',
  pttReleaseDelay: 200,
  userVolumes: {},
  localMutes: {},
  favorites: [],
  streamQuality: '720p30',
};

const KEY = 'aldetes.prefs';
function load(): Prefs {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

export const usePrefs = create<Prefs>()(() => load());
export const getPrefs = usePrefs.getState;
export function setPrefs(p: Partial<Prefs>) {
  usePrefs.setState(p);
  try {
    localStorage.setItem(KEY, JSON.stringify(usePrefs.getState()));
  } catch {
    /* ignore */
  }
  applyAppearance();
}

export function applyAppearance() {
  const p = getPrefs();
  const root = document.documentElement;
  const theme = p.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : p.theme;
  root.dataset.theme = theme;
  root.dataset.oled = String(p.oled && theme === 'dark');
  root.dataset.reduceMotion = String(p.reduceMotion || p.motion === 'performance');
  root.dataset.motion = p.reduceMotion ? 'performance' : p.motion;
  const acc = ACCENTS[p.accent] ?? ACCENTS.rosa;
  const darker = acc.a.map((v) => Math.round(v * 0.85)).join(' ');
  root.style.setProperty('--brand', acc.a.join(' '));
  root.style.setProperty('--brand-2', acc.b.join(' '));
  root.style.setProperty('--brand-hover', darker);
  root.style.setProperty('--font-size', `${p.fontSize}px`);
  root.dataset.cursorLight = String(p.cursorLight);
}
