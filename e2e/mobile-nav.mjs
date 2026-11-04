// Phone experience, end to end (dev server, Chromium with touch + phone viewports).
// Navigation between all areas, back (button / system / edge swipe), scroll kept, nothing off-screen,
// long-press menus as sheets, calls + call bar, notifications with a real friend request, settings stack.
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE ?? 'http://localhost:5173';
const SHOTS = process.argv[2] ?? './e2e-shots';
const results = [];
const check = (n, ok, extra = '') => (results.push(ok), console.log(`${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`));
const run = Date.now().toString(36);
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

const PHONES = {
  'iPhone SE': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent },
  'iPhone 14 Pro': devices['iPhone 14 Pro'],
  'Pixel 7': devices['Pixel 7'],
  'Android 320': { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent },
};

async function newPhone(dev, { dismissInstall = true } = {}) {
  const ctx = await browser.newContext({ ...dev, permissions: ['microphone', 'camera'] });
  if (dismissInstall) await ctx.addInitScript(() => localStorage.setItem('aldetes.installDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  return { ctx, p };
}
async function register(p, name) {
  await p.goto(`${BASE}/#/register`);
  await p.getByLabel('E-mail').fill(`${name}${run}@t.dev`);
  await p.getByLabel('Nome de usuário').fill(`${name}_${run}`);
  await p.getByLabel('Senha').fill('senha-forte-123');
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.waitForURL(/channels/);
  await p.waitForTimeout(900);
}
const api = (p, method, path, body) =>
  p.evaluate(
    async ([m, u, b]) => {
      const r = await fetch('/api' + u, { method: m, credentials: 'include', headers: { 'content-type': 'application/json', 'X-Aldetes-Client': 'web' }, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, data: await r.json().catch(() => null) };
    },
    [method, path, body],
  );
/** Visible interactive elements outside the viewport + horizontal page scroll. */
const offscreen = (p) =>
  p.evaluate(() => {
    const W = innerWidth, H = innerHeight, out = [];
    if (document.documentElement.scrollWidth > W + 1) out.push(`rolagem lateral ${document.documentElement.scrollWidth}px`);
    for (const el of document.querySelectorAll('button, a[href], input, textarea, [role=button]')) {
      if (el.closest('[aria-hidden=true], [hidden], .invisible')) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // inside a scrollable list it's fine to be below the fold
      let sc = el.parentElement, inScroll = false;
      while (sc && sc !== document.body) {
        const o = getComputedStyle(sc).overflowY;
        if ((o === 'auto' || o === 'scroll') && sc.scrollHeight > sc.clientHeight) { inScroll = true; break; }
        sc = sc.parentElement;
      }
      if (r.right > W + 1 || r.left < -1 || (!inScroll && (r.bottom > H + 1 || r.top < -1))) out.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 28)} @${Math.round(r.left)},${Math.round(r.top)}`);
    }
    return out;
  });
const tabBarVisible = (p) => p.locator('nav[aria-label="Navegação principal"]').isVisible();
const activeTab = (p) => p.locator('nav[aria-label="Navegação principal"] [aria-current=page]').getAttribute('aria-label').catch(() => null);
const rect = (loc) => loc.boundingBox();
const overlaps = (a, b) => !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

try {
  /* ---------------- 0. the install notice never covers sign-up (320 px, fresh device) ---------------- */
  {
    const { ctx, p } = await newPhone(PHONES['Android 320'], { dismissInstall: false });
    await p.goto(`${BASE}/#/register`);
    await p.waitForFunction(() => !document.querySelector('.z-\\[200\\]'), null, { timeout: 8000 }).catch(() => {}); // opening animation
    await p.waitForTimeout(1500); // the install notice (if any) would be up by now
    const btn = p.getByRole('button', { name: 'Continuar' });
    const box = await rect(btn);
    const hit = await p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el?.closest('button')?.textContent?.trim() ?? `${el?.tagName}.${el?.className}`.slice(0, 90); }, [box.x + box.width / 2, box.y + box.height / 2]);
    check('Cadastro: nada cobre o botão "Continuar" (320 px, celular novo)', hit === 'Continuar', `no centro do botão: "${hit}"`);
    await ctx.close();
  }

  /* ---------------- main flow on an iPhone 14 Pro ---------------- */
  const { ctx, p } = await newPhone(PHONES['iPhone 14 Pro']);
  await register(p, 'mob');
  check('Barra inferior com 4 áreas, aba ativa identificada', (await tabBarVisible(p)) && (await p.locator('nav[aria-label="Navegação principal"] button').count()) === 4, `ativa: ${await activeTab(p)}`);

  await p.getByRole('button', { name: 'Servidores' }).click();
  await p.waitForTimeout(400);
  check('Aba Servidores abre (estado vazio com ações)', (await activeTab(p)) === 'Servidores' && (await p.getByText(/Nenhum servidor ainda|Escolha um servidor/).isVisible()));
  await p.getByRole('button', { name: 'Adicionar um servidor' }).click();
  await p.getByRole('button', { name: 'Criar', exact: true }).click();
  await p.waitForURL(/channels\/\d+\/\d+/);
  await p.waitForTimeout(800);
  const serverId = /channels\/(\d+)/.exec(p.url())[1];
  check('Criar servidor mostra a lista de canais (não pula para o chat), barra visível', (await p.locator('[role=button]', { hasText: /^geral$/ }).first().isVisible()) && (await tabBarVisible(p)));

  // a long channel list to test scroll preservation
  for (let i = 0; i < 22; i++) await api(p, 'POST', `/servers/${serverId}/channels`, { name: `canal-${String(i).padStart(2, '0')}`, type: 'text' });
  await p.waitForTimeout(900);
  const list = p.locator('section[aria-label="servers"] .panel .overflow-y-auto').first();
  await list.evaluate((el) => (el.scrollTop = 420));
  await p.waitForTimeout(200);
  const before = await list.evaluate((el) => el.scrollTop);
  await p.locator('[role=button]', { hasText: /^canal-15$/ }).first().click();
  await p.waitForTimeout(700);
  const inChat = (await p.getByPlaceholder(/Conversar em #canal-15/).isVisible()) && !(await tabBarVisible(p));
  check('Tocar num canal abre o chat em tela cheia (barra inferior some)', inChat);
  await p.screenshot({ path: `${SHOTS}/mnav-chat.png` });
  await p.getByRole('button', { name: 'Voltar' }).first().click();
  await p.waitForTimeout(700);
  const after = await list.evaluate((el) => el.scrollTop);
  check('Voltar mantém a posição de rolagem da lista', Math.abs(after - before) < 4 && before > 100, `${before}px → ${after}px`);

  // system back (browser / Android back button)
  await p.locator('[role=button]', { hasText: /^geral$/ }).first().click();
  await p.waitForTimeout(600);
  await p.goBack();
  await p.waitForTimeout(700);
  check('Voltar do sistema (histórico) sai do chat para a lista', (await tabBarVisible(p)) && !(await p.getByPlaceholder(/Conversar em #geral/).isVisible()));
  await p.goForward();
  await p.waitForTimeout(700);
  check('Avançar do sistema reabre o mesmo chat', await p.getByPlaceholder(/Conversar em #geral/).isVisible());

  // keyboard-like viewport shrink: the composer must stay on screen
  await p.setViewportSize({ width: 393, height: 480 });
  await p.waitForTimeout(500);
  const comp = await rect(p.getByPlaceholder(/Conversar em #geral/));
  check('Com a área visível menor (teclado), o campo de mensagem continua na tela', !!comp && comp.y + comp.height <= 480, `campo termina em ${Math.round((comp?.y ?? 0) + (comp?.height ?? 0))}px de 480`);
  await p.setViewportSize({ width: 393, height: 852 });
  await p.waitForTimeout(400);

  // send a message, then long-press it → actions sheet
  await p.getByPlaceholder(/Conversar em #geral/).fill('Olá do celular');
  await p.getByRole('button', { name: 'Enviar mensagem' }).click();
  await p.waitForTimeout(900);
  const msg = await rect(p.getByText('Olá do celular').first());
  const cdp = await ctx.newCDPSession(p);
  const tp = { x: msg.x + 30, y: msg.y + msg.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp] });
  await p.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const sheet = p.locator('[data-sheet]');
  const sheetOk = await sheet.first().waitFor({ timeout: 3000 }).then(() => true, () => false);
  const sheetBox = sheetOk ? await rect(sheet.first()) : null;
  await p.screenshot({ path: `${SHOTS}/mnav-longpress.png` });
  check('Toque longo numa mensagem abre as ações num painel inferior dentro da tela', sheetOk && sheetBox.y + sheetBox.height <= 853 && sheetBox.width >= 390, sheetBox ? `${Math.round(sheetBox.width)}×${Math.round(sheetBox.height)} em y=${Math.round(sheetBox.y)}` : 'não abriu');
  await p.goBack(); // system back closes the sheet, not the chat
  await p.waitForTimeout(500);
  check('Voltar do sistema fecha o painel e mantém o chat', !(await sheet.count()) && (await p.getByPlaceholder(/Conversar em #geral/).isVisible()));

  // emoji picker → sheet, every emoji reachable (scrollable inside the screen)
  await p.getByRole('button', { name: 'Emoji' }).first().click();
  await p.waitForTimeout(500);
  const emo = await offscreen(p);
  check('Seletor de emoji abre dentro da tela', (await sheet.count()) > 0 && emo.length === 0, emo.slice(0, 3).join(' | ') || 'ok');
  await p.mouse.click(200, 60);
  await p.waitForTimeout(400);

  // call
  await p.getByRole('button', { name: 'Voltar' }).first().click();
  await p.waitForTimeout(500);
  await p.locator('section[aria-label="servers"] .overflow-y-auto').first().evaluate((el) => (el.scrollTop = 0));
  await p.locator('[role=button]', { hasText: /^Geral/ }).first().click({ position: { x: 40, y: 18 } });
  await p.getByRole('button', { name: 'Sair da call' }).last().waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
  const callOff = await offscreen(p);
  const dockSizes = await p.evaluate(() => ['Câmera', 'Microfone', 'Áudio', 'Reações', 'Sair da call'].map((n) => { const b = [...document.querySelectorAll(`button[aria-label="${n}"]`)].at(-1)?.getBoundingClientRect(); return b ? Math.min(b.width, b.height) : 0; }));
  await p.screenshot({ path: `${SHOTS}/mnav-call.png` });
  check('Tela da call: controles ≥ 44 px e nada fora da tela', dockSizes.every((s) => s >= 44) && callOff.length === 0, callOff.slice(0, 3).join(' | ') || `botões: ${dockSizes.map(Math.round).join(',')}`);
  await p.getByRole('button', { name: 'Voltar' }).first().click();
  await p.waitForTimeout(800);
  const bar = p.getByRole('button', { name: /Voltar para a call/ });
  const barBox = await rect(bar);
  const tabsBox = await rect(p.locator('nav[aria-label="Navegação principal"]'));
  await p.screenshot({ path: `${SHOTS}/mnav-callbar.png` });
  check('Saindo da tela da call, a chamada continua numa barra acima das abas (sem sobrepor)', !!barBox && !!tabsBox && !overlaps(barBox, tabsBox) && barBox.y < tabsBox.y);
  await p.locator('[role=button]', { hasText: /^geral$/ }).first().click();
  await p.waitForTimeout(700);
  const topBar = await rect(bar);
  const composer = await rect(p.getByPlaceholder(/Conversar em #geral/));
  check('Dentro de outro chat, a barra da call fica no topo e não cobre o campo', !!topBar && !!composer && !overlaps(topBar, composer) && topBar.y < 120);
  await bar.click();
  await p.waitForTimeout(700);
  check('Tocar na barra volta para a call', await p.getByText('Conectado').first().isVisible());
  await p.getByRole('button', { name: 'Voltar' }).first().click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Sair da call' }).first().click();
  const stillIn = await bar.isVisible();
  await p.getByRole('button', { name: 'Confirmar: sair da call' }).first().click();
  await p.waitForTimeout(800);
  check('Sair pela barra pede confirmação e depois encerra', stillIn && !(await bar.isVisible().catch(() => false)));
  // history: list → #geral → call → (back) #geral → (back) list
  await p.getByRole('button', { name: 'Voltar' }).first().click();
  await p.waitForTimeout(600);
  check('Voltar segue o histórico: call → chat anterior → lista', await tabBarVisible(p));

  // notifications: a real friend request from another user
  const other = await newPhone(PHONES['Pixel 7']);
  await register(other.p, 'amigo');
  const r = await api(other.p, 'POST', '/relationships', { username: `mob_${run}` });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${SHOTS}/mnav-before-notif.png` });
  const badge = await p.locator('nav[aria-label="Navegação principal"] button[aria-label="Notificações"] span.bg-danger').textContent().catch(() => null);
  await p.getByRole('button', { name: 'Notificações' }).click();
  await p.waitForTimeout(600);
  const reqVisible = await p.getByText('quer ser seu amigo').isVisible();
  await p.screenshot({ path: `${SHOTS}/mnav-notifications.png` });
  check('Notificações: pedido de amizade real aparece (com contador na aba)', r.status < 300 && reqVisible && !!badge, `contador: ${badge}`);
  await p.getByRole('button', { name: 'Aceitar' }).click();
  await p.waitForTimeout(1000);
  check('Aceitar pela tela de notificações funciona', !(await p.getByText('quer ser seu amigo').isVisible()) && (await p.getByText('Tudo em dia').isVisible()));
  await other.ctx.close();

  // Você → settings stack
  await p.getByRole('button', { name: 'Você' }).click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${SHOTS}/mnav-you.png` });
  await p.getByRole('button', { name: 'Minha conta' }).click();
  await p.waitForTimeout(700);
  const setOff = await offscreen(p);
  await p.screenshot({ path: `${SHOTS}/mnav-settings.png` });
  check('Configurações no celular: tela própria, sem nada cortado', setOff.length === 0 && (await p.getByRole('dialog', { name: 'Configurações' }).isVisible()), setOff.slice(0, 3).join(' | ') || 'ok');
  await p.getByRole('button', { name: 'Voltar para as configurações' }).click();
  await p.waitForTimeout(500);
  const listShown = await p.getByRole('dialog', { name: 'Configurações' }).getByRole('button', { name: /Aparência/ }).isVisible();
  await p.goBack();
  await p.waitForTimeout(600);
  check('Configurações: voltar mostra a lista; voltar do sistema fecha', listShown && !(await p.getByRole('dialog', { name: 'Configurações' }).isVisible().catch(() => false)) && (await tabBarVisible(p)));
  await ctx.close();

  /* ---------------- edge swipe back (Android) ---------------- */
  {
    const { ctx: c2, p: q } = await newPhone(PHONES['Pixel 7']);
    await register(q, 'swp');
    await q.getByRole('button', { name: 'Servidores' }).click();
    await q.getByRole('button', { name: 'Adicionar um servidor' }).click();
    await q.getByRole('button', { name: 'Criar', exact: true }).click();
    await q.waitForURL(/channels\/\d+\/\d+/);
    await q.waitForTimeout(700);
    await q.locator('[role=button]', { hasText: /^geral$/ }).first().click();
    await q.waitForTimeout(700);
    const cd = await c2.newCDPSession(q);
    await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 6, y: 420 }] });
    for (let x = 20; x <= 300; x += 28) {
      await cd.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 424 }] });
      await q.waitForTimeout(16);
    }
    await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await q.waitForTimeout(700);
    check('Arrastar da borda esquerda volta para a lista (Android / app instalado)', await tabBarVisible(q));
    // a vertical scroll starting at the edge must NOT go back
    await q.locator('[role=button]', { hasText: /^geral$/ }).first().click();
    await q.waitForTimeout(700);
    await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 8, y: 300 }] });
    for (let y = 300; y <= 600; y += 30) await cd.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 14, y }] });
    await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await q.waitForTimeout(600);
    check('Rolagem vertical perto da borda não aciona o voltar', !(await tabBarVisible(q)));
    await c2.close();
  }

  /* ---------------- every size: nothing off-screen on the main screens ---------------- */
  for (const [name, dev] of Object.entries(PHONES)) {
    const { ctx: c3, p: q } = await newPhone(dev);
    await register(q, `sz${name.replace(/\W/g, '').toLowerCase()}`);
    const problems = [];
    problems.push(...(await offscreen(q)).map((x) => `mensagens: ${x}`));
    await q.getByRole('button', { name: 'Servidores' }).click();
    await q.getByRole('button', { name: 'Adicionar um servidor' }).click();
    await q.getByRole('button', { name: 'Criar', exact: true }).click();
    await q.waitForURL(/channels\/\d+\/\d+/);
    await q.waitForTimeout(700);
    problems.push(...(await offscreen(q)).map((x) => `canais: ${x}`));
    await q.locator('[role=button]', { hasText: /^geral$/ }).first().click();
    await q.waitForTimeout(700);
    problems.push(...(await offscreen(q)).map((x) => `chat: ${x}`));
    await q.getByRole('button', { name: 'Voltar' }).first().click();
    await q.getByRole('button', { name: 'Notificações' }).click();
    await q.waitForTimeout(400);
    problems.push(...(await offscreen(q)).map((x) => `notificações: ${x}`));
    await q.getByRole('button', { name: 'Você' }).click();
    await q.waitForTimeout(400);
    problems.push(...(await offscreen(q)).map((x) => `você: ${x}`));
    check(`${name} (${dev.viewport.width}×${dev.viewport.height}): nada cortado ou fora da tela`, problems.length === 0, problems.slice(0, 4).join(' | ') || 'ok');
    await c3.close();
  }

  /* ---------------- landscape call ---------------- */
  {
    const { ctx: c4, p: q } = await newPhone({ ...PHONES['iPhone 14 Pro'], viewport: { width: 852, height: 393 } });
    await register(q, 'land');
    await q.getByRole('button', { name: 'Servidores' }).click().catch(() => {});
    await q.getByRole('button', { name: 'Adicionar um servidor' }).click();
    await q.getByRole('button', { name: 'Criar', exact: true }).click();
    await q.waitForURL(/channels\/\d+\/\d+/);
    await q.waitForTimeout(700);
    await q.locator('[role=button]', { hasText: /^Geral/ }).first().click({ position: { x: 40, y: 18 } });
    await q.getByRole('button', { name: 'Sair da call' }).last().waitFor({ timeout: 20000 });
    await q.waitForTimeout(1200);
    const off = await offscreen(q);
    await q.screenshot({ path: `${SHOTS}/mnav-landscape.png` });
    check('Celular deitado: call com controles na tela', off.length === 0, off.slice(0, 3).join(' | ') || 'ok');
    await c4.close();
  }
} catch (e) {
  check('Roteiro', false, e.message.split('\n').slice(0, 3).join(' / '));
} finally {
  await browser.close();
  console.log(`${results.filter(Boolean).length}/${results.length} verificações passaram`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
