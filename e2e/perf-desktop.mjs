// Desktop fluidity, measured (no estimates). Same account, same machine, same server, one build at a time:
//  - load: login → home ready (ms) and JS downloaded for it
//  - idle: renderer CPU over 10 s on the home screen (CDP TaskDuration) — background cost of animations
//  - interaction: rAF frame times while hovering across the server rail and opening/closing a server (dropped = > 1.5× the frame time)
// Usage: BASE=http://localhost:4173 OLD_USER=<username> node e2e/perf-desktop.mjs <label>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:4173';
const USER = process.env.OLD_USER;
const label = process.argv[2] ?? BASE;
const browser = await chromium.launch();
const runs = [];
for (let i = 0; i < 3; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(
    ([id, ver]) => {
      if (!sessionStorage.getItem('seeded')) {
        // no intro / no release panel: measure the app itself
        localStorage.setItem('aldetes.prefs', JSON.stringify({ introMode: 'off', introAnimation: false, seenRelease: { [id]: ver } }));
        sessionStorage.setItem('seeded', '1');
      }
    },
    [process.env.PERF_ID, process.env.PERF_VERSION],
  );
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  await p.goto(`${BASE}/#/login`);
  await p.getByLabel(/E-mail ou nome de usuário/i).fill(USER);
  await p.getByLabel('Senha').fill('senha-forte-123');
  const t0 = Date.now();
  await p.getByRole('button', { name: /Entrar/ }).click();
  await p.waitForURL(/channels/);
  await p.locator('nav[aria-label=Servidores]').waitFor();
  await p.getByRole('heading', { level: 1 }).first().waitFor();
  const loadMs = Date.now() - t0;
  const js = await p.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.js')).reduce((a, r) => a + (r.encodedBodySize || 0), 0));
  // close anything that popped up (what's new on older builds)
  await p.keyboard.press('Escape');
  await p.waitForTimeout(1500);
  const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  const a = await m();
  await p.waitForTimeout(10000);
  const b = await m();
  const idleCpu = ((b.TaskDuration - a.TaskDuration) / (b.Timestamp - a.Timestamp)) * 100;
  // interaction: sample frames while moving across the rail and opening a server
  await p.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (t) => {
      window.__frames.push(t - last);
      last = t;
      if (window.__frames.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const btns = await p.locator('nav[aria-label=Servidores] button').all();
  for (let k = 0; k < 3; k++)
    for (const btn of btns.slice(0, 4)) {
      const bb = await btn.boundingBox();
      if (bb) await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 6 });
      await p.waitForTimeout(120);
    }
  const server = btns[2];
  if (server) await server.click();
  await p.waitForTimeout(700);
  await btns[0]?.click();
  await p.waitForTimeout(700);
  const frames = await p.evaluate(() => window.__frames.slice(2));
  const sorted = [...frames].sort((x, y) => x - y);
  const base = sorted[Math.floor(sorted.length * 0.25)];
  const dropped = frames.filter((f) => f > base * 1.5).length / frames.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  runs.push({ loadMs, jsKB: Math.round(js / 1024), idleCpu: +idleCpu.toFixed(2), dropped: +(dropped * 100).toFixed(1), p95: +p95.toFixed(1), heapMB: +(b.JSHeapUsedSize / 1048576).toFixed(1) });
  await ctx.close();
}
await browser.close();
const med = (k) => [...runs].map((r) => r[k]).sort((x, y) => x - y)[1];
console.log(JSON.stringify({ label, runs }));
console.log(`${label}: carga ${med('loadMs')} ms · JS ${med('jsKB')} KB · CPU parado ${med('idleCpu')}% · quadros perdidos ${med('dropped')}% · quadro p95 ${med('p95')} ms · heap ${med('heapMB')} MB (mediana de 3)`);
