import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import type { BoardItem, TogetherSession } from '@aldetes/shared';
import { useStore, displayName } from '@/store';
import { useTogether, createTogether, togetherOp, closeTogether, sendPresence, serverNow, TogetherConflict } from '@/lib/together';
import { spring, dur } from '@/lib/motion';
import { Icon, type IconName } from '../common/Icon';
import { confirmDialog, toast, toastError } from '../common/overlay';

const KIND: Record<TogetherSession['kind'], { label: string; icon: IconName }> = {
  poll: { label: 'Enquete', icon: 'signal' },
  timer: { label: 'Cronômetro', icon: 'zap' },
  notes: { label: 'Notas', icon: 'edit' },
  board: { label: 'Quadro', icon: 'palette' },
};

/**
 * Together: ferramentas da call num painel à direita (pode expandir para a tela inteira).
 * Tudo que muda vem do servidor (que confere as permissões); o painel só mostra e envia operações.
 */
export default function TogetherPanel({ channelId, serverId, expanded, onExpand, onClose }: { channelId: string; serverId: string | null; expanded: boolean; onExpand: () => void; onClose: () => void }) {
  const sessions = useTogether((t) => t.byChannel[channelId] ?? EMPTY);
  const sync = useTogether((t) => t.sync);
  const open = sessions.filter((s) => !s.closedAt);
  const [active, setActive] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const current = open.find((s) => s.id === active) ?? open[0] ?? null;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-line/[0.07] bg-bg-side" data-testid="together-panel">
      <header className="flex shrink-0 items-center gap-1.5 border-b border-line/[0.06] px-3 py-2">
        <span className="text-[13px] font-black tracking-tight text-fg-strong">Together</span>
        <span className={clsx('h-1.5 w-1.5 rounded-full', sync === 'offline' ? 'bg-danger' : sync === 'syncing' ? 'animate-pulse bg-warn' : 'bg-ok')} title={sync === 'offline' ? 'Sem conexão: as mudanças não foram salvas' : sync === 'syncing' ? 'Sincronizando…' : 'Sincronizado'} aria-label={sync === 'offline' ? 'Sem conexão' : sync === 'syncing' ? 'Sincronizando' : 'Sincronizado'} />
        {sync === 'offline' && <span className="text-[11px] font-semibold text-danger">sem conexão</span>}
        <span className="flex-1" />
        <button className="icon-btn h-7 w-7" onClick={onExpand} aria-label={expanded ? 'Voltar ao painel' : 'Tela inteira'} title={expanded ? 'Voltar ao painel' : 'Tela inteira'}>
          <Icon name={expanded ? 'focus' : 'maximize'} size={15} />
        </button>
        <button className="icon-btn h-7 w-7" onClick={onClose} aria-label="Fechar o Together">
          <Icon name="x" size={15} />
        </button>
      </header>
      <div className="scroll-thin flex shrink-0 gap-1 overflow-x-auto px-2 py-1.5" role="tablist">
        {open.map((s) => (
          <button key={s.id} role="tab" aria-selected={current?.id === s.id} onClick={() => setActive(s.id)} className={clsx('flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold', current?.id === s.id ? 'bg-line/[0.08] text-fg-strong' : 'text-fg-muted hover:text-fg')}>
            <Icon name={KIND[s.kind].icon} size={13} /> {titleOf(s)}
          </button>
        ))}
        <button className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold text-brand hover:bg-brand/10" onClick={() => setCreating((c) => !c)} aria-expanded={creating}>
          <Icon name="plus" size={13} /> Nova
        </button>
      </div>
      <AnimatePresence initial={false}>
        {creating && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: dur.short }} className="shrink-0 overflow-hidden border-b border-line/[0.06]">
            <Creator channelId={channelId} onDone={(id) => (setCreating(false), id && setActive(id))} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="min-h-0 flex-1 overflow-hidden">
        {!current ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Icon name="users" size={28} className="text-fg-faint" />
            <div className="text-sm font-bold text-fg">Nada aberto ainda</div>
            <div className="text-xs text-fg-muted">Crie uma enquete, um cronômetro, notas ou um quadro. Todo mundo na call vê e participa na hora.</div>
          </div>
        ) : (
          <motion.div key={current.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle} className="flex h-full min-h-0 flex-col">
            <ToolHeader s={current} serverId={serverId} />
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {current.kind === 'poll' ? <PollView s={current} serverId={serverId} /> : current.kind === 'timer' ? <TimerView s={current} /> : current.kind === 'notes' ? <NotesView s={current} serverId={serverId} /> : <BoardView s={current} serverId={serverId} />}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
const EMPTY: TogetherSession[] = [];
const titleOf = (s: TogetherSession) => (s.kind === 'poll' ? (s.state.poll?.question ?? 'Enquete') : s.kind === 'timer' ? (s.state.timer?.label ?? 'Cronômetro') : s.kind === 'notes' ? (s.state.notes?.title ?? 'Notas') : (s.state.board?.title ?? 'Quadro')).slice(0, 22);

function ToolHeader({ s, serverId }: { s: TogetherSession; serverId: string | null }) {
  const me = useStore((st) => st.me?.id);
  const canClose = s.createdBy === me || !!serverId; // o servidor confere de verdade (moderadores)
  const close = async () => {
    const keep = await confirmDialog({ title: `Encerrar ${KIND[s.kind].label.toLowerCase()}`, body: 'Quer guardar uma cópia (fica disponível por 30 dias) ou descartar de vez?', confirm: 'Encerrar e guardar' });
    const discard = !keep && (await confirmDialog({ title: 'Descartar?', body: 'A ferramenta some para todo mundo e não dá para recuperar.', confirm: 'Descartar', danger: true }));
    if (!keep && !discard) return;
    await closeTogether(s, keep).then(() => toast(keep ? 'Encerrada — a cópia foi guardada.' : 'Descartada.'), toastError);
  };
  return (
    <div className="flex shrink-0 items-center gap-2 px-3 pt-2 text-[11px] text-fg-faint">
      <Icon name={KIND[s.kind].icon} size={12} /> {KIND[s.kind].label} · criada por {displayName(s.createdBy, serverId)}
      <span className="flex-1" />
      {canClose && (
        <button className="font-semibold text-fg-muted hover:text-danger" onClick={() => void close()}>
          Encerrar
        </button>
      )}
    </div>
  );
}

function Creator({ channelId, onDone }: { channelId: string; onDone: (id?: string) => void }) {
  const [kind, setKind] = useState<TogetherSession['kind']>('poll');
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [minutes, setMinutes] = useState(25);
  const [dur, setDur] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const s =
        kind === 'poll'
          ? await createTogether(channelId, { kind, question: q, options: opts.map((o) => o.trim()).filter(Boolean), durationSec: dur })
          : kind === 'timer'
            ? await createTogether(channelId, { kind, label: q.trim() || 'Foco', minutes })
            : await createTogether(channelId, { kind, title: q.trim() || KIND[kind].label });
      onDone(s.id);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const valid = kind !== 'poll' || (q.trim() && opts.filter((o) => o.trim()).length >= 2);
  return (
    <div className="space-y-2 p-3">
      <div className="flex gap-1">
        {(Object.keys(KIND) as TogetherSession['kind'][]).map((k) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={clsx('flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[12px] font-bold', kind === k ? 'bg-brand/15 text-fg-strong' : 'bg-line/[0.04] text-fg-muted hover:text-fg')}>
            <Icon name={KIND[k].icon} size={13} /> {KIND[k].label}
          </button>
        ))}
      </div>
      <input className="input py-1.5 text-sm" maxLength={kind === 'poll' ? 200 : 60} placeholder={kind === 'poll' ? 'Pergunta' : kind === 'timer' ? 'Nome (ex.: Foco)' : 'Título'} value={q} onChange={(e) => setQ(e.target.value)} aria-label={kind === 'poll' ? 'Pergunta da enquete' : 'Título'} />
      {kind === 'poll' && (
        <>
          {opts.map((o, i) => (
            <input key={i} className="input py-1.5 text-sm" maxLength={80} placeholder={`Opção ${i + 1}`} value={o} aria-label={`Opção ${i + 1}`} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            {opts.length < 8 && (
              <button className="font-semibold text-brand hover:underline" onClick={() => setOpts([...opts, ''])}>
                + opção
              </button>
            )}
            <span className="flex-1" />
            Duração
            <select className="rounded bg-bg-rail px-1.5 py-1 text-fg" value={dur ?? ''} onChange={(e) => setDur(e.target.value ? +e.target.value : null)} aria-label="Duração da enquete">
              <option value="">até encerrar</option>
              <option value={60}>1 min</option>
              <option value={300}>5 min</option>
              <option value={900}>15 min</option>
              <option value={3600}>1 h</option>
            </select>
          </div>
        </>
      )}
      {kind === 'timer' && (
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          Minutos
          <input type="number" min={1} max={180} className="input w-20 py-1 text-sm" value={minutes} onChange={(e) => setMinutes(Math.max(1, Math.min(180, +e.target.value || 1)))} />
          <span className="flex gap-1">
            {[5, 25, 50].map((m) => (
              <button key={m} className="rounded bg-line/[0.06] px-1.5 py-0.5 hover:text-fg-strong" onClick={() => setMinutes(m)}>
                {m}
              </button>
            ))}
          </span>
        </label>
      )}
      <button className="btn-primary h-9 w-full" disabled={!valid || busy} onClick={() => void go()}>
        Criar {KIND[kind].label.toLowerCase()}
      </button>
    </div>
  );
}

/* ---------------- Enquete ---------------- */
function PollView({ s, serverId }: { s: TogetherSession; serverId: string | null }) {
  const p = s.state.poll!;
  const me = useStore((st) => st.me?.id ?? '');
  useNow(p.endsAt ? 1000 : 0);
  const ended = p.closed || (!!p.endsAt && serverNow() > p.endsAt);
  const counts = p.options.map((_, i) => Object.values(p.votes).filter((v) => v === i).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const mine = p.votes[me];
  const vote = (i: number) => togetherOp(s, mine === i ? { type: 'unvote' } : { type: 'vote', option: i }).catch((e) => !(e instanceof TogetherConflict) && toastError(e));
  return (
    <div className="space-y-2">
      <div className="text-[15px] font-extrabold text-fg-strong">{p.question}</div>
      {p.options.map((o, i) => {
        const pct = total ? Math.round((counts[i]! / total) * 100) : 0;
        return (
          <button key={i} disabled={ended} onClick={() => void vote(i)} aria-pressed={mine === i} className={clsx('relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default', mine === i ? 'border-brand/60 text-fg-strong' : 'border-line/[0.08] text-fg hover:border-line/20')}>
            <motion.span className="absolute inset-y-0 left-0 bg-brand/15" initial={false} animate={{ width: `${pct}%` }} transition={spring.gentle} aria-hidden />
            <span className="relative flex items-center gap-2">
              {mine === i && <Icon name="check" size={14} className="text-brand" strokeWidth={3} />}
              <span className="flex-1 truncate">{o}</span>
              <span className="tabular-nums text-fg-muted">{counts[i]} · {pct}%</span>
            </span>
          </button>
        );
      })}
      <div className="text-[11px] text-fg-faint">
        {total} {total === 1 ? 'voto' : 'votos'} · um por pessoa{mine !== undefined && !ended ? ' · clique de novo para tirar o seu' : ''}
        {ended ? ' · encerrada' : p.endsAt ? ` · termina em ${fmt(Math.max(0, p.endsAt - serverNow()))}` : ''}
      </div>
      {total > 0 && (
        <div className="text-[11px] text-fg-faint">
          Votaram: {Object.keys(p.votes).map((u) => displayName(u, serverId)).join(', ')}
        </div>
      )}
    </div>
  );
}

/* ---------------- Cronômetro (relógio do servidor) ---------------- */
function TimerView({ s }: { s: TogetherSession }) {
  const t = s.state.timer!;
  const me = useStore((st) => st.me?.id);
  const running = t.startedAt !== null;
  useNow(running ? 250 : 0);
  const left = Math.max(0, running ? t.remainingMs - (serverNow() - t.startedAt!) : t.remainingMs);
  const frac = t.durationMs ? left / t.durationMs : 0;
  const done = left === 0;
  const prevDone = useRef(done);
  useEffect(() => {
    if (done && !prevDone.current) toast(`⏰ ${t.label}: o tempo acabou!`);
    prevDone.current = done;
  }, [done]);
  const act = (action: 'start' | 'pause' | 'reset') => togetherOp(s, { type: 'timer', action }).catch(toastError);
  const isOwner = s.createdBy === me;
  const R = 70;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative h-[170px] w-[170px]">
        <svg viewBox="0 0 170 170" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="85" cy="85" r={R} fill="none" stroke="rgb(var(--line) / 0.1)" strokeWidth="8" />
          <circle cx="85" cy="85" r={R} fill="none" stroke="rgb(var(--brand))" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: running ? 'stroke-dashoffset 0.25s linear' : undefined }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={clsx('text-[34px] font-black tabular-nums tracking-tight', done ? 'text-ok' : 'text-fg-strong')} role="timer" aria-live="off">
            {fmt(left)}
          </div>
          <div className="text-[11px] font-semibold text-fg-muted">{t.label}</div>
        </div>
      </div>
      <div className="flex gap-2">
        {running ? (
          <button className="btn-secondary" onClick={() => void act('pause')}>
            <Icon name="pause" size={14} /> Pausar
          </button>
        ) : (
          <button className="btn-primary" disabled={done} onClick={() => void act('start')}>
            <Icon name="play" size={14} /> {left < t.durationMs ? 'Continuar' : 'Começar'}
          </button>
        )}
        <button className="btn-ghost" onClick={() => void act('reset')}>
          Zerar
        </button>
      </div>
      {!isOwner && <p className="text-center text-[11px] text-fg-faint">Quem criou o cronômetro (ou um moderador) controla o tempo. O relógio é o do servidor: todo mundo vê igual.</p>}
    </div>
  );
}

/* ---------------- Notas (sem sobrescrever ninguém em silêncio) ---------------- */
function NotesView({ s, serverId }: { s: TogetherSession; serverId: string | null }) {
  const n = s.state.notes!;
  const [text, setText] = useState(n.text);
  const [base, setBase] = useState(s.version);
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'conflict' | 'error'>('saved');
  const [theirs, setTheirs] = useState<{ text: string; by: string | null; version: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presence = useTogether((t) => t.presence[s.id]);
  const editors = Object.values(presence ?? {}).filter((p) => p.editing && Date.now() - p.at < 4000);
  // remote change while I have nothing pending → follow it
  useEffect(() => {
    if (status === 'saved' && s.version !== base) {
      setText(n.text);
      setBase(s.version);
    }
  }, [s.version]);
  const save = async (value: string, baseVersion: number) => {
    setStatus('saving');
    try {
      const r = await togetherOp(s, { type: 'replace', text: value }, baseVersion);
      setBase(r.version);
      setStatus((st) => (st === 'saving' ? 'saved' : st));
    } catch (e) {
      if (e instanceof TogetherConflict) {
        setTheirs({ text: e.session.state.notes?.text ?? '', by: e.session.state.notes?.editedBy ?? null, version: e.session.version });
        setStatus('conflict');
      } else setStatus('error');
    }
  };
  const onChange = (v: string) => {
    setText(v);
    if (status === 'conflict') return;
    setStatus('dirty');
    sendPresence(s.channelId, s.id, { editing: true });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(v, base), 700);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <div className="flex h-full min-h-[240px] flex-col gap-2">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-bold text-fg-strong">{n.title}</span>
        <span className="flex-1" />
        {editors.length > 0 && <span className="text-sky-400">{editors.map((e) => displayName(e.userId, serverId)).join(', ')} editando…</span>}
        <span className={clsx(status === 'error' ? 'text-danger' : status === 'conflict' ? 'text-warn' : 'text-fg-faint')} aria-live="polite">
          {status === 'saved' ? 'Salvo' : status === 'saving' ? 'Salvando…' : status === 'dirty' ? 'Alterações não salvas' : status === 'conflict' ? 'Conflito' : 'Não foi salvo (sem conexão?)'}
        </span>
      </div>
      {status === 'conflict' && theirs && (
        <div className="rounded-xl border border-warn/30 bg-warn/10 p-2.5 text-[12px] text-fg">
          {theirs.by ? displayName(theirs.by, serverId) : 'Alguém'} salvou outra versão enquanto você escrevia. Nada foi apagado.
          <div className="mt-2 flex gap-2">
            <button className="btn-secondary h-7 px-2 text-xs" onClick={() => (setText(theirs.text), setBase(theirs.version), setTheirs(null), setStatus('saved'))}>
              Usar a deles
            </button>
            <button className="btn-secondary h-7 px-2 text-xs" onClick={() => (navigator.clipboard.writeText(text).catch(() => {}), toast('Sua versão foi copiada.'))}>
              Copiar a minha
            </button>
            <button className="btn-primary h-7 px-2 text-xs" onClick={() => (setTheirs(null), void save(text, theirs.version))}>
              Manter a minha
            </button>
          </div>
        </div>
      )}
      <textarea className="input min-h-0 flex-1 resize-none font-mono text-[13px] leading-relaxed" value={text} maxLength={20000} onChange={(e) => onChange(e.target.value)} aria-label="Notas compartilhadas" placeholder="Escreva aqui — todo mundo na call vê." />
      <div className="text-right text-[10px] text-fg-faint">{text.length}/20000 · versão {base}</div>
    </div>
  );
}

/* ---------------- Quadro ---------------- */
const COLORS = ['#ffffff', '#ff2d78', '#22d3ee', '#facc15', '#22c55e', '#a855f7'];
function BoardView({ s, serverId }: { s: TogetherSession; serverId: string | null }) {
  const items = s.state.board!.items;
  const me = useStore((st) => st.me?.id ?? '');
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<'pen' | 'marker' | 'text' | 'eraser'>('pen');
  const [color, setColor] = useState(COLORS[1]!);
  const drawing = useRef<Array<[number, number]> | null>(null);
  const presence = useTogether((t) => t.presence[s.id]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // redraw only when the items or the size change (never a loop per frame)
  useEffect(() => draw(canvas.current, items, size, drawing.current, tool, color), [items, size]);
  const norm = (e: React.PointerEvent): [number, number] => {
    const r = wrap.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const down = (e: React.PointerEvent) => {
    const p = norm(e);
    if (tool === 'text') {
      const text = window.prompt('Texto no quadro:')?.trim();
      if (text) void togetherOp(s, { type: 'text', id: idOf(), color, x: p[0], y: p[1], text: text.slice(0, 200) }).catch(toastError);
      return;
    }
    if (tool === 'eraser') {
      const hit = nearest(items, p, me);
      if (hit) void togetherOp(s, { type: 'erase', ids: [hit] }).catch(toastError);
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = [p];
  };
  const move = (e: React.PointerEvent) => {
    const p = norm(e);
    sendPresence(s.channelId, s.id, { x: p[0], y: p[1] });
    if (!drawing.current) return;
    const last = drawing.current[drawing.current.length - 1]!;
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.004) return;
    drawing.current.push(p);
    draw(canvas.current, items, size, drawing.current, tool, color);
  };
  const up = () => {
    const pts = drawing.current;
    drawing.current = null;
    if (!pts) return;
    const points = simplify(pts, 800);
    void togetherOp(s, { type: 'stroke', id: idOf(), tool: tool === 'marker' ? 'marker' : 'pen', color, width: tool === 'marker' ? 14 : 3, points }).catch(toastError);
  };
  const undo = () => {
    const mine = [...items].reverse().find((i) => i.by === me);
    if (mine) void togetherOp(s, { type: 'erase', ids: [mine.id] }).catch(toastError);
  };
  const exportPng = () => {
    const c = canvas.current;
    if (!c) return;
    const a = document.createElement('a');
    a.download = `${s.state.board!.title || 'quadro'}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  };
  const cursors = Object.values(presence ?? {}).filter((p) => p.x !== undefined && Date.now() - p.at < 3000);
  return (
    <div className="flex h-full min-h-[280px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {(
          [
            ['pen', 'Caneta', 'edit'],
            ['marker', 'Marca-texto', 'pencilDraft'],
            ['text', 'Texto', 'chat'],
            ['eraser', 'Borracha', 'x'],
          ] as const
        ).map(([t, label, icon]) => (
          <button key={t} onClick={() => setTool(t)} aria-pressed={tool === t} title={label} aria-label={label} className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', tool === t ? 'bg-brand/20 text-fg-strong' : 'text-fg-muted hover:bg-line/[0.06]')}>
            <Icon name={icon} size={15} />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-line/10" />
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} aria-label={`Cor ${c}`} aria-pressed={color === c} className={clsx('h-6 w-6 rounded-full border-2', color === c ? 'border-white' : 'border-transparent')} style={{ background: c }} />
        ))}
        <span className="flex-1" />
        <button className="btn-ghost h-8 px-2 text-xs" onClick={undo} title="Desfazer o seu último traço">
          Desfazer
        </button>
        <button className="btn-ghost h-8 px-2 text-xs" onClick={exportPng}>
          Exportar PNG
        </button>
        <button className="btn-ghost h-8 px-2 text-xs hover:text-danger" onClick={() => void togetherOp(s, { type: 'clear' }).catch(toastError)} title="Só quem criou o quadro ou um moderador">
          Limpar
        </button>
      </div>
      <div ref={wrap} className={clsx('relative min-h-0 flex-1 touch-none overflow-hidden rounded-xl border border-line/[0.08] bg-[#14121f]', tool === 'eraser' ? 'cursor-cell' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="board">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {cursors.map((c) => (
          <span key={c.userId} className="pointer-events-none absolute flex items-center gap-1 text-[10px] font-bold text-white transition-[left,top] duration-75" style={{ left: `${c.x! * 100}%`, top: `${c.y! * 100}%` }}>
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span className="rounded bg-sky-500/80 px-1">{displayName(c.userId, serverId)}</span>
          </span>
        ))}
      </div>
      <div className="text-right text-[10px] text-fg-faint">{items.length}/1500 itens</div>
    </div>
  );
}

function draw(c: HTMLCanvasElement | null, items: BoardItem[], size: { w: number; h: number }, live: Array<[number, number]> | null, tool: string, color: string) {
  if (!c || !size.w) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(size.w * dpr)) {
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
  }
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size.w, size.h);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const stroke = (pts: Array<[number, number]>, col: string, width: number, marker: boolean) => {
    g.globalAlpha = marker ? 0.35 : 1;
    g.strokeStyle = col;
    g.lineWidth = width;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * size.w, y * size.h) : g.moveTo(x * size.w, y * size.h)));
    if (pts.length === 1) g.lineTo(pts[0]![0] * size.w + 0.1, pts[0]![1] * size.h);
    g.stroke();
  };
  for (const it of items) {
    if (it.type === 'stroke') stroke(it.points, it.color, it.width, it.tool === 'marker');
    else {
      g.globalAlpha = 1;
      g.fillStyle = it.color;
      g.font = '600 15px system-ui, sans-serif';
      g.fillText(it.text, it.x * size.w, it.y * size.h);
    }
  }
  if (live) stroke(live, color, tool === 'marker' ? 14 : 3, tool === 'marker');
  g.globalAlpha = 1;
}
const idOf = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
function simplify(pts: Array<[number, number]>, max: number) {
  if (pts.length <= max) return pts.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)] as [number, number]);
  const step = pts.length / max;
  return Array.from({ length: max }, (_, i) => pts[Math.floor(i * step)]!).map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)] as [number, number]);
}
function nearest(items: BoardItem[], p: [number, number], _me: string) {
  let best: { id: string; d: number } | null = null;
  for (const it of items) {
    const pts = it.type === 'stroke' ? it.points : [[it.x, it.y] as [number, number]];
    for (const q of pts) {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < 0.03 && (!best || d < best.d)) best = { id: it.id, d };
    }
  }
  return best?.id ?? null;
}
function useNow(ms: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!ms) return;
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}
const fmt = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
