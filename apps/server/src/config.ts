import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  API_PUBLIC_URL: z.string().url(),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  WEB_ORIGINS: z.string().default('http://localhost:5173'),
  SESSION_TTL_DAYS: z.coerce.number().default(30),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('aldetes'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().default(25),
  LIVEKIT_API_KEY: z.string(),
  LIVEKIT_API_SECRET: z.string().min(32),
  LIVEKIT_URL: z.string(),
  LIVEKIT_HTTP_URL: z.string(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().default('false').transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Aldetes <no-reply@aldetes.local>'),
  TRUST_PROXY: z.string().default('false').transform((v) => v === 'true'),
  RATE_LIMIT_DISABLED: z.string().default('false').transform((v) => v === 'true'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    console.error('Configuração inválida:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid configuration — run `pnpm setup` to generate .env');
  }
  return parsed.data;
}
