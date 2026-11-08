import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { motion } from 'motion/react';
import {
  AL_COLLECTIONS, AL_UNIVERSES, FLOOR_STYLES, ROOM_CATS, ROOM_ITEMS, ROOM_PARTICLES, ROOM_PRESETS, WALLPAPERS,
  autoArrange, footprint, itemDef, snapPosition, validateLayout,
  type RoomCat, type RoomItemKey, type RoomObject, type SpaceScene as Scene,
} from '@aldetes/shared';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { usePrefs, setPrefs, getPrefs } from '@/lib/prefs';
import { dur, ease, spring } from '@/lib/motion';
import { Segmented, Switch } from '../settings/SettingsLayout';
import { Icon } from '../common/Icon';
import { toast, toastError, confirmDialog } from '../common/overlay';
import { Avatar } from '../common/Avatar';
import { RoomView, Sprite, project, unproject, unwall, wallPos } from './Room';
import { presetScene, sceneOf } from './SpaceScene';

/**
 * Smart Room Builder — decorate "my corner" by dragging furniture. Every move is checked with the SAME rules the server
 * uses (@aldetes/shared/roomBuilder): green = fits, red = collision / outside / needs a surface / over your spot.
 * Optional smart snap (grid + edge alignment + nearest free spot), surfaces (monitor on a desk, figure on a shelf),
 * undo/redo, duplicate, rotate, auto-arrange with preview, 8 editable starter rooms. Only this editor is loaded on
 * demand; calls render the saved layout with the light renderer.
 */
const WALL_LABEL: Record<(typeof WALLPAPERS)[number], string> = { plain: 'Lisa', stripes: 'Listras', brick: 'Tijolos', wood: 'Madeira', concrete: 'Concreto', shoji: 'Shoji', marble: 'Mármore', grid: 'Grade neon', stars: 'Estrelas' };
const FLOOR_LABEL: Record<(typeof FLOOR_STYLES)[number], string> = { wood: 'Madeira', tatami: 'Tatame', marble: 'Mármore', carpet: 'Carpete', tiles: 'Piso frio', concrete: 'Cimento', 'neon-grid': 'Grade neon' };
const PART_LABEL: Record<(typeof ROOM_PARTICLES)[number], string> = { none: 'Nenhuma', dust: 'Poeira de luz', stars: 'Estrelas', petals: 'Pétalas', snow: 'Neve', embers: 'Brasas', fireflies: 'Vaga-lumes' };
const WHY: Record<string, string> = { bounds: 'fora do cômodo', collision: 'ocupando o lugar de outro móvel', surface: 'precisa ficar em cima de uma mesa, estante ou cama', avatar: 'em cima do seu lugar no cantinho', wall: 'só na parede', unknown: 'objeto desconhecido' };

type Snap = { objects: RoomObject[]; scene: Scene };

