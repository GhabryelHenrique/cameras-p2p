import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { readImage } from '../../core/media.util';
import { StudioService } from '../../core/studio.service';

@Component({
  selector: 'app-brand-panel',
  imports: [FormsModule],
  template: `
    @let b = studio.branding();
    <div class="panel">
      <h3>Cores</h3>
      <div class="row">
        <label class="field color">
          <span>Destaque (nomes e banners)</span>
          <input type="color" [ngModel]="b.accent" (ngModelChange)="studio.updateBranding({ accent: $event })" />
        </label>
        <label class="field color">
          <span>Fundo</span>
          <input type="color" [ngModel]="b.bgColor" (ngModelChange)="studio.updateBranding({ bgColor: $event })" />
        </label>
      </div>

      <h3>Logo</h3>
      <div class="row">
        @if (b.logo) {
          <img class="thumb" [src]="b.logo" alt="Logo" />
          <button class="btn sm" (click)="studio.updateBranding({ logo: null })">Remover</button>
        }
        <label class="btn sm">
          {{ b.logo ? 'Trocar' : 'Enviar logo' }}
          <input type="file" accept="image/*" hidden (change)="upload($event, 'logo')" />
        </label>
      </div>

      <h3>Imagem de fundo</h3>
      <div class="row">
        @if (b.bgImage) {
          <img class="thumb wide" [src]="b.bgImage" alt="Fundo" />
          <button class="btn sm" (click)="studio.updateBranding({ bgImage: null })">Remover</button>
        }
        <label class="btn sm">
          {{ b.bgImage ? 'Trocar' : 'Enviar fundo' }}
          <input type="file" accept="image/*" hidden (change)="upload($event, 'bgImage')" />
        </label>
      </div>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      <h3>Tela</h3>
      <label class="check">
        <input type="checkbox" [ngModel]="b.showNames" (ngModelChange)="studio.updateBranding({ showNames: $event })" />
        Mostrar nomes dos participantes
      </label>
      <label class="field">
        <span>Texto quando ninguém está na live</span>
        <input
          [ngModel]="b.idleText"
          (ngModelChange)="studio.updateBranding({ idleText: $event })"
          maxlength="80"
        />
      </label>
    </div>
  `,
})
export class BrandPanel {
  readonly studio = inject(StudioService);
  readonly error = signal('');

  async upload(event: Event, field: 'logo' | 'bgImage') {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    try {
      const url = field === 'logo' ? await readImage(file, 600, true) : await readImage(file, 1920, false);
      this.studio.updateBranding({ [field]: url });
    } catch {
      this.error.set('Não foi possível ler esta imagem.');
    }
  }
}
