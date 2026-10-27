import { useMemo, useState } from 'react';
import { Permissions, hasPermission } from '@aldetes/shared';
import { get, channelPermissions } from '@/store';
import { Modal, toastError, toast } from '../common/overlay';
import { api } from '@/lib/api';
import { dmName } from '../layout/HomeSidebar';

export function ForwardModal({ channelId, messageId, onClose }: { channelId: string; messageId: string; onClose: () => void }) {
  const [q, setQ] = useState('');
  const targets = useMemo(() => {
    const st = get();
    return Object.values(st.channels)
      .filter((c) => ['text', 'announcement', 'dm', 'group_dm', 'thread'].includes(c.type) && hasPermission(channelPermissions(c.id), Permissions.SEND_MESSAGES))
      .map((c) => ({ id: c.id, label: c.serverId ? `#${c.name} — ${st.servers[c.serverId]?.name}` : dmName(c) }))
      .filter((t) => t.label.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 50);
  }, [q]);
  return (
    <Modal onClose={onClose} title="Encaminhar mensagem">
      <input className="input mb-2" placeholder="Buscar destino" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="max-h-72 overflow-y-auto pb-2">
        {targets.map((t) => (
          <button
            key={t.id}
            className="w-full rounded px-2 py-2 text-left text-fg hover:bg-fg/10"
            onClick={() =>
              api('POST', `/channels/${channelId}/messages/${messageId}/forward`, { targetChannelId: t.id }).then(() => {
                toast('Mensagem encaminhada', 'success');
                onClose();
              }, toastError)
            }
          >
            {t.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
