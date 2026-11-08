import { memo, type CSSProperties, type ReactNode } from 'react';
import clsx from 'clsx';
import { DEFAULT_SPACE, ROOM_PRESETS, spaceSceneSchema, type SpaceScene as Scene } from '@aldetes/shared';
import { RoomView } from './Room';

/**
 * Spaces — one person's corner, drawn in 2.5D with plain layers (gradients + a perspective floor plane).
 * No WebGL, no images to download, no blur filters: a corner is ~30 DOM nodes with `contain: strict`.
 * Optional tiny loops (monitor glow, lamp, neon) carry the class `sp-anim`; CSS pauses them in Econômico/Reduzido,
 * under measured load, off screen, while a stream is decoding (density "mini") and when the window is hidden.
 */
export type Density = 'full' | 'normal' | 'light' | 'mini';

export const PRESETS: Record<Scene['preset'], { label: string; desc: string; defaults: Partial<Scene> }> = {
  gamer: { label: 'Setup gamer', desc: 'Mesa, dois monitores, cadeira e neon', defaults: { lighting: 'neon', accent: '#ff2d78', items: ['desk', 'monitors', 'chair', 'neon', 'posters', 'speaker'] } },
  cozy: { label: 'Quarto aconchegante', desc: 'Cama, abajur, janela e um gato', defaults: { lighting: 'warm', accent: '#f59e0b', items: ['bed', 'lamp', 'window', 'plant', 'rug', 'cat'] } },
  lounge: { label: 'Lounge futurista', desc: 'Sofá, janelão da cidade e neon', defaults: { lighting: 'night', accent: '#22d3ee', items: ['sofa', 'window', 'neon', 'plant', 'rug', 'lamp'] } },
  studio: { label: 'Estúdio criativo', desc: 'Cavalete, estante e luz do dia', defaults: { lighting: 'day', accent: '#a855f7', items: ['easel', 'shelf', 'window', 'plant', 'desk', 'lamp'] } },
  minimal: { label: 'Minimalista', desc: 'Pouca coisa, muita calma', defaults: { lighting: 'day', accent: '#8b5cf6', items: ['plant', 'window', 'rug'] } },
  office: { label: 'Escritório moderno', desc: 'Mesa, estante e muita luz', defaults: { lighting: 'day', accent: '#0ea5e9' } },
  japanese: { label: 'Quarto japonês', desc: 'Futon, tatame e lanternas', defaults: { lighting: 'warm', accent: '#e11d48' } },
  anime: { label: 'Anime Legends Room', desc: 'Colecionáveis, pôsteres e estrelas', defaults: { lighting: 'night', accent: '#a855f7' } },
  luxury: { label: 'Apartamento de luxo', desc: 'Mármore, sofá e luz baixa', defaults: { lighting: 'night', accent: '#eab308' } },
};

/** 2.2 Smart Room Builder starter rooms (editable layouts) mapped to the scene presets. */
export const BUILDER_PRESET: Record<string, Scene['preset']> = { gamer: 'gamer', cozy: 'cozy', office: 'office', lounge: 'lounge', japanese: 'japanese', minimal: 'minimal', anime: 'anime', luxury: 'luxury' };
export function presetScene(id: keyof typeof ROOM_PRESETS, base: Partial<Scene> = {}): Scene {
  const r = ROOM_PRESETS[id]!;
  return { ...DEFAULT_SPACE, ...base, preset: BUILDER_PRESET[id] ?? 'minimal', lighting: r.lighting, accent: r.accent, wall: r.wall, floor: r.floor, particles: r.particles, objects: r.objects.map((o) => ({ ...o })), items: [] };
}

export const ITEM_LABEL: Record<Scene['items'][number], string> = {
  desk: 'Mesa', monitors: 'Monitores', chair: 'Cadeira gamer', bed: 'Cama', sofa: 'Sofá', plant: 'Planta', shelf: 'Estante', lamp: 'Luminária',
  neon: 'Placa neon', window: 'Janela', rug: 'Tapete', speaker: 'Caixa de som', easel: 'Cavalete', cat: 'Gato', posters: 'Pôsteres',
};

/**
 * Parse whatever came from the network into a valid scene (unknown/old data → defaults, never a crash).
 * Someone who never chose gets one of the five ready scenes (always the same for that person, picked from the id)
 * with its furniture — a full call never looks like a row of empty rooms.
 */
