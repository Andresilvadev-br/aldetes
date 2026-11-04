import type { Activity } from '@aldetes/shared';
import { desktop } from './desktop';
import { useMedia } from './media';
import { getPrefs, usePrefs } from './prefs';
import { emit, onGateway } from './gateway';

/**
 * Rich presence: "Jogando X" (desktop game detection) or "Ouvindo Y" (system media).
 * A game wins over music. Re-sent on reconnect and refreshed every 5 minutes (server keeps it 10 min).
 */
let game: { name: string; startedAt: number } | null = null;
let musicStart: { key: string; at: number } | null = null;
let lastSent = '';

function compute(): Activity | null {
  const p = getPrefs();
  if (p.shareGame && game) return { type: 'playing', name: game.name, startedAt: game.startedAt };
  const np = useMedia.getState().np;
  if (p.shareMusic && np?.playing && np.title) {
    const key = `${np.title}|${np.artist}`;
    if (musicStart?.key !== key) musicStart = { key, at: Date.now() };
    return { type: 'listening', name: np.app || 'Música', details: [np.title, np.artist].filter(Boolean).join(' — ').slice(0, 128), startedAt: musicStart.at };
  }
  return null;
}

function send(force = false) {
  const a = compute();
  const json = JSON.stringify(a);
  if (!force && json === lastSent) return;
  lastSent = json;
  emit('presence:activity', a);
}

let installed = false;
export function installActivity() {
  if (installed) return;
  installed = true;
  if (desktop?.onGame) {
    void desktop.getGame().then((g) => {
      game = g;
      send();
    });
    desktop.onGame((g) => {
      game = g;
      send();
    });
  }
  useMedia.subscribe(() => send());
  usePrefs.subscribe(() => send());
  onGateway('ready', () => setTimeout(() => send(true), 500));
  setInterval(() => lastSent !== 'null' && send(true), 5 * 60_000);
}

export function activityLine(a: Activity | null | undefined): string | null {
  if (!a) return null;
  return a.type === 'playing' ? `Jogando ${a.name}` : `Ouvindo ${a.details || a.name}`;
}

export function elapsed(since: number, now = Date.now()) {
  const m = Math.floor((now - since) / 60000);
  if (m < 1) return 'agora mesmo';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return `há ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
