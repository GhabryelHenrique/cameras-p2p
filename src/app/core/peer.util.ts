import Peer from 'peerjs';
import { load } from './storage';

export interface TurnConfig {
  urls: string;
  username: string;
  credential: string;
}

export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  const turn = load<TurnConfig | null>('turn', null);
  if (turn?.urls.trim()) {
    servers.push({
      urls: turn.urls.split(',').map((u) => u.trim()).filter(Boolean),
      username: turn.username,
      credential: turn.credential,
    });
  }
  return servers;
}

/** Conecta ao broker público do PeerJS (só sinalização) e resolve quando o ID estiver registrado. */
export function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const options = { config: { iceServers: iceServers() }, debug: 1 };
    const peer = id ? new Peer(id, options) : new Peer(options);
    const onOpen = () => {
      peer.off('error', onError);
      resolve(peer);
    };
    const onError = (err: unknown) => {
      peer.off('open', onOpen);
      peer.destroy();
      reject(err);
    };
    peer.once('open', onOpen);
    peer.once('error', onError);
  });
}

export function peerErrorType(err: unknown): string {
  return (err as { type?: string })?.type ?? 'unknown';
}

/**
 * sdpTransform para quem RECEBE o programa: pede Opus estéreo com bitrate alto. O padrão do WebRTC
 * (~32 kbps mono) é pensado para voz e soa abafado na live.
 */
export function hiFiAudio(sdp: string): string {
  const pt = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1];
  if (!pt) return sdp;
  return sdp.replace(new RegExp(`a=fmtp:${pt} (.*)`), (_, params: string) => {
    const keep = params
      .split(';')
      .filter((p) => p.trim() && !/^\s*(stereo|sprop-stereo|maxaveragebitrate)=/.test(p));
    return `a=fmtp:${pt} ${[...keep, 'stereo=1', 'sprop-stereo=1', 'maxaveragebitrate=256000'].join(';')}`;
  });
}

/**
 * Limita o bitrate de vídeo enviado (o "programa" que volta para cada convidado ou para a Saída).
 * `degradation` diz o que sacrificar quando falta banda/CPU; a Saída usa 'maintain-resolution'.
 */
export async function limitVideoBitrate(
  pc: RTCPeerConnection | undefined,
  maxBitrate: number,
  scaleDown = 1,
  degradation?: RTCDegradationPreference,
) {
  if (!pc) return;
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'video') continue;
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = maxBitrate;
    params.encodings[0].scaleResolutionDownBy = scaleDown;
    if (degradation) params.degradationPreference = degradation;
    try {
      await sender.setParameters(params);
    } catch {
      /* alguns navegadores não permitem antes da negociação terminar */
    }
  }
}
