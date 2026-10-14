import { Injectable, computed, effect, inject, signal } from '@angular/core';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { AudioMixerService } from './audio-mixer.service';
import { CompositorService } from './compositor.service';
import { getCamera, stopStream, uid } from './media.util';
import {
  Banner,
  Branding,
  ChatMsg,
  DEFAULT_BRANDING,
  GuestMsg,
  HostMsg,
  LayoutKind,
  Source,
  SourceStatus,
} from './models';
import { limitVideoBitrate, openPeer, peerErrorType } from './peer.util';
import { load, save } from './storage';

type Online = 'off' | 'connecting' | 'on' | 'error';

interface Link {
  conn: DataConnection;
  call?: MediaConnection;
}

const MAX_CHAT = 200;

/** Estado e lógica do host: aceita convidados via PeerJS e decide quem está ao vivo. */
@Injectable({ providedIn: 'root' })
export class StudioService {
  private readonly comp = inject(CompositorService);
  private readonly mixer = inject(AudioMixerService);

  readonly peerId = signal('');
  readonly online = signal<Online>('off');
  readonly error = signal('');
  readonly notice = signal('');
  readonly hostName = signal(load('hostName', 'Host'));
  readonly sources = signal<Source[]>([]);
  readonly layout = signal<LayoutKind>(load('layout', 'grid'));
  readonly spotlightId = signal<string | null>(null);
  readonly banners = signal<Banner[]>(load('banners', []));
  readonly activeBannerId = signal<string | null>(null);
  readonly branding = signal<Branding>({ ...DEFAULT_BRANDING, ...load('branding', {}) });
  readonly chat = signal<ChatMsg[]>([]);
  readonly monitorOn = signal(load('monitorOn', true));
  /** Janelas de Saída conectadas por PeerJS (fonte Navegador do OBS). */
  readonly outputCount = signal(0);

  readonly live = computed(() =>
    this.sources()
      .filter((s) => s.status === 'live')
      .sort((a, b) => a.liveSince - b.liveSince),
  );
  readonly backstage = computed(() => this.sources().filter((s) => s.status === 'backstage'));
  readonly guestCount = computed(() => this.sources().filter((s) => s.kind === 'guest').length);
  readonly inviteUrl = computed(() =>
    this.peerId() ? `${location.origin}${location.pathname}#/join/${this.peerId()}` : '',
  );
  /** URL para a fonte Navegador do OBS: a Saída conecta ao estúdio pelo ID, sem depender de window.opener. */
  readonly outputUrl = computed(() =>
    this.peerId() ? `${location.origin}${location.pathname}#/output/${this.peerId()}` : '',
  );

  /** Vídeo do canvas + áudio do programa: é o que a janela de Saída exibe. */
  readonly programStream: MediaStream;

  private peer?: Peer;
  private readonly links = new Map<string, Link>();
  private readonly outputs = new Map<string, Link>();
  private started = false;
  private retries = 0;

  constructor() {
    this.programStream = new MediaStream([
      ...this.comp.stream.getVideoTracks(),
      ...this.mixer.program.stream.getAudioTracks(),
    ]);
    (window as unknown as { __studioProgram: MediaStream }).__studioProgram = this.programStream;

    this.comp.setScene(() => ({
      live: this.live(),
      layout: this.layout(),
      spotlightId: this.spotlightId(),
      branding: this.branding(),
      banner: this.banners().find((b) => b.id === this.activeBannerId())?.text ?? null,
    }));

    effect(() => {
      const sources = this.sources();
      this.comp.syncVideos(sources);
      this.mixer.setMonitor(this.monitorOn(), sources);
    });
    effect(() => save('layout', this.layout()));
    effect(() => save('banners', this.banners()));
    effect(() => save('hostName', this.hostName()));
    effect(() => save('monitorOn', this.monitorOn()));
    effect(() => {
      if (!save('branding', this.branding())) {
        this.flash('Imagens grandes demais para salvar no navegador; elas valem só nesta sessão.');
      }
    });
    window.addEventListener('beforeunload', () => this.peer?.destroy());
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.comp.start();
    let id = load<string | null>('hostId', null);
    if (!id) {
      id = 'cp2p-' + uid(10);
      save('hostId', id);
    }
    void this.connectBroker(id);
  }

