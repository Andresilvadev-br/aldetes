import clsx from 'clsx';
import { useEffect, useState, lazy, Suspense, useContext, useRef } from 'react';
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
import { useIsMobile, MobileContentVisible, isMobileNow } from '@/lib/mobile';
import { MobileShell } from '../mobile/MobileShell';
import { WhatsNew } from '../common/WhatsNew';
import { MiniPlayer } from '../voice/MiniPlayer';
import { joinVoice, setPtt, toggleDeaf, toggleMute, useVoice, sendReaction, REACTIONS } from '@/lib/voice';
import { getPrefs, usePrefs, setPrefs, panelWidth, setPanelWidth, PANEL_LIMITS } from '@/lib/prefs';
import { ResizeHandle } from './ResizeHandle';
import { playSound } from '@/lib/sounds';
import { desktop } from '@/lib/desktop';
import { QuickSwitcher } from '../modals/QuickSwitcher';
import { Icon } from '../common/Icon';
import { toast } from '../common/overlay';
import { LiveIsland } from '../island/LiveIsland';
import { useFloatingIslandSync } from '@/lib/islandSync';
import { useUi, closeSettings, openSwitcher } from '@/lib/ui';
const UserSettings = lazy(() => import('../settings/UserSettings').then((m) => ({ default: m.UserSettings })));
import { AnimatePresence, motion } from 'motion/react';

export function AppShell() {
  useFloatingIslandSync();
  const settingsTab = useUi((u) => u.settingsTab);
  const switcher = useUi((u) => u.switcher);
  const setSwitcher = (v: boolean | ((x: boolean) => boolean)) => openSwitcher(typeof v === 'function' ? v(useUi.getState().switcher) : v);

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
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f' && !isMobileNow()) {
        e.preventDefault();
        toggleFocusMode();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        void toggleDeaf();
      }
      // Alt+1…8: live reactions while in a call (ignored while typing)
      if (e.altKey && !e.ctrlKey && !e.metaKey && !typing && /^Digit[1-8]$/.test(e.code) && useVoice.getState().state === 'connected') {
        e.preventDefault();
        void sendReaction(REACTIONS[Number(e.code.slice(5)) - 1]!);
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

  const mobile = useIsMobile();
  const focusMode = usePrefs((p) => p.focusMode);
  const routes = (
    <Routes>
      <Route path="/channels/@me/:channelId?" element={<HomeLayout />} />
      <Route path="/channels/:serverId/:channelId?" element={<ServerLayout />} />
      <Route path="/discover" element={<Sidebarred sidebar={<HomeSidebar />}><DiscoverPage /></Sidebarred>} />
      <Route path="*" element={<Navigate to="/channels/@me" replace />} />
    </Routes>
  );
  const overlays = (
    <>
      <AnimatePresence>{switcher && <QuickSwitcher onClose={() => setSwitcher(false)} />}</AnimatePresence>
      <WhatsNew />
      <MiniPlayer />
      {settingsTab && <Suspense fallback={null}><UserSettings key={settingsTab} initialTab={settingsTab} onClose={closeSettings} /></Suspense>}
    </>
  );
  // Phones get their own navigation (tabs + screen stack); desktop keeps the columns.
  if (mobile)
    return (
      <>
        <MobileShell content={routes} onSearch={() => setSwitcher(true)} />
        {overlays}
      </>
    );
  return (
    <div className="flex h-full bg-bg-rail">
      {!focusMode && <ServerRail />}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onSearch={() => setSwitcher(true)} />
        <div className="flex min-h-0 flex-1 gap-2 pb-2 pr-2">{routes}</div>
      </div>
      {overlays}
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
        aria-label="Buscar"
        className="no-drag flex h-8 items-center gap-2 rounded-xl border border-line/[0.07] bg-line/[0.03] px-3 text-[13px] text-fg-faint transition-colors hover:border-line/15 hover:text-fg-muted phone:ml-2 phone:w-9 phone:justify-center phone:px-0 md:w-64"
      >
        <Icon name="search" size={15} />
        <span className="flex-1 text-left phone:hidden">Buscar ou ir para…</span>
        <span className="kbd phone:hidden">Ctrl K</span>
      </button>
      <div className="pointer-events-none absolute inset-x-0 top-1.5 flex justify-center">
        <div className="pointer-events-auto">
          <LiveIsland />
        </div>
      </div>
      <div className="flex-1" />
      <FocusButton />
      {winControls && <div className="w-[138px] shrink-0" />}
    </div>
  );
}

export function toggleFocusMode() {
  const on = !getPrefs().focusMode;
  setPrefs({ focusMode: on });
  toast(on ? 'Modo foco: painéis escondidos. Ctrl+Shift+F para voltar.' : 'Modo foco desligado.');
}

function FocusButton() {
  const on = usePrefs((p) => p.focusMode);
  return (
    <button
      onClick={toggleFocusMode}
      aria-pressed={on}
      aria-label="Modo foco"
      title="Modo foco (Ctrl+Shift+F): esconde os painéis laterais"
      className={clsx('no-drag flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[12px] font-semibold transition-colors', on ? 'border-brand/40 bg-brand/15 text-fg-strong' : 'border-line/[0.07] bg-line/[0.03] text-fg-faint hover:text-fg-muted')}
    >
      <Icon name="sidebar" size={15} />
      <span className="hidden lg:inline">{on ? 'Sair do foco' : 'Foco'}</span>
    </button>
  );
}

function Sidebarred({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const mobile = useIsMobile();
  const visible = useContext(MobileContentVisible);
  const meId = useStore((s) => s.me?.id);
  const focus = usePrefs((p) => p.focusMode);
  usePrefs((p) => p.panelWidths); // re-render when widths change
  const width = panelWidth(meId, 'side');
  const col = useRef<HTMLDivElement>(null);
  // phones: lists live in the mobile shell's tabs; the route only provides the content screen
  if (mobile && !visible) return null;
  if (mobile) return <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-main">{children}</main>;
  const L = PANEL_LIMITS.side;
  return (
    <>
      {/* Focus mode hides the column (connections, call and voice panel state stay as they are) */}
      <div ref={col} className={clsx('flex shrink-0 flex-col gap-2', focus && 'hidden')} style={{ width }} data-testid="side-column">
        <div className="panel min-h-0 flex-1 overflow-hidden">{sidebar}</div>
        <VoicePanel />
        <UserPanel />
      </div>
      {!focus && <ResizeHandle side="left" label="Largura da barra lateral" value={width} min={L.min} max={L.max} def={L.def} onPreview={(px) => col.current && (col.current.style.width = `${px}px`)} onCommit={(px) => meId && setPanelWidth(meId, 'side', px)} />}
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
      // state m:'nav' → on phones this redirect shows the channel list, and "back" from a chat returns here
      if (target) nav(`/channels/${serverId}/${target.id}`, { replace: true, state: { m: 'nav' } });
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
