import {
  Color,
  DataTexture,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import { type Rng } from '../core/rng';
import { type Vec3 } from '../core/math';
import { createToonMaterial } from '../render/toon';

const CAPACITY = 240;
const GRAVITY = 18;
const DRAG = 2.2;
const WHITE = new Color(1, 1, 1);

interface Drop {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  span: number;
  size: number;
}

/** Ink droplets thrown off by hits and kills. A fixed pool, so bursts never allocate. */
export class Droplets {
  private readonly mesh: InstancedMesh;
  private readonly drops: Drop[] = [];
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly matrix = new Matrix4();
  private cursor = 0;

  constructor(scene: Scene, ramp: DataTexture) {
    const geometry = new IcosahedronGeometry(0.1, 0);
    const material = createToonMaterial(ramp);
    this.mesh = new InstancedMesh(geometry, material, CAPACITY);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    for (let i = 0; i < CAPACITY; i++) {
      this.drops.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, span: 1, size: 0 });
      this.mesh.setColorAt(i, WHITE);
    }
  }

  burst(origin: Vec3, color: Color, count: number, speed: number, rng: Rng): void {
    for (let n = 0; n < count; n++) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % CAPACITY;
      const drop = this.drops[index];
      if (drop === undefined) continue;
      const angle = rng.range(0, Math.PI * 2);
      const power = rng.range(0.4, 1) * speed;
      drop.x = origin.x;
      drop.y = origin.y;
      drop.z = origin.z;
      drop.vx = Math.cos(angle) * power;
      drop.vy = rng.range(0.5, 1.2) * speed;
      drop.vz = Math.sin(angle) * power;
      drop.span = rng.range(0.35, 0.7);
      drop.life = drop.span;
      drop.size = rng.range(0.8, 1.6);
      this.mesh.setColorAt(index, color);
    }
    if (this.mesh.instanceColor !== null) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    const drag = Math.exp(-DRAG * dt);
    for (let i = 0; i < CAPACITY; i++) {
      const drop = this.drops[i];
      if (drop === undefined) continue;
      if (drop.life > 0) {
        drop.life -= dt;
        drop.vy -= GRAVITY * dt;
        drop.vx *= drag;
        drop.vz *= drag;
        drop.x += drop.vx * dt;
        drop.y += drop.vy * dt;
        drop.z += drop.vz * dt;
        if (drop.y < 0.05) {
          drop.y = 0.05;
          drop.vy = -drop.vy * 0.3;
          drop.vx *= 0.5;
          drop.vz *= 0.5;
        }
      }
      const size = drop.life > 0 ? drop.size * Math.sqrt(drop.life / drop.span) : 0;
      this.position.set(drop.x, drop.y, drop.z);
      this.scale.setScalar(size);
      this.matrix.compose(this.position, this.quaternion, this.scale);
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
