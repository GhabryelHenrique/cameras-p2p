import { Injectable } from '@angular/core';
import { Branding, LayoutKind, Source } from './models';

export interface Scene {
  live: Source[];
  layout: LayoutKind;
  spotlightId: string | null;
  branding: Branding;
  banner: string | null;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Tile extends Rect {
  alpha: number;
}

const W = 1920;
const H = 1080;
const FPS = 30;
const PAD = 48;
const GAP = 20;
const TICKER_H = 64;
const FONT = '"Segoe UI", Inter, Roboto, Arial, sans-serif';
const ICON_FONT = '"Material Symbols Rounded"';

/**
 * Desenha a cena do programa (1920x1080) num <canvas>. O stream do canvas vira o vídeo
 * da janela de Saída (capturada pelo OBS) e o retorno enviado aos convidados.
 */
@Injectable({ providedIn: 'root' })
export class CompositorService {
  readonly canvas = document.createElement('canvas');
  readonly stream: MediaStream;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly videos = new Map<string, HTMLVideoElement>();
  private readonly tiles = new Map<string, Tile>();
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly videoHost = document.createElement('div');
  private scene: () => Scene = () => ({
    live: [],
    layout: 'grid',
    spotlightId: null,
    branding: {} as Branding,
    banner: null,
  });
  private worker?: Worker;
  private tickerX = W;
  private iconsReady = false;

  constructor() {
    document.fonts
      .load(`24px ${ICON_FONT}`, 'mic_off')
      .then((faces) => (this.iconsReady = faces.length > 0))
      .catch(() => {});
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.className = 'program-canvas';
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.stream = this.canvas.captureStream(FPS);
    // Vídeos precisam estar no DOM (e visíveis) para o Chrome continuar decodificando quadros.
    this.videoHost.style.cssText =
      'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;overflow:hidden;';
    document.body.appendChild(this.videoHost);
  }

  setScene(fn: () => Scene) {
    this.scene = fn;
  }

  /** Mantém um <video> por fonte, inclusive dos bastidores, para entrar na live sem atraso. */
  syncVideos(sources: Source[]) {
    const ids = new Set(sources.map((s) => s.id));
    for (const s of sources) {
      let v = this.videos.get(s.id);
      if (!v) {
        v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.autoplay = true;
        this.videoHost.appendChild(v);
        this.videos.set(s.id, v);
      }
      if (v.srcObject !== s.stream) {
        v.srcObject = s.stream;
        v.play().catch(() => {});
      }
    }
    for (const [id, v] of this.videos) {
      if (ids.has(id)) continue;
      v.srcObject = null;
      v.remove();
      this.videos.delete(id);
      this.tiles.delete(id);
    }
  }

  /** Usa um timer dentro de um Worker: não é estrangulado quando a aba fica em segundo plano. */
  start() {
    if (this.worker) return;
    const code = `let i;onmessage=e=>{clearInterval(i);if(e.data>0)i=setInterval(()=>postMessage(0),e.data)}`;
    this.worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    this.worker.onmessage = () => this.draw();
    this.worker.postMessage(1000 / FPS);
  }

