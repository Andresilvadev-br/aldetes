// MultiView end to end: A and B share their screens, C watches in the "Livre" layout.
// Usage: node e2e/v2-multiview.mjs <shots>
import { launch, accounts, serverFor, pageFor, joinCall, check, done, sleep } from './lib/v2.mjs';

const SHOTS = process.argv[2] ?? './e2e-shots';
const browser = await launch(['--auto-select-desktop-capture-source=Entire screen', '--autoplay-policy=no-user-gesture-required']);
const share = async (p) => {
  await p.getByRole('button', { name: 'Tela', exact: true }).first().click();
  await p.getByRole('button', { name: /Começar transmissão/ }).click();
  await p.waitForFunction(() => window.__aldetes.useVoice.getState().screen === true, null, { timeout: 15000 });
};
try {
  const [A, B, C] = await accounts('mv', 3);
  const { serverId, voiceId } = await serverFor(A, [B, C]);
  const [a, b, c] = [await pageFor(browser, A), await pageFor(browser, B), await pageFor(browser, C)];
  for (const p of [a, b, c]) await joinCall(p, serverId, voiceId);
  await share(a);
  await share(b);
  await c.waitForFunction(() => document.querySelectorAll('[data-tile$=":screen_share"] video').length === 2, null, { timeout: 20000 });
  await c.getByRole('button', { name: 'Livre', exact: true }).click();
  await sleep(600);
  const keyA = `${A.id}:screen_share`;
  const keyB = `${B.id}:screen_share`;
  const tag = () => c.evaluate(() => document.querySelectorAll('[data-tile] video').forEach((v) => (v.__tag = v.__tag ?? Math.random())));
  const tags = () => c.evaluate(() => [...document.querySelectorAll('[data-tile] video')].map((v) => v.__tag ?? null));
  const sids = () => c.evaluate(() => [...window.__aldetes.getRoom().remoteParticipants.values()].map((p) => p.getTrackPublication('screen_share')?.trackSid).sort().join(','));
  await tag();
  const tags0 = await tags();
  const sids0 = await sids();
  const box = (k) => c.locator(`[data-tile="${k}"]`).boundingBox();

  // 1) drag by the grip and resize by the corner
  const b0 = await box(keyA);
  await c.locator(`[data-tile="${keyA}"]`).hover();
  const grip = c.locator(`[data-tile="${keyA}"] [aria-label="Arrastar a tela"]`);
  const g = await grip.boundingBox();
  await c.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await c.mouse.down();
  await c.mouse.move(g.x + g.width / 2 + 160, g.y + g.height / 2 + 70, { steps: 12 });
  await c.mouse.up();
  await sleep(500);
  const b1 = await box(keyA);
  await c.locator(`[data-tile="${keyA}"]`).hover();
  const corner = await c.locator(`[data-tile="${keyA}"] [aria-label="Redimensionar a tela"]`).boundingBox();
  await c.mouse.move(corner.x + 8, corner.y + 8);
  await c.mouse.down();
  await c.mouse.move(corner.x - 90, corner.y - 50, { steps: 10 });
  await c.mouse.up();
  await sleep(500);
  const b2 = await box(keyA);
  const sameVideos = JSON.stringify(await tags()) === JSON.stringify(tags0);
  const sameTracks = (await sids()) === sids0;
  await c.screenshot({ path: `${SHOTS}/v2-multiview-free.png` });
  check('Livre: arrastar move a tela e o canto redimensiona', Math.abs(b1.x - b0.x - 160) < 30 && Math.abs(b1.y - b0.y - 70) < 30 && b2.width < b1.width - 40, `x ${Math.round(b0.x)}→${Math.round(b1.x)} · largura ${Math.round(b1.width)}→${Math.round(b2.width)}`);
  check('… sem recriar os vídeos nem reassinar as transmissões', sameVideos && sameTracks);

  // 2) saved per user: after rejoining the call the tile goes back to the same place
  const saved = await c.evaluate(([me, k]) => JSON.parse(localStorage.getItem('aldetes.prefs')).multiview[me]?.rects[k], [C.id, keyA]);
  await c.reload();
  await joinCall(c, serverId, voiceId);
  await c.waitForFunction(() => document.querySelectorAll('[data-tile$=":screen_share"] video').length === 2, null, { timeout: 20000 });
  await sleep(800);
  const b3 = await box(keyA);
  check('Posição salva por usuário: depois de voltar para a call a tela está no mesmo lugar', !!saved && Math.abs(b3.x - b2.x) < 6 && Math.abs(b3.width - b2.width) < 6, `salvo ${JSON.stringify(saved)}`);

  // 3) minimize B's screen: video unsubscribed (bandwidth/decoding saved), chip to restore
  await c.locator(`[data-tile="${keyB}"]`).hover();
  await c.locator(`[data-tile="${keyB}"] [aria-label="Minimizar"]`).click();
  await sleep(1200);
  const sub = await c.evaluate((id) => window.__aldetes.getRoom().remoteParticipants.get(id)?.getTrackPublication('screen_share')?.isSubscribed, B.id);
  const chip = await c.locator('[aria-label="Telas minimizadas"] button').filter({ hasText: B.username }).isVisible();
  check('Minimizar: a tela sai do palco, o vídeo para de ser recebido e fica um atalho para voltar', sub === false && chip && (await c.locator(`[data-tile="${keyB}"]`).count()) === 0, `assinado: ${sub}`);
  await c.locator('[aria-label="Telas minimizadas"] button').filter({ hasText: B.username }).click();
  await sleep(500);
  console.log('   debug:', JSON.stringify(await c.evaluate((me) => ({ min: JSON.parse(localStorage.getItem('aldetes.prefs')).multiview[me]?.minimized, chips: [...document.querySelectorAll('[aria-label="Telas minimizadas"] button')].map((b) => b.textContent), tiles: [...document.querySelectorAll('[data-tile]')].map((t) => t.getAttribute('data-tile')) }), C.id)));
  await c.waitForFunction((k) => document.querySelector(`[data-tile="${k}"] video`), keyB, { timeout: 10000 }).catch(() => {});
  const back = await c.evaluate((id) => window.__aldetes.getRoom().remoteParticipants.get(id)?.getTrackPublication('screen_share')?.isSubscribed, B.id);
  check('Restaurar: a tela volta e o vídeo é recebido de novo (sem mexer na call)', back === true && (await c.locator(`[data-tile="${keyB}"] video`).count()) === 1);

  // 4) pin: in Grade, the pinned screen comes first
  await c.getByRole('button', { name: 'Grade', exact: true }).click();
  await c.locator(`[data-tile="${keyB}"]`).hover();
  await c.locator(`[data-tile="${keyB}"] [aria-label="Fixar no começo"]`).click();
  await sleep(700);
  const first = await c.evaluate(() => {
    const t = [...document.querySelectorAll('[data-tile$=":screen_share"]')].map((el) => ({ k: el.getAttribute('data-tile'), r: el.getBoundingClientRect() }));
    return t.sort((x, y) => x.r.y - y.r.y || x.r.x - y.r.x)[0]?.k;
  });
  check('Fixar: a tela fixada vem primeiro na grade', first === keyB, first);

  // 6) a stream ends: its tile leaves, no black screen left behind
  await b.getByRole('button', { name: 'Parar' }).first().click();
  await c.waitForFunction((k) => !document.querySelector(`[data-tile="${k}"]`), keyB, { timeout: 15000 }).catch(() => {});
  await sleep(800);
  const left = await c.locator('[data-tile$=":screen_share"]').count();
  check('Transmissão encerrada: a tela sai do palco (sem bloco preto) e a outra continua', left === 1);
} catch (e) {
  check('Roteiro', false, e.message.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
  process.exit(done() ? 0 : 1);
}
