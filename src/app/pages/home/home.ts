import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { load, save } from '../../core/storage';

@Component({
  selector: 'app-home',
  imports: [FormsModule],
  template: `
    <div class="home">
      <header class="home-hero">
        <div class="logo-mark"><span class="dot"></span> Estúdio P2P</div>
        <h1>Sua live com convidados, <em>sem servidor</em>.</h1>
        <p>
          Seu PC vira o estúdio. Os convidados entram por um link e mandam a webcam direto para você
          (WebRTC P2P). Você escolhe quem aparece, o layout e os banners, e o OBS leva tudo para o YouTube.
        </p>
      </header>

      <div class="home-cards">
        <form class="card" (ngSubmit)="openStudio()">
          <h2>Sou o host</h2>
          <p class="muted">Abra o estúdio neste computador e envie o link de convite.</p>
          <label class="field">
            <span>Seu nome na tela</span>
            <input name="hostName" [(ngModel)]="hostName" maxlength="40" placeholder="Ex.: Ghabryel" />
          </label>
          <button class="btn primary lg" type="submit">Abrir meu estúdio</button>
        </form>

        <form class="card" (ngSubmit)="joinStudio()">
          <h2>Sou convidado</h2>
          <p class="muted">Cole o link ou o código que o host enviou.</p>
          <label class="field">
            <span>Link ou código do estúdio</span>
            <input name="code" [(ngModel)]="code" placeholder="cp2p-xxxxxxxxxx" />
          </label>
          <button class="btn lg" type="submit" [disabled]="!code().trim()">Entrar no estúdio</button>
        </form>
      </div>

      <ol class="home-steps">
        <li><b>1.</b> Abra o estúdio e copie o link de convite.</li>
        <li><b>2.</b> Convidados entram nos <b>bastidores</b>; você coloca na live com um clique.</li>
        <li><b>3.</b> Clique em <b>Abrir janela de Saída</b> e capture essa janela no OBS → YouTube.</li>
      </ol>
    </div>
  `,
})
export class Home {
  private readonly router = inject(Router);
  readonly hostName = signal(load('hostName', ''));
  readonly code = signal('');

  openStudio() {
    save('hostName', this.hostName().trim() || 'Host');
    void this.router.navigate(['/studio']);
  }

  joinStudio() {
    const raw = this.code().trim();
    const id = raw.includes('join/') ? raw.split('join/').pop()!.split(/[?#/]/)[0] : raw;
    if (id) void this.router.navigate(['/join', id]);
  }
}
