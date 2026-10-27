import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Message } from '@aldetes/shared';
import { useStore, get } from '@/store';
import { loadMessages, ackChannel } from '@/lib/actions';
import { MessageRow } from './MessageRow';
import { Icon } from '../common/Icon';
import { channelIcon } from '../layout/ChannelSidebar';
import { dmName } from '../layout/HomeSidebar';
import { Avatar } from '../common/Avatar';
import { toastError } from '../common/overlay';

const GROUP_MS = 7 * 60 * 1000;

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function MessageList({ channelId, onReply }: { channelId: string; onReply: (m: Message) => void }) {
  const cm = useStore((s) => s.messages[channelId]);
  const channel = useStore((s) => s.channels[channelId])!;
  const ref = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const [newMarker] = useState(() => get().readStates[channelId]?.lastReadMessageId ?? null);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    loadMessages(channelId).catch(toastError);
  }, [channelId]);

  // stick to bottom / keep position when prepending
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [cm?.items]);

  // keep bottom pinned when images load / container resizes
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el.firstElementChild!);
    return () => ro.disconnect();
  }, []);

  // ack when visible at bottom
  const lastId = cm?.items[cm.items.length - 1]?.id;
  useEffect(() => {
    if (atBottom.current && document.hasFocus()) ackChannel(channelId);
    const onFocus = () => atBottom.current && ackChannel(channelId);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [channelId, lastId]);

  const onScroll = () => {
    const el = ref.current!;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    atBottom.current = bottom;
    setShowJump(!bottom && el.scrollHeight - el.scrollTop - el.clientHeight > 800);
    if (bottom && document.hasFocus()) ackChannel(channelId);
    if (el.scrollTop < 300 && cm?.hasMore && !cm.loading && cm.items.length) {
      prevHeight.current = el.scrollHeight;
      loadMessages(channelId, { before: cm.items.find((m) => !m.pending)?.id }).catch(() => {
        prevHeight.current = null;
      });
    }
  };

  const items = cm?.items ?? [];
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} onScroll={onScroll} className="scroll-thin absolute inset-0 overflow-y-auto overflow-x-hidden" role="log" aria-live="polite">
        <div className="flex min-h-full flex-col justify-end pb-6">
          {cm && !cm.hasMore && <ChannelIntro channelId={channelId} />}
          {(cm?.loading || !cm) && (
            <div className="flex flex-col gap-4 px-4 py-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex animate-pulse gap-4">
                  <div className="h-10 w-10 rounded-full bg-fg/10" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 rounded bg-fg/10" />
                    <div className="h-3 w-2/3 rounded bg-fg/10" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {items.map((m, i) => {
            const prev = items[i - 1];
            const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
            const grouped =
              !!prev && !newDay && prev.author.id === m.author.id && prev.type === 'default' && m.type === 'default' && !m.replyTo && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_MS;
            const showNew = newMarker && prev && prev.id <= newMarker && m.id > newMarker && m.author.id !== get().me?.id;
            return (
              <Fragment key={m.nonce && m.pending ? m.nonce : m.id}>
                {newDay && (
                  <div className="mx-4 my-2 flex items-center gap-2 text-xs font-semibold text-fg-faint">
                    <div className="h-px flex-1 bg-line/10" />
                    {new Date(m.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    <div className="h-px flex-1 bg-line/10" />
                  </div>
                )}
                {showNew && (
                  <div className="relative mx-4 my-1 h-px bg-danger">
                    <span className="absolute -top-2 right-0 rounded bg-danger px-1 text-[10px] font-bold uppercase text-white">Novas</span>
                  </div>
                )}
                <MessageRow message={m} channel={channel} grouped={grouped} onReply={onReply} />
              </Fragment>
            );
          })}
        </div>
      </div>
      {showJump && (
        <button
          className="absolute bottom-3 right-6 flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-sm font-medium text-white shadow-lg"
          onClick={() => {
            const el = ref.current!;
            el.scrollTop = el.scrollHeight;
          }}
        >
          Ir para o presente <Icon name="chevronDown" size={14} />
        </button>
      )}
    </div>
  );
}

function ChannelIntro({ channelId }: { channelId: string }) {
  const c = useStore((s) => s.channels[channelId])!;
  if (!c.serverId) {
    const other = c.recipients?.[0];
    return (
      <div className="m-4 mt-16">
        {c.type === 'dm' && other && <Avatar userId={other.id} size={80} />}
        <h2 className="mt-3 text-3xl font-bold text-fg-strong">{dmName(c)}</h2>
        <p className="mt-1 text-fg-muted">
          {c.type === 'dm' ? (
            <>
              Este é o começo do seu histórico de mensagens diretas com <b>{other?.displayName}</b>.
            </>
          ) : (
            'Bem-vindo ao início do grupo.'
          )}
        </p>
      </div>
    );
  }
  return (
    <div className="m-4 mt-16">
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-fg/10 text-fg-strong">
        <Icon name={channelIcon(c.type)} size={40} />
      </div>
      <h2 className="text-3xl font-bold text-fg-strong">Boas-vindas a #{c.name}!</h2>
      <p className="mt-1 text-fg-muted">Este é o começo do canal #{c.name}.</p>
    </div>
  );
}
