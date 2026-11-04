# Experiência mobile (0.7.0)

## Diagnóstico (antes)
Auditoria automática em iPhone SE (375 px), iPhone 14 Pro e Android 360 px:
- **O aviso "Instale o Aldetes" cobria o botão "Continuar" do cadastro** em telas pequenas, impedindo criar conta.
- **Configurações** usavam o layout de duas colunas do PC: conteúdo espremido e botão de fechar fora da tela.
- **Seletor de emoji** maior que a tela: as linhas de baixo ficavam fora e não dava para tocar nelas.
- **Menus e cartões de perfil** abriam como pop-ups de PC, em coordenadas do mouse.
- **Alvos de toque pequenos:** 19–28 px (criar canal, emoji, anexar, cabeçalhos de categoria).
- **Tooltips ficavam presos depois de um toque.** O navegador simula `mouseenter` e nunca envia `mouseleave`.
- **Navegação de PC encolhida:** sem barra inferior, sem tela de notificações nem de perfil. A Live Island ocupava o topo com o relógio, e a tela "voltar" não usava o histórico.
- **Celular deitado** (852 px de largura) caía no layout de PC.

## Arquitetura (depois)

| Peça | Arquivo | O que faz |
|---|---|---|
| Shell | `components/mobile/MobileShell.tsx` | Abas Servidores · Mensagens · Notificações · Você. As listas ficam sempre montadas (a rolagem é preservada) e o chat ou a call desliza por cima. A altura segue o `visualViewport`, então o teclado não cobre nada. |
| Navegação | `lib/mobile.ts` | O painel (lista ou conteúdo) vem do histórico (`state.m`). O ← do app, o voltar do Android e o gesto do iOS levam ao mesmo lugar. `openContent` e `mobileBack`. |
| Rotas | `AppShell.tsx` (`MobileContentVisible`) | As rotas sempre rodam (redirecionamentos, permissões), mas a tela do chat só monta quando está aberta. Assim nada é marcado como lido sem ser visto. |
| Gesto de voltar | `ContentLayer` | Arrastar da borda esquerda, só na horizontal; rolagem vertical não aciona. Fica desligado no Safari do iPhone (fora do app instalado), que já tem o próprio gesto. |
| Overlays | `useBackToClose`, `Sheet` | Menus, cartões, seletores e modais viram painéis inferiores. O voltar do sistema fecha o overlay, não a tela. |
| Toque longo | `installLongPress` | Abre o menu de contexto no iOS, que não tem `contextmenu` nativo. O toque que solta o dedo é ignorado. |
| Call | `CallBar`, `LiveIsland mobile` | A barra da call fica acima das abas ou no topo de outro chat. A ilha aparece só para eventos (ligação, upload, reconexão). Compartilhar tela só aparece onde existe `getDisplayMedia`. |
| Configurações | `SettingsLayout` → `MobileSettings` | Lista, depois a seção, com voltar. |
| Detecção | `phone:` (Tailwind) e `useIsMobile` | `(max-width: 767px), (pointer: coarse) and (max-height: 500px)`, que inclui o celular deitado. |

**Desktop:** o layout de colunas não mudou. Os testes do app desktop e do navegador continuam passando.

## Testes (`e2e/mobile-nav.mjs`)
29 verificações em iPhone SE, iPhone 14 Pro, Pixel 7, Android 320 px e celular deitado. Ver `TEST_RESULTS.md` § 13.

## Limites honestos
- **Os testes rodam no Chromium com emulação de toque e de tamanho de tela.** Não há WebKit neste ambiente, então o **Safari do iPhone e o modo PWA instalado no iOS não foram testados em aparelho real**.
- **O teclado virtual foi simulado** reduzindo a área visível. O comportamento real do teclado do iOS (que rola a página por baixo) foi tratado no código (`--vv-top`), mas precisa ser conferido num iPhone.
- **Áudio em segundo plano e interrupções** (ligação telefônica) dependem do sistema. O app retoma o áudio ao voltar para a frente, mas não foi testado em aparelho.
