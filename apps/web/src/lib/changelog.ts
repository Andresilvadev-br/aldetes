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
