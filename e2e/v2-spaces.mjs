// Spaces end to end: real call with 1 → 2 → 4 → 6 → 10 people (headless browsers, fake mic), observed by A.
// Proves: the call never waits for the scene; layout follows the spec table; a newcomer adds only their corner
// (existing tiles are the SAME DOM nodes); leaving removes one tile; Clássico ↔ Spaces 30× with no reconnect,
// no duplicated audio, no node/listener/heap growth; editing my corner reaches the others; skeleton when not cached.
// Usage: node e2e/v2-spaces.mjs <shots>   (API with RATE_LIMIT_DISABLED=true for 11 accounts)
import { BASE, launch, accounts, serverFor, pageFor, joinCall, api, check, done, sleep, measure } from './lib/v2.mjs';

const SHOTS = process.argv[2] ?? './e2e-shots';
const browser = await launch();
const pages = [];
try {
  const accs = await accounts('sp', 10);
  const [A, ...rest] = accs;
  const { serverId, voiceId } = await serverFor(A, rest);
  const a = await pageFor(browser, A);
  pages.push(a);

  // 1) entering the call: controls work before any scene (Spaces is opt-in, classic by default)
  const t0 = Date.now();
  await joinCall(a, serverId, voiceId);
  const joinMs = Date.now() - t0;
  const micReady = await a.getByRole('button', { name: 'Microfone' }).last().isEnabled();
  check('Entrar na call: conectado e microfone disponível antes de qualquer cenário', micReady, `${joinMs} ms até "conectado" (inclui abrir a página)`);
  await a.getByRole('button', { name: 'Spaces', exact: true }).click();
  await a.locator('[data-testid=spaces-view]').waitFor({ timeout: 8000 }).catch(async (e) => {
    await a.screenshot({ path: `${SHOTS}/v2-debug-spaces.png` });
    console.log('call-view:', await a.evaluate(() => document.querySelector('[data-call-view]')?.getAttribute('data-call-view')));
    throw e;
  });
  const roomSid = await a.evaluate(() => window.__aldetes.getRoom().name + ':' + window.__aldetes.getRoom().localParticipant.sid);

  // tag the DOM node of each tile with a JS property: if React remounts it, the property is gone
  const tagAll = () => a.evaluate(() => document.querySelectorAll('[data-space-tile]').forEach((el) => (el.__tag = el.__tag ?? Math.random())));
  const tags = () => a.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-space-tile]')].map((el) => [el.getAttribute('data-space-tile'), el.__tag ?? null])));
  const cols = () => a.evaluate(() => getComputedStyle(document.querySelector('[data-testid=spaces-view] > div')).gridTemplateColumns.split(' ').length);

  const expectCols = { 1: 1, 2: 2, 4: 2, 6: 3, 10: 5 };
  let joined = 1;
  for (const target of [2, 4, 6, 10]) {
    await tagAll();
    const before = await tags();
    while (joined < target) {
      const p = await pageFor(browser, rest[joined - 1]);
      pages.push(p);
      await joinCall(p, serverId, voiceId);
      // they keep talking but look at a text channel (lighter for this 4-core machine; the call continues)
      await p.goto(`${BASE}/#/channels/${serverId}`);
      joined++;
    }
    await a.waitForFunction((n) => document.querySelectorAll('[data-space-tile]').length === n, target, { timeout: 30000 }).catch(() => {});
    await sleep(700);
    const after = await tags();
    const kept = Object.keys(before).every((id) => after[id] === before[id]);
    const n = Object.keys(after).length;
    const c = await cols();
    await a.screenshot({ path: `${SHOTS}/v2-spaces-${target}.png` });
    check(`Spaces com ${target} pessoas: ${n} cantinhos, grade de ${c} colunas, os que já estavam não piscaram (mesmos nós)`, n === target && c === expectCols[target] && kept, `colunas ${c} (esperado ${expectCols[target]}) · mantidos: ${kept}`);
  }
  const sameRoom = (await a.evaluate(() => window.__aldetes.getRoom().name + ':' + window.__aldetes.getRoom().localParticipant.sid)) === roomSid;
  check('A conexão de A não foi refeita enquanto 9 pessoas entraram', sameRoom);

  // 2) someone leaves → only their tile goes
  await tagAll();
  const beforeLeave = await tags();
  const leaver = rest[8];
  await pages[9].goto(`${BASE}/#/channels/${serverId}/${voiceId}`);
  await pages[9].getByRole('button', { name: 'Sair da call' }).last().click();
  await a.waitForFunction((id) => !document.querySelector(`[data-space-tile="${id}"]`), leaver.id, { timeout: 20000 }).catch(() => {});
  await sleep(600);
  const afterLeave = await tags();
  const keptLeave = Object.keys(afterLeave).every((id) => afterLeave[id] === beforeLeave[id]);
  check('Alguém sai: só o cantinho dele some, os outros 8 continuam (mesmos nós)', !afterLeave[leaver.id] && Object.keys(afterLeave).length === 9 && keptLeave, `${Object.keys(afterLeave).length} cantinhos`);

  // 3) Clássico ↔ Spaces 30 times: no reconnect, no duplicated audio, no growth
  const audioCount = () => a.evaluate(() => document.querySelectorAll('audio').length);
  const audio0 = await audioCount();
  const cdp = await a.context().newCDPSession(a);
  await cdp.send('Performance.enable');
  const metric = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  };
  const m0 = await metric();
  let reconnects = 0;
  await a.evaluate(() => {
    window.__rc = 0;
    window.__aldetes.getRoom().on('reconnecting', () => window.__rc++);
  });
  for (let i = 0; i < 30; i++) {
    await a.getByRole('button', { name: i % 2 ? 'Spaces' : 'Clássico', exact: true }).click();
    await sleep(120);
  }
  await a.getByRole('button', { name: 'Spaces', exact: true }).click();
  await sleep(1500);
  reconnects = await a.evaluate(() => window.__rc);
  const m1 = await metric();
  const audio1 = await audioCount();
  const room1 = (await a.evaluate(() => window.__aldetes.getRoom().name + ':' + window.__aldetes.getRoom().localParticipant.sid)) === roomSid;
  const dNodes = m1.Nodes - m0.Nodes;
  const dListeners = m1.JSEventListeners - m0.JSEventListeners;
  const dHeap = (m1.JSHeapUsedSize - m0.JSHeapUsedSize) / 1048576;
  check('Clássico ↔ Spaces 30 vezes: mesma conexão, sem reconectar, sem áudio duplicado', room1 && reconnects === 0 && audio1 === audio0, `áudios ${audio0}→${audio1} · reconexões ${reconnects}`);
  check('… e sem vazamento: nós, listeners e memória voltam ao mesmo patamar', dNodes < 300 && dListeners < 40 && dHeap < 4, `Δnós ${dNodes} · Δlisteners ${dListeners} · Δheap ${dHeap.toFixed(2)} MB`);

  // 4) B edits their corner → A sees it; nobody else's tile re-mounts
  const B = rest[0];
  await tagAll();
  const beforeEdit = await tags();
  const r = await api(pages[1], 'PUT', '/users/@me/space', { preset: 'gamer', accent: '#ff2d78', lighting: 'neon', backdrop: 'b', items: ['desk', 'monitors', 'chair', 'neon'], animated: true, avatarPos: 'center' });
  await a.waitForFunction((id) => document.querySelector(`[data-space-tile="${id}"] [data-preset]`)?.getAttribute('data-preset') === 'gamer', B.id, { timeout: 8000 }).catch(() => {});
  const preset = await a.evaluate((id) => document.querySelector(`[data-space-tile="${id}"] [data-preset]`)?.getAttribute('data-preset'), B.id);
  const afterEdit = await tags();
  const others = Object.keys(beforeEdit).every((id) => afterEdit[id] === beforeEdit[id]);
  check('B muda o cantinho: A vê o novo cenário na hora e nenhum outro cantinho remonta', r.status === 200 && preset === 'gamer' && others, `preset em A: ${preset}`);
  const forged = await api(pages[1], 'PUT', '/users/@me/space', { preset: 'castelo', items: ['<script>'] });
  check('Cenário inválido é recusado pelo servidor (só presets e itens conhecidos)', forged.status === 400, `status ${forged.status}`);

  // 5) friend's scene not cached → skeleton immediately, real corner after (network slowed on purpose)
  const C = rest[1];
  await a.route(`**/api/users/${C.id}`, async (route) => {
    await sleep(1500);
    await route.continue();
  });
  await a.evaluate(async (id) => {
    window.__spaces.forgetScene(id);
    const st = window.__aldetes.useStore.getState();
    const users = { ...st.users };
    delete users[id];
    window.__aldetes.useStore.setState({ users });
  }, C.id);
  await sleep(300);
  const skeleton = await a.locator(`[data-space-tile="${C.id}"] [aria-busy]`).count();
  const micWhileLoading = await a.getByRole('button', { name: 'Microfone' }).last().isEnabled();
  await a.waitForSelector(`[data-space-tile="${C.id}"] [data-preset]`, { timeout: 8000 }).catch(() => {});
  const loaded = await a.locator(`[data-space-tile="${C.id}"] [data-preset]`).count();
  await a.unroute(`**/api/users/${C.id}`);
  check('Cena fora do cache: esqueleto na hora, controles da call funcionando, cantinho real quando chega', skeleton === 1 && micWhileLoading && loaded === 1, `esqueleto ${skeleton} · carregado ${loaded}`);

  // 6) cost with 9 people: alternate Clássico/Spaces twice, compare medians (same machine, same load)
  const runs = { classic: [], spaces: [] };
  for (const mode of ['classic', 'spaces', 'classic', 'spaces', 'classic', 'spaces']) {
    await a.getByRole('button', { name: mode === 'classic' ? 'Clássico' : 'Spaces', exact: true }).click();
    await sleep(1500);
    runs[mode].push(await measure(a, 6000));
  }
  const med = (arr, k) => +[...arr].map((x) => x[k]).sort((x, y) => x - y)[1].toFixed(1);
  const c = { cpu: med(runs.classic, 'cpu'), p95: med(runs.classic, 'p95'), heap: med(runs.classic, 'heapMB') };
  const sp = { cpu: med(runs.spaces, 'cpu'), p95: med(runs.spaces, 'p95'), heap: med(runs.spaces, 'heapMB') };
  console.log(`   custo com 9 pessoas (mediana de 3) — clássico: CPU ${c.cpu}% · p95 ${c.p95} ms · heap ${c.heap} MB | Spaces: CPU ${sp.cpu}% · p95 ${sp.p95} ms · heap ${sp.heap} MB`);
  check('Spaces com 9 pessoas custa o mesmo que o clássico (CPU e quadro p95 dentro de +20%)', sp.cpu <= c.cpu * 1.2 + 1 && sp.p95 <= c.p95 * 1.2 + 2, `CPU ${c.cpu}→${sp.cpu}% · p95 ${c.p95}→${sp.p95} ms`);
  await a.screenshot({ path: `${SHOTS}/v2-spaces-9.png` });
} catch (e) {
  check('Roteiro', false, e.message.split('\n').slice(0, 6).join(' / '));
} finally {
  await browser.close();
  process.exit(done() ? 0 : 1);
}
