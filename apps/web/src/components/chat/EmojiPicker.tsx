import { useMemo, useState } from 'react';
import { Popover } from '../common/overlay';
import { EMOJI_CATEGORIES, searchEmoji } from '@/lib/emoji';
import { isMobileNow } from '@/lib/mobile';
import { useStore, EMPTY } from '@/store';

/** Picks a unicode emoji or a server custom emoji (returned as "custom:<id>" for reactions or "<:name:id>" for text). */
export function EmojiPicker({ x, y, serverId, onPick, onClose, forText }: { x: number; y: number; serverId: string | null; onPick: (e: string) => void; onClose: () => void; forText?: boolean }) {
  const [q, setQ] = useState('');
  const custom = useStore((s) => (serverId ? (s.emojis[serverId] ?? EMPTY) : EMPTY));
  const results = useMemo(() => (q ? searchEmoji(q) : null), [q]);
  const customResults = custom.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()));
  const pickCustom = (e: (typeof custom)[number]) => onPick(forText ? `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>` : `custom:${e.id}`);
  return (
    <Popover x={Math.max(8, x)} y={y} onClose={onClose}>
      <div className="flex h-[360px] w-[340px] flex-col rounded-2xl border border-line/[0.08] bg-bg-float shadow-float phone:h-[min(420px,60dvh)] phone:w-full phone:rounded-none phone:border-0 phone:shadow-none">
        <div className="p-2">
          <input className="input py-1.5 text-sm" placeholder="Encontre o emoji perfeito" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!isMobileNow()} />
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-2">
          {customResults.length > 0 && (
            <>
              <div className="sticky top-0 bg-bg-float py-1 text-xs font-semibold uppercase text-fg-muted">Deste servidor</div>
              <div className="grid grid-cols-8 gap-1">
                {customResults.map((e) => (
                  <button key={e.id} title={`:${e.name}:`} className="flex h-9 w-9 items-center justify-center rounded hover:bg-fg/10" onClick={() => pickCustom(e)}>
                    <img src={e.url} alt={e.name} className="h-7 w-7 object-contain" />
                  </button>
                ))}
              </div>
            </>
          )}
          {(results ? [{ name: 'Resultados', items: results }] : EMOJI_CATEGORIES).map((cat) => (
            <div key={cat.name}>
              <div className="sticky top-0 bg-bg-float py-1 text-xs font-semibold uppercase text-fg-muted">{cat.name}</div>
              <div className="grid grid-cols-8 gap-1">
                {cat.items.map(([e, n]) => (
                  <button key={e} title={n.split(' ')[0]} className="flex h-9 w-9 items-center justify-center rounded-lg text-2xl transition-transform duration-150 hover:scale-125 hover:bg-line/[0.06]" onClick={() => onPick(e)}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {results && !results.length && !customResults.length && <p className="p-4 text-center text-sm text-fg-muted">Nenhum emoji encontrado.</p>}
        </div>
      </div>
    </Popover>
  );
}
