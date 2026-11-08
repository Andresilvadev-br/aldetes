/**
 * Smart Room Builder — the rules of a Spaces corner, shared by the editor (live validation while dragging) and the
 * server (a layout that breaks them is refused). Pure functions, no physics engine.
 *
 * Coordinates (units, not pixels):
 *  - floor: x 0..100 (left → right), y 0..60 (back wall → front). An object's (x, y) is the CENTER of its footprint.
 *  - wall:  x 0..100, y 0..40 (floor line → ceiling). Same center convention.
 *  - top:   on a surface (desk, shelf, bed…): `p` = parent object id; x/y are the center inside the parent's top
 *           (x along its width, y along its depth, 0 = back edge).
 * Rotation r = 0..3 (×90°); on the floor r = 1 / 3 swaps width and depth.
 */
export const FLOOR_W = 100;
export const FLOOR_D = 60;
export const WALL_H = 40;

export type Place = 'floor' | 'rug' | 'wall' | 'top' | 'floorOrTop';
export type RoomCat = 'seating' | 'beds' | 'gamer' | 'lighting' | 'decor' | 'tables' | 'walls' | 'effects';
export const ROOM_CATS: Record<RoomCat, string> = {
  seating: 'Sofás e cadeiras',
  beds: 'Camas e conforto',
  gamer: 'Setup gamer',
  lighting: 'Iluminação',
  decor: 'Plantas e decoração',
  tables: 'Mesas e estantes',
  walls: 'Paredes e quadros',
  effects: 'Efeitos e temas',
};

export interface RoomItemDef {
  label: string;
  cat: RoomCat;
  place: Place;
  /** footprint: floor/top = width × depth; wall = width × height */
  w: number;
  d: number;
  /** visual height in floor units (drawing only) */
  h: number;
  /** provides a surface other objects can stand on */
  top?: boolean;
  tags?: string;
}

