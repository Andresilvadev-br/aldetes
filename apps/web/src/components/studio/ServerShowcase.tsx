import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import type { StudioTheme } from '@aldetes/shared';
import { useStore, useStoreShallow } from '@/store';
import { Icon } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { ServerIcon } from '../layout/ServerRail';
import { borderClass } from '../profile/Cosmetics';
import { ServerCover, IconFrame, ServerName, PresentationBg, ServerAtmosphere, themeOf, usePlainServers } from './ServerScene';

/**
 * 2.2 Server Showcase ("Vitrine"): the server's presentation page — info, recommended channels, what is happening right
 * now (real voice/stream state), upcoming events and highlights written by the admins. Everything shown is real data;
 * unknown/deleted channels are simply left out.
 */
export function ServerShowcase({ serverId, preview }: { serverId: string; preview?: StudioTheme }) {
  usePlainServers();
  const server = useStore((s) => s.servers[serverId])!;
  const theme = preview ?? themeOf(server);
  const sc = theme.showcase;
  const nav = useNavigate();
  const channels = useStoreShallow((s) => sc.channels.map((id) => s.channels[id]).filter((c) => c && c.serverId === serverId));
  // happening now: voice channels of this server with people in them (and who is streaming)
  const liveRaw = useStoreShallow((s) => {
    const by: Record<string, string[]> = {};
    for (const v of Object.values(s.voiceStates)) if (v.serverId === serverId) (by[v.channelId] ??= []).push(v.userId);
    // primitives only (a stable snapshot for the shallow selector)
    return Object.entries(by).map(([id, people]) => `${id}|${people.join(',')}|${Object.values(s.voiceStates).filter((v) => v.channelId === id && v.streaming).length}|${s.channels[id]?.name ?? 'Canal de voz'}`);
  });
  const live = liveRaw.map((x) => {
    const [id, people, streaming, ...name] = x.split('|');
    return { id: id!, people: people!, streaming: Number(streaming), name: name.join('|') };
  });
  const members = useStore((s) => Object.keys(s.members[serverId] ?? {}).length);
  const now = Date.now();
  const events = sc.events.filter((e) => new Date(e.at).getTime() > now - 2 * 3600_000).sort((a, b) => a.at.localeCompare(b.at));
  const go = (id: string | null) => id && nav(`/channels/${serverId}/${id}`);
  return (
    <div className="scroll-thin relative flex-1 overflow-y-auto" data-testid="server-showcase" style={theme.accent ? ({ '--sa': theme.accent } as React.CSSProperties) : undefined}>
      <ServerAtmosphere theme={theme} />
      <div className="relative mx-auto max-w-[920px] p-6">
        <div className={clsx('relative overflow-hidden rounded-3xl border border-line/[0.08]', borderClass(theme.cardBorder))}>
          <div className="relative h-48">
            <ServerCover server={server} theme={theme} />
          </div>
          <div className="relative -mt-12 flex items-end gap-4 px-6 pb-5">
            <IconFrame frame={theme.iconFrame} accent={theme.accent} anim={theme.iconAnim} live active={live.length > 0}>
              <ServerIcon name={server.name} iconUrl={server.iconUrl} size={84} active />
            </IconFrame>
            <div className="min-w-0 flex-1 pb-1">
              <ServerName name={server.name} theme={theme} className="text-3xl font-black tracking-tight text-fg-strong" />
              <div className="mt-0.5 text-sm text-fg-muted">
                {members} membros{live.length ? ` · ${live.reduce((a, l) => a + l.people.split(',').length, 0)} em call agora` : ''}
              </div>
            </div>
          </div>
          {server.description && <p className="relative px-6 pb-6 text-[15px] text-fg">{server.description}</p>}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Card title="Acontecendo agora" icon="speaker" theme={theme}>
            {live.length ? (
              live.map((l) => (
                <button key={l.id} onClick={() => go(l.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-line/[0.05]">
                  <span className="flex -space-x-2">
                    {l.people.split(',').slice(0, 4).map((u) => (
                      <Avatar key={u} userId={u} size={28} className="ring-2 ring-bg-main" />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-strong">{l.name}</span>
                  {l.streaming > 0 && <span className="rounded-md bg-danger px-1.5 text-[10px] font-black text-white">AO VIVO</span>}
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-sm text-fg-muted">Ninguém em call agora.</p>
            )}
          </Card>
          <Card title="Próximos eventos" icon="bell" theme={theme}>
            {events.length ? (
              events.map((e, i) => (
                <button key={i} onClick={() => go(e.channelId)} disabled={!e.channelId} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left enabled:hover:bg-line/[0.05]">
                  <span className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-line/[0.06] py-1 leading-tight">
                    <span className="text-[10px] font-bold uppercase text-brand">{new Date(e.at).toLocaleDateString('pt-BR', { month: 'short' })}</span>
                    <span className="text-lg font-black text-fg-strong">{new Date(e.at).getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-fg-strong">{e.title}</span>
                    <span className="text-xs text-fg-muted">{new Date(e.at).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-sm text-fg-muted">Nenhum evento marcado.</p>
            )}
          </Card>
        </div>

        {channels.length > 0 && (
          <Card title="Canais recomendados" icon="hash" theme={theme} className="mt-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {channels.map((c) => (
                <button key={c!.id} onClick={() => go(c!.id)} className="flex items-center gap-2 rounded-xl border border-line/[0.06] bg-line/[0.03] px-3 py-2.5 text-left hover:border-brand/40">
                  <Icon name={c!.type === 'voice' ? 'speaker' : 'hash'} size={16} className="text-fg-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-fg-strong">{c!.name}</span>
                    {c!.topic && <span className="block truncate text-xs text-fg-muted">{c!.topic}</span>}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {sc.highlights.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {sc.highlights.map((h, i) => (
              <button key={i} onClick={() => go(h.channelId)} disabled={!h.channelId} className={clsx('relative overflow-hidden rounded-2xl border border-line/[0.08] bg-bg-side p-4 text-left', borderClass(theme.cardBorder))}>
                <PresentationBg kind={theme.presentation === 'none' ? 'nebula' : theme.presentation} accent={theme.accent} />
                <span className="relative block text-[11px] font-black uppercase tracking-wider text-brand">Destaque</span>
                <span className="relative mt-1 block text-base font-extrabold text-fg-strong">{h.title}</span>
                {h.body && <span className="relative mt-1 block text-sm text-fg-muted">{h.body}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ title, icon, children, theme, className }: { title: string; icon: 'speaker' | 'bell' | 'hash'; children: React.ReactNode; theme: StudioTheme; className?: string }) {
  return (
    <section className={clsx('relative overflow-hidden rounded-2xl border border-line/[0.08] bg-bg-side/90 p-3', borderClass(theme.cardBorder), className)}>
      <h3 className="mb-1 flex items-center gap-2 px-2 text-xs font-black uppercase tracking-wider text-fg-muted">
        <Icon name={icon} size={14} /> {title}
      </h3>
      {children}
    </section>
  );
}
