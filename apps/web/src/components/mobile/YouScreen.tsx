import { motion } from 'motion/react';
import clsx from 'clsx';
import type { PresenceStatus } from '@aldetes/shared';
import { useStore, set } from '@/store';
import { emit } from '@/lib/gateway';
import { openSettings } from '@/lib/ui';
import { logout } from '@/lib/session';
import { spring } from '@/lib/motion';
import { Icon, type IconName } from '../common/Icon';
import { Avatar, StatusDot, STATUS_LABEL } from '../common/Avatar';
import { ProfileBanner } from '../profile/Cosmetics';
import { openWhatsNew } from '../common/WhatsNew';

/** "Você": your profile, status and every account/app setting one tap away. */
export function YouScreen() {
  const me = useStore((s) => s.me);
  if (!me) return null;
  const setStatus = (status: PresenceStatus) => {
    emit('presence:set', { status });
    set((s) => ({ me: s.me ? { ...s.me, status } : s.me }));
  };
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-6">
      <div className="relative">
        <ProfileBanner user={me} height={132} />
        <div className="relative -mt-12 px-4">
          <motion.button whileTap={{ scale: 0.95 }} transition={spring.snappy} className="rounded-full border-[6px] border-bg-rail" onClick={() => openSettings('profile')} aria-label="Editar avatar">
            <Avatar userId={me.id} size={88} showStatus />
          </motion.button>
          <div className="mt-2 text-[24px] font-black tracking-tight text-fg-strong">{me.displayName}</div>
          <div className="text-sm text-fg-muted">{me.username}</div>
          {me.customStatus && <div className="mt-1 text-sm text-fg">{me.customStatus}</div>}
          <button className="btn-primary mt-4 h-11 w-full" onClick={() => openSettings('profile')}>
            <Icon name="edit" size={16} /> Editar perfil
          </button>
        </div>
      </div>

      <div className="mt-6 px-4">
        <div className="eyebrow mb-2">Status</div>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Status">
          {(['online', 'idle', 'dnd', 'invisible'] as const).map((st) => (
            <motion.button
              key={st}
              role="radio"
              aria-checked={me.status === st}
              whileTap={{ scale: 0.96 }}
              transition={spring.snappy}
              onClick={() => setStatus(st)}
              className={clsx('flex h-12 items-center gap-2.5 rounded-2xl border px-3 text-sm font-semibold transition-colors', me.status === st ? 'border-brand/40 bg-brand/10 text-fg-strong' : 'border-line/[0.07] bg-line/[0.025] text-fg')}
            >
              <StatusDot status={st} className="h-3 w-3" />
              {STATUS_LABEL[st]}
            </motion.button>
          ))}
        </div>
      </div>

      <div className="mt-6 px-4">
        <div className="eyebrow mb-2">Configurações</div>
        <div className="overflow-hidden rounded-2xl border border-line/[0.07] bg-line/[0.025]">
          <Item icon="user" label="Minha conta" onClick={() => openSettings('account')} />
          <Item icon="shield" label="Privacidade e atividade" onClick={() => openSettings('privacy')} />
          <Item icon="mic" label="Voz e vídeo" onClick={() => openSettings('voice')} />
          <Item icon="bell" label="Notificações" onClick={() => openSettings('notifications')} />
          <Item icon="palette" label="Aparência" onClick={() => openSettings('appearance')} />
          <Item icon="star" label="Novidades" onClick={() => openWhatsNew(false)} />
        </div>
        <button className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-danger/25 bg-danger/10 font-bold text-danger active:bg-danger/20" onClick={() => void logout()}>
          <Icon name="logout" size={18} /> Sair
        </button>
      </div>
    </div>
  );
}

function Item({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-14 w-full items-center gap-3 border-b border-line/[0.05] px-4 text-left text-[15px] font-semibold text-fg-strong last:border-0 active:bg-line/[0.06]">
      <span className="tile h-9 w-9 bg-line/[0.06] text-fg">
        <Icon name={icon} size={17} />
      </span>
      <span className="flex-1">{label}</span>
      <Icon name="chevronRight" size={16} className="text-fg-faint" />
    </button>
  );
}
