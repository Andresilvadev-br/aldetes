import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useStore, displayName } from '@/store';
import { useVoice, listTiles, Track } from '@/lib/voice';
import { spring } from '@/lib/motion';
import { Icon } from '../common/Icon';
import { VideoEl } from './VoiceStage';

/**
 * "Janela destacada" inside the app: when you leave the call page while watching a stream, it keeps playing
 * in a small draggable player. Click → back to the call. Same track, no new download (it's just another sink).
 */
export function MiniPlayer() {
  useVoice((v) => v.version);
  const channelId = useVoice((v) => v.channelId);
  const focused = useVoice((v) => v.focused);
  const closed = useVoice((v) => v.miniClosed);
  const channel = useStore((s) => (channelId ? s.channels[channelId] : undefined));
  const loc = useLocation();
  const nav = useNavigate();
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragged = useRef(false);

  const screens = channelId ? listTiles().filter((t) => t.source === Track.Source.ScreenShare && !t.isLocal && t.participant.getTrackPublication(t.source)?.track) : [];
  const tile = screens.find((t) => t.key === focused) ?? screens[0];
  useEffect(() => {
    if (closed) useVoice.setState({ miniClosed: false });
    // reopen next time a different stream is focused
  }, [tile?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCallPage = !!channelId && loc.pathname.endsWith(`/${channelId}`);
  const show = !!tile && !!channel && !onCallPage && !closed;
  const back = () => channel && nav(channel.serverId ? `/channels/${channel.serverId}/${channel.id}` : `/channels/@me/${channel.id}`);

  return (
    <AnimatePresence>
      {show && tile && (
        <motion.div
          key="mini"
          drag
          dragMomentum={false}
          onDragStart={() => (dragged.current = true)}
          onDragEnd={(_, i) => {
            setPos((p) => ({ x: p.x + i.offset.x, y: p.y + i.offset.y }));
            setTimeout(() => (dragged.current = false));
          }}
          initial={{ opacity: 0, scale: 0.85, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 20 }}
          transition={spring.gentle}
          className="group fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[60] aspect-video w-[min(340px,70vw)] cursor-pointer overflow-hidden rounded-2xl border border-line/10 bg-black shadow-float"
          onClick={() => !dragged.current && back()}
          role="button"
          aria-label={`Transmissão de ${displayName(tile.identity, channel?.serverId ?? null)} — voltar para a call`}
        >
          <VideoEl participant={tile.participant} source={tile.source} contain />
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1.5 bg-gradient-to-b from-black/70 to-transparent px-2.5 py-2 text-[12px] font-semibold text-white">
            <span className="rounded bg-danger px-1 text-[9.5px] font-black">AO VIVO</span>
            <span className="truncate">{displayName(tile.identity, channel?.serverId ?? null)}</span>
          </div>
          <button
            className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100 phone:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              useVoice.setState({ miniClosed: true });
            }}
            aria-label="Fechar janela flutuante"
          >
            <Icon name="x" size={15} />
          </button>
          <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white/85 opacity-0 transition-opacity group-hover:opacity-100">Clique para voltar à call</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
