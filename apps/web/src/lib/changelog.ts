/**
 * Versioned release notes — the ONLY source of the "O Aldetes evoluiu!" panel.
 * Each entry describes what really shipped in that version (written by hand, never generated).
 * A version without an entry shows nothing: the app opens normally.
 */
export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  highlights: Array<{ title: string; body: string }>;
  fixes?: string[];
}

export const RELEASES: Release[] = [
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
