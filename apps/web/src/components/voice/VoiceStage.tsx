import { useShallow } from 'zustand/react/shallow';
import { useEffect, useLayoutEffect, useRef, useState, lazy, Suspense } from 'react';
import { useTogether, watchTogether } from '@/lib/together';
const TogetherPanel = lazy(() => import('../together/TogetherPanel'));
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import clsx from 'clsx';
import type { Participant, VideoTrack } from 'livekit-client';
import { Track } from '@/lib/lk';
import { useStore, displayName } from '@/store';
import { listTiles, useVoice, toggleCamera, toggleMute, toggleDeaf, leaveVoice, stopScreenShare, stopScreenAudio, switchCamera, setWatching, setStreamVolume, focusStream, setStageLayout, setVideoPaused, canShareScreen, setTileFit, setViewQuality, streamHasLayers, participantVersion, getRoom, SERVER_UPLINK_MBPS, type Tile } from '@/lib/voice';
import { diagnoseViewer, diagnoseOwn } from '@/lib/streamDiag';
import { spring, dur } from '@/lib/motion';
import { usePrefs, setPrefs, getPrefs } from '@/lib/prefs';
import { LiveAvatar, ReactionPicker } from './LiveAvatar';
import { useMedia, SHORT, useIsMobile } from '@/lib/mobile';
import { SpacesView } from '../spaces/SpacesView';
import { openSpaceEditor } from '../spaces/SpaceEditor';
import { Segmented } from '../settings/SettingsLayout';
import { Avatar } from '../common/Avatar';
import { Icon } from '../common/Icon';
import { Tooltip, useContextMenu, Modal, toast } from '../common/overlay';
import { QualityBars } from './VoicePanel';
import { ScreenShareModal } from './ScreenShareModal';
import { useMemberMenu } from '../common/UserPopout';

export function VideoEl({ participant, source, contain, mirror }: { participant: Participant; source: Track.Source; contain?: boolean; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const pub = participant.getTrackPublication(source);
  const track = pub?.track as VideoTrack | undefined;
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  if (!track || pub?.isMuted) return null;
  return <video ref={ref} autoPlay playsInline muted className={clsx('absolute inset-0 h-full w-full bg-black', contain ? 'object-contain' : 'object-cover', mirror && '-scale-x-100')} />;
}

function TileView({ tile, serverId, big, onClick }: { tile: Tile; serverId: string | null; big?: boolean; onClick: () => void }) {
  const speaking = useVoice((v) => !!v.speaking[tile.identity]);
  const quality = useVoice((v) => v.quality[tile.identity]);
  const vs = useStore((s) => s.voiceStates[tile.identity]);
  const ref = useRef<HTMLDivElement>(null);
  const menu = useContextMenu();
  const items = useMemberMenu(tile.identity, serverId);
  const isScreen = tile.source === Track.Source.ScreenShare;
  const fitChoice = useVoice((v) => v.fit[tile.key]);
  const hasVideo = !!tile.participant.getTrackPublication(tile.source)?.track && !tile.participant.getTrackPublication(tile.source)?.isMuted;
  return (
    <div
      ref={ref}
      onClick={onClick}
      onDoubleClick={() => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen())}
      title={big ? 'Duplo clique: tela cheia (Esc para sair)' : 'Clique para destacar'}
      onContextMenu={(e) => !tile.isLocal && menu(e, items())}
      className={clsx(
        'group relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border bg-black transition-[box-shadow,border-color] duration-200',
        speaking && !isScreen ? 'border-ok/70 shadow-[0_0_0_2px_rgb(var(--ok)),0_0_32px_-6px_rgb(var(--ok)/0.7)]' : 'border-line/[0.06]',
      )}
    >
      {hasVideo ? (
        <VideoEl participant={tile.participant} source={tile.source} contain={isScreen && fitChoice !== 'cover'} mirror={tile.isLocal && !isScreen} />
      ) : isScreen && !tile.isLocal ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">AO VIVO</span>
          <div className="text-sm text-fg-muted">{displayName(tile.identity, serverId)} está transmitindo</div>
          <button
            className="btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              focusStream(tile.identity);
            }}
          >
            <Icon name="screen" size={16} /> Assistir
          </button>
        </div>
      ) : (
        <span className={clsx('rounded-full', speaking && 'speaking')}>
          <Avatar userId={tile.identity} size={big ? 96 : 72} />
        </span>
      )}
      <div className="absolute bottom-2.5 left-2.5 flex max-w-[80%] items-center gap-1.5 rounded-lg bg-black/65 px-2.5 py-1 text-[13px] font-semibold text-white">
        {isScreen && <Icon name="screen" size={14} />}
        <span className="truncate">
          {displayName(tile.identity, serverId)}
          {isScreen ? ' (tela)' : ''}
        </span>
        {!isScreen && (vs?.selfMute || vs?.serverMute) && <Icon name="micOff" size={14} className="text-danger" />}
        {!isScreen && (vs?.selfDeaf || vs?.serverDeaf) && <Icon name="headphonesOff" size={14} className="text-danger" />}
      </div>
      {isScreen && <span className="absolute left-2 top-2 rounded bg-danger px-1.5 text-[11px] font-bold text-white">AO VIVO</span>}
      <QualityBars q={quality} className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100" />
      {isScreen && hasVideo && (tile.isLocal ? <OwnStreamBar /> : big && <ViewerStreamBar tile={tile} tileRef={ref} />)}
    </div>
  );
}

