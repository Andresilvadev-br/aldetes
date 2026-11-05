import { memo, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import clsx from 'clsx';
import type { BannerOptions } from '@aldetes/shared';
import type { PublicUser } from '@aldetes/shared';
import { colorFor } from '../common/Avatar';
import { useOffscreenPause } from '@/lib/perf';

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
    label: 'Chuva Digital',
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
  // ---------- 1.0 collections ----------
  'neon-current': {
    label: 'Neon Current',
    tag: 'coleção',
    render: () => (
      <div className="cz" style={{ background: 'linear-gradient(135deg,#07021a 0%,#1a0640 55%,#06142e 100%)' }}>
        {[0, 1, 2].map((i) => (
          <svg key={i} viewBox="0 0 200 40" preserveAspectRatio="none" style={{ left: 0, top: `${22 + i * 22}%`, width: '200%', height: 28, opacity: 0.9 - i * 0.2, animation: `cz-wave ${5 + i * 2}s linear infinite` }}>
            <path d="M0 20 C 25 2, 25 38, 50 20 S 75 2, 100 20 S 125 38, 150 20 S 175 2, 200 20" stroke={['#ff2d78', '#22d3ee', '#a855f7'][i]} strokeWidth="2" fill="none" style={{ filter: `drop-shadow(0 0 4px ${['#ff2d78', '#22d3ee', '#a855f7'][i]})` }} />
          </svg>
        ))}
      </div>
    ),
  },
  orbital: {
    label: 'Orbital',
    tag: 'coleção',
    render: () => (
      <div className="cz" style={{ background: 'radial-gradient(ellipse at 50% 60%,#1e1b4b 0%,#0b0a1f 60%,#040312 100%)' }}>
        {/* system centred to the right: names/avatars sit on the left of banners and headers */}
        <div style={{ left: '86%', top: '55%', width: 26, height: 26, margin: -13, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%,#fde68a,#f59e0b 60%,#b45309)', boxShadow: '0 0 24px #f59e0b' }} />
        {[60, 100, 150].map((d, i) => (
          <div key={d} style={{ left: '86%', top: '55%', width: d * 2, height: d * 0.7, marginLeft: -d, marginTop: -d * 0.35, borderRadius: '50%', border: '1px solid rgba(165,180,252,.35)' }}>
            <span style={{ position: 'absolute', left: '50%', top: '50%', width: '100%', height: '100%', marginLeft: '-50%', marginTop: '-50%', animation: `cz-spin ${6 + i * 4}s linear infinite`, transformOrigin: '50% 50%' }}>
              <span style={{ position: 'absolute', left: -4, top: '50%', width: 8, height: 8, marginTop: -4, borderRadius: '50%', background: ['#22d3ee', '#f472b6', '#a3e635'][i], boxShadow: `0 0 8px ${['#22d3ee', '#f472b6', '#a3e635'][i]}` }} />
            </span>
          </div>
        ))}
        {many(24, (i) => (
          <span key={i} style={{ left: `${rnd(i, 11) * 100}%`, top: `${rnd(i, 12) * 100}%`, width: 2, height: 2, borderRadius: '50%', background: '#fff', animation: `cz-twinkle ${2 + rnd(i, 13) * 3}s ease-in-out ${-rnd(i, 14) * 3}s infinite` }} />
        ))}
      </div>
    ),
  },
  'chroma-wave': {
    label: 'Chroma Wave',
    tag: 'coleção',
    render: () => (
      <div className="cz" style={{ background: 'linear-gradient(120deg,#ff2d78,#f59e0b,#22c55e,#22d3ee,#a855f7,#ff2d78)', backgroundSize: '300% 100%', animation: 'cz-chroma 12s linear infinite' }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ left: 0, bottom: `${-10 + i * 18}%`, width: '200%', height: '60%', opacity: 0.35 + i * 0.2, animation: `cz-wave ${9 - i * 3}s linear infinite` }}>
            <svg viewBox="0 0 200 20" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <path d="M0 10 Q 25 0 50 10 T 100 10 T 150 10 T 200 10 V20 H0Z" fill="rgba(10,6,24,.55)" />
            </svg>
          </div>
        ))}
      </div>
    ),
  },
  'zen-dust': {
    label: 'Zen Dust',
    tag: 'coleção',
    render: () => (
      <div className="cz" style={{ background: 'linear-gradient(180deg,#1c1917 0%,#292524 60%,#44403c 100%)' }}>
        <div style={{ left: '62%', top: '18%', width: 54, height: 54, borderRadius: '50%', background: 'radial-gradient(circle,#fef3c7 0%,#fde68a 40%,transparent 70%)', opacity: 0.8 }} />
        {many(30, (i) => (
          <span key={i} style={css({ left: `${rnd(i, 21) * 100}%`, bottom: 0, width: 2 + rnd(i, 22) * 2, height: 2 + rnd(i, 22) * 2, borderRadius: '50%', background: 'rgba(254,243,199,.75)', '--dx': `${(rnd(i, 23) - 0.5) * 40}px`, animation: `cz-rise ${8 + rnd(i, 24) * 8}s ease-in-out ${-rnd(i, 25) * 12}s infinite` })} />
        ))}
        <svg viewBox="0 0 200 30" preserveAspectRatio="none" style={{ left: 0, bottom: 0, width: '100%', height: '35%' }}>
          <path d="M0 30 L0 18 Q 40 8 80 16 T 160 12 T 200 16 L200 30Z" fill="#0c0a09" opacity=".8" />
        </svg>
      </div>
    ),
  },
  // ---------- 1.0 static gradients (no animation at all) ----------
  'g-dusk': { label: 'Crepúsculo', tag: 'estático', render: () => <div className="cz" style={{ background: 'linear-gradient(135deg,#ff7e5f,#feb47b 45%,#6a3093)' }} /> },
  'g-mint': { label: 'Menta', tag: 'estático', render: () => <div className="cz" style={{ background: 'linear-gradient(135deg,#0f766e,#34d399 55%,#d9f99d)' }} /> },
  'g-ember': { label: 'Brasa', tag: 'estático', render: () => <div className="cz" style={{ background: 'linear-gradient(135deg,#450a0a,#dc2626 55%,#f97316)' }} /> },
  'g-ice': { label: 'Gelo', tag: 'estático', render: () => <div className="cz" style={{ background: 'linear-gradient(135deg,#0c4a6e,#38bdf8 55%,#e0f2fe)' }} /> },
  'g-mono': { label: 'Grafite', tag: 'estático', render: () => <div className="cz" style={{ background: 'linear-gradient(135deg,#0a0a0a,#3f3f46 60%,#71717a)' }} /> },
  'g-berry': { label: 'Amora', tag: 'estático', render: () => <div className="cz" style={{ background: 'linear-gradient(135deg,#4a044e,#c026d3 55%,#f0abfc)' }} /> },
  // ---------- 2.1 Identity Studio: configurable banners (colors --b1/--b2, intensity, speed --spd, reduced) ----------
  'nebula-flow': {
    label: 'Nebula Flow',
    tag: 'novo',
    render: () => (
      <div className="bn" style={{ background: 'radial-gradient(120% 90% at 30% 20%, #1b1046, #070418 70%)' }}>
        {[['var(--b1, #a855f7)', '-40%', '-50%', 22], ['var(--b2, #22d3ee)', '10%', '-20%', 28], ['#ec4899', '-20%', '10%', 34]].map(([c, l, t, d], i) => (
          <span key={i} className="bn-neb bn-anim" style={css({ '--c': c, left: l, top: t, '--d': `${d}s`, animationDelay: `${-i * 5}s` })} />
        ))}
        {many(16, (i) => (
          <span key={`s${i}`} className="bn-star bn-anim bn-part" style={css({ left: `${rnd(i, 41) * 100}%`, top: `${rnd(i, 42) * 100}%`, '--d': `${3 + rnd(i, 43) * 4}s`, animationDelay: `${-rnd(i, 44) * 4}s`, transform: `scale(${0.5 + rnd(i, 45)})` })} />
        ))}
      </div>
    ),
  },
  'cyber-rain-x': {
    label: 'Cyber Rain',
    tag: 'novo',
    render: () => (
      <div className="bn" style={{ background: 'linear-gradient(#020617, #0b1033 70%, #1e0b3b)' }}>
        <span style={{ left: 0, right: 0, bottom: 0, height: '35%', background: 'linear-gradient(transparent, var(--b2, #ff2d78))', opacity: 0.25 }} />
        {many(14, (i) => (
          <span key={i} className={clsx('bn-line bn-anim', i % 3 === 0 && 'bn-part')} style={css({ left: `${(i / 14) * 100 + rnd(i, 51) * 5}%`, '--c': i % 4 === 0 ? 'var(--b2, #ff2d78)' : 'var(--b1, #22d3ee)', '--d': `${1.6 + rnd(i, 52) * 2.4}s`, animationDelay: `${-rnd(i, 53) * 3}s`, opacity: 0.4 + rnd(i, 54) * 0.6 })} />
        ))}
      </div>
    ),
  },
  'aurora-dream': {
    label: 'Aurora Dream',
    tag: 'novo',
    render: () => (
      <div className="bn" style={{ background: 'linear-gradient(#030712, #0b1a2e)' }}>
        {[['var(--b1, #22c55e)', '-5%', 14], ['var(--b2, #22d3ee)', '18%', 18], ['#a855f7', '38%', 22]].map(([c, t, d], i) => (
          <span key={i} className="bn-ribbon bn-anim" style={css({ '--c': c, top: t, '--d': `${d}s`, animationDelay: `${-i * 4}s` })} />
        ))}
        {many(10, (i) => (
          <span key={`s${i}`} className="bn-star bn-anim bn-part" style={css({ left: `${rnd(i, 61) * 100}%`, top: `${60 + rnd(i, 62) * 35}%`, '--d': `${3 + rnd(i, 63) * 3}s`, animationDelay: `${-rnd(i, 64) * 3}s` })} />
        ))}
      </div>
    ),
  },
  'liquid-chrome': {
    label: 'Liquid Chrome',
    tag: 'novo',
    render: () => (
      <div className="bn">
        <span className="bn-chrome bn-anim" style={css({ '--d': '9s' })} />
        <span style={{ inset: 0, background: 'linear-gradient(160deg, var(--b1, #94a3b8)55, transparent 50%, var(--b2, #e2e8f0)44)', mixBlendMode: 'overlay' }} />
        <span className="bn-sheen bn-anim" style={css({ '--d': '5.5s' })} />
      </div>
    ),
  },
  'galaxy-drift': {
    label: 'Galaxy Drift',
    tag: 'novo',
    render: () => (
      <div className="bn" style={{ background: 'radial-gradient(120% 100% at 70% 50%, #1e1b4b, #05030f 70%)' }}>
        <span style={{ left: '20%', top: '25%', width: '70%', height: '50%', borderRadius: '50%', background: 'radial-gradient(closest-side, var(--b1, #7c3aed)66, transparent)', transform: 'rotate(-14deg)' }} />
        {[[70, '#ffffff66', 90], [45, '#ffffffaa', 55], [28, '#ffffff', 34]].map(([sz, c, d], i) => (
          <span key={i} className={clsx('bn-field bn-anim', i === 0 && 'bn-part')} style={css({ backgroundImage: `radial-gradient(1.4px 1.4px at 20% 30%, ${c}, transparent), radial-gradient(1.2px 1.2px at 70% 80%, ${c}, transparent), radial-gradient(1px 1px at 45% 60%, ${c}, transparent)`, backgroundSize: `${sz}px ${sz}px`, '--d': `${d}s` })} />
        ))}
        <span style={{ left: 0, right: 0, top: '45%', height: '18%', background: 'linear-gradient(90deg, transparent, var(--b2, #f472b6)33, transparent)', transform: 'rotate(-8deg)' }} />
      </div>
    ),
  },
  // ---------- 2.1 Worlds Studio: server banners ----------
  'neon-skyline': {
    label: 'Neon Skyline',
    tag: 'servidor',
    render: () => (
      <div className="bn" style={{ background: 'linear-gradient(#0b0320, #2a0b4a 70%, var(--b2, #ff2d78))' }}>
        {[0, 1].map((i) => (
          <span key={i} className="bn-beam bn-anim" style={css({ left: `${20 + i * 50}%`, '--c': i ? 'var(--b2, #ff2d78)' : 'var(--b1, #22d3ee)', '--d': `${7 + i * 3}s` })} />
        ))}
        {many(12, (i) => {
          const h = 30 + rnd(i, 71) * 55;
          return (
            <span key={i} className="bn-building" style={css({ left: `${(i / 12) * 100}%`, width: `${100 / 12 + 0.5}%`, height: `${h}%`, '--c': i % 2 ? 'var(--b1, #22d3ee)' : 'var(--b2, #ff2d78)' })}>
              {many(3, (j) => (
                <span key={j} className="bn-win bn-anim" style={css({ position: 'absolute', left: `${25 + rnd(i * 5 + j, 72) * 50}%`, top: `${15 + j * 25}%`, background: rnd(i + j, 73) > 0.5 ? '#fde047' : 'var(--b1, #22d3ee)', '--d': `${1.5 + rnd(i * 3 + j, 74) * 3}s` })} />
              ))}
            </span>
          );
        })}
      </div>
    ),
  },
  'cosmic-horizon': {
    label: 'Cosmic Horizon',
    tag: 'servidor',
    render: () => (
      <div className="bn" style={{ background: 'linear-gradient(#030014, #1e1b4b 65%, #312e81)' }}>
        {many(10, (i) => (
          <span key={i} className="bn-star bn-anim bn-part" style={css({ left: `${rnd(i, 81) * 100}%`, top: `${rnd(i, 82) * 55}%`, '--d': `${2.5 + rnd(i, 83) * 3}s`, animationDelay: `${-rnd(i, 84) * 3}s` })} />
        ))}
        <span style={{ left: '-20%', right: '-20%', bottom: '-160%', height: '200%', borderRadius: '50%', background: 'radial-gradient(closest-side, #0b1033 96%, transparent)', boxShadow: '0 -6px 30px var(--b1, #60a5fa)' }} />
        <span className="bn-ribbon bn-anim" style={css({ top: '48%', height: '22%', '--c': 'var(--b2, #a78bfa)', '--d': '12s' })} />
      </div>
    ),
  },
  'digital-matrix': {
    label: 'Digital Matrix',
    tag: 'servidor',
    render: () => (
      <div className="bn" style={{ background: 'linear-gradient(#010b0a, #04211c)' }}>
        <span className="bn-grid bn-anim" style={css({ '--c': 'var(--b1, #10b981)', '--d': '2.4s' })} />
        {many(10, (i) => (
          <span key={i} className="bn-node bn-anim bn-part" style={css({ left: `${rnd(i, 91) * 100}%`, top: `${rnd(i, 92) * 50}%`, '--c': 'var(--b2, #34d399)', background: 'var(--b2, #34d399)', '--d': `${2 + rnd(i, 93) * 3}s`, animationDelay: `${-rnd(i, 94) * 3}s` })} />
        ))}
      </div>
    ),
  },
  dreamscape: {
    label: 'Dreamscape',
    tag: 'servidor',
    render: () => (
      <div className="bn" style={{ background: 'linear-gradient(135deg, #1e1035, #0f2440)' }}>
        {[['var(--b1, #f472b6)', '-30%', '-40%', 18], ['var(--b2, #818cf8)', '20%', '-10%', 24], ['#2dd4bf', '-10%', '20%', 30]].map(([c, l, t, d], i) => (
          <span key={i} className="bn-neb bn-anim" style={css({ '--c': c, left: l, top: t, '--d': `${d}s`, animationDelay: `${-i * 6}s`, opacity: 0.6 })} />
        ))}
      </div>
    ),
  },
  'energy-core': {
    label: 'Energy Core',
    tag: 'servidor',
    render: () => (
      <div className="bn" style={{ background: 'radial-gradient(circle at 50% 50%, #1a0b2e, #05020c 70%)' }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="bn-ring bn-anim" style={css({ width: 90, height: 90, margin: -45, '--c': i % 2 ? 'var(--b2, #a855f7)' : 'var(--b1, #22d3ee)', '--d': '3.6s', animationDelay: `${-i * 1.2}s` })} />
        ))}
        <span className="bn-core bn-anim" style={css({ '--c': 'var(--b1, #22d3ee)', '--d': '2.4s' })} />
      </div>
    ),
  },
};

