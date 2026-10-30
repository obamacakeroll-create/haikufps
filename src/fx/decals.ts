import {
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  Texture,
  Vector3,
} from 'three';
import { type Rng } from '../core/rng';
import { type Vec3 } from '../core/math';
import { PALETTE } from '../render/palette';
import { BEAUTY_ONLY_LAYER } from '../render/layers';

const CAPACITY = 64;
/** Seconds a splat stays fully inked before it fades. */
const HOLD = 9;
const FADE = 1.2;
const LIFT = 0.02;
const FORWARD = new Vector3(0, 0, 1);

interface Splat {
  readonly position: Vector3;
  readonly orientation: Quaternion;
  size: number;
  life: number;
}

/**
 * Ink splats on walls and the floor. They are drawn only in the beauty pass, so they stay flat
 * color rather than picking up outlines.
 */
export class Decals {
  private readonly mesh: InstancedMesh;
  private readonly splats: Splat[] = [];
  private readonly matrix = new Matrix4();
  private readonly scale = new Vector3();
  private readonly spin = new Quaternion();
  private readonly normal = new Vector3();
  private cursor = 0;

  constructor(scene: Scene, splat: Texture) {
    const geometry = new PlaneGeometry(1, 1);
    const material = new MeshBasicMaterial({
      map: splat,
      color: PALETTE.ink,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      fog: false,
    });
    this.mesh = new InstancedMesh(geometry, material, CAPACITY);
    this.mesh.layers.set(BEAUTY_ONLY_LAYER);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
    for (let i = 0; i < CAPACITY; i++) {
      this.splats.push({ position: new Vector3(), orientation: new Quaternion(), size: 0, life: 0 });
      this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0));
    }
  }

  /** Stamps a splat on a surface. `normal` is the surface's outward direction. */
  stamp(point: Vec3, normal: Vec3, size: number, rng: Rng): void {
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % CAPACITY;
    const splat = this.splats[index];
    if (splat === undefined) return;
    splat.position.set(point.x + normal.x * LIFT, point.y + normal.y * LIFT, point.z + normal.z * LIFT);
    this.normal.set(normal.x, normal.y, normal.z).normalize();
    splat.orientation.setFromUnitVectors(FORWARD, this.normal);
    splat.orientation.multiply(this.spin.setFromAxisAngle(FORWARD, rng.range(0, Math.PI * 2)));
    splat.size = size * rng.range(0.8, 1.2);
    splat.life = HOLD + FADE;
  }

  update(dt: number): void {
    for (let i = 0; i < CAPACITY; i++) {
      const splat = this.splats[i];
      if (splat === undefined) continue;
      if (splat.life > 0) splat.life = Math.max(0, splat.life - dt);
      const fade = Math.min(1, splat.life / FADE);
      this.scale.setScalar(splat.life > 0 ? splat.size * fade : 0);
      this.matrix.compose(splat.position, splat.orientation, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as { dispose(): void }).dispose();
  }
}
