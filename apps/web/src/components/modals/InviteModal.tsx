import { useEffect, useState } from 'react';
import { Modal, toastError, toast } from '../common/overlay';
import { api, getBaseUrl } from '@/lib/api';
import { useStore } from '@/store';
import { isDesktop } from '@/lib/desktop';

export function inviteLink(code: string) {
  // Desktop: link points at the server's web client; browser: current origin.
  const origin = isDesktop ? getBaseUrl().replace(/:3001$/, ':5173') : window.location.origin + window.location.pathname;
  return `${origin.replace(/\/$/, '')}/#/invite/${code}`;
}

export function InviteModal({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const server = useStore((s) => s.servers[serverId])!;
  const channelId = useStore((s) => Object.values(s.channels).find((c) => c.serverId === serverId && c.type === 'text')?.id);
  const [maxAge, setMaxAge] = useState(604800);
  const [maxUses, setMaxUses] = useState(0);
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    if (!channelId) return;
    api<{ code: string }>('POST', `/channels/${channelId}/invites`, { maxAgeSeconds: maxAge, maxUses })
      .then((r) => setCode(r.code))
      .catch(toastError);
  }, [channelId, maxAge, maxUses]);
  const link = code ? inviteLink(code) : 'Gerando…';
  return (
    <Modal onClose={onClose} title={`Convide amigos para ${server.name}`}>
      <label className="label">Envie este link de convite</label>
      <div className="flex gap-2 rounded bg-bg-rail p-1">
        <input className="flex-1 bg-transparent px-2 text-sm text-fg-strong outline-none" readOnly value={link} onFocus={(e) => e.target.select()} />
        <button
          className="btn-primary px-3 py-1.5"
          disabled={!code}
          onClick={() => {
            navigator.clipboard.writeText(link);
            toast('Link copiado!', 'success');
          }}
        >
          Copiar
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 pb-2">
        <label>
          <span className="label">Expira após</span>
          <select className="input" value={maxAge} onChange={(e) => setMaxAge(+e.target.value)}>
            <option value={1800}>30 minutos</option>
            <option value={3600}>1 hora</option>
            <option value={21600}>6 horas</option>
            <option value={86400}>1 dia</option>
            <option value={604800}>7 dias</option>
            <option value={0}>Nunca</option>
          </select>
        </label>
        <label>
          <span className="label">Máximo de usos</span>
          <select className="input" value={maxUses} onChange={(e) => setMaxUses(+e.target.value)}>
            <option value={0}>Sem limite</option>
            {[1, 5, 10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} uso{n > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
