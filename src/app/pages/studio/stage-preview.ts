import { AfterViewInit, Component, ElementRef, OnDestroy, inject, viewChild } from '@angular/core';
import { CompositorService } from '../../core/compositor.service';
import { LayoutKind } from '../../core/models';
import { StudioService } from '../../core/studio.service';

@Component({
  selector: 'app-stage-preview',
  template: `
    <div class="stage">
      <div class="stage-frame" #frame>
        @if (studio.live().length > 0) {
          <span class="stage-onair">● NO PROGRAMA: {{ studio.live().length }}</span>
        }
      </div>
      <div class="layout-bar">
        @for (l of layouts; track l.id) {
          <button
            class="layout-btn"
            [class.active]="studio.layout() === l.id"
            (click)="studio.layout.set(l.id)"
            [title]="l.label"
          >
            <span class="layout-icon" [attr.data-kind]="l.id"><i></i><i></i><i></i></span>
            {{ l.label }}
          </button>
        }
        <span class="spacer"></span>
        @if (studio.live().length > 0) {
          <button class="btn sm ghost" (click)="studio.allToBackstage()">Tirar todos da live</button>
        }
      </div>
    </div>
  `,
})
export class StagePreview implements AfterViewInit, OnDestroy {
  readonly studio = inject(StudioService);
  private readonly comp = inject(CompositorService);
  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');

  readonly layouts: { id: LayoutKind; label: string }[] = [
    { id: 'solo', label: 'Solo' },
    { id: 'grid', label: 'Grade' },
    { id: 'spotlight', label: 'Destaque' },
    { id: 'sidebyside', label: 'Lado a lado' },
  ];

  ngAfterViewInit() {
    this.frame().nativeElement.prepend(this.comp.canvas);
  }

  ngOnDestroy() {
    this.comp.canvas.remove();
  }
}