export const isVideoUrl = (u: string | null | undefined) => !!u && /\.(mp4|webm)(\?|$)/i.test(u);

/** Muted looping video banner (always re-encoded by the server). Paused with reduced motion / off screen. */
export function BannerVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = document.documentElement.dataset.reduceMotion === 'true';
    if (reduce) return void v.pause();
    const io = new IntersectionObserver(([e]) => (e?.isIntersecting ? void v.play().catch(() => {}) : v.pause()));
    io.observe(v);
    return () => io.disconnect();
  }, [src]);
  return <video ref={ref} src={src} muted loop playsInline preload="metadata" aria-hidden className="absolute inset-0 h-full w-full object-cover" />;
}

/** Banner: animated preset › uploaded image/GIF/short video › accent colour. */
/** CSS variables for a banner from its options (colors, speed); intensity is the opacity of the animated layer. */
export function bannerVars(o: Partial<BannerOptions> | null | undefined): CSSProperties {
  return css({ ...(o?.c1 ? { '--b1': o.c1 } : {}), ...(o?.c2 ? { '--b2': o.c2 } : {}), '--spd': o?.speed ? 100 / o.speed : 1 });
}

export const ProfileBanner = memo(function ProfileBanner({ user, height, className }: { user: Pick<PublicUser, 'id' | 'bannerUrl' | 'bannerPreset' | 'accentColor'> & { bannerOptions?: BannerOptions | null }; height: number; className?: string }) {
  const preset = user.bannerPreset ? BANNERS[user.bannerPreset] : undefined;
  const pause = useOffscreenPause();
  const video = !preset && isVideoUrl(user.bannerUrl);
  const o = user.bannerOptions;
  return (
    <div ref={pause} className={className} style={{ position: 'relative', height, overflow: 'hidden', background: user.bannerUrl && !preset && !video ? `center/cover url(${user.bannerUrl})` : (user.accentColor ?? colorFor(user.id)), ...bannerVars(o) }}>
      {preset && (o ? <div className={clsx('absolute inset-0', o.reduced && 'bn-reduced-wrap')} style={{ opacity: 0.25 + (0.75 * (o.intensity ?? 80)) / 100 }}>{preset.render()}</div> : preset.render())}
      {video && <BannerVideo src={user.bannerUrl!} />}
    </div>
  );
});

