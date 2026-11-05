import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import { DEFAULT_STUDIO, studioThemeSchema, type Server, type StudioTheme } from '@aldetes/shared';
import { usePrefs } from '@/lib/prefs';
import { BANNERS, BannerVideo, isVideoUrl } from '../profile/Cosmetics';
import { useOffscreenPause } from '@/lib/perf';

/** The published theme of a server (defaults when there is none or it doesn't validate). */
export function themeOf(server: Pick<Server, 'studio'> | null | undefined): StudioTheme {
  if (!server?.studio) return DEFAULT_STUDIO;
  const r = studioThemeSchema.safeParse(server.studio);
  return r.success ? r.data : DEFAULT_STUDIO;
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
  const scene = theme.scene ? BANNERS[theme.scene] : undefined;
  const video = isVideoUrl(server.bannerUrl);
  const accent = theme.accent;
  const style: CSSProperties = server.bannerUrl && !scene && !video ? { background: `${POS[theme.bannerPosition]}/cover url(${server.bannerUrl})` } : {};
  return (
    <div ref={pause} className={clsx('absolute inset-0 overflow-hidden', className, !effects && 'studio-static')} style={style}>
      {scene ? (
        scene.render()
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
      {theme.texture !== 'none' && <div className={`studio-tex studio-tex-${theme.texture}`} aria-hidden />}
      {fade && <div className={clsx('absolute inset-0 bg-gradient-to-b', LIGHT[theme.lighting])} />}
      {children}
    </div>
  );
}

/** Frame around a server icon (Signature). */
export function IconFrame({ frame, accent, children }: { frame: StudioTheme['iconFrame']; accent: string | null; children: ReactNode }) {
  if (frame === 'none') return <>{children}</>;
  return (
    <span className={`studio-frame studio-frame-${frame}`} style={{ '--sa': accent ?? 'rgb(var(--brand))' } as CSSProperties}>
      {children}
    </span>
  );
}
