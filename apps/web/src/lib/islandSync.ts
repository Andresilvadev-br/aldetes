import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { desktop, type IslandSnapshot } from './desktop';
import { useStore, get, displayName } from '../store';
import { useVoice, toggleMute, toggleDeaf, leaveVoice, joinVoice } from './voice';
import { useIsland, dismissIsland } from './island';
import { useMedia } from './media';
import { colorFor } from '../components/common/Avatar';
import { dmName } from '../components/layout/HomeSidebar';

function snapshot(): IslandSnapshot {
  const st = get();
  const v = useVoice.getState();
  const np = useMedia.getState().np;
  const css = getComputedStyle(document.documentElement);
  const accent = { a: css.getPropertyValue('--brand').trim(), b: css.getPropertyValue('--brand-2').trim() };
  const inCall = !!v.channelId && v.state !== 'idle';
  const ch = v.channelId ? st.channels[v.channelId] : undefined;
  const call: IslandSnapshot['call'] = inCall
    ? {
        name: ch ? (ch.serverId ? ch.name : dmName(ch)) : 'Chamada',
        server: ch?.serverId ? (st.servers[ch.serverId]?.name ?? null) : null,
        connectedAt: v.connectedAt,
        state: v.state,
        selfMute: v.selfMute || v.selfDeaf,
        selfDeaf: v.selfDeaf,
        screen: v.screen,
        participants: Object.values(st.voiceStates)
          .filter((x) => x.channelId === v.channelId)
          .slice(0, 8)
          .map((x) => ({
            id: x.userId,
            name: displayName(x.userId, ch?.serverId),
            avatarUrl: st.users[x.userId]?.avatarUrl ?? null,
            color: colorFor(x.userId),
            speaking: !!v.speaking[x.userId],
            muted: x.selfMute || x.serverMute,
          })),
      }
    : null;
  const ringEv = useIsland.getState().events.find((e) => e.kind === 'ring');
  const ring: IslandSnapshot['ring'] = ringEv
    ? { id: ringEv.id, name: ringEv.title, avatarUrl: st.users[ringEv.userId!]?.avatarUrl ?? null, color: colorFor(ringEv.userId!), channelId: ringEv.channelId! }
    : null;
  return { active: !!call || !!ring || !!np, accent, call, ring };
}

/**
 * Desktop only: keeps the floating Live Island in sync with the app and executes the
 * commands pressed on it (mute, deafen, leave, accept/decline a call, open the app).
 */
export function useFloatingIslandSync() {
  const nav = useNavigate();
  useEffect(() => {
    if (!desktop?.pushIslandState) return;
    let last = '';
    let timer: ReturnType<typeof setTimeout> | null = null;
    const push = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const s = snapshot();
        const json = JSON.stringify(s);
        if (json !== last) {
          last = json;
          desktop!.pushIslandState(s);
        }
      }, 120);
    };
    const unsubs = [useVoice.subscribe(push), useStore.subscribe(push), useIsland.subscribe(push), useMedia.subscribe(push)];
    push();
    const offCmd = desktop.onIslandCommand(async (cmd) => {
      if (cmd.type === 'mute') await toggleMute();
      else if (cmd.type === 'deaf') await toggleDeaf();
      else if (cmd.type === 'leave') await leaveVoice();
      else if (cmd.type === 'decline' && cmd.arg) dismissIsland(cmd.arg);
      else if (cmd.type === 'accept' && cmd.arg) {
        const ev = useIsland.getState().events.find((e) => e.id === cmd.arg);
        if (ev?.channelId) {
          dismissIsland(ev.id);
          nav(`/channels/@me/${ev.channelId}`);
          await joinVoice(ev.channelId);
        }
      }
    });
    return () => {
      unsubs.forEach((u) => u());
      offCmd();
      if (timer) clearTimeout(timer);
    };
  }, [nav]);
}
