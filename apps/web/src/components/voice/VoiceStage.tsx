import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Track, type Participant, type VideoTrack } from 'livekit-client';
import { useStore, displayName } from '@/store';
import { listTiles, useVoice, toggleCamera, toggleMute, toggleDeaf, leaveVoice, stopScreenShare, switchCamera, type Tile } from '@/lib/voice';
import { Avatar } from '../common/Avatar';
import { Icon } from '../common/Icon';
import { Tooltip, useContextMenu } from '../common/overlay';
import { QualityBars } from './VoicePanel';
import { ScreenShareModal } from './ScreenShareModal';
import { useMemberMenu } from '../common/UserPopout';

function VideoEl({ participant, source, contain, mirror }: { participant: Participant; source: Track.Source; contain?: boolean; mirror?: boolean }) {
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
  const hasVideo = !!tile.participant.getTrackPublication(tile.source)?.track && !tile.participant.getTrackPublication(tile.source)?.isMuted;
  return (
    <div
      ref={ref}
      onClick={onClick}
      onDoubleClick={() => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen())}
      onContextMenu={(e) => !tile.isLocal && menu(e, items())}
      className={clsx(
        'group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-bg-rail transition-shadow',
        speaking && !isScreen && 'ring-2 ring-ok',
        big ? 'h-full w-full' : 'aspect-video',
      )}
    >
      {hasVideo ? (
        <VideoEl participant={tile.participant} source={tile.source} contain={isScreen} mirror={tile.isLocal && !isScreen} />
      ) : (
        <Avatar userId={tile.identity} size={big ? 96 : 72} speaking={speaking} />
      )}
      <div className="absolute bottom-2 left-2 flex max-w-[80%] items-center gap-1.5 rounded bg-black/60 px-2 py-0.5 text-sm text-white">
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
    </div>
  );
}

export function VoiceStage({ channelId, compact }: { channelId: string; compact?: boolean }) {
  useVoice((v) => v.version); // re-render on track changes
  const focused = useVoice((v) => v.focused);
  const serverId = useStore((s) => s.channels[channelId]?.serverId ?? null);
  const all = listTiles();
  // hide camera tiles of people without camera when someone streams in compact mode
  const tiles = all.filter((t) => t.source === Track.Source.ScreenShare || !all.some((x) => x.identity === t.identity && x.source === Track.Source.ScreenShare) || t.participant.isCameraEnabled);
  const focusTile = tiles.find((t) => t.key === focused);
  const setFocus = (k: string | null) => useVoice.setState({ focused: k });

  // auto-focus the first screen share that appears
  const firstScreen = tiles.find((t) => t.source === Track.Source.ScreenShare && !t.isLocal)?.key;
  const prevScreen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (firstScreen && firstScreen !== prevScreen.current && !useVoice.getState().focused) setFocus(firstScreen);
    prevScreen.current = firstScreen;
  }, [firstScreen]);

  const cols = tiles.length <= 1 ? 1 : tiles.length <= 4 ? 2 : tiles.length <= 9 ? 3 : 4;

  return (
    <div className={clsx('flex min-h-0 flex-1 flex-col bg-black', compact ? 'h-[45vh] flex-none' : '')}>
      <div className="min-h-0 flex-1 p-3">
        {focusTile ? (
          <div className="flex h-full flex-col gap-3">
            <div className="min-h-0 flex-1">
              <TileView tile={focusTile} serverId={serverId} big onClick={() => setFocus(null)} />
            </div>
            <div className="flex h-24 shrink-0 justify-center gap-3 overflow-x-auto">
              {tiles
                .filter((t) => t.key !== focusTile.key)
                .map((t) => (
                  <div key={t.key} className="h-full w-40 shrink-0">
                    <TileView tile={t} serverId={serverId} onClick={() => setFocus(t.key)} />
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="grid h-full content-center gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {tiles.map((t) => (
              <TileView key={t.key} tile={t} serverId={serverId} onClick={() => setFocus(t.key)} />
            ))}
          </div>
        )}
      </div>
      <VoiceControls />
    </div>
  );
}

export function VoiceControls() {
  const v = useVoice();
  const [share, setShare] = useState(false);
  const btn = (active: boolean, danger?: boolean) =>
    clsx('flex h-12 w-12 items-center justify-center rounded-full transition-colors', danger ? 'bg-danger text-white hover:bg-danger/80' : active ? 'bg-white text-black' : 'bg-fg/15 text-white hover:bg-fg/25');
  return (
    <div className="flex shrink-0 items-center justify-center gap-3 pb-4 pt-1">
      <Tooltip label={v.camera ? 'Desligar câmera' : 'Ligar câmera'}>
        <button className={btn(v.camera)} disabled={!v.canVideo} onClick={() => void toggleCamera()}>
          <Icon name={v.camera ? 'camera' : 'cameraOff'} />
        </button>
      </Tooltip>
      {v.camera && (
        <Tooltip label="Alternar câmera">
          <button className={btn(false)} onClick={() => void switchCamera()}>
            <Icon name="flip" />
          </button>
        </Tooltip>
      )}
      <Tooltip label={v.screen ? 'Parar transmissão' : 'Compartilhar tela'}>
        <button className={btn(v.screen)} disabled={!v.canVideo} onClick={() => (v.screen ? void stopScreenShare() : setShare(true))}>
          <Icon name={v.screen ? 'screenOff' : 'screen'} />
        </button>
      </Tooltip>
      <Tooltip label={v.selfMute ? 'Ativar microfone' : 'Silenciar'}>
        <button className={btn(v.selfMute || v.selfDeaf)} onClick={() => void toggleMute()}>
          <Icon name={v.selfMute || v.selfDeaf ? 'micOff' : 'mic'} />
        </button>
      </Tooltip>
      <Tooltip label={v.selfDeaf ? 'Desativar surdez' : 'Ensurdecer'}>
        <button className={btn(v.selfDeaf)} onClick={() => void toggleDeaf()}>
          <Icon name={v.selfDeaf ? 'headphonesOff' : 'headphones'} />
        </button>
      </Tooltip>
      <Tooltip label="Desconectar">
        <button className={btn(false, true)} onClick={() => void leaveVoice()}>
          <Icon name="hangup" />
        </button>
      </Tooltip>
      {share && <ScreenShareModal onClose={() => setShare(false)} />}
    </div>
  );
}
