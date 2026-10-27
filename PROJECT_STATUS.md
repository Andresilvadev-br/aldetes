# Status do projeto Aldetes

_Última atualização: 27/10/2026_

Resumo: existe uma **primeira versão utilizável de ponta a ponta**: contas, servidores, convites, cargos e permissões validados no backend, mensagens em tempo real, DMs, voz, vídeo e compartilhamento de tela reais via LiveKit, além de um app desktop Electron empacotável. A validação foi automatizada com dois clientes independentes (ver `TEST_RESULTS.md`). **Ainda falta** validar em redes distintas reais, gerar os instaladores Windows/macOS e implantar com domínio público.

Legenda: ✅ concluído e testado · 🟡 implementado, com validação parcial · ⏳ pendente

| Fase | Status | Critério de conclusão | Evidência |
|---|---|---|---|
| 1. Fundação | ✅ | Monorepo, API, banco, Redis, LiveKit e web rodando localmente; migrações | `pnpm setup`, `pnpm infra:up`, health check, testes |
| 2. Identidade visual | ✅ | Barra de servidores, canais, chat, membros, painel de usuário, modais, menus de contexto, tema escuro/claro, configurações | Capturas no E2E; telas de configurações |
| 3. Contas e servidores | ✅ | Cadastro/login/logout, recuperação de senha, perfis (avatar/banner/bio/cor), status, privacidade, bloqueio, amizades, sessões/dispositivos; servidores, convites com validade e limite, categorias, canais (texto/voz/anúncios/fórum/threads), cargos, hierarquia, sobrescritas, expulsar/banir/castigo, auditoria, arrastar e soltar | 26 testes de integração |
| 4. Mensagens | ✅ | Tempo real, DMs e grupos, edição/exclusão, respostas, encaminhamento, reações, emojis personalizados, menções, fixadas, threads, anexos com pré-visualização, busca, digitação, não lidas, paginação, sincronização entre dispositivos (ack), reconexão sem duplicar | Testes de integração + E2E |
| 5. Chamadas de voz | 🟡 | Canais de voz, chamadas privadas/em grupo (DM), mudo/surdo, silenciar/volume por participante, supressão de ruído (WebRTC), indicador de fala, seleção de dispositivos, reconexão, qualidade de conexão, moderação de voz | E2E com áudio decodificado entre 2 clientes. **Falta: teste entre redes reais/NAT/TURN** |
| 6. Vídeo e tela | 🟡 | Câmera, grade/foco, troca de câmera, simulcast/adaptativo; tela 720p/1080p a 30/60 FPS, seletor de fontes no desktop, áudio do sistema onde suportado | E2E (vídeo e tela recebidos). **Falta: medir 1080p60 em hardware real e testar áudio do sistema no Windows** |
| 7. Avançado | 🟡 | Notificações desktop, atalhos, PTT (global no desktop), favoritos, mensagens salvas, busca, aparência, acessibilidade, emojis personalizados, cargos com cores, descoberta de servidores públicos | Implementado. **Pendentes:** stickers, emblemas, API de bots, personalização avançada |
| 8. Validação e distribuição | 🟡 | AppImage Linux gerado e testado; compose de produção com TLS/TURN; CI de builds | **Falta:** builds Windows/macOS em CI, assinatura, implantação pública real, teste entre máquinas |

## Como continuar (próxima sessão)

1. Ler `TASKS.md` (backlog priorizado) e `TEST_RESULTS.md`.
2. Subir o ambiente: `pnpm install && pnpm setup && pnpm infra:up && scripts/livekit-dev.sh` (outro terminal), depois `pnpm --filter @aldetes/server db:deploy && pnpm dev:server` e `pnpm dev:web`.
3. Rodar a regressão: `pnpm test` e `node e2e/two-clients.mjs`.

## Limitações conhecidas (honestas)

- A supressão de ruído é a do WebRTC/Chromium (sem Krisp/RNNoise). No modo "detecção de voz" o microfone fica aberto (não há limiar de sensibilidade configurável ainda).
- Áudio do sistema no compartilhamento de tela: só Electron/Windows (loopback) e Chromium (aba, ou tela no Windows). Não é oferecido em macOS/Linux desktop.
- Linux sem keyring: o desktop não salva o token (pede login a cada abertura) em vez de gravá-lo em texto puro.
- A lista de membros vem inteira no `ready`: adequado para servidores de até alguns milhares de membros, mas sem carregamento sob demanda.
- A busca usa `ILIKE` (sem índice de texto completo).
- Não há pré-visualização de links (unfurl) nem seletor de GIFs.
- O livekit-client 2.23 tenta primeiro o endpoint de sinalização v1 (`/rtc/v1`), que o servidor 1.9.1 não tem. Ele cai para o endpoint antigo automaticamente (um 404 inofensivo no console), mas atualizar o LiveKit servidor elimina esse passo extra.
