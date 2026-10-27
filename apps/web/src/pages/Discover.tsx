import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Server } from '@aldetes/shared';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { toastError } from '@/components/common/overlay';
import { ServerIcon } from '@/components/layout/ServerRail';
import { Icon } from '@/components/common/Icon';

export function DiscoverPage() {
  const [q, setQ] = useState('');
  const [list, setList] = useState<Array<Server & { memberCount: number }> | null>(null);
  const joined = useStore((s) => s.servers);
  const nav = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => api<typeof list>('GET', `/servers/discover?q=${encodeURIComponent(q)}`).then(setList, toastError), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="bg-gradient-to-r from-brand to-[#0984e3] px-10 py-14 text-center text-white">
        <h1 className="text-3xl font-bold">Encontre sua comunidade no Aldetes</h1>
        <p className="mt-2 opacity-90">De jogos a estudos, há um lugar para você.</p>
        <div className="mx-auto mt-6 flex max-w-xl items-center rounded bg-white px-3 text-black">
          <input className="flex-1 bg-transparent py-3 outline-none" placeholder="Explorar servidores públicos" value={q} onChange={(e) => setQ(e.target.value)} />
          <Icon name="search" />
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 p-8">
        {list?.map((s) => (
          <div key={s.id} className="overflow-hidden rounded-lg bg-bg-side shadow transition-transform hover:-translate-y-0.5">
            <div className="h-24 bg-brand/40" style={s.bannerUrl ? { background: `center/cover url(${s.bannerUrl})` } : undefined} />
            <div className="p-4">
              <div className="-mt-12 mb-2 w-fit rounded-2xl border-4 border-bg-side">
                <ServerIcon name={s.name} iconUrl={s.iconUrl} size={48} active />
              </div>
              <div className="font-bold text-fg-strong">{s.name}</div>
              <p className="mt-1 line-clamp-2 min-h-[2.5em] text-sm text-fg-muted">{s.description ?? 'Sem descrição.'}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-fg-muted">{s.memberCount} membros</span>
                {joined[s.id] ? (
                  <button className="btn-secondary py-1" onClick={() => nav(`/channels/${s.id}`)}>
                    Abrir
                  </button>
                ) : (
                  <button className="btn-primary py-1" onClick={() => api('POST', `/servers/${s.id}/join`).then(() => nav(`/channels/${s.id}`), toastError)}>
                    Entrar
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {list?.length === 0 && <p className="col-span-full py-16 text-center text-fg-muted">Nenhum servidor público encontrado.</p>}
      </div>
    </div>
  );
}
