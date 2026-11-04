import { motion } from 'motion/react';
import { useIsMobile, mobileBack } from '@/lib/mobile';
import { spring } from '@/lib/motion';
import { Icon } from '../common/Icon';

/** "←" at the start of a content header on phones: back to servers/channels (44 px touch target). */
export function MobileBack() {
  const mobile = useIsMobile();
  if (!mobile) return null;
  return (
    <motion.button whileTap={{ scale: 0.88 }} transition={spring.snappy} onClick={mobileBack} aria-label="Voltar" className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-fg-strong active:bg-line/10">
      <Icon name="arrowLeft" size={21} />
    </motion.button>
  );
}