export const ROOM_ITEMS = {
  // Sofás e cadeiras
  sofa: { label: 'Sofá', cat: 'seating', place: 'floor', w: 30, d: 12, h: 12, top: true, tags: 'sofá estofado' },
  armchair: { label: 'Poltrona', cat: 'seating', place: 'floor', w: 14, d: 12, h: 12, tags: 'poltrona' },
  'gamer-chair': { label: 'Cadeira gamer', cat: 'seating', place: 'floor', w: 10, d: 10, h: 20, tags: 'cadeira gamer' },
  pouf: { label: 'Pufe', cat: 'seating', place: 'floor', w: 8, d: 8, h: 6, tags: 'pufe puff' },
  bench: { label: 'Banco', cat: 'seating', place: 'floor', w: 24, d: 8, h: 7, top: true, tags: 'banco' },
  // Camas e conforto
  bed: { label: 'Cama', cat: 'beds', place: 'floor', w: 34, d: 22, h: 10, top: true, tags: 'cama casal' },
  futon: { label: 'Futon', cat: 'beds', place: 'floor', w: 30, d: 18, h: 5, top: true, tags: 'futon japonês cama' },
  pillows: { label: 'Almofadas', cat: 'beds', place: 'floorOrTop', w: 7, d: 4, h: 4, tags: 'almofada' },
  blanket: { label: 'Manta', cat: 'beds', place: 'top', w: 12, d: 6, h: 2, tags: 'manta coberta' },
  'rug-round': { label: 'Tapete redondo', cat: 'beds', place: 'rug', w: 30, d: 16, h: 0, tags: 'tapete' },
  'rug-rect': { label: 'Tapete retangular', cat: 'beds', place: 'rug', w: 40, d: 18, h: 0, tags: 'tapete' },
  // Setup gamer
  'gamer-desk': { label: 'Mesa gamer', cat: 'gamer', place: 'floor', w: 40, d: 14, h: 12, top: true, tags: 'mesa gamer rgb' },
  monitor: { label: 'Monitor', cat: 'gamer', place: 'top', w: 10, d: 3, h: 8, tags: 'monitor tela' },
  ultrawide: { label: 'Monitor ultrawide', cat: 'gamer', place: 'top', w: 16, d: 3, h: 8, tags: 'monitor ultrawide tela' },
  laptop: { label: 'Notebook', cat: 'gamer', place: 'top', w: 8, d: 5, h: 5, tags: 'notebook laptop' },
  keyboard: { label: 'Teclado e mouse', cat: 'gamer', place: 'top', w: 9, d: 3, h: 1, tags: 'teclado mouse periférico' },
  'pc-tower': { label: 'PC gamer', cat: 'gamer', place: 'floorOrTop', w: 6, d: 10, h: 12, tags: 'pc gabinete computador' },
  headset: { label: 'Headset', cat: 'gamer', place: 'top', w: 3, d: 3, h: 5, tags: 'fone headset periférico' },
  console: { label: 'Console', cat: 'gamer', place: 'top', w: 7, d: 4, h: 3, tags: 'console videogame' },
  // Iluminação
  'floor-lamp': { label: 'Luminária de chão', cat: 'lighting', place: 'floor', w: 6, d: 6, h: 26, tags: 'luminária luz' },
  'table-lamp': { label: 'Abajur', cat: 'lighting', place: 'top', w: 4, d: 4, h: 7, tags: 'abajur luz' },
  'led-strip': { label: 'Fita de LED', cat: 'lighting', place: 'wall', w: 60, d: 2, h: 0, tags: 'led fita luz' },
  'neon-sign': { label: 'Letreiro neon', cat: 'lighting', place: 'wall', w: 18, d: 8, h: 0, tags: 'neon letreiro luz' },
  lantern: { label: 'Lanterna de papel', cat: 'lighting', place: 'floorOrTop', w: 5, d: 5, h: 8, tags: 'lanterna japonesa luz temática' },
  'moon-lamp': { label: 'Luminária lua', cat: 'lighting', place: 'top', w: 5, d: 5, h: 5, tags: 'lua luminária temática' },
  // Plantas e decoração
  plant: { label: 'Vaso com planta', cat: 'decor', place: 'floor', w: 7, d: 7, h: 14, tags: 'planta vaso' },
  'tall-plant': { label: 'Planta alta', cat: 'decor', place: 'floor', w: 8, d: 8, h: 24, tags: 'planta alta' },
  cactus: { label: 'Cacto', cat: 'decor', place: 'top', w: 3, d: 3, h: 4, tags: 'cacto planta' },
  bonsai: { label: 'Bonsai', cat: 'decor', place: 'top', w: 5, d: 4, h: 5, tags: 'bonsai planta' },
  statue: { label: 'Estátua', cat: 'decor', place: 'floor', w: 8, d: 8, h: 20, tags: 'estátua escultura' },
  figure: { label: 'Colecionável', cat: 'decor', place: 'top', w: 3, d: 3, h: 5, tags: 'action figure colecionável' },
  vase: { label: 'Vaso decorativo', cat: 'decor', place: 'top', w: 4, d: 4, h: 6, tags: 'vaso' },
  cat: { label: 'Gato', cat: 'decor', place: 'floorOrTop', w: 7, d: 5, h: 5, tags: 'gato pet' },
  // Mesas e estantes
  desk: { label: 'Escrivaninha', cat: 'tables', place: 'floor', w: 30, d: 12, h: 12, top: true, tags: 'mesa escrivaninha' },
  'coffee-table': { label: 'Mesa de centro', cat: 'tables', place: 'floor', w: 18, d: 10, h: 5, top: true, tags: 'mesa centro' },
  'side-table': { label: 'Mesa lateral', cat: 'tables', place: 'floor', w: 8, d: 8, h: 8, top: true, tags: 'mesa lateral criado-mudo' },
  bookcase: { label: 'Estante', cat: 'tables', place: 'floor', w: 20, d: 6, h: 28, top: true, tags: 'estante livros prateleira' },
  drawer: { label: 'Gaveteiro', cat: 'tables', place: 'floor', w: 12, d: 8, h: 11, top: true, tags: 'gaveteiro cômoda' },
  // Paredes e quadros
  window: { label: 'Janela', cat: 'walls', place: 'wall', w: 24, d: 18, h: 0, tags: 'janela' },
  poster: { label: 'Pôster', cat: 'walls', place: 'wall', w: 8, d: 12, h: 0, tags: 'pôster poster' },
  frame: { label: 'Quadro', cat: 'walls', place: 'wall', w: 12, d: 9, h: 0, tags: 'quadro arte' },
  panel: { label: 'Painel acústico', cat: 'walls', place: 'wall', w: 18, d: 16, h: 0, tags: 'painel revestimento' },
  clock: { label: 'Relógio', cat: 'walls', place: 'wall', w: 6, d: 6, h: 0, tags: 'relógio' },
  tv: { label: 'TV', cat: 'walls', place: 'wall', w: 26, d: 15, h: 0, tags: 'tv televisão' },
  shelf: { label: 'Prateleira', cat: 'walls', place: 'wall', w: 20, d: 3, h: 0, tags: 'prateleira parede' },
} satisfies Record<string, RoomItemDef>;
export type RoomItemKey = keyof typeof ROOM_ITEMS;
export const ROOM_ITEM_KEYS = Object.keys(ROOM_ITEMS) as [RoomItemKey, ...RoomItemKey[]];
export const itemDef = (k: string): RoomItemDef | undefined => (ROOM_ITEMS as Record<string, RoomItemDef>)[k];

