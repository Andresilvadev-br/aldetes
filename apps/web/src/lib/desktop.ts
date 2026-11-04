/** Bridge exposed by the Electron preload script (undefined in the browser). */
export interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string; // data URL
  appIcon: string | null;
  kind: 'screen' | 'window';
}

export interface NowPlaying {
  title: string;
  artist: string;
  app: string;
  playing: boolean;
  positionMs: number | null;
  durationMs: number | null;
  sampledAt: number;
  art: string | null;
  canNext: boolean;
  canPrev: boolean;
}

/** What the main window tells the floating island to show (no auth/socket in the overlay). */
export interface IslandSnapshot {
  active: boolean;
  accent: { a: string; b: string };
  call: null | {
    name: string;
    server: string | null;
    connectedAt: number | null;
    state: string;
    selfMute: boolean;
    selfDeaf: boolean;
    screen: boolean;
    participants: Array<{ id: string; name: string; avatarUrl: string | null; color: string; speaking: boolean; muted: boolean }>;
  };
  ring: null | { id: string; name: string; avatarUrl: string | null; color: string; channelId: string };
}

export interface IslandCommand {
  type: 'mute' | 'deaf' | 'leave' | 'open' | 'accept' | 'decline' | 'media' | 'resetPos';
  arg?: string;
}

export interface DesktopSettings {
  autoStart: boolean;
  startHidden: boolean;
  minimizeToTray: boolean;
  floatingIsland: boolean;
}

export interface DesktopBridge {
  platform: 'win32' | 'darwin' | 'linux';
  version: string;
  getServerUrl(): Promise<string | null>;
  setServerUrl(url: string): Promise<void>;
  getToken(): Promise<string | null>;
  setToken(token: string | null): Promise<void>;
  getScreenSources(): Promise<DesktopSource[]>;
  /** Select which source the next getDisplayMedia() call should capture. */
  selectScreenSource(id: string, withAudio: boolean): Promise<void>;
  /** Whether system/loopback audio capture is supported on this OS. */
  supportsSystemAudio: boolean;
  notify(title: string, body: string, tag?: string): void;
  setBadge(count: number): void;
  onGlobalShortcut(cb: (name: string) => void): () => void;
  setPushToTalkKey(accelerator: string | null): Promise<boolean>;
  checkForUpdates(): Promise<{ available: boolean; version?: string; error?: string }>;
  onOpenChannel(cb: (channelId: string) => void): () => void;
  getDesktopSettings(): Promise<DesktopSettings>;
  getMedia(): Promise<NowPlaying | null>;
  getGame(): Promise<{ name: string; startedAt: number } | null>;
  onGame(cb: (g: { name: string; startedAt: number } | null) => void): () => void;
  mediaCommand(cmd: 'toggle' | 'next' | 'prev'): void;
  onMedia(cb: (np: NowPlaying | null) => void): () => void;
  pushIslandState(state: IslandSnapshot): void;
  onIslandState(cb: (s: IslandSnapshot) => void): () => void;
  sendIslandCommand(cmd: IslandCommand): void;
  onIslandCommand(cb: (cmd: IslandCommand) => void): () => void;
  setIslandSize(w: number, h: number): void;
  /** While live: the main process raises the app's capture/encoder process priority (optional: older app versions lack it). */
  setStreaming?(on: boolean): void;
  setDesktopSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
}

declare global {
  interface Window {
    aldetesDesktop?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = typeof window !== 'undefined' ? window.aldetesDesktop : undefined;
export const isDesktop = !!desktop;
