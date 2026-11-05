import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import type { Channel } from '@aldetes/shared';
import { useStore, useStoreShallow, isUnread, get } from '@/store';
import { usePrefs, setPrefs, togglePinDm, type PulseModule } from '@/lib/prefs';
import { useDrafts } from '@/lib/drafts';
import { useVoice, joinVoice } from '@/lib/voice';
import { openDm } from '@/lib/actions';
import { api } from '@/lib/api';
import { activityLine, elapsed } from '@/lib/activity';
import { spring, dur, ease, greeting } from '@/lib/motion';
import { Avatar } from '@/components/common/Avatar';
import { Icon, type IconName } from '@/components/common/Icon';
import { openSwitcher } from '@/lib/ui';
import { toast, toastError } from '@/components/common/overlay';
import { ServerIcon } from '@/components/layout/ServerRail';
import { dmName } from '@/components/layout/HomeSidebar';
import { channelIcon } from '@/components/layout/ChannelSidebar';
import { CreateServerModal } from '@/components/modals/CreateServerModal';

/**
 * Pulse — the desktop home. Everything comes from real state (presences, voice states, read states, drafts):
 * no invented activity, and invisible/offline people never show up as "doing" something.
 * Modules are reorderable (drag the handle or use the arrows) and the order is saved on this device.
 */
const MODULES: Record<PulseModule, { title: string; icon: IconName; tint: string }> = {
  now: { title: 'Acontecendo agora', icon: 'zap', tint: 'text-brand bg-brand/15' },
  quick: { title: 'Acesso rápido', icon: 'star', tint: 'text-amber-400 bg-amber-400/15' },
  continue: { title: 'Continuar conversa', icon: 'chat', tint: 'text-sky-400 bg-sky-400/15' },
  spaces: { title: 'Seus espaços', icon: 'servers', tint: 'text-emerald-400 bg-emerald-400/15' },
};
const ALL: PulseModule[] = ['now', 'quick', 'continue', 'spaces'];

export function PulseHome({ onAddFriend }: { onAddFriend: () => void }) {
  const saved = usePrefs((p) => p.pulseOrder);
  // keep only known modules, add any new ones at the end (safe if a future version adds modules)
  const order = useMemo(() => [...saved.filter((m) => ALL.includes(m)), ...ALL.filter((m) => !saved.includes(m))], [saved]);
  const move = (m: PulseModule, d: -1 | 1) => {
    const i = order.indexOf(m);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setPrefs({ pulseOrder: next });
  };
  return (
    <div className="px-6 pb-2 pt-6" data-testid="pulse">
      <Hero onAddFriend={onAddFriend} />
      <Reorder.Group axis="y" values={order} onReorder={(v) => setPrefs({ pulseOrder: v })} className="mt-6 grid gap-3" as="div">
        {order.map((m, i) => (
          <ModuleShell key={m} id={m} index={i} count={order.length} onMove={(d) => move(m, d)}>
            {m === 'now' ? <NowModule onAddFriend={onAddFriend} /> : m === 'quick' ? <QuickModule /> : m === 'continue' ? <ContinueModule /> : <SpacesModule />}
          </ModuleShell>
        ))}
      </Reorder.Group>
    </div>
  );
}

function Hero({ onAddFriend }: { onAddFriend: () => void }) {
  const me = useStore((s) => s.me)!;
  const { online, inCall, playing } = useStoreShallow((s) => {
    let online = 0;
    let inCall = 0;
    let playing = 0;
    for (const r of Object.values(s.relationships)) {
      if (r.type !== 'friend') continue;
      const pr = s.presences[r.userId];
      if (!pr || pr.status === 'offline') continue;
      online++;
      if (s.voiceStates[r.userId]) inCall++;
      if (pr.activity) playing++;
    }
    return { online, inCall, playing };
  });
  const parts = [online ? `${online} ${online === 1 ? 'amigo online' : 'amigos online'}` : null, inCall ? `${inCall} em call` : null, playing ? `${playing} ${playing === 1 ? 'jogando ou ouvindo música' : 'jogando ou ouvindo música'}` : null].filter(Boolean);
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.spatial, ease: ease.out }} className="relative overflow-hidden rounded-[28px] border border-line/[0.07] px-7 py-7">
      {/* static light (radial gradients, no blur filter, no loop): the home costs ~nothing while idle */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(28rem 18rem at 0% 0%, rgb(var(--brand) / 0.26), transparent 70%), radial-gradient(30rem 20rem at 100% 120%, rgb(var(--brand-2) / 0.2), transparent 70%)' }} />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <div className="eyebrow mb-2">
            {greeting()}, {me.displayName}
          </div>
          <h1 className="text-[40px] font-black leading-[1.02] tracking-[-0.035em] text-fg-strong">
            Sua galera. <span className="grad-text">Agora.</span>
          </h1>
          <p className="mt-2 text-sm text-fg-muted" aria-live="polite">
            {parts.length ? parts.join(' · ') : 'Ninguém online no momento — quando a galera chegar, aparece aqui.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary h-10" onClick={() => openSwitcher()}>
            <Icon name="search" size={15} /> Ir para… <span className="kbd ml-1">Ctrl K</span>
          </button>
          <button className="btn-primary h-10" onClick={onAddFriend}>
            <Icon name="plus" size={15} strokeWidth={2.5} /> Adicionar amigo
          </button>
        </div>
      </div>
    </motion.section>
  );
}

