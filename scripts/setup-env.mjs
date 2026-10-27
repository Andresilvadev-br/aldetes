#!/usr/bin/env node
// Generates a local .env with random internal secrets (never committed).
// Usage: node scripts/setup-env.mjs [--force] [--public-host <ip-or-domain>]
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const args = process.argv.slice(2);
const force = args.includes('--force');
const hostIdx = args.indexOf('--public-host');
const publicHost = hostIdx >= 0 ? args[hostIdx + 1] : 'localhost';

if (existsSync(envPath) && !force) {
  console.log('.env já existe — use --force para regenerar (isso invalida sessões e senhas do banco).');
  process.exit(0);
}
const rnd = (n = 32) => randomBytes(n).toString('base64url');
const pgPass = rnd(24);
const lkKey = 'API' + randomBytes(8).toString('hex');
const lkSecret = rnd(32);
const minioUser = 'aldetes' + randomBytes(4).toString('hex');
const minioPass = rnd(24);

const env = `# Gerado por scripts/setup-env.mjs em ${new Date().toISOString()}
# NÃO VERSIONAR. Contém segredos internos.
NODE_ENV=development
PUBLIC_HOST=${publicHost}

# --- API ---
API_PORT=3001
API_PUBLIC_URL=http://${publicHost}:3001
WEB_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://${publicHost}:5173,app://aldetes
SESSION_TTL_DAYS=30

# --- PostgreSQL ---
POSTGRES_USER=aldetes
POSTGRES_PASSWORD=${pgPass}
POSTGRES_DB=aldetes
POSTGRES_PORT=5433
DATABASE_URL=postgresql://aldetes:${pgPass}@127.0.0.1:5433/aldetes

# --- Redis ---
REDIS_PORT=6380
REDIS_URL=redis://127.0.0.1:6380

# --- Armazenamento (local | s3) ---
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=./uploads
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_BUCKET=aldetes
MINIO_ROOT_USER=${minioUser}
MINIO_ROOT_PASSWORD=${minioPass}
S3_ACCESS_KEY=${minioUser}
S3_SECRET_KEY=${minioPass}
MAX_UPLOAD_MB=25

# --- LiveKit (self-hosted) ---
LIVEKIT_API_KEY=${lkKey}
LIVEKIT_API_SECRET=${lkSecret}
LIVEKIT_URL=ws://${publicHost}:7880
LIVEKIT_HTTP_URL=http://127.0.0.1:7880

# --- E-mail (SMTP). Em dev usa Mailpit (http://localhost:8025) ---
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Aldetes <no-reply@aldetes.local>"
WEB_PUBLIC_URL=http://${publicHost}:5173
`;
writeFileSync(envPath, env, { mode: 0o600 });

// LiveKit config (also secret: contains API key/secret)
const lkDir = join(root, 'infra', 'livekit');
mkdirSync(lkDir, { recursive: true });
writeFileSync(
  join(lkDir, 'livekit.dev.yaml'),
  `# Gerado — NÃO VERSIONAR
port: 7880
bind_addresses: ["0.0.0.0"]
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50100
  use_external_ip: false
  node_ip: ${publicHost === 'localhost' ? '127.0.0.1' : publicHost}
keys:
  ${lkKey}: ${lkSecret}
webhook:
  api_key: ${lkKey}
  urls:
    - http://127.0.0.1:3001/api/livekit/webhook
room:
  empty_timeout: 30
  departure_timeout: 10
logging:
  level: info
`,
  { mode: 0o600 },
);
console.log('.env e infra/livekit/livekit.dev.yaml gerados.');
