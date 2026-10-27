import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { ServerIcon } from '@/components/layout/ServerRail';
import { Logo } from '@/components/common/Icon';

interface Preview {
  code: string;
  server: { id: string; name: string; iconUrl: string | null; memberCount: number; onlineCount: number; description: string | null };
}

export function InvitePage() {
  const { code } = useParams();
  const [p, setP] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const status = useStore((s) => s.status);
  const nav = useNavigate();
  useEffect(() => {
    api<Preview>('GET', `/invites/${code}`).then(setP, (e) => setErr(e.message));
  }, [code]);
  const accept = async () => {
    setBusy(true);
    try {
      const s = await api<{ id: string }>('POST', `/invites/${code}`);
      nav(`/channels/${s.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#2b2263] via-bg-rail to-[#123b46] p-4">
      <div className="w-full max-w-md animate-pop rounded-lg bg-bg-main p-8 text-center shadow-2xl">
        <div className="mb-4 flex justify-center text-brand">
          <Logo size={36} />
        </div>
        {err ? (
          <>
            <h1 className="text-xl font-bold text-fg-strong">Convite inválido</h1>
            <p className="mt-2 text-fg-muted">{err}</p>
            <Link to="/" className="btn-primary mt-6 w-full">
              Ir para o Aldetes
            </Link>
          </>
        ) : !p ? (
          <p className="text-fg-muted">Carregando convite…</p>
        ) : (
          <>
            <div className="mb-3 flex justify-center">
              <ServerIcon name={p.server.name} iconUrl={p.server.iconUrl} size={72} active />
            </div>
            <p className="text-sm text-fg-muted">Você recebeu um convite para entrar em</p>
            <h1 className="text-2xl font-bold text-fg-strong">{p.server.name}</h1>
            <p className="mt-2 flex justify-center gap-4 text-sm text-fg-muted">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-ok" />
                {p.server.onlineCount} online
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-fg-faint" />
                {p.server.memberCount} membros
              </span>
            </p>
            {status === 'ready' ? (
              <button className="btn-primary mt-6 w-full py-2.5" disabled={busy} onClick={accept}>
                Aceitar convite
              </button>
            ) : status === 'unauthenticated' ? (
              <div className="mt-6 flex flex-col gap-2">
                <Link to={`/register?next=${encodeURIComponent(`/invite/${code}`)}`} className="btn-primary py-2.5">
                  Criar conta e entrar
                </Link>
                <Link to={`/login?next=${encodeURIComponent(`/invite/${code}`)}`} className="btn-secondary">
                  Já tenho conta
                </Link>
              </div>
            ) : (
              <p className="mt-6 text-sm text-fg-muted">Conectando…</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
