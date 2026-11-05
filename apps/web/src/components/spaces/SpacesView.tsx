import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import type { PublicUser, SpaceScene as Scene } from '@aldetes/shared';
import { useStore, displayName } from "@/store";
import { api } from '@/lib/api';
import { spring } from '@/lib/motion';
import { useOffscreenPause } from '@/lib/perf';
import { LiveAvatar } from '../voice/LiveAvatar';
import { Icon } from '../common/Icon';
import { useContextMenu } from '../common/overlay';
import { useMemberMenu } from '../common/UserPopout';
import { SpaceScene, sceneOf, type Density } from './SpaceScene';
import { openSpaceEditor } from './SpaceEditor';
import { themeOf, usePlainServers } from '../studio/ServerScene';

export const SPACES_PAGE = 10;

/** Layout table from the 2.0 spec: 1–2 big, 3–4 → 2×2, 5–6 → 3×2, 7–10 adaptive, more → pages of 10. */
export function spacesGrid(n: number): { cols: number; density: Density } {
  if (n <= 2) return { cols: Math.max(1, n), density: 'full' };
  if (n <= 4) return { cols: 2, density: 'normal' };
  if (n <= 6) return { cols: 3, density: 'normal' };
  return { cols: n <= 8 ? 4 : 5, density: 'light' };
}

// ---- scene cache: bounded, invalidated per person by revision (only the corner that changed re-renders) ----
const cache = new Map<string, { rev: number; scene: Scene }>();
const MAX_CACHE = 60;
function remember(id: string, rev: number, scene: Scene) {
  cache.delete(id);
  cache.set(id, { rev, scene });
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
}

/**
 * The person's scene: from the store when known (members/friends already carry it), otherwise one cancellable
 * request — meanwhile the tile shows a neutral skeleton room, never blocking the call.
 */
function useScene(id: string): { scene: Scene | null; loading: boolean } {
  const known = useStore((s) => (s.me?.id === id ? s.me : s.users[id]) as PublicUser | undefined);
  const rev = known?.spaceRev ?? -1;
  const has = !!known && 'spaceRev' in known;
  const [fetched, setFetched] = useState<Scene | null>(() => cache.get(id)?.scene ?? null);
  useEffect(() => {
    if (has) return;
    const c = cache.get(id);
    if (c) return setFetched(c.scene);
    const ctl = new AbortController();
    api<PublicUser>('GET', `/users/${id}`, undefined, { signal: ctl.signal }).then(
      (u) => {
        const sc = sceneOf(u.space);
        remember(id, u.spaceRev ?? 0, sc);
        setFetched(sc);
      },
      () => {},
    );
    return () => ctl.abort();
  }, [id, has]);
  const scene = useMemo(() => {
    if (!has) return fetched;
    const c = cache.get(id);
    if (c && c.rev === rev) return c.scene;
    const sc = sceneOf(known!.space);
    remember(id, rev, sc);
    return sc;
  }, [has, rev, fetched, id]);
  return { scene, loading: !scene };
}

