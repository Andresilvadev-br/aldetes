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

export type PulseModule = 'now' | 'quick' | 'continue' | 'spaces';

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
  introAnimation: boolean;
  /** 1.0: 'always' | only the first launch of each version | off. Old `introAnimation: false` maps to 'off'. */
  introMode?: 'always' | 'version' | 'off';
  introSeenVersion?: string;
  islandWidth: number;
  islandHover: boolean;
  shareGame: boolean;
  /** explicit opt-in for automatic detection (games/music). Off until the person turns it on. */
  activityConsent: boolean;
  /** screen share: also send a light version for weak connections */
  streamLite: boolean;
  /** pause all rich presence without losing the choices above */
  presencePaused: boolean;
  /** games the person never wants shown */
  ignoredGames: string[];
  /** live reactions in calls */
  reactionsEnabled: boolean;
  /** keep showing reactions over a stream in focus/full screen */
  reactionsOverStreams: boolean;
  /** last release whose "what's new" this device already showed, per user id */
  seenRelease: Record<string, string>;
  shareMusic: boolean;
  /** null = default spot (top center). Otherwise capsule center-x and top as fractions of the window. */
  islandPos: { fx: number; fy: number } | null;
  desktopNotifications: boolean;
  notificationSounds: boolean;
  inputDeviceId: string;
  outputDeviceId: string;
  /** names of the chosen devices, to say WHICH one went missing */
  inputDeviceLabel: string;
  outputDeviceLabel: string;
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
  /** Pulse home: order of the modules (reorderable, saved on this device) */
  pulseOrder: PulseModule[];
  /** DMs pinned to the top of the conversation list */
  pinnedDms: string[];
  /** conversation list filter */
  dmFilter: 'all' | 'unread' | 'pinned';
  /** column widths per user id (clamped on read) */
  panelWidths: Record<string, { side?: number; members?: number }>;
  /** Focus mode: hide side panels to give the chat/call all the room (connections stay up) */
  focusMode: boolean;
  /** server rail: folders (local) and servers pinned to the top */
  railFolders: Array<{ id: string; name: string; serverIds: string[]; open: boolean }>;
  /** let servers show animated banners/effects (Server Studio) */
  serverEffects: boolean;
  /** 2.0: call view per user+channel ('userId:channelId' → mode). Classic is the default (call-first). */
  callView: Record<string, 'classic' | 'spaces'>;
  /** 2.0 MultiView: per user id — tile places (fractions of the stage), pinned and minimized tiles */
  multiview: Record<string, { rects: Record<string, { x: number; y: number; w: number; h: number }>; pinned: string[]; minimized: string[] }>;
  /** volume of each person's STREAM audio (separate from their voice) */
  streamVolumes: Record<string, number>;
  /** 2.0 Worlds: servers shown with the default look for ME only ("Usar aparência padrão") */
  plainServers: string[];
  /** chat density */
  density: 'cozy' | 'compact' | 'spacious';
  streamQuality: '720p30' | '720p60' | '720p120' | '1080p30' | '1080p60' | '1080p120' | '1440p30' | '1440p60' | '1440p120';
}

const defaults: Prefs = {
  theme: 'dark',
  fontSize: 15,
  compact: false,
  reduceMotion: false,
  accent: 'rosa',
  oled: false,
  motion: 'balanced', // Equilibrado is the default (people who already chose keep their choice)
  uiSounds: true,
  cursorLight: true,
  introAnimation: true,
  islandWidth: 420,
  islandHover: true,
  shareGame: true,
  activityConsent: false,
  streamLite: false,
  presencePaused: false,
  ignoredGames: [],
  reactionsEnabled: true,
  reactionsOverStreams: true,
  seenRelease: {},
  shareMusic: true,
  islandPos: null,
  desktopNotifications: true,
  notificationSounds: true,
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  inputDeviceLabel: '',
  outputDeviceLabel: '',
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
  pulseOrder: ['now', 'quick', 'continue', 'spaces'],
  pinnedDms: [],
  dmFilter: 'all',
  panelWidths: {},
  focusMode: false,
  railFolders: [],
  serverEffects: true,
  density: 'cozy',
  callView: {},
  plainServers: [],
  multiview: {},
  streamVolumes: {},
  streamQuality: '1080p60',
};

const KEY = 'aldetes.prefs';
/** Whether this device already had Aldetes preferences before this load (→ it's an update, not a first install). */
export const HAD_PREFS = (() => {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
})();
function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    // respect what the person already chose before 1.0
    if (raw.introMode === undefined) raw.introMode = raw.introAnimation === false ? 'off' : 'always';
    return { ...defaults, ...raw };
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
  // UltraMotion 4.0: Reduzido (reduceMotion) removes spatial transitions; Econômico (performance) keeps short
  // transitions and state feedback but drops decorative loops, blur and glows.
  root.dataset.reduceMotion = String(p.reduceMotion);
  root.dataset.motion = p.reduceMotion ? 'performance' : p.motion;
  const acc = ACCENTS[p.accent] ?? ACCENTS.rosa;
  const darker = acc.a.map((v) => Math.round(v * 0.85)).join(' ');
  root.style.setProperty('--brand', acc.a.join(' '));
  root.style.setProperty('--brand-2', acc.b.join(' '));
  root.style.setProperty('--brand-hover', darker);
  root.style.setProperty('--font-size', `${p.fontSize}px`);
  root.dataset.cursorLight = String(p.cursorLight);
  root.dataset.density = p.density;
}

/** Column width limits (px). Widths are saved per user and always clamped, so a bad value can't break the layout. */
export const PANEL_LIMITS = { side: { min: 220, max: 380, def: 272 }, members: { min: 200, max: 340, def: 240 } } as const;
export function panelWidth(userId: string | undefined, which: keyof typeof PANEL_LIMITS) {
  const l = PANEL_LIMITS[which];
  const v = userId ? getPrefs().panelWidths[userId]?.[which] : undefined;
  return Math.round(Math.min(l.max, Math.max(l.min, typeof v === 'number' && Number.isFinite(v) ? v : l.def)));
}
export function setPanelWidth(userId: string, which: keyof typeof PANEL_LIMITS, px: number) {
  const l = PANEL_LIMITS[which];
  const cur = getPrefs().panelWidths;
  setPrefs({ panelWidths: { ...cur, [userId]: { ...cur[userId], [which]: Math.round(Math.min(l.max, Math.max(l.min, px))) } } });
}

export function togglePinDm(id: string) {
  const cur = getPrefs().pinnedDms;
  setPrefs({ pinnedDms: cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur].slice(0, 12) });
}
