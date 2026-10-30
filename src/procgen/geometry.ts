import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  IcosahedronGeometry,
  PlaneGeometry,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Noise } from './noise';

/**
 * Pushes each vertex radially from the origin by noise. Vertices that share a position move
 * together, so separate faces never crack apart at their seams.
 */
export function roughen(geometry: BufferGeometry, noise: Noise, amount: number, frequency: number): void {
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const length = Math.hypot(x, y, z) || 1;
    const offset = noise.fbm(x * frequency, y * frequency, z * frequency, 3) * amount;
    const scale = (length + offset) / length;
    position.setXYZ(i, x * scale, y * scale, z * scale);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** Writes a color attribute. Each band is picked by height with a noise wobble, so layers look hand-painted. */
export function paintStrata(
  geometry: BufferGeometry,
  bands: readonly Color[],
  noise: Noise,
  bandHeight: number,
): void {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const wobble = noise.fbm(x * 0.08, y * 0.05, z * 0.08, 3) * bandHeight * 0.6;
    const index = Math.floor((y + wobble) / bandHeight);
    const count = bands.length;
    const color = bands[((index % count) + count) % count] ?? bands[0] ?? new Color();
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
}

/** Blends two colors by noise, for ground with no strata. */
export function paintNoise(geometry: BufferGeometry, from: Color, to: Color, noise: Noise, frequency: number): void {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const t = noise.fbm(position.getX(i) * frequency, 0, position.getZ(i) * frequency, 3) * 0.5 + 0.5;
    colors[i * 3] = from.r + (to.r - from.r) * t;
    colors[i * 3 + 1] = from.g + (to.g - from.g) * t;
    colors[i * 3 + 2] = from.b + (to.b - from.b) * t;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
}

/**
 * Roughened slab for canyon walls and ledges. Smooth normals, centered on the origin.
 * `roughness` scales how far faces wander, as a fraction of the smallest dimension. Use less for
 * surfaces the player stands on, so the drawn top stays close to its collision box.
 */
export function buildSlab(
  noise: Noise,
  width: number,
  height: number,
  depth: number,
  segments: number,
  roughness = 0.12,
): BufferGeometry {
  const box = new BoxGeometry(width, height, depth, segments, segments * 2, segments);
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');
  const geometry = mergeVertices(box);
  roughen(geometry, noise, Math.min(width, height, depth) * roughness, 0.45);
  return geometry;
}

/** Faceted rock. Non-indexed so every face gets its own normal, which gives the low-poly ink look. */
export function buildRock(noise: Noise, radius: number, detail: number): BufferGeometry {
  const sphere = new IcosahedronGeometry(radius, detail);
  sphere.deleteAttribute('normal');
  sphere.deleteAttribute('uv');
  const geometry = mergeVertices(sphere);
  geometry.scale(1, 0.7, 1);
  roughen(geometry, noise, radius * 0.22, 0.9);
  const faceted = geometry.toNonIndexed();
  faceted.computeVertexNormals();
  return faceted;
}

export interface FloorOptions {
  width: number;
  depth: number;
  segmentsX: number;
  segmentsZ: number;
  /** Z of the floor's center in world space. Noise is sampled in world space, so neighbouring tiles join. */
  centerZ?: number;
  /** Ground within this distance of the center line stays flat, so it matches the collision plane. */
  flatHalfWidth?: number;
}

/**
 * Ground plane in the XZ plane. Noise lifts it away from the flat lane, and the UV layout
 * feeds the mottle texture.
 */
export function buildFloor(noise: Noise, options: FloorOptions): BufferGeometry {
  const { width, depth, segmentsX, segmentsZ, centerZ = 0, flatHalfWidth = 0 } = options;
  const geometry = new PlaneGeometry(width, depth, segmentsX, segmentsZ);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, centerZ);

  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const edge = smoothstep(flatHalfWidth, flatHalfWidth + 5, Math.abs(x));
    position.setY(i, position.getY(i) + noise.fbm(x * 0.12, 0, z * 0.12, 3) * 0.6 * edge);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
