/**
 * Global push-to-talk: Electron's globalShortcut only reports key *presses*,
 * so we use libuiohook (uiohook-napi) for real keydown/keyup events system-wide.
 * On macOS this needs the Accessibility/Input Monitoring permission.
 */
type Hook = typeof import('uiohook-napi');
let hook: Hook | null = null;
let active: { keycode: number; down: boolean; handler: (down: boolean) => void } | null = null;

function load(): Hook | null {
  if (hook) return hook;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    hook = require('uiohook-napi') as Hook;
    hook.uIOhook.on('keydown', (e) => {
      if (active && e.keycode === active.keycode && !active.down) {
        active.down = true;
        active.handler(true);
      }
    });
    hook.uIOhook.on('keyup', (e) => {
      if (active && e.keycode === active.keycode && active.down) {
        active.down = false;
        active.handler(false);
      }
    });
    hook.uIOhook.start();
    return hook;
  } catch (err) {
    console.warn('PTT global indisponível:', (err as Error).message);
    return null;
  }
}

/** Map KeyboardEvent.code → libuiohook keycode. */
function toKeycode(h: Hook, code: string): number | null {
  const K = h.UiohookKey as Record<string, number>;
  const m = /^Key([A-Z])$/.exec(code);
  if (m) return K[m[1]!] ?? null;
  const d = /^Digit(\d)$/.exec(code);
  if (d) return K[d[1]!] ?? null;
  const f = /^F(\d{1,2})$/.exec(code);
  if (f) return K[`F${f[1]}`] ?? null;
  const map: Record<string, string> = {
    Backquote: 'Backquote',
    Space: 'Space',
    CapsLock: 'CapsLock',
    Tab: 'Tab',
    ShiftLeft: 'Shift',
    ShiftRight: 'ShiftRight',
    ControlLeft: 'Ctrl',
    ControlRight: 'CtrlRight',
    AltLeft: 'Alt',
    AltRight: 'AltRight',
    MetaLeft: 'Meta',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Backslash: 'Backslash',
    BracketLeft: 'BracketLeft',
    BracketRight: 'BracketRight',
    Semicolon: 'Semicolon',
    Quote: 'Quote',
    Comma: 'Comma',
    Period: 'Period',
    Slash: 'Slash',
    Minus: 'Minus',
    Equal: 'Equal',
  };
  return map[code] ? (K[map[code]!] ?? null) : null;
}

export function startPtt(code: string, handler: (down: boolean) => void): boolean {
  const h = load();
  if (!h) return false;
  const keycode = toKeycode(h, code);
  if (keycode == null) return false;
  active = { keycode, down: false, handler };
  return true;
}

export function stopPtt() {
  if (active?.down) active.handler(false);
  active = null;
}
