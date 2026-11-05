// Shared helpers for the 2.0 end-to-end tests: accounts in bulk, a server with a voice channel, people joining
// the call in real browsers (fake mic), small API calls from a page (session cookie + CSRF header).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

export const BASE = process.env.BASE ?? 'http://localhost:5173';
export const API = process.env.API ?? 'http://localhost:3001';
export const results = [];
export const check = (n, ok, extra = '') => (results.push(!!ok), console.log(`${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const done = () => {
  console.log(`${results.filter(Boolean).length}/${results.length} verificações passaram`);
  return results.length > 0 && results.every(Boolean);
};

export async function launch(extra = []) {
  return chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', ...extra] });
}

async function raw(method, path, body, token) {
  const r = await fetch(`${API}/api${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), 'X-Aldetes-Client': 'web', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j)}`);
  return j;
}
export const nodeApi = raw;

/** n accounts (password senha-forte-123) → [{ id, username, token }] */
export async function accounts(prefix, n) {
  const run = Date.now().toString(36);
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = `${prefix}${i}_${run}`;
    const r = await raw('POST', '/auth/register', { email: `${u}@t.dev`, username: u, password: 'senha-forte-123' });
    out.push({ id: r.user.id, username: u, token: r.token });
  }
  return out;
}

/** Owner creates a server; everybody joins it. Returns { serverId, voiceId, textId }. */
export async function serverFor(owner, members) {
  const s = await raw('POST', '/servers', { name: `Teste 2.0 ${Date.now().toString(36)}` }, owner.token);
  const full = await raw('GET', `/servers/${s.id}`, undefined, owner.token);
  const voice = full.channels.find((c) => c.type === 'voice');
  const text = full.channels.find((c) => c.type === 'text');
  const inv = await raw('POST', `/channels/${text.id}/invites`, {}, owner.token);
  for (const m of members) await raw('POST', `/invites/${inv.code}`, undefined, m.token);
  return { serverId: s.id, voiceId: voice.id, textId: text.id };
}

/** A logged-in page for an account (cookie session through the dev proxy). prefs: localStorage prefs to seed. */
export async function pageFor(browser, acc, { prefs = { introMode: 'off' }, viewport = { width: 1440, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport, permissions: ['microphone', 'camera', 'clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(([p, id]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('aldetes.prefs', JSON.stringify({ ...p, seenRelease: { [id]: '9.9.9' } }));
      sessionStorage.setItem('seeded', '1');
    }
  }, [prefs, acc.id]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`[${acc.username}] pageerror`, e.message));
  await p.goto(`${BASE}/#/login`);
  await p.evaluate(async ([login]) => {
    await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'X-Aldetes-Client': 'web' }, body: JSON.stringify({ login, password: 'senha-forte-123', remember: true }) });
  }, [acc.username]);
  await p.goto(`${BASE}/#/channels/@me`);
  await p.waitForURL(/channels/);
  await p.locator('nav[aria-label=Servidores]').waitFor({ timeout: 20000 });
  return p;
}

/** Joins the voice channel (direct to the channel page; waits for the server-confirmed state). */
export async function joinCall(p, serverId, voiceId) {
  await p.goto(`${BASE}/#/channels/${serverId}/${voiceId}`);
  await p.getByRole('button', { name: 'Entrar na voz' }).click({ timeout: 20000 });
  await p.waitForFunction(() => window.__aldetes?.useVoice.getState().state === 'connected', null, { timeout: 25000 });
}

export async function api(p, method, path, body) {
  return p.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(`/api${u}`, { method: m, credentials: 'include', headers: { 'X-Aldetes-Client': 'web', ...(b ? { 'content-type': 'application/json' } : {}) }, body: b ? JSON.stringify(b) : undefined });
      let j = null;
      try {
        j = await r.json();
      } catch {}
      return { status: r.status, body: j };
    },
    [method, path, body],
  );
}

/** CPU (TaskDuration share), JS heap and frame-time p95 of a page over `ms`. */
export async function measure(p, ms = 8000) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Performance.enable');
  const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  await p.evaluate((n) => {
    window.__ft = [];
    let last = performance.now();
    const tick = (t) => {
      window.__ft.push(t - last);
      last = t;
      if (window.__ft.length < n) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, Math.round(ms / 16));
  const a = await m();
  await sleep(ms);
  const b = await m();
  const ft = (await p.evaluate(() => window.__ft.slice(2))).sort((x, y) => x - y);
  await cdp.detach();
  return {
    cpu: +(((b.TaskDuration - a.TaskDuration) / (b.Timestamp - a.Timestamp)) * 100).toFixed(1),
    heapMB: +(b.JSHeapUsedSize / 1048576).toFixed(1),
    p95: +(ft[Math.floor(ft.length * 0.95)] ?? 0).toFixed(1),
    nodes: b.Nodes,
    listeners: b.JSEventListeners,
  };
}