/** Room-level choices (category "Efeitos e temas" + "Paredes": wallpapers and coverings). */
export const WALLPAPERS = ['plain', 'stripes', 'brick', 'wood', 'concrete', 'shoji', 'marble', 'grid', 'stars'] as const;
export const FLOOR_STYLES = ['wood', 'tatami', 'marble', 'carpet', 'tiles', 'concrete', 'neon-grid'] as const;
export const ROOM_PARTICLES = ['none', 'dust', 'stars', 'petals', 'snow', 'embers', 'fireflies'] as const;

export interface RoomObject {
  i: string;
  k: RoomItemKey;
  x: number;
  y: number;
  r?: number;
  /** parent object id when standing on a surface */
  p?: string;
}

const rot = (o: RoomObject, d: RoomItemDef) => (d.place === 'wall' || !((o.r ?? 0) % 2) ? { w: d.w, d: d.d } : { w: d.d, d: d.w });
export function footprint(o: RoomObject) {
  const d = itemDef(o.k)!;
  const s = rot(o, d);
  return { x0: o.x - s.w / 2, x1: o.x + s.w / 2, y0: o.y - s.d / 2, y1: o.y + s.d / 2, w: s.w, d: s.d };
}
const overlap = (a: { x0: number; x1: number; y0: number; y1: number }, b: { x0: number; x1: number; y0: number; y1: number }) =>
  a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.y0 < b.y1 - 0.01 && b.y0 < a.y1 - 0.01;

/** Where the person stands (kept free of solid furniture so the avatar is never hidden). */
export const AVATAR_X = { left: 28, center: 50, right: 72 } as const;
export function avatarZone(pos: keyof typeof AVATAR_X) {
  const x = AVATAR_X[pos];
  return { x0: x - 8, x1: x + 8, y0: 34, y1: FLOOR_D };
}

/** Is it standing on the floor (vs on a surface / the wall)? */
export const onFloor = (o: RoomObject) => {
  const d = itemDef(o.k);
  return !!d && !o.p && (d.place === 'floor' || d.place === 'floorOrTop');
};

export type Problem = { i: string; why: 'bounds' | 'collision' | 'surface' | 'avatar' | 'unknown' | 'wall'; with?: string };

/**
 * Check a whole layout (or, with `only`, just the objects being moved). Returns every problem; [] = valid.
 * Exceptions by design: rugs go under furniture (they only collide with other rugs), things on surfaces only collide
 * with what's on the same surface, wall items only with other wall items.
 */
