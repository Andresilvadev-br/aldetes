# Arquitetura do Aldetes

## Visão geral

```
                ┌──────────────────────────── Clientes ────────────────────────────┐
                │  Web (React/Vite)            Desktop (Electron = mesma UI web)   │
                │  cookie httpOnly + CSRF      token Bearer em safeStorage (SO)     │
                └───────┬───────────────────────────────┬───────────────┬──────────┘
          HTTPS /api, /cdn │        WSS /socket.io          │   WSS sinalização │ UDP/TCP mídia (WebRTC)
                ┌──────────▼───────────────────────────────▼──┐   ┌──────────▼──────────────┐
                │ API Node.js (Fastify + Socket.IO)           │   │ LiveKit SFU (self-host) │
                │  • REST: contas, servidores, canais, cargos │◀──│  • salas = canais de voz│
                │  • Gateway em tempo real (eventos)          │web│  • TURN embutido (3478/ │
                │  • Emite tokens LiveKit (permissões)        │hook│    5349) p/ NAT restrito│
                │  • Webhooks LiveKit → estados de voz        │   └─────────────────────────┘
                └───┬──────────────┬──────────────┬───────────┘
                    │              │              │
              PostgreSQL        Redis         Armazenamento
              (Prisma)     (sessões em cache, (disco local ou
                           presença, voz,      MinIO/S3)
                           rate limit, adapter
                           Socket.IO multi-nó)
```

## Monorepo (pnpm workspaces)

| Pacote | Papel |
|---|---|
| `packages/shared` | Bitfield de permissões e cálculo de permissões efetivas, schemas Zod (validação compartilhada), nomes de eventos, tipos de DTO. Consumido como código-fonte TS por web e API. |
| `apps/server` | API Fastify 5 + Socket.IO 4, Prisma 6 (PostgreSQL), ioredis, argon2, livekit-server-sdk. |
| `apps/web` | React 18 + TypeScript + Tailwind 3 + Zustand 5 + livekit-client 2. Roteamento por hash (funciona em `app://` do Electron). |
| `apps/desktop` | Electron 38: processo principal, preload mínimo, captura de tela nativa, PTT global (libuiohook), bandeja, auto-update (electron-updater, provedor genérico auto-hospedado). |
| `infra/` | Compose de desenvolvimento, compose de produção (Caddy + API + Postgres + Redis + LiveKit + MinIO opcional). |
| `e2e/` | Testes ponta a ponta com navegadores/Electron reais. |

## Decisões técnicas

- **IDs snowflake de 19 dígitos com zero à esquerda** (`apps/server/src/lib/snowflake.ts`): ordenáveis no tempo e comparáveis como texto no Postgres — paginação por `id < before` é correta e indexável (`@@index([channelId, id])`).
- **Permissões no backend sempre**: toda rota passa por `requireServer`/`requireChannel` (`services/permissions.ts`), que calcula a permissão efetiva (dono → tudo; união dos cargos; ADMINISTRATOR; sobrescritas de canal @everyone → cargos → membro; castigo remove permissões de fala/escrita). A UI só usa o mesmo cálculo (`packages/shared`) para esconder botões.
- **Hierarquia de cargos**: ações sobre membros (expulsar, banir, castigo, apelido, cargos) exigem que o cargo mais alto do autor seja superior ao do alvo; ninguém concede permissões que não possui.
- **Isolamento em tempo real**: cada socket entra nas salas `channel:<id>` apenas dos canais que pode ver. Mudanças de cargo/sobrescrita reavaliam a visibilidade (`syncServerSubscriptions` / `broadcastChannelVisibility`), emitindo `channel:delete` para quem perdeu acesso. Mensagens de canais privados nunca chegam a quem não pode vê-los (coberto por teste).
- **Sem duplicação de mensagens**: o cliente envia um `nonce`; a API devolve a mesma mensagem se o nonce se repetir (10 min). Após reconexão, o cliente busca `?after=<último id>` de cada canal em cache e reenvia pendentes com o mesmo nonce.
- **Sessões**: token aleatório de 256 bits; apenas o SHA-256 fica no banco; cache de 5 min no Redis; revogação remove o cache e derruba os sockets da sessão. Web usa cookie `httpOnly; SameSite=Lax` + cabeçalho `X-Aldetes-Client` obrigatório em mutações (CSRF); desktop usa Bearer guardado com `safeStorage` (Keychain/DPAPI/libsecret) — sem keyring o token **não** é salvo em texto puro.
- **Voz/vídeo/tela**: LiveKit SFU. A API emite tokens com `canPublishSources` derivados de SPEAK/VIDEO e do silêncio do servidor; moderação (silenciar/ensurdecer/desconectar) atua no LiveKit via RoomService. Os webhooks do LiveKit (assinados) são a fonte de verdade de quem está em cada canal; um reconciliador a cada 60 s corrige estados se algum webhook se perder.
- **Compartilhamento de tela**: navegador usa `getDisplayMedia` (seletor nativo do navegador); desktop usa seletor próprio com miniaturas (`desktopCapturer`) e `setDisplayMediaRequestHandler`. Presets 720p/1080p a 30/60 FPS com VP9 + fallback VP8, simulcast e dicas de conteúdo (movimento × nitidez). Áudio do sistema só é oferecido onde funciona (Electron/Windows: loopback; Chromium: aba ou tela no Windows).
- **Markdown seguro**: renderizador próprio que produz elementos React (nunca `innerHTML`); links só `http(s)` com `rel="noopener noreferrer nofollow"`.
- **CDN de anexos**: tipo detectado pelo conteúdo (`file-type`), SVG/HTML/desconhecidos servidos como download (`Content-Disposition: attachment`), `nosniff` e CSP `sandbox`.
- **Desempenho do cliente**: lista de membros virtualizada (`@tanstack/react-virtual`); mensagens com `content-visibility: auto`; no máximo 400 mensagens por canal em memória; seletores Zustand com comparação rasa para evitar re-renderizações.

## Fluxos principais

1. **Login** → `POST /api/auth/login` → cookie/token → `GET /api/users/@me` → Socket.IO conecta → evento `ready` com servidores, canais visíveis, cargos, membros, DMs, amizades, presenças, estados de voz e estados de leitura.
2. **Mensagem** → `POST /api/channels/:id/messages` (permissão, slowmode, anexos, menções, idempotência) → `message:create` para a sala do canal → contadores de menção.
3. **Voz** → `POST /api/voice/:channelId/join` (CONNECT) → token LiveKit → cliente conecta ao SFU → webhook `participant_joined` → API grava estado no Redis → `voice:state` para o servidor.