export function RoomBuilder({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me)!;
  const saved = useMemo(() => {
    const s = sceneOf(me.space, me.id);
    if (s.objects) return s;
    // older corner (slot items): start from the closest starter room, keeping its colors and spot
    const id = (s.preset in ROOM_PRESETS ? s.preset : 'minimal') as keyof typeof ROOM_PRESETS;
    return { ...presetScene(id), accent: s.accent, lighting: s.lighting, avatarPos: s.avatarPos };
  }, [me.space, me.id]);
  const [scene, setScene] = useState<Scene>(saved);
  const objects = scene.objects ?? [];
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; o: RoomObject; ok: boolean; why?: string; guides: number[] } | null>(null);
  const [cat, setCat] = useState<RoomCat | 'fav'>('seating');
  const [q, setQ] = useState('');
  const [grid, setGrid] = useState(true);
  const [smart, setSmart] = useState(true);
  const [final, setFinal] = useState(false);
  const [proposal, setProposal] = useState<ReturnType<typeof autoArrange> | null>(null);
  const [busy, setBusy] = useState(false);
  const favs = usePrefs((p) => p.roomFavorites);
  const canvas = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(scene) !== JSON.stringify(saved);

  /** every change goes through here (undo/redo) */
  const commit = (next: Scene) => {
    setPast((p) => [...p.slice(-79), { objects, scene }]);
    setFuture([]);
    setScene(next);
  };
  const setObjects = (objs: RoomObject[]) => commit({ ...scene, objects: objs });
  const undo = () => {
    const prev = past.at(-1);
    if (!prev) return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [...f, { objects, scene }]);
    setScene(prev.scene);
  };
  const redo = () => {
    const next = future.at(-1);
    if (!next) return;
    setFuture((f) => f.slice(0, -1));
    setPast((p) => [...p, { objects, scene }]);
    setScene(next.scene);
  };
  const nextId = () => {
    let n = objects.length;
    const ids = new Set(objects.map((o) => o.i));
    while (ids.has(`n${n.toString(36)}`)) n++;
    return `n${n.toString(36)}`;
  };
  const problems = useMemo(() => new Map(validateLayout(objects, scene.avatarPos).map((p) => [p.i, p])), [objects, scene.avatarPos]);

  /** add from the catalog: first valid spot near the back/center (or on a free surface for desk items) */
  const add = (k: RoomItemKey) => {
    const d = itemDef(k)!;
    if (objects.length >= 48) return toast('Limite de 48 objetos por cantinho.', 'error');
    const i = nextId();
    let o: RoomObject | null = null;
    if (d.place === 'top' || d.place === 'floorOrTop') {
      for (const s of objects) {
        const sd = itemDef(s.k);
        if (!sd?.top || s.p) continue;
        const f = footprint(s);
        const t = snapPosition(objects, { i, k, x: f.w / 2, y: Math.min(f.d - d.d / 2, d.d / 2 + 1), p: s.i }, { grid: false, smart: true, avatarPos: scene.avatarPos });
        if (!validateLayout([...objects, t], scene.avatarPos, new Set([i])).length) {
          o = t;
          break;
        }
      }
      if (!o && d.place === 'top') return toast('Coloque primeiro uma mesa, estante, cama ou sofá — esse objeto fica em cima de uma superfície.', 'error');
    }
    if (!o) o = snapPosition(objects, { i, k, x: 50, y: d.place === 'wall' ? 26 : d.place === 'rug' ? 40 : d.d / 2 + 2 }, { grid, smart: true, avatarPos: scene.avatarPos });
    if (validateLayout([...objects, o], scene.avatarPos, new Set([i])).length) return toast('Não há espaço livre para esse objeto. Tire ou mova algo primeiro.', 'error');
    setObjects([...objects, o]);
    setSel(i);
  };
  const remove = (id: string) => {
    // what stands on it goes to the floor if it can, otherwise it leaves with it
    const rest = objects.filter((o) => o.i !== id && o.p !== id);
    setObjects(rest);
    setSel(null);
  };
  const duplicate = (id: string) => {
    const src = objects.find((o) => o.i === id);
    if (!src) return;
    const i = nextId();
    const c = snapPosition(objects, { ...src, i, x: src.x + 4, y: src.y }, { grid, smart: true, avatarPos: scene.avatarPos });
    if (validateLayout([...objects, c], scene.avatarPos, new Set([i])).length) return toast('Não há espaço livre ao lado para duplicar.', 'error');
    setObjects([...objects, c]);
    setSel(i);
  };
  const rotate = (id: string) => {
    const o = objects.find((x) => x.i === id);
    if (!o || itemDef(o.k)?.place === 'wall') return;
    const r = { ...o, r: ((o.r ?? 0) + 1) % 4 };
    const rest = objects.filter((x) => x.i !== id);
    const fit = validateLayout([...rest, r], scene.avatarPos, new Set([id])).length ? snapPosition(rest, r, { grid, smart: true, avatarPos: scene.avatarPos }) : r;
    if (validateLayout([...rest, fit], scene.avatarPos, new Set([id])).length) return toast('Girando, ele bateria em outro móvel. Abra espaço primeiro.', 'error');
    setObjects(objects.map((x) => (x.i === id ? fit : x)));
  };
  const nudge = (id: string, dx: number, dy: number) => {
    const o = objects.find((x) => x.i === id);
    if (!o) return;
    const t = { ...o, x: o.x + dx, y: o.y + dy };
    if (validateLayout(objects.map((x) => (x.i === id ? t : x)), scene.avatarPos, new Set([id])).length) return;
    setObjects(objects.map((x) => (x.i === id ? t : x)));
  };

  // keyboard: Del, R, Ctrl+D, Ctrl+Z / Ctrl+Y, arrows (precise move, Shift = 5)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') (e.preventDefault(), e.shiftKey ? redo() : undo());
      else if (mod && e.key.toLowerCase() === 'y') (e.preventDefault(), redo());
      else if (!sel) return;
      else if (e.key === 'Delete' || e.key === 'Backspace') (e.preventDefault(), remove(sel));
      else if (mod && e.key.toLowerCase() === 'd') (e.preventDefault(), duplicate(sel));
      else if (e.key.toLowerCase() === 'r' && !mod) rotate(sel);
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const s = e.shiftKey ? 5 : 1;
        const wall = itemDef(objects.find((o) => o.i === sel)?.k ?? '')?.place === 'wall';
        nudge(sel, e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? (wall ? s : -s) : e.key === 'ArrowDown' ? (wall ? -s : s) : 0);
      } else if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  /* ---------------- dragging ---------------- */
  const startDrag = (e: React.PointerEvent, o: RoomObject) => {
    if (final || proposal || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSel(o.i);
    const el = canvas.current!;
    const rect = el.getBoundingClientRect();
    const d = itemDef(o.k)!;
    const pt = (ev: PointerEvent | React.PointerEvent) => ({ lp: ((ev.clientX - rect.left) / rect.width) * 100, bp: ((rect.bottom - ev.clientY) / rect.height) * 100 });
    const p0 = pt(e);
    const f0 = footprint(o);
    // grab offset in layout units
    const g0 = d.place === 'wall' ? unwall(p0.lp, p0.bp) : unproject(p0.lp, p0.bp);
    const off = o.p ? { x: 0, y: 0 } : { x: o.x - g0.x, y: d.place === 'wall' ? o.y - g0.y : o.y + f0.d / 2 - g0.y };
    let raf = 0;
    let last: RoomObject = o;
    let dragX = o.x;
    let dragY = o.y;
    const rest = objects.filter((x) => x.i !== o.i);
    const kids = objects.filter((x) => x.p === o.i);
    const move = (ev: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const p = pt(ev);
        let t: RoomObject;
        if (d.place === 'wall') {
          const w = unwall(p.lp, p.bp);
          t = { ...o, x: w.x + off.x, y: w.y + off.y };
        } else {
          // surfaces: what is under the pointer?
          let parent: RoomObject | undefined;
          if (d.place === 'top' || d.place === 'floorOrTop') {
            for (const node of document.elementsFromPoint(ev.clientX, ev.clientY)) {
              const id = (node as HTMLElement).closest?.('[data-obj]')?.getAttribute('data-obj');
              const cand = id && id !== o.i ? rest.find((x) => x.i === id && !x.p && itemDef(x.k)?.top) : undefined;
              if (cand) {
                parent = cand;
                const r = (canvas.current!.querySelector(`[data-obj="${cand.i}"]`) as HTMLElement).getBoundingClientRect();
                const pf = footprint({ ...cand, x: 0, y: 0 });
                t = { ...o, p: cand.i, x: ((ev.clientX - r.left) / r.width) * pf.w, y: Math.max(d.d / 2, Math.min(pf.d - d.d / 2, ((ev.clientY - r.top) / r.height) * pf.d)) };
                break;
              }
            }
          }
          if (!parent) {
            const f = unproject(p.lp, p.bp);
            const fd = footprint({ ...o, p: undefined }).d;
            t = { ...o, p: undefined, x: f.x + off.x, y: f.y + off.y - fd / 2 };
          }
        }
        // while dragging: the real spot (red if it collides); the nearest free spot is only used on drop
        t = snapPosition(rest, t!, { grid, smart, avatarPos: scene.avatarPos, nearest: false });
        const bad = validateLayout([...rest, t], scene.avatarPos, new Set([o.i]))[0];
        // alignment guides: other objects whose edge/center matches on x
        const ft = footprint(t);
        const guides = rest.filter((s) => !!s.p === !!t.p && (!t.p || s.p === t.p)).flatMap((s) => {
          const g = footprint(s);
          return [g.x0, g.x1, s.x].filter((v) => [ft.x0, ft.x1, t.x].some((w) => Math.abs(w - v) < 0.01));
        });
        last = t;
        dragX = t.x;
        dragY = t.y;
        setDrag({ id: o.i, o: t, ok: !bad, why: bad?.why, guides: t.p ? [] : [...new Set(guides)] });
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      cancelAnimationFrame(raf);
      setDrag(null);
      if (last === o) return;
      if (smart && validateLayout([...rest, last], scene.avatarPos, new Set([o.i])).length) last = snapPosition(rest, last, { grid, smart: true, avatarPos: scene.avatarPos });
      const ok = !validateLayout([...rest, last], scene.avatarPos, new Set([o.i])).length;
      if (!ok) return toast(`Não cabe aí: ${WHY[validateLayout([...rest, last], scene.avatarPos, new Set([o.i]))[0]!.why]}. O objeto voltou para onde estava.`, 'error');
      if (smart && (Math.abs(last.x - dragX) > 1 || Math.abs(last.y - dragY) > 1)) toast('Ajustado para o espaço livre mais próximo.');
      // things standing on a piece go with it; leaving a surface for the floor keeps the children valid
      setObjects([...rest.filter((x) => x.p !== o.i), last, ...kids]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const shownObjects = proposal ? proposal.objects : drag ? objects.map((o) => (o.i === drag.id ? drag.o : o)) : objects;
  const shownScene: Scene = { ...scene, objects: shownObjects };
  const decorate = (o: RoomObject, el: ReactNode) => {
    if (final) return el;
    const p = drag?.id === o.i ? (drag.ok ? null : { why: drag.why }) : problems.get(o.i);
    const moved = proposal?.moved.includes(o.i);
    return (
      <div
        key={o.i}
        className={clsx('rb-hit', sel === o.i && 'rb-sel', drag?.id === o.i && (drag.ok ? 'rb-ok' : 'rb-bad'), !drag && p && 'rb-bad', moved && 'rb-moved')}
        onPointerDown={(e) => startDrag(e, o)}
        style={{ display: 'contents' }}
      >
        {el}
      </div>
    );
  };

  const save = async () => {
    if (problems.size) return toast('Ainda há objetos em posição inválida (em vermelho). Use "Organizar automaticamente" ou mova-os.', 'error');
    setBusy(true);
    try {
      await api('PUT', '/users/@me/space', scene);
      toast('Cantinho salvo — quem está na call já vê o novo.', 'success');
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const close = async () => {
    if (dirty && !(await confirmDialog({ title: 'Sair sem salvar?', body: 'As mudanças no seu cantinho vão se perder.', confirm: 'Sair sem salvar', danger: true }))) return;
    onClose();
  };

  const selObj = objects.find((o) => o.i === sel);
  const items = (Object.entries(ROOM_ITEMS) as Array<[RoomItemKey, (typeof ROOM_ITEMS)[RoomItemKey]]>).filter(([k, d]) =>
    q.trim() ? `${d.label} ${d.tags ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()) : cat === 'fav' ? favs.includes(k) : d.cat === cat,
  );
  const av = project({ left: 28, center: 50, right: 72 }[scene.avatarPos], 50);

  return (
    <motion.div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        role="dialog"
        aria-modal
        aria-label="Room Builder"
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: dur.short } }}
        transition={{ duration: dur.spatial, ease: ease.out }}
        className="flex h-[min(860px,94vh)] w-[min(1400px,97vw)] flex-col overflow-hidden rounded-[26px] border border-line/[0.08] bg-bg-side shadow-float"
        data-testid="room-builder"
      >
        {/* header */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line/[0.06] px-5 py-3">
          <h2 className="mr-2 text-lg font-black tracking-tight text-fg-strong">Meu cantinho · Room Builder</h2>
          <button className="btn-ghost h-8 px-2 text-xs" disabled={!past.length} onClick={undo} title="Desfazer (Ctrl+Z)">
            <Icon name="arrowLeft" size={13} /> Desfazer
          </button>
          <button className="btn-ghost h-8 px-2 text-xs" disabled={!future.length} onClick={redo} title="Refazer (Ctrl+Y)">
            Refazer <Icon name="chevronRight" size={13} />
          </button>
          <span className="flex-1" />
          <span className="text-xs text-fg-muted" aria-live="polite" data-testid="rb-status">
            {problems.size ? `${problems.size} objeto(s) em posição inválida` : dirty ? 'Alterações não salvas' : 'Tudo salvo'}
          </span>
          <button className={clsx('btn-secondary h-8 px-3 text-xs', final && 'border-brand')} aria-pressed={final} onClick={() => (setFinal(!final), setSel(null))}>
            <Icon name="play" size={12} /> {final ? 'Voltar a editar' : 'Visualizar'}
          </button>
          <button className="btn-ghost h-8 px-3 text-xs" onClick={() => void close()}>
            Cancelar
          </button>
          <button className="btn h-8 bg-ok px-4 text-xs text-white hover:bg-ok/80 disabled:opacity-50" disabled={busy || !dirty || !!problems.size} onClick={() => void save()}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* catalog */}
          <aside className="flex w-[300px] shrink-0 flex-col gap-2 border-r border-line/[0.06] bg-bg-rail p-3">
            <div className="relative">
              <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
              <input className="input h-9 pl-8 text-sm" placeholder="Buscar objeto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar objeto" />
            </div>
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Categorias">
              {[['fav', '★ Favoritos'] as const, ...(Object.entries(ROOM_CATS) as Array<[RoomCat, string]>)].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={cat === id && !q} onClick={() => (setCat(id), setQ(''))} className={clsx('rounded-lg px-2 py-1 text-[11px] font-bold', cat === id && !q ? 'bg-brand text-white' : 'bg-line/[0.05] text-fg-muted hover:text-fg-strong')}>
                  {label}
                </button>
              ))}
            </div>
            <div className="scroll-thin -mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
              {cat === 'effects' && !q ? (
                <RoomSettings scene={scene} onChange={(p) => commit({ ...scene, ...p })} />
              ) : (
                <>
                  {cat === 'walls' && !q && <WallSettings scene={scene} onChange={(p) => commit({ ...scene, ...p })} />}
                  <div className="grid grid-cols-3 gap-1.5" data-testid="rb-catalog">
                    {items.map(([k, d]) => (
                      <div key={k} className="group relative">
                        <button onClick={() => add(k)} className="flex w-full flex-col items-center gap-1 rounded-xl border border-line/[0.06] bg-bg-side p-1.5 text-[10px] font-semibold text-fg hover:border-brand/50" title={`Adicionar: ${d.label}`} aria-label={`Adicionar ${d.label}`}>
                          <span className="relative block h-12 w-full overflow-hidden rounded-lg" style={{ background: 'linear-gradient(#1b1838, #0e0c22)', containerType: 'inline-size' }}>
                            <span className="absolute bottom-1 left-1/2 block -translate-x-1/2" style={{ width: `${Math.min(90, Math.max(30, (d.place === 'wall' ? d.w : d.w) * 2.4))}%`, height: d.place === 'wall' || d.place === 'rug' ? '60%' : '82%' }}>
                              <Sprite k={k} accent={scene.accent} dark warm={false} t={(d.d * 0.3) / Math.max(1, d.h + d.d * 0.3)} anim={false} />
                            </span>
                          </span>
                          <span className="w-full truncate text-center">{d.label}</span>
                        </button>
                        <button
                          aria-label={favs.includes(k) ? `Tirar ${d.label} dos favoritos` : `Favoritar ${d.label}`}
                          onClick={() => setPrefs({ roomFavorites: favs.includes(k) ? favs.filter((x) => x !== k) : [...favs, k] })}
                          className={clsx('absolute right-1 top-1 rounded-md px-1 text-[11px]', favs.includes(k) ? 'text-yellow-400' : 'text-fg-faint opacity-0 group-hover:opacity-100')}
                        >
                          ★
                        </button>
                      </div>
                    ))}
                  </div>
                  {!items.length && <p className="p-3 text-center text-xs text-fg-muted">{cat === 'fav' ? 'Marque objetos com ★ para achá-los aqui.' : 'Nada encontrado.'}</p>}
                </>
              )}
            </div>
          </aside>

          {/* canvas */}
          <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <select className="input h-8 w-auto py-0 text-xs" aria-label="Cenário inicial" value="" onChange={async (e) => {
                const id = e.target.value as keyof typeof ROOM_PRESETS;
                if (!id) return;
                if (objects.length && !(await confirmDialog({ title: `Usar "${ROOM_PRESETS[id]!.label}"?`, body: 'Substitui os móveis atuais (dá para desfazer).', confirm: 'Usar cenário' }))) return;
                commit({ ...presetScene(id), avatarPos: scene.avatarPos, ambiance: scene.ambiance });
              }}>
                <option value="">Cenários prontos…</option>
                {Object.entries(ROOM_PRESETS).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button className="btn-secondary h-8 px-3 text-xs" disabled={!!proposal || !objects.length} onClick={() => setProposal(autoArrange(objects.map((o) => ({ ...o })), scene.avatarPos))} data-testid="rb-arrange">
                ✦ Organizar automaticamente
              </button>
              <button className="btn-ghost h-8 px-2 text-xs" disabled={!dirty} onClick={() => commit(saved)} title="Volta para o cantinho salvo">
                Restaurar
              </button>
              <span className="flex-1" />
              <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                <Switch checked={grid} onChange={setGrid} /> Grade
              </label>
              <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                <Switch checked={smart} onChange={setSmart} /> Encaixe inteligente
              </label>
              <Segmented id="rb-avatar" value={scene.avatarPos} onChange={(v) => commit({ ...scene, avatarPos: v })} options={[['left', 'Você à esq.'], ['center', 'Centro'], ['right', 'Dir.']]} />
            </div>

            {proposal && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-fg" data-testid="rb-proposal">
                <span className="font-bold">Prévia da organização:</span>
                <span>{proposal.moved.length} movido(s){proposal.removed.length ? `, ${proposal.removed.length} sem espaço (sairia do cômodo)` : ''}. Seu lugar fica livre.</span>
                <span className="flex-1" />
                <button className="btn-ghost h-7 px-2 text-xs" onClick={() => setProposal(null)}>
                  Cancelar
                </button>
                <button className="btn-primary h-7 px-3 text-xs" onClick={() => (setObjects(proposal.objects), setProposal(null))}>
                  Aplicar
                </button>
              </div>
            )}

            <div className="relative flex min-h-0 flex-1 items-center justify-center">
              <div ref={canvas} className={clsx('relative aspect-video max-h-full w-full max-w-full overflow-hidden rounded-2xl border border-line/[0.08] bg-black', !final && 'rb-canvas', drag && 'rb-dragging')} onPointerDown={() => setSel(null)} data-testid="rb-canvas" style={{ maxWidth: 'calc((100vh - 220px) * 16 / 9)' }}>
                <RoomView scene={shownScene} density="full" decorate={decorate}>
                  <Avatar userId={me.id} size={72} />
                </RoomView>
                {!final && (
                  <div className="pointer-events-none absolute inset-0" aria-hidden>
                    {grid && <div className="rb-grid absolute inset-x-0 bottom-0" style={{ height: '44%' }} />}
                    {/* the avatar's free area */}
                    {drag && <span className="absolute rounded-lg border border-dashed border-white/40 bg-white/5" style={{ left: `${av.left - 8 * av.s}%`, width: `${16 * av.s}%`, bottom: 0, height: `${av.bottom + 8}%` }} />}
                    {drag?.guides.map((gx) => {
                      const p = project(gx, drag.o.y);
                      return <span key={gx} className="absolute bottom-0 w-px bg-cyan-300/80" style={{ left: `${p.left}%`, top: '56%' }} />;
                    })}
                  </div>
                )}
                {drag && (
                  <span className={clsx('pointer-events-none absolute left-3 top-3 rounded-lg px-2 py-1 text-xs font-bold text-white', drag.ok ? 'bg-ok/90' : 'bg-danger/90')} data-testid="rb-drag-state">
                    {drag.ok ? (drag.o.p ? 'Encaixa em cima do móvel' : 'Posição válida') : `Inválido: ${WHY[drag.why ?? 'collision']}`}
                  </span>
                )}
              </div>
            </div>

            {/* selection toolbar */}
            <div className="flex h-10 items-center gap-2 text-xs">
              {selObj && !final ? (
                <>
                  <span className="font-bold text-fg-strong">{itemDef(selObj.k)?.label}</span>
                  {problems.get(selObj.i) && <span className="text-danger">· {WHY[problems.get(selObj.i)!.why]}</span>}
                  <span className="flex-1" />
                  {itemDef(selObj.k)?.place !== 'wall' && (
                    <button className="btn-secondary h-8 px-3 text-xs" onClick={() => rotate(selObj.i)} title="Rotacionar (R)">
                      ⟳ Rotacionar
                    </button>
                  )}
                  <button className="btn-secondary h-8 px-3 text-xs" onClick={() => duplicate(selObj.i)} title="Duplicar (Ctrl+D)">
                    <Icon name="copy" size={12} /> Duplicar
                  </button>
                  <button className="btn-secondary h-8 px-3 text-xs hover:text-danger" onClick={() => remove(selObj.i)} title="Remover (Delete)">
                    <Icon name="trash" size={12} /> Remover
                  </button>
                </>
              ) : (
                <span className="text-fg-faint">Clique num objeto do catálogo para colocar · arraste para mover · setas para ajuste fino · R gira · Delete remove.</span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Pick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-black uppercase tracking-wider text-fg-faint">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map(([v, l]) => (
          <button key={v} aria-pressed={value === v} onClick={() => onChange(v)} className={clsx('rounded-lg border px-2 py-1 text-[11px] font-semibold', value === v ? 'border-brand bg-brand/15 text-fg-strong' : 'border-line/[0.08] text-fg-muted hover:text-fg-strong')}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function WallSettings({ scene, onChange }: { scene: Scene; onChange: (p: Partial<Scene>) => void }) {
  return (
    <div className="mb-3 rounded-xl bg-bg-side p-2.5">
      <Pick label="Papel de parede / revestimento" value={scene.wall ?? 'plain'} options={WALLPAPERS.map((w) => [w, WALL_LABEL[w]])} onChange={(wall) => onChange({ wall })} />
      <Pick label="Piso" value={scene.floor ?? 'wood'} options={FLOOR_STYLES.map((f) => [f, FLOOR_LABEL[f]])} onChange={(floor) => onChange({ floor })} />
    </div>
  );
}

function RoomSettings({ scene, onChange }: { scene: Scene; onChange: (p: Partial<Scene>) => void }) {
  const [uni, setUni] = useState<keyof typeof AL_UNIVERSES>('jjk');
  return (
    <div className="space-y-1 rounded-xl bg-bg-side p-2.5">
      <Pick label="Iluminação" value={scene.lighting} options={[['day', 'Dia'], ['night', 'Noite'], ['neon', 'Neon'], ['warm', 'Quente']]} onChange={(lighting) => onChange({ lighting })} />
      <Pick label="Partículas decorativas" value={scene.particles} options={ROOM_PARTICLES.map((p) => [p, PART_LABEL[p]])} onChange={(particles) => onChange({ particles })} />
      <div className="mb-3">
        <div className="mb-1 text-[11px] font-black uppercase tracking-wider text-fg-faint">Cor de destaque</div>
        <input type="color" aria-label="Cor de destaque do cantinho" className="h-8 w-14 cursor-pointer rounded bg-transparent" value={scene.accent} onChange={(e) => onChange({ accent: e.target.value })} />
      </div>
      <label className="mb-3 flex items-center justify-between text-xs text-fg">
        Detalhes animados (telas, luzes)
        <Switch checked={scene.animated} onChange={(animated) => onChange({ animated })} />
      </label>
      <div className="text-[11px] font-black uppercase tracking-wider text-fg-faint">Temas Anime Legends</div>
      <div className="flex gap-1">
        {(Object.entries(AL_UNIVERSES) as Array<[keyof typeof AL_UNIVERSES, string]>).map(([id, n]) => (
          <button key={id} aria-pressed={uni === id} onClick={() => setUni(id)} className={clsx('rounded-md px-1.5 py-0.5 text-[10px] font-bold', uni === id ? 'bg-brand text-white' : 'bg-line/[0.06] text-fg-muted')}>
            {n}
          </button>
        ))}
      </div>
      <div className="grid gap-1 pt-1">
        <button aria-pressed={!scene.ambiance} onClick={() => onChange({ ambiance: null })} className={clsx('rounded-lg border px-2 py-1 text-left text-[11px]', !scene.ambiance ? 'border-brand bg-brand/15' : 'border-line/[0.08] text-fg-muted')}>
          Sem ambientação
        </button>
        {AL_COLLECTIONS.filter((c) => c.universe === uni).map((c) => (
          <button key={c.id} aria-pressed={scene.ambiance === c.id} onClick={() => onChange({ ambiance: c.id, accent: c.palette[0] })} className={clsx('flex items-center gap-2 rounded-lg border px-2 py-1 text-left text-[11px]', scene.ambiance === c.id ? 'border-brand bg-brand/15 text-fg-strong' : 'border-line/[0.08] text-fg-muted hover:text-fg-strong')}>
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${c.palette[0]}, ${c.palette[1]})` }} />
            <span className="min-w-0 flex-1 truncate font-semibold">{c.names.spaces}</span>
            <span className="shrink-0 text-[9px] text-fg-faint">{c.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
