import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { motion } from 'motion/react';
import type { Channel, Message } from '@aldetes/shared';
import { api } from '@/lib/api';
import { onGateway } from '@/lib/gateway';
import { useStore } from '@/store';
import { usePrefs, panelWidth, setPanelWidth, PANEL_LIMITS } from '@/lib/prefs';
import { spring } from '@/lib/motion';
import { Icon, type IconName } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { MemberList } from './MemberList';
import { MiniMessage } from './MiniMessage';
import { ResizeHandle } from '../layout/ResizeHandle';
import { useMemberMenu } from '../common/UserPopout';
import { useContextMenu } from '../common/overlay';
import { STATUS_LABEL } from '../common/Avatar';

type Tab = 'people' | 'files' | 'links' | 'pins';
const TABS: Array<[Tab, string, IconName]> = [
  ['people', 'Pessoas', 'users'],
  ['files', 'Arquivos', 'file'],
  ['links', 'Links', 'link'],
  ['pins', 'Fixadas', 'pin'],
];
const URL_RE = /https?:\/\/[^\s<>()]+/g;

/**
 * Desktop chat side panel: participants, files, links and pinned messages of THIS conversation, all from the API
 * (search endpoint with `has` filters, pins endpoint). Width is resizable, clamped and saved per user.
 */
export function ChatInfoPanel({ channel, onJump }: { channel: Channel; onJump: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>('people');
  const meId = useStore((s) => s.me?.id);
  usePrefs((p) => p.panelWidths);
  const width = panelWidth(meId, 'members');
  const box = useRef<HTMLElement>(null);
  const L = PANEL_LIMITS.members;
  return (
    <>
      <ResizeHandle side="right" label="Largura do painel lateral" value={width} min={L.min} max={L.max} def={L.def} onPreview={(px) => box.current && (box.current.style.width = `${px}px`)} onCommit={(px) => meId && setPanelWidth(meId, 'members', px)} />
      <aside ref={box} style={{ width }} className="flex h-full shrink-0 flex-col border-l border-line/[0.06] bg-line/[0.015]" aria-label="Detalhes da conversa">
        <div className="flex shrink-0 gap-0.5 p-1.5" role="tablist">
          {TABS.map(([t, label, icon]) => (
            <button key={t} role="tab" aria-selected={tab === t} title={label} onClick={() => setTab(t)} aria-label={label} className={clsx('relative flex min-w-0 items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-bold transition-colors', tab === t ? 'flex-[2] text-fg-strong' : 'flex-1 text-fg-faint hover:text-fg')}>
              {tab === t && <motion.span layoutId={`info-tab-${channel.id}`} transition={spring.responsive} className="absolute inset-0 rounded-lg bg-line/[0.08]" />}
              <Icon name={icon} size={13} className="relative shrink-0" />
              {/* label only on the active tab: four tabs always fit, even at the minimum width */}
              {tab === t && <span className="relative truncate">{label}</span>}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 [&_aside]:border-l-0 [&_aside]:bg-transparent">
          {tab === 'people' ? (
            channel.serverId || channel.type === 'group_dm' ? <MemberList channel={channel} /> : <DmPeople channel={channel} />
          ) : tab === 'pins' ? (
            <Pins channel={channel} onJump={onJump} />
          ) : (
            <Found channel={channel} kind={tab} onJump={onJump} />
          )}
        </div>
      </aside>
    </>
  );
}

function DmPeople({ channel }: { channel: Channel }) {
  const me = useStore((s) => s.me);
  const ids = [...(channel.recipients?.map((r) => r.id) ?? []), me?.id].filter(Boolean) as string[];
  return (
    <div className="scroll-thin h-full overflow-y-auto px-2">
      <div className="eyebrow px-2 pb-1.5 pt-2">Nesta conversa — {ids.length}</div>
      {ids.map((id) => (
        <PersonRow key={id} userId={id} />
      ))}
    </div>
  );
}

function PersonRow({ userId }: { userId: string }) {
  const u = useStore((s) => s.users[userId] ?? (s.me?.id === userId ? s.me : undefined));
  const pr = useStore((s) => s.presences[userId]);
  const menu = useContextMenu();
  const items = useMemberMenu(userId, null);
  if (!u) return null;
  return (
    <div className="flex h-11 items-center gap-2.5 rounded-xl px-2 hover:bg-line/[0.04]" onContextMenu={(e) => menu(e, items())}>
      <Avatar userId={userId} size={30} showStatus />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-fg">{u.displayName}</span>
        <span className="block truncate text-[11px] text-fg-faint">{pr?.customStatus || STATUS_LABEL[pr?.status ?? 'offline']}</span>
      </span>
    </div>
  );
}

function Pins({ channel, onJump }: { channel: Channel; onJump: (id: string) => void }) {
  const [pins, setPins] = useState<Message[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api<Message[]>('GET', `/channels/${channel.id}/pins`).then((r) => alive && setPins(r), () => alive && setPins([]));
    load();
    const off = onGateway('pin:update', (d: { channelId: string }) => d.channelId === channel.id && load());
    return () => {
      alive = false;
      off();
    };
  }, [channel.id]);
  return <List items={pins} empty="Nenhuma mensagem fixada aqui." channel={channel} onJump={onJump} />;
}

function Found({ channel, kind, onJump }: { channel: Channel; kind: 'files' | 'links'; onJump: (id: string) => void }) {
  const [res, setRes] = useState<Message[] | null>(null);
  useEffect(() => {
    let alive = true;
    setRes(null);
    const p = new URLSearchParams({ channelId: channel.id, has: kind === 'files' ? 'attachment' : 'link' });
    api<{ messages: Message[] }>('GET', `/search/messages?${p}`).then(
      (r) => alive && setRes(r.messages),
      () => alive && setRes([]),
    );
    return () => {
      alive = false;
    };
  }, [channel.id, kind]);
  if (kind === 'links' && res)
    return (
      <div className="scroll-thin h-full overflow-y-auto p-2">
        {!res.length && <Empty text="Nenhum link enviado nesta conversa." />}
        {res.flatMap((m) =>
          [...new Set(m.content.match(URL_RE) ?? [])].map((url) => (
            <div key={m.id + url} className="group mb-1 flex items-center gap-2 rounded-xl border border-line/[0.06] bg-line/[0.025] p-2">
              <Icon name="link" size={14} className="shrink-0 text-sky-400" />
              <a href={url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate text-[12px] text-sky-400 hover:underline" title={url}>
                {url.replace(/^https?:\/\//, '')}
              </a>
              <button className="text-[11px] text-fg-faint opacity-0 hover:text-fg-strong group-hover:opacity-100" onClick={() => onJump(m.id)}>
                Ver
              </button>
            </div>
          )),
        )}
      </div>
    );
  return <List items={res} empty="Nenhum arquivo enviado nesta conversa." channel={channel} onJump={onJump} />;
}

function List({ items, empty, channel, onJump }: { items: Message[] | null; empty: string; channel: Channel; onJump: (id: string) => void }) {
  return (
    <div className="scroll-thin flex h-full flex-col gap-2 overflow-y-auto p-2">
      {items === null && <p className="p-4 text-center text-xs text-fg-muted">Carregando…</p>}
      {items?.length === 0 && <Empty text={empty} />}
      {items?.map((m) => (
        <MiniMessage key={m.id} m={m} serverId={channel.serverId} onJump={() => onJump(m.id)} />
      ))}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <p className="px-3 py-8 text-center text-[12px] text-fg-faint">{text}</p>;
