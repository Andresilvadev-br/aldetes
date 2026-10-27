import { execSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Creates a throwaway database (aldetes_t_<timestamp>) for this run, applies
 * migrations with `migrate deploy` (non-destructive) and drops it afterwards.
 * Never touches the development database.
 */
export default function setup() {
  const envPath = resolve(__dirname, '../../../.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, '');
    }
  }
  const dbName = `aldetes_t_${Date.now()}`;
  const admin = new URL(process.env.DATABASE_URL!);
  admin.pathname = '/postgres';
  const psql = (sql: string) => execSync(`psql "${admin.toString()}" -v ON_ERROR_STOP=1 -q -c "${sql}"`, { stdio: 'inherit' });
  psql(`CREATE DATABASE ${dbName}`);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();
  process.env.REDIS_URL = (process.env.REDIS_URL ?? 'redis://127.0.0.1:6380').replace(/\/\d*$/, '') + '/1';
  process.env.NODE_ENV = 'test';
  process.env.RATE_LIMIT_DISABLED = 'true';
  process.env.STORAGE_LOCAL_DIR = resolve(__dirname, '../.test-uploads');
  process.env.SMTP_HOST = '';
  execSync('pnpm exec prisma migrate deploy', { stdio: 'ignore', env: process.env, cwd: resolve(__dirname, '..') });

  return () => {
    rmSync(process.env.STORAGE_LOCAL_DIR!, { recursive: true, force: true });
    if (/^aldetes_t_\d+$/.test(dbName)) psql(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  };
}
