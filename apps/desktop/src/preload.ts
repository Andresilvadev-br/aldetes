import { contextBridge, ipcRenderer } from 'electron';

const supportsSystemAudio = process.platform === 'win32';

contextBridge.exposeInMainWorld('aldetesDesktop', {
  platform: process.platform,
  version: ipcRenderer.sendSync('app:version') as string,
  supportsSystemAudio,
  getServerUrl: () => ipcRenderer.invoke('config:getServerUrl'),
  setServerUrl: (url: string) => ipcRenderer.invoke('config:setServerUrl', url),
  getToken: () => ipcRenderer.invoke('token:get'),
  setToken: (t: string | null) => ipcRenderer.invoke('token:set', t),
  getScreenSources: () => ipcRenderer.invoke('screen:sources'),
  selectScreenSource: (id: string, withAudio: boolean) => ipcRenderer.invoke('screen:select', id, withAudio),
  notify: (title: string, body: string, tag?: string) => ipcRenderer.send('notify', title, body, tag),
  setBadge: (count: number) => ipcRenderer.send('badge', count),
  setPushToTalkKey: (code: string | null) => ipcRenderer.invoke('ptt:set', code),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  getUpdateState: () => ipcRenderer.invoke('updates:state'),
  downloadUpdate: (background: boolean) => ipcRenderer.send('updates:download', background === true),
  showUpdateProgress: () => ipcRenderer.send('updates:foreground'),
  installUpdate: () => ipcRenderer.send('updates:install'),
  onUpdate: (cb: (s: unknown) => void) => {
    const h = (_e: unknown, s: unknown) => cb(s);
    ipcRenderer.on('aldetes:update', h);
    return () => ipcRenderer.removeListener('aldetes:update', h);
  },
  getDesktopSettings: () => ipcRenderer.invoke('desktop:getSettings'),
  // now playing (system media sessions)
  getMedia: () => ipcRenderer.invoke('media:get'),
  mediaCommand: (cmd: string) => ipcRenderer.send('media:command', cmd),
  onMedia: (cb: (np: unknown) => void) => {
    const h = (_e: unknown, np: unknown) => cb(np);
    ipcRenderer.on('aldetes:media', h);
    return () => ipcRenderer.removeListener('aldetes:media', h);
  },
  // running game (process list)
  getGame: () => ipcRenderer.invoke('game:get'),
  onGame: (cb: (g: unknown) => void) => {
    const h = (_e: unknown, g: unknown) => cb(g);
    ipcRenderer.on('aldetes:game', h);
    return () => ipcRenderer.removeListener('aldetes:game', h);
  },
  // floating Live Island
  pushIslandState: (state: unknown) => ipcRenderer.send('island:state', state),
  onIslandState: (cb: (s: unknown) => void) => {
    const h = (_e: unknown, s: unknown) => cb(s);
    ipcRenderer.on('aldetes:island-state', h);
    return () => ipcRenderer.removeListener('aldetes:island-state', h);
  },
  sendIslandCommand: (cmd: { type: string; arg?: string }) => ipcRenderer.send('island:command', cmd),
  onIslandCommand: (cb: (cmd: { type: string; arg?: string }) => void) => {
    const h = (_e: unknown, c: { type: string; arg?: string }) => cb(c);
    ipcRenderer.on('aldetes:island-command', h);
    return () => ipcRenderer.removeListener('aldetes:island-command', h);
  },
  setIslandSize: (w: number, h: number) => ipcRenderer.send('island:size', w, h),
  setStreaming: (on: boolean) => ipcRenderer.send('stream:active', on === true),
  setDesktopSettings: (patch: Record<string, boolean>) => ipcRenderer.invoke('desktop:setSettings', patch),
  onGlobalShortcut: (cb: (name: string) => void) => {
    const h = (_e: unknown, name: string) => cb(name);
    ipcRenderer.on('aldetes:shortcut', h);
    return () => ipcRenderer.removeListener('aldetes:shortcut', h);
  },
  onOpenChannel: (cb: (channelId: string) => void) => {
    const h = (_e: unknown, id: string) => cb(id);
    ipcRenderer.on('aldetes:open-channel', h);
    return () => ipcRenderer.removeListener('aldetes:open-channel', h);
  },
});
