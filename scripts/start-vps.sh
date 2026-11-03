#!/usr/bin/env bash
# Instala/atualiza o Aldetes num VPS Ubuntu com IP público.
# Uso (como root):
#   bash scripts/start-vps.sh <dominio-chat> <dominio-rtc> <dominio-turn> <seu-email>
# Ex.: bash scripts/start-vps.sh fulano-chat.duckdns.org fulano-rtc.duckdns.org fulano-turn.duckdns.org voce@gmail.com
# Rodar de novo é seguro: mantém banco, segredos e certificados.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -lt 4 ]; then
  echo "Uso: bash scripts/start-vps.sh <dominio-chat> <dominio-rtc> <dominio-turn> <email>"
  exit 1
fi
DOMAIN=$1; LK_DOMAIN=$2; TURN_DOMAIN=$3; EMAIL=$4
[ "$(id -u)" = 0 ] || { echo "Rode como root (ou com sudo)."; exit 1; }

# --- Docker ---
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# --- IP público e DNS ---
PUBLIC_IP=$(curl -fsS4 https://api.ipify.org || true)
[ -n "$PUBLIC_IP" ] || { echo "Não consegui descobrir o IP público."; exit 1; }
echo "IP público: $PUBLIC_IP"
for d in "$DOMAIN" "$LK_DOMAIN" "$TURN_DOMAIN"; do
  r=$(getent ahostsv4 "$d" | awk 'NR==1{print $1}')
  if [ "$r" != "$PUBLIC_IP" ]; then
    echo "⚠️  $d aponta para '${r:-nada}', mas o IP deste servidor é $PUBLIC_IP. Corrija no DuckDNS e rode de novo."
    exit 1
  fi
done

# --- Firewall ---
if command -v ufw >/dev/null; then
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
  ufw allow 7881/tcp >/dev/null                 # WebRTC via TCP
  ufw allow 3478/udp >/dev/null                 # TURN/UDP
  ufw allow 5349/tcp >/dev/null                 # TURN/TLS
  ufw allow 50000:60000/udp >/dev/null          # mídia WebRTC
  ufw allow from 172.16.0.0/12 to any port 7880 proto tcp >/dev/null  # Caddy/API (rede Docker) → LiveKit
  ufw deny 7880/tcp >/dev/null                  # sinalização LiveKit pública só via Caddy
  ufw --force enable >/dev/null
  echo "Firewall (ufw) configurado."
fi

# --- Segredos (gerados uma única vez) ---
rnd() { openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
if [ ! -f .env.production ]; then
  LK_KEY="API$(rnd 16)"; LK_SECRET="$(rnd 48)"; PG_PASS="$(rnd 32)"
  cat > .env.production <<ENV
# Gerado por scripts/start-vps.sh — NÃO VERSIONAR
NODE_ENV=production
TRUST_PROXY=true
API_PORT=3001
SESSION_TTL_DAYS=30
POSTGRES_USER=aldetes
POSTGRES_PASSWORD=$PG_PASS
POSTGRES_DB=aldetes
STORAGE_DRIVER=local
MAX_UPLOAD_MB=25
LIVEKIT_API_KEY=$LK_KEY
LIVEKIT_API_SECRET=$LK_SECRET
# SMTP (opcional) para recuperação de senha:
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
ENV
  chmod 600 .env.production
fi
sed -i '/^DOMAIN=\|^LIVEKIT_DOMAIN=\|^TURN_DOMAIN=\|^ACME_EMAIL=\|^API_PUBLIC_URL=\|^WEB_PUBLIC_URL=\|^WEB_ORIGINS=\|^LIVEKIT_URL=\|^MAIL_FROM=/d' .env.production
cat >> .env.production <<ENV
DOMAIN=$DOMAIN
LIVEKIT_DOMAIN=$LK_DOMAIN
TURN_DOMAIN=$TURN_DOMAIN
ACME_EMAIL=$EMAIL
API_PUBLIC_URL=https://$DOMAIN
WEB_PUBLIC_URL=https://$DOMAIN
WEB_ORIGINS=https://$DOMAIN,app://aldetes
LIVEKIT_URL=wss://$LK_DOMAIN
MAIL_FROM="Aldetes <no-reply@$DOMAIN>"
ENV
set -a; . ./.env.production; set +a

CERT_DIR="/caddy/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$TURN_DOMAIN"
cat > infra/prod/livekit.yaml <<YAML
# Gerado — NÃO VERSIONAR
port: 7880
bind_addresses: ["0.0.0.0"]
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: false
  node_ip: $PUBLIC_IP
turn:
  enabled: true
  domain: $TURN_DOMAIN
  tls_port: 5349
  udp_port: 3478
  external_tls: false
  cert_file: $CERT_DIR/$TURN_DOMAIN.crt
  key_file: $CERT_DIR/$TURN_DOMAIN.key
keys:
  $LIVEKIT_API_KEY: $LIVEKIT_API_SECRET
webhook:
  api_key: $LIVEKIT_API_KEY
  urls:
    - http://127.0.0.1:3001/api/livekit/webhook
room:
  empty_timeout: 30
  departure_timeout: 20
YAML
chmod 600 infra/prod/livekit.yaml

COMPOSE="docker compose -f infra/prod/docker-compose.yml --env-file .env.production"
echo "Construindo e iniciando (a primeira vez leva alguns minutos)..."
$COMPOSE up -d --build caddy api postgres redis

echo "Aguardando o certificado HTTPS (Let's Encrypt)..."
for i in $(seq 1 90); do
  $COMPOSE exec -T caddy test -f "/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$TURN_DOMAIN/$TURN_DOMAIN.crt" && break
  sleep 2
done
$COMPOSE up -d livekit

for i in $(seq 1 60); do
  curl -sf "https://$DOMAIN/api/health" >/dev/null && break
  sleep 3
done
if curl -sf "https://$DOMAIN/api/health" >/dev/null; then
  echo; echo "✅ Aldetes no ar: https://$DOMAIN"
else
  echo "⚠️  Ainda não respondeu em https://$DOMAIN. Veja: $COMPOSE logs --tail 50 caddy api"
fi
