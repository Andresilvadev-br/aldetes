import { create } from 'zustand';

export interface Prefs {
  theme: 'dark' | 'light' | 'system';
  fontSize: number;
  compact: boolean;
  reduceMotion: boolean;
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
  root.dataset.reduceMotion = String(p.reduceMotion);
  root.style.setProperty('--font-size', `${p.fontSize}px`);
}
