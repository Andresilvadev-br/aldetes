#!/usr/bin/env bash
# Verifica se há versão nova no GitHub; se houver, atualiza e reinicia o Aldetes.
# Chamado pelo timer do systemd (scripts/install-auto-update.sh). Log: journalctl -u aldetes-update
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  exec 9>/tmp/aldetes-update.lock
  flock -n 9 || { echo "Atualização já em andamento."; return 0; }

  git fetch --quiet origin main
  local deployed new
  # O que está RODANDO (gravado só depois de um deploy que deu certo). Antes, o script comparava com o HEAD do git:
  # se o build falhasse depois do merge, ele achava que já estava atualizado e nunca mais tentava.
  deployed=$(cat .deployed-commit 2>/dev/null || echo none)
  new=$(git rev-parse origin/main)
  [ "$deployed" = "$new" ] && return 0

  echo "$(date -Is) Nova versão: ${deployed:0:7} → ${new:0:7}"
  git merge --ff-only --quiet origin/main || git reset --hard --quiet origin/main

  # Libera espaço antes de construir (imagens antigas sem uso); o banco e os arquivos ficam em volumes, intocados.
  docker image prune -f >/dev/null 2>&1 || true
  docker builder prune -f >/dev/null 2>&1 || true

  # Reaproveita os domínios já configurados
  set -a; . ./.env.production; set +a
  if bash scripts/start-vps.sh "$DOMAIN" "$LIVEKIT_DOMAIN" "$TURN_DOMAIN" "$ACME_EMAIL"; then
    echo "$new" > .deployed-commit
    docker image prune -f >/dev/null 2>&1 || true
    echo "$(date -Is) Atualizado para ${new:0:7}"
  else
    echo "$(date -Is) FALHOU ao atualizar para ${new:0:7} — tento de novo na próxima rodada. Espaço livre:"
    df -h / | tail -1
    return 1
  fi
}

# Função inteira é lida antes de executar: seguro mesmo se o git pull alterar este arquivo.
main "$@"
exit