function ModuleShell({ id, index, count, onMove, children }: { id: PulseModule; index: number; count: number; onMove: (d: -1 | 1) => void; children: ReactNode }) {
  const meta = MODULES[id];
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={id}
      as="section"
      dragListener={false}
      dragControls={controls}
      aria-label={meta.title}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.gentle, delay: 0.06 + index * 0.05 }}
      className="card relative p-4"
    >
      <header className="mb-3 flex items-center gap-2.5">
        <span className={clsx('tile h-8 w-8', meta.tint)}>
          <Icon name={meta.icon} size={16} />
        </span>
        <h2 className="flex-1 text-[15px] font-extrabold tracking-tight text-fg-strong">{meta.title}</h2>
        <div className="flex items-center gap-0.5 text-fg-faint">
          <button className="tap rounded-md p-1 hover:text-fg-strong disabled:opacity-30" aria-label={`Subir ${meta.title}`} disabled={index === 0} onClick={() => onMove(-1)}>
            <Icon name="arrowUp" size={14} />
          </button>
          <button className="tap rounded-md p-1 hover:text-fg-strong disabled:opacity-30" aria-label={`Descer ${meta.title}`} disabled={index === count - 1} onClick={() => onMove(1)}>
            <Icon name="arrowDown" size={14} />
          </button>
          <span className="cursor-grab touch-none rounded-md p-1 hover:text-fg-strong active:cursor-grabbing" title="Arraste para reorganizar" onPointerDown={(e) => controls.start(e)}>
            <Icon name="grip" size={16} />
          </span>
        </div>
      </header>
      {children}
    </Reorder.Item>
  );
}