/** Real received quality, measured from the video element (frames actually presented). */
function useVideoStats(tileRef: React.RefObject<HTMLDivElement | null>) {
  const [stats, setStats] = useState<{ w: number; h: number; fps: number } | null>(null);
  useEffect(() => {
    let frames = 0;
    let handle = 0;
    let stopped = false;
    const video = () => tileRef.current?.querySelector('video') as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }) | null;
    const onFrame = () => {
      frames++;
      const v = video();
      if (!stopped && v?.requestVideoFrameCallback) handle = v.requestVideoFrameCallback(onFrame);
    };
    const start = () => {
      const v = video();
      if (v?.requestVideoFrameCallback) handle = v.requestVideoFrameCallback(onFrame);
    };
    start();
    const t = setInterval(() => {
      const v = video();
      if (v) setStats({ w: v.videoWidth, h: v.videoHeight, fps: frames });
      frames = 0;
      if (!handle) start();
    }, 1000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [tileRef]);
  return stats;
}

function ViewerStreamBar({ tile, tileRef }: { tile: Tile; tileRef: React.RefObject<HTMLDivElement | null> }) {
  const stats = useVideoStats(tileRef);
  const hasAudio = !!tile.participant.getTrackPublication(Track.Source.ScreenShareAudio);
  const [vol, setVol] = useState(100);
  const fit = useVoice((v) => v.fit[tile.key] ?? 'contain');
  const vq = useVoice((v) => v.viewQuality[tile.identity] ?? 'auto');
  const layers = streamHasLayers(tile.identity);
  const oldApp = useOldApp(tile.identity);
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="absolute inset-x-3 bottom-3 flex translate-y-2 items-center gap-2 rounded-2xl border border-white/10 bg-black/75 px-3 py-2 text-white opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
    >
      <span className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-bold tabular-nums">{stats && stats.h ? `${stats.h}p · ${stats.fps} FPS` : 'medindo…'}</span>
      {hasAudio && (
        <label className="flex items-center gap-2 text-xs text-white/70">
          <Icon name={vol === 0 ? 'volumeOff' : 'volume'} size={15} />
          <input
            type="range"
            min={0}
            max={200}
            value={vol}
            className="w-24 accent-[rgb(var(--brand))]"
            onChange={(e) => {
              setVol(+e.target.value);
              setStreamVolume(tile.identity, +e.target.value / 100);
            }}
          />
        </label>
      )}
      <span className="flex-1" />
      {oldApp && (
        <span className="rounded-lg bg-warn/20 px-2 py-1 text-[11px] font-bold text-warn" title="O app de quem transmite é antigo: peça para fechar pelo ícone perto do relógio (Sair) e abrir de novo.">
          App de quem transmite desatualizado
        </span>
      )}
      {layers && (
        <span className="flex overflow-hidden rounded-lg bg-white/10 text-[11px] font-semibold" role="group" aria-label="Qualidade que você recebe">
          {(['auto', 'max', 'low'] as const).map((q) => (
            <button key={q} className={clsx('px-2 py-1', vq === q ? 'bg-white text-black' : 'hover:bg-white/15')} onClick={() => setViewQuality(tile.identity, q)} aria-pressed={vq === q} title={q === 'max' ? 'Sempre a melhor versão, mesmo em tela pequena' : q === 'low' ? 'Versão leve (economiza internet)' : 'A melhor que a sua internet aguenta'}>
              {q === 'auto' ? 'Auto' : q === 'max' ? 'Máxima' : 'Leve'}
            </button>
          ))}
        </span>
      )}
      <DiagButton run={() => diagnoseViewer(tile.identity)} />
      <button className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10" title={fit === 'cover' ? 'Mostrar a tela inteira' : 'Preencher o espaço'} aria-label="Enquadramento" onClick={() => setTileFit(tile.key, fit === 'cover' ? 'contain' : 'cover')}>
        <Icon name={fit === 'cover' ? 'focus' : 'expand'} size={16} />
      </button>
      {'pictureInPictureEnabled' in document && (
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10"
          title="Janela flutuante (fica por cima de tudo)"
          aria-label="Janela flutuante"
          onClick={() => {
            const v = tileRef.current?.querySelector('video') as HTMLVideoElement | null;
            if (document.pictureInPictureElement) void document.exitPictureInPicture();
            else void v?.requestPictureInPicture().catch(() => {});
          }}
        >
          <Icon name="pip" size={16} />
        </button>
      )}
      <button className="rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-white/10" onClick={() => setWatching(tile.identity, false)} title="Para de receber o vídeo (economiza internet)">
        Parar de assistir
      </button>
      <button className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10" title="Tela cheia (Esc para sair)" aria-label="Tela cheia" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : tileRef.current?.requestFullscreen())}>
        <Icon name="maximize" size={16} />
      </button>
    </div>
  );
}

