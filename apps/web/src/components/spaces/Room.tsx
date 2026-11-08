import { memo, type CSSProperties, type ReactNode } from 'react';
import clsx from 'clsx';
import { AL_BY_ID, FLOOR_D, WALL_H, itemDef, type RoomObject, type SpaceScene as Scene } from '@aldetes/shared';
import { AlAmbient, AlBanner } from '../profile/AnimeLegends';

/**
 * Smart Room Builder renderer (2.5D, no WebGL): the back wall, a perspective floor and furniture drawn with CSS boxes.
 * Positions come from the layout coordinates (shared rules in @aldetes/shared/roomBuilder); sizes use container-query
 * units, so the same layout looks right in a 150 px strip tile and in the full-screen editor.
 */
export const WALL_BOTTOM = 44; // % from the bottom where the wall meets the floor

/** floor (x, y) → screen position (% of the room) + depth scale */
export function project(x: number, y: number) {
  const t = Math.max(0, Math.min(1, y / FLOOR_D));
  const s = 0.7 + 0.3 * t;
  return { left: 50 + (x - 50) * (0.86 + 0.14 * t), bottom: WALL_BOTTOM - 1 - t * (WALL_BOTTOM - 2), s };
}
/** inverse of project() for the editor (screen % → floor units) */
export function unproject(leftPct: number, bottomPct: number) {
  const t = Math.max(0, Math.min(1, (WALL_BOTTOM - 1 - bottomPct) / (WALL_BOTTOM - 2)));
  const x = 50 + (leftPct - 50) / (0.86 + 0.14 * t);
  return { x, y: t * FLOOR_D };
}
export const wallPos = (x: number, y: number) => ({ left: x, bottom: WALL_BOTTOM + (y / WALL_H) * (100 - WALL_BOTTOM) });
export const unwall = (leftPct: number, bottomPct: number) => ({ x: leftPct, y: ((bottomPct - WALL_BOTTOM) / (100 - WALL_BOTTOM)) * WALL_H });

/** fraction of the visual height where things can stand (seat of a sofa, mattress of a bed, desk top) */
const SURFACE: Record<string, number> = { sofa: 0.5, bench: 1, bed: 0.75, futon: 1, 'gamer-desk': 1, desk: 1, 'coffee-table': 1, 'side-table': 1, bookcase: 1, drawer: 1 };
const DEPTH_K = 0.3; // how much of the footprint depth shows as a top plane