  private draw() {
    const ctx = this.ctx;
    const scene = this.scene();
    const b = scene.branding;
    const tickerOn = b.tickerOn && !!b.ticker.trim();

    this.drawBackground(b);

    const area: Rect = {
      x: PAD,
      y: PAD,
      w: W - PAD * 2,
      h: H - PAD * 2 - (tickerOn ? TICKER_H : 0),
    };
    const ordered = this.order(scene);
    const targets = this.layout(scene.layout, ordered.length, area);

    if (ordered.length === 0 && b.idleText) {
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = `700 76px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 24;
      ctx.fillText(b.idleText, W / 2, area.y + area.h / 2, W - PAD * 4);
      ctx.restore();
    }

    const visible = new Set<string>();
    ordered.forEach((s, i) => {
      const target = targets[i];
      if (!target) return;
      visible.add(s.id);
      const tile = this.animate(s.id, target);
      this.drawTile(s, tile, b);
    });
    for (const id of [...this.tiles.keys()]) if (!visible.has(id)) this.tiles.delete(id);

    if (scene.banner) this.drawBanner(scene.banner, b, tickerOn);
    if (tickerOn) this.drawTicker(b);
    if (b.logo) this.drawLogo(b.logo);
  }

  private order(scene: Scene): Source[] {
    const live = [...scene.live].sort((a, b) => a.liveSince - b.liveSince);
    const idx = live.findIndex((s) => s.id === scene.spotlightId);
    if (idx > 0) live.unshift(...live.splice(idx, 1));
    return live;
  }

  private layout(kind: LayoutKind, n: number, a: Rect): Rect[] {
    if (n === 0) return [];
    if (kind === 'solo' || n === 1) return [this.fit16x9(a)];

    if (kind === 'spotlight') {
      const sideW = Math.round(a.w * 0.22);
      const main: Rect = { x: a.x, y: a.y, w: a.w - sideW - GAP, h: a.h };
      const k = n - 1;
      const thumbH = Math.min((sideW * 9) / 16, (a.h - GAP * (k - 1)) / k);
      const total = thumbH * k + GAP * (k - 1);
      const top = a.y + (a.h - total) / 2;
      const thumbs = Array.from({ length: k }, (_, i) => ({
        x: a.x + a.w - sideW,
        y: top + i * (thumbH + GAP),
        w: sideW,
        h: thumbH,
      }));
      return [main, ...thumbs];
    }

    if (kind === 'sidebyside') {
      const w = (a.w - GAP * (n - 1)) / n;
      const h = Math.min(a.h, w * 1.25);
      const y = a.y + (a.h - h) / 2;
      return Array.from({ length: n }, (_, i) => ({ x: a.x + i * (w + GAP), y, w, h }));
    }

    // grade
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cellW = (a.w - GAP * (cols - 1)) / cols;
    const cellH = (a.h - GAP * (rows - 1)) / rows;
    const tileW = Math.min(cellW, (cellH * 16) / 9);
    const tileH = (tileW * 9) / 16;
    const gridH = rows * tileH + (rows - 1) * GAP;
    const top = a.y + (a.h - gridH) / 2;
    const rects: Rect[] = [];
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(cols, n - r * cols);
      const rowW = inRow * tileW + (inRow - 1) * GAP;
      const left = a.x + (a.w - rowW) / 2;
      for (let c = 0; c < inRow; c++) {
        rects.push({ x: left + c * (tileW + GAP), y: top + r * (tileH + GAP), w: tileW, h: tileH });
      }
    }
    return rects;
  }

  private fit16x9(a: Rect): Rect {
    const w = Math.min(a.w, (a.h * 16) / 9);
    const h = (w * 9) / 16;
    return { x: a.x + (a.w - w) / 2, y: a.y + (a.h - h) / 2, w, h };
  }

  private animate(id: string, t: Rect): Tile {
    let tile = this.tiles.get(id);
    if (!tile) {
      tile = { ...t, alpha: 0 };
      this.tiles.set(id, tile);
    }
    const k = 0.25;
    tile.x += (t.x - tile.x) * k;
    tile.y += (t.y - tile.y) * k;
    tile.w += (t.w - tile.w) * k;
    tile.h += (t.h - tile.h) * k;
    tile.alpha = Math.min(1, tile.alpha + 0.12);
    return tile;
  }

  private drawBackground(b: Branding) {
    const ctx = this.ctx;
    ctx.fillStyle = b.bgColor || '#000';
    ctx.fillRect(0, 0, W, H);
    const img = b.bgImage ? this.image(b.bgImage) : null;
    if (img?.complete && img.naturalWidth) this.drawCover(img, img.naturalWidth, img.naturalHeight, 0, 0, W, H);
  }

  private drawTile(s: Source, t: Tile, b: Branding) {
    const ctx = this.ctx;
    const v = this.videos.get(s.id);
    const radius = 18;
    ctx.save();
    ctx.globalAlpha = t.alpha;
    ctx.beginPath();
    ctx.roundRect(t.x, t.y, t.w, t.h, radius);
    ctx.clip();
    ctx.fillStyle = '#1b1f2e';
    ctx.fillRect(t.x, t.y, t.w, t.h);

    const camOff = s.muteVideo || !s.camOn;
    if (!camOff && v && v.videoWidth > 0) {
      if (s.kind === 'screen') {
        ctx.fillStyle = '#000';
        ctx.fillRect(t.x, t.y, t.w, t.h);
        this.drawContain(v, v.videoWidth, v.videoHeight, t.x, t.y, t.w, t.h);
      } else {
        this.drawCover(v, v.videoWidth, v.videoHeight, t.x, t.y, t.w, t.h);
      }
    } else {
      const r = Math.min(t.w, t.h) * 0.18;
      ctx.fillStyle = b.accent;
      ctx.beginPath();
      ctx.arc(t.x + t.w / 2, t.y + t.h / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(r * 0.9)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials(s.name), t.x + t.w / 2, t.y + t.h / 2 + 2);
    }
    ctx.restore();

    if (b.showNames && s.name) {
      const size = Math.max(18, Math.min(30, t.h / 14));
      // Ícone só quando a fonte já carregou; senão o canvas escreveria o texto "mic_off".
      const micOff = (s.muteAudio || !s.micOn) && this.iconsReady;
      const iconW = micOff ? size * 1.25 : 0;
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.font = `600 ${size}px ${FONT}`;
      const tw = Math.min(ctx.measureText(s.name).width, t.w - 60 - iconW);
      const ph = size * 1.7;
      const x = t.x + 14;
      const y = t.y + t.h - ph - 14;
      ctx.fillStyle = b.accent;
      ctx.beginPath();
      ctx.roundRect(x, y, tw + iconW + size * 1.2, ph, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      if (micOff) {
        ctx.font = `${size}px ${ICON_FONT}`;
        ctx.fillText('mic_off', x + size * 0.5, y + ph / 2 + 1);
        ctx.font = `600 ${size}px ${FONT}`;
      }
      ctx.fillText(s.name, x + size * 0.6 + iconW, y + ph / 2 + 1, tw);
      ctx.restore();
    }
  }

  private drawBanner(text: string, b: Branding, tickerOn: boolean) {
    const ctx = this.ctx;
    const size = 46;
    ctx.save();
    ctx.font = `700 ${size}px ${FONT}`;
    const maxW = W - PAD * 2 - 80;
    const tw = Math.min(ctx.measureText(text).width, maxW);
    const h = 104;
    const x = PAD;
    const y = H - PAD - h - (tickerOn ? TICKER_H : 0) - 12;
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = b.accent;
    ctx.beginPath();
    ctx.roundRect(x, y, tw + 80, h, 12);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillRect(x, y + 18, 8, h - 36);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 40, y + h / 2 + 2, maxW);
    ctx.restore();
  }

  private drawTicker(b: Branding) {
    const ctx = this.ctx;
    const y = H - TICKER_H;
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,18,.88)';
    ctx.fillRect(0, y, W, TICKER_H);
    ctx.fillStyle = b.accent;
    ctx.fillRect(0, y, W, 4);
    ctx.font = `600 32px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    const text = b.ticker.trim();
    const tw = ctx.measureText(text).width;
    this.tickerX -= 3;
    if (this.tickerX < -tw) this.tickerX = W;
    ctx.fillText(text, this.tickerX, y + TICKER_H / 2 + 2);
    ctx.restore();
  }

  private drawLogo(src: string) {
    const img = this.image(src);
    if (!img.complete || !img.naturalWidth) return;
    const maxW = 280;
    const maxH = 150;
    const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    this.ctx.drawImage(img, W - PAD - w, PAD, w, h);
  }

  private drawCover(src: CanvasImageSource, sw: number, sh: number, x: number, y: number, w: number, h: number) {
    const s = Math.max(w / sw, h / sh);
    const cw = w / s;
    const ch = h / s;
    this.ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
  }

  private drawContain(src: CanvasImageSource, sw: number, sh: number, x: number, y: number, w: number, h: number) {
    const s = Math.min(w / sw, h / sh);
    const dw = sw * s;
    const dh = sh * s;
    this.ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  private image(src: string): HTMLImageElement {
    let img = this.images.get(src);
    if (!img) {
      if (this.images.size > 8) this.images.clear();
      img = new Image();
      img.src = src;
      this.images.set(src, img);
    }
    return img;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
