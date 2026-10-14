import { Injectable, signal } from '@angular/core';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { getCamera, listDevices, mediaErrorMessage, stopStream } from './media.util';
import { ChatMsg, GuestMsg, HostMsg } from './models';
import { openPeer, peerErrorType } from './peer.util';
import { load, save } from './storage';

export type GuestPhase = 'setup' | 'connecting' | 'backstage' | 'live' | 'ended' | 'error';

/** Lado do convidado: câmera local, conexão P2P com o estúdio, chat e comandos do host. */
@Injectable({ providedIn: 'root' })
export class GuestService {
  readonly phase = signal<GuestPhase>('setup');
  readonly message = signal('');
  readonly notice = signal('');
  readonly name = signal(load('guestName', ''));
  readonly hostName = signal('');
  readonly local = signal<MediaStream | null>(null);
  readonly program = signal<MediaStream | null>(null);
  readonly chat = signal<ChatMsg[]>([]);
  readonly camOn = signal(true);
  readonly micOn = signal(true);
  readonly cams = signal<MediaDeviceInfo[]>([]);
  readonly mics = signal<MediaDeviceInfo[]>([]);
  readonly camId = signal(load('guestCam', ''));
  readonly micId = signal(load('guestMic', ''));
  readonly mediaError = signal('');

  private peer?: Peer;
  private conn?: DataConnection;
  private call?: MediaConnection;
  private hostId = '';

  /** Abre (ou troca) câmera/microfone. Durante a chamada, troca as trilhas sem renegociar. */
  async openMedia() {
    this.mediaError.set('');
    try {
      let stream: MediaStream;
      try {
        stream = await getCamera(this.camId() || undefined, this.micId() || undefined);
      } catch (err) {
        if ((err as DOMException).name !== 'OverconstrainedError') throw err;
        stream = await getCamera();
      }
      const old = this.local();
      stream.getVideoTracks().forEach((t) => (t.enabled = this.camOn()));
      stream.getAudioTracks().forEach((t) => (t.enabled = this.micOn()));
      for (const sender of this.call?.peerConnection?.getSenders() ?? []) {
        const track = stream.getTracks().find((t) => t.kind === sender.track?.kind);
        if (track) await sender.replaceTrack(track);
      }
      this.local.set(stream);
      if (old !== stream) stopStream(old);
      const devices = await listDevices();
      this.cams.set(devices.cams);
      this.mics.set(devices.mics);
      this.camId.set(stream.getVideoTracks()[0]?.getSettings().deviceId ?? '');
      this.micId.set(stream.getAudioTracks()[0]?.getSettings().deviceId ?? '');
      save('guestCam', this.camId());
      save('guestMic', this.micId());
    } catch (err) {
      this.mediaError.set(mediaErrorMessage(err));
    }
  }

  async join(hostId: string) {
    if (!this.local()) await this.openMedia();
    if (!this.local()) return;
    const name = this.name().trim() || 'Convidado';
    save('guestName', name);
    this.hostId = hostId;
    this.phase.set('connecting');
    this.message.set('Conectando ao estúdio…');

    try {
      this.peer = await openPeer();
    } catch {
      return this.fail('Não foi possível conectar ao serviço de sinalização. Verifique sua internet.');
    }
    const peer = this.peer;
    peer.on('error', (err) => {
      if (this.peer === peer && peerErrorType(err) === 'peer-unavailable') {
        this.fail('Estúdio não encontrado. Confira o link e se o host está com o estúdio aberto.');
      }
    });

    const conn = peer.connect(hostId, { reliable: true, serialization: 'json' });
    this.conn = conn;
    conn.on('open', () => {
      conn.send({ t: 'hello', name } satisfies GuestMsg);
      conn.peerConnection?.addEventListener('connectionstatechange', () => {
        const state = conn.peerConnection?.connectionState;
        if (state === 'failed' && this.conn === conn) this.end('A conexão com o estúdio caiu.');
      });
    });
    conn.on('data', (data) => this.onMsg(data as HostMsg));
    conn.on('close', () => this.conn === conn && this.end('A conexão com o estúdio foi encerrada.'));

    setTimeout(() => {
      if (this.phase() === 'connecting') {
        this.fail('Tempo esgotado. A rede pode estar bloqueando P2P; peça ao host para configurar um TURN.');
      }
    }, 20000);
  }

  private onMsg(msg: HostMsg) {
    switch (msg.t) {
      case 'welcome':
        this.hostName.set(msg.hostName);
        this.startCall();
        break;
      case 'status':
        if (this.phase() === 'connecting' || this.phase() === 'backstage' || this.phase() === 'live') {
          this.phase.set(msg.status);
          this.flash(msg.status === 'live' ? 'Você está AO VIVO!' : 'Você está nos bastidores');
        }
        break;
      case 'mute':
        if (msg.kind === 'audio') this.setMic(false);
        else this.setCam(false);
        this.flash('O host pediu para você mutar.');
        break;
      case 'kick':
        this.end('Você foi removido do estúdio pelo host.');
        break;
      case 'chat':
        this.chat.update((list) => [...list, msg.msg].slice(-200));
        break;
      case 'chat-history':
        this.chat.set(msg.msgs);
        break;
    }
  }

  private startCall() {
    const local = this.local();
    if (!this.peer || !local) return;
    this.call = this.peer.call(this.hostId, local);
    this.call.on('stream', (stream) => this.program.set(stream));
  }

  setCam(on: boolean) {
    this.camOn.set(on);
    this.local()?.getVideoTracks().forEach((t) => (t.enabled = on));
    this.sendState();
  }

  setMic(on: boolean) {
    this.micOn.set(on);
    this.local()?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.sendState();
  }

  sendChat(text: string) {
    if (text.trim() && this.conn?.open) this.conn.send({ t: 'chat', text } satisfies GuestMsg);
  }

  leave() {
    this.end('Você saiu do estúdio.');
  }

  private sendState() {
    if (this.conn?.open) {
      this.conn.send({ t: 'state', camOn: this.camOn(), micOn: this.micOn() } satisfies GuestMsg);
    }
  }

  private fail(message: string) {
    this.cleanup();
    this.phase.set('error');
    this.message.set(message);
  }

  private end(message: string) {
    if (this.phase() === 'ended' || this.phase() === 'error') return;
    this.cleanup();
    this.phase.set('ended');
    this.message.set(message);
  }

  private cleanup() {
    // Limpa as referências antes de fechar: o evento 'close' pode disparar de forma síncrona.
    const { call, conn, peer } = this;
    this.call = undefined;
    this.conn = undefined;
    this.peer = undefined;
    call?.close();
    conn?.close();
    peer?.destroy();
    this.program.set(null);
  }

  /** Volta para a tela de configuração (mantém a câmera aberta). */
  reset() {
    this.cleanup();
    this.chat.set([]);
    this.phase.set('setup');
    this.message.set('');
  }

  private flash(text: string) {
    this.notice.set(text);
    setTimeout(() => this.notice() === text && this.notice.set(''), 3500);
  }
}
