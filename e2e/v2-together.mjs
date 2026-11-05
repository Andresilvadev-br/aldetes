// Together end to end (light: A and B in the call, C in the server but not in the call).
// Usage: node e2e/v2-together.mjs <shots>
import { launch, accounts, serverFor, pageFor, joinCall, api, check, done, sleep } from './lib/v2.mjs';

const SHOTS = process.argv[2] ?? './e2e-shots';
const browser = await launch();
try {
  const [A, B, C] = await accounts('tg', 3);
  const { serverId, voiceId } = await serverFor(A, [B, C]);
  const a = await pageFor(browser, A);
  const b = await pageFor(browser, B);
  const c = await pageFor(browser, C);
  await joinCall(a, serverId, voiceId);
  await joinCall(b, serverId, voiceId);

  // 1) poll through the UI: A creates, B votes, A sees the result live
  await a.getByRole('button', { name: /^Together/ }).click();
  await b.getByRole('button', { name: /^Together/ }).click();
  await a.getByRole('button', { name: 'Nova' }).click();
  await a.getByLabel('Pergunta da enquete').fill('Qual jogo hoje?');
  await a.getByLabel('Opção 1').fill('Valorant');
  await a.getByLabel('Opção 2').fill('Minecraft');
  await a.getByRole('button', { name: 'Criar enquete' }).click();
  await b.getByRole('button', { name: /Minecraft/ }).click({ timeout: 8000 });
  const seen = await a.getByText('Minecraft').locator('..').getByText(/1 · 100%/).waitFor({ timeout: 6000 }).then(() => true, () => false);
  await a.screenshot({ path: `${SHOTS}/v2-together-poll.png` });
  check('Enquete: A cria pelo painel, B vota, A vê o resultado em tempo real', seen);

  const list = (await api(a, 'GET', `/channels/${voiceId}/together`)).body.sessions;
  const poll = list.find((s) => s.kind === 'poll');
  await api(b, 'POST', `/together/${poll.id}/op`, { opId: 'votoBx00001', op: { type: 'vote', option: 0 } });
  await api(b, 'POST', `/together/${poll.id}/op`, { opId: 'votoBx00002', op: { type: 'vote', option: 1 } });
  const after = (await api(a, 'GET', `/channels/${voiceId}/together`)).body.sessions.find((s) => s.id === poll.id);
  check('Um voto por conta (votar de novo troca o voto, não soma)', Object.keys(after.state.poll.votes).length === 1 && after.state.poll.votes[B.id] === 1, JSON.stringify(after.state.poll.votes));

  // 2) permissions are checked on the server
  const outsider = await api(c, 'POST', `/together/${poll.id}/op`, { opId: 'votoCx00001', op: { type: 'vote', option: 0 } });
  const outsiderCreate = await api(c, 'POST', `/channels/${voiceId}/together`, { kind: 'timer', minutes: 5 });
  check('Quem não está na call não vota nem cria (403 direto na API)', outsider.status === 403 && outsiderCreate.status === 403, `${outsider.status}/${outsiderCreate.status}`);

  // 3) timer: creator controls, server clock, same time for both
  const timer = (await api(a, 'POST', `/channels/${voiceId}/together`, { kind: 'timer', label: 'Foco', minutes: 25 })).body.session;
  const bStart = await api(b, 'POST', `/together/${timer.id}/op`, { opId: 'timerB00001', op: { type: 'timer', action: 'start' } });
  await api(a, 'POST', `/together/${timer.id}/op`, { opId: 'timerA00001', op: { type: 'timer', action: 'start' } });
  await sleep(2500);
  await a.getByRole('tab', { name: /Foco/ }).click();
  await b.getByRole('tab', { name: /Foco/ }).click();
  await sleep(400);
  const [ta, tb] = await Promise.all([a.getByRole('timer').textContent(), b.getByRole('timer').textContent()]);
  const secs = (t) => +t.split(':')[0] * 60 + +t.split(':')[1];
  check('Cronômetro: só quem criou controla (403 para B) e os dois veem o mesmo tempo (relógio do servidor, ±1 s)', bStart.status === 403 && Math.abs(secs(ta) - secs(tb)) <= 1 && ta !== '25:00', `A ${ta} · B ${tb}`);

  // 4) notes: two saves on the same version → the second one gets 409, nothing overwritten silently
  const notes = (await api(a, 'POST', `/channels/${voiceId}/together`, { kind: 'notes', title: 'Plano' })).body.session;
  const n1 = await api(a, 'POST', `/together/${notes.id}/op`, { opId: 'notesA00001', baseVersion: notes.version, op: { type: 'replace', text: 'texto da A' } });
  const n2 = await api(b, 'POST', `/together/${notes.id}/op`, { opId: 'notesB00001', baseVersion: notes.version, op: { type: 'replace', text: 'texto do B' } });
  check('Notas: dois editores na mesma versão → o segundo recebe conflito (409) com o texto atual, nada se perde', n1.status === 200 && n2.status === 409 && n2.body.session.state.notes.text === 'texto da A', `${n1.status}/${n2.status}`);

  // 5) replays are not applied twice
  const board = (await api(a, 'POST', `/channels/${voiceId}/together`, { kind: 'board', title: 'Ideias' })).body.session;
  const stroke = { opId: 'strokeA0001', op: { type: 'stroke', id: 'st-0001', tool: 'pen', color: '#ff2d78', width: 3, points: [[0.1, 0.1], [0.5, 0.5]] } };
  await api(a, 'POST', `/together/${board.id}/op`, stroke);
  const dup = await api(a, 'POST', `/together/${board.id}/op`, stroke);
  const items = (await api(a, 'GET', `/channels/${voiceId}/together`)).body.sessions.find((s) => s.id === board.id).state.board.items.length;
  check('Repetição (mesmo opId depois de reconectar) não duplica a ação', dup.body.duplicate === true && items === 1, `itens ${items}`);
  const notMine = await api(b, 'POST', `/together/${board.id}/op`, { opId: 'eraseB00001', op: { type: 'erase', ids: ['st-0001'] } });
  check('Quadro: B não apaga o traço de A (403); limites e permissões no servidor', notMine.status === 403, `status ${notMine.status}`);

  // 6) B drops offline, A changes the notes, B comes back → B has the current version
  await b.getByRole('tab', { name: /Plano/ }).click();
  await b.context().setOffline(true);
  await sleep(1500);
  const cur = (await api(a, 'GET', `/channels/${voiceId}/together`)).body.sessions.find((s) => s.id === notes.id);
  await api(a, 'POST', `/together/${notes.id}/op`, { opId: 'notesA00002', baseVersion: cur.version, op: { type: 'replace', text: 'versão nova enquanto B estava fora' } });
  await sleep(1000);
  await b.context().setOffline(false);
  const resync = await b.waitForFunction(() => document.querySelector('textarea[aria-label="Notas compartilhadas"]')?.value === 'versão nova enquanto B estava fora', null, { timeout: 20000 }).then(() => true, () => false);
  check('Queda de rede: ao voltar, B recebe as notas na versão atual (sem duplicar nada)', resync);

  // 7) a very busy board does not delay the call controls (compared with the same click without load)
  // measured inside the page: click → first painted frame where the button shows the new state
  const muteLatency = () =>
    a.evaluate(async () => {
      const btn = () => [...document.querySelectorAll('button[aria-label="Microfone"]')].at(-1);
      const once = async (want) => {
        const t = performance.now();
        btn().click();
        while (btn().getAttribute('aria-pressed') !== want) await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));
        return performance.now() - t;
      };
      const ms = await once('true');
      await once('false');
      return Math.round(ms);
    });
  const idle = Math.min(await muteLatency(), await muteLatency());
  const spam = a.evaluate(async (sid) => {
    for (let i = 0; i < 60; i++)
      void fetch(`/api/together/${sid}/op`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'X-Aldetes-Client': 'web' }, body: JSON.stringify({ opId: `spam${i}x${Date.now()}`, op: { type: 'stroke', id: `sp-${i}-${Date.now()}`, tool: 'pen', color: '#22d3ee', width: 3, points: Array.from({ length: 200 }, (_, k) => [k / 200, Math.random()]) } }) });
  }, board.id);
  await sleep(150);
  const busy = await muteLatency();
  await spam;
  check('Quadro muito ativo não atrasa o microfone (mutar responde quase igual a sem carga)', busy <= idle + 150, `sem carga ${idle} ms · com o quadro lotado ${busy} ms (medido dentro da página até o quadro pintado)`);
} catch (e) {
  check('Roteiro', false, e.message.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
  process.exit(done() ? 0 : 1);
}
