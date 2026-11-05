import { useState, lazy, Suspense, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Permissions, hasPermission } from '@aldetes/shared';
import { useStore, saveServerOrder, isUnread, get, useStoreShallow } from '@/store';
import { Icon, Logo } from '../common/Icon';
import { motion, AnimatePresence } from 'motion/react';
import { spring, dur, ease } from '@/lib/motion';
import { useIsMobile } from '@/lib/mobile';
import { usePrefs, setPrefs, getPrefs, type Prefs } from '@/lib/prefs';
import { promptDialog } from '../common/overlay';
import { IconFrame, themeOf, useServerEffects, ServerCover } from '../studio/ServerScene';
import { desktop } from '@/lib/desktop';
import { Tooltip, useContextMenu, confirmDialog, toastError } from '../common/overlay';
import { Avatar } from '../common/Avatar';
import { CreateServerModal } from '../modals/CreateServerModal';
import { InviteModal } from '../modals/InviteModal';
const ServerSettings = lazy(() => import('../settings/ServerSettings').then((m) => ({ default: m.ServerSettings })));
import { api } from '@/lib/api';
import { ackChannel } from '@/lib/actions';

export function ServerIcon({ name, iconUrl, size = 48, active }: { name: string; iconUrl: string | null; size?: number; active?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3);
  return iconUrl ? (
    <img src={iconUrl} alt="" draggable={false} className="rounded-2xl object-cover" style={{ width: size, height: size }} />
  ) : (
    <div
      className={clsx(
        'flex items-center justify-center rounded-2xl font-bold transition-colors duration-200',
        active ? 'grad text-white' : 'bg-line/[0.06] text-fg-strong group-hover:bg-line/[0.1]',
      )}
      style={{ width: size, height: size, fontSize: initials.length > 2 ? 13 : 16 }}
    >
      {initials}
    </div>
  );
}

/** Left indicator: unread dot, or the active bar that slides between items (shared layout). */
function Pill({ state }: { state: 'none' | 'unread' | 'hover' | 'active' }) {
  if (state === 'active')
    return (
      <>
        {/* the bar travels between items; a soft luminous trail follows it (transform/opacity only) */}
        <motion.span layoutId="rail-active-trail" transition={{ ...spring.responsive, stiffness: 260 }} className="pointer-events-none absolute -left-[14px] top-1/2 h-12 w-3 -translate-y-1/2 rounded-r-full bg-[radial-gradient(closest-side,rgb(var(--brand)/0.6),transparent)]" aria-hidden />
        <motion.span layoutId="rail-active" transition={spring.responsive} className="grad absolute -left-[14px] top-1/2 h-9 w-1.5 -translate-y-1/2 rounded-r-full" />
      </>
    );
  return (
    <span
      className={clsx(
        'absolute -left-[14px] top-1/2 w-1.5 -translate-y-1/2 rounded-r-full bg-fg-strong transition-all duration-200',
        state === 'none' && 'h-0',
        state === 'unread' && 'h-2',
        state === 'hover' && 'h-5',
      )}
    />
  );
}

