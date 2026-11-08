import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import { DEFAULT_STUDIO, studioThemeSchema, type Server, type StudioTheme } from '@aldetes/shared';
import { usePrefs, getPrefs, setPrefs } from '@/lib/prefs';
import { BANNERS, BannerVideo, isVideoUrl, bannerVars, Badge, nameClass } from '../profile/Cosmetics';
import { useStore } from '@/store';
import { AL_BY_ID } from '@aldetes/shared';
import { AlAmbient } from '../profile/AnimeLegends';
import { useOffscreenPause } from '@/lib/perf';

/** The published theme of a server (defaults when there is none or it doesn't validate). */
export function themeOf(server: Pick<Server, 'studio'> & { id?: string } | null | undefined): StudioTheme {
  if (!server?.studio) return DEFAULT_STUDIO;
  // the person's own choice always wins: "Usar aparência padrão" for this server
  if (server.id && getPrefs().plainServers.includes(server.id)) return DEFAULT_STUDIO;
  const r = studioThemeSchema.safeParse(server.studio);
  return r.success ? r.data : DEFAULT_STUDIO;
}

/** Re-render when the person toggles "Usar aparência padrão" on any server. */
export const usePlainServers = () => usePrefs((p) => p.plainServers);
export function togglePlainServer(id: string) {
  const cur = getPrefs().plainServers;
  setPrefs({ plainServers: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
}

/** Simple WCAG-style relative luminance of a #rrggbb color (for the contrast warning in the editor). */
export function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/** Animated server effects can be turned off per person (Aparência → Efeitos animados dos servidores). */
export function useServerEffects() {
  return usePrefs((p) => p.serverEffects && !p.reduceMotion && p.motion !== 'performance');
}

const POS = { top: 'center top', center: 'center', bottom: 'center bottom' } as const;
const LIGHT = { soft: 'from-black/10 via-bg-side/50 to-bg-side', vivid: 'from-transparent via-bg-side/25 to-bg-side', dim: 'from-black/45 via-bg-side/70 to-bg-side' } as const;

/**
 * Server cover: animated scene (Alive) › uploaded banner (image or short video) › accent aurora.
 * Used by the channel header, the rail preview, the invite page and the Studio preview — one renderer, same look.
 */
export function ServerCover({ server, theme, className, children, fade = true, still = false }: { server: Pick<Server, 'bannerUrl' | 'name'>; theme: StudioTheme; className?: string; children?: ReactNode; fade?: boolean; /** previews: no loops, no video playback */ still?: boolean }) {
  const effects = useServerEffects() && !still;
  const pause = useOffscreenPause();
  // 2.2: an Anime Legends server identity uses that collection's scene as the cover
  const scene = theme.legend ? BANNERS[`al:${theme.legend}`] : theme.scene ? BANNERS[theme.scene] : undefined;
  const video = isVideoUrl(server.bannerUrl);
  const accent = theme.accent;
  const style: CSSProperties = server.bannerUrl && !scene && !video ? { background: `${POS[theme.bannerPosition]}/cover url(${server.bannerUrl})` } : {};
  return (
    <div ref={pause} className={clsx('absolute inset-0 overflow-hidden', className, !effects && 'studio-static')} style={style}>
      {scene ? (
        <div className="absolute inset-0" style={{ opacity: 0.35 + (0.65 * theme.intensity) / 100, ...bannerVars({ c1: theme.sceneC1, c2: theme.sceneC2, speed: theme.speed }) }}>
          {scene.render()}
        </div>
      ) : video ? (
        effects ? <BannerVideo src={server.bannerUrl!} /> : <video src={server.bannerUrl!} muted playsInline preload="metadata" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      ) : !server.bannerUrl && still ? (
        <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${accent ? `${accent}80` : 'rgb(var(--brand) / 0.5)'}, ${accent ? `${accent}40` : 'rgb(var(--brand-2) / 0.35)'})` }} />
      ) : !server.bannerUrl ? (
        <div className="cz">
          <span className="left-[-20%] top-[-60%] h-[170%] w-[70%] rounded-full blur-3xl" style={{ background: accent ? `${accent}73` : 'rgb(var(--brand) / 0.45)', animation: 'cz-blob 14s ease-in-out infinite' }} />
          <span className="right-[-25%] top-[-40%] h-[150%] w-[70%] rounded-full blur-3xl" style={{ background: accent ? `${accent}55` : 'rgb(var(--brand-2) / 0.4)', animation: 'cz-blob 18s ease-in-out infinite reverse' }} />
        </div>
      ) : null}
      {theme.texture !== 'none' && <div className={`studio-tex studio-tex-${theme.texture}`} style={{ opacity: (0.35 * theme.intensity) / 70 }} aria-hidden />}
      {fade && <div className={clsx('absolute inset-0 bg-gradient-to-b', LIGHT[theme.lighting])} />}
      {children}
    </div>
  );
}

/**
 * Frame around a server icon (Signature) + 2.1 animated icon. `live` = this instance may loop (the open server's
 * header, the Worlds preview); rail icons pass live only for the selected server, so the rail never runs a loop
 * per server. Pulse Beacon pulses only while there is real activity (`active`: someone in a call / unread).
 */
export function IconFrame({ frame, accent, children, anim = 'none', live = false, active = false }: { frame: StudioTheme['iconFrame']; accent: string | null; children: ReactNode; anim?: StudioTheme['iconAnim']; live?: boolean; active?: boolean }) {
  const effects = useServerEffects();
  const a = anim !== 'none' && effects && (live || (anim === 'pulse-beacon' && active)) ? anim : 'none';
  const inner =
    a === 'none' ? children : (
      <span className={`ia ia-${a}`} data-active={a === 'pulse-beacon' ? String(active) : undefined} data-icon-anim={a} style={{ '--sa': accent ?? 'rgb(var(--brand))' } as CSSProperties}>
        {children}
      </span>
    );
  if (frame === 'none') return <>{inner}</>;
  return (
    <span className={`studio-frame studio-frame-${frame}`} style={{ '--sa': accent ?? 'rgb(var(--brand))' } as CSSProperties}>
      {inner}
    </span>
  );
}

// deterministic pseudo-random (same layout every render, no Math.random in render)
const r = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
/** Particle budget per motion profile: Ultra full, Equilibrado ~60 %, Essencial a few static ones. */
function useBudget(full: number) {
  const motion = usePrefs((p) => p.motion);
  return motion === 'ultra' ? full : motion === 'balanced' ? Math.ceil(full * 0.6) : Math.ceil(full * 0.3);
}

/**
 * 2.1 server ambient effect. Lives ONLY behind the channel list (z-index 0, pointer-events none) — never over
 * messages. Paused by CSS in Essencial / reduced motion / under load / offscreen. Reactive Glow follows real
 * activity: how many people are in this server's calls right now.
 */
export function ServerAmbient({ theme, serverId }: { theme: StudioTheme; serverId: string }) {
  const effects = useServerEffects();
  const active = useStore((s) => (theme.ambient === 'reactive-glow' ? Object.values(s.voiceStates).filter((v) => v.serverId === serverId).length : 0));
  const n = useBudget(theme.ambient === 'starlight' ? 22 : theme.ambient === 'ambient-particles' ? 14 : theme.ambient === 'digital-atmosphere' ? 5 : 2);
  const pause = useOffscreenPause();
  const legend = theme.legend ? AL_BY_ID[theme.legend] : undefined;
  if (legend && effects)
    return (
      <div ref={pause} className="amb" style={{ '--amb-o': 0.25 + (0.6 * theme.intensity) / 100 } as CSSProperties} data-ambient={`legend:${legend.id}`} aria-hidden>
        <AlAmbient c={legend} n={Math.min(n + 4, 16)} />
      </div>
    );
  if (theme.ambient === 'none' || !effects) return null;
  const o = 0.2 + (0.6 * theme.intensity) / 100;
  const st = { '--amb-o': o, ...(theme.accent ? { '--sa': theme.accent } : {}) } as CSSProperties;
  return (
    <div ref={pause} className="amb" style={st} data-ambient={theme.ambient} aria-hidden>
      {theme.ambient === 'ambient-particles' && Array.from({ length: n }, (_, i) => <i key={i} className="amb-dot" style={{ left: `${r(i, 1) * 100}%`, top: `${r(i, 2) * 100}%`, animationDelay: `${-r(i, 3) * 12}s`, animationDuration: `${10 + r(i, 4) * 8}s` }} />)}
      {theme.ambient === 'starlight' && Array.from({ length: n }, (_, i) => <i key={i} className="amb-star" style={{ left: `${r(i, 5) * 100}%`, top: `${r(i, 6) * 100}%`, animationDelay: `${-r(i, 7) * 4}s`, opacity: 0.4 + r(i, 8) * 0.6 }} />)}
      {theme.ambient === 'aurora-background' && Array.from({ length: n }, (_, i) => <i key={i} className="amb-aurora" style={{ top: `${5 + i * 30}%`, animationDelay: `${-i * 6}s` }} />)}
      {theme.ambient === 'reactive-glow' && <i className="amb-react" style={{ '--react': Math.min(1, active / 5) } as CSSProperties} data-react={active} />}
      {theme.ambient === 'digital-atmosphere' && Array.from({ length: n }, (_, i) => <i key={i} className="amb-geo" style={{ left: `${r(i, 9) * 85}%`, top: `${20 + r(i, 10) * 75}%`, animationDelay: `${-r(i, 11) * 22}s`, borderRadius: i % 2 ? 4 : 0, rotate: `${r(i, 12) * 90}deg` }} />)}
    </div>
  );
}

/** Server name with its 2.1 decorations (emblem + name highlight). */
export function ServerName({ name, theme, className }: { name: string; theme: StudioTheme; className?: string }) {
  return (
    <span className={clsx('inline-flex min-w-0 max-w-full items-center gap-1.5', className)} style={theme.accent ? ({ '--brand': hexRgb(theme.accent) } as CSSProperties) : undefined}>
      {theme.emblem && <Badge id={theme.emblem} size={15} />}
      <span className={clsx('truncate', nameClass(theme.nameEffect))} data-name-effect={theme.nameEffect}>{name}</span>
    </span>
  );
}
export const hexRgb = (h: string) => `${parseInt(h.slice(1, 3), 16)} ${parseInt(h.slice(3, 5), 16)} ${parseInt(h.slice(5, 7), 16)}`;

/** Presentation background (welcome card, invite): static, layered gradients — beautiful without motion. */
export function PresentationBg({ kind, accent }: { kind: StudioTheme['presentation']; accent: string | null }) {
  if (kind === 'none') return null;
  const a = accent ?? '#7c5cff';
  const bg =
    kind === 'nebula'
      ? `radial-gradient(60% 80% at 15% 20%, ${a}40, transparent 70%), radial-gradient(50% 70% at 85% 80%, ${a}30, transparent 70%)`
      : kind === 'grid'
        ? `linear-gradient(${a}22 1px, transparent 1px) 0 0/18px 18px, linear-gradient(90deg, ${a}22 1px, transparent 1px) 0 0/18px 18px, linear-gradient(180deg, ${a}18, transparent)`
        : `radial-gradient(120% 60% at 50% 120%, ${a}45, transparent 60%), radial-gradient(120% 50% at 50% 135%, ${a}30, transparent 70%)`;
  return <div className="pointer-events-none absolute inset-0" style={{ background: bg }} data-presentation={kind} aria-hidden />;
}

/**
 * 2.2 Server Atmosphere: lighting, background and a few details across the channel list (behind it, never over
 * messages). Mostly static layers (beautiful without motion); the few loops pause with Essencial, load, settle and
 * off screen like every other server effect.
 */
export const ATMOSPHERES: Record<Exclude<StudioTheme['atmosphere'], 'none'>, { label: string; desc: string; accent: string }> = {
  'cyber-city': { label: 'Cyber City', desc: 'Neon, grade no chão e skyline', accent: '#22d3ee' },
  celestial: { label: 'Celestial', desc: 'Céu profundo, nebulosa e estrelas', accent: '#818cf8' },
  'japanese-night': { label: 'Japanese Night', desc: 'Lua, lanternas e montanhas', accent: '#f43f5e' },
  luxury: { label: 'Luxury', desc: 'Preto, dourado e mármore', accent: '#eab308' },
  mystic: { label: 'Mystic', desc: 'Névoa, runas e luz violeta', accent: '#a855f7' },
};
export function ServerAtmosphere({ theme, compact }: { theme: StudioTheme; compact?: boolean }) {
  const pause = useOffscreenPause();
  if (theme.atmosphere === 'none') return null;
  const a = theme.accent ?? ATMOSPHERES[theme.atmosphere].accent;
  return (
    <div ref={pause} className={`atm atm-${theme.atmosphere}`} style={{ '--sa': a } as CSSProperties} data-atmosphere={theme.atmosphere} aria-hidden>
      {theme.atmosphere === 'cyber-city' && (
        <>
          <i className="atm-sky" />
          <i className="atm-grid" />
          {!compact && Array.from({ length: 9 }, (_, i) => <i key={i} className="atm-bldg" style={{ left: `${i * 11.5}%`, height: `${10 + r(i, 21) * 16}%` }} />)}
          <i className="atm-scan" />
        </>
      )}
      {theme.atmosphere === 'celestial' && (
        <>
          <i className="atm-neb" />
          {Array.from({ length: compact ? 10 : 22 }, (_, i) => <i key={i} className="atm-star" style={{ left: `${r(i, 31) * 100}%`, top: `${r(i, 32) * 100}%`, animationDelay: `${-r(i, 33) * 5}s`, opacity: 0.3 + r(i, 34) * 0.7 }} />)}
        </>
      )}
      {theme.atmosphere === 'japanese-night' && (
        <>
          <i className="atm-moon" />
          <i className="atm-mtn" />
          {[0, 1, 2].map((i) => <i key={i} className="atm-lantern" style={{ left: `${18 + i * 30}%`, top: `${6 + (i % 2) * 6}%`, animationDelay: `${-i * 1.3}s` }} />)}
        </>
      )}
      {theme.atmosphere === 'luxury' && (
        <>
          <i className="atm-marble" />
          <i className="atm-gold" style={{ top: '14%' }} />
          <i className="atm-gold" style={{ bottom: '12%' }} />
          <i className="atm-sheen" />
        </>
      )}
      {theme.atmosphere === 'mystic' && (
        <>
          <i className="atm-fog" style={{ top: '30%' }} />
          <i className="atm-fog" style={{ top: '65%', animationDirection: 'reverse' }} />
          <i className="atm-rune" />
        </>
      )}
    </div>
  );
}
