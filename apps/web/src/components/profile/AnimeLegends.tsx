import type { CSSProperties, ReactNode } from 'react';
import type { AlCollection, AlParticle } from '@aldetes/shared';

/**
 * Anime Legends visuals — ORIGINAL drawings (CSS shapes, inline SVG silhouettes, gradients and particles).
 * One renderer per element type, driven by the collection's `motif`, `particle` and `palette` (declarative catalog in
 * @aldetes/shared/animeLegends). No official art, logos or character drawings.
 * Every loop uses the shared `.bn-anim` / `.al-*` classes, so the Essencial/Reduzido profiles, measured load,
 * "settle" and off-screen pausing apply exactly like the other banners.
 */
const rnd = (i: number, salt = 1) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const many = (n: number, f: (i: number) => ReactNode) => Array.from({ length: n }, (_, i) => f(i));
const css = (o: Record<string, string | number | undefined>) => o as CSSProperties;

/** Palette as CSS variables (banner options --b1/--b2 still override the two main colors). */
export const alVars = (c: AlCollection) => css({ '--a1': `var(--b1, ${c.palette[0]})`, '--a2': `var(--b2, ${c.palette[1]})`, '--a3': c.palette[2] });

function Particles({ type, n, area = 'full', seed = 1 }: { type: AlParticle; n: number; area?: 'full' | 'low'; seed?: number }) {
  return (
    <>
      {many(n, (i) => (
        <span
          key={i}
          className={`al-p al-p-${type} bn-anim bn-part`}
          style={css({
            left: `${rnd(i, seed) * 100}%`,
            top: area === 'low' ? `${55 + rnd(i, seed + 1) * 45}%` : `${rnd(i, seed + 1) * 100}%`,
            '--d': `${3 + rnd(i, seed + 2) * 5}s`,
            animationDelay: `${-rnd(i, seed + 3) * 8}s`,
            '--s': (0.6 + rnd(i, seed + 4) * 0.9).toFixed(2),
            '--rot': `${Math.round(rnd(i, seed + 5) * 360)}deg`,
          })}
        />
      ))}
    </>
  );
}

const Svg = ({ children, vb = '0 0 200 100', style }: { children: ReactNode; vb?: string; style?: CSSProperties }) => (
  <svg viewBox={vb} preserveAspectRatio="xMidYMax slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }} aria-hidden>
    {children}
  </svg>
);

/** The scene of a collection: used by the profile banner, the server cover and as the Spaces wall mural. */
export function AlBanner({ c }: { c: AlCollection }) {
  const bg = `radial-gradient(120% 90% at 50% 40%, color-mix(in srgb, ${c.palette[0]} 28%, ${c.palette[2]}), ${c.palette[2]} 72%)`;
  return (
    <div className="bn al-bn" data-motif={c.motif} style={{ ...alVars(c), background: bg }}>
      <Motif c={c} />
      <Particles type={c.particle} n={c.particle === 'bolts' ? 4 : 12} seed={c.n} area={c.particle === 'embers' || c.particle === 'sparks' ? 'low' : 'full'} />
    </div>
  );
}