export function sceneOf(raw: unknown, userId?: string): Scene {
  if (raw) {
    const r = spaceSceneSchema.safeParse(raw);
    if (r.success) return r.data;
  }
  if (!userId) return presetScene('minimal');
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  // someone who never chose gets one of the 8 furnished starter rooms (always the same for that person)
  const ids = Object.keys(ROOM_PRESETS) as Array<keyof typeof ROOM_PRESETS>;
  return presetScene(ids[h % ids.length]!);
}

const WALLS: Record<Scene['lighting'], Record<Scene['backdrop'], [string, string]>> = {
  day: { a: ['#e9e4f5', '#cfc6e6'], b: ['#e7efe9', '#c6d8cc'], c: ['#f3e8dc', '#dcc7b0'] },
  night: { a: ['#1b1838', '#0e0c22'], b: ['#12223a', '#0a1426'], c: ['#24172e', '#140c1c'] },
  neon: { a: ['#1a0a2e', '#0b0418'], b: ['#081a26', '#040d14'], c: ['#22091f', '#10040f'] },
  warm: { a: ['#3a2418', '#22140c'], b: ['#33261c', '#1d150f'], c: ['#3b1f22', '#211114'] },
};
const FLOORS: Record<Scene['lighting'], [string, string]> = {
  day: ['#c9b79c', '#a8916f'],
  night: ['#2a2540', '#171428'],
  neon: ['#1c1230', '#0c0818'],
  warm: ['#5b3a24', '#3a2416'],
};

const P = (s: CSSProperties) => s;

