# Especificação V1.2 ("Experiência Premium"): o que foi entregue

Esta é a entrega da versão **0.5.0**. Cada item foi marcado como **pronto**, **parcial** ou **bloqueado**, sem esconder limitações.

## Diagnóstico (o que já existia)
- React 18 + Vite, zustand, motion (framer).
- LiveKit para mídia, com o canal de dados disponível.
- Socket.IO para estados de voz e presença.
- Electron com janela flutuante oficial do sistema (sem injeção em jogos).
- electron-updater e Live Island.
- O SFU já suportava várias transmissões ao mesmo tempo. Faltava a interface.

## Entregas

| Recurso | Estado | Onde |
|---|---|---|
| Palco da call (cabeçalho, palco, faixa de pessoas, dock fixo) | pronto | `components/voice/VoiceStage.tsx`, `VoiceChannelView.tsx` |
| Multitelas (Foco + miniaturas, Grade, troca sem reiniciar o vídeo) | pronto | `VoiceStage.tsx` (posições calculadas num único contêiner) |
| Avatares vivos (sinal real suavizado, um loop rAF, só transform/opacity) | pronto | `lib/voiceLevel.ts`, `components/voice/LiveAvatar.tsx` |
| Reações vivas (8 reações, Alt+1…8, canal de dados, dedupe, cooldown, expiração) | pronto | `lib/voice.ts` (`sendReaction`), `LiveAvatar.tsx` |
| Ilha 2.0 (carregando até a confirmação real, "Sair?" com 2º toque, eventos de entrada/saída/fim de transmissão, reação agrupada) | pronto | `components/island/LiveIsland.tsx`, `pages/IslandOverlay.tsx` |
| Presença inteligente (desligada por padrão, consentimento, pausar, jogos ignorados, "Em call/Transmitindo") | pronto | `lib/activity.ts`, Configurações → Privacidade, `MemberList.tsx` |
| Tokens de movimento e economia (pausa em segundo plano, movimento reduzido) | pronto | `lib/motion.ts`, `index.css`, `main.tsx` |
| Mobile (≤ 767 px: navegação em dois painéis, voltar, áreas seguras, dock de 44 px) | pronto | `lib/mobile.ts`, `AppShell.tsx` |
| PWA (manifest, ícones 192/512/maskable, service worker só da casca, instalação guiada, offline) | pronto | `public/`, `lib/pwa.ts`, `PwaBanners.tsx` |
| Novidades pós-atualização (changelog versionado, último visto por usuário e dispositivo, adia durante call, histórico) | pronto | `lib/changelog.ts`, `WhatsNew.tsx` |
| Atualização do site sem recarregar durante call | pronto | `lib/pwa.ts` (o SW espera; o aviso só aparece fora de call) |
| Notificações push no navegador | **bloqueado** | Exige servidor de push (VAPID) e permissões; não implementado |
| App iOS nativo com Dynamic Island real (ActivityKit/WidgetKit/CallKit) | **bloqueado** | Exige macOS + Xcode + conta Apple Developer; nada foi simulado na PWA |

## Limites honestos
- **Miniaturas de transmissão:** a tela é enviada em camada única, para máxima qualidade e FPS. Por isso as miniaturas recebem a mesma qualidade (não há perfil mais leve para elas). Câmeras usam simulcast normalmente.
- **iPhone (PWA):** a voz em segundo plano pode ser suspensa pelo iOS, e não há transmissão de tela pelo Safari. Os dois comportamentos não foram testados em aparelho real.
- **Testes em aparelhos reais** (Android, iPhone, tablet) e em **monitor de 144/165 Hz** ficam para o teste manual. As animações não limitam a taxa de quadros, porque seguem o requestAnimationFrame.

## Teste manual mínimo (da especificação)
1. Criar uma call com 3 pessoas.
2. Alternar o mute.
3. Iniciar duas transmissões.
4. Trocar o foco.
5. Enviar reações.
6. Ligar e desligar a presença.
7. Entrar, sair e reconectar.
8. Minimizar, restaurar e abrir um jogo.
9. Repetir tudo com o movimento reduzido ligado.
