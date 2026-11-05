import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { get } from '@/store';
import { Modal } from '../common/overlay';
import { Icon, type IconName } from '../common/Icon';
import { channelIcon } from '../layout/ChannelSidebar';
import { dmName } from '../layout/HomeSidebar';
import { openDm } from '@/lib/actions';
import { activityLine } from '@/lib/activity';
import { openSettings } from '@/lib/ui';
import { isMobileNow } from '@/lib/mobile';

type Group = 'Ações' | 'Atividades' | 'Canais' | 'Conversas' | 'Pessoas' | 'Servidores';
type Item = { key: string; label: string; sub: string; icon: IconName; group: Group; score: number; go: () => void | Promise<void> };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** 3 = starts with, 2 = word starts with, 1 = contains, 0 = no match */
function match(text: string, q: string) {
  if (!q) return 1;
  const t = norm(text);
  if (t.startsWith(q)) return 3;
  if (t.split(/[\s\-_#]+/).some((w) => w.startsWith(q))) return 2;
  return t.includes(q) ? 1 : 0;
}

/**
 * Command bar (Ctrl+K): go to channels, DMs, people and servers, see who is playing, and run app actions
 * (profile, settings, audio devices, focus mode, what's new). Prefixes: # channels, @ people, * servers, > actions.
 * Context: with no query, the current server's channels and the latest DMs come first.
 */
export function QuickSwitcher({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const loc = useLocation();
  const items = useMemo<Item[]>(() => {
    const st = get();
    const prefix = /^[#@*>]/.test(q) ? q[0] : '';
    const ql = norm(q.slice(prefix ? 1 : 0).trim());
    const out: Item[] = [];
    const curServer = /^\/channels\/(\d+)/.exec(loc.pathname)?.[1] ?? null;
    const want = (g: Group) => !prefix || (prefix === '#' && g === 'Canais') || (prefix === '@' && (g === 'Pessoas' || g === 'Conversas' || g === 'Atividades')) || (prefix === '*' && g === 'Servidores') || (prefix === '>' && g === 'Ações');

    if (want('Ações') && !isMobileNow()) {
      const actions: Array<[string, IconName, () => void, string]> = [
        ['Editar perfil', 'user', () => openSettings('profile'), 'banner, efeitos, molduras'],
        ['Configurações', 'settings', () => openSettings('account'), 'conta e app'],
        ['Dispositivos de áudio', 'mic', () => openSettings('voice'), 'microfone e saída'],
        ['Aparência e movimento', 'palette', () => openSettings('appearance'), 'tema, UltraMotion, densidade'],
        ['Modo foco', 'sidebar', () => void import('../layout/AppShell').then((m) => m.toggleFocusMode()), 'Ctrl+Shift+F'],
        ['Ver novidades da versão', 'sparkle', () => void import('../common/WhatsNew').then((m) => m.openWhatsNew(true)), 'o que chegou'],
        ['Início (Pulse)', 'zap', () => nav('/channels/@me'), 'sua galera agora'],
      ];
      for (const [label, icon, go, sub] of actions) {
        const sc = match(label, ql);
        if (sc && (ql || prefix === '>')) out.push({ key: 'a' + label, label, sub, icon, group: 'Ações', score: sc + 0.5, go });
      }
    }
    if (want('Atividades'))
      for (const r of Object.values(st.relationships)) {
        if (r.type !== 'friend') continue;
        const pr = st.presences[r.userId];
        if (!pr || pr.status === 'offline' || !pr.activity) continue;
        const line = activityLine(pr.activity) ?? '';
        const sc = Math.max(match(r.user.displayName, ql), match(line, ql), match(pr.activity.name, ql));
        if (sc) out.push({ key: 'act' + r.userId, label: `${r.user.displayName} — ${line}`, sub: 'Abrir conversa', icon: pr.activity.type === 'playing' ? 'gamepad' : 'music', group: 'Atividades', score: sc + 0.2, go: async () => nav(`/channels/@me/${await openDm(r.userId)}`) });
      }
    for (const c of Object.values(st.channels)) {
      if (c.type === 'category') continue;
      const isDm = !c.serverId;
      const g: Group = isDm ? 'Conversas' : 'Canais';
      if (!want(g)) continue;
      const name = isDm ? dmName(c) : c.name;
      let sc = match(name, ql);
      if (!sc) continue;
      if (!ql && c.serverId && c.serverId === curServer) sc += 1; // context: current server first
      if (!ql && isDm) sc += 0.5 - st.dmIds.indexOf(c.id) / 100;
      out.push({
        key: c.id,
        label: name,
        sub: c.serverId ? (st.servers[c.serverId]?.name ?? '') : 'Mensagem direta',
        icon: c.serverId ? channelIcon(c.type) : 'at',
        group: g,
        score: sc,
        go: () => nav(c.serverId ? `/channels/${c.serverId}/${c.id}` : `/channels/@me/${c.id}`),
      });
    }
    if (want('Pessoas'))
      for (const r of Object.values(st.relationships)) {
        if (r.type !== 'friend') continue;
        const sc = Math.max(match(r.user.displayName, ql), match(r.user.username, ql));
        if (sc && ql) out.push({ key: 'u' + r.userId, label: r.user.displayName, sub: r.user.username, icon: 'user', group: 'Pessoas', score: sc, go: async () => nav(`/channels/@me/${await openDm(r.userId)}`) });
      }
    if (want('Servidores'))
      for (const s of Object.values(st.servers)) {
        const sc = match(s.name, ql);
        if (sc) out.push({ key: 's' + s.id, label: s.name, sub: 'Servidor', icon: 'globe', group: 'Servidores', score: sc - (ql ? 0 : 0.5), go: () => nav(`/channels/${s.id}`) });
      }
    return out.sort((a, b) => b.score - a.score).slice(0, 40);
  }, [q, nav, loc.pathname]);
  const run = async (it: Item | undefined) => {
    if (!it) return;
    onClose();
    await it.go();
  };
  let lastGroup: Group | null = null;
  return (
    <Modal onClose={onClose}>
      <div className="py-2" role="combobox" aria-expanded aria-haspopup="listbox">
        <input
          className="input py-3 text-lg"
          placeholder="Para onde você quer ir? (# canais · @ pessoas · * servidores · > ações)"
          aria-label="Barra de comandos"
          autoFocus
          value={q}
          onChange={(e) => (setQ(e.target.value), setSel(0))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setSel((sel + 1) % Math.max(1, items.length)));
            if (e.key === 'ArrowUp') (e.preventDefault(), setSel((sel - 1 + items.length) % Math.max(1, items.length)));
            if (e.key === 'Enter') void run(items[sel]);
          }}
        />
        <div className="mt-3 max-h-80 overflow-y-auto" role="listbox">
          {items.map((it, i) => {
            const header = it.group !== lastGroup;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {header && q && <div className="eyebrow px-2 pb-1 pt-2">{it.group}</div>}
                <button role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => run(it)} className={clsx('flex w-full items-center gap-3 rounded px-2 py-2 text-left', i === sel ? 'bg-fg/10 text-fg-strong' : 'text-fg')}>
                  <Icon name={it.icon} size={18} className="text-fg-muted" />
                  <span className="flex-1 truncate">{it.label}</span>
                  <span className="truncate text-xs text-fg-faint">{it.sub}</span>
                </button>
              </div>
            );
          })}
          {!items.length && <p className="px-2 py-6 text-center text-sm text-fg-muted">Nada encontrado para “{q}”.</p>}
        </div>
        <p className="mt-2 text-xs text-fg-faint">↑↓ para escolher · Enter para abrir · Ctrl+K a qualquer momento.</p>
      </div>
    </Modal>
  );
}
