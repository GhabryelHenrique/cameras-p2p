import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StudioService } from '../../core/studio.service';
import { Chat } from '../../shared/chat';
import { BannersPanel } from './banners-panel';
import { BrandPanel } from './brand-panel';
import { SettingsPanel } from './settings-panel';
import { SourceCard } from './source-card';
import { StagePreview } from './stage-preview';

type Tab = 'chat' | 'banners' | 'brand' | 'settings';

@Component({
  selector: 'app-studio',
  imports: [RouterLink, StagePreview, SourceCard, Chat, BannersPanel, BrandPanel, SettingsPanel],
  host: { '(click)': 'studio.resumeAudio()' },
  template: `
    <div class="studio">
      <header class="topbar">
        <a class="logo-mark" routerLink="/"><span class="dot"></span> Estúdio P2P</a>
        <span class="status-pill" [attr.data-state]="studio.online()">
          {{ statusLabel[studio.online()] }}
        </span>

        <div class="invite">
          <input readonly [value]="studio.inviteUrl() || 'Gerando link…'" (focus)="$any($event.target).select()" />
          <button class="btn" (click)="copyInvite()" [disabled]="!studio.inviteUrl()">
            {{ copied() ? 'Copiado!' : 'Copiar convite' }}
          </button>
        </div>

        <span class="spacer"></span>
        <span class="muted">{{ studio.guestCount() }} convidado(s)</span>
        @if (studio.outputCount()) {
          <span class="status-pill" data-state="on">Saída no OBS</span>
        }
        <button class="btn primary" (click)="studio.openOutput()">Abrir janela de Saída</button>
      </header>

      @if (studio.error()) {
        <div class="alert">{{ studio.error() }}</div>
      }

      <main class="studio-main">
        <section class="stage-col">
          <app-stage-preview />

          <div class="sources">
            <div class="sources-head">
              <h3>Na live <span class="count">{{ studio.live().length }}</span></h3>
            </div>
            <div class="source-grid">
              @for (s of studio.live(); track s.id) {
                <app-source-card [source]="s" />
              } @empty {
                <p class="muted empty">Ninguém no programa. Clique em "Adicionar à live" em um card dos bastidores.</p>
              }
            </div>

            <div class="sources-head">
              <h3>Bastidores <span class="count">{{ studio.backstage().length }}</span></h3>
              <span class="spacer"></span>
              @if (!hasCamera()) {
                <button class="btn sm" (click)="tab.set('settings')">+ Minha câmera / tela</button>
              }
            </div>
            <div class="source-grid">
              @for (s of studio.backstage(); track s.id) {
                <app-source-card [source]="s" />
              } @empty {
                <p class="muted empty">
                  Envie o link de convite. Quem entrar aparece aqui antes de ir ao ar.
                </p>
              }
            </div>
          </div>
        </section>

        <aside class="side">
          <nav class="tabs">
            <button [class.active]="tab() === 'chat'" (click)="tab.set('chat')">
              Chat @if (studio.chat().length) { <span class="count">{{ studio.chat().length }}</span> }
            </button>
            <button [class.active]="tab() === 'banners'" (click)="tab.set('banners')">Banners</button>
            <button [class.active]="tab() === 'brand'" (click)="tab.set('brand')">Marca</button>
            <button [class.active]="tab() === 'settings'" (click)="tab.set('settings')">Ajustes</button>
          </nav>
          <div class="side-body">
            @switch (tab()) {
              @case ('chat') {
                <app-chat
                  [messages]="studio.chat()"
                  [canFeature]="true"
                  (send)="studio.sendChat($event)"
                  (feature)="studio.featureChat($event)"
                />
              }
              @case ('banners') {
                <app-banners-panel />
              }
              @case ('brand') {
                <app-brand-panel />
              }
              @case ('settings') {
                <app-settings-panel />
              }
            }
          </div>
        </aside>
      </main>

      @if (studio.notice()) {
        <div class="toast">{{ studio.notice() }}</div>
      }
    </div>
  `,
})
export class Studio implements OnInit {
  readonly studio = inject(StudioService);
  readonly tab = signal<Tab>('chat');
  readonly copied = signal(false);
  readonly statusLabel = {
    off: 'Offline',
    connecting: 'Conectando…',
    on: 'Online — aceitando convidados',
    error: 'Erro de conexão',
  };

  ngOnInit() {
    this.studio.start();
  }

  hasCamera() {
    return this.studio.sources().some((s) => s.kind === 'camera');
  }

  async copyInvite() {
    try {
      await navigator.clipboard.writeText(this.studio.inviteUrl());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* o campo já fica selecionável para copiar manualmente */
    }
  }
}
