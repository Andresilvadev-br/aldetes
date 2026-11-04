import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Permissions, hasPermission, computePermissions, type Channel, type Role } from '@aldetes/shared';
import { useStore, displayName, memberColor } from '@/store';
import { Avatar } from '../common/Avatar';
import { UserPopoutTrigger } from '../common/UserPopout';
import { Icon } from '../common/Icon';

type Row = { kind: 'header'; label: string; count: number } | { kind: 'user'; userId: string; offline: boolean };

export function MemberList({ channel }: { channel: Channel }) {
  const serverId = channel.serverId;
  const members = useStore((s) => (serverId ? s.members[serverId] : undefined));
  const roles = useStore((s) => (serverId ? s.roles[serverId] : undefined));
  const server = useStore((s) => (serverId ? s.servers[serverId] : undefined));
  const presences = useStore((s) => s.presences);
  const me = useStore((s) => s.me)!;

  const rows = useMemo<Row[]>(() => {
    if (!serverId) {
      const users = [me, ...(channel.recipients ?? [])];
      return [{ kind: 'header', label: 'Membros', count: users.length }, ...users.map((u) => ({ kind: 'user' as const, userId: u.id, offline: (presences[u.id]?.status ?? 'offline') === 'offline' }))];
    }
    const roleList = Object.values(roles ?? {});
    const everyone = roleList.find((r) => r.isEveryone);
    const rolePerms = new Map(roleList.map((r) => [r.id, BigInt(r.permissions)]));
    const ows = channel.overwrites.map((o) => ({ ...o, allow: BigInt(o.allow), deny: BigInt(o.deny) }));
    // only members who can see this channel
    const visible = Object.values(members ?? {}).filter((m) =>
      hasPermission(
        computePermissions({ isOwner: server?.ownerId === m.userId, everyoneRoleId: everyone?.id ?? '', rolePerms, memberRoleIds: m.roleIds, memberId: m.userId, overwrites: ows }),
        Permissions.VIEW_CHANNEL,
      ),
    );
    const hoisted = roleList.filter((r) => r.hoist && !r.isEveryone).sort((a, b) => b.position - a.position);
    const groups = new Map<string, string[]>();
    const online: string[] = [];
    const offline: string[] = [];
    for (const m of visible) {
      const st = presences[m.userId]?.status ?? 'offline';
      if (st === 'offline') {
        offline.push(m.userId);
        continue;
      }
      const top = hoisted.find((r: Role) => m.roleIds.includes(r.id));
      if (top) groups.set(top.id, [...(groups.get(top.id) ?? []), m.userId]);
      else online.push(m.userId);
    }
    const byName = (a: string, b: string) => displayName(a, serverId).localeCompare(displayName(b, serverId));
    const out: Row[] = [];
    for (const r of hoisted) {
      const ids = groups.get(r.id);
      if (!ids?.length) continue;
      out.push({ kind: 'header', label: r.name, count: ids.length }, ...ids.sort(byName).map((userId) => ({ kind: 'user' as const, userId, offline: false })));
    }
    if (online.length) out.push({ kind: 'header', label: 'Disponível', count: online.length }, ...online.sort(byName).map((userId) => ({ kind: 'user' as const, userId, offline: false })));
    if (offline.length) out.push({ kind: 'header', label: 'Offline', count: offline.length }, ...offline.sort(byName).map((userId) => ({ kind: 'user' as const, userId, offline: true })));
    return out;
  }, [serverId, members, roles, server, presences, channel, me]);

  const parent = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: (i) => (rows[i]!.kind === 'header' ? 40 : 44), overscan: 12 });

  return (
    <aside ref={parent} className="scroll-thin w-64 shrink-0 overflow-y-auto border-l border-line/[0.06] bg-line/[0.015] px-2" aria-label="Membros">
      <div style={{ height: v.getTotalSize(), position: 'relative' }}>
        {v.getVirtualItems().map((vi) => {
          const r = rows[vi.index]!;
          return (
            <div key={vi.key} style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${vi.start}px)`, height: vi.size }}>
              {r.kind === 'header' ? (
                <div className="eyebrow flex items-center gap-2 px-2 pb-1 pt-6">
                  {r.label}
                  <span className="rounded-full bg-line/[0.06] px-1.5 text-[10px] tracking-normal text-fg-muted">{r.count}</span>
                </div>
              ) : (
                <MemberRow userId={r.userId} serverId={serverId} offline={r.offline} ownerId={server?.ownerId} />
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function MemberRow({ userId, serverId, offline, ownerId }: { userId: string; serverId: string | null; offline: boolean; ownerId?: string }) {
  const presence = useStore((s) => s.presences[userId]);
  const color = useStore(() => memberColor(serverId, userId));
  const name = useStore(() => displayName(userId, serverId));
  const timedOut = useStore((s) => {
    const t = serverId ? s.members[serverId]?.[userId]?.timeoutUntil : null;
    return !!t && new Date(t) > new Date();
  });
  return (
    <UserPopoutTrigger userId={userId} serverId={serverId}>
      <div data-glow className={`flex h-[42px] cursor-pointer items-center gap-3 rounded-xl px-2 transition-[background-color,opacity] duration-150 hover:bg-line/[0.05] ${offline ? 'opacity-40 hover:opacity-100' : ''}`}>
        <Avatar userId={userId} size={32} showStatus={!offline} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate font-medium" style={{ color: color ?? undefined }}>
              {name}
            </span>
            {ownerId === userId && <Icon name="crown" size={14} className="shrink-0 text-warn" />}
            {timedOut && <Icon name="shield" size={14} className="shrink-0 text-danger" />}
          </div>
          {presence?.customStatus && !offline && <div className="truncate text-xs text-fg-muted">{presence.customStatus}</div>}
        </div>
      </div>
    </UserPopoutTrigger>
  );
}
