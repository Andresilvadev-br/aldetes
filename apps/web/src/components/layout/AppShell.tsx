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
import { LiveIsland } from '../island/LiveIsland';
import { useFloatingIslandSync } from '@/lib/islandSync';
import { AnimatePresence } from 'motion/react';

export function AppShell() {
  useFloatingIslandSync();
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
    <div className="flex h-full bg-bg-rail">
      <ServerRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onSearch={() => setSwitcher(true)} />
        <div className="flex min-h-0 flex-1 gap-2 pb-2 pr-2">
          <Routes>
            <Route path="/channels/@me/:channelId?" element={<HomeLayout />} />
            <Route path="/channels/:serverId/:channelId?" element={<ServerLayout />} />
            <Route path="/discover" element={<Sidebarred sidebar={<HomeSidebar />}><DiscoverPage /></Sidebarred>} />
            <Route path="*" element={<Navigate to="/channels/@me" replace />} />
          </Routes>
        </div>
      </div>
      <AnimatePresence>{switcher && <QuickSwitcher onClose={() => setSwitcher(false)} />}</AnimatePresence>
    </div>
  );
}

/** Top bar: search, the Live Island (center) and room for the native window controls on desktop. */
function TopBar({ onSearch }: { onSearch: () => void }) {
  const winControls = desktop && desktop.platform !== 'darwin';
  return (
    <div className="drag relative z-40 flex h-12 shrink-0 items-center gap-3 pr-2">
      <button
        onClick={onSearch}
        className="no-drag flex h-8 w-64 items-center gap-2 rounded-xl border border-line/[0.07] bg-line/[0.03] px-3 text-[13px] text-fg-faint transition-colors hover:border-line/15 hover:text-fg-muted"
      >
        <Icon name="search" size={15} />
        <span className="flex-1 text-left">Buscar ou ir para…</span>
        <span className="kbd">Ctrl K</span>
      </button>
      <div className="pointer-events-none absolute inset-x-0 top-1.5 flex justify-center">
        <div className="pointer-events-auto">
          <LiveIsland />
        </div>
      </div>
      <div className="flex-1" />
      {winControls && <div className="w-[138px] shrink-0" />}
    </div>
  );
}

function Sidebarred({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <div className="flex w-64 shrink-0 flex-col gap-2">
        <div className="panel min-h-0 flex-1 overflow-hidden">{sidebar}</div>
        <VoicePanel />
        <UserPanel />
      </div>
      <main className="panel haze relative flex min-w-0 flex-1 flex-col overflow-hidden bg-bg-main">{children}</main>
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