function Motif({ c }: { c: AlCollection }) {
  switch (c.motif) {
    case 'orbit':
      return (
        <>
          <span className="al-core bn-anim" style={css({ left: '50%', top: '50%', '--d': '4s' })} />
          {[0, 1, 2].map((i) => (
            <span key={i} className="al-orbit bn-anim" style={css({ '--d': `${7 + i * 3}s`, '--tilt': `${-20 + i * 25}deg`, '--sz': `${90 + i * 45}px`, animationDirection: i % 2 ? 'reverse' : 'normal' })} />
          ))}
          <span className="al-warp bn-anim" style={css({ '--d': '6s' })} />
        </>
      );
    case 'singularity':
      return (
        <>
          <span className="al-core bn-anim" style={css({ left: '50%', top: '50%', '--d': '2.4s', '--core': '34px' })} />
          {[0, 1].map((i) => (
            <span key={i} className="al-ring-x bn-anim" style={css({ '--d': '3.6s', animationDelay: `${-i * 1.8}s` })} />
          ))}
          {many(10, (i) => (
            <span key={`c${i}`} className="al-converge bn-anim" style={css({ '--ang': `${i * 36}deg`, '--d': `${2 + (i % 3) * 0.6}s`, animationDelay: `${-rnd(i, 7) * 2}s` })} />
          ))}
        </>
      );
    case 'crystal':
      return (
        <>
          <span className="bn-sheen bn-anim" style={css({ '--d': '5s' })} />
          <span className="al-eye bn-anim" style={css({ left: '50%', top: '50%', '--d': '5s' })} />
          {many(7, (i) => (
            <span key={i} className="al-shard bn-anim" style={css({ left: `${8 + i * 13}%`, top: `${20 + rnd(i, 3) * 55}%`, '--d': `${4 + rnd(i, 4) * 3}s`, '--rot': `${rnd(i, 5) * 60 - 30}deg` })} />
          ))}
        </>
      );
    case 'impact':
      return (
        <>
          {[0, 1, 2].map((i) => (
            <span key={i} className="al-shock bn-anim" style={css({ left: '38%', top: '55%', '--d': '2.4s', animationDelay: `${-i * 0.8}s` })} />
          ))}
          {many(5, (i) => (
            <span key={`s${i}`} className="al-streak bn-anim" style={css({ top: `${25 + i * 12}%`, '--d': `${1.4 + i * 0.3}s`, animationDelay: `${-i * 0.4}s` })} />
          ))}
        </>
      );
    case 'lightning':
    case 'city':
      return (
        <>
          {c.motif === 'city' &&
            many(11, (i) => (
              <span key={`b${i}`} className="bn-building" style={css({ left: `${(i / 11) * 100}%`, width: `${100 / 11 + 0.4}%`, height: `${28 + rnd(i, 9) * 45}%`, '--c': 'var(--a1)', background: '#020403' })} />
            ))}
          <Svg>
            {[0, 1, 2].map((i) => (
              <polyline
                key={i}
                className="al-bolt bn-anim"
                style={css({ '--d': `${2.6 + i * 0.9}s`, animationDelay: `${-i * 0.7}s` })}
                points={`${40 + i * 55},0 ${52 + i * 55},30 ${36 + i * 55},42 ${58 + i * 55},70 ${44 + i * 55},78 ${62 + i * 55},100`}
                fill="none"
                stroke="var(--a1)"
                strokeWidth={2.4}
                strokeLinejoin="bevel"
              />
            ))}
          </Svg>
          <span className="al-flash bn-anim" style={css({ '--d': '3.2s' })} />
        </>
      );
    case 'shadow':
      return (
        <>
          <span className="al-smoke bn-anim" style={css({ left: '-10%', '--d': '12s' })} />
          <span className="al-smoke bn-anim" style={css({ right: '-10%', '--d': '14s', animationDirection: 'reverse', background: 'radial-gradient(closest-side, var(--a2), transparent)' })} />
          <span style={{ left: '50%', top: 0, bottom: 0, width: 1, background: 'linear-gradient(transparent, var(--a2), transparent)', opacity: 0.6 }} />
        </>
      );
    case 'throne':
    case 'shrine':
    case 'palace':
      return (
        <>
          {c.motif !== 'throne' && <span className="al-seal bn-anim" style={css({ left: '50%', top: '42%', '--d': '18s' })} />}
          {c.motif === 'palace' && <span className="al-rays bn-anim" style={css({ '--d': '24s' })} />}
          <Svg>
            {c.motif === 'throne' && <path d="M84 100V52l-6-14 10 6 12-22 12 22 10-6-6 14v48h-6V70H90v30Z" fill="#000" stroke="var(--a1)" strokeWidth={0.8} />}
            {c.motif === 'shrine' && (
              <g fill="#050101" stroke="var(--a1)" strokeWidth={0.7}>
                <path d="M54 52h92l-10-9H64Z" />
                <path d="M62 66h76l-8-8H70Z" />
                <rect x="70" y="66" width="60" height="34" />
                <rect x="66" y="52" width="4" height="48" />
                <rect x="130" y="52" width="4" height="48" />
              </g>
            )}
            {c.motif === 'palace' && (
              <g fill="#040101" stroke="var(--a2)" strokeWidth={0.6}>
                <path d="M40 70h120l-14-10H54Z" />
                <path d="M70 52h60l-10-9H80Z" />
                <rect x="50" y="70" width="100" height="30" />
                <rect x="80" y="52" width="40" height="18" />
                {many(6, (i) => <rect key={i} x={56 + i * 16} y="74" width="3" height="26" />)}
              </g>
            )}
          </Svg>
        </>
      );
    case 'waves':
      return (
        <Svg vb="0 0 400 100">
          {[0, 1, 2].map((i) => (
            <path key={i} className="al-wave bn-anim" style={css({ '--d': `${9 + i * 4}s`, opacity: 0.35 + i * 0.2 })} d={`M0 ${60 + i * 12} Q 50 ${40 + i * 12} 100 ${60 + i * 12} T 200 ${60 + i * 12} T 300 ${60 + i * 12} T 400 ${60 + i * 12} V100 H0Z`} fill={i === 2 ? 'var(--a1)' : 'var(--a2)'} />
          ))}
        </Svg>
      );
    case 'flame':
    case 'burst':
      return (
        <>
          {c.motif === 'burst' &&
            [0, 1, 2].map((i) => (
              <span key={`x${i}`} className="al-burst bn-anim" style={css({ left: `${25 + i * 25}%`, top: `${40 + (i % 2) * 20}%`, '--d': `${2.2 + i * 0.5}s`, animationDelay: `${-i * 0.7}s` })} />
            ))}
          {many(c.motif === 'flame' ? 9 : 4, (i) => (
            <span key={i} className="al-flame bn-anim" style={css({ left: `${4 + i * (c.motif === 'flame' ? 11 : 24)}%`, '--d': `${1.6 + rnd(i, 11) * 1.4}s`, '--h': `${40 + rnd(i, 12) * 45}%`, animationDelay: `${-rnd(i, 13) * 2}s` })} />
          ))}
        </>
      );
    case 'mountain':
      return (
        <>
          <Svg>
            <path d="M0 100 L30 55 L55 80 L90 38 L125 78 L150 50 L200 92 V100Z" fill="color-mix(in srgb, var(--a1) 35%, #000)" />
            <path d="M0 100 L40 72 L80 92 L120 64 L170 90 L200 80 V100Z" fill="#010a04" />
          </Svg>
          <span className="al-mist bn-anim" style={css({ top: '58%', '--d': '16s' })} />
        </>
      );
    case 'petals':
    case 'moon':
      return (
        <>
          {c.motif === 'moon' && <span className="al-moon" />}
          <span className="al-mist bn-anim" style={css({ top: '70%', '--d': '18s', opacity: 0.4 })} />
        </>
      );
    case 'sun':
      return (
        <>
          <span className="al-rays bn-anim" style={css({ '--d': '30s' })} />
          <span className="al-sun" />
        </>
      );
    case 'ice':
      return (
        <>
          <Svg>
            <g fill="color-mix(in srgb, var(--a1) 30%, transparent)" stroke="var(--a2)" strokeWidth={0.6}>
              <path d="M20 100 L34 46 L46 100Z" />
              <path d="M60 100 L78 30 L92 100Z" />
              <path d="M130 100 L146 40 L160 100Z" />
              <path d="M168 100 L180 60 L192 100Z" />
            </g>
          </Svg>
          <span className="bn-sheen bn-anim" style={css({ '--d': '6s' })} />
          <span className="al-mist bn-anim" style={css({ top: '62%', '--d': '14s' })} />
        </>
      );
    case 'dual':
      return (
        <>
          <span style={{ inset: '0 50% 0 0', background: 'linear-gradient(90deg, color-mix(in srgb, var(--a1) 45%, transparent), transparent)' }} />
          <span style={{ inset: '0 0 0 50%', background: 'linear-gradient(270deg, color-mix(in srgb, var(--a2) 45%, transparent), transparent)' }} />
          {many(4, (i) => (
            <span key={i} className="al-flame bn-anim" style={css({ left: `${4 + i * 10}%`, '--d': `${1.6 + i * 0.3}s`, '--h': `${40 + i * 8}%` })} />
          ))}
          <span style={{ left: '50%', top: 0, bottom: 0, width: 2, background: 'linear-gradient(transparent, #fff, transparent)', opacity: 0.5 }} />
        </>
      );
  }
}