function Empty({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-dashed border-line/[0.1] px-4 py-5">
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-line/[0.05] text-fg-faint">
        <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-line/[0.08]" />
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold text-fg">{title}</div>
        <div className="text-[13px] text-fg-muted">{body}</div>
      </div>
      {action && (
        <button className="btn-secondary shrink-0" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ---------------- Acontecendo agora ---------------- */

type CallGroup = { channel: Channel; serverName: string | null; userIds: string[]; streaming: number };

function NowModule({ onAddFriend }: { onAddFriend: () => void }) {
  const nav = useNavigate();
  const myCall = useVoice((v) => (v.state === 'connected' ? v.channelId : null));
  // calls with at least one visible friend (people shown as offline/invisible are left out)
  const calls = useStoreShallow((s) => {
    const friends = new Set(Object.values(s.relationships).filter((r) => r.type === 'friend').map((r) => r.userId));
    const visible = (uid: string) => (s.presences[uid]?.status ?? 'offline') !== 'offline';
    const by = new Map<string, string[]>();
    for (const v of Object.values(s.voiceStates)) if (visible(v.userId) || v.userId === s.me?.id) by.set(v.channelId, [...(by.get(v.channelId) ?? []), v.userId]);
    const out: string[] = [];
    for (const [cid, uids] of by) if (uids.some((u) => friends.has(u) && visible(u)) && s.channels[cid]) out.push(`${cid}:${uids.join(',')}`);
    return out;
  });
  const groups = useMemo<CallGroup[]>(() => {
    const st = get();
    return calls.map((k) => {
      const [cid, list] = k.split(':') as [string, string];
      const channel = st.channels[cid]!;
      const userIds = list.split(',');
      return { channel, serverName: channel.serverId ? (st.servers[channel.serverId]?.name ?? null) : null, userIds, streaming: userIds.filter((u) => st.voiceStates[u]?.streaming).length };
    });
  }, [calls]);
  const active = useStoreShallow((s) =>
    Object.values(s.relationships)
      .filter((r) => r.type === 'friend')
      .map((r) => s.presences[r.userId])
      .filter((p): p is NonNullable<typeof p> => !!p && p.status !== 'offline' && !!p.activity)
      .map((p) => p.userId),
  );

  if (!groups.length && !active.length)
    return <Empty icon="zap" title="Tudo calmo por enquanto" body="Quando seus amigos entrarem em call, jogarem ou ouvirem música, aparece aqui na hora." action={{ label: 'Adicionar amigo', onClick: onAddFriend }} />;

  const join = (g: CallGroup) => {
    nav(g.channel.serverId ? `/channels/${g.channel.serverId}/${g.channel.id}` : `/channels/@me/${g.channel.id}`);
    void joinVoice(g.channel.id);
  };
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {groups.map((g) => (
        <motion.div layout key={g.channel.id} data-glow className="group flex items-center gap-3 rounded-2xl border border-line/[0.06] bg-line/[0.025] p-3">
          <span className="tile h-10 w-10 bg-ok/15 text-ok">
            <Icon name="speaker" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-bold text-fg-strong">{g.channel.serverId ? g.channel.name : dmName(g.channel)}</div>
            <div className="truncate text-xs text-fg-muted">
              {g.serverName ?? 'Chamada privada'} · {g.userIds.length} {g.userIds.length === 1 ? 'pessoa' : 'pessoas'}
              {g.streaming ? ` · ${g.streaming} transmitindo` : ''}
            </div>
          </div>
          <div className="flex -space-x-2">
            {g.userIds.slice(0, 4).map((u) => (
              <span key={u} className="rounded-full ring-2 ring-bg-side">
                <Avatar userId={u} size={26} />
              </span>
            ))}
          </div>
          {myCall === g.channel.id ? (
            <span className="rounded-lg bg-ok/15 px-2.5 py-1.5 text-xs font-bold text-ok">Você está aqui</span>
          ) : (
            <button className="btn-primary h-9 px-3" onClick={() => join(g)}>
              Entrar
            </button>
          )}
        </motion.div>
      ))}
      {active.map((uid) => (
        <ActivityCard key={uid} userId={uid} myCall={myCall} />
      ))}
    </div>
  );
}

function ActivityCard({ userId, myCall }: { userId: string; myCall: string | null }) {
  const nav = useNavigate();
  const user = useStore((s) => s.users[userId] ?? s.relationships[userId]?.user);
  const act = useStore((s) => s.presences[userId]?.activity);
  const myCallServer = useStore((s) => (myCall ? s.channels[myCall]?.serverId : null));
  const [invited, setInvited] = useState(false);
  if (!user || !act) return null;
  const msg = async () => nav(`/channels/@me/${await openDm(userId)}`);
  const invite = async () => {
    try {
      await api('POST', `/voice/${myCall}/invite`, { userId });
      setInvited(true);
      toast(`Chamando ${user.displayName} para a call…`, 'success');
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <motion.div layout data-glow className="flex items-center gap-3 rounded-2xl border border-line/[0.06] bg-line/[0.025] p-3">
      <span className="relative">
        <Avatar userId={userId} size={40} showStatus />
        <span className={clsx('absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-bg-side', act.type === 'playing' ? 'bg-violet-500 text-white' : 'bg-emerald-500 text-white')}>
          <Icon name={act.type === 'playing' ? 'gamepad' : 'music'} size={11} strokeWidth={2.5} />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-bold text-fg-strong">{user.displayName}</div>
        <div className="truncate text-xs text-fg-muted">
          {activityLine(act)} · {elapsed(act.startedAt)}
        </div>
      </div>
      {myCall && myCallServer && (
        <button className="btn-secondary h-9 px-3" disabled={invited} onClick={() => void invite()}>
          {invited ? 'Chamado' : 'Chamar p/ call'}
        </button>
      )}
      <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-line/[0.07] text-fg-muted transition-transform hover:text-fg-strong active:scale-90" aria-label={`Mensagem para ${user.displayName}`} onClick={() => void msg()}>
        <Icon name="chat" size={17} />
      </button>
    </motion.div>
  );
}

/* ---------------- Acesso rápido ---------------- */

function QuickModule() {
  const nav = useNavigate();
  const pinned = usePrefs((p) => p.pinnedDms);
  const favorites = usePrefs((p) => p.favorites);
  const dmIds = useStore((s) => s.dmIds);
  const items = useStoreShallow((s) => {
    const out: string[] = [];
    for (const id of pinned) if (s.channels[id]) out.push(id);
    for (const id of favorites) if (s.channels[id] && !out.includes(id)) out.push(id);
    for (const id of dmIds) if (out.length < 8 && !out.includes(id)) out.push(id);
    return out.slice(0, 8);
  });
  if (!items.length) return <Empty icon="star" title="Seus atalhos ficam aqui" body="Fixe conversas (clique direito numa DM) ou favorite canais para abrir com um clique." />;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {items.map((id) => (
        <QuickTile key={id} channelId={id} pinned={pinned.includes(id)} fav={favorites.includes(id)} onOpen={(path) => nav(path)} />
      ))}
    </div>
  );
}

function QuickTile({ channelId, pinned, fav, onOpen }: { channelId: string; pinned: boolean; fav: boolean; onOpen: (path: string) => void }) {
  const c = useStore((s) => s.channels[channelId]);
  const server = useStore((s) => (c?.serverId ? s.servers[c.serverId] : null));
  const mentions = useStore((s) => s.readStates[channelId]?.mentionCount ?? 0);
  const unread = useStore(() => isUnread(channelId));
  if (!c) return null;
  const isDm = !c.serverId;
  const path = isDm ? `/channels/@me/${c.id}` : `/channels/${c.serverId}/${c.id}`;
  return (
    <motion.div layout className="group relative">
      <button data-glow onClick={() => onOpen(path)} className="flex w-full items-center gap-2.5 rounded-2xl border border-line/[0.06] bg-line/[0.025] p-2.5 text-left transition-colors hover:border-line/[0.12] hover:bg-line/[0.05]">
        {isDm ? (
          c.type === 'group_dm' ? (
            <span className="grad flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white">
              <Icon name="users" size={16} />
            </span>
          ) : (
            <Avatar userId={c.recipients?.[0]?.id ?? ''} size={36} showStatus />
          )
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-line/[0.06] text-fg-muted">
            <Icon name={channelIcon(c.type)} size={17} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={clsx('block truncate text-[13px]', unread || mentions ? 'font-bold text-fg-strong' : 'font-semibold text-fg')}>{isDm ? dmName(c) : c.name}</span>
          <span className="block truncate text-[11px] text-fg-faint">{isDm ? (pinned ? 'Fixada' : 'Conversa') : `${server?.name ?? ''}${fav ? ' · favorito' : ''}`}</span>
        </span>
        {mentions > 0 && <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">{mentions}</span>}
      </button>
      {isDm && (
        <button
          className={clsx('absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-line/[0.1] bg-bg-float text-fg-muted shadow transition-opacity hover:text-fg-strong', pinned ? 'opacity-100' : 'opacity-0 focus:opacity-100 group-hover:opacity-100')}
          aria-label={pinned ? 'Desafixar conversa' : 'Fixar conversa'}
          aria-pressed={pinned}
          onClick={() => togglePinDm(c.id)}
        >
          <Icon name="pin" size={12} />
        </button>
      )}
    </motion.div>
  );
}

/* ---------------- Continuar conversa ---------------- */

function ContinueModule() {
  const nav = useNavigate();
  const drafts = useDrafts();
  const unreadDms = useStoreShallow((s) => s.dmIds.filter((id) => isUnread(id)).slice(0, 5));
  const rows = useStoreShallow((s) => {
    const d = Object.entries(drafts)
      .filter(([id]) => !!s.channels[id])
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 4)
      .map(([id]) => `d:${id}`);
    const u = unreadDms.filter((id) => !drafts[id]).map((id) => `u:${id}`);
    return [...d, ...u].slice(0, 6);
  });
  if (!rows.length) return <Empty icon="chat" title="Nenhuma conversa pela metade" body="Rascunhos que você não enviou e mensagens novas nas DMs aparecem aqui para você continuar de onde parou." />;
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((k) => {
        const [kind, id] = k.split(':') as ['d' | 'u', string];
        return <ContinueRow key={k} channelId={id} draft={kind === 'd' ? drafts[id]?.text : undefined} at={kind === 'd' ? drafts[id]?.at : undefined} onOpen={(p) => nav(p)} />;
      })}
    </div>
  );
}

function ContinueRow({ channelId, draft, at, onOpen }: { channelId: string; draft?: string; at?: number; onOpen: (path: string) => void }) {
  const c = useStore((s) => s.channels[channelId]);
  const last = useStore((s) => s.messages[channelId]?.items.at(-1));
  const server = useStore((s) => (c?.serverId ? s.servers[c.serverId]?.name : null));
  if (!c) return null;
  const isDm = !c.serverId;
  const path = isDm ? `/channels/@me/${c.id}` : `/channels/${c.serverId}/${c.id}`;
  return (
    <button data-glow onClick={() => onOpen(path)} className="group flex items-center gap-3 rounded-2xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-line/[0.07] hover:bg-line/[0.03]">
      {isDm && c.type !== 'group_dm' ? (
        <Avatar userId={c.recipients?.[0]?.id ?? ''} size={34} />
      ) : (
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-xl bg-line/[0.06] text-fg-muted">
          <Icon name={isDm ? 'users' : channelIcon(c.type)} size={16} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-fg-strong">
          {isDm ? dmName(c) : `#${c.name}`} {server && <span className="font-normal text-fg-faint">· {server}</span>}
        </span>
        <span className="block truncate text-[12px] text-fg-muted">
          {draft != null ? (
            <>
              <span className="font-semibold text-brand">Rascunho:</span> {draft}
            </>
          ) : last ? (
            `${last.author?.displayName ?? ''}: ${last.content || (last.attachments?.length ? 'enviou um anexo' : '')}`
          ) : (
            'Mensagens novas'
          )}
        </span>
      </span>
      <span className="shrink-0 text-[11px] text-fg-faint">{at ? elapsed(at) : <span className="h-2 w-2 rounded-full bg-brand" />}</span>
      <Icon name="chevronRight" size={16} className="shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/* ---------------- Seus espaços ---------------- */

function SpacesModule() {
  const nav = useNavigate();
  const order = useStore((s) => s.serverOrder);
  const [creating, setCreating] = useState(false);
  return (
    <>
      {!order.length ? (
        <Empty icon="servers" title="Você ainda não está em nenhum servidor" body="Crie um espaço para a sua galera ou explore servidores públicos." action={{ label: 'Criar servidor', onClick: () => setCreating(true) }} />
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {order.slice(0, 11).map((id) => (
            <SpaceTile key={id} serverId={id} onOpen={() => nav(`/channels/${id}`)} />
          ))}
          <button onClick={() => nav('/discover')} className="flex items-center gap-2.5 rounded-2xl border border-dashed border-line/[0.12] p-2.5 text-left text-fg-muted transition-colors hover:border-brand/40 hover:text-fg-strong">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-line/[0.05]">
              <Icon name="compass" size={18} />
            </span>
            <span className="text-[13px] font-semibold">Explorar servidores</span>
          </button>
        </div>
      )}
      <AnimatePresence>{creating && <CreateServerModal onClose={() => setCreating(false)} />}</AnimatePresence>
    </>
  );
}

function SpaceTile({ serverId, onOpen }: { serverId: string; onOpen: () => void }) {
  const s = useStore((st) => st.servers[serverId]);
  const { mentions, unread, inVoice } = useStoreShallow((st) => {
    let mentions = 0;
    let unread = false;
    for (const c of Object.values(st.channels))
      if (c.serverId === serverId) {
        mentions += st.readStates[c.id]?.mentionCount ?? 0;
        if (!unread && (c.type === 'text' || c.type === 'announcement') && isUnread(c.id)) unread = true;
      }
    const inVoice = Object.values(st.voiceStates).filter((v) => v.serverId === serverId && (st.presences[v.userId]?.status ?? 'offline') !== 'offline').length;
    return { mentions, unread, inVoice };
  });
  if (!s) return null;
  return (
    <button data-glow onClick={onOpen} className="group flex items-center gap-2.5 rounded-2xl border border-line/[0.06] bg-line/[0.025] p-2.5 text-left transition-colors hover:border-line/[0.12] hover:bg-line/[0.05]">
      <span className="relative">
        <ServerIcon name={s.name} iconUrl={s.iconUrl} size={40} />
        {mentions > 0 && <span className="absolute -bottom-1 -right-1 min-w-[18px] rounded-full border-2 border-bg-side bg-danger px-1 text-center text-[10px] font-bold leading-[14px] text-white">{mentions > 99 ? '99+' : mentions}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className={clsx('block truncate text-[13px]', unread ? 'font-bold text-fg-strong' : 'font-semibold text-fg')}>{s.name}</span>
        <span className="block truncate text-[11px] text-fg-faint">{inVoice ? <span className="text-ok">{inVoice} em call agora</span> : unread ? 'Mensagens novas' : 'Tudo em dia'}</span>
      </span>
    </button>
  );
}
