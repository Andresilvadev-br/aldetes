// Aldetes 1.0 end to end (two real browsers against the local stack): Pulse, navigation, Chat 2.0, profiles,
// Server Studio (permissions, publish/revert, upload validation, video banner), audio center, showcase, intro.
// Usage: node e2e/v1-features.mjs <shots dir>   (dev server on :5173, API + LiveKit running)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE ?? 'http://localhost:5173';
const SHOTS = process.argv[2] ?? './e2e-shots';
const results = [];
const check = (n, ok, extra = '') => (results.push(!!ok), console.log(`${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`));
const run = Date.now().toString(36);
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

async function user(name, prefs) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone', 'camera', 'clipboard-read', 'clipboard-write'] });
  // skip the intro and the release showcase unless a check wants them
  await ctx.addInitScript((p) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('aldetes.prefs', JSON.stringify(p));
      sessionStorage.setItem('seeded', '1');
    }
  }, prefs ?? { introMode: 'off' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  await p.goto(`${BASE}/#/register`);
  await p.getByLabel('E-mail').fill(`${name}${run}@t.dev`);
  await p.getByLabel('Nome de usuário').fill(`${name}_${run}`);
  await p.getByLabel('Senha').fill('senha-forte-123');
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.waitForURL(/channels/);
  return p;
}
const api = (p, method, path, body) =>
  p.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(`/api${u}`, { method: m, credentials: 'include', headers: b ? { 'content-type': 'application/json', 'X-Aldetes-Client': 'web' } : { 'X-Aldetes-Client': 'web' }, body: b ? JSON.stringify(b) : undefined });
      let j = null;
      try {
        j = await r.json();
      } catch {}
      return { status: r.status, body: j };
    },
    [method, path, body],
  );
const uploadFile = (p, path, filename, type, b64) =>
  p.evaluate(
    async ([u, f, t, data]) => {
      const bin = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const fd = new FormData();
      fd.append('file', new Blob([bin], { type: t }), f);
      const r = await fetch(`/api${u}`, { method: 'POST', credentials: 'include', headers: { 'X-Aldetes-Client': 'web' }, body: fd });
      let j = null;
      try {
        j = await r.json();
      } catch {}
      return { status: r.status, body: j };
    },
    [path, filename, type, b64],
  );

