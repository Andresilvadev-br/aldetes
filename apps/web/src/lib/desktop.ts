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

/** Mirrors apps/desktop/src/updater.ts */
export type UpdateState =
  | { phase: 'idle'; current: string; checkedAt: number | null }
  | { phase: 'checking'; current: string }
  | { phase: 'available'; current: string; version: string; notes: string[]; date: string | null; sizeMB: number | null }
  | { phase: 'downloading'; current: string; version: string; percent: number; bytesPerSecond: number; transferred: number; total: number; background: boolean }
  | { phase: 'ready'; current: string; version: string; background: boolean }
  | { phase: 'installing'; current: string; version: string }
  | { phase: 'error'; current: string; message: string; version: string | null };

export interface DesktopSettings {
  autoStart: boolean;
  startHidden: boolean;
  minimizeToTray: boolean;
  floatingIsland: boolean;
  /** 1.0: keep the floating island above full-screen apps (absent on older apps) */
  islandOverFullscreen?: boolean;
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
  /** 1.0+: the PC sound of a stream excludes Aldetes's own audio (Windows 11+). undefined on older apps. */
  ownAudioExcluded?: boolean;
  notify(title: string, body: string, tag?: string): void;
  setBadge(count: number): void;
  onGlobalShortcut(cb: (name: string) => void): () => void;
  setPushToTalkKey(accelerator: string | null): Promise<boolean>;
  checkForUpdates(): Promise<{ available: boolean; version?: string; error?: string }>;
  /** New update flow (optional: app versions before 0.5 don't have it). */
  getUpdateState?(): Promise<UpdateState>;
  downloadUpdate?(background: boolean): void;
  showUpdateProgress?(): void;
  installUpdate?(): void;
  onUpdate?(cb: (s: UpdateState) => void): () => void;
  onOpenChannel(cb: (channelId: string) => void): () => void;
  getDesktopSettings(): Promise<DesktopSettings>;
  getMedia(): Promise<NowPlaying | null>;
  getGame(): Promise<{ name: string; startedAt: number } | null>;
  /** start/stop scanning for games (only with the person's consent) — optional on older app versions */
  setGameDetection?(on: boolean): void;
  onGame(cb: (g: { name: string; startedAt: number } | null) => void): () => void;
  mediaCommand(cmd: 'toggle' | 'next' | 'prev'): void;
  onMedia(cb: (np: NowPlaying | null) => void): () => void;
  pushIslandState(state: IslandSnapshot): void;
  onIslandState(cb: (s: IslandSnapshot) => void): () => void;
  sendIslandCommand(cmd: IslandCommand): void;
  onIslandCommand(cb: (cmd: IslandCommand) => void): () => void;
  setIslandSize(w: number, h: number): void;
  /** 1.0: drag the floating island by its surface (optional: older app versions use the grip) */
  islandDrag?(phase: 'press' | 'move' | 'end' | 'cancel'): void;
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