export function validateLayout(objects: RoomObject[], avatarPos: keyof typeof AVATAR_X = 'center', only?: Set<string>): Problem[] {
  const out: Problem[] = [];
  const byId = new Map(objects.map((o) => [o.i, o]));
  const az = avatarZone(avatarPos);
  for (const o of objects) {
    if (only && !only.has(o.i)) continue;
    const d = itemDef(o.k);
    if (!d) {
      out.push({ i: o.i, why: 'unknown' });
      continue;
    }
    const f = footprint(o);
    if (o.p) {
      const parent = byId.get(o.p);
      const pd = parent && itemDef(parent.k);
      if (!parent || !pd?.top || parent.p || !(d.place === 'top' || d.place === 'floorOrTop')) {
        out.push({ i: o.i, why: 'surface' });
        continue;
      }
      const ps = rot(parent, pd);
      if (f.x0 < -0.01 || f.x1 > ps.w + 0.01 || f.y0 < -0.01 || f.y1 > ps.d + 0.01) {
        out.push({ i: o.i, why: 'bounds' });
        continue;
      }
      for (const s of objects) {
        if (s === o || s.p !== o.p) continue;
        if (overlap(f, footprint(s))) {
          out.push({ i: o.i, why: 'collision', with: s.i });
          break;
        }
      }
      continue;
    }
    if (d.place === 'top') {
      out.push({ i: o.i, why: 'surface' });
      continue;
    }
    if (d.place === 'wall') {
      if (f.x0 < -0.01 || f.x1 > FLOOR_W + 0.01 || f.y0 < -0.01 || f.y1 > WALL_H + 0.01) {
        out.push({ i: o.i, why: 'bounds' });
        continue;
      }
      const hit = objects.find((s) => s !== o && !s.p && itemDef(s.k)?.place === 'wall' && overlap(f, footprint(s)));
      if (hit) out.push({ i: o.i, why: 'collision', with: hit.i });
      continue;
    }
    if (f.x0 < -0.01 || f.x1 > FLOOR_W + 0.01 || f.y0 < -0.01 || f.y1 > FLOOR_D + 0.01) {
      out.push({ i: o.i, why: 'bounds' });
      continue;
    }
    const rug = d.place === 'rug';
    const hit = objects.find((s) => {
      if (s === o || s.p) return false;
      const sd = itemDef(s.k);
      if (!sd || sd.place === 'wall' || sd.place === 'top') return false;
      if (rug !== (sd.place === 'rug')) return false; // rugs under furniture
      return overlap(f, footprint(s));
    });
    if (hit) {
      out.push({ i: o.i, why: 'collision', with: hit.i });
      continue;
    }
    if (!rug && overlap(f, az)) out.push({ i: o.i, why: 'avatar' });
  }
  return out;
}

const round = (v: number) => Math.round(v * 2) / 2;

/**
 * Smart snap while dragging (optional): grid, then align to a neighbour's edge when within 2 units, then — if the
 * spot is still invalid — the nearest valid spot within a small radius. Only the dragged object is checked.
 */
export function snapPosition(objects: RoomObject[], o: RoomObject, opts: { grid: boolean; smart: boolean; avatarPos: keyof typeof AVATAR_X; /** look for the nearest free spot (on drop), default true */ nearest?: boolean }): RoomObject {
  let c = { ...o, x: opts.grid ? Math.round(o.x / 2) * 2 : round(o.x), y: opts.grid ? Math.round(o.y / 2) * 2 : round(o.y) };
  if (!opts.smart) return c;
  const d = itemDef(o.k)!;
  const f = footprint(c);
  // edge alignment with neighbours on the same plane
  for (const s of objects) {
    if (s.i === o.i || !!s.p !== !!o.p || (o.p && s.p !== o.p)) continue;
    const sd = itemDef(s.k);
    if (!sd || (sd.place === 'wall') !== (d.place === 'wall')) continue;
    const g = footprint(s);
    for (const [a, b] of [[f.x0, g.x1], [f.x1, g.x0], [f.x0, g.x0], [f.x1, g.x1]] as const) if (Math.abs(a - b) < 2) c = { ...c, x: round(c.x + (b - a)) };
    for (const [a, b] of [[f.y0, g.y1], [f.y1, g.y0], [f.y0, g.y0]] as const) if (Math.abs(a - b) < 2) c = { ...c, y: round(c.y + (b - a)) };
  }
  const rest = objects.filter((s) => s.i !== o.i);
  if (opts.nearest === false || !validateLayout([...rest, c], opts.avatarPos, new Set([o.i])).length) return c;
  // nearest valid spot (square spiral, radius up to 24 units, step 1)
  for (let r = 1; r <= 24; r++)
    for (let dx = -r; dx <= r; dx++)
      for (const dy of [-r, r, ...Array.from({ length: 2 * r - 1 }, (_, k) => k - r + 1)]) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const t = { ...c, x: c.x + dx, y: c.y + dy };
        if (!validateLayout([...rest, t], opts.avatarPos, new Set([o.i])).length) return t;
      }
  return c;
}