/* ---------------- Avatar decorations (drawn around the avatar; the image itself is untouched) ---------------- */
export const DECORATIONS: Record<string, { label: string; collection?: string }> = {
  'neon-current': { label: 'Neon Current', collection: 'NEON CURRENT' },
  orbital: { label: 'Orbital', collection: 'ORBITAL' },
  'chroma-wave': { label: 'Chroma Wave', collection: 'CHROMA WAVE' },
  'zen-dust': { label: 'Zen Dust', collection: 'ZEN DUST' },
  halo: { label: 'Halo' },
  'ember-ring': { label: 'Anel de brasa' },
  frost: { label: 'Geada' },
  'quantum-orbit': { label: 'Quantum Orbit', collection: 'COSMIC LEGACY' },
  'plasma-crown': { label: 'Plasma Crown', collection: 'ETERNAL FLAME' },
  'crystal-prism': { label: 'Crystal Prism', collection: 'HOLOGRAPHIC' },
  'neon-circuit': { label: 'Neon Circuit', collection: 'NEON GENESIS' },
  'solar-eclipse': { label: 'Solar Eclipse', collection: 'OBSIDIAN ELITE' },
};

/** Decoration layer: absolutely positioned around a square avatar of `size` px. Pointer-events none. */
/**
 * Size-adaptive: animated only from 56 px (profile card, Spaces, call stage); smaller avatars (chat, lists,
 * participants) get the same frame STATIC — dozens of small avatars never run loops at the same time.
 */
