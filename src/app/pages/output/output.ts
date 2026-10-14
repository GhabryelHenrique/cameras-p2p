import { Component, OnDestroy, OnInit, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { listDevices } from '../../core/media.util';
import { GuestMsg } from '../../core/models';
import { hiFiAudio, openPeer, peerErrorType } from '../../core/peer.util';
import { load, save } from '../../core/storage';
import { SrcObjectDirective } from '../../shared/src-object.directive';

/**
 * Janela de Saída: só o programa em tela cheia, sem UI, para o OBS capturar. Dois modos:
 * - `#/output`: aberta pelo botão do estúdio; o stream vem de window.opener (mesma origem, sem rede);
 * - `#/output/:hostId`: fonte Navegador do OBS, que roda em outro processo e não tem opener. Recebe o
 *   programa por PeerJS e reconecta sozinha quando o estúdio é recarregado ou fechado.
 */
@Component({
  selector: 'app-output',
  imports: [FormsModule, SrcObjectDirective],
  // Fechar/recarregar a fonte no OBS avisa o estúdio na hora, em vez de esperar o timeout do ICE.
  host: { class: 'output-host', '(window:beforeunload)': 'disconnect()' },
  template: `
    <video
      #video
      class="output-video"
      [appSrcObject]="stream()"
      autoplay
      playsinline
      (loadedmetadata)="play(video)"
    ></video>

    @if (!stream()) {
      <div class="output-msg">
        <h2>Janela de Saída</h2>
        <p>{{ message() }}</p>
      </div>
    } @else if (blocked()) {
      <div class="output-msg" (click)="play(video)">
        <h2>Clique para iniciar</h2>
        <p>O navegador bloqueou a reprodução automática com som. No OBS isso não acontece.</p>
      </div>
    }

    <div class="output-tools">
      <label>
        Áudio do programa →
        <select [ngModel]="sinkId()" (ngModelChange)="setSink(video, $event)">
          <option value="">Saída padrão</option>
          @for (d of outputs(); track d.deviceId) {
            <option [value]="d.deviceId">{{ d.label || 'Saída' }}</option>
          }
        </select>
      </label>
      <label>
        <input type="checkbox" [ngModel]="muted()" (ngModelChange)="muted.set($event); video.muted = $event" />
        Mudo
      </label>
      <button (click)="fullscreen()">Tela cheia</button>
    </div>
  `,
})
export class Output implements OnInit, OnDestroy {
  /** ID do estúdio (modo OBS). Sem ele, a janela depende do window.opener. */
  readonly hostId = input<string>();
  readonly stream = signal<MediaStream | null>(null);
  readonly message = signal('Procurando o estúdio…');
  readonly blocked = signal(false);
  readonly outputs = signal<MediaDeviceInfo[]>([]);
  readonly sinkId = signal(load('outputSink', ''));
  readonly muted = signal(false);
  private timer?: ReturnType<typeof setInterval>;

  private peer?: Peer;
  private conn?: DataConnection;
  private call?: MediaConnection;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  ngOnInit() {
    document.title = 'Saída — Estúdio P2P';
    if (this.hostId()) {
      void this.connect();
    } else {
      this.timer = setInterval(() => this.attach(), 500);
      this.attach();
    }
    listDevices()
      .then((d) => this.outputs.set(d.outputs))
      .catch(() => {});
  }

  ngOnDestroy() {
    this.disconnect();
  }

  disconnect() {
    this.destroyed = true;
    clearInterval(this.timer);
    clearTimeout(this.retryTimer);
    this.closeLink();
    this.peer?.destroy();
  }

  private attach() {
    const opener = window.opener as (Window & { __studioProgram?: MediaStream }) | null;
    let program: MediaStream | undefined;
    try {
      program = opener && !opener.closed ? opener.__studioProgram : undefined;
    } catch {
      program = undefined;
    }
    if (!program) {
      this.message.set(
        opener && !opener.closed
          ? 'Aguardando o estúdio iniciar…'
          : 'Abra esta janela pelo botão "Abrir janela de Saída" no estúdio. ' +
              'No OBS, use o "Link da Saída para o OBS" (aba Ajustes do estúdio).',
      );
    }
    this.show(program ?? null);
  }

  // ---------- Modo OBS (PeerJS) ----------

  /** Entra no estúdio como "saída" e espera o host ligar com o programa. */
  private async connect() {
    clearTimeout(this.retryTimer);
    const hostId = this.hostId();
    if (this.destroyed || !hostId) return;
    this.message.set('Conectando ao estúdio…');

    let peer = this.peer;
    if (!peer || peer.destroyed || peer.disconnected) {
      peer?.destroy();
      try {
        peer = await openPeer();
      } catch {
        return this.retry('Sem conexão com o serviço de sinalização (PeerJS). Tentando de novo…');
      }
      if (this.destroyed) return peer.destroy();
      this.peer = peer;
      this.listen(peer, hostId);
    }

    const conn = peer.connect(hostId, { reliable: true, serialization: 'json' });
    this.conn = conn;
    const lost = () => this.conn === conn && this.retry('A conexão com o estúdio caiu. Reconectando…');
    conn.on('open', () => conn.send({ t: 'output' } satisfies GuestMsg));
    conn.on('close', lost);
    conn.on('error', lost);
    // Rede bloqueando P2P (ou estúdio desatualizado): tenta de novo em vez de ficar parada.
    this.retryTimer = setTimeout(() => this.retry('O estúdio não respondeu. Tentando de novo…'), 20000);
  }

  private listen(peer: Peer, hostId: string) {
    peer.on('call', (call) => {
      if (this.peer !== peer || call.peer !== hostId) return call.close();
      const old = this.call;
      this.call = call;
      old?.close();
      call.answer(undefined, { sdpTransform: hiFiAudio });
      call.on('stream', (stream) => {
        if (this.call !== call) return;
        clearTimeout(this.retryTimer);
        this.show(stream);
      });
      call.on('close', () => this.call === call && this.retry('O estúdio parou de enviar o programa. Reconectando…'));
    });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      if (peerErrorType(err) === 'peer-unavailable') {
        this.retry('O estúdio não está aberto. Abra-o no navegador; esta Saída conecta sozinha.');
      } else if (peer.destroyed) {
        this.retry('Conexão com o serviço de sinalização perdida. Tentando de novo…');
      }
    });
    peer.on('disconnected', () => {
      // Só a sinalização caiu; o programa continua chegando por P2P.
      setTimeout(() => this.peer === peer && !peer.destroyed && peer.reconnect(), 2000);
    });
  }

  private retry(message: string) {
    this.closeLink();
    this.show(null);
    this.message.set(message);
    clearTimeout(this.retryTimer);
    if (!this.destroyed) this.retryTimer = setTimeout(() => this.connect(), 3000);
  }

  private closeLink() {
    // Limpa as referências antes de fechar: o evento 'close' do PeerJS pode disparar de forma síncrona.
    const { call, conn } = this;
    this.call = undefined;
    this.conn = undefined;
    call?.close();
    conn?.close();
  }

  // ---------- Vídeo ----------

  private show(stream: MediaStream | null) {
    if (this.stream() === stream) return;
    this.stream.set(stream);
    this.blocked.set(false);
    const video = document.querySelector<HTMLVideoElement>('.output-video');
    if (stream && video && this.sinkId()) this.setSink(video, this.sinkId());
  }

  /** Fora do OBS, o Chrome pode barrar autoplay com som: aí pedimos um clique. */
  play(video: HTMLVideoElement) {
    video
      .play()
      .then(() => this.blocked.set(false))
      .catch((err: DOMException) => err.name === 'NotAllowedError' && this.blocked.set(true));
  }

  async setSink(video: HTMLVideoElement, id: string) {
    this.sinkId.set(id);
    save('outputSink', id);
    const v = video as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> };
    await v.setSinkId?.(id).catch(() => {});
  }

  fullscreen() {
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }
}