export function ServerRail() {
  const order = useStore((s) => s.serverOrder);
  const servers = useStore((s) => s.servers);
  const loc = useLocation();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const homeActive = loc.pathname.startsWith('/channels/@me');
  // unread DMs show as avatars on the rail
  const unreadDms = useStoreShallow((s) => s.dmIds.filter((id) => (s.readStates[id]?.mentionCount ?? 0) > 0));
  const mobile = useIsMobile();
  const folders = usePrefs((p) => p.railFolders);
  // desktop: folders show at the place of their first server; phones keep the plain 0.8 list
  const entries = useMemo(() => {
    if (mobile || !folders.length) return order.map((id) => ({ kind: 'server' as const, id }));
    const out: Array<{ kind: 'server'; id: string } | { kind: 'folder'; folder: RailFolder }> = [];
    const placed = new Set<string>();
    for (const id of order) {
      const f = folders.find((x) => x.serverIds.includes(id));
      if (!f) out.push({ kind: 'server', id });
      else if (!placed.has(f.id)) {
        placed.add(f.id);
        out.push({ kind: 'folder', folder: f });
      }
    }
    return out;
  }, [mobile, folders, order]);

  return (
    <nav className={clsx('scroll-none flex w-[76px] shrink-0 flex-col items-center gap-2 overflow-y-auto pb-3', desktop?.platform === 'darwin' ? 'pt-10' : 'pt-3')} aria-label="Servidores">
      <RailItem tooltip="Mensagens diretas" active={homeActive} onClick={() => nav('/channels/@me')}>
        <div className={clsx('flex h-12 w-12 items-center justify-center rounded-2xl transition-colors duration-200', homeActive ? 'grad text-white shadow-glow' : 'bg-line/[0.06] text-fg group-hover:text-fg-strong')}>
          <Logo size={26} />
        </div>
      </RailItem>
      {unreadDms.map((id) => (
        <DmBubble key={id} channelId={id} />
      ))}
      <div className="mx-auto my-1 h-px w-8 bg-line/10" />
      {entries.map((en) => {
        if (en.kind === 'folder') {
          const f = en.folder;
          return (
            <div key={f.id} className={clsx('flex w-full flex-col items-center gap-2 rounded-[22px] transition-colors', f.open && 'bg-line/[0.04] py-1.5')}>
              <FolderButton folder={f} onToggle={() => updateFolder(f.id, { open: !f.open })} onRename={() => void renameFolder(f.id)} onDelete={() => setPrefs({ railFolders: getPrefs().railFolders.filter((x) => x.id !== f.id) })} />
              <AnimatePresence initial={false}>
                {f.open &&
                  f.serverIds
                    .filter((sid) => servers[sid])
                    .map((sid) => (
                      <motion.div key={sid} initial={{ opacity: 0, scale: 0.6, height: 0 }} animate={{ opacity: 1, scale: 1, height: 'auto' }} exit={{ opacity: 0, scale: 0.6, height: 0 }} transition={spring.responsive} className="w-full">
                        <ServerButton serverId={sid} />
                      </motion.div>
                    ))}
              </AnimatePresence>
            </div>
          );
        }
        const id = en.id;
        const s = servers[id];
        if (!s) return null;
        return (
          <div
            key={id}
            draggable
            onDragStart={() => setDragId(id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (!dragId || dragId === id) return;
              const next = order.filter((x) => x !== dragId);
              next.splice(next.indexOf(id), 0, dragId);
              saveServerOrder(next);
              setDragId(null);
            }}
            className={clsx(dragId === id && 'opacity-40')}
          >
            <ServerButton serverId={id} />
          </div>
        );
      })}
      <RailItem tooltip="Adicionar um servidor" onClick={() => setCreating(true)}>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-line/15 text-fg-muted transition-colors duration-200 group-hover:border-ok/60 group-hover:bg-ok/10 group-hover:text-ok">
          <Icon name="plus" size={22} />
        </div>
      </RailItem>
      <RailItem tooltip="Explorar servidores públicos" active={loc.pathname === '/discover'} onClick={() => nav('/discover')}>
        <div className={clsx('flex h-12 w-12 items-center justify-center rounded-2xl transition-colors duration-200', loc.pathname === '/discover' ? 'grad text-white shadow-glow' : 'bg-line/[0.06] text-fg-muted group-hover:text-fg-strong')}>
          <Icon name="compass" size={22} />
        </div>
      </RailItem>
      {creating && <CreateServerModal onClose={() => setCreating(false)} />}
    </nav>
  );
}

const HOVERS = { lift: { y: -1, scale: 1.05 }, tilt: { rotate: -8, scale: 1.06 }, glow: { scale: 1.04 }, none: {} } as const;