  /** Gera outro ID de estúdio (o link de convite antigo deixa de valer). */
  newStudioId() {
    const id = 'cp2p-' + uid(10);
    save('hostId', id);
    this.peer?.destroy();
    this.retries = 0;
    void this.connectBroker(id);
  }

  private async connectBroker(id: string) {
    this.online.set('connecting');
    this.error.set('');
    try {
      const peer = await openPeer(id);
      this.peer = peer;
      this.retries = 0;
      this.peerId.set(peer.id);
      this.online.set('on');
      peer.on('connection', (c) => this.onConnection(c));
      peer.on('call', (c) => this.onCall(c));
      peer.on('open', () => this.online.set('on'));
      peer.on('disconnected', () => {
        // Só a sinalização caiu; as conexões P2P existentes continuam.
        this.online.set('connecting');
        setTimeout(() => !peer.destroyed && peer.reconnect(), 2000);
      });
      peer.on('error', (err) => {
        const type = peerErrorType(err);
        if (type === 'peer-unavailable') return;
        console.warn('[studio] peer error', type, err);
        if (peer.destroyed) {
          this.online.set('error');
          this.error.set('Conexão com o serviço de sinalização perdida. Recarregue a página.');
        }
      });
    } catch (err) {
      const type = peerErrorType(err);
      // Após recarregar a página o broker pode demorar alguns segundos para liberar o ID.
      if (type === 'unavailable-id' && this.retries < 6) {
        this.retries++;
        this.online.set('connecting');
        this.error.set('Liberando o ID do estúdio… (outra aba aberta?)');
        setTimeout(() => this.connectBroker(id), 3000);
        return;
      }
      this.online.set('error');
      this.error.set(
        type === 'unavailable-id'
          ? 'Este estúdio já está aberto em outra aba ou janela. Feche-a ou gere um novo ID.'
          : 'Não foi possível conectar ao serviço de sinalização (PeerJS). Verifique sua internet.',
      );
    }
  }

  // ---------- Convidados ----------

  private onConnection(conn: DataConnection) {
    conn.on('data', (data) => this.onGuestMsg(conn, data as GuestMsg));
    const drop = () => {
      this.dropGuest(conn.peer, conn);
      this.dropOutput(conn.peer, conn);
    };
    conn.on('close', drop);
    conn.on('error', drop);
    conn.on('open', () => {
      conn.peerConnection?.addEventListener('connectionstatechange', () => {
        const state = conn.peerConnection?.connectionState;
        if (state === 'failed' || state === 'closed') drop();
      });
    });
  }

  private onGuestMsg(conn: DataConnection, msg: GuestMsg) {
    const id = conn.peer;
    switch (msg.t) {
      case 'hello': {
        const old = this.links.get(id);
        if (old && old.conn !== conn) this.dropGuest(id, old.conn);
        this.links.set(id, { conn });
        const name = (msg.name || 'Convidado').slice(0, 40);
        this.sources.update((list) => [
          ...list.filter((s) => s.id !== id),
          {
            id,
            kind: 'guest',
            name,
            stream: null,
            status: 'backstage',
            liveSince: 0,
            camOn: true,
            micOn: true,
            muteAudio: false,
            muteVideo: false,
          },
        ]);
        this.mixer.minusFor(id);
        this.send(id, { t: 'welcome', hostName: this.hostName() });
        this.send(id, { t: 'status', status: 'backstage' });
        this.send(id, { t: 'chat-history', msgs: this.chat().slice(-50) });
        this.flash(`${name} entrou nos bastidores`);
        break;
      }
      case 'chat': {
        const guest = this.sources().find((s) => s.id === id);
        if (!guest || !msg.text?.trim()) return;
        this.pushChat({ id: uid(), from: guest.name, text: msg.text.slice(0, 500), ts: Date.now() });
        break;
      }
      case 'state':
        this.patch(id, { camOn: !!msg.camOn, micOn: !!msg.micOn });
        break;
      case 'output':
        this.addOutput(conn);
        break;
    }
  }

