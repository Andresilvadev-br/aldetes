# Implantação própria (self-hosting)

## O que exige um servidor público

| Necessidade | Por quê |
|---|---|
| **VPS/servidor com IP público** (Linux, 2 vCPU / 4 GB RAM para começar) | Clientes em redes diferentes precisam alcançar a API e o LiveKit. Um computador doméstico atrás de NAT sem encaminhamento de portas não serve. |
| **Domínio** com 3 nomes (ex.: `chat.exemplo.com`, `rtc.exemplo.com`, `turn.exemplo.com`) apontando (registro A) para o IP do servidor | O TLS automático (Let's Encrypt via Caddy) exige nomes de domínio. Navegadores só liberam microfone, câmera e tela em contextos seguros (HTTPS). |
| **Certificados TLS** | Emitidos e renovados automaticamente pelo Caddy. O TURN/TLS do LiveKit reaproveita o certificado de `turn.exemplo.com`. |
| **Portas liberadas no firewall** | `80/tcp` e `443/tcp+udp` (Caddy) · `7881/tcp` (WebRTC via TCP) · `50000-60000/udp` (mídia WebRTC) · `3478/udp` (TURN/UDP) · `5349/tcp` (TURN/TLS, para redes corporativas que só permitem TLS) |
| **SMTP** (opcional, mas recomendado) | Recuperação de senha por e-mail. Qualquer provedor SMTP serve; não há dependência de API paga. |

Custos possíveis: VPS e domínio (pagos pelo proprietário), além de certificado de assinatura de código caso queira instaladores sem aviso no Windows/macOS. Nada disso é necessário para rodar localmente.

## Passo a passo

```bash
# no servidor (Docker e Docker Compose instalados)
git clone <seu-repo> aldetes && cd aldetes
node scripts/setup-prod.mjs --domain chat.exemplo.com --livekit-domain rtc.exemplo.com \
  --turn-domain turn.exemplo.com --email voce@exemplo.com --public-ip <IP_PUBLICO>
# edite .env.production para preencher SMTP_*
docker compose -f infra/prod/docker-compose.yml --env-file .env.production up -d --build
docker compose -f infra/prod/docker-compose.yml logs -f api livekit
```

- O script gera **segredos aleatórios** (senha do Postgres, chave/segredo do LiveKit, credenciais do MinIO) em `.env.production` e `infra/prod/livekit.yaml`, ambos com permissão `0600` e ignorados pelo git.
- As migrações rodam automaticamente (`prisma migrate deploy`, não destrutivo) toda vez que a API inicia.
- Na primeira subida, o TURN/TLS do LiveKit só funciona depois que o Caddy obtém o certificado de `turn.exemplo.com` (cerca de 1 minuto). Depois disso, rode `docker compose ... restart livekit`.
- Para armazenamento S3 (MinIO): defina `STORAGE_DRIVER=s3` e `S3_ENDPOINT=http://minio:9000` em `.env.production` e suba com `--profile s3`.

## Clientes desktop

Na primeira abertura, o app pergunta o servidor. Informe `https://chat.exemplo.com` em **Alterar servidor Aldetes** na tela de login. A origem `app://aldetes` já está liberada em `WEB_ORIGINS`.

Atualização automática: publique os artefatos de `apps/desktop/release/` (`latest.yml`, `latest-mac.yml`, instaladores) em uma URL estática e gere os builds com `ALDETES_UPDATE_URL=https://downloads.exemplo.com/aldetes`.

## Backups

- `docker compose exec postgres pg_dump -U aldetes aldetes > backup.sql`
- Volume `uploads` (ou o bucket MinIO) com os anexos.
- O Redis guarda apenas estado efêmero (presença, voz, cache), então não precisa de backup.

## Escala

- A API não guarda estado local além dos sockets: várias instâncias podem rodar atrás do Caddy (o adapter Redis do Socket.IO já está configurado; requer sticky sessions ou transporte apenas WebSocket, que é o padrão dos clientes). **Isso ainda não foi testado com várias instâncias.**
- O LiveKit escala horizontalmente com Redis (modo multi-nó); consulte a documentação do LiveKit.
