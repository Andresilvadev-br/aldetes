#!/usr/bin/env bash
# Verifica se há versão nova no GitHub; se houver, atualiza e reinicia o Aldetes.
# Chamado pelo timer do systemd (scripts/install-auto-update.sh). Log: journalctl -u aldetes-update
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  exec 9>/tmp/aldetes-update.lock
  flock -n 9 || { echo "Atualização já em andamento."; return 0; }

  git fetch --quiet origin main
  local cur new
  cur=$(git rev-parse HEAD)
  new=$(git rev-parse origin/main)
  [ "$cur" = "$new" ] && return 0

  echo "$(date -Is) Nova versão: ${cur:0:7} → ${new:0:7}"
  git log --oneline "$cur..$new" | head -20
  git merge --ff-only --quiet origin/main

  # Reaproveita os domínios já configurados
  set -a; . ./.env.production; set +a
  bash scripts/start-vps.sh "$DOMAIN" "$LIVEKIT_DOMAIN" "$TURN_DOMAIN" "$ACME_EMAIL"
  docker image prune -f >/dev/null 2>&1 || true
  echo "$(date -Is) Atualizado para ${new:0:7}"
}

# Função inteira é lida antes de executar: seguro mesmo se o git pull alterar este arquivo.
main "$@"
exit
