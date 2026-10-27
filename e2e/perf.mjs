// Real measurements (no estimates): message round-trip latency through API + Socket.IO,
// and browser client idle CPU/memory via Chrome DevTools Protocol.
// Usage: node e2e/perf.mjs [baseUrl]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { io } = require('../apps/server/node_modules/socket.io-client');

const BASE = process.argv[2] ?? 'http://localhost:5173';
const run = Date.now().toString(36);
const api = async (method, path, body, token) => {
  const r = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${await r.text()}`);
  return r.json();
};
const pct = (arr, p) => arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))];

// --- 1. message latency ---
const a = await api('POST', '/auth/register', { email: `pa_${run}@t.dev`, username: `pa_${run}`, password: 'senha-forte-123' });
const b = await api('POST', '/auth/register', { email: `pb_${run}@t.dev`, username: `pb_${run}`, password: 'senha-forte-123' });
const srv = await api('POST', '/servers', { name: 'Perf' }, a.token);
const ch = srv.channels.find((c) => c.type === 'text').id;
const inv = await api('POST', `/channels/${ch}/invites`, {}, a.token);
await api('POST', `/invites/${inv.code}`, undefined, b.token);
const sock = io(BASE, { auth: { token: b.token }, transports: ['websocket'] });
await new Promise((r) => sock.once('ready', r));
const lat = [];
const N = 200;
for (let i = 0; i < N; i++) {
  const nonce = `n${i}`;
  const t0 = performance.now();
  const got = new Promise((r) => {
    const h = (m) => m.nonce === nonce && (sock.off('message:create', h), r());
    sock.on('message:create', h);
  });
  await api('POST', `/channels/${ch}/messages`, { content: `perf ${i}`, nonce }, a.token);
  await got;
  lat.push(performance.now() - t0);
  if (i % 9 === 8) await new Promise((r) => setTimeout(r, 5200)); // stay under the per-user message rate limit (10/5s)
}
sock.close();
console.log(`Latência envio→recebimento (${N} msgs, API+Socket.IO locais): p50=${pct(lat, 50).toFixed(1)}ms p95=${pct(lat, 95).toFixed(1)}ms max=${Math.max(...lat).toFixed(1)}ms`);

// history pagination
let t = performance.now();
await api('GET', `/channels/${ch}/messages?limit=50`, undefined, a.token);
console.log(`Carregar 50 mensagens do histórico: ${(performance.now() - t).toFixed(1)}ms`);

// --- 2. browser client idle CPU/memory ---
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/#/login`);
await page.getByLabel('E-mail ou nome de usuário').fill(`pa_${run}`);
await page.getByLabel('Senha').fill('senha-forte-123');
t = performance.now();
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForURL(/channels/);
await page.goto(`${BASE}/#/channels/${srv.id}/${ch}`);
await page.getByText('perf 199').waitFor();
console.log(`Login → canal com histórico renderizado: ${(performance.now() - t).toFixed(0)}ms (inclui navegação)`);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
await page.waitForTimeout(3000);
const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
await page.waitForTimeout(10000);
const m2 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const busy = ((m2.TaskDuration - m1.TaskDuration) / 10) * 100;
console.log(`Cliente web ocioso (10s): CPU da thread principal ${busy.toFixed(2)}% | JS heap ${(m2.JSHeapUsedSize / 1048576).toFixed(1)} MB | nós DOM ${m2.Nodes}`);
await browser.close();
process.exit(0);
