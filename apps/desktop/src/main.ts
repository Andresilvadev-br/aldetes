/**
 * Aldetes desktop — Electron main process.
 * Security model: contextIsolation + sandbox, no Node in the renderer, only a narrow preload bridge.
 * The web UI is served from a custom privileged scheme (app://aldetes) so it has a stable origin.
 */
import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  Menu,
  nativeImage,
  net,
  Notification,
  protocol,
  safeStorage,
  session,
  shell,
  Tray,
  globalShortcut,
} from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { autoUpdater } from 'electron-updater';
import { startPtt, stopPtt } from './ptt';

const DEV_URL = process.env.ALDETES_DEV_URL; // e.g. http://localhost:5173 during development
// Baked in at build time (tsup `define`): the official server, so downloaded installers work out of the box.
const DEFAULT_SERVER: string = process.env.ALDETES_DEFAULT_SERVER ?? '';
const APP_ORIGIN = 'app://aldetes';
const WEB_DIR = app.isPackaged ? join(process.resourcesPath, 'web') : join(__dirname, '../../web/dist');
const ICON = join(__dirname, '../build/icon.png');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// ---------- persisted config ----------
const userDir = app.getPath('userData');
mkdirSync(userDir, { recursive: true });
const cfgPath = join(userDir, 'config.json');
const tokenPath = join(userDir, 'session.bin');
type Cfg = { serverUrl?: string; bounds?: Electron.Rectangle; minimizeToTray?: boolean };
const readCfg = (): Cfg => {
  try {
    return JSON.parse(readFileSync(cfgPath, 'utf8'));
  } catch {
    return {};
  }
};
const writeCfg = (c: Cfg) => writeFileSync(cfgPath, JSON.stringify({ ...readCfg(), ...c }, null, 2));

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let pendingSource: { id: string; audio: boolean } | null = null;

const SYSTEM_AUDIO_SUPPORTED = process.platform === 'win32'; // Electron 'loopback' audio: Windows only (reliably)

function isSafeExternal(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function createWindow() {
  const cfg = readCfg();
  win = new BrowserWindow({
    width: cfg.bounds?.width ?? 1280,
    height: cfg.bounds?.height ?? 800,
    x: cfg.bounds?.x,
    y: cfg.bounds?.y,
    minWidth: 940,
    minHeight: 500,
    backgroundColor: '#18191f',
    title: 'Aldetes',
    icon: existsSync(ICON) ? ICON : undefined,
    autoHideMenuBar: true,
    show: false,
    // Frameless look: the web UI's top bar is the title bar; native window buttons are overlaid on Windows/Linux.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform !== 'darwin' ? { titleBarOverlay: { color: '#07070a', symbolColor: '#e4e4ec', height: 48 } } : { trafficLightPosition: { x: 18, y: 16 } }),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      backgroundThrottling: false, // keep voice/PTT responsive when minimized
    },
  });
  win.once('ready-to-show', () => win?.show());
  void win.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);

  // Navigation hardening: never navigate the app window away; open links in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternal(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith(APP_ORIGIN);
    if (!allowed) {
      e.preventDefault();
      if (isSafeExternal(url)) void shell.openExternal(url);
    }
  });

  const saveBounds = () => win && !win.isMinimized() && !win.isMaximized() && writeCfg({ bounds: win.getBounds() });
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('close', (e) => {
    if (!quitting && readCfg().minimizeToTray !== false && tray) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.on('closed', () => (win = null));
}

function setupSession() {
  const ses = session.defaultSession;
  // Only allow the permissions the app actually needs.
  const allowed = new Set(['media', 'display-capture', 'notifications', 'clipboard-sanitized-write', 'fullscreen', 'speaker-selection']);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  // Screen capture: the renderer first picks a source via our own picker (IPC), then calls getDisplayMedia().
  ses.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const chosen = sources.find((s) => s.id === pendingSource?.id) ?? null;
      if (!chosen) return callback({});
      callback({ video: chosen, audio: pendingSource?.audio && SYSTEM_AUDIO_SUPPORTED ? 'loopback' : undefined });
      pendingSource = null;
    },
    { useSystemPicker: false },
  );
}

