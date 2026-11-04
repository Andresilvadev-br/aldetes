import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { fileTypeFromBuffer } from 'file-type';
import { imageSize } from 'image-size';
import { z } from 'zod';
import { Permissions, ServerEvents } from '@aldetes/shared';
import type { AppContext } from '../context';
import { badRequest, notFound } from '../lib/errors';
import { snowflake } from '../lib/snowflake';
import { randomToken } from '../lib/crypto';
import * as S from '../services/serialize';
import { requireServer } from '../services/permissions';
import { broadcastUserUpdate } from './users';
import { audit } from '../services/audit';

const attachmentMeta = z
  .object({
    placeholder: z
      .string()
      .max(4000)
      .regex(/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
    durationMs: z.number().int().min(0).max(30 * 60_000).optional(),
    waveform: z
      .string()
      .max(176)
      .regex(/^[A-Za-z0-9+/=]*$/)
      .optional(),
  })
  .strict();

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
// Types the CDN may render inline. Everything else is forced to download.
const INLINE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  weba: 'audio/webm',
  opus: 'audio/ogg',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
};

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'arquivo';
  const clean = base.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-100);
  return clean || 'arquivo';
}

async function readFile(file: MultipartFile): Promise<Buffer> {
  const buf = await file.toBuffer(); // throws FST_REQ_FILE_TOO_LARGE past limit
  return buf;
}

async function detect(buf: Buffer, declared: string, filename: string) {
  const ft = await fileTypeFromBuffer(buf);
  let contentType = ft?.mime ?? (declared && !/html|svg|xml|javascript/i.test(declared) ? declared : 'application/octet-stream');
  if (!ft && /\.txt$|\.md$|\.log$|\.csv$|\.json$/i.test(filename)) contentType = 'text/plain';
  let width: number | null = null;
  let height: number | null = null;
  if (IMAGE_TYPES.has(contentType)) {
    try {
      const d = imageSize(buf);
      width = d.width ?? null;
      height = d.height ?? null;
    } catch {
      /* not decodable */
    }
  }
  return { contentType, width, height, ext: ft?.ext };
}

