import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import type { Rng } from '../core/rng';

function canvasContext(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2D canvas is unavailable');
  return { canvas, ctx };
}

/** Paper grain: speckle and short fibers. Used as a grayscale multiply overlay. */
export function createPaperTexture(rng: Rng, size = 512): Texture {
  const { canvas, ctx } = canvasContext(size);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 9000; i++) {
    const v = rng.int(0, 255);
    ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${rng.range(0.05, 0.25).toFixed(3)})`;
    ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(0.5, 1.5), rng.range(0.5, 1.5));
  }

  ctx.lineCap = 'round';
  for (let i = 0; i < 500; i++) {
    const v = rng.int(0, 255);
    ctx.strokeStyle = `rgba(${v}, ${v}, ${v}, ${rng.range(0.04, 0.12).toFixed(3)})`;
    ctx.lineWidth = rng.range(0.6, 1.6);
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + rng.range(-12, 12), y + rng.range(-12, 12), x + rng.range(-30, 30), y + rng.range(-30, 30));
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** Ink mottling: soft dark blooms on white, so it multiplies into surface color. */
export function createMottleTexture(rng: Rng, size = 512): Texture {
  const { canvas, ctx } = canvasContext(size);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 90; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const radius = rng.range(size * 0.03, size * 0.16);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(0, 0, 0, ${rng.range(0.03, 0.1).toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}