function OwnStreamBar() {
  const since = useVoice((v) => v.screenSince);
  const info = useVoice((v) => v.screenInfo);
  const st = useVoice((v) => v.screenStats);
  const guard = useVoice((v) => v.screenAudioGuard);
  const [now, setNow] = useState(Date.now());
  const [change, setChange] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = since ? Math.floor((now - since) / 1000) : 0;
  const low = !!st && st.fps > 0 && st.fps < st.targetFps * 0.85;
  const viewers = useVoice((v) => (v.version, getRoom()?.remoteParticipants.size ?? 0));
  const serverLoad = st ? st.mbps * viewers : 0;
  const capLimited = !!st && st.sourceFps > 0 && st.sourceFps < st.targetFps * 0.85; // the screen/monitor gives fewer frames
  const advice =
    st && capLimited && st.targetFps > 60
      ? `A captura entrega ${st.sourceFps} FPS: o monitor provavelmente é de ${st.sourceFps < 70 ? '60' : st.sourceFps < 110 ? '75–100' : 'menos de 120'} Hz. Para 120 FPS, o monitor precisa ser de 120 Hz ou mais.`
      : serverLoad > SERVER_UPLINK_MBPS * 0.85
        ? `≈ ${Math.round(serverLoad)} Mbps saindo do servidor (limite ~${SERVER_UPLINK_MBPS}). Com ${viewers} pessoas, baixe para 1080p 60 ou 720p para não travar.`
        : st && low && st.limit === 'cpu'
      ? st.hardware === false
        ? 'O processador está no limite. Use "Jogos e vídeos" (codifica na placa de vídeo) ou baixe para 720p.'
        : 'O PC está no limite. Feche programas pesados ou baixe a resolução.'
      : st && low && st.limit === 'bandwidth'
        ? 'Sua internet de upload não está dando conta. Baixe a qualidade ou feche downloads.'
        : null;
  return (
    <div onClick={(e) => e.stopPropagation()} className="absolute inset-x-3 top-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 rounded-2xl border border-danger/30 bg-black/75 px-3 py-2 text-white">
        <span className="rec-dot h-2 w-2 rounded-full bg-danger" />
        <span className="text-[13px] font-bold">Você está ao vivo</span>
        <span className="text-xs tabular-nums text-white/60">
          {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
          {st && st.height ? ` · ${st.height}p · ` : info ? ` · ${info}` : ''}
          {st && st.height ? <b className={low ? 'text-warn' : 'text-ok'}>{st.fps} FPS</b> : null}
          {st && st.mbps > 0 ? ` · ${st.mbps.toLocaleString('pt-BR')} Mbps` : ''}
        </span>
        {st && st.hardware !== null && (
          <span className="hidden rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/70 sm:inline" title={st.encoder ?? undefined}>
            {st.codec ?? ''} · {st.hardware ? 'GPU' : 'CPU'}
          </span>
        )}
        {viewers > 0 && st && st.mbps > 0 && (
          <span className="hidden text-[11px] tabular-nums text-white/50 md:inline" title="Cada pessoa recebe a própria cópia: é isso que sai do servidor">
            {viewers} {viewers === 1 ? 'pessoa' : 'pessoas'} · ≈{Math.round(serverLoad)} Mbps do servidor
          </span>
        )}
        <span className="flex-1" />
        <DiagButton run={diagnoseOwn} />
        <button className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20" onClick={() => setChange(true)}>
          Trocar tela
        </button>
        <button className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold hover:bg-danger/85" onClick={() => void stopScreenShare()}>
          Parar
        </button>
      </div>
      {advice && <div className="self-start rounded-xl border border-warn/30 bg-black/80 px-3 py-1.5 text-xs text-warn">{advice}</div>}
      {(guard === 'ducking' || guard === 'echo-detected') && (
        <div className="flex items-center gap-2 self-start rounded-xl border border-ok/30 bg-black/80 px-3 py-1.5 text-xs text-white/85" data-testid="echo-guard">
          {guard === 'echo-detected' ? 'Eco detectado no som do PC: ' : 'Proteção contra eco ativa: '}o som do PC abaixa enquanto alguém da call fala, para ninguém se ouvir de volta.
          <button className="rounded-md bg-white/10 px-2 py-0.5 font-semibold text-white hover:bg-white/20" onClick={() => void stopScreenAudio()}>
            Tirar o som
          </button>
        </div>
      )}
      {change && <ScreenShareModal onClose={() => setChange(false)} />}
    </div>
  );
}

type Rect = { x: number; y: number; w: number; h: number };
const GAP = 10;

/** Biggest 16:9 mosaic that fits (n tiles), centered; last row centered too. */
function gridRects(n: number, W: number, H: number): Rect[] {
  let best = { cols: 1, w: 0, h: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const w = Math.min((W - (cols - 1) * GAP) / cols, ((H - (rows - 1) * GAP) / rows) * (16 / 9));
    if (w > best.w) best = { cols, w, h: (w * 9) / 16 };
  }
  const rows = Math.ceil(n / best.cols);
  const top = (H - (rows * best.h + (rows - 1) * GAP)) / 2;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / best.cols);
    const inRow = r === rows - 1 ? n - r * best.cols : best.cols;
    const left = (W - (inRow * best.w + (inRow - 1) * GAP)) / 2;
    return { x: left + (i % best.cols) * (best.w + GAP), y: top + r * (best.h + GAP), w: best.w, h: best.h };
  });
}

/** One big tile on top + thumbnail row below (thumbnails shrink to fit, never overflow). */
function focusRects(n: number, W: number, H: number): Rect[] {
  if (n === 1) return [{ x: 0, y: 0, w: W, h: H }];
  const t = n - 1;
  let th = Math.min(112, Math.max(64, H * 0.18));
  let tw = (th * 16) / 9;
  if (t * tw + (t - 1) * GAP > W) {
    tw = (W - (t - 1) * GAP) / t;
    th = (tw * 9) / 16;
  }
  const mainH = H - th - GAP;
  const left = (W - (t * tw + (t - 1) * GAP)) / 2;
  return [{ x: 0, y: 0, w: W, h: mainH }, ...Array.from({ length: t }, (_, i) => ({ x: left + i * (tw + GAP), y: mainH + GAP, w: tw, h: th }))];
}

