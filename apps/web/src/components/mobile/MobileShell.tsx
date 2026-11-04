import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import clsx from 'clsx';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useStore, useStoreShallow, isUnread, displayName } from '@/store';
import { useVoice, toggleMute, leaveVoice } from '@/lib/voice';
import { MobileContentVisible, registerMobileNavigate, paneFor, mobileBack, openContent, useMobileTab, setMobileTab, nativeBackSwipe, type MobileTab } from '@/lib/mobile';
import { spring, dur, ease } from '@/lib/motion';
import { Icon, type IconName } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { ServerRail } from '../layout/ServerRail';
import { ChannelSidebar } from '../layout/ChannelSidebar';
import { HomeSidebar } from '../layout/HomeSidebar';
import { LiveIsland } from '../island/LiveIsland';
import { NotificationsScreen, useNotificationCount } from './NotificationsScreen';
import { YouScreen } from './YouScreen';

/**
 * Phone layout (≤ 767 px), modeled on how a chat app works on a phone:
 * - bottom tabs: Servidores · Mensagens · Notificações · Você (always visible on list screens),
 * - lists stay mounted underneath (scroll positions survive), the chat/call screen slides over them,
 * - "back" is history: the ← button, Android back and the iOS swipe all land in the same place,
 * - the whole shell follows the *visible* viewport, so the keyboard never covers the message field.
 * Desktop is untouched: this component only renders on phones.
 */
export function MobileShell({ content, onSearch }: { content: ReactNode; onSearch: () => void }) {
  const loc = useLocation();
  const navType = useNavigationType();
  const navigate = useNavigate();
  useEffect(() => {
    registerMobileNavigate((to, o) => (typeof to === 'number' ? navigate(to) : navigate(to, o)));
  }, [navigate]);
  const pane = paneFor(loc.pathname, loc.state);
  const tab = useMobileTab((t) => t.tab);
  const kb = useKeyboardOpen();

  // keep the tab in sync with where the route is (tapping the DM icon in the rail, a mention, a deep link…)
  const serverId = /^\/channels\/(\d+)/.exec(loc.pathname)?.[1] ?? null;
  useEffect(() => {
    const t = useMobileTab.getState().tab;
    if (serverId) {
      useMobileTab.setState({ lastServer: serverId });
      try {
        localStorage.setItem('aldetes.mserver', serverId);
      } catch {
        /* ignore */
      }
      if (t === 'dms' && pane === 'nav') setMobileTab('servers');
    } else if (loc.pathname.startsWith('/channels/@me') && t === 'servers' && pane === 'nav' && navType !== 'POP' && !(loc.state as { fromTab?: boolean } | null)?.fromTab) setMobileTab('dms');
  }, [serverId, loc.pathname, pane, navType]);

  const inCall = useVoice((v) => !!v.channelId && v.state !== 'idle');
  const callId = useVoice((v) => v.channelId);
  const viewingCall = pane === 'content' && !!callId && loc.pathname.endsWith(`/${callId}`);

  return (
    <div
      className="mshell fixed inset-x-0 flex flex-col overflow-hidden bg-bg-rail"
      style={{ top: 'var(--vv-top, 0px)', height: 'var(--app-h, 100dvh)', paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
    >
      {/* transient Live Island events (incoming call, upload, reconnecting) float over the top edge */}
      <div className="pointer-events-none absolute inset-x-0 top-[max(0.4rem,env(safe-area-inset-top))] z-[46] flex justify-center">
        <div className="pointer-events-auto">
          <LiveIsland mobile />
        </div>
      </div>

      {inCall && pane === 'content' && !viewingCall && <CallBar position="top" />}

      <div className="relative min-h-0 flex-1">
        {/* list screens (always mounted: scroll and state survive) */}
        <motion.div
          className="absolute inset-0 flex flex-col"
          animate={{ x: pane === 'content' ? -48 : 0, opacity: pane === 'content' ? 0.55 : 1 }}
          transition={{ duration: dur.spatial, ease: ease.out }}
          aria-hidden={pane === 'content' || undefined}
          style={{ pointerEvents: pane === 'content' ? 'none' : undefined }}
        >
          <TabScreen id="servers" active={tab === 'servers'}>
            <ServersScreen serverId={serverId ?? useMobileTab.getState().lastServer} onSearch={onSearch} />
          </TabScreen>
          <TabScreen id="dms" active={tab === 'dms'}>
            <ScreenHeader title="Mensagens" onSearch={onSearch} />
            <div className="min-h-0 flex-1 px-2">
              <div className="panel h-full overflow-hidden">
                <HomeSidebar />
              </div>
            </div>
          </TabScreen>
          <TabScreen id="notifications" active={tab === 'notifications'}>
            <NotificationsScreen />
          </TabScreen>
          <TabScreen id="you" active={tab === 'you'}>
            <YouScreen />
          </TabScreen>
        </motion.div>

        {/* content screen (chat / call / friends) slides over the lists */}
        {/* routes always run (redirects, permission checks); their screens only mount when opened */}
        {pane === 'nav' && (
          <MobileContentVisible.Provider value={false}>
            <div hidden>{content}</div>
          </MobileContentVisible.Provider>
        )}
        <AnimatePresence initial={false}>
          {pane === 'content' && (
            <ContentLayer key="content">
              <MobileContentVisible.Provider value={true}>{content}</MobileContentVisible.Provider>
            </ContentLayer>
          )}
        </AnimatePresence>
      </div>

      {inCall && pane === 'nav' && !kb && <CallBar position="bottom" />}
      <AnimatePresence initial={false}>{pane === 'nav' && !kb && <TabBar key="tabs" tab={tab} />}</AnimatePresence>
    </div>
  );
}

function TabScreen({ id, active, children }: { id: MobileTab; active: boolean; children: ReactNode }) {
  // visibility (not display:none) keeps the scroll position of each list
  return (
    <section
      aria-label={id}
      aria-hidden={!active || undefined}
      className={clsx('absolute inset-0 flex flex-col', active ? 'visible' : 'pointer-events-none invisible')}
    >
      {active ? (
        <motion.div className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.short, ease: ease.out }}>
          {children}
        </motion.div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      )}
    </section>
  );
}