export function AvatarDecoration({ id, size, animate }: { id: string | null | undefined; size: number; animate?: boolean }) {
  if (!id || !DECORATIONS[id] || size < 20) return null;
  const pad = Math.max(2, Math.round(size * (size < 40 ? 0.06 : 0.09)));
  const live = animate ?? size >= 56;
  return (
    <span aria-hidden className={clsx('deco', `deco-${id}`, !live && 'deco-static')} style={{ position: 'absolute', inset: -pad, borderRadius: '50%', pointerEvents: 'none', zIndex: 1 }}>
      {id === 'plasma-crown' && [-48, -24, 0, 24, 48].map((r, i) => <i key={r} style={{ rotate: `${r}deg`, animationDelay: `${-i * 0.27}s` }} />)}
      {id === 'orbital' && <span className="deco-orbit" />}
      {id === 'zen-dust' && [0, 1, 2].map((i) => <span key={i} className="deco-mote" style={{ animationDelay: `${-i * 1.3}s`, left: `${20 + i * 28}%` }} />)}
    </span>
  );
}

/** Collections: a coordinated set (banner + decoration + effect + entrance). */
export const COLLECTIONS: Array<{ id: string; name: string; banner: string; decoration: string; effect: string | null; entrance: string; theme?: string; decor?: { nameEffect: string; badge: string | null; cardBorder: string }; bannerOptions?: Partial<BannerOptions>; premium?: boolean }> = [
  // 2.1 premium collections (everything also usable on its own)
  { id: 'neon-genesis', name: 'NEON GENESIS', premium: true, banner: 'cyber-rain-x', decoration: 'neon-circuit', effect: 'electric-pulse', entrance: 'glitch', theme: 'synthwave', decor: { nameEffect: 'glow', badge: 'bolt', cardBorder: 'flow' } },
  { id: 'cosmic-legacy', name: 'COSMIC LEGACY', premium: true, banner: 'galaxy-drift', decoration: 'quantum-orbit', effect: 'cosmic-arrival', entrance: 'particles', theme: 'eclipse', decor: { nameEffect: 'shimmer', badge: 'star', cardBorder: 'none' } },
  { id: 'obsidian-elite', name: 'OBSIDIAN ELITE', premium: true, banner: 'liquid-chrome', decoration: 'solar-eclipse', effect: 'ethereal-mist', entrance: 'reveal', theme: 'obsidian', decor: { nameEffect: 'gradient', badge: 'crown', cardBorder: 'pulse' } },
  { id: 'holographic', name: 'HOLOGRAPHIC', premium: true, banner: 'aurora-dream', decoration: 'crystal-prism', effect: 'holographic-shift', entrance: 'lights', theme: 'arctic-glass', decor: { nameEffect: 'shimmer', badge: 'diamond', cardBorder: 'flow' } },
  { id: 'eternal-flame', name: 'ETERNAL FLAME', premium: true, banner: 'nebula-flow', bannerOptions: { c1: '#f97316', c2: '#ef4444' }, decoration: 'plasma-crown', effect: 'celestial-wings', entrance: 'lights', theme: 'inferno', decor: { nameEffect: 'glow', badge: 'heart', cardBorder: 'pulse' } },
  { id: 'neon-current', name: 'NEON CURRENT', banner: 'neon-current', decoration: 'neon-current', effect: 'lightning', entrance: 'glitch' },
  { id: 'orbital', name: 'ORBITAL', banner: 'orbital', decoration: 'orbital', effect: 'sparkles', entrance: 'reveal' },
  { id: 'chroma-wave', name: 'CHROMA WAVE', banner: 'chroma-wave', decoration: 'chroma-wave', effect: 'confetti', entrance: 'lights' },
  { id: 'zen-dust', name: 'ZEN DUST', banner: 'zen-dust', decoration: 'zen-dust', effect: null, entrance: 'particles' },
];

