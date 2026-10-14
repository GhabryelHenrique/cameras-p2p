import { Injectable } from '@angular/core';
import { Source } from './models';

interface Input {
  stream: MediaStream;
  node: MediaStreamAudioSourceNode;
  /** Ganho no programa (0 quando fora da live ou mutado pelo host). */
  program: GainNode;
  /** Retorno para os fones do host (só convidados). */
  monitor: GainNode;
}

/**
 * Mixer de áudio do host (WebAudio):
 * - "programa": tudo que está ao vivo → janela de Saída/OBS;
 * - "mix-minus" por convidado: o programa sem a própria voz dele (evita eco);
 * - "retorno": convidados nos fones do host, inclusive quem está nos bastidores.
 */
@Injectable({ providedIn: 'root' })
export class AudioMixerService {
  readonly ctx = new AudioContext({ latencyHint: 'interactive' });
  readonly program = this.ctx.createMediaStreamDestination();
  /** Limitador no master: várias vozes somadas não estouram (clipping) na live. */
  private readonly bus = new DynamicsCompressorNode(this.ctx, {
    threshold: -6,
    knee: 6,
    ratio: 12,
    attack: 0.003,
    release: 0.25,
  });
  private readonly inputs = new Map<string, Input>();
  private readonly minus = new Map<string, MediaStreamAudioDestinationNode>();
  private monitorOn = true;

  constructor() {
    this.bus.connect(this.program);
  }

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMonitor(on: boolean, sources: Source[]) {
    this.monitorOn = on;
    this.sync(sources);
  }

  async setMonitorDevice(deviceId: string) {
    const ctx = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    await ctx.setSinkId?.(deviceId);
  }

  /** Stream de áudio que volta para um convidado: programa sem ele mesmo. */
  minusFor(guestId: string): MediaStream {
    let dest = this.minus.get(guestId);
    if (!dest) {
      dest = this.ctx.createMediaStreamDestination();
      this.minus.set(guestId, dest);
      for (const [id, input] of this.inputs) if (id !== guestId) input.program.connect(dest);
    }
    return dest.stream;
  }

  removeMinus(guestId: string) {
    const dest = this.minus.get(guestId);
    if (!dest) return;
    for (const input of this.inputs.values()) {
      try {
        input.program.disconnect(dest);
      } catch {
        /* não estava conectado */
      }
    }
    this.minus.delete(guestId);
  }

  /** Reconcilia os nós de áudio com a lista atual de fontes. */
  sync(sources: Source[]) {
    const seen = new Set<string>();
    for (const s of sources) {
      if (!s.stream || s.stream.getAudioTracks().length === 0) continue;
      seen.add(s.id);
      let input = this.inputs.get(s.id);
      if (input && input.stream !== s.stream) {
        this.dropInput(s.id);
        input = undefined;
      }
      if (!input) input = this.addInput(s.id, s.stream);

      const onAir = s.status === 'live' && !s.muteAudio;
      const monitor = s.kind === 'guest' && this.monitorOn;
      const now = this.ctx.currentTime;
      input.program.gain.setTargetAtTime(onAir ? 1 : 0, now, 0.03);
      input.monitor.gain.setTargetAtTime(monitor ? 1 : 0, now, 0.03);
    }
    for (const id of [...this.inputs.keys()]) if (!seen.has(id)) this.dropInput(id);
  }

  private addInput(id: string, stream: MediaStream): Input {
    const node = this.ctx.createMediaStreamSource(stream);
    const program = this.ctx.createGain();
    const monitor = this.ctx.createGain();
    program.gain.value = 0;
    monitor.gain.value = 0;
    node.connect(program).connect(this.bus);
    node.connect(monitor).connect(this.ctx.destination);
    for (const [guestId, dest] of this.minus) if (guestId !== id) program.connect(dest);
    const input = { stream, node, program, monitor };
    this.inputs.set(id, input);
    return input;
  }

  private dropInput(id: string) {
    const input = this.inputs.get(id);
    if (!input) return;
    input.node.disconnect();
    input.program.disconnect();
    input.monitor.disconnect();
    this.inputs.delete(id);
  }
}