/** Profile effect of a collection: entrance burst → light permanence → exit (handled by ProfileEffect). */
export function AlEffect({ c }: { c: AlCollection }) {
  return (
    <div className="pfx al-fx" style={alVars(c)} data-particle={c.particle}>
      {many(16, (i) => {
        const a = rnd(i, c.n) * Math.PI * 2;
        const d = 50 + rnd(i, c.n + 1) * 110;
        return <span key={i} className={`pfx-p pfx-burst al-p al-p-${c.particle}`} style={css({ left: '50%', top: '30%', '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, animationDelay: `${rnd(i, 3) * 0.15}s`, '--s': 1 })} />;
      })}
      {many(6, (i) => (
        <span key={`d${i}`} className={`pfx-p pfx-drift al-p al-p-${c.particle}`} style={css({ left: `${10 + rnd(i, c.n + 2) * 80}%`, top: `${15 + rnd(i, c.n + 3) * 70}%`, animationDelay: `${-rnd(i, 6) * 9}s`, '--s': 0.8 })} />
      ))}
    </div>
  );
}

/** Ambient particles of a collection (Spaces corner, server channel list). `n` is already budgeted by the caller. */
export function AlAmbient({ c, n }: { c: AlCollection; n: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={alVars(c)} aria-hidden>
      <Particles type={c.particle} n={n} seed={c.n + 40} />
    </div>
  );
}

/** Frame motif → CSS family (frames reuse a few drawings with each collection's palette and particle style). */
export const alFrameFamily = (c: AlCollection) =>
  ({ orbit: 'orbit', singularity: 'converge', crystal: 'facet', impact: 'spikes', lightning: 'electric', city: 'electric', shadow: 'shade', throne: 'crown', palace: 'crown', shrine: 'seal', waves: 'wave', flame: 'flame', burst: 'spikes', mountain: 'facet', petals: 'petal', moon: 'petal', sun: 'rays', ice: 'facet', dual: 'split' })[c.motif];

/** Card theme of a collection (accent variables + background). */
export function alTheme(c: AlCollection) {
  const hex = (h: string) => `${parseInt(h.slice(1, 3), 16)} ${parseInt(h.slice(3, 5), 16)} ${parseInt(h.slice(5, 7), 16)}`;
  return {
    label: c.names.theme,
    a: hex(c.palette[0]),
    b: hex(c.palette[1]),
    bg: `radial-gradient(130% 70% at 50% 0%, color-mix(in srgb, ${c.palette[0]} 26%, ${c.palette[2]}) 0%, ${c.palette[2]} 60%, #000 140%)`,
    desc: c.aesthetic,
  };
}