export const ENTRANCES: Record<string, string> = { particles: 'Partículas', lights: 'Luzes', glitch: 'Glitch limpo', reveal: 'Revelação do banner' };

/**
 * One-shot entrance when a profile card opens (≤ 700 ms, contained in the card, pointer-events none).
 * Skipped with reduced motion / performance mode. `play` changes → replays (used by the editor preview).
 */
export function ProfileEntrance({ id, play = 0 }: { id: string | null | undefined; play?: number }) {
  if (!id || !ENTRANCES[id] || document.documentElement.dataset.reduceMotion === 'true') return null;
  return (
    <span key={play} aria-hidden className={`entr entr-${id}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', borderRadius: 'inherit', zIndex: 5 }}>
      {id === 'particles' && many(14, (i) => <span key={i} className="entr-p" style={css({ left: `${rnd(i, 31) * 100}%`, top: `${30 + rnd(i, 32) * 40}%`, '--dx': `${(rnd(i, 33) - 0.5) * 120}px`, '--dy': `${-40 - rnd(i, 34) * 80}px`, animationDelay: `${rnd(i, 35) * 120}ms` })} />)}
    </span>
  );
}

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

// 2.1 effects: entrance (one shot) → permanence (slow, light) → exit (.pfx-exit when the card closes)
Object.assign(EFFECTS, {
  'cosmic-arrival': {
    label: 'Cosmic Arrival',
    render: () => (
      <div className="pfx">
        {many(18, (i) => {
          const a = rnd(i, 101) * Math.PI * 2;
          const d = 60 + rnd(i, 102) * 120;
          return <span key={i} className="pfx-p pfx-burst" style={css({ left: '50%', top: '30%', '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, animationDelay: `${rnd(i, 103) * 0.15}s`, background: i % 3 ? '#e0e7ff' : '#c4b5fd' })} />;
        })}
        {many(6, (i) => (
          <span key={`d${i}`} className="pfx-p pfx-drift" style={{ left: `${10 + rnd(i, 104) * 80}%`, top: `${15 + rnd(i, 105) * 70}%`, animationDelay: `${-rnd(i, 106) * 9}s`, width: 3, height: 3 }} />
        ))}
      </div>
    ),
  },
  'holographic-shift': { label: 'Holographic Shift', render: () => <div className="pfx"><span className="pfx-p pfx-holo" style={{ width: 'auto', height: 'auto', borderRadius: 0, background: undefined }} /></div> },
  'electric-pulse': { label: 'Electric Pulse', render: () => <div className="pfx"><span className="pfx-ring" style={{ position: 'absolute' }} /></div> },
  'ethereal-mist': {
    label: 'Ethereal Mist',
    render: () => (
      <div className="pfx">
        {[0, 1, 2].map((i) => (
          <span key={i} className="pfx-mist" style={{ position: 'absolute', left: `${-10 + i * 25}%`, top: `${40 + i * 15}%`, animationDelay: `${-i * 4.5}s` }} />
        ))}
      </div>
    ),
  },
  'celestial-wings': {
    label: 'Celestial Wings',
    render: () => (
      <div className="pfx">
        <span className="pfx-wing" style={css({ position: 'absolute', left: '2%', '--wx': '100%' })} />
        <span className="pfx-wing" style={css({ position: 'absolute', left: '22%', '--wx': '0%', animationDelay: '0.08s' })} />
      </div>
    ),
  },
} satisfies Record<string, { label: string; render: () => ReactNode }>);
const BEHIND = new Set(['aura', 'ethereal-mist', 'celestial-wings']);

/** Overlay effect on top of a profile card (pointer-events: none). Some go behind the content. */
export function ProfileEffect({ id, behind, closing }: { id: string | null | undefined; behind?: boolean; closing?: boolean }) {
  const fx = id ? EFFECTS[id] : undefined;
  if (!fx) return null;
  if (Boolean(behind) !== BEHIND.has(id!)) return null;
  return <div className={clsx('pointer-events-none absolute inset-0', closing && 'pfx-exit')}>{fx.render()}</div>;
}

/* ---------------- 2.1 profile themes (whole card) ---------------- */
export const PROFILE_THEMES: Record<string, { label: string; a: string; b: string; bg: string; desc: string; embers?: boolean }> = {
  obsidian: { label: 'Obsidian', a: '209 213 219', b: '113 113 122', bg: 'linear-gradient(160deg, #18181b 0%, #0a0a0c 55%, #1f1f23 100%)', desc: 'Preto profundo e reflexos metálicos' },
  synthwave: { label: 'Synthwave', a: '255 45 149', b: '34 211 238', bg: 'linear-gradient(170deg, #2b0a4e 0%, #160530 50%, #0b1a3a 100%)', desc: 'Roxo, rosa e azul retrô-futurista' },
  'arctic-glass': { label: 'Arctic Glass', a: '125 211 252', b: '191 219 254', bg: 'linear-gradient(165deg, #12304a 0%, #0b1d30 55%, #0e2740 100%)', desc: 'Vidro translúcido e reflexos azulados' },
  inferno: { label: 'Inferno', a: '249 115 22', b: '239 68 68', bg: 'linear-gradient(170deg, #2a0e07 0%, #170604 60%, #2b0b05 100%)', desc: 'Tons quentes e brasas discretas', embers: true },
  eclipse: { label: 'Eclipse', a: '251 191 36', b: '168 85 247', bg: 'radial-gradient(120% 70% at 50% 0%, #241a4b 0%, #0a0818 55%, #05040c 100%)', desc: 'Espaço escuro com iluminação sofisticada' },
};
/** Style for a themed card: accent variables (buttons, highlights) + background. */
export function themeStyle(id: string | null | undefined): CSSProperties | undefined {
  const t = id ? PROFILE_THEMES[id] : undefined;
  if (!t) return undefined;
  return css({ '--brand': t.a, '--brand-2': t.b, background: t.bg });
}
export function ThemeLayer({ id }: { id: string | null | undefined }) {
  const t = id ? PROFILE_THEMES[id] : undefined;
  if (!t) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {id === 'obsidian' && <span className="absolute inset-x-0 top-[38%] h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />}
      {id === 'arctic-glass' && <span className="absolute inset-0 bg-[linear-gradient(120deg,rgb(255_255_255/0.08),transparent_40%,rgb(255_255_255/0.05)_70%,transparent)]" />}
      {t.embers && many(6, (i) => <span key={i} className="amb-dot" style={{ position: 'absolute', left: `${10 + rnd(i, 111) * 80}%`, bottom: `${rnd(i, 112) * 30}%`, background: '#fb923c', animationDelay: `${-rnd(i, 113) * 12}s` }} />)}
    </div>
  );
}

/* ---------------- 2.1 decorations: name effect, badge (original icons), card border ---------------- */
export const BADGE_PATHS: Record<string, string> = {
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8Z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  heart: 'M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4 6.9 4c2.2 0 3.6 1.2 5.1 3 1.5-1.8 2.9-3 5.1-3 3.9 0 6.1 4.2 4.5 7.8C19.5 16.4 12 21 12 21Z',
  gamepad: 'M7 8h10a4 4 0 0 1 4 4v1.5a3.5 3.5 0 0 1-6.2 2.2L14 15h-4l-.8.7A3.5 3.5 0 0 1 3 13.5V12a4 4 0 0 1 4-4Z',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z',
  diamond: 'M6 3h12l3 6-9 12L3 9l3-6Zm-3 6h18M12 21 8 9l4-6 4 6-4 12',
};
export const BADGE_LABEL: Record<string, string> = { star: 'Estrela', crown: 'Coroa', bolt: 'Raio', heart: 'Coração', gamepad: 'Controle', music: 'Música', shield: 'Escudo', diamond: 'Diamante' };
export function Badge({ id, size = 16 }: { id: string | null | undefined; size?: number }) {
  if (!id || !BADGE_PATHS[id]) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="rgb(var(--brand) / .25)" stroke="rgb(var(--brand))" strokeWidth={2} strokeLinejoin="round" className="inline-block shrink-0 align-[-2px]" aria-label={BADGE_LABEL[id]}>
      <path d={BADGE_PATHS[id]} />
    </svg>
  );
}
export const nameClass = (effect: string | null | undefined) => (effect === 'glow' ? 'nm-glow' : effect === 'gradient' ? 'nm-gradient' : effect === 'shimmer' ? 'nm-shimmer' : '');
export const borderClass = (b: string | null | undefined) => (b === 'flow' ? 'cb-flow' : b === 'pulse' ? 'cb-pulse' : '');