  private onCall(call: MediaConnection) {
    const id = call.peer;
    const link = this.links.get(id);
    if (!link) {
      call.close();
      return;
    }
    link.call?.close();
    link.call = call;
    // Retorno para o convidado: vídeo do programa + áudio sem a própria voz.
    const back = new MediaStream([
      ...this.comp.stream.getVideoTracks(),
      ...this.mixer.minusFor(id).getAudioTracks(),
    ]);
    call.answer(back);
    call.on('stream', (stream) => {
      this.patch(id, { stream });
      void limitVideoBitrate(call.peerConnection, 1_200_000, 1.5);
    });
    call.on('close', () => {
      if (this.links.get(id)?.call === call) this.patch(id, { stream: null });
    });
  }

  private dropGuest(id: string, conn: DataConnection) {
    const link = this.links.get(id);
    if (!link || link.conn !== conn) return;
    this.links.delete(id);
    link.call?.close();
    conn.close();
    const name = this.sources().find((s) => s.id === id)?.name;
    this.sources.update((list) => list.filter((s) => s.id !== id));
    this.mixer.removeMinus(id);
    if (this.spotlightId() === id) this.spotlightId.set(null);
    if (name) this.flash(`${name} saiu`);
  }

  // ---------- Saída (OBS) ----------

  /** O host liga para a Saída com o programa completo; ela atende sem enviar mídia. */
  private addOutput(conn: DataConnection) {
    const id = conn.peer;
    if (!this.peer || this.links.has(id)) return;
    const old = this.outputs.get(id);
    if (old?.conn === conn) return;
    if (old) this.dropOutput(id, old.conn);
    const call = this.peer.call(id, this.programStream);
    this.outputs.set(id, { conn, call });
    this.outputCount.set(this.outputs.size);
    // Normalmente é a mesma máquina: dá para mandar em alta qualidade, o OBS recomprime depois.
    call.peerConnection?.addEventListener('connectionstatechange', () => {
      if (call.peerConnection?.connectionState === 'connected') {
        void limitVideoBitrate(call.peerConnection, 8_000_000, 1, 'maintain-resolution');
      }
    });
    this.flash('Saída do OBS conectada');
  }

  private dropOutput(id: string, conn: DataConnection) {
    const link = this.outputs.get(id);
    if (!link || link.conn !== conn) return;
    this.outputs.delete(id);
    this.outputCount.set(this.outputs.size);
    link.call?.close();
    conn.close();
    this.flash('Saída do OBS desconectada');
  }

  private send(id: string, msg: HostMsg) {
    const conn = this.links.get(id)?.conn;
    if (conn?.open) conn.send(msg);
  }

  private broadcast(msg: HostMsg) {
    for (const id of this.links.keys()) this.send(id, msg);
  }

  // ---------- Ações do host ----------

  setStatus(id: string, status: SourceStatus) {
    this.patch(id, { status, liveSince: status === 'live' ? Date.now() : 0 });
    this.send(id, { t: 'status', status });
    if (status === 'backstage' && this.spotlightId() === id) this.spotlightId.set(null);
  }

  toggleProgramAudio(id: string) {
    const s = this.find(id);
    if (s) this.patch(id, { muteAudio: !s.muteAudio });
  }

  toggleProgramVideo(id: string) {
    const s = this.find(id);
    if (s) this.patch(id, { muteVideo: !s.muteVideo });
  }

