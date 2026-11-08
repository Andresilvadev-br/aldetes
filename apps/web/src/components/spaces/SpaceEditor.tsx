import { lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { AnimatePresence } from 'motion/react';

const RoomBuilder = lazy(() => import('./RoomBuilder').then((m) => ({ default: m.RoomBuilder })));

const useEditor = create<{ open: boolean }>()(() => ({ open: false }));
export const openSpaceEditor = () => useEditor.setState({ open: true });

/** Editor of "my corner" (2.2: Smart Room Builder): instant local preview, nothing leaves the device until "Salvar". */
export function SpaceEditorHost() {
  const open = useEditor((s) => s.open);
  // the full editor is loaded only when someone opens it (never during an ordinary call)
  return createPortal(
    <AnimatePresence>
      {open && (
        <Suspense fallback={null}>
          <RoomBuilder onClose={() => useEditor.setState({ open: false })} />
        </Suspense>
      )}
    </AnimatePresence>,
    document.body,
  );
}


// dev/test hook (same module instance the app uses, even after hot reloads)
if (import.meta.env.DEV) (window as unknown as { __rb?: unknown }).__rb = { open: openSpaceEditor };
