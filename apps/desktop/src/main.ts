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
import { constants as osConstants, setPriority, release } from 'node:os';
import { Updater } from './updater';
import { startPtt, stopPtt } from './ptt';
import { MediaBridge, type MediaCommand, type NowPlaying } from './media';
import { GameDetector, type GameActivity } from './games';

const DEV_URL = process.env.ALDETES_DEV_URL; // e.g. http://localhost:5173 during development
// Baked in at build time (tsup `define`): the official server, so downloaded installers work out of the box.
const DEFAULT_SERVER: string = process.env.ALDETES_DEFAULT_SERVER ?? '';
const APP_ORIGIN = 'app://aldetes';
const WEB_DIR = app.isPackaged ? join(process.resourcesPath, 'web') : join(__dirname, '../../web/dist');
const ICON = join(__dirname, '../build/icon.png');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// ---------- streaming performance ----------
// When you stream a game, Aldetes sits behind it. By default Chromium treats hidden/occluded windows as
// "background" and throttles them — which shows up as the stream's FPS dropping. Keep it at full speed.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// Windows: occlusion tracking marks the app as hidden under a fullscreen game (and throttles it).
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
// Laptops with two GPUs: use the dedicated one (its hardware video encoder is much faster).
app.commandLine.appendSwitch('force_high_performance_gpu');

/** While live, raise the priority of the processes that capture and encode the stream (GPU, renderer, utilities). */
let streaming = false;
function applyStreamPriority(on: boolean) {
  if (on === streaming) return;
  streaming = on;
  const prio = on ? osConstants.priority.PRIORITY_ABOVE_NORMAL : osConstants.priority.PRIORITY_NORMAL;
  for (const m of app.getAppMetrics()) {
    if (m.type !== 'GPU' && m.type !== 'Tab' && m.type !== 'Utility' && m.type !== 'Browser') continue;
    try {
      setPriority(m.pid, prio);
    } catch {
      /* Linux/macOS need extra privileges to raise priority; nothing to do */
    }
  }
}

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
  /**
   * floating island position. 1.0: fractions of the display's work area (capsule center-x, top) + the display's id,
   * scale and size when it was saved, so it survives DPI/resolution changes and falls back when a monitor is gone.
   * 0.x saved { cx, y, displayId } in pixels — still read (converted on the fly).
   */
  islandPos?: { fx: number; fy: number; displayId: number; scale?: number; waW?: number; waH?: number } | { cx: number; y: number; displayId: number } | null;
  /** keep the island above full-screen apps/games (off = normal always-on-top, hidden over exclusive full screen) */
  islandOverFullscreen?: boolean;
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
const updater = new Updater(
  () => win,
  () => {
    quitting = true;
  },
);
let tray: Tray | null = null;
let quitting = false;
let pendingSource: { id: string; audio: boolean } | null = null;

// ---------- floating Live Island 2.0 (always-on-top capsule, free to move) ----------
// The window ALWAYS hugs the visible capsule (never an invisible area catching clicks), is not focusable (clicking it
// never takes focus from the game), can be dragged by its surface, snaps magnetically to the top-center/corners/edges,
// and its place is remembered per monitor as fractions of the work area (DPI/resolution safe, recovers if unplugged).
const ISLAND_W = 680;
const ISLAND_H = 320;
const SNAP_PX = 28;
let islandWin: BrowserWindow | null = null;
let islandActive = false; // renderer says there is something worth showing (call, music, ring)
const media = new MediaBridge((np: NowPlaying | null) => {
  win?.webContents.send('aldetes:media', np);
  islandWin?.webContents.send('aldetes:media', np);
});

const games = new GameDetector((g: GameActivity | null) => win?.webContents.send('aldetes:game', g));

function appUrl(hash = '') {
  return (DEV_URL ?? `${APP_ORIGIN}/index.html`) + hash;
}

function applyIslandLevel() {
  if (!islandWin) return;
  const over = readCfg().islandOverFullscreen ?? true;
  islandWin.setAlwaysOnTop(true, over ? 'screen-saver' : 'floating');
  islandWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: over });
}