/** Measures an element that may mount later (callback ref → re-subscribes when it appears). */
const EMPTY_MV = { rects: {}, pinned: [] as string[], minimized: [] as string[] };
function mvOf(meId: string) {
  return getPrefs().multiview[meId] ?? EMPTY_MV;
}
function saveMv(meId: string, patch: Partial<typeof EMPTY_MV & { rects: Record<string, Rect> }>) {
  const all = getPrefs().multiview;
  setPrefs({ multiview: { ...all, [meId]: { ...mvOf(meId), ...patch } } });
}
function toggleMinimized(meId: string, t: Tile) {
  const cur = mvOf(meId).minimized;
  const on = !cur.includes(t.key);
  saveMv(meId, { minimized: on ? [...cur, t.key] : cur.filter((k) => k !== t.key) });
  // remote screen: pause only its VIDEO while minimized (audio keeps playing); restore resumes it
  if (t.source === Track.Source.ScreenShare && !t.isLocal) setVideoPaused(t.identity, on);
}

/**
 * MultiView tile tools: pin, minimize and — in the "Livre" layout — drag (grip) and resize (corner) with snapping to
 * a 2.5% grid and the stage edges (hold Alt for free placement). The tile itself (and its <video>) never remounts:
 * only the wrapper's transform/size change; the place is saved as fractions of the stage, per user.
 */
function TileTools({ tile, pinned, meId, free, rect, W, H, onLive }: { tile: Tile; pinned: boolean; meId: string; free: boolean; rect: Rect; W: number; H: number; onLive: (r: Rect | null) => void }) {
  const start = useRef<{ x: number; y: number; r: Rect; kind: 'move' | 'size' } | null>(null);
  const snap = (v: number, total: number, alt: boolean) => (alt ? v : Math.round(v / (total * 0.025)) * (total * 0.025));
  const clampR = (r: Rect): Rect => {
    const w = Math.min(W, Math.max(200, r.w));
    const h = Math.min(H, Math.max(120, r.h));
    return { w, h, x: Math.min(W - w, Math.max(0, r.x)), y: Math.min(H - h, Math.max(0, r.y)) };
  };
  const down = (kind: 'move' | 'size') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, r: rect, kind };
  };
  const calc = (e: React.PointerEvent) => {
    const st = start.current!;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    const r = st.kind === 'move' ? { ...st.r, x: snap(st.r.x + dx, W, e.altKey), y: snap(st.r.y + dy, H, e.altKey) } : { ...st.r, w: snap(st.r.w + dx, W, e.altKey), h: snap(st.r.h + dy, H, e.altKey) };
    return clampR(r);
  };
  const move = (e: React.PointerEvent) => start.current && onLive(calc(e));
  const up = (e: React.PointerEvent) => {
    if (!start.current) return;
    const r = calc(e);
    start.current = null;
    onLive(null);
    saveMv(meId, { rects: { ...mvOf(meId).rects, [tile.key]: { x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H } } });
  };
  const btn = 'flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white hover:bg-black/90';
  return (
    <>
      <div className="absolute right-2 top-9 z-10 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/mv:opacity-100" onClick={(e) => e.stopPropagation()}>
        <button className={clsx(btn, pinned && 'bg-brand/80')} aria-pressed={pinned} aria-label={pinned ? 'Desafixar' : 'Fixar no começo'} title={pinned ? 'Desafixar' : 'Fixar no começo'} onClick={() => saveMv(meId, { pinned: pinned ? mvOf(meId).pinned.filter((k) => k !== tile.key) : [...mvOf(meId).pinned, tile.key] })}>
          <Icon name="pin" size={13} />
        </button>
        <button className={btn} aria-label="Minimizar" title="Minimizar (o vídeo pausa, o som continua)" onClick={() => toggleMinimized(meId, tile)}>
          <Icon name="arrowDown" size={13} />
        </button>
        {free && (
          <button className={btn} aria-label="Restaurar posição" title="Voltar ao lugar automático" onClick={() => { const rr = { ...mvOf(meId).rects }; delete rr[tile.key]; saveMv(meId, { rects: rr }); }}>
            <Icon name="grid" size={13} />
          </button>
        )}
      </div>
      {free && (
        <>
          <span role="separator" aria-label="Arrastar a tela" title="Arraste para mover (Alt: sem ímã)" onPointerDown={down('move')} onPointerMove={move} onPointerUp={up} onClick={(e) => e.stopPropagation()} className="absolute left-1/2 top-1.5 z-10 flex h-5 w-14 -translate-x-1/2 cursor-grab items-center justify-center rounded-full bg-black/70 text-white/70 opacity-0 transition-opacity active:cursor-grabbing group-hover/mv:opacity-100">
            <Icon name="grip" size={14} className="rotate-90" />
          </span>
          <span role="separator" aria-label="Redimensionar a tela" title="Arraste para mudar o tamanho" onPointerDown={down('size')} onPointerMove={move} onPointerUp={up} onClick={(e) => e.stopPropagation()} className="absolute bottom-1 right-1 z-10 h-5 w-5 cursor-nwse-resize rounded-br-xl border-b-2 border-r-2 border-white/70 opacity-0 transition-opacity group-hover/mv:opacity-100" />
        </>
      )}
    </>
  );
}

function useSize() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size] as const;
}

/**
 * The call page as ONE stage: video you chose to watch → who is talking → call controls → the rest.
 * - Media (screens + cameras) share a single absolutely-positioned container keyed by track, so switching
 *   Foco ↔ Grade or changing the focused stream only moves tiles (one coordinated spring) — the <video>
 *   elements are never remounted, so nothing goes black or restarts.
 * - No video at all → big live-avatar grid instead of an empty rectangle.
 */