function ScreenHeader({ title, onSearch, right }: { title: string; onSearch?: () => void; right?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-4">
      <h1 className="flex-1 truncate text-[22px] font-black tracking-tight text-fg-strong">{title}</h1>
      {right}
      {onSearch && (
        <motion.button whileTap={{ scale: 0.88 }} transition={spring.snappy} onClick={onSearch} aria-label="Buscar" className="flex h-11 w-11 items-center justify-center rounded-full bg-line/[0.06] text-fg-strong active:bg-line/[0.12]">
          <Icon name="search" size={19} />
        </motion.button>
      )}
    </header>
  );
}

/** Servers tab: the rail + the selected server's channels (or an inviting empty state). */
function ServersScreen({ serverId, onSearch }: { serverId: string | null; onSearch: () => void }) {
  const server = useStore((s) => (serverId ? s.servers[serverId] : undefined));
  const anyServer = useStore((s) => Object.keys(s.servers).length > 0);
  return (
    <div className="flex min-h-0 flex-1">
      <ServerRail />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pb-2 pr-2">
        {server ? (
          <div className="panel min-h-0 flex-1 overflow-hidden">
            <ChannelSidebar serverId={server.id} />
          </div>
        ) : (
          <div className="panel flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="tile grad h-14 w-14 text-white shadow-glow">
              <Icon name="servers" size={26} />
            </span>
            <div className="text-lg font-extrabold text-fg-strong">{anyServer ? 'Escolha um servidor' : 'Nenhum servidor ainda'}</div>
            <p className="text-sm text-fg-muted">{anyServer ? 'Toque num ícone à esquerda para ver os canais.' : 'Crie um servidor com o + à esquerda ou entre por um convite.'}</p>
            <button className="btn-secondary mt-2 h-11" onClick={onSearch}>
              <Icon name="search" size={16} /> Buscar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The chat/call screen: slides in from the right; drag from the left edge to go back (installed app / Android). */
function ContentLayer({ children }: { children: ReactNode }) {
  const x = useMotionValue(0);
  const shade = useTransform(x, [0, 400], [1, 0]);
  const drag = useRef<{ x0: number; y0: number; t: number; on: boolean; decided: boolean } | null>(null);
  const width = () => window.innerWidth || 400;
  const allowSwipe = !nativeBackSwipe();

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-bg-main shadow-[-24px_0_48px_-24px_rgb(0_0_0/0.8)]"
      style={{ x }}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%', transition: { duration: dur.spatial, ease: ease.inOut } }}
      transition={{ duration: dur.spatial, ease: ease.out }}
      // touch events (not pointer events): the browser would cancel pointer events once it starts its own pan
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (!allowSwipe || !t || e.touches.length !== 1 || t.clientX > 28) return;
        drag.current = { x0: t.clientX, y0: t.clientY, t: performance.now(), on: false, decided: false };
      }}
      onTouchMove={(e) => {
        const d = drag.current;
        const t = e.touches[0];
        if (!d || !t) return;
        const dx = t.clientX - d.x0;
        const dy = t.clientY - d.y0;
        if (!d.decided && Math.hypot(dx, dy) > 10) {
          d.decided = true;
          d.on = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.4; // horizontal only — vertical scrolling wins otherwise
          if (!d.on) drag.current = null;
        }
        if (d.on) x.set(Math.max(0, dx));
      }}
      onTouchEnd={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d?.on) return;
        const t = e.changedTouches[0];
        const dx = (t?.clientX ?? d.x0) - d.x0;
        const v = dx / Math.max(1, performance.now() - d.t);
        if (dx > width() * 0.33 || v > 0.6) mobileBack();
        else void animate(x, 0, spring.snappy);
      }}
      onTouchCancel={() => {
        if (drag.current?.on) void animate(x, 0, spring.snappy);
        drag.current = null;
      }}
    >
      <motion.div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-line/10" style={{ opacity: shade }} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </motion.div>
  );
}

