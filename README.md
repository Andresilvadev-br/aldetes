# Aldetes

Plataforma de comunicação em tempo real, de código aberto e **auto-hospedável**: servidores, canais, cargos, mensagens, chamadas de voz, vídeo e compartilhamento de tela. Roda no navegador e como app desktop (Windows, macOS e Linux via Electron).

> Status: primeira versão utilizável, validada com dois clientes reais (ver `TEST_RESULTS.md`). Roadmap em `TASKS.md`, situação por fase em `PROJECT_STATUS.md` e arquitetura em `ARCHITECTURE.md`.

## Stack

React + TypeScript + Tailwind · Electron · Node.js + Fastify + Socket.IO · PostgreSQL + Prisma · Redis · LiveKit (WebRTC SFU, com TURN embutido) · Docker. Não depende de nenhuma API paga.

## Rodando localmente

Pré-requisitos: Node 22+, pnpm 10, Docker.

```bash
pnpm install
pnpm setup              # gera .env com segredos aleatórios (não versionado)
pnpm infra:up           # PostgreSQL + Redis (Docker)
pnpm livekit:dev        # LiveKit (outro terminal; binário em infra/bin ou imagem Docker)
pnpm --filter @aldetes/server db:deploy
pnpm dev:server         # API em http://localhost:3001
pnpm dev:web            # Web em http://localhost:5173
pnpm dev:desktop        # (opcional) app desktop apontando para o servidor de dev do Vite
```

Para testar com dois "usuários" na mesma máquina, abra uma janela normal e outra anônima.

Para testar a partir de outro computador da mesma rede, rode `node scripts/setup-env.mjs --force --public-host <IP-da-máquina>`. Microfone e câmera só funcionam em `localhost` ou HTTPS; para redes diferentes use a implantação descrita em `docs/DEPLOY.md`.

E-mail em desenvolvimento: sem SMTP, o link de redefinição de senha aparece no log da API. Opcionalmente, rode `docker compose -f infra/docker-compose.dev.yml --profile mail up -d` (Mailpit em http://localhost:8025).

## Testes

```bash
pnpm test                 # integração da API (banco efêmero) + unitários web/shared
pnpm test:e2e             # 2 navegadores reais: contas, convite, chat, voz, vídeo, tela, reconexão
xvfb-run -a pnpm test:desktop   # app Electron (Linux: precisa de display, use Xvfb)
pnpm perf                 # medições de latência e consumo
```

## Builds desktop

```bash
pnpm dist:desktop         # gera o instalador da plataforma atual em apps/desktop/release
```

Windows e macOS são gerados em CI nativa (`.github/workflows/release.yml`). A assinatura de código é opcional e exige certificados do proprietário.

## Produção

Veja `docs/DEPLOY.md`: o que exige servidor público, domínio, certificados (automáticos via Caddy), portas de firewall e TURN.

## Estrutura

```
apps/server    API (Fastify, Socket.IO, Prisma)
apps/web       Cliente web (React)
apps/desktop   Cliente desktop (Electron)
packages/shared Permissões, schemas e tipos compartilhados
infra/         Docker Compose de dev e de produção
e2e/           Testes ponta a ponta e medições
docs/          Implantação, testes manuais, dependências externas
```

## Identidade

A interface segue a ergonomia de apps de chat com servidores e canais, mas com nome, logotipo, ícones, paleta e sons **originais**. Nenhum código ou marca de terceiros foi copiado.