export function VoiceStage({ channelId, compact }: { channelId: string; compact?: boolean }) {
  useVoice((v) => v.version); // re-render on track changes
  const focused = useVoice((v) => v.focused);
  const layout = useVoice((v) => v.stageLayout);
  const serverId = useStore((s) => s.channels[channelId]?.serverId ?? null);
  const all = listTiles();
  const isVid = (t: Tile) => {
    const pub = t.participant.getTrackPublication(t.source);
    return t.source === Track.Source.ScreenShare ? !!pub && !pub.isMuted : !!pub?.track && !pub.isMuted;
  };
  // screens first (streams are what people came to see), then cameras
  const media = all.filter(isVid).sort((a, b) => Number(b.source === Track.Source.ScreenShare) - Number(a.source === Track.Source.ScreenShare));
  const people = [...new Set(all.map((t) => t.identity))];
  const setFocus = (k: string | null) => useVoice.setState({ focused: k });

  // auto-focus the first remote screen share that appears (doesn't steal focus once chosen)
  const firstScreen = media.find((t) => t.source === Track.Source.ScreenShare && !t.isLocal)?.key;
  const prevScreen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (firstScreen && firstScreen !== prevScreen.current && !useVoice.getState().focused) setFocus(firstScreen);
    prevScreen.current = firstScreen;
  }, [firstScreen]);

  const [box, { w: W, h: H }] = useSize();
  // 2.0 MultiView: pinned first, minimized out of the stage (their video is paused, audio keeps playing)
  const meIdMv = useStore((s) => s.me?.id ?? '');
  const mv = usePrefs((p) => p.multiview[meIdMv]) ?? EMPTY_MV;
  const mobileMv = useIsMobile();
  const visible = media.filter((t) => !mv.minimized.includes(t.key));
  const minimized = media.filter((t) => mv.minimized.includes(t.key));
  const byPin = [...visible].sort((a, b) => Number(mv.pinned.includes(b.key)) - Number(mv.pinned.includes(a.key)));
  const focusKey = visible.find((t) => t.key === focused)?.key ?? byPin[0]?.key;
  const mode = visible.length <= 1 ? 'focus' : layout === 'free' && mobileMv ? 'grid' : layout;
  const ordered = mode === 'focus' && focusKey ? [visible.find((t) => t.key === focusKey)!, ...byPin.filter((t) => t.key !== focusKey)] : byPin;
  const [live, setLive] = useState<{ key: string; r: Rect } | null>(null);
  const base = W && H && ordered.length ? (mode === 'focus' ? focusRects(ordered.length, W, H) : gridRects(ordered.length, W, H)) : [];
  const rects =
    mode === 'free' && W && H
      ? ordered.map((t, i) => {
          if (live?.key === t.key) return live.r;
          const f = mv.rects[t.key];
          return f ? { x: f.x * W, y: f.y * H, w: f.w * W, h: f.h * H } : base[i]!;
        })
      : base;
  const rectOf = new Map(ordered.map((t, i) => [t.key, rects[i]]));
  const voiceOnly = media.length === 0;
  const heavy = visible.filter((t) => t.source === Track.Source.ScreenShare && !t.isLocal).length >= 3;
  const short = useMedia(SHORT); // phone in landscape: video gets the whole height
  // touch: swipe left/right on the stage to move the focus to the next/previous video
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onTouchEnd = (e: React.PointerEvent) => {
    const s0 = swipe.current;
    swipe.current = null;
    if (!s0 || media.length < 2) return;
    const dx = e.clientX - s0.x;
    if (Math.abs(dx) < 60 || Math.abs(e.clientY - s0.y) > 50) return;
    const i = media.findIndex((t) => t.key === focusKey);
    const next = media[(i + (dx < 0 ? 1 : -1) + media.length) % media.length]!;
    setFocus(next.key);
    setStageLayout('focus');
  };
  // 2.0 Spaces: a pure VIEW switch (desktop). The room, tracks and the media stage below are untouched by it.
  const mobileNow = useIsMobile();
  const meId = useStore((s) => s.me?.id);
  const viewKey = `${meId}:${channelId}`;
  const view = usePrefs((p) => (mobileNow ? 'classic' : (p.callView[viewKey] ?? 'classic')));
  const setView = (v: 'classic' | 'spaces') => setPrefs({ callView: { ...getPrefs().callView, [viewKey]: v } });
  const [spaceFocus, setSpaceFocus] = useState<string | null>(null);
  // 2.0 Together: lazy panel; follows only the call you are in
  const [together, setTogether] = useState(false);
  const [togetherFull, setTogetherFull] = useState(false);
  const openTools = useTogether((t) => (t.byChannel[channelId] ?? []).filter((x) => !x.closedAt).length);
  useEffect(() => {
    if (mobileNow) return;
    watchTogether(channelId);
    return () => watchTogether(null);
  }, [channelId, mobileNow]);
  const spaces = view === 'spaces';

  return (
    <LayoutGroup id={`call-${channelId}`}>
    <div className={clsx('flex min-h-0 flex-1 flex-col', compact && 'h-[48vh] flex-none border-b border-line/[0.06] bg-black/30')} data-call-view={view}>
      {!mobileNow && (
        <div className="flex shrink-0 items-center gap-2 px-3 pt-3">
          <Segmented id={`call-view-${channelId}`} value={view} onChange={setView} options={[['classic', 'Clássico'], ['spaces', 'Spaces']]} />
          {spaces && (
            <button className="btn-ghost h-8 px-2.5 text-xs" onClick={openSpaceEditor}>
              <Icon name="edit" size={13} /> Meu cantinho
            </button>
          )}
          <span className="flex-1" />
          <button className={clsx('flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition-colors', together ? 'border-brand/40 bg-brand/15 text-fg-strong' : 'border-line/[0.08] text-fg-muted hover:text-fg-strong')} onClick={() => setTogether(!together)} aria-pressed={together} title="Enquetes, cronômetro, notas e quadro com quem está na call">
            <Icon name="users" size={14} /> Together{openTools > 0 ? ` · ${openTools}` : ''}
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
      {!(together && togetherFull) && (
      <motion.div layout transition={spring.stage} className={clsx('flex min-h-0 min-w-0 flex-1 gap-3 p-3', compact ? 'flex-col' : spaces ? 'flex-col' : 'flex-col xl:flex-row')}>
        {voiceOnly ? (
          spaces ? <SpacesView people={people} serverId={serverId} focus={spaceFocus} onFocus={setSpaceFocus} /> : <VoiceGrid people={people} serverId={serverId} />
        ) : (
          <div className="relative min-h-0 min-w-0 flex-1 touch-pan-y" onPointerDown={onTouchStart} onPointerUp={onTouchEnd}>
            {(media.length >= 2 || minimized.length > 0) && (
              <div className="absolute left-1 right-1 top-1 z-20 flex items-center gap-2">
                {minimized.length > 0 && (
                  <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto" aria-label="Telas minimizadas">
                    {minimized.map((t) => (
                      <button key={t.key} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line/[0.1] bg-bg-float px-2 py-1 text-[12px] font-semibold text-fg hover:border-brand/40" onClick={() => toggleMinimized(meIdMv, t)} title="Voltar para o palco">
                        <Icon name={t.source === Track.Source.ScreenShare ? 'screen' : 'camera'} size={13} /> {displayName(t.identity, serverId)}
                      </button>
                    ))}
                  </div>
                )}
                <span className="flex-1" />
                {heavy && <span className="hidden rounded-lg bg-warn/15 px-2 py-1 text-[11px] font-semibold text-warn md:inline" title="Com 3 ou mais transmissões, cada tela pequena recebe uma versão proporcional ao tamanho dela. Minimize as que não está vendo para economizar ainda mais.">3+ telas: qualidade proporcional ao tamanho</span>}
                {media.length >= 2 && (
                  <Segmented
                    id={`stage-layout-${channelId}`}
                    value={mode === 'focus' && layout !== 'focus' ? layout : mode}
                    onChange={(l) => setStageLayout(l)}
                    options={mobileMv ? [['focus', 'Foco'], ['grid', 'Grade']] : [['focus', 'Foco'], ['grid', 'Grade'], ['free', 'Livre']]}
                  />
                )}
              </div>
            )}
            <div ref={box} className={clsx('absolute inset-0', (media.length >= 2 || minimized.length > 0) && 'top-11')}>
              <AnimatePresence initial={false}>
                {ordered.map((t) => {
                  const r = rectOf.get(t.key);
                  if (!r) return null;
                  const isFocus = mode === 'focus' && t.key === focusKey;
                  const dragging = live?.key === t.key;
                  return (
                    <motion.div
                      key={t.key}
                      initial={{ x: r.x, y: r.y + 24, width: r.w, height: r.h, opacity: 0, scale: 0.9 }}
                      animate={{ x: r.x, y: r.y, width: r.w, height: r.h, opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92, transition: { duration: dur.short } }}
                      transition={dragging ? { duration: 0 } : spring.stage}
                      className="group/mv absolute left-0 top-0"
                      style={{ zIndex: dragging ? 5 : isFocus ? 1 : 2 }}
                      data-tile={t.key}
                    >
                      <TileView tile={t} serverId={serverId} big={isFocus || (mode !== 'focus' && r.w > 380)} onClick={() => (mode === 'grid' ? (setFocus(t.key), setStageLayout('focus')) : mode === 'focus' ? setFocus(t.key) : undefined)} />
                      {media.length >= 2 && !mobileMv && (
                        <TileTools tile={t} pinned={mv.pinned.includes(t.key)} meId={meIdMv} free={mode === 'free'} rect={r} W={W} H={H} onLive={(nr) => setLive(nr ? { key: t.key, r: nr } : null)} />
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            <StreamReactions />
          </div>
        )}
        {!voiceOnly && !short && (spaces ? <SpacesView people={people} serverId={serverId} strip focus={null} onFocus={() => {}} /> : <PeopleStrip people={people} serverId={serverId} vertical={!compact} />)}
      </motion.div>
      )}
      <AnimatePresence initial={false}>
        {together && !mobileNow && (
          <motion.aside
            key="together"
            layout
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24, transition: { duration: dur.short } }}
            transition={spring.stage}
            className={clsx('min-h-0 shrink-0 py-3 pr-3', togetherFull ? 'flex-1 pl-3' : 'w-[380px]')}
          >
            <Suspense fallback={<div className="h-full animate-pulse rounded-2xl bg-line/[0.04]" />}>
              <TogetherPanel channelId={channelId} serverId={serverId} expanded={togetherFull} onExpand={() => setTogetherFull((f) => !f)} onClose={() => (setTogether(false), setTogetherFull(false))} />
            </Suspense>
          </motion.aside>
        )}
      </AnimatePresence>
      </div>
      <CallDock />
    </div>
    </LayoutGroup>
  );
}

/** Voice-only call: large, legible people with live voice rings (no empty video rectangle). */
/** True during the first moments after mount: people enter in a short stagger, later changes animate alone. */
function useEntering(ms = 900) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return on;
}

function VoiceGrid({ people, serverId }: { people: string[]; serverId: string | null }) {
  const big = people.length <= 4 ? 112 : people.length <= 9 ? 88 : 64;
  const entering = useEntering();
  return (
    <div className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-x-8 gap-y-6 overflow-y-auto p-4">
      <AnimatePresence initial={false}>
        {people.map((id, i) => (
          <motion.div key={id} layout initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ ...spring.stage, delay: entering ? Math.min(i, 10) * 0.05 : 0 }} className="flex w-[150px] flex-col items-center gap-3">
            <PersonMenu id={id} serverId={serverId}>
              <motion.span layoutId={`person-${id}`} transition={spring.stage} className="inline-flex">
                <LiveAvatar identity={id} size={big} />
              </motion.span>
            </PersonMenu>
            <span className="max-w-full truncate text-sm font-semibold text-fg-strong">{displayName(id, serverId)}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function PersonMenu({ id, serverId, children }: { id: string; serverId: string | null; children: React.ReactNode }) {
  const menu = useContextMenu();
  const items = useMemberMenu(id, serverId);
  const isMe = useStore((s) => s.me?.id === id);
  return <span onContextMenu={(e) => !isMe && menu(e, items())}>{children}</span>;
}

/** Participants next to the stage: constant size, who talks, mute, camera, live — scrolls when many. */
function PeopleStrip({ people: all, serverId, vertical }: { people: string[]; serverId: string | null; vertical: boolean }) {
  const [q, setQ] = useState('');
  const entering = useEntering();
  const people = q ? all.filter((id) => displayName(id, serverId).toLowerCase().includes(q.toLowerCase())) : all;
  return (
    <aside
      aria-label="Na chamada"
      className={clsx(
        'scroll-thin shrink-0 overflow-auto rounded-2xl border border-line/[0.06] bg-bg-side/60 p-2',
        vertical ? 'flex max-h-full gap-1.5 xl:w-56 xl:flex-col max-xl:h-[84px]' : 'flex h-[84px] gap-1.5',
      )}
    >
      <div className={clsx('eyebrow shrink-0 px-1.5 pt-1', vertical ? 'hidden xl:block' : 'hidden')}>Na chamada · {all.length}</div>
      {all.length > 8 && (
        <input
          className={clsx('input h-8 shrink-0 px-2.5 py-1 text-xs', vertical ? 'hidden xl:block' : 'hidden')}
          placeholder="Buscar na call…"
          aria-label="Buscar pessoas na call"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <AnimatePresence initial={false}>
        {people.map((id, i) => (
          <motion.div
            key={id}
            layout
            initial={{ opacity: 0, scale: 0.9, x: 8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ ...spring.stage, delay: entering ? Math.min(i, 10) * 0.04 : 0 }}
            className={clsx('flex shrink-0 items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-line/[0.05]', vertical ? 'xl:w-full max-xl:flex-col max-xl:justify-center max-xl:gap-1 max-xl:px-3' : 'flex-col justify-center gap-1 px-3')}
          >
            <PersonMenu id={id} serverId={serverId}>
              <LiveAvatar identity={id} size={36} />
            </PersonMenu>
            <PersonLabel id={id} serverId={serverId} vertical={vertical} />
          </motion.div>
        ))}
      </AnimatePresence>
    </aside>
  );
}

function PersonLabel({ id, serverId, vertical }: { id: string; serverId: string | null; vertical: boolean }) {
  const vs = useStore((s) => s.voiceStates[id]);
  const old = useOldApp(id);
  return (
    <span className={clsx('min-w-0 leading-tight', vertical ? 'xl:flex-1 max-xl:max-w-[72px] max-xl:text-center' : 'max-w-[72px] text-center')}>
      <span className="block truncate text-[12.5px] font-semibold text-fg-strong">{displayName(id, serverId)}</span>
      <span className={clsx('truncate text-[10.5px] text-fg-muted', vertical ? 'hidden xl:flex xl:items-center xl:gap-1' : 'hidden')}>
        {old ? <b className="text-warn" title="App antigo: peça para sair pelo ícone perto do relógio e abrir de novo">app desatualizado</b> : vs?.streaming ? <b className="text-danger">transmitindo</b> : vs?.video ? 'câmera ligada' : vs?.selfDeaf || vs?.serverDeaf ? 'sem áudio' : vs?.selfMute || vs?.serverMute ? 'mutado' : 'na voz'}
      </span>
    </span>
  );
}

/** Reactions shown on the periphery of the stage while a stream is on screen (viewer can turn it off). */
function StreamReactions() {
  const list = useVoice((v) => v.reactions);
  const on = usePrefs((p) => p.reactionsOverStreams);
  const serverId = null;
  if (!on) return null;
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col-reverse gap-1.5" aria-live="polite">
      <AnimatePresence initial={false}>
        {list.slice(-4).map((r) => (
          <motion.div
            key={r.id}
            layout
            initial={{ opacity: 0, x: -16, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, transition: { duration: dur.short } }}
            transition={spring.snappy}
            className="flex items-center gap-1.5 rounded-full bg-black/70 py-0.5 pl-0.5 pr-2.5 text-xs font-semibold text-white"
          >
            <Avatar userId={r.from} size={20} />
            <span className="max-w-[100px] truncate">{displayName(r.from, serverId)}</span>
            <span className="text-base leading-none">{r.emoji}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Spinner() {
  return <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-current" style={{ animation: 'cz-spin 0.7s linear infinite' }} aria-hidden />;
}

/** Fixed dock: camera, screen, mic, audio, reactions — and "Sair" set apart so it is never hit by accident. */
export function CallDock() {
  const v = useVoice(useShallow((s) => ({ camera: s.camera, canVideo: s.canVideo, pending: s.pending, screen: s.screen, selfDeaf: s.selfDeaf, selfMute: s.selfMute, state: s.state })));
  const [share, setShare] = useState(false);
  const [react, setReact] = useState(false);
  const btn = (active: boolean) =>
    clsx(
      'relative flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,color] duration-150 disabled:opacity-40 sm:h-12 sm:w-12',
      active ? 'bg-white text-black' : 'bg-line/[0.1] text-fg-strong hover:bg-line/[0.18]',
    );
  const tap = { whileTap: { scale: 0.88 }, transition: spring.snappy };
  return (
    <div className="mx-auto mb-[max(0.75rem,env(safe-area-inset-bottom))] mt-1 flex max-w-full shrink-0 items-center justify-center gap-1 rounded-full border border-line/[0.08] bg-bg-float/90 p-1.5 shadow-float sm:gap-2 sm:p-2">
      <Tooltip label={v.camera ? 'Desligar câmera' : 'Ligar câmera'}>
        <motion.button {...tap} className={btn(v.camera)} disabled={!v.canVideo || v.pending.cam} onClick={() => void toggleCamera()} aria-label="Câmera" aria-pressed={v.camera}>
          {v.pending.cam && <Spinner />}
          <Icon name={v.camera ? 'camera' : 'cameraOff'} />
        </motion.button>
      </Tooltip>
      {v.camera && (
        <Tooltip label="Alternar câmera">
          <motion.button {...tap} className={btn(false)} onClick={() => void switchCamera()} aria-label="Alternar câmera">
            <Icon name="flip" />
          </motion.button>
        </Tooltip>
      )}
{canShareScreen() && (
      <Tooltip label={v.screen ? 'Parar transmissão' : 'Compartilhar tela'}>
        <motion.button {...tap} className={clsx(btn(false), v.screen && '!bg-danger/20 !text-danger')} disabled={!v.canVideo} onClick={() => (v.screen ? void stopScreenShare() : setShare(true))} aria-label="Tela" aria-pressed={v.screen}>
          <Icon name={v.screen ? 'screenOff' : 'screen'} />
        </motion.button>
      </Tooltip>
      )}
      <Tooltip label={`${v.selfMute ? 'Ativar microfone' : 'Silenciar'} (Ctrl+Shift+M)`}>
        <motion.button {...tap} className={clsx(btn(false), (v.selfMute || v.selfDeaf) && '!bg-danger/20 !text-danger')} onClick={() => void toggleMute()} aria-label="Microfone" aria-pressed={v.selfMute || v.selfDeaf}>
          {v.pending.mic && <Spinner />}
          <Icon name={v.selfMute || v.selfDeaf ? 'micOff' : 'mic'} />
        </motion.button>
      </Tooltip>
      <Tooltip label={`${v.selfDeaf ? 'Ativar áudio' : 'Desativar áudio'} (Ctrl+Shift+D)`}>
        <motion.button {...tap} className={clsx(btn(false), v.selfDeaf && '!bg-danger/20 !text-danger')} onClick={() => void toggleDeaf()} aria-label="Áudio" aria-pressed={v.selfDeaf}>
          <Icon name={v.selfDeaf ? 'headphonesOff' : 'headphones'} />
        </motion.button>
      </Tooltip>
      <div className="relative">
        <Tooltip label="Reações (Alt+1…8)">
          <motion.button {...tap} className={btn(react)} onClick={() => setReact((o) => !o)} aria-label="Reações" aria-expanded={react} disabled={v.state !== 'connected'}>
            <Icon name="smile" />
          </motion.button>
        </Tooltip>
        <AnimatePresence>{react && <ReactionPicker onClose={() => setReact(false)} />}</AnimatePresence>
      </div>
      <span className="mx-0.5 h-7 w-px bg-line/10 sm:mx-1" />
      <Tooltip label="Sair da call">
        <motion.button {...tap} className="flex h-11 w-12 items-center justify-center rounded-full bg-danger sm:h-12 sm:w-14 text-white shadow-[0_8px_24px_-8px_rgb(var(--danger))] hover:bg-danger/85" onClick={() => void leaveVoice()} aria-label="Sair da call">
          <Icon name="hangup" />
        </motion.button>
      </Tooltip>
      {share && <ScreenShareModal onClose={() => setShare(false)} />}
    </div>
  );
}
/** @deprecated kept for older imports */
export const VoiceControls = CallDock;

/** An app older than 0.8 doesn't report its version; give it a few seconds after joining before warning. */
export function useOldApp(identity: string) {
  useVoice((v) => v.version);
  const [grace, setGrace] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setGrace(false), 5000);
    return () => clearTimeout(t);
  }, [identity]);
  return !grace && !participantVersion(identity) && !!getRoom()?.remoteParticipants.get(identity);
}

/** "Diagnóstico": runs the real stats for 2 s and shows a report to copy and send. */
function DiagButton({ run }: { run: () => Promise<string> }) {
  const [report, setReport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setReport(await run());
          } finally {
            setBusy(false);
          }
        }}
        title="Mede a transmissão por 2 segundos e gera um relatório"
      >
        {busy ? 'Medindo…' : 'Diagnóstico'}
      </button>
      {report && (
        <Modal onClose={() => setReport(null)} title="Diagnóstico da transmissão" subtitle="Copie e mande para quem está ajudando você.">
          <pre className="scroll-thin max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl bg-bg-rail p-3 text-[12px] leading-relaxed text-fg">{report}</pre>
          <button
            className="btn-primary mt-3 w-full"
            onClick={() => navigator.clipboard.writeText(report).then(() => toast('Relatório copiado!', 'success'), () => toast('Não deu para copiar; selecione o texto.'))}
          >
            <Icon name="copy" size={16} /> Copiar relatório
          </button>
        </Modal>
      )}
    </>
  );
}
