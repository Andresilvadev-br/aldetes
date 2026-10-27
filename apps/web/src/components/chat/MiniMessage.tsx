import type { Message } from '@aldetes/shared';
import { Avatar } from '../common/Avatar';
import { renderMarkdown } from '@/lib/markdown';
import { displayName } from '@/store';
import { AttachmentView } from './MessageRow';

export function MiniMessage({ m, serverId, onJump }: { m: Message; serverId: string | null; onJump?: () => void }) {
  return (
    <div className="group relative rounded-md bg-bg-main p-3 ring-1 ring-black/20">
      <div className="flex gap-3">
        <Avatar userId={m.author.id} url={m.author.avatarUrl} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-fg-strong">{displayName(m.author.id, serverId)}</span>
            <span className="text-xs text-fg-faint">{new Date(m.createdAt).toLocaleString('pt-BR')}</span>
          </div>
          <div className="whitespace-pre-wrap break-words text-sm text-fg">{renderMarkdown(m.content, { serverId })}</div>
          {m.attachments.slice(0, 1).map((a) => (
            <AttachmentView key={a.id} a={a} />
          ))}
        </div>
      </div>
      {onJump && (
        <button className="absolute right-2 top-2 hidden rounded bg-bg-side px-2 py-0.5 text-xs text-fg group-hover:block" onClick={onJump}>
          Ir
        </button>
      )}
    </div>
  );
}
