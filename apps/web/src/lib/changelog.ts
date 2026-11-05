/**
 * Versioned release notes — the ONLY source of the "O Aldetes evoluiu!" panel.
 * Each entry describes what really shipped in that version (written by hand, never generated).
 * A version without an entry shows nothing: the app opens normally.
 */
/** Short animated demonstration rendered by the showcase (components/common/WhatsNew.tsx → DEMOS). */
export type DemoId = 'pulse' | 'island' | 'studio' | 'profile' | 'motion' | 'chat' | 'audio' | 'nav' | 'spaces' | 'together' | 'multiview';
/** Where "Explorar" takes the person (only real places in the app). */
export type ExploreTarget = 'home' | 'profile' | 'appearance' | 'voice' | 'studio' | 'switcher' | 'desktop' | 'spaces';

export interface Highlight {
  title: string;
  body: string;
  /** 1.0+: structured showcase fields (older entries don't have them and show as a simple list) */
  id?: string;
  category?: 'Início' | 'Navegação' | 'Chat' | 'Perfil' | 'Servidores' | 'Calls' | 'Movimento' | 'Áudio';
  demo?: DemoId;
  explore?: ExploreTarget;
}

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  /** one line under the hero title */
  tagline?: string;
  highlights: Highlight[];
  fixes?: string[];
}