function registerAppProtocol() {
  const base = normalize(WEB_DIR + sep);
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const file = normalize(join(WEB_DIR, rel));
    if (!file.startsWith(base)) return new Response('forbidden', { status: 403 });
    // SPA fallback (hash routing makes this rare, but keep deep links working)
    return net.fetch(pathToFileURL(existsSync(file) ? file : join(WEB_DIR, 'index.html')).toString());
  });
}

function createTray() {
  const img = existsSync(ICON) ? nativeImage.createFromPath(ICON).resize({ width: 18, height: 18 }) : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip('Aldetes');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Aldetes', click: () => (win ? win.show() : createWindow()) },
      { label: 'Silenciar/ativar microfone', click: () => win?.webContents.send('aldetes:shortcut', 'toggle-mute') },
      { label: 'Ensurdecer/desensurdecer', click: () => win?.webContents.send('aldetes:shortcut', 'toggle-deafen') },
      { type: 'separator' },
      {
        label: 'Sair',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', () => (win?.isVisible() ? win.focus() : win?.show()));
}

function registerIpc() {
  ipcMain.on('app:version', (e) => (e.returnValue = app.getVersion()));
  ipcMain.handle('config:getServerUrl', () => readCfg().serverUrl ?? (DEFAULT_SERVER || null));
  ipcMain.handle('config:setServerUrl', (_e, url: string) => {
    const u = new URL(url); // throws if invalid
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('URL inválida');
    writeCfg({ serverUrl: u.origin });
  });
  ipcMain.handle('token:get', () => {
    if (!existsSync(tokenPath)) return null;
    try {
      const buf = readFileSync(tokenPath);
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : null;
    } catch {
      return null;
    }
  });
  ipcMain.handle('token:set', (_e, token: string | null) => {
    if (!token) return writeFileSync(tokenPath, '');
    // Refuse to store the token in plain text if the OS keychain isn't available.
    if (!safeStorage.isEncryptionAvailable()) return;
    writeFileSync(tokenPath, safeStorage.encryptString(token), { mode: 0o600 });
  });
  ipcMain.handle('screen:sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
      kind: s.id.startsWith('screen:') ? 'screen' : 'window',
    }));
  });
  ipcMain.handle('screen:select', (_e, id: string, audio: boolean) => {
    pendingSource = { id, audio: !!audio };
  });
  ipcMain.on('notify', (_e, title: string, body: string, tag?: string) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: String(title).slice(0, 120), body: String(body).slice(0, 300), icon: existsSync(ICON) ? ICON : undefined, silent: true });
    n.on('click', () => {
      win?.show();
      win?.focus();
      if (tag) win?.webContents.send('aldetes:open-channel', tag);
    });
    n.show();
  });
  ipcMain.on('badge', (_e, count: number) => {
    app.setBadgeCount(Math.max(0, Math.floor(count)) || 0);
    if (process.platform === 'win32') win?.setOverlayIcon(null, '');
    win?.flashFrame(count > 0 && !win.isFocused());
  });
  ipcMain.handle('ptt:set', (_e, code: string | null) => {
    stopPtt();
    if (!code) return true;
    return startPtt(code, (down) => win?.webContents.send('aldetes:shortcut', down ? 'ptt-down' : 'ptt-up'));
  });
  ipcMain.handle('updates:check', async () => {
    if (!app.isPackaged) return { available: false, error: 'Atualizações só funcionam no app instalado.' };
    try {
      const r = await autoUpdater.checkForUpdates();
      const v = r?.updateInfo?.version;
      return { available: !!v && v !== app.getVersion(), version: v };
    } catch (err) {
      return { available: false, error: (err as Error).message };
    }
  });
}

// Single instance
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('app.aldetes.desktop');
    registerAppProtocol();
    setupSession();
    registerIpc();
    createWindow();
    createTray();
    globalShortcut.register('CommandOrControl+Shift+Alt+M', () => win?.webContents.send('aldetes:shortcut', 'toggle-mute'));
    globalShortcut.register('CommandOrControl+Shift+Alt+D', () => win?.webContents.send('aldetes:shortcut', 'toggle-deafen'));
    if (app.isPackaged) {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.checkForUpdates().catch(() => {});
    }
  });

  app.on('before-quit', () => (quitting = true));
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopPtt();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => (win ? win.show() : createWindow()));
}
