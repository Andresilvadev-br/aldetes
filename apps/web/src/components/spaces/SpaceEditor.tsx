import { useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { create } from 'zustand';
import { AnimatePresence, motion } from 'motion/react';
import { DEFAULT_SPACE, SPACE_ITEMS, SPACE_PRESETS, type SpaceScene as Scene } from '@aldetes/shared';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { dur, ease } from '@/lib/motion';
import { Segmented, Switch } from '../settings/SettingsLayout';
import { Icon } from '../common/Icon';
import { toast, toastError } from '../common/overlay';
import { LiveAvatar } from '../voice/LiveAvatar';
import { Avatar } from '../common/Avatar';
import { SpaceScene, PRESETS, ITEM_LABEL, sceneOf } from './SpaceScene';

const useEditor = create<{ open: boolean }>()(() => ({ open: false }));
export const openSpaceEditor = () => useEditor.setState({ open: true });

/** Editor of "my corner": instant local preview, nothing leaves the device until "Salvar". */
export function SpaceEditorHost() {
  const open = useEditor((s) => s.open);
  return createPortal(<AnimatePresence>{open && <SpaceEditor onClose={() => useEditor.setState({ open: false })} />}</AnimatePresence>, document.body);
}

function SpaceEditor({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me)!;
  const saved = sceneOf(me.space, me.id);
  const [d, setD] = useState<Scene>(saved);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Scene>) => setD((x) => ({ ...x, ...p }));
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const inCall = useStore((s) => !!s.voiceStates[me.id]);
  const pickPreset = (id: Scene['preset']) => setD((x) => ({ ...x, preset: id, ...PRESETS[id].defaults }));
  const toggleItem = (it: Scene['items'][number]) =>
    setD((x) => (x.items.includes(it) ? { ...x, items: x.items.filter((i) => i !== it) } : x.items.length >= 6 ? x : { ...x, items: [...x.items, it] }));
  const save = async () => {
    setBusy(true);
    try {
      await api('PUT', '/users/@me/space', d);
      toast('Cantinho salvo — quem está na call já vê o novo.', 'success');
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setBusy(true);
    try {
      await api('DELETE', '/users/@me/space');
      setD(DEFAULT_SPACE);
      toast('Cantinho voltou ao padrão.');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        role="dialog"
        aria-modal
        aria-labelledby="space-editor-title"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, transition: { duration: dur.short } }}
        transition={{ duration: dur.spatial, ease: ease.out }}
        className="flex max-h-[90vh] w-[min(980px,96vw)] overflow-hidden rounded-[28px] border border-line/[0.08] bg-bg-side shadow-float"
      >
        <div className="flex w-[46%] shrink-0 flex-col gap-3 bg-bg-rail p-5">
          <h2 id="space-editor-title" className="text-xl font-black tracking-tight text-fg-strong">
            Meu cantinho
          </h2>
          <p className="-mt-2 text-xs text-fg-muted">É assim que você aparece no modo Spaces da call. A pré-visualização é só sua até salvar.</p>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line/[0.08]" data-testid="space-preview">
            <SpaceScene scene={d} density="full">
              {inCall ? <LiveAvatar identity={me.id} size={84} /> : <Avatar userId={me.id} size={84} />}
              <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-[12px] font-bold text-white">{me.displayName}</span>
            </SpaceScene>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line/[0.06]" title="Com 5–6 pessoas">
              <SpaceScene scene={d} density="normal">
                <Avatar userId={me.id} size={40} />
              </SpaceScene>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line/[0.06]" title="Com 7–10 pessoas (versão leve)">
              <SpaceScene scene={d} density="light">
                <Avatar userId={me.id} size={32} />
              </SpaceScene>
            </div>
          </div>
          <p className="text-[11px] text-fg-faint">Com mais gente na call, o cantinho fica mais simples automaticamente; com transmissões na tela ele vira só o fundo e você.</p>
        </div>
        <div className="scroll-thin flex min-w-0 flex-1 flex-col overflow-y-auto p-5">
          <div className="label">Cenário</div>
          <div className="mb-4 grid grid-cols-5 gap-2">
            {SPACE_PRESETS.map((id) => (
              <button key={id} onClick={() => pickPreset(id)} aria-pressed={d.preset === id} className={clsx('overflow-hidden rounded-xl border-2 text-left transition-colors', d.preset === id ? 'border-brand' : 'border-transparent hover:border-line/20')}>
                <span className="relative block aspect-square">
                  <SpaceScene scene={{ ...DEFAULT_SPACE, preset: id, ...PRESETS[id].defaults }} density="light" />
                </span>
                <span className="block truncate px-1 py-1 text-[10.5px] font-bold text-fg">{PRESETS[id].label}</span>
              </button>
            ))}
          </div>
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <div className="label">Iluminação</div>
              <Segmented id="sp-light" value={d.lighting} onChange={(v) => set({ lighting: v })} options={[['day', 'Dia'], ['night', 'Noite'], ['neon', 'Neon'], ['warm', 'Quente']]} />
            </div>
            <div>
              <div className="label">Fundo</div>
              <Segmented id="sp-bg" value={d.backdrop} onChange={(v) => set({ backdrop: v })} options={[['a', '1'], ['b', '2'], ['c', '3']]} />
            </div>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-fg">
              Cor <input type="color" className="h-8 w-12 cursor-pointer rounded bg-transparent" value={d.accent} onChange={(e) => set({ accent: e.target.value })} />
            </label>
            <div className="flex items-center gap-2 text-sm text-fg">
              Você fica
              <Segmented id="sp-pos" value={d.avatarPos} onChange={(v) => set({ avatarPos: v })} options={[['left', 'à esquerda'], ['center', 'no centro'], ['right', 'à direita']]} />
            </div>
          </div>
          <div className="label">Móveis e detalhes · {d.items.length}/6</div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {SPACE_ITEMS.map((it) => {
              const on = d.items.includes(it);
              return (
                <button key={it} onClick={() => toggleItem(it)} aria-pressed={on} disabled={!on && d.items.length >= 6} className={clsx('rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors disabled:opacity-40', on ? 'border-brand bg-brand/15 text-fg-strong' : 'border-line/[0.1] text-fg-muted hover:text-fg-strong')}>
                  {ITEM_LABEL[it]}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-line/[0.07] bg-line/[0.03] p-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-fg-strong">Detalhes animados</div>
              <div className="text-xs text-fg-muted">Brilho do monitor, abajur, neon. Param sozinhos no modo Essencial, com o PC sob carga ou durante transmissões.</div>
            </div>
            <Switch checked={d.animated} onChange={(v) => set({ animated: v })} />
          </div>
          <span className="flex-1" />
          <div className="mt-5 flex items-center gap-2">
            <button className="btn-ghost text-sm" disabled={busy} onClick={() => void reset()}>
              Restaurar padrão
            </button>
            <span className="flex-1" />
            <button className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={!dirty || busy} onClick={() => void save()}>
              <Icon name="check" size={15} /> Salvar
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
