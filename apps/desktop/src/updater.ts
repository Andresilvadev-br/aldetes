/**
 * Update flow (main process): check → ask the user → download with live progress → restart into the new version.
 *
 * Nothing downloads behind the user's back unless they pick "Depois" (then it downloads quietly and installs
 * the next time the app closes). The renderer only *asks*; every action happens here.
 */
import { app, type BrowserWindow } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';

export type UpdateState =
  | { phase: 'idle'; current: string; checkedAt: number | null }
  | { phase: 'checking'; current: string }
  | { phase: 'available'; current: string; version: string; notes: string[]; date: string | null; sizeMB: number | null }
  | { phase: 'downloading'; current: string; version: string; percent: number; bytesPerSecond: number; transferred: number; total: number; background: boolean }
  | { phase: 'ready'; current: string; version: string; background: boolean }
  | { phase: 'installing'; current: string; version: string }
  | { phase: 'error'; current: string; message: string; version: string | null };

const CHECK_EVERY_MS = 30 * 60 * 1000;

/** GitHub release bodies arrive as HTML; turn them into short plain lines for the popup. */
function notesOf(info: UpdateInfo): string[] {
  const raw = info.releaseNotes;
  const text = Array.isArray(raw) ? raw.map((n) => n.note ?? '').join('\n') : (raw ?? '');
  return text
    .replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

export class Updater {
  private state: UpdateState = { phase: 'idle', current: app.getVersion(), checkedAt: null };
  private timer: ReturnType<typeof setInterval> | null = null;
  private version: string | null = null;

  constructor(
    private getWindow: () => BrowserWindow | null,
    /** called right before quitting to install (lets the app skip "minimize to tray" etc.) */
    private beforeQuit: () => void,
  ) {}

  get enabled() {
    return app.isPackaged || process.env.ALDETES_UPDATE_TEST === '1';
  }

  getState() {
    return this.state;
  }

  private set(s: UpdateState) {
    this.state = s;
    const w = this.getWindow();
    if (w && !w.isDestroyed()) w.webContents.send('aldetes:update', s);
  }

  start() {
    if (!this.enabled) return;
    if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true; // tests: dev-app-update.yml next to the app
    autoUpdater.autoDownload = false; // ask first
    autoUpdater.autoInstallOnAppQuit = true; // "Depois" → installs when the app closes
    autoUpdater.allowDowngrade = false;
    const cur = () => app.getVersion();

    autoUpdater.on('checking-for-update', () => {
      if (this.state.phase === 'idle' || this.state.phase === 'error') this.set({ phase: 'checking', current: cur() });
    });
    autoUpdater.on('update-not-available', () => this.set({ phase: 'idle', current: cur(), checkedAt: Date.now() }));
    autoUpdater.on('update-available', (info) => {
      this.version = info.version;
      // Already downloading/ready in the background: don't interrupt with the popup again.
      if (this.state.phase === 'downloading' || this.state.phase === 'ready' || this.state.phase === 'installing') return;
      const bytes = info.files?.[0]?.size;
      this.set({ phase: 'available', current: cur(), version: info.version, notes: notesOf(info), date: info.releaseDate ?? null, sizeMB: bytes ? Math.round(bytes / 1048576) : null });
    });
    autoUpdater.on('download-progress', (p: ProgressInfo) => {
      const background = this.state.phase === 'downloading' ? this.state.background : false;
      this.set({ phase: 'downloading', current: cur(), version: this.version ?? '', percent: p.percent, bytesPerSecond: p.bytesPerSecond, transferred: p.transferred, total: p.total, background });
    });
    autoUpdater.on('update-downloaded', (info) => {
      const background = this.state.phase === 'downloading' && this.state.background;
      this.set({ phase: 'ready', current: cur(), version: info.version, background });
      // Foreground update: the renderer shows a short countdown, then calls install().
    });
    autoUpdater.on('error', (err) => {
      // Background check failures (offline etc.) are silent; only report errors of an update the user asked for.
      if (this.state.phase === 'checking' || this.state.phase === 'idle') return this.set({ phase: 'idle', current: cur(), checkedAt: Date.now() });
      this.set({ phase: 'error', current: cur(), message: err?.message?.split('\n')[0] ?? 'Falha ao atualizar', version: this.version });
    });

    setTimeout(() => void this.check(), 5000);
    this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async check(): Promise<{ available: boolean; version?: string; error?: string }> {
    if (!this.enabled) return { available: false, error: 'Atualizações só funcionam no app instalado.' };
    if (this.state.phase === 'downloading' || this.state.phase === 'installing') return { available: true, version: this.version ?? undefined };
    try {
      const r = await autoUpdater.checkForUpdates();
      const v = r?.updateInfo?.version;
      const available = !!v && r?.isUpdateAvailable !== false && v !== app.getVersion();
      return { available, version: v };
    } catch (err) {
      return { available: false, error: (err as Error).message.split('\n')[0] };
    }
  }

  /** "Atualizar agora" (background=false) or "Depois" (background=true: quiet download, install on quit). */
  async download(background: boolean) {
    if (this.state.phase === 'ready') return background ? undefined : this.install();
    if (this.state.phase === 'downloading') {
      this.set({ ...this.state, background });
      return;
    }
    const version = this.version ?? '';
    this.set({ phase: 'downloading', current: app.getVersion(), version, percent: 0, bytesPerSecond: 0, transferred: 0, total: 0, background });
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      this.set({ phase: 'error', current: app.getVersion(), message: (err as Error).message.split('\n')[0], version });
    }
  }

  /** Bring a background download back to the full-screen view. */
  foreground() {
    if (this.state.phase === 'downloading' || this.state.phase === 'ready') this.set({ ...this.state, background: false });
  }

  install() {
    if (this.state.phase !== 'ready') return;
    this.set({ phase: 'installing', current: app.getVersion(), version: this.state.version });
    if (process.env.ALDETES_UPDATE_TEST === '1') return; // tests stop here: never replace the running binary
    this.beforeQuit();
    // Windows: silent NSIS install, then relaunch. Linux AppImage: swaps the file and relaunches.
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 400);
  }
}
