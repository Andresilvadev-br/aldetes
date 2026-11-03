#!/usr/bin/env node
// Generates .env.production and infra/prod/livekit.yaml with random secrets (never committed).
// Usage:
//   node scripts/setup-prod.mjs --domain chat.exemplo.com --livekit-domain rtc.exemplo.com \
//        --turn-domain turn.exemplo.com --email admin@exemplo.com --public-ip 203.0.113.10 [--force]
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const domain = arg('domain');
const lkDomain = arg('livekit-domain');
const turnDomain = arg('turn-domain');
const email = arg('email');
const publicIp = arg('public-ip');
if (!domain || !lkDomain || !turnDomain || !email) {
  console.error('Informe --domain, --livekit-domain, --turn-domain e --email (e opcionalmente --public-ip).');
  process.exit(1);
}
const envPath = join(root, '.env.production');
if (existsSync(envPath) && !process.argv.includes('--force')) {
  console.error('.env.production já existe (use --force para regenerar — isso invalida o acesso ao banco existente).');
  process.exit(1);
}
const rnd = (n = 32) => randomBytes(n).toString('base64url');
const lkKey = 'API' + randomBytes(8).toString('hex');
const lkSecret = rnd(32);
const pg = rnd(24);
const s3u = 'aldetes' + randomBytes(4).toString('hex');
const s3p = rnd(24);

writeFileSync(
  envPath,
  `# Gerado por scripts/setup-prod.mjs em ${new Date().toISOString()} — NÃO VERSIONAR
NODE_ENV=production
DOMAIN=${domain}
LIVEKIT_DOMAIN=${lkDomain}
TURN_DOMAIN=${turnDomain}
ACME_EMAIL=${email}
API_PORT=3001
API_PUBLIC_URL=https://${domain}
WEB_PUBLIC_URL=https://${domain}
WEB_ORIGINS=https://${domain},app://aldetes
TRUST_PROXY=true
SESSION_TTL_DAYS=30
POSTGRES_USER=aldetes
POSTGRES_PASSWORD=${pg}
POSTGRES_DB=aldetes
STORAGE_DRIVER=local
S3_REGION=us-east-1
S3_BUCKET=aldetes
S3_ACCESS_KEY=${s3u}
S3_SECRET_KEY=${s3p}
MAX_UPLOAD_MB=25
LIVEKIT_API_KEY=${lkKey}
LIVEKIT_API_SECRET=${lkSecret}
LIVEKIT_URL=wss://${lkDomain}
# SMTP do seu provedor (obrigatório para recuperação de senha em produção)
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Aldetes <no-reply@${domain}>"
`,
  { mode: 0o600 },
);

// Caddy stores certs at /data/caddy/certificates/<issuer>/<domain>/<domain>.{crt,key}
const certDir = `/caddy/caddy/certificates/acme-v02.api.letsencrypt.org-directory/${turnDomain}`;
writeFileSync(
  join(root, 'infra/prod/livekit.yaml'),
  `# Gerado — NÃO VERSIONAR
port: 7880
bind_addresses: ["0.0.0.0"]   # porta 7880 bloqueada no firewall; acesso público só via Caddy (wss://${lkDomain})
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: ${publicIp ? 'false' : 'true'}
${publicIp ? `  node_ip: ${publicIp}\n` : ''}turn:
  enabled: true
  domain: ${turnDomain}
  tls_port: 5349
  udp_port: 3478
  external_tls: false
  cert_file: ${certDir}/${turnDomain}.crt
  key_file: ${certDir}/${turnDomain}.key
keys:
  ${lkKey}: ${lkSecret}
webhook:
  api_key: ${lkKey}
  urls:
    - http://127.0.0.1:3001/api/livekit/webhook
room:
  empty_timeout: 30
  departure_timeout: 20
logging:
  level: info
`,
  { mode: 0o600 },
);
console.log('Gerados: .env.production e infra/prod/livekit.yaml');
