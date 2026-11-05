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

## 10. Novo fluxo de atualização do app desktop (`e2e/desktop-update.mjs`)

Roda contra um servidor de atualização local (provedor "generic" do electron-updater) que publica a versão 9.9.9 com um pacote de 24 MB, enviado a ~6 MB/s:

```
✅ Pop-up aparece sozinho quando há versão nova — novidades: Novo aviso de atualização… | Transmissão em 1080p a 60 FPS | Barra de canais refeita
✅ Tela de atualização em andamento com progresso real — 18,0 de 24,0 MB · 6,0 MB/s · faltam ~1 s
✅ Download completo e verificado (sha512) → contagem para reiniciar — 24.0 MB servidos
✅ Contagem termina e o app passa a instalar/reiniciar sozinho
4/4 verificações passaram
```

No modo de teste o app para logo antes de `quitAndInstall` (não substitui o executável em uso). **A instalação silenciosa e o reinício no Windows** só podem ser confirmados com duas versões reais publicadas no GitHub.

## 11. Versão 0.5.0: especificação "Experiência Premium" V1.2

| Teste | Resultado |
|---|---|
| `pnpm test` (shared 5 · web 7 · API 28) | **40/40** |
| `e2e/two-clients.mjs` | **17/17** |
| `e2e/multi-stream.mjs`: 3 navegadores na mesma call | **7/7** |
| `e2e/mobile-pwa.mjs`: Pixel 7 emulado, build de produção | **10/10** |
| `e2e/desktop-smoke.mjs` / `desktop-island.mjs` / `desktop-update.mjs` | **11/11** / **9/9** / **4/4** |

Cenários da matriz da especificação cobertos por automação:
- **B. Mutar:** pelo dock o estado chega aos outros; pela ilha flutuante, o app muta.
- **D. Duas transmissões:** as duas chegam ao espectador. Trocar Foco/Grade e o destaque não reinicia nenhum vídeo (o mesmo elemento `<video>` continua tocando).
- **G. Reação em grupo:** chega uma vez para cada pessoa, some sozinha, e 15 cliques rápidos viram 1.
- **H. Saída:** sem bloco fantasma.
- **Celular:** navegação em dois painéis, sem rolagem lateral; dock com botões de 44 px ou mais dentro da tela.
- **PWA:** manifest com ícones, service worker ativo e app abrindo sem internet com aviso.
- **Novidades:** aparecem uma vez após atualizar e não se repetem ao recarregar.

Não automatizado: o adiamento das novidades durante a call (o código espera a call terminar), movimento reduzido e monitor de alta taxa.

## 12. Versão 0.6.0: fotos rápidas, áudio, pendências do PDF e desempenho

| Teste | Resultado |
|---|---|
| `pnpm test` (shared 5 · web 7 · API 31: anexos com miniatura/borrão/onda, metadados e miniatura falsa rejeitados, chamar para a call só estando nela) | **43/43** |
| `e2e/two-clients.mjs` | **17/17** |
| `e2e/multi-stream.mjs` (inclui travadas da interface com 2 transmissões) | **8/8** |
| `e2e/media.mjs` (foto grande e mensagem de voz entre dois navegadores) | **5/5** |
| `e2e/mobile-pwa.mjs` (build de produção) | **10/10** |
| `e2e/desktop-smoke.mjs` / `desktop-island.mjs` / `desktop-update.mjs` | **11/11** / **9/9** / **4/4** |

**Foto** (o teste gera uma foto de 4000×3000):
- original de 8,4 MB;
- enviada com 1,7 MB;
- quem recebe baixa uma miniatura de poucos KB e um borrão de cerca de 1 KB;
- a original só é baixada ao abrir.

**Mensagem de voz:** gravada com o microfone falso, chega com 64 barras de onda, duração de 2,8 s e toca para quem recebe.

**Carregamento** (`e2e/perf-load.mjs`: build de produção, CPU 4× mais lenta, 4G de 4 Mbps com 120 ms):

| | 0.5.0 | 0.6.0 |
|---|---|---|
| JavaScript para abrir o app | 1.347 KB | **740 KB (−45%)** |
| Login até o app | ~2,7 s | ~2,7 s |

O tempo de login é dominado pela verificação da senha com Argon2id (lenta de propósito) e pelos dados iniciais, não pelo código. A biblioteca de voz agora é baixada só depois que o app abre (em segundo plano) ou ao entrar numa call.

**Fluidez:** com 3 pessoas e 2 transmissões, nenhuma tarefa travou a interface por mais de 50 ms em 4 s. O FPS medido aqui (≈10–20) é limitado por esta máquina, que não tem placa de vídeo e roda 3 navegadores codificando vídeo; até a tela só de voz fica em 20 FPS. Esse número não vale para um PC real.

