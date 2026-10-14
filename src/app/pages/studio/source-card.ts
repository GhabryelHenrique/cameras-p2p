import { Component, inject, input, signal } from '@angular/core';
import { Source } from '../../core/models';
import { StudioService } from '../../core/studio.service';
import { SrcObjectDirective } from '../../shared/src-object.directive';

@Component({
  selector: 'app-source-card',
  imports: [SrcObjectDirective],
  template: `
    @let s = source();
    <div class="src-card" [class.live]="s.status === 'live'" [class.spot]="studio.spotlightId() === s.id">
      <div class="src-video">
        <video [appSrcObject]="s.stream" muted autoplay playsinline [class.mirror]="s.kind === 'camera'"></video>
        @if (!s.stream) {
          <div class="src-overlay">Conectando vídeo…</div>
        } @else if (!s.camOn || s.muteVideo) {
          <div class="src-overlay">{{ s.muteVideo ? 'Vídeo oculto no programa' : 'Câmera desligada' }}</div>
        }
        <div class="src-badges">
          @if (s.status === 'live') {
            <span class="badge live">AO VIVO</span>
          }
          @if (s.kind !== 'guest') {
            <span class="badge">{{ s.kind === 'screen' ? 'Tela' : 'Você' }}</span>
          }
          @if (!s.micOn) {
            <span class="badge warn" title="O próprio convidado mutou o microfone">mic desligado</span>
          }
        </div>
      </div>

      <div class="src-name" title="Clique duas vezes para renomear" (dblclick)="rename()">{{ s.name }}</div>

      <div class="src-actions">
        @if (s.status === 'live') {
          <button class="btn sm" (click)="studio.setStatus(s.id, 'backstage')">Remover da live</button>
        } @else {
          <button class="btn sm primary" (click)="studio.setStatus(s.id, 'live')">Adicionar à live</button>
        }
        <button
          class="icon-btn"
          [class.off]="s.muteAudio"
          (click)="studio.toggleProgramAudio(s.id)"
          [title]="s.muteAudio ? 'Liberar áudio no programa' : 'Mutar no programa'"
        >
          <span class="icon">{{ s.muteAudio ? 'mic_off' : 'mic' }}</span>
        </button>
        <button
          class="icon-btn"
          [class.off]="s.muteVideo"
          (click)="studio.toggleProgramVideo(s.id)"
          [title]="s.muteVideo ? 'Mostrar vídeo no programa' : 'Ocultar vídeo no programa'"
        >
          <span class="icon">{{ s.muteVideo ? 'videocam_off' : 'videocam' }}</span>
        </button>
        @if (s.status === 'live') {
          <button
            class="icon-btn"
            [class.on]="studio.spotlightId() === s.id"
            (click)="studio.toggleSpotlight(s.id)"
            title="Destacar (fica em primeiro no layout)"
          >
            <span class="icon" [class.fill]="studio.spotlightId() === s.id">star</span>
          </button>
        }
        <span class="spacer"></span>
        @if (s.kind === 'guest') {
          <button class="icon-btn" (click)="studio.askMute(s.id)" title="Pedir para o convidado mutar o microfone">
            <span class="icon">voice_over_off</span>
          </button>
          <button class="icon-btn danger" [class.armed]="armed()" (click)="kick()" title="Expulsar do estúdio">
            @if (armed()) { Expulsar? } @else { <span class="icon">person_remove</span> }
          </button>
        } @else {
          <button class="icon-btn danger" (click)="studio.removeLocal(s.id)" title="Remover fonte"><span class="icon">close</span></button>
        }
      </div>
    </div>
  `,
})
export class SourceCard {
  readonly source = input.required<Source>();
  readonly studio = inject(StudioService);
  readonly armed = signal(false);
  private armTimer?: ReturnType<typeof setTimeout>;

  rename() {
    const name = window.prompt('Nome exibido na tela:', this.source().name);
    if (name != null) this.studio.rename(this.source().id, name);
  }

  /** Expulsar exige dois cliques em até 3 s (evita acidentes ao vivo). */
  kick() {
    clearTimeout(this.armTimer);
    if (this.armed()) {
      this.armed.set(false);
      this.studio.kick(this.source().id);
      return;
    }
    this.armed.set(true);
    this.armTimer = setTimeout(() => this.armed.set(false), 3000);
  }
}