const WALLS: Record<Scene['lighting'], [string, string]> = { day: ['#ece7f6', '#d3cbe6'], night: ['#1b1838', '#0e0c22'], neon: ['#1a0a2e', '#0b0418'], warm: ['#3a2418', '#22140c'] };
const WALLPAPER: Record<NonNullable<Scene['wall']>, (a: string, dark: boolean) => string> = {
  plain: () => 'none',
  stripes: (a) => `repeating-linear-gradient(90deg, ${a}14 0 18px, transparent 18px 36px)`,
  brick: (_, d) => `repeating-linear-gradient(0deg, ${d ? '#0000004d' : '#0000001f'} 0 2px, transparent 2px 22px), repeating-linear-gradient(90deg, ${d ? '#0000004d' : '#0000001f'} 0 2px, transparent 2px 46px), linear-gradient(${d ? '#5a2a20' : '#b5654a'}88, ${d ? '#3a1a14' : '#9a4f39'}88)`,
  wood: (_, d) => `repeating-linear-gradient(90deg, ${d ? '#00000040' : '#0000001a'} 0 2px, transparent 2px 28px), linear-gradient(${d ? '#4a2e1a' : '#c79a6b'}, ${d ? '#2e1c10' : '#a87b4f'})`,
  concrete: (_, d) => `radial-gradient(circle at 20% 30%, #ffffff0d 0 2px, transparent 3px) 0 0/22px 22px, linear-gradient(${d ? '#2c2f36' : '#b9bcc2'}, ${d ? '#1d1f24' : '#9da1a8'})`,
  shoji: (_, d) => `repeating-linear-gradient(0deg, ${d ? '#2a1a12' : '#6b4a2f'} 0 3px, transparent 3px 34px), repeating-linear-gradient(90deg, ${d ? '#2a1a12' : '#6b4a2f'} 0 3px, transparent 3px 30px), linear-gradient(${d ? '#3b3226' : '#f3ead8'}, ${d ? '#2a241b' : '#e6d9bf'})`,
  marble: (_, d) => `linear-gradient(120deg, transparent 40%, #ffffff22 42%, transparent 44%), linear-gradient(60deg, transparent 60%, #ffffff18 61%, transparent 63%), linear-gradient(${d ? '#2a2826' : '#ece7df'}, ${d ? '#1a1918' : '#d9d2c6'})`,
  grid: (a) => `linear-gradient(${a}22 1px, transparent 1px) 0 0/24px 24px, linear-gradient(90deg, ${a}22 1px, transparent 1px) 0 0/24px 24px`,
  stars: () => `radial-gradient(1.4px 1.4px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 60%, #fff, transparent), radial-gradient(1.2px 1.2px at 45% 15%, #fff, transparent), radial-gradient(1px 1px at 85% 25%, #fff, transparent)`,
};
const FLOORS: Record<NonNullable<Scene['floor']>, (a: string, dark: boolean) => string> = {
  wood: (_, d) => `repeating-linear-gradient(90deg, #00000026 0 2px, transparent 2px 40px), linear-gradient(${d ? '#3a2416' : '#b48b5e'}, ${d ? '#24160c' : '#8f6a42'})`,
  tatami: (_, d) => `repeating-linear-gradient(90deg, ${d ? '#1d1a0d' : '#6b6a3a'} 0 3px, transparent 3px 60px), repeating-linear-gradient(0deg, #0000000f 0 1px, transparent 1px 4px), linear-gradient(${d ? '#5a5530' : '#c9c27e'}, ${d ? '#3f3b20' : '#b0a865'})`,
  marble: (_, d) => `linear-gradient(110deg, transparent 45%, #ffffff26 46%, transparent 48%), linear-gradient(${d ? '#2b2a28' : '#e5e0d8'}, ${d ? '#1a1918' : '#cfc8bb'})`,
  carpet: (a, d) => `radial-gradient(#ffffff08 1px, transparent 1px) 0 0/6px 6px, linear-gradient(${d ? '#22203a' : '#8c86a8'}, ${d ? '#151325' : '#6d6789'})`,
  tiles: (_, d) => `linear-gradient(${d ? '#00000040' : '#0000001a'} 1px, transparent 1px) 0 0/34px 34px, linear-gradient(90deg, ${d ? '#00000040' : '#0000001a'} 1px, transparent 1px) 0 0/34px 34px, linear-gradient(${d ? '#2a2d33' : '#d7dade'}, ${d ? '#1b1d21' : '#bfc3c9'})`,
  concrete: (_, d) => `linear-gradient(${d ? '#26282d' : '#a9acb2'}, ${d ? '#17181b' : '#8e9298'})`,
  'neon-grid': (a) => `linear-gradient(${a}55 1px, transparent 1px) 0 0/30px 30px, linear-gradient(90deg, ${a}55 1px, transparent 1px) 0 0/30px 30px, linear-gradient(#120a24, #07040f)`,
};

const b = (s: CSSProperties) => s;
const box = (s: CSSProperties) => <span className="sp-i" style={s} />;