function RailItem({ tooltip, active, unread, onClick, onContextMenu, children, badge, preview, voice, hoverFx = 'lift' }: { tooltip: string; active?: boolean; unread?: boolean; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; onContextMenu?: (e: React.MouseEvent) => void; children: React.ReactNode; badge?: number; preview?: React.ReactNode; voice?: boolean; hoverFx?: keyof typeof HOVERS }) {
  const [hover, setHover] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btn = (
        <motion.button
          onClick={onClick}
          onContextMenu={onContextMenu}
          className={clsx('relative rounded-2xl', active && 'shadow-glow', hoverFx === 'glow' && 'studio-hover-glow')}
          aria-label={tooltip}
          whileHover={HOVERS[hoverFx]}
          whileTap={{ scale: 0.92 }}
          transition={spring.snappy}
        >
          {children}
          {!!badge && (
            // contextual micro-interaction: the badge pops when a new mention arrives
            <motion.span key={badge} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 700, damping: 18 }} className="absolute -bottom-0.5 -right-0.5 min-w-[20px] rounded-full border-[3px] border-bg-rail bg-danger px-1 text-center text-[11px] font-bold leading-[13px] text-white">
              {badge > 99 ? '99+' : badge}
            </motion.span>
          )}
          {voice && !badge && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-[3px] border-bg-rail bg-ok text-white" aria-label="Pessoas em call agora">
              <Icon name="speaker" size={9} strokeWidth={3} />
            </span>
          )}
        </motion.button>
  );
  return (
    <div
      className="group relative flex w-full justify-center"
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return;
        setHover(true);
        if (preview) {
          const el = e.currentTarget;
          timer.current = setTimeout(() => setRect(el.getBoundingClientRect()), 260); // small delay: no flicker while sweeping the rail
        }
      }}
      onPointerLeave={() => {
        setHover(false);
        if (timer.current) clearTimeout(timer.current);
        setRect(null);
      }}
      onPointerDown={() => {
        setHover(false);
        if (timer.current) clearTimeout(timer.current);
        setRect(null);
      }}
    >
      <Pill state={active ? 'active' : hover ? 'hover' : unread ? 'unread' : 'none'} />
      {preview ? btn : <Tooltip label={tooltip} side="right">{btn}</Tooltip>}
      {preview &&
        createPortal(
          <AnimatePresence>
            {rect && (
              <motion.div
                key="pv"
                initial={{ opacity: 0, x: -6, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -4, transition: { duration: dur.instant } }}
                transition={{ duration: dur.short, ease: ease.out }}
                className="pointer-events-none fixed z-[80] w-[264px] origin-left overflow-hidden rounded-2xl border border-line/[0.08] bg-bg-float shadow-float"
                style={{ left: rect.right + 10, top: Math.max(8, Math.min(window.innerHeight - 220, rect.top - 8)) }}
                role="tooltip"
              >
                {preview}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

/** Hover preview: name, description, who is in voice and what members are playing — only what this user can already see. */
function ServerPreview({ serverId }: { serverId: string }) {
  const s = useStore((st) => st.servers[serverId]);
  const data = useStoreShallow((st) => {
    const voice: Record<string, string[]> = {};
    for (const v of Object.values(st.voiceStates)) {
      if (v.serverId !== serverId || !st.channels[v.channelId]) continue; // only channels this user can see
      if ((st.presences[v.userId]?.status ?? 'offline') === 'offline') continue; // invisible people stay hidden
      (voice[v.channelId] ??= []).push(v.userId);
    }
    const members = Object.keys(st.members[serverId] ?? {});
    let online = 0;
    let playing = 0;
    for (const uid of members) {
      const pr = st.presences[uid];
      if (!pr || pr.status === 'offline') continue;
      online++;
      if (pr.activity) playing++;
    }
    return { voice: JSON.stringify(voice), online, total: members.length, playing };
  });
  if (!s) return null;
  const voice = JSON.parse(data.voice) as Record<string, string[]>;
  const chans = Object.entries(voice);
  return (
    <div>
      <div className="relative h-14 overflow-hidden">
        <ServerCover server={s} theme={themeOf(s)} fade={false} still />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-bg-float" />
      </div>
      <div className="-mt-6 px-3.5 pb-3">
        <div className="flex items-end gap-2.5">
          <span className="rounded-2xl ring-4 ring-bg-float">
            <ServerIcon name={s.name} iconUrl={s.iconUrl} size={40} active />
          </span>
          <div className="min-w-0 pb-0.5">
            <div className="truncate text-[14px] font-extrabold text-fg-strong">{s.name}</div>
            <div className="text-[11px] text-fg-muted">
              <span className="text-ok">●</span> {data.online} online · {data.total} {data.total === 1 ? 'membro' : 'membros'}
            </div>
          </div>
        </div>
        {s.description && <p className="mt-2 line-clamp-2 text-[12px] text-fg-muted">{s.description}</p>}
        {chans.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {chans.slice(0, 3).map(([cid, uids]) => (
              <div key={cid} className="flex items-center gap-2 rounded-xl bg-ok/10 px-2 py-1.5">
                <Icon name="speaker" size={13} className="shrink-0 text-ok" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-fg">{get().channels[cid]?.name}</span>
                <span className="flex -space-x-1.5">
                  {uids.slice(0, 4).map((u) => (
                    <span key={u} className="rounded-full ring-2 ring-bg-float">
                      <Avatar userId={u} size={18} />
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
        {data.playing > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-muted">
            <Icon name="gamepad" size={13} className="text-violet-400" /> {data.playing} {data.playing === 1 ? 'pessoa jogando ou ouvindo' : 'pessoas jogando ou ouvindo'}
          </div>
        )}
      </div>
    </div>
  );
}

/** Where the clicked server icon was, so the channel header can grow out of it (shared transition). */
export let lastRailRect: { serverId: string; rect: DOMRect; at: number } | null = null;

function FolderButton({ folder, onToggle, onRename, onDelete }: { folder: RailFolder; onToggle: () => void; onRename: () => void; onDelete: () => void }) {
  const servers = useStore((s) => s.servers);
  const mentions = useStore((st) => folder.serverIds.reduce((a, sid) => a + Object.values(st.channels).reduce((b, c) => (c.serverId === sid ? b + (st.readStates[c.id]?.mentionCount ?? 0) : b), 0), 0));
  const menu = useContextMenu();
  const icons = folder.serverIds.map((id) => servers[id]).filter(Boolean).slice(0, 4);
  return (
    <RailItem
      tooltip={`${folder.name} (${folder.serverIds.length})`}
      onClick={onToggle}
      badge={folder.open ? 0 : mentions}
      onContextMenu={(e) =>
        menu(e, [
          { label: folder.open ? 'Fechar pasta' : 'Abrir pasta', onClick: onToggle },
          { label: 'Renomear pasta', onClick: onRename },
          { label: 'Desfazer pasta', onClick: onDelete, danger: true },
        ])
      }
    >
      <div className={clsx('grid h-12 w-12 grid-cols-2 gap-1 rounded-2xl p-1.5 transition-colors', folder.open ? 'bg-brand/15' : 'bg-line/[0.08] group-hover:bg-line/[0.12]')}>
        {folder.open ? (
          <span className="col-span-2 row-span-2 flex items-center justify-center text-brand">
            <Icon name="folder" size={20} />
          </span>
        ) : (
          icons.map((sv) => <ServerIcon key={sv!.id} name={sv!.name} iconUrl={sv!.iconUrl} size={16} />)
        )}
      </div>
    </RailItem>
  );
}

function DmBubble({ channelId }: { channelId: string }) {
  const c = useStore((s) => s.channels[channelId]);
  const count = useStore((s) => s.readStates[channelId]?.mentionCount ?? 0);
  const nav = useNavigate();
  if (!c) return null;
  const other = c.recipients?.[0];
  const name = c.type === 'group_dm' ? c.name || c.recipients?.map((r) => r.displayName).join(', ') || 'Grupo' : (other?.displayName ?? 'DM');
  return (
    <RailItem tooltip={name} onClick={() => nav(`/channels/@me/${channelId}`)} badge={count}>
      <Avatar userId={other?.id ?? channelId} size={48} />
    </RailItem>
  );
}

function ServerButton({ serverId }: { serverId: string }) {
  const s = useStore((st) => st.servers[serverId])!;
  const loc = useLocation();
  const nav = useNavigate();
  const menu = useContextMenu();
  const active = loc.pathname.startsWith(`/channels/${serverId}`);
  const unread = useStore((st) => Object.values(st.channels).some((c) => c.serverId === serverId && (c.type === 'text' || c.type === 'announcement') && isUnread(c.id)));
  const mentions = useStore((st) => Object.values(st.channels).reduce((a, c) => (c.serverId === serverId ? a + (st.readStates[c.id]?.mentionCount ?? 0) : a), 0));
  const me = useStore((st) => st.me);
  const mobile = useIsMobile();
  const inVoice = useStore((st) => !mobile && Object.values(st.voiceStates).some((v) => v.serverId === serverId && st.channels[v.channelId] && (st.presences[v.userId]?.status ?? 'offline') !== 'offline'));
  const folders = usePrefs((p) => p.railFolders);
  const [modal, setModal] = useState<'invite' | 'settings' | null>(null);
  const perms = BigInt(s.myPermissions);
  const inFolder = folders.find((f) => f.serverIds.includes(serverId));
  const theme = themeOf(s);
  const effects = useServerEffects();
  return (
    <>
      <RailItem
        tooltip={s.name}
        active={active}
        unread={unread}
        badge={mentions}
        voice={inVoice}
        hoverFx={mobile || !effects ? 'lift' : theme.hover}
        preview={mobile ? undefined : <ServerPreview serverId={serverId} />}
        onClick={(e) => {
          lastRailRect = { serverId, rect: e.currentTarget.getBoundingClientRect(), at: performance.now() };
          nav(`/channels/${serverId}`);
        }}
        onContextMenu={(e) =>
          menu(e, [
            ...(mobile
              ? []
              : [
                  { label: 'Nova pasta com este servidor', onClick: () => void newFolder(serverId) },
                  ...folders.filter((f) => f !== inFolder).map((f) => ({ label: `Mover para a pasta “${f.name}”`, onClick: () => moveToFolder(serverId, f.id) })),
                  { label: 'Tirar da pasta', onClick: () => moveToFolder(serverId, null), hidden: !inFolder },
                  { separator: true, label: '' },
                ]),
            {
              label: 'Marcar como lido',
              onClick: () => Object.values(get().channels).filter((c) => c.serverId === serverId).forEach((c) => ackChannel(c.id)),
            },
            { separator: true, label: '' },
            { label: 'Convidar pessoas', onClick: () => setModal('invite'), hidden: !hasPermission(perms, Permissions.CREATE_INVITE) },
            { label: 'Configurações do servidor', onClick: () => setModal('settings'), hidden: !hasPermission(perms, Permissions.MANAGE_SERVER | 0n) && !hasPermission(perms, Permissions.MANAGE_ROLES) && !hasPermission(perms, Permissions.VIEW_AUDIT_LOG) && !hasPermission(perms, Permissions.BAN_MEMBERS) },
            { label: 'Copiar ID', onClick: () => navigator.clipboard.writeText(serverId) },
            {
              label: 'Sair do servidor',
              danger: true,
              hidden: s.ownerId === me?.id,
              onClick: async () => {
                if (await confirmDialog({ title: `Sair de '${s.name}'`, body: 'Tem certeza? Você só poderá voltar com um novo convite.', confirm: 'Sair do servidor', danger: true })) {
                  api('DELETE', `/servers/${serverId}/members/@me`).catch(toastError);
                }
              },
            },
          ])
        }
      >
        <IconFrame frame={mobile ? 'none' : theme.iconFrame} accent={theme.accent}>
          <ServerIcon name={s.name} iconUrl={s.iconUrl} active={active} />
        </IconFrame>
      </RailItem>
      {modal === 'invite' && <InviteModal serverId={serverId} onClose={() => setModal(null)} />}
      {modal === 'settings' && <Suspense fallback={null}><ServerSettings serverId={serverId} onClose={() => setModal(null)} /></Suspense>}
    </>
  );
}

type RailFolder = Prefs['railFolders'][number];
function updateFolder(id: string, patch: Partial<RailFolder>) {
  setPrefs({ railFolders: getPrefs().railFolders.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
}
function moveToFolder(serverId: string, folderId: string | null) {
  const next = getPrefs()
    .railFolders.map((f) => ({ ...f, serverIds: f.serverIds.filter((x) => x !== serverId) }))
    .map((f) => (f.id === folderId ? { ...f, serverIds: [...f.serverIds, serverId] } : f))
    .filter((f) => f.serverIds.length > 0);
  setPrefs({ railFolders: next });
}
async function newFolder(serverId: string) {
  const name = await promptDialog({ title: 'Nova pasta', label: 'Nome da pasta', initial: 'Pasta', confirm: 'Criar pasta', maxLength: 32 });
  if (!name) return;
  const id = `f${Date.now().toString(36)}`;
  const cleaned = getPrefs().railFolders.map((f) => ({ ...f, serverIds: f.serverIds.filter((x) => x !== serverId) })).filter((f) => f.serverIds.length);
  setPrefs({ railFolders: [...cleaned, { id, name, serverIds: [serverId], open: true }] });
}
async function renameFolder(id: string) {
  const f = getPrefs().railFolders.find((x) => x.id === id);
  const name = await promptDialog({ title: 'Renomear pasta', label: 'Nome da pasta', initial: f?.name ?? '', confirm: 'Salvar', maxLength: 32 });
  if (name) updateFolder(id, { name });
}
