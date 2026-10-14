import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AudioMixerService } from '../../core/audio-mixer.service';
import { listDevices, mediaErrorMessage } from '../../core/media.util';
import { TurnConfig } from '../../core/peer.util';
import { load, save } from '../../core/storage';
import { StudioService } from '../../core/studio.service';

@Component({
  selector: 'app-settings-panel',
  imports: [FormsModule],
  template: `
    <div class="panel">
      <h3>Minha câmera</h3>
      <label class="field">
        <span>Seu nome na tela</span>
        <input [ngModel]="studio.hostName()" (ngModelChange)="studio.hostName.set($event)" maxlength="40" />
      </label>
      <label class="field">
        <span>Câmera</span>
        <select [(ngModel)]="camId">
          <option value="">Padrão</option>
          @for (d of cams(); track d.deviceId) {
            <option [value]="d.deviceId">{{ d.label || 'Câmera' }}</option>
          }
        </select>
      </label>
      <label class="field">
        <span>Microfone</span>
        <select [(ngModel)]="micId">
          <option value="">Padrão</option>
          @for (d of mics(); track d.deviceId) {
            <option [value]="d.deviceId">{{ d.label || 'Microfone' }}</option>
          }
        </select>
      </label>
      <div class="row">
        <button class="btn primary" (click)="addCamera()">Adicionar minha câmera</button>
        <button class="btn" (click)="addScreen()">Compartilhar tela</button>
      </div>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      <h3>Retorno de áudio</h3>
      <label class="check">
        <input type="checkbox" [ngModel]="studio.monitorOn()" (ngModelChange)="studio.monitorOn.set($event)" />
        Ouvir os convidados neste computador (use fones!)
      </label>
      @if (outputs().length) {
        <label class="field">
          <span>Saída do retorno</span>
          <select [ngModel]="monitorDevice()" (ngModelChange)="setMonitorDevice($event)">
            <option value="">Padrão do sistema</option>
            @for (d of outputs(); track d.deviceId) {
              <option [value]="d.deviceId">{{ d.label || 'Saída' }}</option>
            }
          </select>
        </label>
      }

      <h3>Rede (TURN opcional)</h3>
      <p class="muted">
        Se algum convidado não conseguir conectar (rede corporativa, 4G com NAT restrito), cadastre um servidor
        TURN gratuito (ex.: metered.ca) e recarregue o estúdio.
      </p>
      <label class="field">
        <span>URLs (separadas por vírgula)</span>
        <input [(ngModel)]="turn.urls" placeholder="turn:global.relay.metered.ca:80" />
      </label>
      <div class="row">
        <label class="field">
          <span>Usuário</span>
          <input [(ngModel)]="turn.username" autocomplete="off" />
        </label>
        <label class="field">
          <span>Senha</span>
          <input [(ngModel)]="turn.credential" type="password" autocomplete="off" />
        </label>
      </div>
      <button class="btn sm" (click)="saveTurn()">Salvar TURN</button>
      @if (turnSaved()) {
        <span class="muted"> Salvo. Recarregue a página para aplicar.</span>
      }

      <h3>Estúdio</h3>
      <p class="muted">ID atual: <code>{{ studio.peerId() || '…' }}</code></p>
      <button class="btn sm" [class.danger]="confirmNewId()" (click)="newId()">
        {{ confirmNewId() ? 'Confirmar: o link antigo deixará de funcionar' : 'Gerar novo link de convite' }}
      </button>

      <h3>Como levar para o YouTube (OBS)</h3>
      <div class="field">
        <span>Link da Saída para o OBS (fonte Navegador)</span>
        <div class="invite">
          <input readonly [value]="studio.outputUrl() || 'Gerando link…'" (focus)="$any($event.target).select()" />
          <button class="btn sm" (click)="copyOutput()" [disabled]="!studio.outputUrl()">
            {{ outputCopied() ? 'Copiado!' : 'Copiar' }}
          </button>
        </div>
      </div>
      <p class="muted">
        {{ studio.outputCount() ? 'Saída conectada no OBS.' : 'Nenhuma Saída conectada pelo link ainda.' }}
      </p>
      <ol class="help">
        <li>No OBS: <b>Fontes → + → Navegador</b>, cole o link acima e use largura <b>1920</b> e altura <b>1080</b>.</li>
        <li>
          Marque <b>Controlar áudio pelo OBS</b>. O áudio do programa entra direto no mixer do OBS, sem cabo
          virtual e sem misturar com o seu retorno.
        </li>
        <li>Mantenha esta aba do estúdio aberta. Se ela for recarregada, a Saída no OBS reconecta sozinha.</li>
        <li>No OBS: <b>Configurações → Transmissão → YouTube</b>, conecte a conta e inicie a transmissão.</li>
      </ol>
      <p class="muted">
        Alternativa: <b>Abrir janela de Saída</b> (topo) e capturar com <b>Captura de janela</b> e
        <b>Captura de áudio de aplicativo</b>. Não minimize essa janela.
      </p>
    </div>
  `,
})
export class SettingsPanel implements OnInit {
  readonly studio = inject(StudioService);
  private readonly mixer = inject(AudioMixerService);

  readonly cams = signal<MediaDeviceInfo[]>([]);
  readonly mics = signal<MediaDeviceInfo[]>([]);
  readonly outputs = signal<MediaDeviceInfo[]>([]);
  readonly error = signal('');
  readonly monitorDevice = signal(load('monitorDevice', ''));
  readonly turnSaved = signal(false);
  readonly confirmNewId = signal(false);
  readonly outputCopied = signal(false);
  camId = load('hostCam', '');
  micId = load('hostMic', '');
  turn: TurnConfig = load<TurnConfig>('turn', { urls: '', username: '', credential: '' });

  async ngOnInit() {
    await this.refreshDevices();
    if (this.monitorDevice()) this.mixer.setMonitorDevice(this.monitorDevice()).catch(() => {});
  }

  async refreshDevices() {
    try {
      const d = await listDevices();
      this.cams.set(d.cams);
      this.mics.set(d.mics);
      this.outputs.set(d.outputs);
    } catch {
      /* sem permissão ainda */
    }
  }

  async addCamera() {
    this.error.set('');
    save('hostCam', this.camId);
    save('hostMic', this.micId);
    try {
      await this.studio.addCamera(this.camId || undefined, this.micId || undefined);
      await this.refreshDevices();
    } catch (err) {
      this.error.set(mediaErrorMessage(err));
    }
  }

  async addScreen() {
    this.error.set('');
    try {
      await this.studio.addScreen();
    } catch (err) {
      if ((err as DOMException).name !== 'NotAllowedError') this.error.set('Não foi possível compartilhar a tela.');
    }
  }

  async setMonitorDevice(id: string) {
    this.monitorDevice.set(id);
    save('monitorDevice', id);
    try {
      await this.mixer.setMonitorDevice(id);
    } catch {
      this.error.set('Este navegador não permite escolher a saída de áudio.');
    }
  }

  saveTurn() {
    save('turn', this.turn);
    this.turnSaved.set(true);
  }

  async copyOutput() {
    try {
      await navigator.clipboard.writeText(this.studio.outputUrl());
      this.outputCopied.set(true);
      setTimeout(() => this.outputCopied.set(false), 2000);
    } catch {
      /* o campo já fica selecionável para copiar manualmente */
    }
  }

  newId() {
    if (!this.confirmNewId()) {
      this.confirmNewId.set(true);
      setTimeout(() => this.confirmNewId.set(false), 4000);
      return;
    }
    this.confirmNewId.set(false);
    this.studio.newStudioId();
  }
}