function createIslandWindow() {
  islandWin = new BrowserWindow({
    width: 260,
    height: 48,
    frame: false,
    transparent: true,
    resizable: false, // size is driven by the capsule (presets + manual grip), clamped to the work area below
    movable: true,
    focusable: false, // WS_EX_NOACTIVATE on Windows: clicks work, the game keeps focus
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
  applyIslandLevel();
  islandWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  islandWin.webContents.on('will-navigate', (e) => e.preventDefault());
  void islandWin.loadURL(appUrl('#/island-overlay'));
  islandWin.on('closed', () => (islandWin = null));
  // monitors plugged/unplugged, resolution or DPI changed → put the island back in a valid place
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed'] as const) screen.on(ev as 'display-added', () => setTimeout(positionIsland, 120));
}

let islandSize = { w: 260, h: 48 };
let shrinkTimer: ReturnType<typeof setTimeout> | null = null;
let dragging: { cursor: Electron.Point; bounds: Electron.Rectangle } | null = null;

/** Saved spot → display + absolute top-left for a capsule of size w×h (clamped to that display's work area). */
function islandTarget(w: number, h: number) {
  const saved = readCfg().islandPos;
  const fallback = win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  const disp = (saved && screen.getAllDisplays().find((x) => x.id === saved.displayId)) || fallback;
  const wa = disp.workArea;
  let fx = 0.5;
  let fy = 0;
  if (saved && 'fx' in saved) {
    fx = saved.fx;
    fy = saved.fy;
  } else if (saved && 'cx' in saved) {
    fx = saved.cx / wa.width; // 0.x pixel format
    fy = saved.y / wa.height;
  }
  const cx = wa.x + fx * wa.width;
  const top = saved ? wa.y + fy * wa.height : wa.y + 6;
  return {
    disp,
    x: Math.round(Math.min(wa.x + wa.width - w, Math.max(wa.x, cx - w / 2))),
    y: Math.round(Math.min(wa.y + wa.height - h, Math.max(wa.y, top))),
  };
}

function positionIsland() {
  if (!islandWin) return;
  const wa0 = (win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay()).workArea;
  const w = Math.min(ISLAND_W + 40, wa0.width, Math.max(120, islandSize.w));
  const h = Math.min(ISLAND_H, wa0.height, Math.max(36, islandSize.h));
  if (dragging) {
    // mid-drag: only the size follows the capsule, the place stays under the cursor
    const b = islandWin.getBounds();
    return islandWin.setBounds({ x: b.x, y: b.y, width: w, height: h });
  }
  const t = islandTarget(w, h);
  islandWin.setBounds({ x: t.x, y: t.y, width: w, height: h });
}

function saveIslandPos(b: Electron.Rectangle) {
  const disp = screen.getDisplayMatching(b);
  const wa = disp.workArea;
  writeCfg({ islandPos: { fx: (b.x + b.width / 2 - wa.x) / wa.width, fy: (b.y - wa.y) / wa.height, displayId: disp.id, scale: disp.scaleFactor, waW: wa.width, waH: wa.height } });
}

/** Magnetic snap: top-center, corners and edge midpoints of the display the capsule ends on. */
function snapIsland(b: Electron.Rectangle): Electron.Rectangle {
  const wa = screen.getDisplayMatching(b).workArea;
  const m = 6;
  const xs = { l: wa.x + m, c: Math.round(wa.x + (wa.width - b.width) / 2), r: wa.x + wa.width - b.width - m };
  const ys = { t: wa.y + m, b: wa.y + wa.height - b.height - m };
  let best: { x: number; y: number; d: number } | null = null;
  for (const x of Object.values(xs))
    for (const y of Object.values(ys)) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < SNAP_PX && (!best || d < best.d)) best = { x, y, d };
    }
  // edges only (keep the other coordinate)
  if (!best) {
    const nx = Math.abs(b.x - xs.l) < SNAP_PX ? xs.l : Math.abs(b.x - xs.r) < SNAP_PX ? xs.r : Math.abs(b.x - xs.c) < SNAP_PX ? xs.c : b.x;
    const ny = Math.abs(b.y - ys.t) < SNAP_PX ? ys.t : Math.abs(b.y - ys.b) < SNAP_PX ? ys.b : b.y;
    return { ...b, x: nx, y: ny };
  }
  return { ...b, x: best.x, y: best.y };
}

/**
 * press: remember the real cursor + bounds (nothing moves yet) · move: follow the cursor · end: snap + save ·
 * cancel: it was a click. Uses the window's CURRENT size, so a capsule that changes size mid-drag lands right.
 */
