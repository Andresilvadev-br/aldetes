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
  screen,
} from 'electron';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { autoUpdater } from 'electron-updater';
import { startPtt, stopPtt } from './ptt';
import { MediaBridge, type MediaCommand, type NowPlaying } from './media';

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
type Cfg = {
  serverUrl?: string;
  bounds?: Electron.Rectangle;
  minimizeToTray?: boolean;
  autoStart?: boolean;
  startHidden?: boolean;
  floatingIsland?: boolean;
};
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

// ---------- floating Live Island (always-on-top capsule at the top of the screen) ----------
const ISLAND_W = 540;
const ISLAND_H = 300;
let islandWin: BrowserWindow | null = null;
let islandActive = false; // renderer says there is something worth showing (call, music, ring)
const media = new MediaBridge((np: NowPlaying | null) => {
  win?.webContents.send('aldetes:media', np);
  islandWin?.webContents.send('aldetes:media', np);
});

function appUrl(hash = '') {
  return (DEV_URL ?? `${APP_ORIGIN}/index.html`) + hash;
}

function createIslandWindow() {
  islandWin = new BrowserWindow({
    width: ISLAND_W,
    height: ISLAND_H,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  islandWin.setAlwaysOnTop(true, 'screen-saver');
  islandWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  islandWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  islandWin.webContents.on('will-navigate', (e) => e.preventDefault());
  void islandWin.loadURL(appUrl('#/island-overlay'));
  islandWin.on('closed', () => (islandWin = null));
}

// The overlay window always hugs the capsule (no invisible area blocking clicks), centered at the top.
let islandSize = { w: 260, h: 48 };
let shrinkTimer: ReturnType<typeof setTimeout> | null = null;
function positionIsland() {
  if (!islandWin) return;
  const d = win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  const w = Math.min(ISLAND_W + 40, Math.max(120, islandSize.w));
  const h = Math.min(ISLAND_H, Math.max(36, islandSize.h));
  islandWin.setBounds({ x: Math.round(d.workArea.x + (d.workArea.width - w) / 2), y: d.workArea.y + 6, width: w, height: h });
}
function resizeIsland(w: number, h: number) {
  const grow = w >= islandSize.w && h >= islandSize.h;
  islandSize = { w: Math.ceil(w), h: Math.ceil(h) };
  if (shrinkTimer) clearTimeout(shrinkTimer);
  // grow immediately; shrink after the collapse animation so it isn't clipped
  if (grow) positionIsland();
  else shrinkTimer = setTimeout(positionIsland, 380);
}

function updateIslandVisibility() {
  if (!islandWin) return;
  const mainAway = !win || !win.isVisible() || win.isMinimized() || !win.isFocused();
  const show = desktopSettings().floatingIsland && islandActive && mainAway;
  if (show && !islandWin.isVisible()) {
    positionIsland();
    islandWin.showInactive(); // never steals focus from the game/app in use
  } else if (!show && islandWin.isVisible()) islandWin.hide();
}

const SYSTEM_AUDIO_SUPPORTED = process.platform === 'win32'; // Electron 'loopback' audio: Windows only (reliably)

// ---------- start with the system ----------
const launchedHidden = process.argv.includes('--hidden');

function linuxAutostartFile() {
  return join(app.getPath('home'), '.config', 'autostart', 'aldetes.desktop');
}

/** Windows/macOS: login item. Linux: XDG autostart entry (AppImage path when packaged as AppImage). */
function applyAutoStart(enabled: boolean, hidden: boolean) {
  if (!app.isPackaged) return;
  if (process.platform === 'linux') {
    const file = linuxAutostartFile();
    if (!enabled) {
      if (existsSync(file)) rmSync(file);
      return;
    }
    const exec = process.env.APPIMAGE ?? process.execPath;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Aldetes\nExec="${exec}"${hidden ? ' --hidden' : ''}\nX-GNOME-Autostart-enabled=true\n`);
    return;
  }
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: hidden, args: hidden ? ['--hidden'] : [] });
}

function desktopSettings() {
  const c = readCfg();
  return {
    autoStart: c.autoStart ?? true, // like other chat apps: on by default
    startHidden: c.startHidden ?? true,
    minimizeToTray: c.minimizeToTray ?? true,
    floatingIsland: c.floatingIsland ?? true,
  };
}

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
  win.once('ready-to-show', () => {
    if (!launchedHidden) win?.show();
  });
  void win.loadURL(appUrl());

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
    if (!quitting && desktopSettings().minimizeToTray && tray) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.on('closed', () => (win = null));
  for (const ev of ['focus', 'blur', 'minimize', 'restore', 'hide', 'show'] as const) win.on(ev as 'focus', () => setTimeout(updateIslandVisibility, 60));
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
  // Session token: encrypted with the OS keychain (DPAPI on Windows, Keychain on macOS, libsecret on Linux).
  // Linux without any keyring: fall back to a file readable only by the user (0600), like most Linux apps.
  const plainPath = join(userDir, 'session.txt');
  ipcMain.handle('token:get', () => {
    try {
      if (existsSync(tokenPath) && safeStorage.isEncryptionAvailable()) {
        const buf = readFileSync(tokenPath);
        if (buf.length) return safeStorage.decryptString(buf);
      }
      if (process.platform === 'linux' && existsSync(plainPath)) return readFileSync(plainPath, 'utf8').trim() || null;
    } catch {
      /* corrupted / different user */
    }
    return null;
  });
  ipcMain.handle('token:set', (_e, token: string | null) => {
    if (!token) {
      writeFileSync(tokenPath, '');
      if (existsSync(plainPath)) rmSync(plainPath);
      return;
    }
    if (safeStorage.isEncryptionAvailable()) writeFileSync(tokenPath, safeStorage.encryptString(token), { mode: 0o600 });
    else if (process.platform === 'linux') writeFileSync(plainPath, token, { mode: 0o600 });
  });
  // Live Island plumbing: main window → overlay (state), overlay → main window (commands)
  ipcMain.on('island:state', (e, state: { active: boolean } & Record<string, unknown>) => {
    if (e.sender !== win?.webContents) return;
    islandActive = !!state?.active;
    islandWin?.webContents.send('aldetes:island-state', state);
    updateIslandVisibility();
  });
  ipcMain.on('island:command', (e, cmd: { type: string; arg?: string }) => {
    if (e.sender !== islandWin?.webContents) return;
    if (cmd.type === 'open') {
      win?.show();
      win?.focus();
      if (cmd.arg) win?.webContents.send('aldetes:open-channel', cmd.arg);
      return;
    }
    if (cmd.type === 'media' && cmd.arg) return media.command(cmd.arg as MediaCommand);
    win?.webContents.send('aldetes:island-command', cmd);
  });
  ipcMain.on('island:size', (e, w: number, h: number) => {
    if (e.sender !== islandWin?.webContents || !Number.isFinite(w) || !Number.isFinite(h)) return;
    resizeIsland(w, h);
  });
  ipcMain.handle('media:get', () => media.current());
  ipcMain.on('media:command', (_e, cmd: MediaCommand) => {
    if (['toggle', 'next', 'prev'].includes(cmd)) media.command(cmd);
  });
  ipcMain.handle('desktop:getSettings', () => desktopSettings());
  ipcMain.handle('desktop:setSettings', (_e, patch: Partial<ReturnType<typeof desktopSettings>>) => {
    const next = { ...desktopSettings(), ...patch };
    writeCfg(next);
    applyAutoStart(next.autoStart, next.startHidden);
    updateIslandVisibility();
    return next;
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
    createIslandWindow();
    media.start();
    screen.on('display-metrics-changed', positionIsland);
    const ds = desktopSettings();
    applyAutoStart(ds.autoStart, ds.startHidden);
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
    media.stop();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => (win ? win.show() : createWindow()));
}