/** One decorative item at its fixed slot (no collisions: one slot per item type). */
function Item({ id, accent, lighting, anim }: { id: Scene['items'][number]; accent: string; lighting: Scene['lighting']; anim: boolean }) {
  const dark = lighting !== 'day';
  const wood = lighting === 'warm' ? '#7a4a2a' : dark ? '#2b2440' : '#b08b62';
  const a = anim ? 'sp-anim' : '';
  switch (id) {
    case 'window':
      return (
        <div className="sp-i" style={P({ left: '8%', top: '12%', width: '24%', height: '34%', borderRadius: 6, border: `3px solid ${dark ? '#2e2a48' : '#fff'}`, background: lighting === 'day' ? 'linear-gradient(#9fd6ff,#d9f0ff)' : lighting === 'warm' ? 'linear-gradient(#ff9a5c,#5b2a4a)' : 'linear-gradient(#0b1030,#1a1450 70%,#ff2d7840)' })}>
          {dark && <span className="sp-i" style={P({ left: 0, right: 0, bottom: 0, height: '42%', background: 'repeating-linear-gradient(90deg,#0a0a1a 0 10%,#14143a 10% 16%,#0a0a1a 16% 24%)', opacity: 0.9 })} />}
          <span className="sp-i" style={P({ left: '48%', top: 0, bottom: 0, width: 3, background: dark ? '#2e2a48' : '#fff' })} />
        </div>
      );
    case 'posters':
      return (
        <>
          <div className="sp-i" style={P({ left: '38%', top: '14%', width: '10%', height: '20%', borderRadius: 3, background: `linear-gradient(160deg,${accent},#1b1240)` })} />
          <div className="sp-i" style={P({ left: '50%', top: '18%', width: '8%', height: '15%', borderRadius: 3, background: 'linear-gradient(160deg,#22d3ee,#0b1030)' })} />
        </>
      );
    case 'neon':
      return <div className={clsx('sp-i sp-neon', a)} style={P({ right: '10%', top: '14%', width: '20%', height: '9%', borderRadius: 999, border: `3px solid ${accent}`, boxShadow: `0 0 10px ${accent}, inset 0 0 8px ${accent}` })} />;
    case 'shelf':
      return (
        <div className="sp-i" style={P({ right: '8%', top: '16%', width: '22%', height: '30%' })}>
          {[0, 1, 2].map((r) => (
            <span key={r} className="sp-i" style={P({ left: 0, right: 0, top: `${r * 36 + 28}%`, height: 4, background: wood })} />
          ))}
          {[0, 1, 2, 3, 4].map((b) => (
            <span key={b} className="sp-i" style={P({ left: `${8 + b * 17}%`, top: `${(b % 3) * 36 + 6}%`, width: '11%', height: '22%', background: [accent, '#22d3ee', '#f59e0b', '#22c55e', '#e11d48'][b], borderRadius: 2 })} />
          ))}
        </div>
      );
    case 'lamp':
      return (
        <div className="sp-i" style={P({ left: '6%', bottom: '24%', width: '8%', height: '34%' })}>
          <span className="sp-i" style={P({ left: '46%', bottom: 0, width: 3, height: '78%', background: '#3f3a55' })} />
          <span className={clsx('sp-i sp-lamp', a)} style={P({ left: 0, top: 0, width: '100%', height: '26%', borderRadius: '50% 50% 8px 8px', background: lighting === 'day' ? '#f5f5f5' : '#ffe1a6', boxShadow: dark ? '0 10px 30px 6px #ffcf7a55' : undefined })} />
        </div>
      );
    case 'desk':
      return (
        <div className="sp-i" style={P({ left: '30%', bottom: '18%', width: '40%', height: '22%' })}>
          <span className="sp-i" style={P({ left: 0, right: 0, top: 0, height: '14%', background: wood, borderRadius: 3 })} />
          <span className="sp-i" style={P({ left: '4%', top: '14%', width: 4, bottom: 0, background: wood })} />
          <span className="sp-i" style={P({ right: '4%', top: '14%', width: 4, bottom: 0, background: wood })} />
        </div>
      );
    case 'monitors':
      return (
        <>
          {[0, 1].map((m) => (
            <div key={m} className={clsx('sp-i sp-screen', a)} style={P({ left: `${33 + m * 18}%`, bottom: '42%', width: '16%', height: '15%', borderRadius: 3, border: '2px solid #111', background: m ? `linear-gradient(135deg,${accent},#1b1240)` : 'linear-gradient(135deg,#22d3ee,#0b1030)', boxShadow: dark ? `0 0 16px ${m ? accent : '#22d3ee'}66` : undefined })} />
          ))}
        </>
      );
    case 'chair':
      return <div className="sp-i" style={P({ left: '43%', bottom: '8%', width: '14%', height: '26%', borderRadius: '30% 30% 10% 10%', background: `linear-gradient(${accent},#1a1a2a)` })} />;
    case 'bed':
      return (
        <div className="sp-i" style={P({ right: '6%', bottom: '10%', width: '42%', height: '22%' })}>
          <span className="sp-i" style={P({ inset: 0, top: '30%', borderRadius: 8, background: wood })} />
          <span className="sp-i" style={P({ left: '4%', right: '4%', top: '8%', height: '42%', borderRadius: 10, background: lighting === 'warm' ? '#e9c9a8' : '#dfe3f5' })} />
          <span className="sp-i" style={P({ left: '6%', top: 0, width: '26%', height: '30%', borderRadius: 10, background: '#fff' })} />
          <span className="sp-i" style={P({ left: '38%', right: '4%', top: '8%', height: '42%', borderRadius: 10, background: accent, opacity: 0.85 })} />
        </div>
      );
    case 'sofa':
      return (
        <div className="sp-i" style={P({ left: '50%', bottom: '10%', width: '44%', height: '22%', transform: 'translateX(-10%)' })}>
          <span className="sp-i" style={P({ left: 0, right: 0, top: 0, height: '55%', borderRadius: '14px 14px 6px 6px', background: `linear-gradient(${accent},${accent}aa)` })} />
          <span className="sp-i" style={P({ left: '-4%', right: '-4%', top: '45%', height: '45%', borderRadius: 10, background: `${accent}cc` })} />
        </div>
      );
    case 'plant':
      return (
        <div className="sp-i" style={P({ right: '6%', bottom: '14%', width: '9%', height: '28%' })}>
          <span className="sp-i" style={P({ left: '18%', right: '18%', bottom: 0, height: '30%', borderRadius: '4px 4px 10px 10px', background: '#c2410c' })} />
          {[0, 1, 2].map((l) => (
            <span key={l} className="sp-i" style={P({ left: `${l * 26}%`, bottom: '26%', width: '50%', height: '70%', borderRadius: '50% 50% 50% 0', background: ['#16a34a', '#22c55e', '#15803d'][l], transform: `rotate(${(l - 1) * 20}deg)` })} />
          ))}
        </div>
      );
    case 'rug':
      return <div className="sp-i" style={P({ left: '24%', bottom: '4%', width: '52%', height: '12%', borderRadius: '50%', background: `radial-gradient(${accent}66,${accent}22 70%,transparent 71%)` })} />;
    case 'speaker':
      return (
        <div className="sp-i" style={P({ left: '14%', bottom: '16%', width: '8%', height: '18%', borderRadius: 4, background: '#1f1b2e' })}>
          <span className={clsx('sp-i sp-beat', a)} style={P({ left: '20%', right: '20%', top: '46%', aspectRatio: '1', borderRadius: '50%', background: '#000', boxShadow: `0 0 0 2px ${accent}` })} />
        </div>
      );
    case 'easel':
      return (
        <div className="sp-i" style={P({ left: '14%', bottom: '14%', width: '16%', height: '40%' })}>
          <span className="sp-i" style={P({ left: '10%', right: '10%', top: 0, height: '56%', borderRadius: 3, background: `linear-gradient(135deg,#fff 0 30%,${accent} 30% 60%,#22d3ee 60%)`, border: `3px solid ${wood}` })} />
          <span className="sp-i" style={P({ left: '46%', top: '50%', width: 4, bottom: 0, background: wood })} />
        </div>
      );
    case 'cat':
      return (
        <div className="sp-i" style={P({ right: '30%', bottom: '24%', width: '7%', height: '7%' })}>
          <span className="sp-i" style={P({ inset: 0, borderRadius: '50% 50% 40% 40%', background: '#2b2b2b' })} />
          <span className="sp-i" style={P({ left: '6%', top: '-22%', width: '30%', height: '40%', background: '#2b2b2b', clipPath: 'polygon(0 100%,50% 0,100% 100%)' })} />
          <span className="sp-i" style={P({ right: '6%', top: '-22%', width: '30%', height: '40%', background: '#2b2b2b', clipPath: 'polygon(0 100%,50% 0,100% 100%)' })} />
        </div>
      );
  }
}