/**
 * "Organizar automaticamente": deterministic, no AI. Keeps every object that is already valid where it is; moves the
 * others to the closest valid spot (scanning from their original position, back wall first), keeps the avatar area
 * free, and drops what doesn't fit anywhere. Returns the proposal + what moved/was removed, for a preview.
 */
export function autoArrange(objects: RoomObject[], avatarPos: keyof typeof AVATAR_X = 'center') {
  const placed: RoomObject[] = [];
  const moved: string[] = [];
  const removed: string[] = [];
  const area = (o: RoomObject) => {
    const d = itemDef(o.k);
    return d ? d.w * d.d : 0;
  };
  const order = [...objects].sort((a, b) => {
    const pa = a.p ? 2 : itemDef(a.k)?.place === 'rug' ? 1 : 0;
    const pb = b.p ? 2 : itemDef(b.k)?.place === 'rug' ? 1 : 0;
    return pa - pb || area(b) - area(a) || a.i.localeCompare(b.i);
  });
  for (const o of order) {
    if (!itemDef(o.k)) {
      removed.push(o.i);
      continue;
    }
    if (o.p && !placed.some((p) => p.i === o.p)) {
      // its surface was removed: try the floor if allowed, otherwise drop it
      if (itemDef(o.k)!.place !== 'floorOrTop') {
        removed.push(o.i);
        continue;
      }
      o.p = undefined;
    }
    const ok = (t: RoomObject) => !validateLayout([...placed, t], avatarPos, new Set([t.i])).length;
    if (ok(o)) {
      placed.push({ ...o });
      continue;
    }
    const d = itemDef(o.k)!;
    let best: RoomObject | null = null;
    let bestDist = Infinity;
    const xs = Array.from({ length: 101 }, (_, k) => k);
    const ys = o.p ? Array.from({ length: 23 }, (_, k) => k) : d.place === 'wall' ? Array.from({ length: 41 }, (_, k) => 40 - k) : Array.from({ length: 61 }, (_, k) => k);
    for (const y of ys)
      for (const x of xs) {
        const t = { ...o, x, y };
        if (!ok(t)) continue;
        // back wall first for floor furniture, then closeness to where the person put it
        const dist = Math.hypot(x - o.x, y - o.y) + (d.place === 'floor' ? y * 0.15 : 0);
        if (dist < bestDist) {
          bestDist = dist;
          best = t;
        }
      }
    if (best) {
      placed.push(best);
      moved.push(o.i);
    } else removed.push(o.i);
  }
  // keep the original order (stable ids, stable render)
  const pos = new Map(objects.map((o, idx) => [o.i, idx]));
  placed.sort((a, b) => pos.get(a.i)! - pos.get(b.i)!);
  return { objects: placed, moved, removed };
}