/* --------------------------------------------------------------- tab bar */

function useBadges() {
  const servers = useStore((s) => Object.entries(s.readStates).reduce((a, [id, r]) => a + (s.channels[id]?.serverId ? r.mentionCount : 0), 0));
  const dmUnread = useStoreShallow((s) => s.dmIds.filter((id) => isUnread(id)).length);
  const requests = useStore((s) => Object.values(s.relationships).filter((r) => r.type === 'incoming').length);
  const notes = useNotificationCount();
  return { servers, dms: dmUnread + requests, notifications: notes };
}

const TABS: Array<{ id: MobileTab; label: string; icon: IconName }> = [
  { id: 'servers', label: 'Servidores', icon: 'servers' },
  { id: 'dms', label: 'Mensagens', icon: 'chat' },
  { id: 'notifications', label: 'Notificações', icon: 'bell' },
  { id: 'you', label: 'Você', icon: 'user' },
];

function TabBar({ tab }: { tab: MobileTab }) {
  const badges = useBadges();
  const me = useStore((s) => s.me);
  const navigate = useNavigate();
  const go = (t: MobileTab) => {
    if (t === tab) {
      // tapping the active tab scrolls its list back to the top (like native apps)
      document.querySelector(`section[aria-label="${t}"] .overflow-y-auto`)?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setMobileTab(t);
    if (t === 'dms') navigate('/channels/@me', { state: { m: 'nav', fromTab: true } });
    if (t === 'servers') {
      const last = useMobileTab.getState().lastServer;
      if (last && useStoreServerExists(last)) navigate(`/channels/${last}`, { state: { m: 'nav', fromTab: true } });
    }
  };
  return (
    <motion.nav
      aria-label="Navegação principal"
      initial={{ y: 80 }}
      animate={{ y: 0 }}
      exit={{ y: 80, transition: { duration: dur.short } }}
      transition={{ duration: dur.spatial, ease: ease.out }}
      className="relative z-20 shrink-0 border-t border-line/[0.07] bg-bg-side/95 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex h-[58px] items-stretch px-1">
        {TABS.map((t) => {
          const active = t.id === tab;
          const count = t.id === 'you' ? 0 : badges[t.id as 'servers' | 'dms' | 'notifications'];
          return (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
              className={clsx('relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-bold transition-colors', active ? 'text-fg-strong' : 'text-fg-faint active:text-fg')}
            >
              {active && <motion.span layoutId="mtab-pill" transition={spring.responsive} className="absolute inset-x-2.5 inset-y-1.5 -z-10 rounded-2xl bg-brand/15" />}
              <motion.span animate={{ scale: active ? 1.08 : 1, y: active ? -1 : 0 }} transition={spring.snappy} className="relative flex h-7 items-center justify-center">
                {t.id === 'you' && me ? (
                  <span className={clsx('rounded-full', active && 'ring-2 ring-brand ring-offset-2 ring-offset-bg-side')}>
                    <Avatar userId={me.id} size={24} showStatus />
                  </span>
                ) : (
                  <Icon name={t.icon} size={23} strokeWidth={active ? 2.4 : 2} className={active ? 'text-brand' : ''} />
                )}
                <AnimatePresence>
                  {count > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={spring.snappy}
                      className="absolute -right-2.5 -top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10.5px] font-black leading-[18px] text-white ring-2 ring-bg-side"
                    >
                      {count > 99 ? '99+' : count}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.span>
              {t.label}
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
}
const useStoreServerExists = (id: string) => !!useStore.getState().servers[id];

/* --------------------------------------------------------------- call bar */

/** The call is always one tap away: above the tabs on list screens, on top of other chats. */
function CallBar({ position }: { position: 'top' | 'bottom' }) {
  const v = useVoice(useShallow((s) => ({ channelId: s.channelId, state: s.state, selfMute: s.selfMute, selfDeaf: s.selfDeaf, connectedAt: s.connectedAt, pendingMic: s.pending.mic, speaking: s.speaking })));
  const channel = useStore((s) => (v.channelId ? s.channels[v.channelId] : undefined));
  const people = useStoreShallow((s) => (v.channelId ? Object.values(s.voiceStates).filter((x) => x.channelId === v.channelId).map((x) => x.userId) : []));
  const [now, setNow] = useState(Date.now());
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2500);
    return () => clearTimeout(t);
  }, [armed]);
  if (!channel) return null;
  const s = v.connectedAt ? Math.floor((now - v.connectedAt) / 1000) : 0;
  const ok = v.state === 'connected';
  const name = channel.serverId ? channel.name : displayName(people.find((p) => p !== useStore.getState().me?.id) ?? '', null) || 'Chamada';
  const open = () => openContent(channel.serverId ? `/channels/${channel.serverId}/${channel.id}` : `/channels/@me/${channel.id}`);
  return (
    <motion.div
      initial={{ opacity: 0, y: position === 'bottom' ? 12 : -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.gentle}
      className={clsx('relative z-20 shrink-0 px-2', position === 'top' ? 'pb-1 pt-1' : 'pb-1.5')}
    >
      <div className={clsx('flex h-14 items-center gap-2 rounded-2xl border bg-bg-float/95 pl-3 pr-1.5 shadow-float', ok ? 'border-ok/30' : 'border-warn/30')}>
        <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={open} aria-label={`Voltar para a call ${name}`}>
          <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', ok ? 'bg-ok shadow-[0_0_10px_rgb(var(--ok))]' : 'animate-pulse bg-warn')} />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-bold text-fg-strong">{name}</span>
            <span className="block text-[11.5px] tabular-nums text-fg-muted">{ok ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · ${people.length} na call` : v.state === 'reconnecting' ? 'Reconectando…' : 'Conectando…'}</span>
          </span>
          <span className="ml-auto flex -space-x-1.5">
            {people.slice(0, 3).map((id) => (
              <span key={id} className={clsx('rounded-full ring-2 ring-bg-float', v.speaking[id] && 'speaking')}>
                <Avatar userId={id} size={22} />
              </span>
            ))}
          </span>
        </button>
        <motion.button
          whileTap={{ scale: 0.85 }}
          transition={spring.snappy}
          onClick={() => void toggleMute()}
          aria-label="Microfone"
          aria-pressed={v.selfMute || v.selfDeaf}
          aria-busy={v.pendingMic || undefined}
          className={clsx('flex h-11 w-11 items-center justify-center rounded-full', v.selfMute || v.selfDeaf ? 'bg-danger/20 text-danger' : 'bg-line/[0.08] text-fg-strong')}
        >
          <Icon name={v.selfMute || v.selfDeaf ? 'micOff' : 'mic'} size={19} />
        </motion.button>
        <motion.button
          layout
          whileTap={{ scale: 0.85 }}
          transition={spring.snappy}
          onClick={() => (armed ? void leaveVoice() : setArmed(true))}
          aria-label={armed ? 'Confirmar: sair da call' : 'Sair da call'}
          className={clsx('flex h-11 items-center justify-center gap-1 rounded-full bg-danger text-white', armed ? 'px-3.5' : 'w-11')}
        >
          <Icon name="hangup" size={19} />
          {armed && <span className="text-[12px] font-bold">Sair?</span>}
        </motion.button>
      </div>
    </motion.div>
  );
}

/* --------------------------------------------------------------- helpers */

function useKeyboardOpen() {
  const [open, setOpen] = useState(() => document.documentElement.dataset.kb === 'open');
  useEffect(() => {
    const mo = new MutationObserver(() => setOpen(document.documentElement.dataset.kb === 'open'));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-kb'] });
    return () => mo.disconnect();
  }, []);
  return open;
}