const AVATAR_X = { left: '28%', center: '50%', right: '72%' } as const;


/**
 * The corner. `density` follows the call size: full (1–2), normal (3–6), light (7–10: 3 items, no loops),
 * mini (streams on screen: backdrop + person only). `children` is the person (avatar + name), placed on the floor.
 */
export const SpaceScene = memo(function SpaceScene({ scene, density, children, worldTint }: { scene: Scene; density: Density; children?: ReactNode; worldTint?: string | null }) {
  // 2.2: rooms made in the Smart Room Builder (free layout); older corners keep the slot renderer below
  if (scene.objects)
    return (
      <RoomView scene={scene} density={density} worldTint={worldTint}>
        {children}
      </RoomView>
    );
  const [w0, w1] = WALLS[scene.lighting][scene.backdrop];
  const [f0, f1] = FLOORS[scene.lighting];
  const items = density === 'mini' ? [] : density === 'light' ? scene.items.slice(0, 3) : scene.items;
  const anim = scene.animated && (density === 'full' || density === 'normal');
  return (
    <div className={clsx('sp-room', `sp-d-${density}`)} data-preset={scene.preset}>
      {/* back wall + soft light pool (radial gradient, no blur) */}
      <div className="sp-i" style={P({ inset: 0, background: `radial-gradient(70% 60% at 50% 20%, ${scene.accent}2e, transparent 70%), linear-gradient(${w0}, ${w1})` })} />
      {/* server identity (Worlds): a very subtle tint across the room */}
      {worldTint && <div className="sp-i" style={P({ inset: 0, background: `linear-gradient(120deg, ${worldTint}1f, transparent 60%)` })} />}
      {/* floor plane (static perspective transform — composited once) */}
      <div className="sp-floor" style={P({ background: `linear-gradient(${f0}, ${f1})` })} />
      <div className="sp-i" style={P({ left: 0, right: 0, bottom: '33%', height: 2, background: '#0000002a' })} />
      {items.map((id) => (
        <Item key={id} id={id} accent={scene.accent} lighting={scene.lighting} anim={anim} />
      ))}
      <div className="sp-person" style={P({ left: AVATAR_X[scene.avatarPos] })}>
        {children}
      </div>
    </div>
  );
});
