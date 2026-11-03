#!/usr/bin/env bash
# Sobe o Aldetes no seu PC e publica com HTTPS na sua rede Tailscale.
# Uso: bash scripts/start-home.sh   (rode de novo quando quiser reiniciar/atualizar)
set -euo pipefail
cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "Docker não encontrado. Instale primeiro (veja docs/HOME.md)."; exit 1; }
command -v tailscale >/dev/null || { echo "Tailscale não encontrado. Instale primeiro (veja docs/HOME.md)."; exit 1; }

TS_IP=$(tailscale ip -4 2>/dev/null | head -1 || true)
[ -n "$TS_IP" ] || { echo "Tailscale não está conectado. Rode: sudo tailscale up"; exit 1; }
TS_HOST=$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')
[ -n "$TS_HOST" ] || { echo "Não consegui descobrir o nome do PC no Tailscale."; exit 1; }
echo "PC no Tailscale: $TS_HOST ($TS_IP)"

# Gera segredos só na primeira vez (rodar de novo mantém o banco e as sessões)
if [ ! -f .env.home ]; then
  rnd() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
  LK_KEY="API$(rnd 16)"
  LK_SECRET="$(rnd 48)"
  PG_PASS="$(rnd 32)"
  cat > .env.home <<ENV
# Gerado por scripts/start-home.sh — NÃO VERSIONAR
NODE_ENV=production
TRUST_PROXY=true
API_PORT=3001
POSTGRES_USER=aldetes
POSTGRES_PASSWORD=$PG_PASS
POSTGRES_DB=aldetes
STORAGE_DRIVER=local
MAX_UPLOAD_MB=25
SESSION_TTL_DAYS=30
LIVEKIT_API_KEY=$LK_KEY
LIVEKIT_API_SECRET=$LK_SECRET
SMTP_HOST=
MAIL_FROM="Aldetes <no-reply@aldetes.local>"
ENV
  chmod 600 .env.home
fi
# Endereços (atualizados a cada execução, caso o nome/IP do Tailscale mude)
sed -i '/^API_PUBLIC_URL=\|^WEB_PUBLIC_URL=\|^WEB_ORIGINS=\|^LIVEKIT_URL=/d' .env.home
cat >> .env.home <<ENV
API_PUBLIC_URL=https://$TS_HOST
WEB_PUBLIC_URL=https://$TS_HOST
WEB_ORIGINS=https://$TS_HOST,app://aldetes
LIVEKIT_URL=wss://$TS_HOST:8443
ENV
set -a; . ./.env.home; set +a

cat > infra/home/livekit.yaml <<YAML
# Gerado — NÃO VERSIONAR
port: 7880
bind_addresses: ["0.0.0.0"]
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50200
  use_external_ip: false
  node_ip: $TS_IP
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
chmod 600 infra/home/livekit.yaml

echo "Construindo e iniciando (a primeira vez leva alguns minutos)..."
docker compose -f infra/home/docker-compose.yml --env-file .env.home up -d --build

echo "Publicando com HTTPS no Tailscale..."
sudo tailscale serve --bg --https=443 http://127.0.0.1:8080
sudo tailscale serve --bg --https=8443 http://127.0.0.1:7880

for i in $(seq 1 60); do
  curl -sf http://127.0.0.1:8080/api/health >/dev/null && break
  sleep 2
done
if curl -sf http://127.0.0.1:8080/api/health >/dev/null; then
  echo
  echo "✅ Aldetes no ar: https://$TS_HOST"
  echo "   (abra esse endereço em qualquer aparelho conectado à sua rede Tailscale)"
else
  echo "⚠️  A API ainda não respondeu. Veja os logs: docker compose -f infra/home/docker-compose.yml logs api"
fi