/* ---------------- 8 editable starter rooms ---------------- */
let n = 0;
const O = (k: RoomItemKey, x: number, y: number, extra: Partial<RoomObject> = {}): RoomObject => ({ i: `o${(n++).toString(36)}`, k, x, y, ...extra });
const room = (f: () => RoomObject[]) => {
  n = 0;
  return f();
};
export const ROOM_PRESETS: Record<string, { label: string; wall: (typeof WALLPAPERS)[number]; floor: (typeof FLOOR_STYLES)[number]; lighting: 'day' | 'night' | 'neon' | 'warm'; accent: string; particles: (typeof ROOM_PARTICLES)[number]; objects: RoomObject[] }> = {
  gamer: { label: 'Gamer Room', wall: 'grid', floor: 'carpet', lighting: 'neon', accent: '#ff2d78', particles: 'none', objects: room(() => [O('gamer-desk', 50, 8), O('ultrawide', 20, 2, { p: 'o0' }), O('keyboard', 20, 8, { p: 'o0' }), O('headset', 34, 2, { p: 'o0' }), O('pc-tower', 76, 8), O('led-strip', 50, 34), O('neon-sign', 82, 24), O('poster', 14, 24), O('rug-rect', 50, 44), O('tall-plant', 8, 12)]) },
  cozy: { label: 'Cozy Bedroom', wall: 'wood', floor: 'wood', lighting: 'warm', accent: '#f59e0b', particles: 'dust', objects: room(() => [O('bed', 76, 12), O('blanket', 20, 14, { p: 'o0' }), O('pillows', 6, 4, { p: 'o0' }), O('side-table', 52, 6), O('table-lamp', 4, 4, { p: 'o3' }), O('window', 26, 24), O('rug-round', 46, 44), O('plant', 8, 8), O('cat', 18, 52), O('frame', 56, 26)]) },
  office: { label: 'Modern Office', wall: 'concrete', floor: 'tiles', lighting: 'day', accent: '#0ea5e9', particles: 'none', objects: room(() => [O('desk', 30, 8), O('monitor', 12, 2, { p: 'o0' }), O('laptop', 22, 6, { p: 'o0' }), O('bookcase', 78, 4), O('vase', 4, 3, { p: 'o3' }), O('figure', 12, 3, { p: 'o3' }), O('tall-plant', 94, 14), O('clock', 50, 30), O('window', 18, 24), O('armchair', 84, 52)]) },
  lounge: { label: 'Neon Lounge', wall: 'stripes', floor: 'neon-grid', lighting: 'neon', accent: '#22d3ee', particles: 'fireflies', objects: room(() => [O('sofa', 50, 8), O('pillows', 6, 4, { p: 'o0' }), O('coffee-table', 50, 22), O('neon-sign', 50, 30), O('led-strip', 50, 37), O('floor-lamp', 12, 8), O('plant', 88, 8), O('rug-rect', 50, 22), O('pouf', 84, 50)]) },
  japanese: { label: 'Japanese Room', wall: 'shoji', floor: 'tatami', lighting: 'warm', accent: '#e11d48', particles: 'petals', objects: room(() => [O('futon', 74, 12), O('lantern', 14, 8), O('coffee-table', 40, 10), O('bonsai', 5, 5, { p: 'o2' }), O('frame', 30, 26), O('window', 70, 26), O('pillows', 22, 52)]) },
  minimal: { label: 'Minimal Studio', wall: 'plain', floor: 'concrete', lighting: 'day', accent: '#8b5cf6', particles: 'none', objects: room(() => [O('desk', 24, 8), O('laptop', 15, 4, { p: 'o0' }), O('tall-plant', 90, 10), O('frame', 70, 26), O('rug-round', 50, 46)]) },
  anime: { label: 'Anime Legends Room', wall: 'stars', floor: 'wood', lighting: 'night', accent: '#a855f7', particles: 'stars', objects: room(() => [O('gamer-desk', 30, 8), O('monitor', 12, 2, { p: 'o0' }), O('figure', 24, 2, { p: 'o0' }), O('figure', 30, 2, { p: 'o0' }), O('bookcase', 78, 4), O('figure', 6, 3, { p: 'o4' }), O('moon-lamp', 14, 3, { p: 'o4' }), O('poster', 60, 26), O('poster', 70, 26), O('gamer-chair', 30, 22), O('rug-round', 50, 46)]) },
  luxury: { label: 'Luxury Apartment', wall: 'marble', floor: 'marble', lighting: 'night', accent: '#eab308', particles: 'dust', objects: room(() => [O('sofa', 62, 8), O('armchair', 16, 14), O('coffee-table', 62, 24), O('vase', 9, 5, { p: 'o2' }), O('statue', 92, 8), O('tv', 62, 26), O('floor-lamp', 34, 6), O('rug-rect', 60, 22), O('tall-plant', 6, 50)]) },
};
