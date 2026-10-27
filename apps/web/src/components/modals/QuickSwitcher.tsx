import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { get } from '@/store';
import { Modal } from '../common/overlay';
import { Icon } from '../common/Icon';
import { channelIcon } from '../layout/ChannelSidebar';
import { dmName } from '../layout/HomeSidebar';
import { openDm } from '@/lib/actions';

type Item = { key: string; label: string; sub: string; icon: Parameters<typeof Icon>[0]['name']; go: () => void | Promise<void> };

export function QuickSwitcher({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const items = useMemo<Item[]>(() => {
    const st = get();
    const ql = q.toLowerCase().replace(/^[#@*]/, '');
    const out: Item[] = [];
    for (const c of Object.values(st.channels)) {
      if (c.type === 'category') continue;
      const name = c.serverId ? c.name : dmName(c);
      if (!name.toLowerCase().includes(ql)) continue;
      out.push({
        key: c.id,
        label: name,
        sub: c.serverId ? (st.servers[c.serverId]?.name ?? '') : 'Mensagem direta',
        icon: c.serverId ? channelIcon(c.type) : 'at',
        go: () => nav(c.serverId ? `/channels/${c.serverId}/${c.id}` : `/channels/@me/${c.id}`),
      });
    }
    for (const r of Object.values(st.relationships))
      if (r.type === 'friend' && (r.user.username.includes(ql) || r.user.displayName.toLowerCase().includes(ql)))
        out.push({ key: 'u' + r.userId, label: r.user.displayName, sub: r.user.username, icon: 'user', go: async () => nav(`/channels/@me/${await openDm(r.userId)}`) });
    for (const s of Object.values(st.servers)) if (s.name.toLowerCase().includes(ql)) out.push({ key: 's' + s.id, label: s.name, sub: 'Servidor', icon: 'globe', go: () => nav(`/channels/${s.id}`) });
    return out.slice(0, 30);
  }, [q, nav]);
  const run = async (it: Item | undefined) => {
    if (!it) return;
    onClose();
    await it.go();
  };
  return (
    <Modal onClose={onClose}>
      <div className="py-2">
        <input
          className="input py-3 text-lg"
          placeholder="Para onde você quer ir?"
          autoFocus
          value={q}
          onChange={(e) => (setQ(e.target.value), setSel(0))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setSel((sel + 1) % Math.max(1, items.length)));
            if (e.key === 'ArrowUp') (e.preventDefault(), setSel((sel - 1 + items.length) % Math.max(1, items.length)));
            if (e.key === 'Enter') void run(items[sel]);
          }}
        />
        <div className="mt-3 max-h-80 overflow-y-auto">
          {items.map((it, i) => (
            <button key={it.key} onMouseEnter={() => setSel(i)} onClick={() => run(it)} className={clsx('flex w-full items-center gap-3 rounded px-2 py-2 text-left', i === sel ? 'bg-fg/10 text-fg-strong' : 'text-fg')}>
              <Icon name={it.icon} size={18} className="text-fg-muted" />
              <span className="flex-1 truncate">{it.label}</span>
              <span className="truncate text-xs text-fg-faint">{it.sub}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-fg-faint">Dica: use Ctrl+K a qualquer momento.</p>
      </div>
    </Modal>
  );
}