try {
  const A = await user('pa');
  const B = await user('pb');
  const meA = (await api(A, 'GET', '/users/@me')).body;
  const meB = (await api(B, 'GET', '/users/@me')).body;

  // ---------- Pulse with zero friends: real empty states, no invented activity ----------
  await A.waitForSelector('[data-testid=pulse]');
  const hero = await A.getByText('Sua galera.').isVisible();
  const empty = await A.getByText('Tudo calmo por enquanto').isVisible();
  await A.screenshot({ path: `${SHOTS}/v1-pulse-empty.png` });
  check('Pulse abre com o herói "Sua galera. Agora." e estados vazios reais (zero amigos)', hero && empty);

  // friends + shared server + B in a voice call
  await api(A, 'POST', '/relationships', { username: meB.username });
  await api(B, 'PUT', `/relationships/${meA.id}`, { type: 'friend' });
  await A.getByRole('button', { name: 'Adicionar um servidor' }).click();
  await A.getByRole('button', { name: 'Criar', exact: true }).click();
  await A.waitForURL(/channels\/\d+\/\d+/);
  const serverId = /channels\/(\d+)/.exec(A.url())[1];
  const inv = (await api(A, 'POST', `/channels/${/channels\/\d+\/(\d+)/.exec(A.url())[1]}/invites`, {})).body;
  const joined = await api(B, 'POST', `/invites/${inv.code}`);
  if (joined.status !== 200) throw new Error(`convite: ${joined.status} ${JSON.stringify(joined.body)}`);
  await B.goto(`${BASE}/#/channels/${serverId}`);
  await B.reload();
  await B.waitForURL(/channels\/\d+\/\d+/);
  await B.locator('[role=button]', { hasText: /^Geral/ }).first().click({ position: { x: 60, y: 20 } });
  await B.getByText('Voz conectada').waitFor({ timeout: 20000 });
  await A.goto(`${BASE}/#/channels/@me`);
  await A.waitForSelector('[data-testid=pulse]');
  const callCard = A.locator('[data-testid=pulse] section[aria-label="Acontecendo agora"]').getByRole('button', { name: 'Entrar' });
  await callCard.waitFor({ timeout: 8000 }).catch(() => {});
  const live = await callCard.isVisible().catch(() => false);
  const sidebarNow = await A.getByText('Em Geral').first().isVisible().catch(() => false);
  await A.screenshot({ path: `${SHOTS}/v1-pulse-live.png` });
  check('"Acontecendo agora" mostra a call real do amigo com botão Entrar; a barra lateral lista o amigo em "Agora"', live && sidebarNow, `pulse: ${live} · sidebar: ${sidebarNow}`);

  // reorder modules → saved
  await A.getByRole('button', { name: 'Descer Acontecendo agora' }).click();
  await A.reload();
  await A.waitForSelector('[data-testid=pulse]');
  const order = await A.locator('[data-testid=pulse] section[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check('Blocos do Pulse reorganizam e a ordem fica salva', order[0] === 'Acesso rápido' && order[1] === 'Acontecendo agora', order.join(' > '));

  // ---------- DM: pin + filter + draft + reply highlight + side panel ----------
  const dm = (await api(A, 'POST', '/users/@me/channels', { recipientIds: [meB.id] })).body;
  await A.goto(`${BASE}/#/channels/@me/${dm.id}`);
  const box = A.getByPlaceholder(/Conversar com|Mensagem/);
  await box.waitFor();
  for (const t of ['primeira mensagem do teste', 'olha https://example.com/aldetes', 'terceira']) {
    await box.fill(t);
    await box.press('Enter');
    await A.waitForTimeout(250);
  }
  await box.fill('rascunho que não pode sumir');
  await A.waitForTimeout(700);
  await A.reload();
  await A.getByPlaceholder(/Conversar com|Mensagem/).waitFor();
  const draft = await A.getByPlaceholder(/Conversar com|Mensagem/).inputValue();
  check('Rascunho por conversa sobrevive a recarregar o app', draft === 'rascunho que não pode sumir', draft);
  await A.goto(`${BASE}/#/channels/@me`);
  await A.waitForSelector('[data-testid=pulse]');
  const cont = await A.getByText('rascunho que não pode sumir').first().isVisible();
  check('"Continuar conversa" mostra o rascunho real', cont);

  await A.locator('[role=button]', { hasText: meB.displayName }).last().click({ button: 'right' });
  await A.getByText('Fixar conversa').click();
  await A.getByRole('tab', { name: 'Fixadas' }).click();
  const pinnedShown = await A.locator('[role=button]', { hasText: meB.displayName }).last().isVisible();
  await A.getByRole('tab', { name: 'Todas' }).click();
  check('Fixar DM pelo menu e filtrar por "Fixadas"', pinnedShown);

  // reply → click quote → original lights up
  await A.goto(`${BASE}/#/channels/@me/${dm.id}`);
  const first = A.locator('[data-message-id]', { hasText: 'primeira mensagem do teste' }).first();
  await first.hover();
  await first.getByRole('button', { name: 'Responder' }).click().catch(async () => {
    await first.click({ button: 'right' });
    await A.getByText('Responder', { exact: true }).click();
  });
  await A.getByPlaceholder(/Conversar com|Mensagem/).fill('respondendo');
  await A.getByPlaceholder(/Conversar com|Mensagem/).press('Enter');
  await A.waitForTimeout(500);
  await A.locator('[data-message-id]', { hasText: 'respondendo' }).last().getByRole('button', { name: /primeira mensagem do teste/ }).click();
  const flashed = await A.waitForFunction(() => document.querySelector('.msg-flash') !== null, null, { timeout: 2000 }).then(() => true, () => false);
  check('Responder: clicar na citação leva até a mensagem original e destaca por um instante', flashed);

  // side panel: links tab
  await A.getByRole('button', { name: /Mostrar painel|Mostrar lista/ }).click().catch(() => {});
  await A.getByRole('tab', { name: 'Links' }).click();
  const link = await A.getByRole('link', { name: /example\.com\/aldetes/ }).waitFor({ timeout: 6000 }).then(() => true, () => false);
  await A.screenshot({ path: `${SHOTS}/v1-chat-panel.png` });
  check('Painel lateral do chat: aba Links lista o link enviado (dados da API)', link);

  // ---------- Ctrl+K command bar ----------
  await A.keyboard.press('Control+k');
  await A.getByRole('textbox', { name: 'Barra de comandos' }).fill('> foco');
  const action = await A.getByRole('option', { name: /Modo foco/ }).isVisible();
  await A.keyboard.press('Enter');
  await A.waitForTimeout(400);
  const hidden = await A.locator('[data-testid=side-column]').isHidden();
  await A.keyboard.press('Control+Shift+F');
  await A.waitForTimeout(400);
  const back = await A.locator('[data-testid=side-column]').isVisible();
  check('Ctrl+K executa ações ("> foco"); modo foco esconde e Ctrl+Shift+F traz os painéis de volta', action && hidden && back, `ação: ${action} · escondeu: ${hidden} · voltou: ${back}`);

  // ---------- column width: keyboard resize, clamped, saved ----------
  const sep = A.getByRole('separator', { name: 'Largura da barra lateral' });
  await sep.focus();
  for (let i = 0; i < 30; i++) await A.keyboard.press('Shift+ArrowRight');
  await A.reload();
  await A.locator('[data-testid=side-column]').waitFor();
  const w = await A.locator('[data-testid=side-column]').evaluate((e) => e.getBoundingClientRect().width);
  check('Largura da barra lateral muda, fica no limite (380 px) e é salva por usuário', Math.round(w) === 380, `${Math.round(w)} px`);
  await A.getByRole('separator', { name: 'Largura da barra lateral' }).dblclick();

  // ---------- rail: hover preview + folder ----------
  await A.goto(`${BASE}/#/channels/@me`);
  const railBtn = A.locator('nav[aria-label=Servidores] button[aria-label^="Servidor de"]').first();
  await railBtn.hover();
  const preview = await A.getByRole('tooltip').filter({ hasText: /online/ }).waitFor({ timeout: 3000 }).then(() => true, () => false);
  const voiceInPreview = preview && (await A.getByRole('tooltip').getByText('Geral').isVisible().catch(() => false));
  await A.screenshot({ path: `${SHOTS}/v1-rail-preview.png` });
  check('Prévia do servidor ao passar o mouse (online e quem está em call)', preview && voiceInPreview, `prévia: ${preview} · call: ${voiceInPreview}`);
  await A.mouse.move(800, 500);
  await railBtn.click({ button: 'right' });
  await A.getByText('Nova pasta com este servidor').click();
  await A.getByLabel('Nome da pasta').fill('Galera');
  await A.getByRole('button', { name: 'Criar pasta' }).click();
  const folder = await A.locator('nav[aria-label=Servidores] button[aria-label="Galera (1)"]').isVisible();
  check('Pastas no trilho de servidores (criadas pelo menu, salvas no aparelho)', folder);

  // ---------- profile: collection + links, saved, seen by the other client ----------
  await A.goto(`${BASE}/#/channels/@me`);
  await A.evaluate(() => import('/src/lib/ui.ts').then((m) => m.openSettings('profile')));
  await A.getByRole('tab', { name: 'Coleções' }).click();
  await A.getByText('ORBITAL', { exact: true }).click();
  await A.getByRole('tab', { name: 'Sobre você' }).click();
  await A.getByRole('button', { name: 'Adicionar link' }).click();
  await A.getByPlaceholder('Nome').fill('Site');
  await A.getByPlaceholder('https://…').fill('https://example.com');
  await A.getByLabel('Pronomes').fill('ele/dele').catch(async () => A.locator('input[placeholder="opcional"]').fill('ele/dele'));
  const previewDeco = await A.locator('[data-testid=profile-preview] .deco-orbital').isVisible();
  const notYet = (await api(B, 'GET', `/users/${meA.id}`)).body.avatarDecoration;
  await A.screenshot({ path: `${SHOTS}/v1-profile-editor.png` });
  await A.getByRole('button', { name: 'Salvar', exact: true }).click();
  await A.getByText('Tudo salvo.').waitFor({ timeout: 5000 }).catch(async (e) => {
    await A.screenshot({ path: `${SHOTS}/v1-profile-save-fail.png` });
    throw e;
  });
  const seen = (await api(B, 'GET', `/users/${meA.id}`)).body;
  check('Perfil: pré-visualização ao vivo antes de salvar; depois de salvar o outro cliente recebe coleção, links e pronomes', previewDeco && !notYet && seen.avatarDecoration === 'orbital' && seen.bannerPreset === 'orbital' && seen.profileLinks?.[0]?.url === 'https://example.com' && seen.pronouns === 'ele/dele', JSON.stringify({ previewDeco, notYet, deco: seen.avatarDecoration, links: seen.profileLinks, pr: seen.pronouns }));
  const badLink = await api(A, 'PATCH', '/users/@me', { profileLinks: [{ label: 'x', url: 'javascript:alert(1)' }] });
  check('Links de perfil: só https (javascript: é recusado pelo servidor)', badLink.status === 400, `status ${badLink.status}`);
  await A.keyboard.press('Escape');

  // ---------- Server Studio ----------
  const theme = { accent: '#22d3ee', scene: 'orbital', lighting: 'vivid', texture: 'grain', bannerPosition: 'center', iconPosition: 'left', hover: 'glow', iconFrame: 'neon', separator: 'glow', entrance: 'sweep', welcome: { enabled: true, title: 'Bem-vindo à base!', body: 'Leia as regras.' } };
  const forbidden = await api(B, 'PUT', `/servers/${serverId}/studio/draft`, theme);
  const forbiddenPub = await api(B, 'POST', `/servers/${serverId}/studio/publish`, theme);
  check('Server Studio: quem não gerencia o servidor não edita nem publica (403)', forbidden.status === 403 && forbiddenPub.status === 403, `${forbidden.status}/${forbiddenPub.status}`);
  const badTheme = await api(A, 'PUT', `/servers/${serverId}/studio/draft`, { ...theme, scene: '<script>' });
  check('Server Studio: tema inválido é recusado (validação no servidor)', badTheme.status === 400, `status ${badTheme.status}`);
  const draftOk = await api(A, 'PUT', `/servers/${serverId}/studio/draft`, theme);
  const bBefore = await B.evaluate((id) => !!window.__aldetes.useStore.getState().servers[id].studio, serverId);
  const pub = await api(A, 'POST', `/servers/${serverId}/studio/publish`, theme);
  await B.waitForTimeout(800);
  const bAfter = await B.evaluate((id) => window.__aldetes.useStore.getState().servers[id].studio?.scene, serverId);
  await B.goto(`${BASE}/#/channels/${serverId}`);
  await B.waitForTimeout(900);
  const welcome = await B.getByText('Bem-vindo à base!').isVisible();
  await B.screenshot({ path: `${SHOTS}/v1-studio-member.png` });
  check('Rascunho não aparece para os membros; publicar chega ao outro cliente na hora (cena + boas-vindas)', draftOk.status === 200 && !bBefore && pub.status === 200 && bAfter === 'orbital' && welcome, JSON.stringify({ bBefore, bAfter, welcome }));
  await B.getByRole('button', { name: 'Fechar boas-vindas' }).click();
  await B.reload();
  await B.waitForTimeout(900);
  check('Boas-vindas não bloqueia e não volta depois de fechada', !(await B.getByText('Bem-vindo à base!').isVisible()));
  const rev = await api(A, 'POST', `/servers/${serverId}/studio/revert`);
  const studioNow = (await api(A, 'GET', `/servers/${serverId}/studio`)).body;
  check('Reverter volta ao visual anterior (e guarda o atual como anterior)', rev.status === 200 && studioNow.live === null && studioNow.prev?.scene === 'orbital', JSON.stringify({ live: studioNow.live, prev: studioNow.prev?.scene }));

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  const svgUp = await uploadFile(A, `/servers/${serverId}/banner`, 'x.svg', 'image/svg+xml', svg);
  const html = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
  const htmlUp = await uploadFile(A, `/servers/${serverId}/banner`, 'x.png', 'image/png', html);
  check('Upload: SVG e HTML disfarçado de PNG são recusados', svgUp.status === 400 && htmlUp.status === 400, `${svgUp.status}/${htmlUp.status}`);
  const bUp = await uploadFile(B, `/servers/${serverId}/banner`, 'a.png', 'image/png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
  check('Upload de banner do servidor exige permissão (403 para membro comum)', bUp.status === 403, `status ${bUp.status}`);
  // short video banner (generated locally): always re-encoded to H.264 MP4, ≤ 6 s
  let videoOk = false;
  let videoInfo = '';
  try {
    const dir = mkdtempSync(join(tmpdir(), 'v1-'));
    const src = join(dir, 'in.webm');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30', '-t', '9', '-c:v', 'libvpx', '-b:v', '600k', src]);
    const up = await uploadFile(A, `/servers/${serverId}/banner`, 'clip.webm', 'video/webm', readFileSync(src).toString('base64'));
    const url = up.body?.bannerUrl ?? '';
    if (up.status === 200 && /\.mp4$/.test(url)) {
      const out = join(dir, 'out.mp4');
      const r = await fetch(url.replace(/^https?:\/\/[^/]+/, BASE));
      writeFileSync(out, Buffer.from(await r.arrayBuffer()));
      const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height,codec_type', '-of', 'json', out]).toString();
      const j = JSON.parse(probe);
      const v = j.streams.find((s) => s.codec_type === 'video');
      const dur = Number(j.format.duration);
      videoOk = v?.codec_name === 'h264' && v.width <= 960 && dur <= 6.2 && !j.streams.some((s) => s.codec_type === 'audio');
      videoInfo = `${v?.codec_name} ${v?.width}x${v?.height} ${dur.toFixed(1)}s`;
    } else videoInfo = `status ${up.status} ${JSON.stringify(up.body).slice(0, 120)}`;
  } catch (e) {
    videoInfo = e.message.slice(0, 160);
  }
  check('Banner em vídeo: recodificado no servidor para H.264, sem som, ≤ 960 px e ≤ 6 s', videoOk, videoInfo);
  await A.goto(`${BASE}/#/channels/${serverId}`);
  await A.waitForTimeout(1200);
  const vid = await A.locator('[data-testid=server-header] video').isVisible().catch(() => false);
  check('O banner em vídeo aparece no cabeçalho do servidor', vid);

  // Studio editor UI (owner)
  await A.evaluate(() => {});
  await A.getByRole('button', { name: 'Menu do servidor' }).click();
  await A.getByText('Configurações do servidor').click();
  await A.getByText('Worlds', { exact: true }).first().click();
  await A.getByRole('tab', { name: 'Banners' }).click();
  await A.getByText('Orbital', { exact: true }).first().click();
  const lvl = await A.getByTestId('studio-status').getByText('Alterações não salvas').isVisible();
  await A.getByRole('button', { name: 'Antes (publicado)' }).click();
  await A.getByRole('button', { name: '150%' }).click();
  await A.screenshot({ path: `${SHOTS}/v1-studio-editor.png` });
  const canPublish = await A.getByRole('button', { name: 'Publicar' }).isEnabled();
  await A.getByRole('button', { name: 'Cancelar' }).click();
  const after = !(await A.getByTestId('studio-status').getByText('Alterações não salvas').isVisible());
  check('Editor do Studio: pré-visualização com antes/depois e zoom, indicador de não salvo, cancelar desfaz', lvl && canPublish && after, JSON.stringify({ lvl, canPublish, after }));
  await A.keyboard.press('Escape');

  // ---------- audio center ----------
  await A.evaluate(() => import('/src/lib/ui.ts').then((m) => m.openSettings('voice')));
  await A.getByRole('button', { name: 'Testar microfone' }).click();
  await A.waitForTimeout(1500);
  const meter = await A.getByRole('meter', { name: 'Nível do microfone' }).getAttribute('aria-valuenow');
  const saveDisabled = await A.getByRole('button', { name: /^Salvar/ }).isDisabled();
  await A.screenshot({ path: `${SHOTS}/v1-audio-center.png` });
  await A.getByRole('button', { name: 'Parar teste' }).click();
  check('Central de áudio: medidor real do microfone e "Salvar" só com alteração', Number(meter) > -60 && saveDisabled, `nível ${meter} dB`);
  await A.keyboard.press('Escape');

  // ---------- release showcase (device that had an older version) ----------
  const C = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await C.addInitScript((id) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('aldetes.prefs', JSON.stringify({ introMode: 'off', seenRelease: { [id]: '0.8.0' } }));
      sessionStorage.setItem('seeded', '1');
    }
  }, meA.id);
  // brand-new accounts never get a changelog (nothing to compare with): age this test account by 3 days in the dev DB
  execFileSync('docker', ['exec', 'aldetes-dev-postgres-1', 'psql', '-U', 'aldetes', '-d', 'aldetes', '-c', `UPDATE "User" SET "createdAt" = now() - interval '3 days' WHERE id = '${meA.id}'`]);
  const q = await C.newPage();
  await q.goto(`${BASE}/#/login`);
  await q.getByLabel(/E-mail ou nome de usuário/i).fill(meA.username);
  await q.getByLabel('Senha').fill('senha-forte-123');
  await q.getByRole('button', { name: /Entrar/ }).click();
  await q.waitForURL(/channels/);
  const shown = await q.getByText('Aldetes · versão 1.0.0').waitFor({ timeout: 8000 }).then(() => true, () => false);
  check('Showcase de novidades aparece sozinho depois de atualizar (aparelho que viu a 0.8.0)', shown);
  await q.waitForTimeout(900);
  await q.screenshot({ path: `${SHOTS}/v1-showcase-hero.png` });
  await q.getByRole('button', { name: 'Ver o que chegou' }).click();
  await q.waitForTimeout(700);
  const story = await q.getByRole('heading', { name: 'Pulse' }).isVisible();
  await q.screenshot({ path: `${SHOTS}/v1-showcase-story.png` });
  await q.keyboard.press('ArrowRight');
  await q.waitForTimeout(500);
  const story2 = await q.getByRole('heading', { name: 'Live Island livre' }).isVisible();
  await q.getByRole('button', { name: 'Pular' }).click();
  await q.waitForTimeout(500);
  await q.reload();
  await q.waitForURL(/channels/);
  const again = await q.locator('#whatsnew-title').waitFor({ timeout: 3500 }).then(() => true, () => false);
  check('Showcase: herói → histórias com demonstração → navegação por teclado; pular marca como visto', story && story2 && !again, JSON.stringify({ story, story2, again }));
  await C.close();

  // ---------- intro: version mode plays once, skippable ----------
  const D = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await D.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('aldetes.prefs', JSON.stringify({ introMode: 'version' }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  const r = await D.newPage();
  await r.goto(`${BASE}/#/login`);
  const introOn = await r.locator('[data-testid=intro]').isVisible();
  await r.waitForTimeout(500);
  await r.screenshot({ path: `${SHOTS}/v1-intro.png` });
  await r.keyboard.press('Space');
  const gone = await r.locator('[data-testid=intro]').waitFor({ state: 'detached', timeout: 2500 }).then(() => true, () => false);
  await r.reload();
  const introAgain = await r.locator('[data-testid=intro]').isVisible();
  check('Abertura: "só em versão nova" toca uma vez, pula com uma tecla e não repete', introOn && gone && !introAgain, JSON.stringify({ introOn, gone, introAgain }));
  await D.close();
} catch (e) {
  check('Roteiro', false, e.message.split('\n').slice(0, 2).join(' / '));
} finally {
  await browser.close();
  console.log(`${results.filter(Boolean).length}/${results.length} verificações passaram`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
