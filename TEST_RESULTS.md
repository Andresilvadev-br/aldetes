# Resultados de testes

Todos os resultados abaixo vieram de execuções reais neste repositório, em 27/10/2026, num contêiner Linux (4 vCPU, 15 GB RAM) com PostgreSQL 16 e Redis 7 em Docker e LiveKit 1.9.1 rodando nativamente. Nada aqui é estimado.

## 1. Backend: integração (Vitest + HTTP + Socket.IO reais)

`cd apps/server && pnpm test`: **26/26 passaram** (cerca de 7 s). Cada execução cria um banco efêmero `aldetes_t_<timestamp>`, aplica as migrações com `migrate deploy` e remove o banco ao final.

Cobertura:
- **Contas:** cadastro, nomes duplicados, senha fraca, login por e-mail e por nome de usuário, hash Argon2id, listagem e revogação de sessões, redefinição de senha (token de uso único, revoga as sessões).
- **Servidores:** criação com canais padrão, isolamento antes de entrar, convite com limite de usos, mensagens em tempo real, nonce sem duplicar, paginação, digitação, edição, reações, fixar e excluir, busca respeitando visibilidade.
- **Permissões validadas no servidor:** membro comum bloqueado; canal privado invisível, inclusive no tempo real; cargo concede acesso; hierarquia (moderador não age sobre a dona e não se concede ADMINISTRATOR); expulsar, banir e desbanir; castigo bloqueia o envio; registro de auditoria; token de voz exige CONNECT.
- **Social:** amizade, DM, bloqueio impede DM, presença (incluindo invisível aparecendo como offline).
- **Persistência:** dados continuam disponíveis depois de reiniciar a API.

`cd packages/shared && pnpm test`: cálculo de permissões (5 testes).

## 2. Web: unitários

`cd apps/web && pnpm test`: **7/7 passaram**. Cobrem o markdown sem injeção de HTML/XSS, links seguros, formatação, menções e a conversão `@usuario`/`@cargo`/`#canal` (preservando blocos de código).

## 3. Ponta a ponta com dois clientes independentes (`e2e/two-clients.mjs`)

São dois contextos Chromium separados (cookies e sessões distintos), usando a API real, o banco real e o LiveKit real. A mídia trafega via WebRTC pelo SFU, com microfone, câmera e tela falsos do Chromium.

```
✅ Dois usuários criam contas distintas e fazem login
✅ Usuário A cria um servidor
✅ Convite gerado
✅ Usuário B entra com o convite
✅ Mensagens em tempo real nos dois sentidos
✅ Ambos entram no mesmo canal de voz (LiveKit)
✅ A recebe o áudio de B — {"bytesDelta":28842,"peakRms":0.2796}
✅ B recebe o áudio de A — {"bytesDelta":27556,"peakRms":0.2881}
✅ Estados de voz propagados (webhook LiveKit → API → Socket.IO)
✅ B recebe o vídeo da câmera de A
✅ A compartilha a tela e B visualiza a transmissão — captura local 1280x720@30
✅ Cliente B reconecta ao gateway após ficar offline
✅ Mensagens voltam a chegar após a reconexão
✅ Voz de B se recupera após queda de rede
14/14 verificações passaram
```

O áudio foi validado pelo sinal **decodificado** (RMS medido por um AnalyserNode na trilha remota), não só pelos bytes recebidos.

## 4. Desktop (Electron, `e2e/desktop-smoke.mjs`, rodando sob Xvfb)

Rodou contra a versão de desenvolvimento e também contra o **pacote gerado** (`release/linux-unpacked/aldetes`):

```
✅ Janela carrega via app://aldetes
✅ Bridge exposta e Node isolado do renderer
✅ Primeira execução: servidor configurado e validado (/api/health)
✅ Cadastro/login pelo app desktop
⚠️  Token não persistido: safeStorage sem keyring neste ambiente (comportamento seguro esperado)
✅ desktopCapturer lista fontes de captura — screen:Entire screen
✅ Entra no canal de voz pelo desktop
✅ Compartilha a tela escolhida no seletor nativo
```

O pacote **AppImage para Linux** foi gerado com sucesso (118 MB). Os instaladores de Windows (NSIS) e macOS (DMG) **não foram gerados aqui**, porque exigem runners Windows/macOS (veja `.github/workflows/release.yml`).

Nesse teste, o vídeo da tela vem do dispositivo falso do Chromium (`--use-fake-device-for-media-stream`), mas o caminho seletor → `setDisplayMediaRequestHandler` → publicação no LiveKit foi exercitado de verdade.

## 5. Medições de desempenho (`e2e/perf.mjs`, `e2e/electron-idle.mjs`)

| Métrica | Resultado | Condições |
|---|---|---|
| Latência envio → recebimento de mensagem | p50 **23,8 ms**, p95 **31,6 ms**, máx. 50,6 ms | 200 mensagens; API em modo dev (tsx + logs formatados) atrás do proxy do Vite; tudo local |
| Carregar 50 mensagens do histórico | 23,8 ms | HTTP local |
| Login → canal com histórico renderizado | 395 ms | Chromium headless, servidor de dev do Vite |
| Cliente web ocioso | **0,01%** de CPU na thread principal, heap JS de 9,9 MB, 1.592 nós DOM | 10 s, canal aberto com 200 mensagens |
| App desktop ocioso | **0,22%** de CPU somada, 486 MB de working set, 4 processos | Tela de login, Xvfb e GPU por software |
| Bundle web | 307 KB gzip (JS) e 7,6 KB (CSS) | `vite build` |

