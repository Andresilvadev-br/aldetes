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
