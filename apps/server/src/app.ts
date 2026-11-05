import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { Server as IOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { RoomServiceClient } from 'livekit-server-sdk';
import { ZodError } from 'zod';
import type { Config } from './config';
import type { AppContext } from './context';
import { HttpError } from './lib/errors';
import { createStorage } from './lib/storage';
import { createMailer } from './lib/mailer';
import { setPublicUrl } from './services/serialize';
import { Gateway } from './gateway';
import { makeAuthenticate } from './auth';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { relationshipRoutes } from './routes/relationships';
import { serverRoutes } from './routes/servers';
import { channelRoutes } from './routes/channels';
import { messageRoutes } from './routes/messages';
import { roleRoutes } from './routes/roles';
import { inviteRoutes } from './routes/invites';
import { moderationRoutes } from './routes/moderation';
import { uploadRoutes } from './routes/uploads';
import { togetherRoutes } from './routes/together';
import { voiceRoutes } from './routes/voice';
import { dmRoutes } from './routes/dms';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
  close: () => Promise<void>;
}

export async function buildApp(cfg: Config, opts: { logger?: boolean } = {}): Promise<BuiltApp> {
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : cfg.NODE_ENV === 'development'
          ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
          : true,
    trustProxy: cfg.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });
  setPublicUrl(cfg);

  const db = new PrismaClient();
  const redis = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: 3 });
  const pub = redis.duplicate();
  const sub = redis.duplicate();
  const origins = cfg.WEB_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

  const io = new IOServer(app.server, {
    cors: { origin: origins, credentials: true },
    adapter: createAdapter(pub, sub),
    pingInterval: 20000,
    pingTimeout: 20000,
    maxHttpBufferSize: 64 * 1024,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  const storage = createStorage(cfg);
  await storage.init();

  const ctx = {
    cfg,
    db,
    redis,
    io,
    storage,
    mailer: createMailer(cfg, app.log),
    livekit: new RoomServiceClient(cfg.LIVEKIT_HTTP_URL, cfg.LIVEKIT_API_KEY, cfg.LIVEKIT_API_SECRET),
  } as AppContext;
  ctx.gw = new Gateway(ctx);
  ctx.authenticate = makeAuthenticate(ctx);
  ctx.gw.attach();

  await app.register(helmet, {
    contentSecurityPolicy: false, // API only; CDN responses set their own CSP
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(cors, {
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Aldetes-Client'],
  });
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: cfg.MAX_UPLOAD_MB * 1024 * 1024, files: 10, fields: 10 },
  });
  if (!cfg.RATE_LIMIT_DISABLED) await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    redis,
    nameSpace: 'rl:',
    keyGenerator: (req) => req.ip,
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ code: err.code, message: err.message, details: err.details });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ code: 'VALIDATION', message: 'Dados inválidos', details: err.flatten().fieldErrors });
    }
    const e = err as { statusCode?: number; code?: string; message: string };
    if (e.statusCode === 429) return reply.status(429).send({ code: 'RATE_LIMITED', message: 'Muitas requisições, aguarde.' });
    if (e.code === 'FST_REQ_FILE_TOO_LARGE') return reply.status(413).send({ code: 'TOO_LARGE', message: 'Arquivo muito grande' });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ code: e.code ?? 'ERROR', message: e.message });
    req.log.error(err);
    return reply.status(500).send({ code: 'INTERNAL', message: 'Erro interno' });
  });

  app.get('/api/health', { config: { rateLimit: false } }, async () => {
    await db.$queryRaw`SELECT 1`;
    await redis.ping();
    return { ok: true };
  });

  await app.register(
    async (api) => {
      authRoutes(api, ctx);
      userRoutes(api, ctx);
      relationshipRoutes(api, ctx);
      dmRoutes(api, ctx);
      serverRoutes(api, ctx);
      channelRoutes(api, ctx);
      messageRoutes(api, ctx);
      roleRoutes(api, ctx);
      inviteRoutes(api, ctx);
      moderationRoutes(api, ctx);
      voiceRoutes(api, ctx);
      togetherRoutes(api, ctx);
    },
    { prefix: '/api' },
  );
  await app.register(async (r) => uploadRoutes(r, ctx));

  return {
    app,
    ctx,
    close: async () => {
      io.close();
      await app.close();
      await db.$disconnect();
      redis.disconnect();
      pub.disconnect();
      sub.disconnect();
    },
  };
}
