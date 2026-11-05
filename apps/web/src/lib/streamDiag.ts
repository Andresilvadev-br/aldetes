import { getParticipant, participantVersion, getRoom, useVoice, streamHasLayers } from './voice';
import { Track } from './lk';
import { getPrefs } from './prefs';
import { desktop } from './desktop';

/**
 * Stream diagnostics — real WebRTC stats, formatted as a short report people can copy and send.
 * Viewer: what really arrives (codec, resolution, FPS, drops, loss, path UDP/TCP/TURN, bitrate).
 * Streamer: what the encoder really sends (FPS from the capturer vs. sent, GPU/CPU, limit reason, outgoing bandwidth).
 */
type Stats = Map<string, Record<string, any>>;
const toMap = (r: RTCStatsReport): Stats => {
  const m: Stats = new Map();
  r.forEach((v: any) => m.set(v.id, v));
  return m;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mbps = (bytes: number, ms: number) => ((bytes * 8) / (ms * 1000)).toFixed(1).replace('.', ',');

function path(st: Stats) {
  let pair: any;
  for (const v of st.values()) if (v.type === 'transport' && v.selectedCandidatePairId) pair = st.get(v.selectedCandidatePairId);
  if (!pair) for (const v of st.values()) if (v.type === 'candidate-pair' && (v.nominated || v.selected) && v.state === 'succeeded') pair = v;
  if (!pair) return { text: 'desconhecido', pair: null as any };
  const local = st.get(pair.localCandidateId) ?? {};
  const kind = local.candidateType === 'relay' ? `TURN (${local.relayProtocol ?? '?'})` : (local.protocol ?? '?').toUpperCase();
  return { text: `${kind}${pair.currentRoundTripTime != null ? ` · ping ${Math.round(pair.currentRoundTripTime * 1000)} ms` : ''}`, pair };
}

const header = () => {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '?';
  return [`Aldetes ${desktop?.version ?? __APP_VERSION__} · ${desktop ? 'app desktop' : 'navegador'} · ${os}`, `Data: ${new Date().toLocaleString('pt-BR')}`];
};

export async function diagnoseViewer(identity: string): Promise<string> {
  const p = getParticipant(identity);
  const pub = p?.getTrackPublication(Track.Source.ScreenShare);
  const receiver = (pub?.track as { receiver?: RTCRtpReceiver } | undefined)?.receiver;
  const lines = [...header(), '', `ASSISTINDO a transmissão de ${p?.name ?? identity}`];
  lines.push(`App de quem transmite: ${participantVersion(identity) ?? 'versão antiga (anterior à 0.8, não informa)'}`);
  lines.push(`Versões disponíveis: ${streamHasLayers(identity) ? 'duas (com versão leve)' : 'uma (qualidade máxima)'} · minha escolha: ${useVoice.getState().viewQuality[identity] ?? 'auto'}`);
  if (!receiver) return [...lines, 'Sem vídeo recebido (parou de assistir ou a transmissão acabou).'].join('\n');
  const a = toMap(await receiver.getStats());
  await sleep(2000);
  const b = toMap(await receiver.getStats());
  const inb = (m: Stats) => [...m.values()].find((v) => v.type === 'inbound-rtp' && v.kind === 'video');
  const x = inb(a);
  const y = inb(b);
  if (!y) return [...lines, 'Ainda sem estatísticas de vídeo.'].join('\n');
  const dt = (y.timestamp - (x?.timestamp ?? y.timestamp - 2000)) || 2000;
  const codec = b.get(y.codecId)?.mimeType?.replace('video/', '') ?? '?';
  const fps = x ? Math.round(((y.framesDecoded - x.framesDecoded) * 1000) / dt) : Math.round(y.framesPerSecond ?? 0);
  const lost = x ? y.packetsLost - x.packetsLost : y.packetsLost;
  const recv = x ? y.packetsReceived - x.packetsReceived : y.packetsReceived;
  lines.push(
    `Chegando: ${y.frameWidth}×${y.frameHeight} · ${fps} FPS · ${codec} · ${x ? mbps(y.bytesReceived - x.bytesReceived, dt) : '?'} Mbps`,
    `Quadros descartados: ${y.framesDropped ?? 0} (total) · pacotes perdidos agora: ${lost ?? 0} de ${(recv ?? 0) + (lost ?? 0)} · jitter ${Math.round((y.jitter ?? 0) * 1000)} ms`,
    `Decodificação: ${y.decoderImplementation ?? '?'}${y.powerEfficientDecoder != null ? (y.powerEfficientDecoder ? ' (placa de vídeo)' : ' (processador)') : ''}`,
    `Caminho: ${path(b).text}`,
  );
  return lines.join('\n');
}

export async function diagnoseOwn(): Promise<string> {
  const room = getRoom();
  const pub = room?.localParticipant.getTrackPublication(Track.Source.ScreenShare);
  const sender = (pub?.track as { sender?: RTCRtpSender } | undefined)?.sender;
  const lines = [...header(), '', `TRANSMITINDO · escolhido: ${getPrefs().streamQuality}${getPrefs().streamLite ? ' + versão leve' : ''}`];
  if (!sender) return [...lines, 'Nenhuma transmissão ativa.'].join('\n');
  const a = toMap(await sender.getStats());
  await sleep(2000);
  const b = toMap(await sender.getStats());
  const outs = (m: Stats) => [...m.values()].filter((v) => v.type === 'outbound-rtp' && v.kind === 'video');
  const src = [...b.values()].find((v) => v.type === 'media-source' && v.kind === 'video');
  for (const y of outs(b)) {
    const x = outs(a).find((v) => v.id === y.id);
    const dt = (x ? y.timestamp - x.timestamp : 2000) || 2000;
    lines.push(
      `Enviando${y.rid ? ` (camada ${y.rid})` : ''}: ${y.frameWidth ?? '?'}×${y.frameHeight ?? '?'} · ${Math.round(y.framesPerSecond ?? 0)} FPS · ${b.get(y.codecId)?.mimeType?.replace('video/', '') ?? '?'} · ${x ? mbps(y.bytesSent - x.bytesSent, dt) : '?'} Mbps`,
      `Codificador: ${y.encoderImplementation ?? '?'}${y.powerEfficientEncoder != null ? (y.powerEfficientEncoder ? ' (placa de vídeo)' : ' (processador)') : ''} · limite: ${{ none: 'nenhum', cpu: 'PROCESSADOR', bandwidth: 'INTERNET', other: 'outro' }[y.qualityLimitationReason as string] ?? y.qualityLimitationReason ?? '?'}`,
    );
  }
  lines.push(`Captura da tela: ${Math.round(src?.framesPerSecond ?? 0)} FPS${src?.width ? ` · ${src.width}×${src.height}` : ''}`);
  const pth = path(b);
  lines.push(`Caminho: ${pth.text}${pth.pair?.availableOutgoingBitrate ? ` · banda de envio estimada ${(pth.pair.availableOutgoingBitrate / 1e6).toFixed(1).replace('.', ',')} Mbps` : ''}`);
  const viewers = room ? room.remoteParticipants.size : 0;
  lines.push(`Pessoas na call (podem estar assistindo): ${viewers}`);
  return lines.join('\n');
}