export function uploadRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, storage, cfg } = ctx;
  const auth = { preHandler: ctx.authenticate };

  async function singleImage(req: FastifyRequest, maxMb: number) {
    const file = await req.file({ limits: { fileSize: maxMb * 1024 * 1024 } });
    if (!file) throw badRequest('Nenhum arquivo enviado');
    const buf = await readFile(file);
    const info = await detect(buf, file.mimetype, file.filename);
    if (!IMAGE_TYPES.has(info.contentType)) throw badRequest('Envie uma imagem PNG, JPEG, GIF ou WebP');
    return { buf, info };
  }

  /**
   * Upload attachments. For each file `files` (index i in order) the client may also send:
   *  - `thumb_<i>`: a small image it generated itself (validated: real PNG/JPEG/WebP, ≤ 1 MB),
   *  - `meta_<i>`: JSON { placeholder?: data:image/...;base64 (≤ 4 KB), durationMs?, waveform?: base64 (≤ 128 bars) }.
   * The server never decodes or re-encodes images; it only checks what it stores.
   */
  app.post('/api/attachments', { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const created: Array<{ id: string; storageKey: string }> = [];
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        const m = /^meta_(\d{1,2})$/.exec(part.fieldname);
        const target = m ? created[Number(m[1])] : undefined;
        if (!target || typeof part.value !== 'string' || part.value.length > 8000) continue;
        let meta: unknown;
        try {
          meta = JSON.parse(part.value);
        } catch {
          continue;
        }
        const parsed = attachmentMeta.safeParse(meta);
        if (!parsed.success) throw badRequest('Metadados do anexo inválidos');
        const { placeholder, durationMs, waveform } = parsed.data;
        await db.attachment.update({ where: { id: target.id }, data: { placeholder: placeholder ?? null, durationMs: durationMs ?? null, waveform: waveform ?? null } });
        continue;
      }
      const buf = await readFile(part);
      if (!buf.length) continue;
      const tm = /^thumb_(\d{1,2})$/.exec(part.fieldname);
      if (tm) {
        const target = created[Number(tm[1])];
        if (!target || buf.length > 1024 * 1024) continue;
        const ft = await fileTypeFromBuffer(buf);
        if (!ft || !['image/png', 'image/jpeg', 'image/webp'].includes(ft.mime)) throw badRequest('Miniatura inválida');
        const key = `${target.storageKey.slice(0, target.storageKey.lastIndexOf('/'))}/thumb.${ft.ext}`;
        await storage.put(key, buf, ft.mime);
        await db.attachment.update({ where: { id: target.id }, data: { thumbKey: key } });
        continue;
      }
      const info = await detect(buf, part.mimetype, part.filename);
      const id = snowflake();
      const filename = sanitizeFilename(part.filename);
      const key = `attachments/${id}/${randomToken(9)}/${filename}`;
      await storage.put(key, buf, info.contentType);
      await db.attachment.create({
        data: { id, uploaderId: req.auth.userId, storageKey: key, filename, contentType: info.contentType, size: buf.length, width: info.width, height: info.height },
      });
      created.push({ id, storageKey: key });
    }
    if (!created.length) throw badRequest('Nenhum arquivo enviado');
    const rows = await db.attachment.findMany({ where: { id: { in: created.map((c) => c.id) } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return reply.status(201).send(created.map((c) => S.attachment(byId.get(c.id)!)));
  });

  for (const kind of ['avatar', 'banner'] as const) {
    app.post(`/api/users/@me/${kind}`, { ...auth, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
      const { buf, info } = await singleImage(req, 8);
      const key = `${kind}s/${req.auth.userId}/${randomToken(12)}.${info.ext ?? 'png'}`;
      await storage.put(key, buf, info.contentType);
      const prev = await db.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
      const user = await db.user.update({ where: { id: req.auth.userId }, data: kind === 'avatar' ? { avatarKey: key } : { bannerKey: key } });
      const old = kind === 'avatar' ? prev.avatarKey : prev.bannerKey;
      if (old) await storage.delete(old);
      await broadcastUserUpdate(ctx, user.id);
      return S.selfUser(user);
    });
    app.delete(`/api/users/@me/${kind}`, auth, async (req) => {
      const prev = await db.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
      const old = kind === 'avatar' ? prev.avatarKey : prev.bannerKey;
      const user = await db.user.update({ where: { id: req.auth.userId }, data: kind === 'avatar' ? { avatarKey: null } : { bannerKey: null } });
      if (old) await storage.delete(old);
      await broadcastUserUpdate(ctx, user.id);
      return S.selfUser(user);
    });
    app.post(`/api/servers/:id/${kind === 'avatar' ? 'icon' : 'banner'}`, auth, async (req) => {
      const { id } = req.params as { id: string };
      await requireServer(db, id, req.auth.userId, Permissions.MANAGE_SERVER);
      const { buf, info } = await singleImage(req, 8);
      const key = `servers/${id}/${randomToken(12)}.${info.ext ?? 'png'}`;
      await storage.put(key, buf, info.contentType);
      const prev = await db.server.findUniqueOrThrow({ where: { id } });
      const s = await db.server.update({ where: { id }, data: kind === 'avatar' ? { iconKey: key } : { bannerKey: key } });
      const old = kind === 'avatar' ? prev.iconKey : prev.bannerKey;
      if (old) await storage.delete(old);
      await audit(ctx, id, req.auth.userId, kind === 'avatar' ? 'server_icon_update' : 'server_banner_update', id);
      ctx.gw.toServer(id, ServerEvents.SERVER_UPDATE, S.server(s));
      return S.server(s);
    });
  }

  // --- Custom emojis ---
  app.get('/api/servers/:id/emojis', auth, async (req) => {
    const { id } = req.params as { id: string };
    await requireServer(db, id, req.auth.userId);
    const emojis = await db.emoji.findMany({ where: { serverId: id }, orderBy: { name: 'asc' } });
    return emojis.map((e) => ({ id: e.id, name: e.name, animated: e.animated, url: S.cdnUrl(e.storageKey) }));
  });
  app.post('/api/servers/:id/emojis', auth, async (req, reply) => {
    const { id } = req.params as { id: string };
    await requireServer(db, id, req.auth.userId, Permissions.MANAGE_EMOJIS);
    const { name } = z.object({ name: z.string().regex(/^[a-zA-Z0-9_]{2,32}$/) }).parse(req.query);
    if ((await db.emoji.count({ where: { serverId: id } })) >= 100) throw badRequest('Limite de 100 emojis');
    const { buf, info } = await singleImage(req, 1);
    const eid = snowflake();
    const key = `emojis/${eid}.${info.ext ?? 'png'}`;
    await storage.put(key, buf, info.contentType);
    const e = await db.emoji.create({ data: { id: eid, serverId: id, name, storageKey: key, animated: info.contentType === 'image/gif', creatorId: req.auth.userId } }).catch(() => {
      throw badRequest('Já existe um emoji com esse nome');
    });
    await audit(ctx, id, req.auth.userId, 'emoji_create', eid, { name });
    const payload = { id: e.id, name: e.name, animated: e.animated, url: S.cdnUrl(e.storageKey) };
    ctx.gw.toServer(id, 'emojis:update', { serverId: id });
    return reply.status(201).send(payload);
  });
  app.delete('/api/servers/:id/emojis/:emojiId', auth, async (req) => {
    const { id, emojiId } = req.params as { id: string; emojiId: string };
    await requireServer(db, id, req.auth.userId, Permissions.MANAGE_EMOJIS);
    const e = await db.emoji.findFirst({ where: { id: emojiId, serverId: id } });
    if (!e) throw notFound();
    await db.emoji.delete({ where: { id: emojiId } });
    await storage.delete(e.storageKey);
    await audit(ctx, id, req.auth.userId, 'emoji_delete', emojiId, { name: e.name });
    ctx.gw.toServer(id, 'emojis:update', { serverId: id });
    return { ok: true };
  });

  // --- CDN ---
  app.get('/cdn/*', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, reply) => {
    const key = (req.params as { '*': string })['*'];
    if (!/^(attachments|avatars|banners|servers|emojis)\/[a-zA-Z0-9/_\-.]+$/.test(key) || key.includes('..')) throw notFound();
    const obj = await storage.get(key);
    if (!obj) throw notFound();
    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    const inline = INLINE_TYPES[ext];
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    if (obj.size) reply.header('Content-Length', obj.size);
    if (inline) {
      reply.type(inline);
    } else {
      const fname = key.split('/').pop() ?? 'arquivo';
      reply.type('application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${fname}"`);
    }
    return reply.send(obj.stream);
  });

  void cfg;
}

/** Remove uploads never attached to a message (older than 1h). */
export async function cleanupOrphanAttachments(ctx: AppContext) {
  const old = await ctx.db.attachment.findMany({ where: { messageId: null, createdAt: { lt: new Date(Date.now() - 3600_000) } }, take: 500 });
  for (const a of old) {
    await ctx.storage.delete(a.storageKey);
    if (a.thumbKey) await ctx.storage.delete(a.thumbKey);
  }
  if (old.length) await ctx.db.attachment.deleteMany({ where: { id: { in: old.map((a) => a.id) } } });
}