## 6. Ainda não testado (precisa de infraestrutura que não existe neste ambiente)

- Chamada entre **computadores em redes/cidades diferentes**, passando por NAT real e pelo TURN. Procedimento em `docs/MANUAL_TESTING.md`.
- Instaladores Windows/macOS, assinatura de código e auto-update ponta a ponta.
- Áudio do sistema no compartilhamento de tela (Windows), PTT global em macOS/Windows e notificações nativas.
- Implantação de produção com domínio e certificados reais. Os comandos do Dockerfile da API foram validados em contêiner; o `apt-get` não pôde ser testado porque este sandbox bloqueia `deb.debian.org`.
- Carga com muitos usuários simultâneos e várias instâncias da API.

## 7. Rodada de 04/11/2026 — redesign, Live Island 2.0, login persistente, nova logo

| Teste | Resultado |
|---|---|
| `pnpm test` (shared 5 · web 7 · API 27, inclui **renovação automática da sessão** e "manter conectado" desligado) | **39/39** |
| `e2e/two-clients.mjs` (dois navegadores; voz, vídeo, tela e reconexão com a UI nova) | **14/14** |
| `e2e/desktop-smoke.mjs` (Electron: app://, bridge, servidor, login, sessão salva, captura, voz, tela) | **8/8** |
| `e2e/desktop-relaunch.mjs` (reabrir o app entra direto, sem login) | **1/1** |
| `e2e/desktop-island.mjs` (ilha flutuante: aparece com o app na bandeja, mostra a call, abre ao passar o mouse e a janela acompanha, mutar/sair pela ilha, música via MPRIS com pausar funcionando) | **8/8** |
| Pacote `.deb` Linux (correção de `homepage`/mantenedor) | gerado (92 MB) |

**Limites desta rodada:**
- O teste de música no Linux usou um `playerctl` falso que imita um player MPRIS. O código da ponte é o real.
- A leitura de música no **Windows** (sessões de mídia via PowerShell/WinRT) **não pôde ser executada aqui**, porque o ambiente é Linux. Precisa ser testada num PC com Windows 10/11 tocando Spotify ou YouTube.
- "Iniciar com o Windows" (`setLoginItemSettings`) também só é verificável no Windows.

## 8. Rodada de 04/11/2026 (noite): transmissão, ilha móvel, perfis

| Teste | Resultado |
|---|---|
| `pnpm test` (inclui atividade "Jogando", banner/efeito válidos e inválidos, presença enviada a quem entra no servidor) | **40/40** |
| `e2e/two-clients.mjs` (nova tela de transmissão) | **14/14** |
| `e2e/desktop-smoke.mjs` / `e2e/desktop-island.mjs` | **8/8** / **8/8** |
| Ilha do app: arrastar, posição salva após recarregar, duplo clique volta ao topo | **3/3** |
| Perfil: lista de membros mostra "Jogando VALORANT"; cartão com Mensagem/Ligar/Adicionar; Adicionar envia solicitação | **3/3** |
| Detector de jogos (Linux, processo `cs2.exe` real em execução) | reconhecido como Counter-Strike 2 |
| Teste de conexão de voz (Configurações → Voz e vídeo) contra o LiveKit local | servidor, WebRTC e microfone ✅; TURN pulado (não configurado em dev) |

**Corrigido nesta rodada:** quem entrava num servidor via convite via todos os membros como "Offline" até recarregar.

**Não testado aqui:** a detecção de jogos no Windows (`tasklist`) e a qualidade real de 1080p60 em rede de verdade.

## 9. Rodada de 04/11/2026 (madrugada): transmissão otimizada e nova barra de canais

| Teste | Resultado |
|---|---|
| `pnpm test` (shared 5 · web 7 · API 28) | **40/40** |
| `e2e/two-clients.mjs` (agora com medição de FPS da transmissão) | **17/17** |
| `e2e/desktop-smoke.mjs` (inclui barra "ao vivo" com estatísticas reais, prioridade de processo e flags anti-throttling) | **11/11** |
| `e2e/desktop-island.mjs` | **8/8** |

**Transmissão: mesma fonte animada de 1080p a 60 FPS, mesmo PC (4 vCPU, codificação por software):**

| Configuração | Quem assiste recebe |
|---|---|
| Antiga (VP9 com 3 camadas espaciais + camada extra 720p/15 FPS, `maintain-resolution`) | **720p a 15 FPS** |
| Nova (camada única, H.264, `maintain-framerate`) | **1080p a 60 FPS**, 0 quadros perdidos |

- A captura agora é pedida com FPS máximo explícito: 1080p@60 é entregue (antes saía 720p@30).
- O dispositivo de tela **falso** do Chromium usado nos testes gera ~20 FPS fixos, por isso a medição de 60 FPS usa um canvas animado publicado com as mesmas configurações do app.
- No app desktop sob Xvfb, a transmissão começa em resolução menor enquanto a estimativa de banda "aquece" e chega a **1080p · 60 FPS em cerca de 15 s**.
- **Não testado aqui:** codificação por hardware (NVENC/AMF/QuickSync) no Windows. A barra "ao vivo" mostra se está usando GPU ou CPU.
