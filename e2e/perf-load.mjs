// Load time on a "normal phone": 4× slower CPU + weak 4G (≈ 4 Mbps, 120 ms). Logs in and waits for the home screen.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:4173';
const USER = process.env.OLD_USER;
const runs = [];
const browser = await chromium.launch();
for (let i = 0; i < 3; i++) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 120, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1 * 1024 * 1024) / 8 });
  await p.goto(`${BASE}/#/login`);
  await p.getByLabel(/E-mail ou nome de usuário/i).waitFor();
  const shellMs = await p.evaluate(() => performance.now());
  const shellJs = await p.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.js') && !/livekit/.test(r.name)).reduce((a, r) => a + (r.encodedBodySize || 0), 0));
  await p.getByLabel(/E-mail ou nome de usuário/i).fill(USER);
  await p.getByLabel('Senha').fill('senha-forte-123');
  const t0 = Date.now();
  await p.getByRole('button', { name: /Entrar/ }).click();
  await p.locator('nav[aria-label=Servidores]').waitFor({ timeout: 60000 });
  const appMs = Date.now() - t0;
  const js = await p.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.js') && !/livekit-client\.esm/.test(r.name)).reduce((a, r) => a + (r.encodedBodySize || 0), 0));
  runs.push({ shellMs: Math.round(shellMs), appMs, jsKB: Math.round(js / 1024), shellKB: Math.round(shellJs / 1024) });
  await ctx.close();
}
await browser.close();
const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
console.log(JSON.stringify({ base: BASE, login_screen_ms: med('shellMs'), login_to_app_ms: med('appMs'), js_kb_to_open_app: med('jsKB'), js_kb_login_screen: med('shellKB'), runs }));