/** The drawing of one object inside its box (100% × 100%). `t` = share of the box that is the top plane. */
export function Sprite({ k, accent, dark, warm, t, anim }: { k: string; accent: string; dark: boolean; warm: boolean; t: number; anim: boolean }) {
  const wood = warm ? '#7a4a2a' : dark ? '#3a3150' : '#b08b62';
  const woodTop = warm ? '#8f5a34' : dark ? '#4a4066' : '#c9a57c';
  const metal = dark ? '#2b2b38' : '#5b5f6b';
  const T = `${t * 100}%`;
  const glow = (c: string) => (dark ? `0 0 18px 4px ${c}66` : undefined);
  const a = anim ? 'sp-anim' : '';
  switch (k) {
    case 'desk':
    case 'gamer-desk':
    case 'coffee-table':
    case 'side-table':
    case 'bench':
      return (
        <>
          {box({ left: 0, right: 0, top: 0, height: T, background: woodTop, borderRadius: 3, boxShadow: 'inset 0 -2px 0 #0003' })}
          {box({ left: 0, right: 0, top: T, height: '10%', background: wood })}
          {k === 'gamer-desk' && <span className={clsx('sp-i sp-neon', a)} style={b({ left: '4%', right: '4%', top: `calc(${T} + 10%)`, height: 3, background: accent, boxShadow: `0 0 10px ${accent}` })} />}
          {box({ left: '3%', width: '5%', top: T, bottom: 0, background: wood })}
          {box({ right: '3%', width: '5%', top: T, bottom: 0, background: wood })}
          {k === 'desk' && box({ right: '8%', width: '30%', top: `calc(${T} + 10%)`, height: '45%', background: wood, boxShadow: 'inset 0 2px 0 #0002' })}
        </>
      );
    case 'drawer':
    case 'bookcase':
      return (
        <>
          {box({ inset: 0, background: wood, borderRadius: 3 })}
          {k === 'drawer'
            ? [0, 1, 2].map((i) => box({ left: '8%', right: '8%', top: `${T} `.trim() === T ? `calc(${T} + ${8 + i * 30}%)` : 0, height: '22%', background: woodTop, borderRadius: 2, boxShadow: 'inset 0 -2px 0 #0002' }))
            : [0, 1, 2, 3].map((i) => (
                <span key={i} className="sp-i" style={b({ left: '6%', right: '6%', top: `${8 + i * 23}%`, height: '17%', background: '#0003' })}>
                  {[0, 1, 2, 3, 4].map((j) => box({ left: `${6 + j * 18}%`, bottom: 0, width: '12%', height: `${60 + ((i + j) % 3) * 15}%`, background: [accent, '#22d3ee', '#f59e0b', '#22c55e', '#e11d48'][(i + j) % 5], borderRadius: 1 }))}
                </span>
              ))}
        </>
      );
    case 'sofa':
    case 'armchair':
      return (
        <>
          {box({ left: '6%', right: '6%', top: 0, height: '55%', background: `linear-gradient(${accent}, color-mix(in srgb, ${accent} 70%, #000))`, borderRadius: '14px 14px 4px 4px' })}
          {box({ left: '4%', right: '4%', top: '45%', height: '35%', background: `color-mix(in srgb, ${accent} 80%, #fff)`, borderRadius: 8 })}
          {box({ left: 0, width: '12%', top: '35%', bottom: '8%', background: `color-mix(in srgb, ${accent} 75%, #000)`, borderRadius: 8 })}
          {box({ right: 0, width: '12%', top: '35%', bottom: '8%', background: `color-mix(in srgb, ${accent} 75%, #000)`, borderRadius: 8 })}
          {box({ left: '10%', width: '4%', bottom: 0, height: '10%', background: metal })}
          {box({ right: '10%', width: '4%', bottom: 0, height: '10%', background: metal })}
        </>
      );
    case 'gamer-chair':
      return (
        <>
          {box({ left: '18%', right: '18%', top: 0, height: '58%', background: `linear-gradient(${accent}, #15151f)`, borderRadius: '40% 40% 10% 10%' })}
          {box({ left: '10%', right: '10%', top: '52%', height: '16%', background: '#1b1b28', borderRadius: 6 })}
          {box({ left: '46%', width: '8%', top: '68%', height: '20%', background: metal })}
          {box({ left: '16%', right: '16%', bottom: 0, height: '8%', background: metal, borderRadius: 4 })}
        </>
      );
    case 'pouf':
      return box({ inset: 0, borderRadius: '45% 45% 30% 30%', background: `radial-gradient(70% 50% at 50% 20%, color-mix(in srgb, ${accent} 70%, #fff), ${accent})` });
    case 'bed':
    case 'futon':
      return (
        <>
          {k === 'bed' && box({ left: 0, width: '6%', top: 0, bottom: '10%', background: wood, borderRadius: 4 })}
          {box({ left: k === 'bed' ? '4%' : 0, right: 0, top: `${t * 40}%`, bottom: k === 'bed' ? '12%' : 0, background: warm ? '#e9c9a8' : '#dfe3f5', borderRadius: 8 })}
          {k === 'bed' && box({ left: '4%', right: 0, bottom: 0, height: '14%', background: wood, borderRadius: 3 })}
          {box({ left: k === 'bed' ? '8%' : '4%', width: '22%', top: `${t * 40 + 4}%`, height: '22%', background: '#fff', borderRadius: 10 })}
          {box({ left: '36%', right: '2%', top: `${t * 40 + 4}%`, bottom: k === 'bed' ? '16%' : '6%', background: accent, opacity: 0.85, borderRadius: 8 })}
        </>
      );
    case 'pillows':
      return (
        <>
          {box({ left: 0, width: '60%', bottom: 0, height: '80%', background: accent, borderRadius: 10 })}
          {box({ right: 0, width: '55%', bottom: 0, height: '70%', background: '#f5f5f5', borderRadius: 10 })}
        </>
      );
    case 'blanket':
      return box({ inset: 0, background: `repeating-linear-gradient(45deg, ${accent} 0 6px, color-mix(in srgb, ${accent} 70%, #fff) 6px 12px)`, borderRadius: 6, opacity: 0.9 });
    case 'rug-round':
    case 'rug-rect':
      return box({ inset: 0, borderRadius: k === 'rug-round' ? '50%' : 6, background: `radial-gradient(${accent}88, ${accent}44 60%, ${accent}22)`, boxShadow: `inset 0 0 0 3px ${accent}55` });
    case 'monitor':
    case 'ultrawide':
      return (
        <>
          <span className={clsx('sp-i sp-screen', a)} style={b({ left: 0, right: 0, top: 0, height: '74%', borderRadius: 3, border: '2px solid #111', background: `linear-gradient(135deg, ${accent}, #0b1030)`, boxShadow: glow(accent) })} />
          {box({ left: '44%', width: '12%', top: '74%', bottom: '6%', background: '#222' })}
          {box({ left: '30%', right: '30%', bottom: 0, height: '8%', background: '#222', borderRadius: 2 })}
        </>
      );
    case 'laptop':
      return (
        <>
          {box({ left: '6%', right: '6%', top: 0, height: '62%', background: '#1f2937', borderRadius: '3px 3px 0 0', border: '2px solid #9ca3af' })}
          {box({ left: '14%', right: '14%', top: '10%', height: '42%', background: `linear-gradient(135deg, #22d3ee, ${accent})`, boxShadow: glow('#22d3ee') })}
          {box({ left: 0, right: 0, bottom: 0, height: '30%', background: '#9ca3af', borderRadius: '0 0 4px 4px' })}
        </>
      );
    case 'keyboard':
      return (
        <>
          {box({ left: 0, width: '76%', bottom: 0, height: '70%', background: '#1b1b24', borderRadius: 3, boxShadow: dark ? `0 0 8px ${accent}88` : undefined })}
          {box({ right: 0, width: '16%', bottom: 0, height: '60%', background: '#1b1b24', borderRadius: '40%' })}
        </>
      );
    case 'pc-tower':
      return (
        <>
          {box({ inset: 0, background: '#14141c', borderRadius: 4, border: `1px solid ${accent}66` })}
          <span className={clsx('sp-i sp-screen', a)} style={b({ left: '18%', right: '18%', top: '14%', height: '46%', borderRadius: 3, background: `radial-gradient(circle, ${accent}, #000 70%)`, boxShadow: glow(accent) })} />
        </>
      );
    case 'headset':
      return (
        <>
          {box({ left: '10%', right: '10%', top: 0, height: '60%', borderRadius: '50% 50% 0 0', border: '3px solid #222', borderBottom: 0 })}
          {box({ left: 0, width: '34%', top: '45%', height: '45%', background: accent, borderRadius: 6 })}
          {box({ right: 0, width: '34%', top: '45%', height: '45%', background: accent, borderRadius: 6 })}
        </>
      );
    case 'console':
      return (
        <>
          {box({ inset: '20% 0 0 0', background: dark ? '#e5e7eb' : '#f8fafc', borderRadius: 4 })}
          {box({ left: '10%', width: '20%', bottom: '30%', height: 2, background: accent })}
        </>
      );
    case 'floor-lamp':
      return (
        <>
          {box({ left: '46%', width: '8%', top: '20%', bottom: '4%', background: metal })}
          {box({ left: '20%', right: '20%', bottom: 0, height: '5%', background: metal, borderRadius: 4 })}
          <span className={clsx('sp-i sp-lamp', a)} style={b({ left: 0, right: 0, top: 0, height: '22%', borderRadius: '40% 40% 6px 6px', background: dark ? '#ffe1a6' : '#f5f5f5', boxShadow: dark ? '0 14px 40px 10px #ffcf7a44' : undefined })} />
        </>
      );
    case 'table-lamp':
      return (
        <>
          {box({ left: '44%', width: '12%', top: '40%', bottom: '10%', background: metal })}
          {box({ left: '25%', right: '25%', bottom: 0, height: '12%', background: metal, borderRadius: 3 })}
          <span className={clsx('sp-i sp-lamp', a)} style={b({ left: 0, right: 0, top: 0, height: '45%', borderRadius: '30% 30% 4px 4px', background: dark ? '#ffd9a0' : '#fafafa', boxShadow: dark ? '0 8px 26px 6px #ffcf7a44' : undefined })} />
        </>
      );
    case 'lantern':
      return (
        <>
          {box({ left: '40%', width: '20%', top: 0, height: '10%', background: '#222' })}
          <span className={clsx('sp-i sp-lamp', a)} style={b({ left: 0, right: 0, top: '10%', bottom: '6%', borderRadius: '40%', background: `repeating-linear-gradient(0deg, #0002 0 2px, transparent 2px 8px), radial-gradient(circle, #fff3d6, ${accent})`, boxShadow: dark ? `0 0 26px 6px ${accent}55` : undefined })} />
        </>
      );
    case 'moon-lamp':
      return <span className={clsx('sp-i sp-lamp', a)} style={b({ inset: '6%', borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #fff, #e5e7eb 60%, #9ca3af)', boxShadow: dark ? '0 0 22px 6px #fff4' : undefined })} />;
    case 'plant':
    case 'tall-plant':
    case 'bonsai':
    case 'cactus':
      return (
        <>
          {box({ left: '20%', right: '20%', bottom: 0, height: k === 'tall-plant' ? '20%' : '34%', borderRadius: '4px 4px 10px 10px', background: k === 'bonsai' ? '#57534e' : '#c2410c' })}
          {k === 'cactus'
            ? box({ left: '32%', right: '32%', top: 0, bottom: '30%', borderRadius: '40% 40% 10% 10%', background: '#16a34a' })
            : k === 'bonsai'
              ? (
                  <>
                    {box({ left: '46%', width: '8%', top: '30%', bottom: '30%', background: '#5b3a22' })}
                    {box({ left: '6%', right: '6%', top: 0, height: '42%', borderRadius: '50%', background: '#15803d' })}
                  </>
                )
              : [0, 1, 2, 3].map((l) => box({ left: `${l * 22}%`, bottom: k === 'tall-plant' ? '18%' : '30%', width: '46%', height: k === 'tall-plant' ? '82%' : '70%', borderRadius: '50% 50% 50% 0', background: ['#16a34a', '#22c55e', '#15803d', '#4ade80'][l], transform: `rotate(${(l - 1.5) * 18}deg)`, transformOrigin: 'bottom' }))}
        </>
      );
    case 'statue':
      return (
        <>
          {box({ left: '15%', right: '15%', bottom: 0, height: '22%', background: dark ? '#4b4b55' : '#d6d3d1', borderRadius: 2 })}
          {box({ left: '32%', right: '32%', top: '18%', bottom: '22%', background: dark ? '#6b6b78' : '#e7e5e4', borderRadius: '40% 40% 8px 8px' })}
          {box({ left: '36%', right: '36%', top: 0, height: '22%', background: dark ? '#6b6b78' : '#e7e5e4', borderRadius: '50%' })}
        </>
      );
    case 'figure':
      return (
        <>
          {box({ left: '15%', right: '15%', bottom: 0, height: '14%', background: '#111', borderRadius: 2 })}
          {box({ left: '30%', right: '30%', top: '26%', bottom: '14%', background: `linear-gradient(${accent}, #111)`, borderRadius: '30% 30% 4px 4px' })}
          {box({ left: '30%', right: '30%', top: 0, height: '28%', background: '#f1c7a5', borderRadius: '50%' })}
        </>
      );
    case 'vase':
      return box({ inset: '10% 15% 0', borderRadius: '30% 30% 40% 40%', background: `linear-gradient(${accent}, color-mix(in srgb, ${accent} 50%, #000))` });
    case 'cat':
      return (
        <>
          {box({ left: '10%', right: 0, bottom: 0, height: '60%', borderRadius: '50% 50% 30% 30%', background: '#2b2b2b' })}
          {box({ left: 0, width: '42%', top: 0, height: '56%', borderRadius: '50%', background: '#2b2b2b' })}
          {box({ left: '4%', width: '14%', top: '-14%', height: '26%', background: '#2b2b2b', clipPath: 'polygon(0 100%,50% 0,100% 100%)' })}
          {box({ left: '24%', width: '14%', top: '-14%', height: '26%', background: '#2b2b2b', clipPath: 'polygon(0 100%,50% 0,100% 100%)' })}
        </>
      );
    // wall
    case 'window':
      return (
        <span className="sp-i" style={b({ inset: 0, borderRadius: 6, border: `3px solid ${dark ? '#2e2a48' : '#fff'}`, background: !dark ? 'linear-gradient(#9fd6ff,#d9f0ff)' : warm ? 'linear-gradient(#ff9a5c,#5b2a4a)' : 'linear-gradient(#0b1030,#1a1450 70%,#ff2d7840)' })}>
          {dark && box({ left: 0, right: 0, bottom: 0, height: '40%', background: 'repeating-linear-gradient(90deg,#0a0a1a 0 10%,#14143a 10% 16%,#0a0a1a 16% 24%)' })}
          {box({ left: '48%', top: 0, bottom: 0, width: 3, background: dark ? '#2e2a48' : '#fff' })}
        </span>
      );
    case 'poster':
      return box({ inset: 0, borderRadius: 3, background: `linear-gradient(160deg, ${accent}, #1b1240 70%)`, boxShadow: 'inset 0 0 0 2px #fff2' });
    case 'frame':
      return (
        <span className="sp-i" style={b({ inset: 0, border: `3px solid ${wood}`, background: dark ? '#111827' : '#f8fafc' })}>
          {box({ inset: '14%', background: `linear-gradient(170deg, #60a5fa, ${accent} 60%, #f59e0b)` })}
        </span>
      );
    case 'panel':
      return box({ inset: 0, borderRadius: 4, background: `repeating-linear-gradient(90deg, ${accent}55 0 8%, ${accent}22 8% 16%)`, boxShadow: 'inset 0 0 0 2px #0003' });
    case 'clock':
      return (
        <span className="sp-i" style={b({ inset: 0, borderRadius: '50%', background: '#f8fafc', border: `3px solid ${metal}` })}>
          {box({ left: '48%', top: '18%', width: 2, height: '34%', background: '#111' })}
          {box({ left: '48%', top: '48%', width: '30%', height: 2, background: '#111' })}
        </span>
      );
    case 'tv':
      return <span className={clsx('sp-i sp-screen', a)} style={b({ inset: 0, borderRadius: 4, border: '3px solid #0b0b0f', background: `linear-gradient(135deg, #0b1030, ${accent} 140%)`, boxShadow: glow(accent) })} />;
    case 'shelf':
      return (
        <>
          {box({ left: 0, right: 0, bottom: 0, height: '40%', background: wood, borderRadius: 2 })}
          {[0, 1, 2].map((i) => box({ left: `${10 + i * 12}%`, bottom: '40%', width: '8%', height: '60%', background: [accent, '#22d3ee', '#f59e0b'][i], borderRadius: 1 }))}
        </>
      );
    case 'led-strip':
      return <span className={clsx('sp-i sp-neon', a)} style={b({ inset: 0, borderRadius: 4, background: accent, boxShadow: `0 0 12px ${accent}, 0 0 24px ${accent}88` })} />;
    case 'neon-sign':
      return <span className={clsx('sp-i sp-neon', a)} style={b({ inset: '10%', borderRadius: 999, border: `3px solid ${accent}`, boxShadow: `0 0 10px ${accent}, inset 0 0 8px ${accent}` })} />;
  }
  return null;
}

type Props = { scene: Scene; density: 'full' | 'normal' | 'light' | 'mini'; children?: ReactNode; worldTint?: string | null; /** editor overlay per object */ decorate?: (o: RoomObject, el: ReactNode) => ReactNode; hidden?: Set<string> };

/** Background + furniture of a builder room. The person goes at their avatar spot. */
export const RoomView = memo(function RoomView({ scene, density, children, worldTint, decorate, hidden }: Props) {
  const dark = scene.lighting !== 'day';
  const warm = scene.lighting === 'warm';
  const [w0, w1] = WALLS[scene.lighting];
  const legend = scene.ambiance ? AL_BY_ID[scene.ambiance] : undefined;
  const all = scene.objects ?? [];
  const byId = new Map(all.map((o) => [o.i, o]));
  // light corners (7–10 people): only the biggest pieces; mini (streams on screen): background + person
  const objs = density === 'mini' ? [] : density === 'light' ? all.filter((o) => !o.p && (itemDef(o.k)?.w ?? 0) * (itemDef(o.k)?.d ?? 0) >= 120).slice(0, 6) : all;
  const anim = scene.animated && (density === 'full' || density === 'normal');
  const kids = new Map<string, RoomObject[]>();
  for (const o of objs) if (o.p) kids.set(o.p, [...(kids.get(o.p) ?? []), o]);
  const particles = density === 'full' ? 14 : density === 'normal' ? 8 : 0;

  const render = (o: RoomObject, parentScale = 1): ReactNode => {
    const d = itemDef(o.k);
    if (!d || hidden?.has(o.i)) return null;
    const odd = (o.r ?? 0) % 2 === 1;
    const flip = (o.r ?? 0) >= 2;
    const fw = d.place === 'wall' ? d.w : odd ? d.d : d.w;
    const fd = d.place === 'wall' ? d.d : odd ? d.w : d.d;
    let style: CSSProperties;
    let t = 0;
    if (d.place === 'wall') {
      const p = wallPos(o.x, o.y);
      style = { left: `${p.left}%`, bottom: `${p.bottom}%`, width: `${fw}%`, height: `${fd}cqw`, transform: 'translate(-50%, 50%)', zIndex: 1 };
    } else if (o.p) {
      const parent = byId.get(o.p);
      const pd = parent && itemDef(parent.k);
      if (!parent || !pd) return null;
      const podd = (parent.r ?? 0) % 2 === 1;
      const pw = podd ? pd.d : pd.w;
      const pdd = podd ? pd.w : pd.d;
      const boxH = pd.h + pdd * DEPTH_K;
      const front = (pd.h * (SURFACE[parent.k] ?? 1)) / boxH;
      const back = SURFACE[parent.k] === 1 || SURFACE[parent.k] === undefined ? 1 : front + (pdd * DEPTH_K) / boxH;
      const fy = 1 - (back - front) * (o.y / pdd);
      const h = d.h + fd * DEPTH_K;
      t = (fd * DEPTH_K) / h;
      style = { left: `${(o.x / pw) * 100}%`, bottom: `${Math.min(back, fy) * 100 - 2}%`, width: `${(fw / pw) * 100}%`, height: `${h * parentScale}cqw`, transform: 'translateX(-50%)', zIndex: Math.round(o.y * 10) + 5 };
    } else {
      const front = o.y + fd / 2;
      const p = project(o.x, front);
      if (d.place === 'rug') {
        style = { left: `${p.left}%`, bottom: `${p.bottom}%`, width: `${fw * p.s}%`, height: `${fd * 0.42 * p.s}cqw`, transform: 'translateX(-50%)', zIndex: 2 };
      } else {
        const h = d.h + fd * DEPTH_K;
        t = (fd * DEPTH_K) / h;
        style = { left: `${p.left}%`, bottom: `${p.bottom}%`, width: `${fw * p.s}%`, height: `${h * p.s}cqw`, transform: 'translateX(-50%)', zIndex: 10 + Math.round(front * 10) };
      }
      parentScale = p.s;
    }
    const el = (
      <div key={o.i} className="sp-o" data-obj={o.i} data-k={o.k} style={style}>
        <div className="sp-i" style={{ inset: 0, transform: flip ? 'scaleX(-1)' : undefined, filter: odd ? 'brightness(.92)' : undefined }}>
          <Sprite k={o.k} accent={scene.accent} dark={dark} warm={warm} t={t || 0.3} anim={anim} />
        </div>
        {kids.get(o.i)?.map((c) => render(c, parentScale))}
      </div>
    );
    return decorate ? decorate(o, el) : el;
  };

  const AV = { left: 28, center: 50, right: 72 }[scene.avatarPos];
  const av = project(AV, 50);
  return (
    <div className={clsx('sp-room sp-builder', `sp-d-${density}`)} data-preset={scene.preset} data-ambiance={scene.ambiance ?? undefined}>
      <div className="sp-i" style={{ inset: 0, bottom: `${WALL_BOTTOM}%`, background: `${WALLPAPER[scene.wall ?? 'plain'](scene.accent, dark)}, radial-gradient(70% 60% at 50% 20%, ${scene.accent}2e, transparent 70%), linear-gradient(${w0}, ${w1})` }} />
      {legend && density !== 'mini' && (
        // Anime Legends ambience: the collection's scene as a wall mural (+ its particles below)
        <div className="sp-i" style={{ left: '22%', right: '22%', top: '6%', bottom: `${WALL_BOTTOM + 8}%`, borderRadius: 8, overflow: 'hidden', opacity: 0.85, boxShadow: `0 0 30px ${legend.palette[0]}55`, zIndex: 0 }} data-legend-mural>
          <AlBanner c={legend} />
        </div>
      )}
      {worldTint && <div className="sp-i" style={{ inset: 0, background: `linear-gradient(120deg, ${worldTint}1f, transparent 60%)` }} />}
      <div className="sp-i" style={{ left: 0, right: 0, bottom: 0, height: `${WALL_BOTTOM}%`, background: FLOORS[scene.floor ?? 'wood'](scene.accent, dark), clipPath: 'polygon(7% 0, 93% 0, 100% 100%, 0 100%)' }} />
      <div className="sp-i" style={{ left: 0, width: '7%', bottom: 0, height: `${WALL_BOTTOM}%`, background: `linear-gradient(90deg, #0000004d, transparent), linear-gradient(${w1}, ${w0})`, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
      <div className="sp-i" style={{ right: 0, width: '7%', bottom: 0, height: `${WALL_BOTTOM}%`, background: `linear-gradient(270deg, #0000004d, transparent), linear-gradient(${w1}, ${w0})`, clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
      <div className="sp-i" style={{ left: '7%', right: '7%', bottom: `${WALL_BOTTOM}%`, height: 2, background: '#0000003a' }} />
      {objs.filter((o) => !o.p).map((o) => render(o))}
      {legend && particles > 0 && <AlAmbient c={legend} n={particles} />}
      {!legend && scene.particles !== 'none' && particles > 0 && <RoomParticles kind={scene.particles} n={particles} accent={scene.accent} />}
      {dark && <div className="sp-i" style={{ inset: 0, background: 'radial-gradient(120% 90% at 50% 10%, transparent 40%, #00000059)', zIndex: 900, pointerEvents: 'none' }} />}
      <div className="sp-person" style={{ left: `${av.left}%`, bottom: `${Math.max(3, av.bottom - 2)}%`, zIndex: 10 + 50 * 10 }}>
        {children}
      </div>
    </div>
  );
});

const PT: Record<string, string> = { dust: 'embers', stars: 'snow', petals: 'petals', snow: 'snow', embers: 'embers', fireflies: 'sparks' };
function RoomParticles({ kind, n, accent }: { kind: string; n: number; accent: string }) {
  const r = (i: number, s: number) => {
    const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ '--a1': accent, '--a2': kind === 'dust' ? '#fde68a' : accent, zIndex: 800 } as CSSProperties} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={`sp-pt sp-anim al-p al-p-${PT[kind] ?? 'sparks'}`} style={{ left: `${r(i, 3) * 100}%`, top: `${r(i, 4) * 90}%`, animationDelay: `${-r(i, 5) * 8}s`, animationDuration: `${5 + r(i, 6) * 5}s`, opacity: kind === 'dust' ? 0.5 : 0.85 } as CSSProperties} />
      ))}
    </div>
  );
}
