import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useStore, get } from '@/store';
import { ServerRail } from './ServerRail';
import { ChannelSidebar } from './ChannelSidebar';
import { HomeSidebar } from './HomeSidebar';
import { UserPanel } from './UserPanel';
import { VoicePanel } from '../voice/VoicePanel';
import { ChannelView } from '../chat/ChannelView';
import { FriendsPage } from '@/pages/Friends';
import { DiscoverPage } from '@/pages/Discover';
import { onGateway } from '@/lib/gateway';
import { joinVoice, setPtt, toggleDeaf, toggleMute, useVoice } from '@/lib/voice';
import { getPrefs, usePrefs } from '@/lib/prefs';
import { playSound } from '@/lib/sounds';
import { desktop } from '@/lib/desktop';
import { QuickSwitcher } from '../modals/QuickSwitcher';
import { Icon } from '../common/Icon';
import { toast } from '../common/overlay';
import { IncomingCall } from '../voice/IncomingCall';

export function AppShell() {
  const connection = useStore((s) => s.connection);
  const [switcher, setSwitcher] = useState(false);

  // Global keyboard shortcuts + push-to-talk
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const prefs = getPrefs();
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable="true"]');
      if (prefs.voiceMode === 'ptt' && e.code === prefs.pttKey && !e.repeat && (!typing || e.code.startsWith('F'))) {
        void setPtt(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSwitcher((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        void toggleMute();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        void toggleDeaf();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (getPrefs().voiceMode === 'ptt' && e.code === getPrefs().pttKey) void setPtt(false);
    };
    const blur = () => void setPtt(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    const offGlobal = desktop?.onGlobalShortcut((name) => {
      if (name === 'ptt-down') void setPtt(true);
      if (name === 'ptt-up') void setPtt(false);
      if (name === 'toggle-mute') void toggleMute();
      if (name === 'toggle-deafen') void toggleDeaf();
    });
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      offGlobal?.();
    };
  }, []);

  // Moderator moved us to another voice channel
  useEffect(
    () =>
      onGateway('voice:move', ({ channelId }: { channelId: string }) => {
        if (useVoice.getState().channelId) {
          toast('Você foi movido para outro canal de voz.');
          void joinVoice(channelId);
        }
      }),
    [],
  );

  // Desktop: global push-to-talk (works even when the window isn't focused)
  const voiceMode = usePrefs((p) => p.voiceMode);
  const pttKey = usePrefs((p) => p.pttKey);
  useEffect(() => {
    if (!desktop) return;
    desktop.setPushToTalkKey(voiceMode === 'ptt' ? pttKey : null).then((ok) => {
      if (voiceMode === 'ptt' && !ok) toast('Aperte-para-falar global indisponível para essa tecla; funcionará só com a janela em foco.');
    });
  }, [voiceMode, pttKey]);

  // Desktop: clicking a notification opens the channel
  const nav = useNavigate();
  useEffect(
    () =>
      desktop?.onOpenChannel((channelId) => {
        const c = get().channels[channelId];
        if (c) nav(c.serverId ? `/channels/${c.serverId}/${c.id}` : `/channels/@me/${c.id}`);
      }),
    [nav],
  );

  // Unread badge on the desktop app icon
  const mentionTotal = useStore((s) => Object.values(s.readStates).reduce((a, r) => a + r.mentionCount, 0));
  useEffect(() => {
    desktop?.setBadge(mentionTotal);
    document.title = mentionTotal ? `(${mentionTotal}) Aldetes` : 'Aldetes';
  }, [mentionTotal]);

  return (
    <div className="flex h-full flex-col">
      {connection !== 'connected' && (
        <div className="flex items-center justify-center gap-2 bg-warn py-1 text-sm font-medium text-black">
          <Icon name="wifiOff" size={16} /> Reconectando ao Aldetes…
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <ServerRail />
        <Routes>
          <Route path="/channels/@me/:channelId?" element={<HomeLayout />} />
          <Route path="/channels/:serverId/:channelId?" element={<ServerLayout />} />
          <Route path="/discover" element={<Sidebarred sidebar={<HomeSidebar />}><DiscoverPage /></Sidebarred>} />
          <Route path="*" element={<Navigate to="/channels/@me" replace />} />
        </Routes>
      </div>
      {switcher && <QuickSwitcher onClose={() => setSwitcher(false)} />}
      <IncomingCall />
    </div>
  );
}

function Sidebarred({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <div className="flex w-60 shrink-0 flex-col bg-bg-side">
        <div className="min-h-0 flex-1">{sidebar}</div>
        <VoicePanel />
        <UserPanel />
      </div>
      <main className="flex min-w-0 flex-1 flex-col bg-bg-main">{children}</main>
    </>
  );
}

function HomeLayout() {
  const { channelId } = useParams();
  const exists = useStore((s) => (channelId ? !!s.channels[channelId] : true));
  if (!exists) return <Navigate to="/channels/@me" replace />;
  return <Sidebarred sidebar={<HomeSidebar />}>{channelId ? <ChannelView channelId={channelId} key={channelId} /> : <FriendsPage />}</Sidebarred>;
}

function ServerLayout() {
  const { serverId, channelId } = useParams();
  const server = useStore((s) => (serverId ? s.servers[serverId] : undefined));
  const channel = useStore((s) => (channelId ? s.channels[channelId] : undefined));
  const nav = useNavigate();
  useEffect(() => {
    if (!server) return;
    if (!channelId || !channel) {
      // pick last visited or first text channel
      let last: string | null = null;
      try {
        last = localStorage.getItem(`aldetes.last.${serverId}`);
      } catch {
        /* ignore */
      }
      const chans = Object.values(get().channels).filter((c) => c.serverId === serverId);
      const target =
        chans.find((c) => c.id === last && c.type !== 'category' && c.type !== 'voice') ??
        chans.filter((c) => c.type === 'text' || c.type === 'announcement').sort((a, b) => a.position - b.position)[0];
      if (target) nav(`/channels/${serverId}/${target.id}`, { replace: true });
    } else if (channel.type !== 'voice') {
      try {
        localStorage.setItem(`aldetes.last.${serverId}`, channelId);
      } catch {
        /* ignore */
      }
    }
  }, [server, serverId, channelId, channel, nav]);
  if (!server) return <Navigate to="/channels/@me" replace />;
  return <Sidebarred sidebar={<ChannelSidebar serverId={serverId!} />}>{channel ? <ChannelView channelId={channel.id} key={channel.id} /> : <EmptyServer />}</Sidebarred>;
}

function EmptyServer() {
  return <div className="flex flex-1 items-center justify-center text-fg-muted">Nenhum canal de texto disponível.</div>;
}

export { playSound };