**Não testado aqui:**
- iPhone real (teclado, gravação de áudio no Safari);
- Android real;
- codificação por GPU no Windows.

## 13. Versão 0.7.0: reconstrução da experiência mobile (`e2e/mobile-nav.mjs`)

| Teste | Resultado |
|---|---|
| `e2e/mobile-nav.mjs` (iPhone SE, iPhone 14 Pro, Pixel 7, Android 320 px, deitado) | **29/29** |
| `e2e/mobile-pwa.mjs` (build de produção) | **10/10** |
| `pnpm test` | **43/43** |
| `e2e/multi-stream.mjs` / `e2e/media.mjs` | **8/8** / **5/5** |
| `e2e/desktop-smoke.mjs` / `desktop-island.mjs` / `desktop-update.mjs` | **11/11** / **9/9** / **4/4** |
| `e2e/two-clients.mjs` | **16/17** (ver abaixo) |

O que o `mobile-nav` confere:
- nada cobre o botão de cadastro;
- 4 abas com a ativa marcada;
- criar servidor mostra a lista;
- o chat abre em tela cheia e a barra inferior some;
- a rolagem da lista é mantida ao voltar (420 px → 420 px);
- voltar e avançar do sistema funcionam;
- o campo de mensagem continua visível com a área reduzida;
- o toque longo abre um painel inferior, e o voltar do sistema fecha só o painel;
- o seletor de emoji fica dentro da tela;
- a call tem controles de 44 px ou mais;
- a barra da call fica acima das abas e no topo de outro chat, sem sobrepor nada;
- sair da call pede confirmação;
- um pedido de amizade real aparece em Notificações e pode ser aceito;
- as configurações funcionam em pilha;
- arrastar da borda volta, e rolar na vertical não volta;
- nada fica cortado em nenhum dos 4 tamanhos nem com o celular deitado.

**Falha que não é regressão:** o teste "fonte real de 60 FPS" do `two-clients` deu 41–44 FPS. A própria fonte (um canvas animado) só gerou 51–54 FPS nesta máquina hoje. Rodei o mesmo teste contra o código da **0.6.0** (antes destas mudanças) e o resultado foi igual: 41 FPS com fonte de 54. Esse teste passava com 59–60 FPS em rodadas anteriores, num contêiner mais rápido.

**Não testado:**
- Safari do iPhone e PWA no iOS em aparelho real (não há WebKit aqui);
- Android físico;
- o teclado real do iOS.

## 14. Versão 0.8.0: transmissão (diagnóstico com a VPS real, 120 FPS, interruptores)

**Diagnóstico feito na VPS de produção:**
- **Firewall:** o `ufw` libera todas as portas de mídia.
- **Conexão das duas pessoas da call:** pelo log do LiveKit, `connectionType: "udp"`. O firewall da KingHost não bloqueia nada.
- **Velocidade da VPS:** 1.255 Mbit/s de download e **81 Mbit/s de upload**. Esse upload é o teto do servidor: cerca de 6 pessoas assistindo em 1080p 60.
- **Causa do "540p · 15 FPS":** a transmissão chegou em duas versões, e a de baixo tinha 15 FPS. Isso só acontece com o app antigo (≤ 0.4), que mandava uma cópia de 720p/15. O app atual não tinha como ligar a versão leve, porque os interruptores estavam quebrados.

| Teste | Resultado |
|---|---|
| `e2e/stream-options.mjs` (interruptor funciona; 1080p 120 sai em H.264 numa versão só com limite de 120 FPS; "Texto e código" em H.264; versão leve com as duas cópias a 60 FPS; "Máxima"; diagnóstico; aviso de app desatualizado) | **7/7** |
| Interruptores de Aparência e linhas com texto (Voz e vídeo) | **2/2** |
| `pnpm test` | **43/43** |
| `e2e/two-clients.mjs` (com a fonte real de 60 FPS → ~60 recebidos) / `e2e/multi-stream.mjs` | **17/17** / **8/8** |
| `e2e/mobile-nav.mjs` | **29/29** |
| `e2e/desktop-smoke.mjs` / `desktop-island.mjs` / `desktop-update.mjs` | **11/11** / **9/9** / **4/4** |

**Não testado aqui:**
- **120 FPS de verdade.** A captura de teste gera 20 FPS e esta máquina não tem placa de vídeo nem monitor de 120 Hz. O que foi verificado é a configuração: o codificador aceita 120 FPS e a captura é pedida a 120. O FPS real aparece na barra "ao vivo" e no diagnóstico.
- **Começo da transmissão:** nos primeiros 10–15 s a resolução sobe aos poucos enquanto o WebRTC mede a internet. É comportamento normal e aparece no diagnóstico.
