# Backlog do Aldetes

Prioridade: **P0** bloqueia o uso real · **P1** importante · **P2** melhoria

## P0 — validação real e distribuição
- [ ] Teste de chamada entre dois computadores em redes diferentes, com TURN (roteiro em `docs/MANUAL_TESTING.md`). Requer servidor público com domínio.
- [ ] Gerar e testar os instaladores Windows (NSIS) e macOS (DMG) via `.github/workflows/release.yml`. Requer runners e, para distribuição sem avisos, certificados de assinatura (custo, decisão do proprietário).
- [ ] Primeira implantação pública com `infra/prod` (domínio, DNS, portas, SMTP).

## P1 — qualidade de voz/vídeo
- [ ] Limiar de sensibilidade no modo "detecção de voz" (gate local antes de publicar).
- [ ] Supressão de ruído avançada com RNNoise (AudioWorklet, código aberto) como opção.
- [ ] Medir 1080p60 em hardware real; ajustar bitrate/codec (testar AV1 quando houver suporte).
- [ ] Atualizar o LiveKit servidor para uma versão com sinalização v1, eliminando o fallback do cliente.
- [ ] "Assistir transmissão" explícito: hoje a transmissão é assinada automaticamente; o adaptiveStream reduz a qualidade quando o vídeo está pequeno, mas o ideal é só assinar ao clicar.
- [ ] Indicador por participante com estatísticas (bitrate, perda, jitter).

## P1 — produto
- [ ] Verificação de e-mail no cadastro (o campo `emailVerified` já existe).
- [ ] Exclusão de conta e exportação de dados.
- [ ] Carregamento sob demanda da lista de membros (servidores grandes).
- [ ] Índice de texto completo (Postgres `tsvector` em português) para a busca.
- [ ] Pré-visualização de links (unfurl no servidor com proteção contra SSRF).
- [ ] Configurações de notificação por servidor/canal (silenciar, só menções).
- [ ] Arquivar/desarquivar threads pela UI e tags de fórum.
- [ ] Rate limit para eventos do Socket.IO além da digitação.
- [ ] Teste de múltiplas instâncias da API (adapter Redis já configurado).

## P2 — funcionalidades adicionais
- [ ] Stickers por servidor.
- [ ] Emblemas originais no perfil.
- [ ] API de bots: tokens de bot, escopos e permissões, webhooks de entrada.
- [ ] Seletor de GIFs (precisa de um provedor; ver `docs/EXTERNAL_DEPENDENCIES.md`).
- [ ] Temas personalizados e mais opções de densidade (modo compacto).
- [ ] Apps móveis (React Native + livekit-react-native, reaproveitando `packages/shared` e a API).
- [ ] Reduzir o bundle web (carregar o livekit-client sob demanda).

## Concluído nesta sessão
Veja `PROJECT_STATUS.md` e o histórico do git.