function islandDrag(phase: 'press' | 'move' | 'end' | 'cancel') {
  if (!islandWin) return;
  if (phase === 'press') {
    dragging = { cursor: screen.getCursorScreenPoint(), bounds: islandWin.getBounds() };
    return;
  }
  if (!dragging) return;
  if (phase === 'cancel') {
    dragging = null;
    return;
  }
  const c = screen.getCursorScreenPoint();
  const cur = islandWin.getBounds();
  // clamp to the work area of the monitor under the cursor (can move between monitors)
  const wa = screen.getDisplayNearestPoint(c).workArea;
  const x = Math.round(Math.min(wa.x + wa.width - cur.width, Math.max(wa.x, dragging.bounds.x + c.x - dragging.cursor.x)));
  const y = Math.round(Math.min(wa.y + wa.height - cur.height, Math.max(wa.y, dragging.bounds.y + c.y - dragging.cursor.y)));
  if (phase === 'move') return islandWin.setBounds({ x, y, width: cur.width, height: cur.height });
  dragging = null;
  const snapped = snapIsland({ x, y, width: cur.width, height: cur.height });
  islandWin.setBounds(snapped);
  saveIslandPos(snapped);
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
/**
 * Echo-free stream sound: since Electron 43.4/44, a getDisplayMedia request with `restrictOwnAudio` maps 'loopback' to
 * Chromium's "loopback without Chrome" device (Windows process loopback that EXCLUDES Aldetes's own process tree, so the
 * call's voices aren't sent back inside the stream). That Windows API exists from Windows 11 (build 22000) on; on
 * Windows 10 the system mix still contains the call, and the share dialog says so and starts with the sound off.
 */
const OWN_AUDIO_EXCLUDED = process.platform === 'win32' && Number(release().split('.')[2] ?? 0) >= 22000;

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
  app.setLoginItemSettings({ openAtLogin: enabled, args: hidden ? ['--hidden'] : [] });
}

function desktopSettings() {
  const c = readCfg();
  return {
    autoStart: c.autoStart ?? true, // like other chat apps: on by default
    startHidden: c.startHidden ?? true,
    minimizeToTray: c.minimizeToTray ?? true,
    floatingIsland: c.floatingIsland ?? true,
    islandOverFullscreen: c.islandOverFullscreen ?? true,
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
  ipcMain.on('app:ownAudioExcluded', (e) => (e.returnValue = OWN_AUDIO_EXCLUDED));
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
    if (cmd.type === 'resetPos') {
      // back to the top-center of the monitor the island is on now
      const disp = islandWin ? screen.getDisplayMatching(islandWin.getBounds()) : screen.getPrimaryDisplay();
      writeCfg({ islandPos: { fx: 0.5, fy: 6 / disp.workArea.height, displayId: disp.id, scale: disp.scaleFactor, waW: disp.workArea.width, waH: disp.workArea.height } });
      return positionIsland();
    }
    win?.webContents.send('aldetes:island-command', cmd);
  });
  ipcMain.on('stream:active', (e, on: unknown) => {
    if (e.sender !== win?.webContents) return;
    applyStreamPriority(on === true);
  });
  ipcMain.on('island:drag', (e, phase: unknown) => {
    if (e.sender !== islandWin?.webContents || (phase !== 'press' && phase !== 'move' && phase !== 'end' && phase !== 'cancel')) return;
    islandDrag(phase);
  });
  ipcMain.on('island:size', (e, w: number, h: number) => {
    if (e.sender !== islandWin?.webContents || !Number.isFinite(w) || !Number.isFinite(h)) return;
    resizeIsland(w, h);
  });
  ipcMain.handle('media:get', () => media.current());
  ipcMain.handle('game:get', () => games.get());
  // Game detection runs only after the person opts in (Configurações → Privacidade).
  let detecting = false;
  ipcMain.on('game:detect', (e, on: unknown) => {
    if (e.sender !== win?.webContents || (on === true) === detecting) return;
    detecting = on === true;
    if (detecting) games.start();
    else {
      games.stop();
      games.clear();
    }
  });
  ipcMain.on('media:command', (_e, cmd: MediaCommand) => {
    if (['toggle', 'next', 'prev'].includes(cmd)) media.command(cmd);
  });
  ipcMain.handle('desktop:getSettings', () => desktopSettings());
  ipcMain.handle('desktop:setSettings', (_e, patch: Partial<ReturnType<typeof desktopSettings>>) => {
    const next = { ...desktopSettings(), ...patch };
    writeCfg(next);
    applyAutoStart(next.autoStart, next.startHidden);
    applyIslandLevel();
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
  ipcMain.handle('updates:check', (e) => (e.sender === win?.webContents ? updater.check() : null));
  ipcMain.handle('updates:state', () => updater.getState());
  ipcMain.on('updates:download', (e, background: unknown) => e.sender === win?.webContents && void updater.download(background === true));
  ipcMain.on('updates:foreground', (e) => e.sender === win?.webContents && updater.foreground());
  ipcMain.on('updates:install', (e) => e.sender === win?.webContents && updater.install());
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
    updater.start();
  });

  app.on('before-quit', () => (quitting = true));
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopPtt();
    media.stop();
    games.stop();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => (win ? win.show() : createWindow()));
}