export const RELEASES: Release[] = [
  {
    version: '2.0.0',
    date: '2026-11-06',
    title: 'Aldetes 2.0',
    tagline: 'Uma nova forma de estar junto: seu cantinho na call, várias telas ao mesmo tempo e ferramentas para fazer coisas juntos.',
    highlights: [
      { id: 'spaces', category: 'Calls', demo: 'spaces', explore: 'spaces', title: 'Spaces', body: 'Uma nova visualização da call: cada pessoa aparece no seu cantinho — setup gamer, quarto aconchegante, lounge, estúdio ou minimalista. A call conecta na hora, como sempre; o cenário vem depois e nunca segura nada.' },
      { id: 'multiview', category: 'Calls', demo: 'multiview', title: 'MultiView', body: 'Assista várias transmissões: modo Livre para arrastar e redimensionar as telas, fixar as favoritas e minimizar as outras (o vídeo pausa, o som continua). O volume da tela agora é separado do volume da voz.' },
      { id: 'together', category: 'Calls', demo: 'together', title: 'Together', body: 'Enquete, cronômetro, notas e quadro de desenho dentro da call. Todo mundo vê na hora, o tempo é igual para todos e ninguém apaga o que o outro escreveu.' },
      { id: 'worlds', category: 'Servidores', demo: 'studio', explore: 'studio', title: 'Worlds', body: 'Modelos prontos (Neon, Minimal, Aurora, Cosmic, Studio, Arcade), superfícies e intensidade dos efeitos. E cada um pode usar a aparência padrão num servidor, só para si.' },
      { id: 'motion4', category: 'Movimento', demo: 'motion', explore: 'appearance', title: 'UltraMotion 4.0', body: 'Perfis Cinema, Equilibrado (padrão), Econômico e Reduzido. Se o PC pesar, os efeitos diminuem sozinhos — voz e vídeo nunca.' },
    ],
    fixes: [
      'O volume da transmissão de alguém não muda mais junto com o volume da voz dessa pessoa',
      'Transmissões que terminam saem do palco com transição, sem tela preta',
      'O convite do servidor mostra quantas pessoas estão em call agora',
      'Calls, transmissão, qualidade e o app no celular continuam iguais',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-05',
    title: 'Aldetes 1.0',
    tagline: 'Sua galera. Agora. Com identidade própria, movimento de verdade e áudio sem retorno.',
    highlights: [
      { id: 'pulse', category: 'Início', demo: 'pulse', explore: 'home', title: 'Pulse', body: 'A nova tela inicial: quem está em call, jogando ou ouvindo música agora, seus atalhos, conversas pela metade e seus servidores. Reorganize os blocos do seu jeito.' },
      { id: 'island', category: 'Calls', demo: 'island', explore: 'desktop', title: 'Live Island livre', body: 'No Windows, arraste a ilha por qualquer parte para onde quiser. Ela gruda no topo, nos cantos e nas bordas, lembra o lugar em cada monitor e nunca tira o foco do jogo.' },
      { id: 'studio', category: 'Servidores', demo: 'studio', explore: 'studio', title: 'Server Studio', body: 'Donos dão identidade ao servidor: cor, cena animada, banner em vídeo, moldura, entrada e boas-vindas. Pré-visualização, rascunho, publicar e reverter.' },
      { id: 'profile', category: 'Perfil', demo: 'profile', explore: 'profile', title: 'Perfis com identidade', body: 'Coleções NEON CURRENT, ORBITAL, CHROMA WAVE e ZEN DUST, molduras de avatar, efeitos de entrada, pronomes, links e banner em vídeo curto — com pré-visualização ao vivo.' },
      { id: 'motion', category: 'Movimento', demo: 'motion', explore: 'appearance', title: 'UltraMotion 3.0', body: 'Ultra, Equilibrado ou Desempenho de verdade. Os efeitos pausam sozinhos fora da tela, em segundo plano e quando o PC está sob carga, como durante uma transmissão.' },
      { id: 'chat', category: 'Chat', demo: 'chat', explore: 'home', title: 'Chat 2.0', body: 'Responder destaca a mensagem original, fotos abrem crescendo da miniatura, reações com física, rascunhos que não se perdem e um painel com pessoas, arquivos, links e fixadas.' },
      { id: 'audio', category: 'Áudio', demo: 'audio', explore: 'voice', title: 'Som da transmissão sem retorno', body: 'No Windows 11 o app pede ao sistema para deixar as vozes da call fora do som da transmissão, então ninguém se ouve de volta. E uma nova central de áudio para escolher e testar microfone e saída.' },
      { id: 'nav', category: 'Navegação', demo: 'nav', explore: 'switcher', title: 'Ctrl+K e modo foco', body: 'Barra de comandos para ir a qualquer canal, conversa, pessoa ou ação. Modo foco esconde os painéis, e as colunas mudam de largura arrastando a borda.' },
    ],
    fixes: [
      'A transmissão continua com a mesma qualidade, FPS e codificação da 0.8',
      'Se o microfone ou o fone desconectar no meio da call, o app avisa e usa o padrão até ele voltar',
      'No Windows 10 o app avisa que o som do PC pode levar as vozes da call e começa com o som desligado',
      'Pastas e prévia dos servidores ao passar o mouse; conversas fixadas e filtro de não lidas',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-11-05',
    title: 'Transmissão lisa',
    highlights: [
      { title: '120 FPS', body: 'Transmita em 720p, 1080p ou 1440p a 120 FPS (precisa de monitor de 120 Hz ou mais).' },
      { title: 'Sempre pela placa de vídeo', body: 'Todos os modos agora usam a placa de vídeo para codificar. A transmissão não cai mais para 15 FPS no caminho.' },
      { title: 'Você escolhe a qualidade', body: 'Quem assiste escolhe Auto, Máxima ou Leve, e a tela em destaque sempre pede a melhor versão.' },
      { title: 'Diagnóstico', body: 'Um botão na transmissão mede tudo por 2 segundos e gera um relatório para copiar e mandar.' },
      { title: 'Aviso de app desatualizado', body: 'Se alguém na call estiver numa versão antiga, você fica sabendo (era isso que deixava a transmissão em 15 FPS).' },
    ],
    fixes: [
      'Os interruptores da tela de transmitir, de Aparência e de Windows voltaram a funcionar',
      'A tela de transmitir mostra quantas pessoas o servidor aguenta em cada qualidade',
      'Quem transmite vê quando está perto do limite do servidor',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-11-04',
    title: 'O Aldetes no celular, do jeito certo',
    highlights: [
      { title: 'Barra inferior', body: 'Servidores, Mensagens, Notificações e Você sempre a um toque, com a aba ativa destacada.' },
      { title: 'Telas que deslizam', body: 'O chat entra por cima da lista. Volte pelo ←, pelo botão do Android ou arrastando da borda; a lista continua onde você parou.' },
      { title: 'Notificações', body: 'Menções, mensagens novas e pedidos de amizade num só lugar, e você aceita amigos dali mesmo.' },
      { title: 'Call sempre à mão', body: 'Navegue à vontade: uma barra mostra a call, deixa mutar e voltar com um toque.' },
      { title: 'Toque longo', body: 'Segure uma mensagem, um canal ou uma pessoa para ver as opções num painel que sobe de baixo.' },
    ],
    fixes: [
      'O aviso de instalação não cobre mais o botão de cadastro',
      'Configurações com telas próprias no celular (nada mais cortado)',
      'Seletor de emoji, menus e cartões de perfil dentro da tela',
      'Celular deitado usa o layout de celular; dicas de botão não ficam presas na tela',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-11-04',
    title: 'Mais rápido e com áudio!',
    highlights: [
      { title: 'Mensagens de áudio', body: 'Segure o microfone para gravar, deslize para cancelar ou para cima para travar. Ouça em 1x, 1,5x ou 2x.' },
      { title: 'Fotos que aparecem na hora', body: 'Um borrão aparece na hora e fica nítido em seguida. A foto original só é baixada quando você abre.' },
      { title: 'Botão de enviar', body: 'No celular, o microfone vira botão de enviar quando você digita, como no WhatsApp.' },
      { title: 'Janela flutuante', body: 'Saiu da call? A transmissão continua num mini player. Também dá para soltar o vídeo por cima de tudo.' },
      { title: 'App mais leve', body: 'Abre baixando 45% menos código. A parte de voz só carrega quando precisa.' },
    ],
    fixes: [
      'Chamar alguém para a call ou entrar na call de um amigo direto pelo perfil',
      'Escolha a qualidade que você recebe (Auto/Leve) e o enquadramento da transmissão',
      'Celular: sem faixa vazia acima do teclado, reações em painel e deslizar para trocar de tela',
      'Busca na lista de quem está na call e entrada animada ao conectar',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-11-04',
    title: 'O Aldetes evoluiu!',
    highlights: [
      { title: 'Call redesenhada', body: 'Um palco só: a transmissão no centro, quem está na call numa faixa ao lado e controles fixos embaixo.' },
      { title: 'Multitelas', body: 'Várias pessoas transmitindo ao mesmo tempo. Alterne entre Foco e Grade sem a transmissão reiniciar.' },
      { title: 'Reações ao vivo', body: 'Mande ❤️ 😂 👏 🔥 na call pelo botão de carinha ou por Alt+1…8. Todo mundo vê.' },
      { title: 'Avatares vivos', body: 'O contorno acompanha a sua voz de verdade, e mute e transmissão ficam claros de longe.' },
      { title: 'No celular', body: 'Layout próprio para o celular e instalação na tela inicial (Android e iPhone).' },
    ],
    fixes: [
      'Transmissão em 1080p a 60 FPS: camada única e codificação pela placa de vídeo nos jogos',
      'Atualização do app com aviso, progresso e reinício automático',
      'Atividade (jogos e música) agora só aparece com a sua permissão',
      'Sair da call pela Live Island pede confirmação',
    ],
  },
];

/** Numeric compare of "x.y.z" (ignores suffixes). */
export function cmpVersion(a: string, b: string) {
  const pa = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export const releaseFor = (v: string) => RELEASES.find((r) => cmpVersion(r.version, v) === 0) ?? null;