function Corner({ id, serverId, density, focused, onFocus, worldTint }: { id: string; serverId: string | null; density: Density; focused: boolean; onFocus: () => void; worldTint: string | null }) {
  const { scene } = useScene(id);
  const isMe = useStore((s) => s.me?.id === id);
  const vs = useStore((s) => s.voiceStates[id]);
  const menu = useContextMenu();
  const items = useMemberMenu(id, serverId);
  const pause = useOffscreenPause();
  const size = density === 'full' ? 84 : density === 'normal' ? 64 : density === 'light' ? 48 : 40;
  const state = vs?.streaming ? 'transmitindo' : vs?.selfDeaf || vs?.serverDeaf ? 'sem áudio' : vs?.selfMute || vs?.serverMute ? 'mutado' : null;
  return (
    <div
      ref={pause}
      role="button"
      tabIndex={0}
      aria-label={`Cantinho de ${displayName(id, serverId)}`}
      onClick={onFocus}
      onKeyDown={(e) => e.key === 'Enter' && onFocus()}
      onContextMenu={(e) => !isMe && menu(e, items())}
      data-space-tile={id}
      className={clsx('group relative h-full w-full overflow-hidden rounded-2xl border bg-bg-rail outline-none transition-[border-color] duration-150 focus-visible:border-brand', focused ? 'border-brand/60' : 'border-line/[0.07]')}
    >
      {scene ? (
        <SpaceScene scene={scene} density={density} worldTint={worldTint}>
          <motion.span layoutId={`person-${id}`} transition={spring.stage} className="relative">
            <LiveAvatar identity={id} size={size} />
          </motion.span>
          {density !== 'mini' && (
            <span className="max-w-[90%] truncate rounded-full bg-black/55 px-2.5 py-0.5 text-[12px] font-bold text-white">
              {displayName(id, serverId)}
              {state && <span className="ml-1 font-semibold text-white/70">· {state}</span>}
            </span>
          )}
        </SpaceScene>
      ) : (
        // not cached yet: skeleton room immediately, real corner when it arrives
        <div className="absolute inset-0 flex flex-col items-center justify-end gap-2 bg-gradient-to-b from-line/[0.06] to-line/[0.02] pb-[7%]" aria-busy>
          <motion.span layoutId={`person-${id}`} transition={spring.stage}>
            <LiveAvatar identity={id} size={size} />
          </motion.span>
          {density !== 'mini' && <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-[12px] font-bold text-white">{displayName(id, serverId)}</span>}
        </div>
      )}
      {isMe && density !== 'mini' && (
        <button
          className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-black/55 px-2 py-1 text-[11px] font-bold text-white opacity-0 transition-opacity hover:bg-black/75 focus:opacity-100 group-hover:opacity-100"
          onClick={(e) => (e.stopPropagation(), openSpaceEditor())}
        >
          <Icon name="edit" size={12} /> Meu cantinho
        </button>
      )}
    </div>
  );
}

/**
 * Spaces view of the call: a grid of corners (voice only) or a compact strip while streams are on screen.
 * Pure view: it never touches the LiveKit room, so switching Clássico ↔ Spaces doesn't reconnect or remount media.
 */
export function SpacesView({ people, serverId, strip, focus, onFocus }: { people: string[]; serverId: string | null; strip?: boolean; focus: string | null; onFocus: (id: string | null) => void }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(people.length / SPACES_PAGE));
  useEffect(() => setPage((p) => Math.min(p, pages - 1)), [pages]);
  usePlainServers();
  const worldTint = useStore((s) => (serverId ? themeOf(s.servers[serverId]).accent : null));
  // focused person first on their page (smart focus when there are more people than fit)
  const ordered = focus && people.includes(focus) ? [focus, ...people.filter((p) => p !== focus)] : people;
  const shown = ordered.slice(page * SPACES_PAGE, page * SPACES_PAGE + SPACES_PAGE);
  const { cols, density } = strip ? { cols: shown.length, density: 'mini' as Density } : spacesGrid(shown.length);
  const box = useRef<HTMLDivElement>(null);
  if (strip)
    return (
      <div className="scroll-thin flex h-[96px] shrink-0 gap-2 overflow-x-auto" data-testid="spaces-strip">
        <AnimatePresence initial={false}>
          {people.map((id) => (
            <motion.div key={id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring.stage} className="h-full w-[150px] shrink-0">
              <Corner id={id} serverId={serverId} density="mini" focused={false} onFocus={() => onFocus(id)} worldTint={worldTint} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="spaces-view">
      <div ref={box} className="grid min-h-0 flex-1 gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}>
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((id) => (
            <motion.div
              key={id}
              layout
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.16 } }}
              transition={spring.stage}
              className={clsx('min-h-[120px]', focus === id && shown.length > 2 && 'col-span-2 row-span-2')}
            >
              <Corner id={id} serverId={serverId} density={focus === id && density === 'light' ? 'normal' : density} focused={focus === id} onFocus={() => onFocus(focus === id ? null : id)} worldTint={worldTint} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {pages > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-2 text-xs text-fg-muted">
          <button className="btn-secondary h-7 px-2" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Página anterior">
            <Icon name="arrowLeft" size={13} />
          </button>
          {page + 1} / {pages} · {people.length} pessoas
          <button className="btn-secondary h-7 px-2" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Próxima página">
            <Icon name="chevronRight" size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

/** For tests/diagnostics: how many scenes are cached. */
export const spacesCacheSize = () => cache.size;
