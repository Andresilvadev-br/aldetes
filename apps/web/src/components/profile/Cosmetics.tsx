import { memo, type CSSProperties, type ReactNode } from 'react';
import type { PublicUser } from '@aldetes/shared';
import { colorFor } from '../common/Avatar';

/* Deterministic pseudo-random so particles don't jump on re-render */
const rnd = (i: number, salt = 1) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const many = (n: number, f: (i: number) => ReactNode) => Array.from({ length: n }, (_, i) => f(i));
const css = (o: Record<string, string | number>) => o as CSSProperties;

export const BANNERS: Record<string, { label: string; tag: string; render: () => ReactNode }> = {
  'neon-grid': {
    label: 'Neon Grid',
    tag: 'synthwave',
    render: () => (
      <div className="cz" style={{ background: 'linear-gradient(180deg,#160033 0%,#3b0a66 45%,#ff2d78 46%,#1a0533 47%,#0b0118 100%)' }}>
        <div style={{ left: '50%', top: '14%', width: 70, height: 70, marginLeft: -35, borderRadius: '50%', background: 'linear-gradient(#ffd36e,#ff2d78)', boxShadow: '0 0 40px #ff2d78' }} />
        <div
          style={{
            left: '-50%', right: '-50%', bottom: 0, height: '54%', transformOrigin: 'bottom', transform: 'perspective(140px) rotateX(55deg)',
            backgroundImage: 'linear-gradient(rgba(255,45,120,.8) 2px,transparent 2px),linear-gradient(90deg,rgba(193,60,255,.7) 2px,transparent 2px)',
            backgroundSize: '40px 40px', animation: 'cz-grid .9s linear infinite',
          }}
        />
      </div>
    ),
  },
  sakura: {
    label: 'Chuva de Sakura',
    tag: 'anime',
    render: () => (
      <div className="cz" style={{ background: 'linear-gradient(160deg,#ffb6d5 0%,#d16ba5 45%,#5a2a7a 100%)' }}>
        {many(22, (i) => (
          <span
            key={i}
            style={css({
              left: `${rnd(i) * 100}%`, top: 0, width: 8 + rnd(i, 2) * 6, height: 6 + rnd(i, 3) * 4, borderRadius: '80% 0 80% 0',
              background: rnd(i, 4) > 0.5 ? '#fff0f6' : '#ffc9e0', '--dx': `${(rnd(i, 5) - 0.3) * 80}px`, '--rot': `${360 + rnd(i, 6) * 360}deg`,
              animation: `cz-fall ${5 + rnd(i, 7) * 5}s linear ${-rnd(i, 8) * 8}s infinite`,
            })}
          />
        ))}
      </div>
    ),
  },
  aurora: {
    label: 'Aurora',
    tag: 'calmo',
    render: () => (
      <div className="cz" style={{ background: '#050a1a' }}>
        {[['#22d3ee', '10%', '10%'], ['#a855f7', '45%', '30%'], ['#22c55e', '70%', '-10%']].map(([c, l, t], i) => (
          <div key={i} style={{ left: l, top: t, width: '55%', height: '120%', background: c, filter: 'blur(40px)', opacity: 0.55, borderRadius: '50%', animation: `cz-blob ${9 + i * 3}s ease-in-out infinite` }} />
        ))}
      </div>
    ),
  },
  galaxy: {
    label: 'Galáxia',
    tag: 'espaço',
    render: () => (
      <div className="cz" style={{ background: 'radial-gradient(ellipse at 70% 40%,#4c1d95 0%,#1e1b4b 35%,#030014 75%)' }}>
        <div style={{ left: '40%', top: '-20%', width: '60%', height: '140%', background: 'radial-gradient(#ec4899 0%,transparent 60%)', filter: 'blur(30px)', opacity: 0.5, animation: 'cz-blob 14s ease-in-out infinite' }} />
        {many(40, (i) => (
          <span key={i} style={{ left: `${rnd(i) * 100}%`, top: `${rnd(i, 2) * 100}%`, width: 2 + rnd(i, 3) * 2, height: 2 + rnd(i, 3) * 2, borderRadius: '50%', background: '#fff', animation: `cz-twinkle ${2 + rnd(i, 4) * 3}s ease-in-out ${-rnd(i, 5) * 3}s infinite` }} />
        ))}
      </div>
    ),
  },
  'cyber-rain': {
    label: 'Cyber Rain',
    tag: 'hacker',
    render: () => (
      <div className="cz" style={{ background: '#020b06', fontFamily: 'monospace', fontSize: 11, color: '#22ff88', lineHeight: '12px' }}>
        {many(18, (i) => (
          <span key={i} style={{ left: `${(i / 18) * 100}%`, top: 0, width: 10, opacity: 0.35 + rnd(i) * 0.6, whiteSpace: 'pre', textShadow: '0 0 6px #22ff88', animation: `cz-rain ${2.5 + rnd(i, 2) * 3}s linear ${-rnd(i, 3) * 4}s infinite` }}>
            {many(14, (j) => String.fromCharCode(0x30a0 + Math.floor(rnd(i * 31 + j, 4) * 96))).join('\n')}
          </span>
        ))}
      </div>
    ),
  },
  'anime-sky': {
    label: 'Céu de Fim de Tarde',
    tag: 'anime',
    render: () => (
      <div className="cz" style={{ background: 'linear-gradient(180deg,#3b82f6 0%,#93c5fd 40%,#fdba74 75%,#fb7185 100%)' }}>
        {many(5, (i) => (
          <div key={i} style={{ top: `${10 + rnd(i) * 45}%`, left: 0, width: 90 + rnd(i, 2) * 70, height: 22 + rnd(i, 3) * 14, borderRadius: 999, background: 'rgba(255,255,255,.85)', filter: 'blur(1px)', boxShadow: '30px -8px 0 6px rgba(255,255,255,.8)', animation: `cz-drift ${22 + rnd(i, 4) * 18}s linear ${-rnd(i, 5) * 30}s infinite` }} />
        ))}
        {many(10, (i) => (
          <span key={`s${i}`} style={{ left: `${rnd(i, 6) * 100}%`, top: `${rnd(i, 7) * 60}%`, width: 3, height: 3, background: '#fff', borderRadius: '50%', boxShadow: '0 0 6px #fff', animation: `cz-twinkle ${1.5 + rnd(i, 8) * 2}s ease-in-out ${-rnd(i, 9) * 2}s infinite` }} />
        ))}
      </div>
    ),
  },
  'neon-city': {
    label: 'Cidade Neon',
    tag: 'cyberpunk',
    render: () => (
      <div className="cz" style={{ background: 'linear-gradient(180deg,#0f0326 0%,#3b0764 70%,#ff2d78 140%)' }}>
        {many(14, (i) => {
          const h = 30 + rnd(i) * 55;
          return (
            <div key={i} style={{ bottom: 0, left: `${(i / 14) * 100}%`, width: `${100 / 14 + 1}%`, height: `${h}%`, background: '#0a0118', borderTop: `2px solid ${rnd(i, 2) > 0.5 ? '#22d3ee' : '#ff2d78'}` }}>
              {many(5, (j) => (
                <span key={j} style={{ position: 'absolute', left: `${20 + rnd(i * 7 + j, 3) * 60}%`, top: `${10 + j * 16}%`, width: 3, height: 4, background: rnd(i + j, 4) > 0.5 ? '#fde047' : '#22d3ee', animation: `cz-blink ${1 + rnd(i * 3 + j, 5) * 3}s steps(2) ${-rnd(j, 6) * 3}s infinite` }} />
              ))}
            </div>
          );
        })}
      </div>
    ),
  },
  storm: {
    label: 'Tempestade',
    tag: 'épico',
    render: () => (
      <div className="cz" style={{ background: 'linear-gradient(180deg,#0b1020,#1e293b)' }}>
        <div style={{ inset: 0, background: '#e0f2fe', animation: 'cz-flash 5s linear infinite' }} />
        <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{ inset: 0, width: '100%', height: '100%', animation: 'cz-zap 5s linear infinite' }}>
          <path d="M58 0 L50 24 L57 24 L46 60 L64 20 L56 20 L64 0Z" fill="#fff" />
        </svg>
        {many(26, (i) => (
          <span key={i} style={{ left: `${rnd(i) * 100}%`, top: 0, width: 1, height: 14, background: 'rgba(186,230,253,.6)', transform: 'rotate(12deg)', animation: `cz-rain ${0.6 + rnd(i, 2) * 0.5}s linear ${-rnd(i, 3)}s infinite` }} />
        ))}
      </div>
    ),
  },
  'pixel-arcade': {
    label: 'Arcade 8-bit',
    tag: 'retrô',
    render: () => (
      <div className="cz" style={{ background: 'linear-gradient(#1e1b4b,#7c3aed)', imageRendering: 'pixelated' }}>
        {many(18, (i) => (
          <span key={i} style={{ left: `${rnd(i) * 100}%`, top: `${rnd(i, 2) * 55}%`, width: 3, height: 3, background: '#fef08a', animation: `cz-blink ${0.8 + rnd(i, 3) * 1.6}s steps(2) infinite` }} />
        ))}
        <div style={{ bottom: 0, left: 0, width: '200%', height: '45%', animation: 'cz-scroll 12s linear infinite' }}>
          <svg viewBox="0 0 200 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }} shapeRendering="crispEdges">
            <path d="M0 30V18h8v-6h8v-6h8v6h8v6h8V10h8V4h8v6h8v8h8v-6h8v6h8v6h8V8h8V2h8v8h8v8h8v-8h8v8h8v12z" fill="#22c55e" />
            <path d="M0 30V24h200v6z" fill="#15803d" />
          </svg>
        </div>
      </div>
    ),
  },
  embers: {
    label: 'Brasas',
    tag: 'fogo',
    render: () => (
      <div className="cz" style={{ background: 'radial-gradient(ellipse at 50% 120%,#f97316 0%,#7c2d12 40%,#0c0a09 80%)' }}>
        {many(26, (i) => (
          <span key={i} style={css({ left: `${rnd(i) * 100}%`, bottom: 0, width: 3 + rnd(i, 2) * 3, height: 3 + rnd(i, 2) * 3, borderRadius: '50%', background: rnd(i, 3) > 0.5 ? '#fdba74' : '#fb923c', boxShadow: '0 0 8px #f97316', '--dx': `${(rnd(i, 4) - 0.5) * 60}px`, animation: `cz-rise ${3 + rnd(i, 5) * 3}s ease-out ${-rnd(i, 6) * 5}s infinite` })} />
        ))}
      </div>
    ),
  },
  ocean: {
    label: 'Mar Noturno',
    tag: 'calmo',
    render: () => (
      <div className="cz" style={{ background: 'linear-gradient(#0c1445,#155e75)' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ left: 0, bottom: `${i * 14 - 6}%`, width: '200%', height: '45%', opacity: 0.35 + i * 0.2, animation: `cz-wave ${10 - i * 3}s linear infinite` }}>
            <svg viewBox="0 0 200 20" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <path d="M0 10 Q 12.5 0 25 10 T 50 10 T 75 10 T 100 10 T 125 10 T 150 10 T 175 10 T 200 10 V20 H0Z" fill={['#0e7490', '#0891b2', '#22d3ee'][i]} />
            </svg>
          </div>
        ))}
        <div style={{ right: '12%', top: '14%', width: 30, height: 30, borderRadius: '50%', background: '#f0f9ff', boxShadow: '0 0 30px #e0f2fe' }} />
      </div>
    ),
  },
  void: {
    label: 'Portal',
    tag: 'místico',
    render: () => (
      <div className="cz" style={{ background: '#05010d' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ left: '50%', top: '50%', width: 120, height: 120, margin: -60, borderRadius: '50%', border: '2px solid #a855f7', boxShadow: '0 0 20px #a855f7', animation: `cz-pulse-ring 4s ease-out ${i}s infinite` }} />
        ))}
        <div style={{ left: '50%', top: '50%', width: 34, height: 34, margin: -17, borderRadius: '50%', background: 'conic-gradient(#ff2d78,#a855f7,#22d3ee,#ff2d78)', animation: 'cz-spin 3s linear infinite', filter: 'blur(1px)' }} />
      </div>
    ),
  },
};

