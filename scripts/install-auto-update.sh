#!/usr/bin/env bash
# Instala a atualização automática (a cada 5 minutos) no VPS. Rodar uma vez, como root:
#   bash scripts/install-auto-update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=$(pwd)
[ "$(id -u)" = 0 ] || { echo "Rode como root."; exit 1; }
[ -f .env.production ] || { echo "Rode antes o scripts/start-vps.sh."; exit 1; }
git fetch --quiet origin main || { echo "Não consegui acessar o GitHub (rode: gh auth login)."; exit 1; }

cat > /etc/systemd/system/aldetes-update.service <<UNIT
[Unit]
Description=Atualiza o Aldetes a partir do GitHub
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$REPO
ExecStart=/usr/bin/bash $REPO/scripts/auto-update.sh
UNIT

cat > /etc/systemd/system/aldetes-update.timer <<UNIT
[Unit]
Description=Verifica atualizações do Aldetes a cada 5 minutos

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now aldetes-update.timer
echo "✅ Atualização automática ativada (a cada 5 minutos)."
echo "   Ver histórico: journalctl -u aldetes-update -n 50"
echo "   Desativar:     systemctl disable --now aldetes-update.timer"