  askMute(id: string) {
    this.send(id, { t: 'mute', kind: 'audio' });
  }

  toggleSpotlight(id: string) {
    this.spotlightId.update((cur) => (cur === id ? null : id));
  }

  rename(id: string, name: string) {
    if (name.trim()) this.patch(id, { name: name.trim().slice(0, 40) });
  }

  kick(id: string) {
    const link = this.links.get(id);
    if (!link) return;
    this.send(id, { t: 'kick' });
    setTimeout(() => this.dropGuest(id, link.conn), 300);
  }

  allToBackstage() {
    for (const s of this.live()) this.setStatus(s.id, 'backstage');
  }

  async addCamera(camId?: string, micId?: string) {
    const stream = await getCamera(camId, micId);
    const existing = this.find('host-cam');
    if (existing) {
      stopStream(existing.stream);
      this.patch('host-cam', { stream, name: this.hostName() });
      return;
    }
    this.sources.update((list) => [
      ...list,
      {
        id: 'host-cam',
        kind: 'camera',
        name: this.hostName(),
        stream,
        status: 'backstage',
        liveSince: 0,
        camOn: true,
        micOn: true,
        muteAudio: false,
        muteVideo: false,
      },
    ]);
  }

  async addScreen() {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true,
    });
    const id = 'screen-' + uid(4);
    stream.getVideoTracks()[0]?.addEventListener('ended', () => this.removeLocal(id));
    this.sources.update((list) => [
      ...list,
      {
        id,
        kind: 'screen',
        name: `Tela de ${this.hostName()}`,
        stream,
        status: 'live',
        liveSince: Date.now(),
        camOn: true,
        micOn: stream.getAudioTracks().length > 0,
        muteAudio: false,
        muteVideo: false,
      },
    ]);
  }

  removeLocal(id: string) {
    const s = this.find(id);
    if (!s || s.kind === 'guest') return;
    stopStream(s.stream);
    this.sources.update((list) => list.filter((x) => x.id !== id));
    if (this.spotlightId() === id) this.spotlightId.set(null);
  }

  sendChat(text: string) {
    if (!text.trim()) return;
    this.pushChat({ id: uid(), from: this.hostName(), text: text.slice(0, 500), ts: Date.now(), host: true });
  }

  private pushChat(msg: ChatMsg) {
    this.chat.update((list) => [...list, msg].slice(-MAX_CHAT));
    this.broadcast({ t: 'chat', msg });
  }

  addBanner(text: string) {
    if (!text.trim()) return null;
    const banner = { id: uid(), text: text.trim().slice(0, 140) };
    this.banners.update((list) => [...list, banner]);
    return banner;
  }

  removeBanner(id: string) {
    this.banners.update((list) => list.filter((b) => b.id !== id));
    if (this.activeBannerId() === id) this.activeBannerId.set(null);
  }

  toggleBanner(id: string) {
    this.activeBannerId.update((cur) => (cur === id ? null : id));
  }

  /** Como no StreamYard: mostra uma mensagem do chat como banner na tela. */
  featureChat(msg: ChatMsg) {
    const banner = this.addBanner(`${msg.from}: ${msg.text}`);
    if (banner) this.activeBannerId.set(banner.id);
  }

  updateBranding(patch: Partial<Branding>) {
    this.branding.update((b) => ({ ...b, ...patch }));
  }

  openOutput() {
    window.open(
      `${location.pathname}#/output`,
      'cp2p-output',
      'popup=yes,width=1280,height=720,menubar=no,toolbar=no,location=no,status=no',
    );
  }

  resumeAudio() {
    this.mixer.resume();
  }

  private find(id: string) {
    return this.sources().find((s) => s.id === id);
  }

  private patch(id: string, patch: Partial<Source>) {
    this.sources.update((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  private flash(text: string) {
    this.notice.set(text);
    setTimeout(() => this.notice() === text && this.notice.set(''), 4000);
  }
}