/** Banner: animated preset › uploaded image/GIF › accent colour. */
export const ProfileBanner = memo(function ProfileBanner({ user, height, className }: { user: Pick<PublicUser, 'id' | 'bannerUrl' | 'bannerPreset' | 'accentColor'>; height: number; className?: string }) {
  const preset = user.bannerPreset ? BANNERS[user.bannerPreset] : undefined;
  return (
    <div className={className} style={{ position: 'relative', height, overflow: 'hidden', background: user.bannerUrl && !preset ? `center/cover url(${user.bannerUrl})` : (user.accentColor ?? colorFor(user.id)) }}>
      {preset?.render()}
    </div>
  );
});

export const EFFECTS: Record<string, { label: string; render: () => ReactNode }> = {
  sparkles: {
    label: 'Brilhos',
    render: () => (
      <div className="cz">
        {many(16, (i) => (
          <svg key={i} width="12" height="12" viewBox="0 0 24 24" style={{ left: `${rnd(i) * 95}%`, top: `${rnd(i, 2) * 95}%`, animation: `cz-twinkle ${1.6 + rnd(i, 3) * 2}s ease-in-out ${-rnd(i, 4) * 3}s infinite` }}>
            <path d="M12 0l2.5 9.5L24 12l-9.5 2.5L12 24l-2.5-9.5L0 12l9.5-2.5z" fill={rnd(i, 5) > 0.5 ? '#fff' : 'rgb(var(--brand))'} />
          </svg>
        ))}
      </div>
    ),
  },
  snow: {
    label: 'Neve',
    render: () => (
      <div className="cz">
        {many(28, (i) => (
          <span key={i} style={css({ left: `${rnd(i) * 100}%`, top: 0, width: 3 + rnd(i, 2) * 3, height: 3 + rnd(i, 2) * 3, borderRadius: '50%', background: '#fff', opacity: 0.85, '--dx': `${(rnd(i, 3) - 0.5) * 40}px`, '--rot': '0deg', animation: `cz-fall ${6 + rnd(i, 4) * 6}s linear ${-rnd(i, 5) * 10}s infinite` })} />
        ))}
      </div>
    ),
  },
  hearts: {
    label: 'Corações',
    render: () => (
      <div className="cz">
        {many(12, (i) => (
          <svg key={i} width="16" height="16" viewBox="0 0 24 24" style={css({ left: `${rnd(i) * 90}%`, bottom: 0, '--dx': `${(rnd(i, 2) - 0.5) * 60}px`, animation: `cz-float ${4 + rnd(i, 3) * 3}s ease-in ${-rnd(i, 4) * 6}s infinite` })}>
            <path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4 6.9 4c2.2 0 3.6 1.2 5.1 3 1.5-1.8 2.9-3 5.1-3 3.9 0 6.1 4.2 4.5 7.8C19.5 16.4 12 21 12 21z" fill={rnd(i, 5) > 0.5 ? '#ff4d8d' : '#ff8fb8'} />
          </svg>
        ))}
      </div>
    ),
  },
  flames: {
    label: 'Chamas',
    render: () => (
      <div className="cz">
        {many(9, (i) => (
          <span key={i} style={{ bottom: -14, left: `${i * 11.5}%`, width: '16%', height: 34 + rnd(i) * 22, borderRadius: '50% 50% 20% 20%', background: 'linear-gradient(to top,#f97316,#facc15 55%,transparent)', filter: 'blur(7px)', opacity: 0.6, transformOrigin: 'bottom', animation: `cz-flame ${0.8 + rnd(i, 2) * 0.6}s ease-in-out ${-rnd(i, 3)}s infinite` }} />
        ))}
      </div>
    ),
  },
  lightning: {
    label: 'Eletricidade',
    render: () => (
      <div className="cz">
        <div style={{ inset: 0, borderRadius: 'inherit', boxShadow: 'inset 0 0 0 2px #7dd3fc, inset 0 0 30px #38bdf8', animation: 'cz-zap 2.6s linear infinite' }} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ inset: 0, width: '100%', height: '100%', animation: 'cz-zap 2.6s linear .3s infinite' }}>
          <path d="M0 30 L12 34 L8 40 L22 44" stroke="#e0f2fe" strokeWidth="1" fill="none" />
          <path d="M100 70 L88 66 L92 60 L78 56" stroke="#e0f2fe" strokeWidth="1" fill="none" />
        </svg>
      </div>
    ),
  },
  bubbles: {
    label: 'Bolhas',
    render: () => (
      <div className="cz">
        {many(14, (i) => (
          <span key={i} style={css({ left: `${rnd(i) * 95}%`, bottom: 0, width: 8 + rnd(i, 2) * 14, height: 8 + rnd(i, 2) * 14, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,.7)', background: 'radial-gradient(circle at 30% 30%,rgba(255,255,255,.5),transparent 60%)', '--dx': `${(rnd(i, 3) - 0.5) * 40}px`, animation: `cz-float ${5 + rnd(i, 4) * 4}s ease-in ${-rnd(i, 5) * 8}s infinite` })} />
        ))}
      </div>
    ),
  },
  confetti: {
    label: 'Confete',
    render: () => (
      <div className="cz">
        {many(26, (i) => (
          <span key={i} style={css({ left: `${rnd(i) * 100}%`, top: 0, width: 5, height: 9, background: ['#ff2d78', '#facc15', '#22d3ee', '#a855f7', '#22c55e'][i % 5], '--dx': `${(rnd(i, 2) - 0.5) * 70}px`, '--rot': `${540 + rnd(i, 3) * 360}deg`, animation: `cz-fall ${3.5 + rnd(i, 4) * 3}s linear ${-rnd(i, 5) * 6}s infinite` })} />
        ))}
      </div>
    ),
  },
  aura: {
    label: 'Aura Neon',
    render: () => (
      <div className="cz" style={{ borderRadius: 'inherit' }}>
        <div style={{ inset: '-50%', background: 'conic-gradient(from 0deg,transparent 0 60%,rgb(var(--brand)) 75%,rgb(var(--brand-2)) 85%,transparent 100%)', animation: 'cz-spin 4s linear infinite', opacity: 0.55 }} />
        <div style={{ inset: 2, borderRadius: 'inherit', background: 'rgb(var(--bg-float))' }} />
      </div>
    ),
  },
};

/** Overlay effect on top of a profile card (pointer-events: none). Aura goes behind the content. */
export function ProfileEffect({ id, behind }: { id: string | null | undefined; behind?: boolean }) {
  const fx = id ? EFFECTS[id] : undefined;
  if (!fx) return null;
  const isBehind = id === 'aura';
  if (Boolean(behind) !== isBehind) return null;
  return <>{fx.render()}</>;
}
