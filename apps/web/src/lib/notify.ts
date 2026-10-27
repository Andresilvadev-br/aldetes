import type { Message } from '@aldetes/shared';
import { desktop } from './desktop';
import { get, displayName } from '../store';
import { getPrefs } from './prefs';
import { playSound } from './sounds';

let activeChannelId: string | null = null;
export const setActiveChannel = (id: string | null) => {
  activeChannelId = id;
};
export const getActiveChannel = () => activeChannelId;

export function notifyMessage(m: Message) {
  const st = get();
  const me = st.me;
  if (!me || m.author.id === me.id || m.type !== 'default') return;
  if (st.presences[me.id]?.status === 'dnd') return;
  const c = st.channels[m.channelId];
  if (!c) return;
  const prefs = getPrefs();
  const isDm = !c.serverId;
  const mentioned =
    m.mentions.includes(me.id) || m.mentionEveryone || (c.serverId ? m.mentionRoles.some((r) => st.members[c.serverId!]?.[me.id]?.roleIds.includes(r)) : false);
  if (!isDm && !mentioned) return;
  const focused = document.hasFocus() && activeChannelId === m.channelId;
  if (focused) return;
  if (prefs.notificationSounds) playSound('message');
  if (!prefs.desktopNotifications) return;
  const title = isDm ? displayName(m.author.id) : `${displayName(m.author.id, c.serverId)} (#${c.name}, ${st.servers[c.serverId!]?.name ?? ''})`;
  const body = m.content.replace(/<@!?(\d+)>/g, (_, id) => '@' + displayName(id, c.serverId)).slice(0, 180) || '📎 Anexo';
  if (desktop) desktop.notify(title, body, m.channelId);
  else if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(title, { body, tag: m.channelId, icon: m.author.avatarUrl ?? undefined });
    n.onclick = () => {
      window.focus();
      window.location.hash = c.serverId ? `#/channels/${c.serverId}/${c.id}` : `#/channels/@me/${c.id}`;
    };
  }
}

export async function requestNotificationPermission() {
  if (desktop || !('Notification' in window)) return true;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}
