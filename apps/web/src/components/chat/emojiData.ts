import { api } from '@/lib/api';
import { set, get } from '@/store';
import { onGateway } from '@/lib/gateway';

const loading = new Set<string>();
export async function loadServerEmojis(serverId: string, force = false) {
  if ((!force && get().emojis[serverId]) || loading.has(serverId)) return;
  loading.add(serverId);
  try {
    const list = await api<Array<{ id: string; name: string; url: string; animated: boolean }>>('GET', `/servers/${serverId}/emojis`);
    set((s) => ({ emojis: { ...s.emojis, [serverId]: list } }));
  } finally {
    loading.delete(serverId);
  }
}
onGateway('emojis:update', ({ serverId }: { serverId: string }) => void loadServerEmojis(serverId, true));
