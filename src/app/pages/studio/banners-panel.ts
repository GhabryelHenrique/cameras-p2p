import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StudioService } from '../../core/studio.service';

@Component({
  selector: 'app-banners-panel',
  imports: [FormsModule],
  template: `
    <div class="panel">
      <h3>Banners</h3>
      <p class="muted">Um banner ativo por vez aparece na parte de baixo da tela.</p>
      <form class="row" (ngSubmit)="add()">
        <input name="text" [(ngModel)]="text" placeholder="Ex.: Siga no Instagram @meucanal" maxlength="140" />
        <button class="btn primary" type="submit" [disabled]="!text().trim()">Criar</button>
      </form>
      <div class="banner-list">
        @for (b of studio.banners(); track b.id) {
          <div class="banner-item" [class.active]="studio.activeBannerId() === b.id">
            <span class="banner-text">{{ b.text }}</span>
            <button class="btn sm" [class.primary]="studio.activeBannerId() !== b.id" (click)="studio.toggleBanner(b.id)">
              {{ studio.activeBannerId() === b.id ? 'Ocultar' : 'Mostrar' }}
            </button>
            <button class="icon-btn danger" (click)="studio.removeBanner(b.id)" title="Apagar"><span class="icon">delete</span></button>
          </div>
        } @empty {
          <p class="muted">Nenhum banner criado.</p>
        }
      </div>

      <h3>Letreiro rolante</h3>
      <label class="field">
        <span>Texto</span>
        <input
          [ngModel]="studio.branding().ticker"
          (ngModelChange)="studio.updateBranding({ ticker: $event })"
          placeholder="Ex.: Comente sua pergunta no chat do YouTube!"
          maxlength="300"
        />
      </label>
      <label class="check">
        <input
          type="checkbox"
          [ngModel]="studio.branding().tickerOn"
          (ngModelChange)="studio.updateBranding({ tickerOn: $event })"
        />
        Mostrar letreiro na live
      </label>
    </div>
  `,
})
export class BannersPanel {
  readonly studio = inject(StudioService);
  readonly text = signal('');

  add() {
    if (this.studio.addBanner(this.text())) this.text.set('');
  }
}
