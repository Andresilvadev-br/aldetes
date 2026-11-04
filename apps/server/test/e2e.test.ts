import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Permissions } from '@aldetes/shared';
import { startApp, Client, type TestEnv } from './helpers';

let env: TestEnv;
let alice: Client;
let bob: Client;
let carol: Client;
let serverId: string;
let generalId: string;
let voiceId: string;
let inviteCode: string;

beforeAll(async () => {
  env = await startApp();
  alice = new Client(env.base);
  bob = new Client(env.base);
  carol = new Client(env.base);
});
afterAll(async () => {
  for (const c of [alice, bob, carol]) c?.disconnect();
  await env?.close();
});

describe('contas', () => {
  it('cadastra dois usuários distintos', async () => {
    await alice.register('alice');
    await bob.register('bob');
    await carol.register('carol');
    expect(alice.user.id).not.toBe(bob.user.id);
  });

  it('rejeita nome de usuário duplicado e senha fraca', async () => {
    const c = new Client(env.base);
    expect((await c.req('POST', '/auth/register', { email: 'x@teste.dev', username: 'alice', password: 'senha-forte-123' })).status).toBe(409);
    expect((await c.req('POST', '/auth/register', { email: 'y@teste.dev', username: 'yy', password: '123' })).status).toBe(400);
  });

  it('login por e-mail e por usuário; senha errada falha', async () => {
    const c = new Client(env.base);
    expect((await c.req('POST', '/auth/login', { login: 'alice@teste.dev', password: 'senha-forte-123' })).status).toBe(200);
    const r = await c.req('POST', '/auth/login', { login: 'bob', password: 'senha-forte-123' }, 200);
    expect(r.data.user.username).toBe('bob');
    expect((await c.req('POST', '/auth/login', { login: 'bob', password: 'errada' })).status).toBe(401);
  });

  it('senhas são armazenadas com Argon2id', async () => {
    const u = await env.built.ctx.db.user.findUniqueOrThrow({ where: { username: 'alice' } });
    expect(u.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('lista e revoga sessões (dispositivos)', async () => {
    const other = new Client(env.base);
    const r = await other.req('POST', '/auth/login', { login: 'alice', password: 'senha-forte-123', deviceName: 'Teste' }, 200);
    other.token = r.data.token;
    const list = await alice.req('GET', '/auth/sessions', undefined, 200);
    const target = list.data.find((s: any) => s.deviceName === 'Teste');
    expect(target).toBeTruthy();
    await alice.req('DELETE', `/auth/sessions/${target.id}`, undefined, 200);
    expect((await other.req('GET', '/users/@me')).status).toBe(401);
  });

  it('sessão ativa se renova sozinha (manter conectado)', async () => {
    const c = new Client(env.base);
    const r = await c.req('POST', '/auth/login', { login: 'bob', password: 'senha-forte-123', deviceName: 'Renova' }, 200);
    c.token = r.data.token;
    const { sha256 } = await import('../src/lib/crypto');
    const db = env.built.ctx.db;
    const soon = new Date(Date.now() + 2 * 86400_000);
    await db.session.update({ where: { tokenHash: sha256(c.token) }, data: { expiresAt: soon } });
    await env.built.ctx.redis.del(`sess:${sha256(c.token)}`);
    await c.req('GET', '/users/@me', undefined, 200);
    const s = await db.session.findUniqueOrThrow({ where: { tokenHash: sha256(c.token) } });
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now() + 20 * 86400_000);
    // sessão sem "manter conectado" não é renovada
    const r2 = await c.req('POST', '/auth/login', { login: 'bob', password: 'senha-forte-123', remember: false }, 200);
    await db.session.update({ where: { tokenHash: sha256(r2.data.token) }, data: { expiresAt: soon } });
    const c2 = new Client(env.base);
    c2.token = r2.data.token;
    await c2.req('GET', '/users/@me', undefined, 200);
    const s2 = await db.session.findUniqueOrThrow({ where: { tokenHash: sha256(c2.token) } });
    expect(s2.expiresAt.getTime()).toBe(soon.getTime());
  });

  it('redefinição de senha via token', async () => {
    const c = new Client(env.base);
    await c.register('dave');
    await c.req('POST', '/auth/forgot-password', { email: 'dave@teste.dev' }, 200);
    // e-mail é enviado por SMTP; no teste geramos o token diretamente pelo mesmo caminho do código
    const { randomToken, sha256 } = await import('../src/lib/crypto');
    const token = randomToken();
    const reset = await env.built.ctx.db.passwordReset.findFirstOrThrow({ where: { user: { username: 'dave' } } });
    await env.built.ctx.db.passwordReset.update({ where: { id: reset.id }, data: { tokenHash: sha256(token) } });
    await c.req('POST', '/auth/reset-password', { token, password: 'nova-senha-456' }, 200);
    expect((await c.req('GET', '/users/@me')).status).toBe(401); // sessões revogadas
    await c.req('POST', '/auth/login', { login: 'dave', password: 'nova-senha-456' }, 200);
    expect((await c.req('POST', '/auth/reset-password', { token, password: 'outra-senha-789' })).status).toBe(400); // uso único
  });
});

describe('servidores, convites e mensagens em tempo real', () => {
  it('conecta ao gateway e recebe READY', async () => {
    const ready = await alice.connect();
    expect(ready.user.username).toBe('alice');
    await bob.connect();
    await carol.connect();
  });

  it('alice cria servidor com canais padrão', async () => {
    const r = await alice.req('POST', '/servers', { name: 'Servidor da Alice' }, 201);
    serverId = r.data.id;
    generalId = r.data.channels.find((c: any) => c.type === 'text').id;
    voiceId = r.data.channels.find((c: any) => c.type === 'voice').id;
    expect(r.data.channels.length).toBe(4);
    expect(BigInt(r.data.myPermissions) & Permissions.ADMINISTRATOR).toBe(Permissions.ADMINISTRATOR);
  });

  it('bob não vê o servidor antes de entrar', async () => {
    expect((await bob.req('GET', `/servers/${serverId}`)).status).toBe(404);
    expect((await bob.req('GET', `/channels/${generalId}/messages`)).status).toBe(404);
  });

  it('convite com limite de usos', async () => {
    const r = await alice.req('POST', `/channels/${generalId}/invites`, { maxUses: 1, maxAgeSeconds: 3600 }, 201);
    inviteCode = r.data.code;
    const preview = await new Client(env.base).req('GET', `/invites/${inviteCode}`, undefined, 200);
    expect(preview.data.server.name).toBe('Servidor da Alice');
    const joined = await bob.req('POST', `/invites/${inviteCode}`, undefined, 200);
    expect(joined.data.id).toBe(serverId);
    await bob.waitFor('server:join', (d) => d.id === serverId);
    await alice.waitFor('member:add', (d) => d.userId === bob.user.id);
    // esgotado para carol
    expect((await carol.req('POST', `/invites/${inviteCode}`)).status).toBe(404);
  });

  it('troca de mensagens em tempo real', async () => {
    const sent = await bob.req('POST', `/channels/${generalId}/messages`, { content: 'Oi Alice!', nonce: 'n1' }, 201);
    const got = await alice.waitFor('message:create', (m) => m.id === sent.data.id);
    expect(got.content).toBe('Oi Alice!');
    expect(got.author.username).toBe('bob');
    const reply = await alice.req('POST', `/channels/${generalId}/messages`, { content: `Olá <@${bob.user.id}>`, replyToId: sent.data.id }, 201);
    const got2 = await bob.waitFor('message:create', (m) => m.id === reply.data.id);
    expect(got2.replyTo.id).toBe(sent.data.id);
    expect(got2.mentions).toContain(bob.user.id);
  });

  it('nonce evita duplicação ao reenviar após reconexão', async () => {
    const a = await bob.req('POST', `/channels/${generalId}/messages`, { content: 'idempotente', nonce: 'retry-1' }, 201);
    const b = await bob.req('POST', `/channels/${generalId}/messages`, { content: 'idempotente', nonce: 'retry-1' }, 201);
    expect(a.data.id).toBe(b.data.id);
    const count = await env.built.ctx.db.message.count({ where: { nonce: 'retry-1' } });
    expect(count).toBe(1);
  });

  it('paginação do histórico', async () => {
    for (let i = 0; i < 12; i++) await alice.req('POST', `/channels/${generalId}/messages`, { content: `msg ${i}` }, 201);
    const page1 = await alice.req('GET', `/channels/${generalId}/messages?limit=5`, undefined, 200);
    expect(page1.data.length).toBe(5);
    expect(page1.data[0].content).toBe('msg 11');
    const page2 = await alice.req('GET', `/channels/${generalId}/messages?limit=5&before=${page1.data[4].id}`, undefined, 200);
    expect(page2.data[0].content).toBe('msg 6');
  });

  it('indicador de digitação', async () => {
    alice.socket!.emit('typing', { channelId: generalId });
    const t = await bob.waitFor('typing:start', (d) => d.userId === alice.user.id);
    expect(t.channelId).toBe(generalId);
  });

  it('edição, reações, fixar e exclusão', async () => {
    const m = await bob.req('POST', `/channels/${generalId}/messages`, { content: 'erro de digitaçao' }, 201);
    await bob.req('PATCH', `/channels/${generalId}/messages/${m.data.id}`, { content: 'erro de digitação' }, 200);
    const upd = await alice.waitFor('message:update', (d) => d.id === m.data.id);
    expect(upd.editedAt).toBeTruthy();
    // alice não pode editar mensagem do bob
    expect((await alice.req('PATCH', `/channels/${generalId}/messages/${m.data.id}`, { content: 'hack' })).status).toBe(403);
    await alice.req('PUT', `/channels/${generalId}/messages/${m.data.id}/reactions/${encodeURIComponent('👍')}/@me`, undefined, 200);
    await bob.waitFor('reaction:update', (d) => d.emoji === '👍' && d.add);
    // bob (sem MANAGE_MESSAGES) não pode fixar
    expect((await bob.req('PUT', `/channels/${generalId}/pins/${m.data.id}`)).status).toBe(403);
    await alice.req('PUT', `/channels/${generalId}/pins/${m.data.id}`, undefined, 200);
    const pins = await bob.req('GET', `/channels/${generalId}/pins`, undefined, 200);
    expect(pins.data.map((p: any) => p.id)).toContain(m.data.id);
    // alice (moderadora) apaga mensagem do bob
    await alice.req('DELETE', `/channels/${generalId}/messages/${m.data.id}`, undefined, 200);
    await bob.waitFor('message:delete', (d) => d.id === m.data.id);
  });

  it('busca de mensagens respeita canais visíveis', async () => {
    const r = await bob.req('GET', `/search/messages?serverId=${serverId}&q=Oi%20Alice`, undefined, 200);
    expect(r.data.total).toBeGreaterThanOrEqual(1);
    expect((await carol.req('GET', `/search/messages?channelId=${generalId}&q=Oi`)).status).toBe(404);
  });
});

describe('permissões validadas no backend', () => {
  let privateId: string;

  it('membro comum não pode criar canais nem cargos', async () => {
    expect((await bob.req('POST', `/servers/${serverId}/channels`, { name: 'hack', type: 'text' })).status).toBe(403);
    expect((await bob.req('POST', `/servers/${serverId}/roles`, { name: 'hack' })).status).toBe(403);
    expect((await bob.req('PATCH', `/servers/${serverId}`, { name: 'hack' })).status).toBe(403);
  });

  it('canal privado fica invisível para quem não tem acesso', async () => {
    const c = await alice.req('POST', `/servers/${serverId}/channels`, { name: 'staff', type: 'text' }, 201);
    privateId = c.data.id;
    await bob.waitFor('channel:create', (d) => d.id === privateId);
    const everyone = (await alice.req('GET', `/servers/${serverId}`, undefined, 200)).data.roles.find((r: any) => r.isEveryone);
    await alice.req('PUT', `/channels/${privateId}/permissions/role/${everyone.id}`, { allow: '0', deny: Permissions.VIEW_CHANNEL.toString() }, 200);
    await bob.waitFor('channel:delete', (d) => d.id === privateId);
    expect((await bob.req('GET', `/channels/${privateId}/messages`)).status).toBe(404);
    expect((await bob.req('POST', `/channels/${privateId}/messages`, { content: 'x' })).status).toBe(404);
    const srv = await bob.req('GET', `/servers/${serverId}`, undefined, 200);
    expect(srv.data.channels.map((c: any) => c.id)).not.toContain(privateId);
    // mensagens no canal privado não chegam ao bob
    const secret = await alice.req('POST', `/channels/${privateId}/messages`, { content: 'segredo' }, 201);
    await new Promise((r) => setTimeout(r, 300));
    expect(bob.events.some((e) => e.event === 'message:create' && e.data.id === secret.data.id)).toBe(false);
  });

  it('cargo com permissão concede acesso e hierarquia é respeitada', async () => {
    const role = await alice.req('POST', `/servers/${serverId}/roles`, { name: 'Moderador', color: '#3498db', permissions: (Permissions.KICK_MEMBERS | Permissions.MANAGE_MESSAGES).toString() }, 200);
    await alice.req('PUT', `/channels/${privateId}/permissions/role/${role.data.id}`, { allow: Permissions.VIEW_CHANNEL.toString(), deny: '0' }, 200);
    await alice.req('PUT', `/servers/${serverId}/members/${bob.user.id}/roles/${role.data.id}`, undefined, 200);
    await bob.waitFor('member:update', (d) => d.userId === bob.user.id && d.roleIds.includes(role.data.id));
    expect((await bob.req('GET', `/channels/${privateId}/messages`)).status).toBe(200);
    // bob não pode expulsar a dona
    expect((await bob.req('DELETE', `/servers/${serverId}/members/${alice.user.id}`)).status).toBe(403);
    // bob não pode conceder ADMINISTRATOR a si mesmo
    expect((await bob.req('PATCH', `/servers/${serverId}/roles/${role.data.id}`, { permissions: Permissions.ADMINISTRATOR.toString() })).status).toBe(403);
  });

  it('expulsar, banir e desbanir', async () => {
    // carol entra via novo convite
    const inv = await alice.req('POST', `/channels/${generalId}/invites`, {}, 201);
    await carol.req('POST', `/invites/${inv.data.code}`, undefined, 200);
    await carol.waitFor('server:join', (d) => d.id === serverId);
    // bob (moderador com KICK) expulsa carol
    await bob.req('DELETE', `/servers/${serverId}/members/${carol.user.id}`, {}, 200);
    await carol.waitFor('server:leave', (d) => d.id === serverId);
    expect((await carol.req('GET', `/channels/${generalId}/messages`)).status).toBe(404);
    // bob não tem BAN
    expect((await bob.req('PUT', `/servers/${serverId}/bans/${carol.user.id}`, {})).status).toBe(403);
    await alice.req('PUT', `/servers/${serverId}/bans/${carol.user.id}`, { reason: 'teste' }, 200);
    expect((await carol.req('POST', `/invites/${inv.data.code}`)).status).toBe(403);
    await alice.req('DELETE', `/servers/${serverId}/bans/${carol.user.id}`, undefined, 200);
    await carol.req('POST', `/invites/${inv.data.code}`, undefined, 200);
  });

  it('castigo (timeout) impede envio de mensagens', async () => {
    await alice.req('PUT', `/servers/${serverId}/members/${carol.user.id}/timeout`, { durationSeconds: 60 }, 200);
    expect((await carol.req('POST', `/channels/${generalId}/messages`, { content: 'oi' })).status).toBe(403);
    await alice.req('PUT', `/servers/${serverId}/members/${carol.user.id}/timeout`, { durationSeconds: 0 }, 200);
    await carol.req('POST', `/channels/${generalId}/messages`, { content: 'voltei' }, 201);
  });

  it('registro de auditoria', async () => {
    const r = await alice.req('GET', `/servers/${serverId}/audit-logs`, undefined, 200);
    const actions = r.data.entries.map((e: any) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['member_kick', 'member_ban', 'member_unban', 'role_create', 'member_timeout']));
    expect((await carol.req('GET', `/servers/${serverId}/audit-logs`)).status).toBe(403);
  });

  it('token de voz só é emitido com permissão CONNECT', async () => {
    const ok = await bob.req('POST', `/voice/${voiceId}/join`, undefined, 200);
    expect(ok.data.token).toBeTruthy();
    expect((await bob.req('POST', `/voice/${generalId}/join`)).status).toBe(400);
    const everyone = (await alice.req('GET', `/servers/${serverId}`, undefined, 200)).data.roles.find((r: any) => r.isEveryone);
    await alice.req('PUT', `/channels/${voiceId}/permissions/role/${everyone.id}`, { allow: '0', deny: Permissions.CONNECT.toString() }, 200);
    expect((await carol.req('POST', `/voice/${voiceId}/join`)).status).toBe(403);
  });
});

describe('social', () => {
  it('amizade: solicitar, aceitar, DM e bloqueio', async () => {
    await alice.req('POST', '/relationships', { username: 'carol' }, 200);
    await carol.waitFor('relationship:update', (d) => d.userId === alice.user.id && d.type === 'incoming');
    await carol.req('PUT', `/relationships/${alice.user.id}`, { type: 'friend' }, 200);
    await alice.waitFor('relationship:update', (d) => d.userId === carol.user.id && d.type === 'friend');

    const dm = await alice.req('POST', '/users/@me/channels', { recipientIds: [carol.user.id] }, 200);
    await carol.waitFor('dm:create', (d) => d.id === dm.data.id);
    const m = await alice.req('POST', `/channels/${dm.data.id}/messages`, { content: 'oi carol' }, 201);
    await carol.waitFor('message:create', (d) => d.id === m.data.id);
    // bob não acessa DM alheia
    expect((await bob.req('GET', `/channels/${dm.data.id}/messages`)).status).toBe(404);

    await carol.req('PUT', `/relationships/${alice.user.id}`, { type: 'blocked' }, 200);
    expect((await alice.req('POST', `/channels/${dm.data.id}/messages`, { content: 'oi?' })).status).toBe(403);
    await carol.req('DELETE', `/relationships/${alice.user.id}`, undefined, 200);
  });

  it('presença: status reflete para membros', async () => {
    carol.socket!.emit('presence:set', { status: 'dnd' });
    const p = await alice.waitFor('presence:update', (d) => d.userId === carol.user.id && d.status === 'dnd');
    expect(p.status).toBe('dnd');
    carol.socket!.emit('presence:set', { status: 'invisible' });
    await alice.waitFor('presence:update', (d) => d.userId === carol.user.id && d.status === 'offline');
  });
});

describe('persistência', () => {
  it('dados permanecem após reiniciar a API', async () => {
    for (const c of [alice, bob, carol]) c.disconnect();
    await env.close();
    env = await startApp();
    const a2 = new Client(env.base);
    a2.token = alice.token;
    const msgs = await a2.req('GET', `/channels/${generalId}/messages?limit=100`, undefined, 200);
    expect(msgs.data.some((m: any) => m.content === 'Oi Alice!')).toBe(true);
    const ready = await a2.connect();
    expect(ready.servers.map((s: any) => s.id)).toContain(serverId);
    a2.disconnect();
  });
});
