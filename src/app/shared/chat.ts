import { Component, ElementRef, effect, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ChatMsg } from '../core/models';

@Component({
  selector: 'app-chat',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="chat">
      <div class="chat-list" #list>
        @for (m of messages(); track m.id) {
          <div class="chat-msg" [class.host]="m.host">
            <div class="chat-meta">
              <b>{{ m.from }}</b>
              @if (m.host) {
                <span class="tag">host</span>
              }
              <span class="muted">{{ m.ts | date: 'HH:mm' }}</span>
              @if (canFeature()) {
                <button class="link" type="button" (click)="feature.emit(m)" title="Mostrar como banner na live">
                  Exibir na tela
                </button>
              }
            </div>
            <div class="chat-text">{{ m.text }}</div>
          </div>
        } @empty {
          <p class="muted center pad">Nenhuma mensagem ainda.</p>
        }
      </div>
      <form class="chat-form" (ngSubmit)="submit()">
        <input name="text" [(ngModel)]="text" placeholder="Escreva uma mensagem…" maxlength="500" autocomplete="off" />
        <button class="btn primary" type="submit" [disabled]="!text().trim()">Enviar</button>
      </form>
    </div>
  `,
})
export class Chat {
  readonly messages = input.required<ChatMsg[]>();
  readonly canFeature = input(false);
  readonly send = output<string>();
  readonly feature = output<ChatMsg>();
  readonly text = signal('');
  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');

  constructor() {
    effect(() => {
      this.messages();
      const el = this.list().nativeElement;
      queueMicrotask(() => (el.scrollTop = el.scrollHeight));
    });
  }

  submit() {
    if (!this.text().trim()) return;
    this.send.emit(this.text().trim());
    this.text.set('');
  }
}
