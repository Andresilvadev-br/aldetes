/** Bridge exposed by the Electron preload script (undefined in the browser). */
export interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string; // data URL
  appIcon: string | null;
  kind: 'screen' | 'window';
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
}

declare global {
  interface Window {
    aldetesDesktop?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = typeof window !== 'undefined' ? window.aldetesDesktop : undefined;
export const isDesktop = !!desktop;
