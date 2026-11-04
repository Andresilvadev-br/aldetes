// Phones + PWA + "what's new" — runs against the PRODUCTION build (vite preview), because the service
// worker only exists there. Usage: node e2e/mobile-pwa.mjs <shots> (needs `pnpm --filter @aldetes/web build`
// and `vite preview --port 4173` running; OLD_USER = an account older than 1 day for the release panel).
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE ?? 'http://localhost:4173';
const SHOTS = process.argv[2] ?? './e2e-shots';
const OLD_USER = process.env.OLD_USER;
const results = [];
const check = (n, ok, extra = '') => (results.push(ok), console.log(`${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`));
const run = Date.now().toString(36);
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

try {
  // ---------- phone layout (Pixel 7, 412 px) ----------
  const ctx = await browser.newContext({ ...devices['Pixel 7'], permissions: ['microphone', 'camera'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(`${BASE}/#/register`);
  await p.getByLabel('E-mail').fill(`m${run}@t.dev`);
  await p.getByLabel('Nome de usuário').fill(`m_${run}`);
  await p.getByLabel('Senha').fill('senha-forte-123');
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.waitForURL(/channels/);
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${SHOTS}/m-home.png` });
  check('Celular: abre na navegação (servidores + conversas), sem rolagem lateral', (await p.locator('nav[aria-label=Servidores]').isVisible()) && (await noHScroll(p)));

  await p.getByRole('button', { name: 'Adicionar um servidor' }).click();
  await p.getByRole('button', { name: 'Criar', exact: true }).click();
  await p.waitForURL(/channels\/\d+\/\d+/);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${SHOTS}/m-channels.png` });
  await p.locator('[role=button]', { hasText: /^geral$/ }).first().click();
  await p.waitForTimeout(600);
  const back = p.getByRole('button', { name: 'Voltar para os canais' });
  const inChat = (await back.isVisible()) && (await p.getByPlaceholder(/Conversar em/).isVisible());
  await p.screenshot({ path: `${SHOTS}/m-chat.png` });
  check('Tocar num canal abre o chat em tela própria, com botão de voltar', inChat);
  await back.click();
  await p.waitForTimeout(500);
  check('Voltar mostra os canais de novo', await p.getByText('Canais de voz', { exact: false }).isVisible());

  await p.locator('[role=button]', { hasText: /^Geral/ }).first().click({ position: { x: 40, y: 18 } });
  await p.getByRole('button', { name: 'Sair da call' }).waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${SHOTS}/m-call.png` });
  const dock = await p.evaluate(() => {
    const names = ['Câmera', 'Tela', 'Microfone', 'Áudio', 'Reações', 'Sair da call'];
    return names.map((n) => {
      const b = [...document.querySelectorAll(`button[aria-label="${n}"]`)].at(-1);
      const r = b?.getBoundingClientRect();
      return r ? { n, ok: r.width >= 44 && r.height >= 44 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth } : { n, ok: false };
    });
  });
  check('Call no celular: dock inteiro visível, botões ≥ 44 px, sem rolagem lateral', dock.every((d) => d.ok) && (await noHScroll(p)), dock.filter((d) => !d.ok).map((d) => d.n).join(', ') || 'ok');
  await p.getByRole('button', { name: 'Microfone' }).last().click();
  const muted = await p.getByRole('button', { name: 'Microfone' }).last().getAttribute('aria-pressed');
  check('Mutar pelo celular funciona', muted === 'true');
  await p.getByRole('button', { name: 'Sair da call' }).click();

  // ---------- PWA ----------
  const man = await p.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]')?.getAttribute('href');
    const r = await fetch(href);
    const j = await r.json();
    return { display: j.display, icons: j.icons.map((i) => `${i.sizes}${i.purpose === 'maskable' ? 'm' : ''}`) };
  });
  check('Manifest com modo standalone e ícones 192/512 + maskable', man.display === 'standalone' && ['192x192', '512x512', '512x512m'].every((s) => man.icons.includes(s)), JSON.stringify(man));
  await p.reload();
  await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 }).catch(() => {});
  const sw = await p.evaluate(() => !!navigator.serviceWorker?.controller);
  check('Service worker ativo (casca do app em cache)', sw);
  await ctx.setOffline(true);
  await p.reload().catch(() => {});
  const offline = await p.getByText('Sem internet.').waitFor({ timeout: 8000 }).then(() => true, () => false);
  await p.screenshot({ path: `${SHOTS}/m-offline.png` });
  check('Sem internet: o app abre do cache e avisa que calls não funcionam', offline);
  await ctx.setOffline(false);
  await ctx.close();

  // ---------- "O Aldetes evoluiu!" ----------
  if (!OLD_USER) check('Painel de novidades (precisa de OLD_USER)', false, 'OLD_USER não informado');
  else {
    const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await c2.addInitScript(() => {
      // a device that already used an older version (prefs exist, last seen = 0.4.0)
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('aldetes.prefs', JSON.stringify({ seenRelease: { __any: '0.4.0' } }));
        sessionStorage.setItem('seeded', '1');
      }
    });
    const q = await c2.newPage();
    await q.goto(`${BASE}/#/login`);
    await q.getByLabel(/E-mail ou nome de usuário/i).fill(OLD_USER);
    await q.getByLabel('Senha').fill('senha-forte-123');
    await q.getByRole('button', { name: /Entrar/ }).click();
    await q.waitForURL(/channels/);
    const shown = await q.getByText('O Aldetes evoluiu!').waitFor({ timeout: 8000 }).then(() => true, () => false);
    await q.waitForTimeout(900);
    await q.screenshot({ path: `${SHOTS}/whatsnew.png` });
    check('Depois de atualizar, o painel de novidades aparece uma vez', shown);
    if (shown) await q.getByRole('button', { name: 'Começar' }).click();
    await q.reload();
    await q.waitForURL(/channels/);
    const again = await q.getByText('O Aldetes evoluiu!').waitFor({ timeout: 4000 }).then(() => true, () => false);
    check('Recarregar não mostra as mesmas novidades de novo', !again);
    await c2.close();
  }
} catch (e) {
  check('Roteiro', false, e.message.split('\n')[0]);
} finally {
  await browser.close();
  console.log(`${results.filter(Boolean).length}/${results.length} verificações passaram`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
