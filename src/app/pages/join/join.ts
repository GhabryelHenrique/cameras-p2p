import { Component, OnDestroy, OnInit, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GuestService } from '../../core/guest.service';
import { stopStream } from '../../core/media.util';
import { Chat } from '../../shared/chat';
import { SrcObjectDirective } from '../../shared/src-object.directive';

@Component({
  selector: 'app-join',
  imports: [FormsModule, SrcObjectDirective, Chat],
  template: `
    @switch (phase()) {
      @case ('setup') {
        <div class="join-setup">
          <div class="join-preview">
            <video [appSrcObject]="g.local()" muted autoplay playsinline class="mirror"></video>
            @if (!g.local()) {
              <div class="src-overlay">{{ g.mediaError() || 'Liberando câmera…' }}</div>
            } @else if (!g.camOn()) {
              <div class="src-overlay">Câmera desligada</div>
            }
            <div class="join-toggles">
              <button class="round" [class.off]="!g.micOn()" (click)="g.setMic(!g.micOn())" title="Microfone">
                <span class="icon">{{ g.micOn() ? 'mic' : 'mic_off' }}</span>
              </button>
              <button class="round" [class.off]="!g.camOn()" (click)="g.setCam(!g.camOn())" title="Câmera">
                <span class="icon">{{ g.camOn() ? 'videocam' : 'videocam_off' }}</span>
              </button>
            </div>
          </div>

          <form class="card join-form" (ngSubmit)="g.join(hostId())">
            <div class="logo-mark"><span class="dot"></span> Estúdio P2P</div>
            <h2>Entrar como convidado</h2>
            <label class="field">
              <span>Seu nome (aparece na live)</span>
              <input name="name" [ngModel]="g.name()" (ngModelChange)="g.name.set($event)" maxlength="40" required />
            </label>
            <label class="field">
              <span>Câmera</span>
              <select name="cam" [ngModel]="g.camId()" (ngModelChange)="g.camId.set($event); g.openMedia()">
                @for (d of g.cams(); track d.deviceId) {
                  <option [value]="d.deviceId">{{ d.label || 'Câmera' }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span>Microfone</span>
              <select name="mic" [ngModel]="g.micId()" (ngModelChange)="g.micId.set($event); g.openMedia()">
                @for (d of g.mics(); track d.deviceId) {
                  <option [value]="d.deviceId">{{ d.label || 'Microfone' }}</option>
                }
              </select>
            </label>
            @if (g.mediaError()) {
              <p class="error">{{ g.mediaError() }} <button class="link" type="button" (click)="g.openMedia()">Tentar de novo</button></p>
            }
            <button class="btn primary lg" type="submit" [disabled]="!g.name().trim() || !g.local()">
              Entrar no estúdio
            </button>
            <p class="muted small">Use fones de ouvido para evitar eco. Seu vídeo vai direto (P2P) para o host.</p>
          </form>
        </div>
      }

      @case ('connecting') {
        <div class="center-screen">
          <div class="spinner"></div>
          <p>{{ g.message() }}</p>
        </div>
      }

      @case ('ended') {
        <div class="center-screen">
          <h2>Até a próxima!</h2>
          <p class="muted">{{ g.message() }}</p>
          <button class="btn primary" (click)="g.reset()">Entrar novamente</button>
        </div>
      }

      @case ('error') {
        <div class="center-screen">
          <h2>Não deu para conectar</h2>
          <p class="muted">{{ g.message() }}</p>
          <button class="btn primary" (click)="g.reset()">Tentar novamente</button>
        </div>
      }

      @default {
        <div class="join-room">
          <section class="join-stage">
            <div class="join-status" [class.live]="phase() === 'live'">
              {{ phase() === 'live' ? '● VOCÊ ESTÁ AO VIVO' : 'Bastidores — aguardando o host' }}
            </div>
            <div class="join-program">
              <video [appSrcObject]="g.program()" autoplay playsinline></video>
              @if (!g.program()) {
                <div class="src-overlay">Recebendo o programa do estúdio…</div>
              }
              <div class="join-self">
                <video [appSrcObject]="g.local()" muted autoplay playsinline class="mirror"></video>
              </div>
            </div>
            <div class="join-controls">
              <button class="btn" [class.danger]="!g.micOn()" (click)="g.setMic(!g.micOn())">
                <span class="icon">{{ g.micOn() ? 'mic' : 'mic_off' }}</span>
                {{ g.micOn() ? 'Mutar' : 'Ativar mic' }}
              </button>
              <button class="btn" [class.danger]="!g.camOn()" (click)="g.setCam(!g.camOn())">
                <span class="icon">{{ g.camOn() ? 'videocam' : 'videocam_off' }}</span>
                {{ g.camOn() ? 'Desligar câmera' : 'Ligar câmera' }}
              </button>
              <span class="spacer"></span>
              <span class="muted">Estúdio de {{ g.hostName() }}</span>
              <button class="btn danger" (click)="g.leave()">Sair</button>
            </div>
          </section>
          <aside class="side">
            <nav class="tabs"><button class="active">Chat</button></nav>
            <div class="side-body">
              <app-chat [messages]="g.chat()" (send)="g.sendChat($event)" />
            </div>
          </aside>
        </div>
      }
    }

    @if (g.notice()) {
      <div class="toast">{{ g.notice() }}</div>
    }
  `,
})
export class Join implements OnInit, OnDestroy {
  readonly hostId = input.required<string>();
  readonly g = inject(GuestService);
  readonly phase = computed(() => this.g.phase());

  ngOnInit() {
    if (!this.g.local()) void this.g.openMedia();
  }

  ngOnDestroy() {
    if (this.phase() !== 'setup') this.g.leave();
    stopStream(this.g.local());
    this.g.local.set(null);
    this.g.reset();
  }
}
