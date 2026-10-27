# Testes manuais que exigem duas máquinas ou redes distintas

Estes testes **não podem** ser automatizados dentro de um único contêiner. Faça-os após uma implantação pública (`docs/DEPLOY.md`).

## Preparação
- Computador A: rede doméstica (Wi-Fi), app desktop ou Chrome/Edge.
- Computador B: **outra rede** (ex.: roteado pelo 4G/5G do celular), app desktop ou navegador.
- Opcional, C: rede corporativa ou com firewall restritivo (força o uso de TURN/TLS na 5349).

## Roteiro (marque cada item)

1. [ ] A e B criam contas diferentes e fazem login.
2. [ ] A cria um servidor e gera um convite de 1 uso; B entra pelo link. Um segundo uso do mesmo link deve falhar.
3. [ ] Troquem mensagens. Elas devem aparecer em menos de 1 s, com indicador de digitação e anexo de imagem com pré-visualização.
4. [ ] Os dois entram no canal de voz **Geral** e se ouvem nos dois sentidos. O anel verde (quem fala) acompanha a fala.
5. [ ] A silencia o microfone: B vê o ícone de mudo e para de ouvir. A ensurdece: A para de ouvir B.
6. [ ] B ajusta o volume de A (botão direito → Volume) para 50% e 200%, e percebe a diferença.
7. [ ] Os dois ligam a câmera e veem a imagem um do outro. Testar o modo foco (clique no vídeo) e a tela cheia (duplo clique).
8. [ ] A compartilha a tela em 1080p30 e B assiste. Verifique a nitidez de texto pequeno com "Nitidez" e a fluidez de um vídeo com "Movimento" em 720p60.
9. [ ] Desktop Windows: compartilhar a tela **com áudio** (tocar um vídeo do YouTube) e confirmar que B ouve.
10. [ ] **Queda de rede:** desligue o Wi-Fi de A por 10 s e religue. O painel deve mostrar "Reconectando…" e voltar para "Voz conectada" sem ação manual, e as mensagens enviadas por B nesse intervalo devem aparecer sem duplicar.
11. [ ] **Troca de rede:** em A, mude do Wi-Fi para o 4G durante a chamada. A chamada deve se recuperar sozinha.
12. [ ] Com C (firewall restritivo), confirme que a chamada funciona. Em `chrome://webrtc-internals`, o candidato selecionado deve ser `relay`.
13. [ ] Moderação: A cria o cargo "Mod" com "Silenciar membros" e atribui a B. B silencia A no servidor, e A deixa de transmitir áudio (ícone vermelho).
14. [ ] Reinicie os serviços (`docker compose restart api postgres redis`). Mensagens, servidores e cargos continuam lá, e os clientes reconectam sozinhos.
15. [ ] Desktop: o aperte-para-falar global funciona com a janela minimizada (no macOS, conceda a permissão de "Monitoramento de entrada").
16. [ ] Notificação desktop ao receber DM com a janela em segundo plano. Clicar nela abre a conversa.

## O que registrar
Para cada item: resultado, sistemas operacionais e navegadores usados, tipo de rede e, em caso de falha, o export de `chrome://webrtc-internals` e os logs `docker compose logs api livekit`. Anote em `TEST_RESULTS.md`.
