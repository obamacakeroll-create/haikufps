import {
  Color,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { type Vec3 } from '../core/math';
import { PALETTE } from '../render/palette';
import { BEAUTY_ONLY_LAYER } from '../render/layers';

const TRACER_COUNT = 24;
const TRACER_LIFE = 0.09;
const TRACER_RADIUS = 0.035;
const UP = new Vector3(0, 1, 0);
/** Multiplied past the bloom threshold, so tracers glow. */
const TRACER_GLOW = 4;

/** Thin glowing shot trails. Each one thins out over its short life. */
export class Tracers {
  private readonly meshes: Mesh[] = [];
  private readonly lives: number[] = [];
  private readonly lengths: number[] = [];
  private readonly geometry = new CylinderGeometry(1, 1, 1, 5);
  private readonly material = new MeshBasicMaterial({
    color: new Color(PALETTE.teal).multiplyScalar(TRACER_GLOW),
    fog: false,
  });
  private readonly direction = new Vector3();
  private cursor = 0;

  constructor(private readonly scene: Scene) {
    for (let i = 0; i < TRACER_COUNT; i++) {
      const mesh = new Mesh(this.geometry, this.material);
      mesh.layers.set(BEAUTY_ONLY_LAYER);
      mesh.castShadow = false;
      mesh.visible = false;
      scene.add(mesh);
      this.meshes.push(mesh);
      this.lives.push(0);
      this.lengths.push(0);
    }
  }

  trace(from: Vec3, to: Vec3): void {
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (length < 1e-3) return;
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % TRACER_COUNT;
    const mesh = this.meshes[index];
    if (mesh === undefined) return;
    mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    this.direction.set(to.x - from.x, to.y - from.y, to.z - from.z).divideScalar(length);
    mesh.quaternion.setFromUnitVectors(UP, this.direction);
    mesh.scale.set(TRACER_RADIUS, length, TRACER_RADIUS);
    this.lengths[index] = length;
    this.lives[index] = TRACER_LIFE;
    mesh.visible = true;
  }

  update(dt: number): void {
    for (let i = 0; i < TRACER_COUNT; i++) {
      const life = this.lives[i] ?? 0;
      if (life <= 0) continue;
      const mesh = this.meshes[i];
      if (mesh === undefined) continue;
      const remaining = life - dt;
      this.lives[i] = remaining;
      if (remaining <= 0) {
        mesh.visible = false;
        continue;
      }
      const radius = TRACER_RADIUS * (remaining / TRACER_LIFE);
      mesh.scale.set(radius, this.lengths[i] ?? 0, radius);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

const BLAST_COUNT = 4;
const BLAST_LIFE = 0.28;
/** Vermilion past the bloom threshold, so blasts flare. */
const BLAST_GLOW = 3;

/** Expanding flashes at bomb blasts. */
export class Blasts {
  private readonly meshes: Mesh[] = [];
  private readonly lives: number[] = [];
  private readonly radii: number[] = [];
  private readonly geometry = new SphereGeometry(1, 16, 12);
  private readonly material = new MeshBasicMaterial({
    color: new Color(PALETTE.vermilion).multiplyScalar(BLAST_GLOW),
    fog: false,
  });
  private cursor = 0;

  constructor(private readonly scene: Scene) {
    for (let i = 0; i < BLAST_COUNT; i++) {
      const mesh = new Mesh(this.geometry, this.material);
      mesh.layers.set(BEAUTY_ONLY_LAYER);
      mesh.castShadow = false;
      mesh.visible = false;
      scene.add(mesh);
      this.meshes.push(mesh);
      this.lives.push(0);
      this.radii.push(0);
    }
  }

  flash(center: Vec3, radius: number): void {
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % BLAST_COUNT;
    const mesh = this.meshes[index];
    if (mesh === undefined) return;
    mesh.position.set(center.x, center.y, center.z);
    this.radii[index] = radius;
    this.lives[index] = BLAST_LIFE;
    mesh.visible = true;
  }

  update(dt: number): void {
    for (let i = 0; i < BLAST_COUNT; i++) {
      const life = this.lives[i] ?? 0;
      const mesh = this.meshes[i];
      if (life <= 0 || mesh === undefined) continue;
      const remaining = life - dt;
      this.lives[i] = remaining;
      if (remaining <= 0) {
        mesh.visible = false;
        continue;
      }
      // Grows quickly, then thins as it fades.
      const t = 1 - remaining / BLAST_LIFE;
      const grow = 1 - Math.pow(1 - Math.min(1, t * 1.6), 3);
      const size = (this.radii[i] ?? 0) * grow * (1 - 0.6 * t);
      mesh.scale.setScalar(Math.max(0.01, size));
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
