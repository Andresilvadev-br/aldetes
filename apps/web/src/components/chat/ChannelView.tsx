import { useEffect, useState } from 'react';
import { Permissions, hasPermission } from '@aldetes/shared';
import { useStore, channelPermissions } from '@/store';
import { Icon } from '../common/Icon';
import { Tooltip } from '../common/overlay';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { MemberList } from './MemberList';
import { PinsPopover } from './PinsPopover';
import { SearchPanel } from './SearchPanel';
import { ThreadsPopover } from './ThreadsPopover';
import { ForumView } from './ForumView';
import { VoiceChannelView } from '../voice/VoiceChannelView';
import { CallStage } from '../voice/CallStage';
import { channelIcon } from '../layout/ChannelSidebar';
import { dmName } from '../layout/HomeSidebar';
import { setActiveChannel } from '@/lib/notify';
import { joinVoice, useVoice } from '@/lib/voice';
import { Avatar } from '../common/Avatar';
import { useNavigate } from 'react-router-dom';
import type { Message } from '@aldetes/shared';
import { loadServerEmojis } from './emojiData';

export function ChannelView({ channelId }: { channelId: string }) {
  const channel = useStore((s) => s.channels[channelId]);
  const [showMembers, setShowMembers] = useState(() => localStorage.getItem('aldetes.members') !== '0');
  const [panel, setPanel] = useState<null | 'pins' | 'threads'>(null);
  const [search, setSearch] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const voiceChannel = useVoice((v) => v.channelId);
  const callActive = useStore((s) => Object.values(s.voiceStates).some((v) => v.channelId === channelId));
  const nav = useNavigate();
  const parent = useStore((s) => (channel?.parentId && channel.type === 'thread' ? s.channels[channel.parentId] : undefined));

  useEffect(() => {
    setActiveChannel(channelId);
    if (channel?.serverId) void loadServerEmojis(channel.serverId);
    return () => setActiveChannel(null);
  }, [channelId, channel?.serverId]);

  if (!channel) return null;
  if (channel.type === 'voice') return <VoiceChannelView channelId={channelId} />;
  if (channel.type === 'forum') return <ForumView channelId={channelId} />;

  const isDm = !channel.serverId;
  const perms = channelPermissions(channelId);
  const other = channel.recipients?.[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/30 px-4 shadow-sm">
        {isDm ? (
          channel.type === 'dm' && other ? <Avatar userId={other.id} size={24} showStatus /> : <Icon name="users" className="text-fg-muted" />
        ) : (
          <Icon name={channelIcon(channel.type)} className="text-fg-muted" />
        )}
        {parent && (
          <>
            <button className="font-semibold text-fg-muted hover:underline" onClick={() => nav(`/channels/${parent.serverId}/${parent.id}`)}>
              {parent.name}
            </button>
            <Icon name="chevronRight" size={14} className="text-fg-faint" />
          </>
        )}
        <h1 className="font-semibold text-fg-strong">{isDm ? dmName(channel) : channel.name}</h1>
        {channel.topic && (
          <>
            <div className="mx-2 h-6 w-px bg-line/10" />
            <p className="truncate text-sm text-fg-muted" title={channel.topic}>
              {channel.topic}
            </p>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          {isDm && (
            <>
              <Tooltip label="Iniciar chamada de voz" side="bottom">
                <button className="icon-btn" onClick={() => void joinVoice(channelId)} disabled={voiceChannel === channelId}>
                  <Icon name="phone" />
                </button>
              </Tooltip>
            </>
          )}
          {!isDm && channel.type !== 'thread' && (
            <Tooltip label="Threads" side="bottom">
              <button className={`icon-btn ${panel === 'threads' ? 'text-fg-strong' : ''}`} onClick={() => setPanel(panel === 'threads' ? null : 'threads')}>
                <Icon name="thread" />
              </button>
            </Tooltip>
          )}
          <Tooltip label="Mensagens fixadas" side="bottom">
            <button className={`icon-btn ${panel === 'pins' ? 'text-fg-strong' : ''}`} onClick={() => setPanel(panel === 'pins' ? null : 'pins')}>
              <Icon name="pin" />
            </button>
          </Tooltip>
          {!isDm || channel.type === 'group_dm' ? (
            <Tooltip label={showMembers ? 'Ocultar lista de membros' : 'Mostrar lista de membros'} side="bottom">
              <button
                className={`icon-btn ${showMembers ? 'text-fg-strong' : ''}`}
                onClick={() => {
                  localStorage.setItem('aldetes.members', showMembers ? '0' : '1');
                  setShowMembers(!showMembers);
                }}
              >
                <Icon name="users" />
              </button>
            </Tooltip>
          ) : null}
          <SearchBox onSearch={(q) => setSearch(q)} />
        </div>
      </header>
      {isDm && (callActive || voiceChannel === channelId) && <CallStage channelId={channelId} />}
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageList channelId={channelId} onReply={setReplyTo} />
          {hasPermission(perms, Permissions.SEND_MESSAGES) ? (
            <Composer channelId={channelId} replyTo={replyTo} onClearReply={() => setReplyTo(null)} />
          ) : (
            <div className="mx-4 mb-6 rounded-lg bg-bg-input/60 px-4 py-3 text-sm text-fg-faint">Você não tem permissão para enviar mensagens neste canal.</div>
          )}
        </div>
        {search !== null ? (
          <SearchPanel channel={channel} initial={search} onClose={() => setSearch(null)} />
        ) : (
          showMembers && (!isDm || channel.type === 'group_dm') && <MemberList channel={channel} />
        )}
        {panel === 'pins' && <PinsPopover channelId={channelId} onClose={() => setPanel(null)} />}
        {panel === 'threads' && <ThreadsPopover channelId={channelId} onClose={() => setPanel(null)} />}
      </div>
    </div>
  );
}

function SearchBox({ onSearch }: { onSearch: (q: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="relative ml-2">
      <input
        className="h-6 w-36 rounded bg-bg-rail px-2 pr-6 text-sm text-fg outline-none transition-all placeholder:text-fg-faint focus:w-56"
        placeholder="Buscar"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && v.trim() && onSearch(v.trim())}
      />
      <Icon name="search" size={14} className="pointer-events-none absolute right-1.5 top-1.5 text-fg-muted" />
    </div>
  );
}
