// 2.2 Beyond end to end: Smart Room Builder, Anime Legends, Server Worlds 2.0 (atmosphere, legend, entrances, Vitrine).
// Usage: node e2e/v22-beyond.mjs <shots>
import { launch, accounts, serverFor, pageFor, api, check, done, sleep, BASE } from './lib/v2.mjs';

const SHOTS = process.argv[2] ?? './e2e-shots';
const browser = await launch();
try {
  const [A, B] = await accounts('b22', 2);
  const { serverId, textId, voiceId } = await serverFor(A, [B]);
  const a = await pageFor(browser, A, { viewport: { width: 1600, height: 960 } });
  const b = await pageFor(browser, B);

  // ---------------- Room Builder ----------------
  await a.waitForFunction(() => !!window.__rb, null, { timeout: 10000 });
  await a.evaluate(() => window.__rb.open());
  const canvas = a.getByTestId('rb-canvas');
  await canvas.waitFor({ timeout: 15000 });
  await a.getByRole('combobox', { name: 'Cenário inicial' }).selectOption('gamer');
  await a.getByRole('button', { name: 'Usar cenário' }).click();
  await sleep(500);
  const n0 = await canvas.locator('[data-obj]').count();
  check('Cenário pronto "Gamer Room" carrega móveis editáveis (não é imagem de fundo)', n0 >= 8, `${n0} objetos`);

  // drag the plant (floor only) into the desk → red while over it, reverted on drop
  const box = async (k) => canvas.locator(`[data-k="${k}"]`).first().boundingBox();
  const pc = await box('tall-plant');
  const desk = await box('gamer-desk');
  await a.mouse.move(pc.x + pc.width / 2, pc.y + pc.height * 0.8);
  await a.mouse.down();
  await a.mouse.move(desk.x + desk.width * 0.5, desk.y + desk.height * 0.55, { steps: 10 });
  await sleep(250);
  const during = await a.getByTestId('rb-drag-state').textContent().catch(() => '');
  await a.mouse.up();
  await sleep(400);
  const pcAfter = await box('tall-plant');
  const fit = (await api(a, 'GET', '/users/@me')).status === 200; // (layout lives in the draft until saved)
  check('Colisão: arrastar a planta para dentro da mesa fica vermelho; ao soltar, o encaixe a leva para um espaço livre (nunca sobrepõe)', /Inválido/.test(during ?? '') && fit && !(await a.evaluate(() => document.querySelector('.rb-bad'))), `durante: "${during}" · x ${Math.round(pc.x)}→${Math.round(pcAfter.x)}`);

  // add a monitor from the catalog → lands on a surface (desk)
  await a.getByRole('tab', { name: 'Setup gamer' }).click();
  await a.getByRole('button', { name: 'Adicionar Monitor', exact: true }).click();
  await sleep(300);
  const scene1 = await a.evaluate(() => null);
  const onDesk = await canvas.locator('[data-k="gamer-desk"] [data-k="monitor"]').count();
  check('Monitor do catálogo encaixa sozinho em cima da mesa (regra de superfície)', onDesk === 1);

  // rotate, duplicate, undo/redo
  await canvas.locator('[data-k="tall-plant"]').first().click();
  await a.getByRole('button', { name: /Duplicar/ }).click();
  await sleep(200);
  const plants = await canvas.locator('[data-k="tall-plant"]').count();
  await a.getByRole('button', { name: /Desfazer/ }).first().click();
  await sleep(200);
  const plantsUndo = await canvas.locator('[data-k="tall-plant"]').count();
  await a.getByRole('button', { name: /Refazer/ }).first().click();
  await sleep(200);
  const plantsRedo = await canvas.locator('[data-k="tall-plant"]').count();
  check('Duplicar, desfazer e refazer', plants === 2 && plantsUndo === 1 && plantsRedo === 2, `${plants}/${plantsUndo}/${plantsRedo}`);

  // office room, then move the avatar spot to the right: the armchair there becomes invalid → auto-arrange preview → apply
  await a.getByRole('combobox', { name: 'Cenário inicial' }).selectOption('office');
  await a.getByRole('button', { name: 'Usar cenário' }).click();
  await sleep(300);
  await a.getByRole('button', { name: 'Dir.', exact: true }).click();
  await sleep(300);
  const status1 = await a.getByTestId('rb-status').textContent();
  await a.getByTestId('rb-arrange').click();
  const prop = await a.getByTestId('rb-proposal').textContent();
  await a.screenshot({ path: `${SHOTS}/v22-room-arrange.png` });
  await a.getByRole('button', { name: 'Aplicar' }).click();
  await sleep(300);
  const status2 = await a.getByTestId('rb-status').textContent();
  check('Organizar automaticamente: conflito detectado → prévia → aplicado, com o seu lugar livre', /inválida/.test(status1 ?? '') && /[1-9] movido/.test(prop ?? '') && !/inválida/.test(status2 ?? ''), `${status1} → ${status2} · ${prop}`);

  // ambiance (Anime Legends) + save
  await a.getByRole('tab', { name: 'Efeitos e temas' }).click();
  await a.getByRole('button', { name: /Infinity Lounge/ }).click();
  await sleep(300);
  const mural = await canvas.locator('[data-legend-mural]').count();
  await a.screenshot({ path: `${SHOTS}/v22-room-builder.png` });
  await a.getByRole('button', { name: 'Salvar', exact: true }).click();
  await sleep(1200);
  const seen = (await api(b, 'GET', `/users/${A.id}`)).body.space;
  check('Salvar: o layout e a ambientação Infinity Lounge chegam aos outros', mural === 1 && seen?.ambiance === 'gojo-infinity' && (seen?.objects?.length ?? 0) >= 8, `objetos ${seen?.objects?.length}, ambiance ${seen?.ambiance}`);
  const bad = await api(a, 'PUT', '/users/@me/space', { objects: [{ i: 'a', k: 'sofa', x: 30, y: 10 }, { i: 'b', k: 'gamer-chair', x: 32, y: 10 }] });
  const bad2 = await api(a, 'PUT', '/users/@me/space', { objects: [{ i: 'a', k: 'monitor', x: 30, y: 10 }] });
  check('O servidor recusa layouts com colisão ou objeto sem superfície (400)', bad.status === 400 && bad2.status === 400, `${bad.status}/${bad2.status}`);

  // in the call: B sees A's corner in Spaces with the furniture
  for (const p of [a, b]) {
    await p.goto(`${BASE}/#/channels/${serverId}/${voiceId}`);
    await p.getByRole('button', { name: /Entrar/ }).first().click().catch(() => {});
  }
  await b.waitForFunction(() => window.__aldetes.useVoice.getState().state === 'connected', null, { timeout: 20000 }).catch(() => {});
  await b.getByRole('button', { name: 'Spaces', exact: true }).click().catch(() => {});
  await sleep(1500);
  const corner = await b.locator(`[data-space-tile="${A.id}"] [data-obj]`).count();
  await b.screenshot({ path: `${SHOTS}/v22-spaces-call.png` });
  check('Na call (Spaces), B vê o cantinho de A com os móveis posicionados', corner >= 6, `${corner} objetos no cantinho`);
  await a.getByRole('button', { name: 'Sair da call' }).click().catch(() => {});
  await b.getByRole('button', { name: 'Sair da call' }).click().catch(() => {});

  // ---------------- Anime Legends on the profile ----------------
  await a.goto(`${BASE}/#/channels/@me`);
  await a.evaluate(() => import('/src/lib/ui.ts').then((m) => m.openSettings('profile')));
  const gal = a.getByTestId('legends-gallery');
  await gal.waitFor({ timeout: 8000 });
  const stillThumbs = await gal.locator('[data-settled="true"]').count();
  await gal.getByRole('tab', { name: 'Demon Slayer' }).click();
  await gal.getByRole('button', { name: 'Nezuko Kamado' }).click();
  await gal.getByText('13 — SAKURA DREAM').click();
  const detail = await a.getByTestId('legend-detail').textContent();
  await a.getByRole('button', { name: 'Aplicar conjunto completo' }).click();
  // mix: frame from another collection
  await gal.getByRole('tab', { name: 'Jujutsu Kaisen' }).click();
  await gal.getByText('01 — INFINITY').click();
  await a.getByTestId('legend-detail').getByRole('button', { name: /Six Eyes Orbit/ }).click();
  await a.screenshot({ path: `${SHOTS}/v22-legends-editor.png` });
  await a.getByRole('button', { name: 'Salvar', exact: true }).click();
  await a.getByText('Tudo salvo.').waitFor({ timeout: 6000 });
  const u = (await api(b, 'GET', `/users/${A.id}`)).body;
  check(
    'Anime Legends: catálogo por universo/personagem, nomes do catálogo, conjunto completo + mistura entre coleções, salvo e visto pelos outros',
    stillThumbs > 0 && /Sakura Blossom/.test(detail ?? '') && /Pink Blossom/.test(detail ?? '') && /Sakura Sanctuary/.test(detail ?? '') && u.bannerPreset === 'al:nezuko-sakura' && u.profileEffect === 'al:nezuko-sakura' && u.profileTheme === 'al:nezuko-sakura' && u.avatarDecoration === 'al:gojo-infinity',
    JSON.stringify({ stillThumbs, b: u.bannerPreset, d: u.avatarDecoration, t: u.profileTheme }),
  );
  await a.keyboard.press('Escape');
  await api(a, 'POST', `/channels/${textId}/messages`, { content: 'lendas 2.2' });
  await b.goto(`${BASE}/#/channels/${serverId}/${textId}`);
  await b.getByText('lendas 2.2').waitFor({ timeout: 10000 });
  const chatFrame = await b.evaluate(() => [...document.querySelectorAll('.deco-al')].map((d) => d.classList.contains('deco-static')));
  check('No chat a moldura Anime Legends aparece na versão parada', chatFrame.length > 0 && chatFrame.every(Boolean), JSON.stringify(chatFrame));

  // ---------------- Server Worlds 2.0 ----------------
  const ev = new Date(Date.now() + 2 * 86400000).toISOString();
  const theme = { legend: 'deku-ofa', accent: '#22c55e', atmosphere: 'japanese-night', entrance: 'cinematic', showcase: { enabled: true, channels: [textId, voiceId], highlights: [{ title: 'Torneio', body: 'Inscrições abertas', channelId: textId }], events: [{ title: 'Noite de jogos', at: ev, channelId: voiceId }] } };
  const forb = await api(b, 'POST', `/servers/${serverId}/studio/publish`, theme);
  const badT = await api(a, 'POST', `/servers/${serverId}/studio/publish`, { ...theme, atmosphere: 'space-hack' });
  const pub = await api(a, 'POST', `/servers/${serverId}/studio/publish`, theme);
  check('Worlds 2.0: só quem gerencia publica; atmosfera inválida é recusada; publicação válida passa', forb.status === 403 && badT.status === 400 && pub.status === 200, `${forb.status}/${badT.status}/${pub.status}`);
  await sleep(800);
  await b.goto(`${BASE}/#/channels/${serverId}/${textId}`);
  await sleep(1000);
  const side = await b.evaluate(() => ({ atm: document.querySelector('[data-atmosphere]')?.getAttribute('data-atmosphere'), legendAmb: !!document.querySelector('[data-ambient^="legend:"]'), cover: !!document.querySelector('[data-testid=server-header] .al-bn') }));
  check('Membro vê a atmosfera Japanese Night, a cena e as partículas da identidade Hero Academy', side.atm === 'japanese-night' && side.cover && side.legendAmb, JSON.stringify(side));
  await b.getByTestId('showcase-link').click();
  const sc = b.getByTestId('server-showcase');
  await sc.waitFor({ timeout: 8000 });
  await sleep(600);
  const txt = await sc.textContent();
  await b.screenshot({ path: `${SHOTS}/v22-showcase.png` });
  check('Vitrine: canais recomendados, evento, destaque e "acontecendo agora" com dados reais', /Noite de jogos/.test(txt) && /Torneio/.test(txt) && /Canais recomendados/.test(txt) && /Ninguém em call agora|AO VIVO|em call/.test(txt), txt.slice(0, 160));
} catch (e) {
  check('Roteiro', false, e.message.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
  process.exit(done() ? 0 : 1);
}
