import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { Server as IOServer } from 'socket.io';
import type { RoomServiceClient } from 'livekit-server-sdk';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config';
import type { Storage } from './lib/storage';
import type { Mailer } from './lib/mailer';
import type { Gateway } from './gateway';

export interface AppContext {
  cfg: Config;
  db: PrismaClient;
  redis: Redis;
  io: IOServer;
  storage: Storage;
  mailer: Mailer;
  livekit: RoomServiceClient;
  gw: Gateway;
  authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}
