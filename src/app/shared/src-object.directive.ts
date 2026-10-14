import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/** Liga um MediaStream a um <video>/<audio>: <video [appSrcObject]="stream">. */
@Directive({ selector: '[appSrcObject]' })
export class SrcObjectDirective {
  readonly stream = input<MediaStream | null>(null, { alias: 'appSrcObject' });
  private readonly el = inject<ElementRef<HTMLMediaElement>>(ElementRef).nativeElement;

  constructor() {
    effect(() => {
      const stream = this.stream();
      if (this.el.srcObject !== stream) {
        this.el.srcObject = stream;
        if (stream) this.el.play().catch(() => {});
      }
    });
  }
}
