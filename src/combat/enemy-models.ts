import {
  BufferGeometry,
  Color,
  DataTexture,
  InstancedMesh,
  Matrix4,
  MeshToonMaterial,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import { lerp } from '../core/math';
import { type Noise } from '../procgen/noise';
import { buildRock, buildSlab, paintStrata } from '../procgen/geometry';
import { PALETTE } from '../render/palette';
import { createToonMaterial } from '../render/toon';
import { ENEMY_KINDS, ENEMY_STATS, type Enemy, type EnemyKind } from './enemy';

const CAPACITY = 32;
const UP = new Vector3(0, 1, 0);

interface Model {
  readonly mesh: InstancedMesh;
  readonly geometry: BufferGeometry;
  readonly material: MeshToonMaterial;
}

/**
 * One instanced mesh per enemy kind. Each frame the enemies are written into their instances,
 * blended between the last two simulation steps so motion stays smooth at any refresh rate.
 */
export class EnemyModels {
  private readonly models: Readonly<Record<EnemyKind, Model>>;
  private readonly used: Record<EnemyKind, number> = {
    swarmling: 0,
    brute: 0,
    spitter: 0,
    diver: 0,
    mimic: 0,
  };
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly matrix = new Matrix4();
  private readonly tint = new Color();

  constructor(
    private readonly scene: Scene,
    ramp: DataTexture,
    noise: Noise,
  ) {
    const mimicGeometry = buildSlab(noise, 1.6, 3.2, 2.6, 4, 0.05);
    paintStrata(mimicGeometry, PALETTE.strata, noise, 2.6);
    const brute = buildRock(noise, 1.05, 1);
    brute.scale(1, 0.9, 1);
    const spitter = buildRock(noise, 0.7, 1);
    spitter.scale(0.8, 1.5, 0.8);
    const diver = buildRock(noise, 0.8, 0);
    diver.scale(1.4, 0.45, 1.8);

    const colored = (kind: EnemyKind): MeshToonMaterial =>
      createToonMaterial(ramp, { color: ENEMY_STATS[kind].color });

    this.models = {
      swarmling: this.model(buildRock(noise, 0.55, 0), colored('swarmling')),
      brute: this.model(brute, colored('brute')),
      spitter: this.model(spitter, colored('spitter')),
      diver: this.model(diver, colored('diver')),
      mimic: this.model(mimicGeometry, createToonMaterial(ramp, { vertexColors: true })),
    };
  }

  /** Writes every living enemy into its instance slot. Call once per frame. */
  write(enemies: readonly Enemy[], alpha: number): void {
    for (const kind of ENEMY_KINDS) this.used[kind] = 0;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const index = this.used[enemy.kind];
      if (index >= CAPACITY) continue;
      this.used[enemy.kind] = index + 1;

      this.position.set(
        lerp(enemy.px, enemy.x, alpha),
        lerp(enemy.py, enemy.y, alpha),
        lerp(enemy.pz, enemy.z, alpha),
      );
      this.quaternion.setFromAxisAngle(UP, Math.atan2(enemy.vx, enemy.vz));
      const swell = enemy.phase === 'windup' ? 1.12 : 1;
      this.scale.setScalar(swell);
      this.matrix.compose(this.position, this.quaternion, this.scale);

      const model = this.models[enemy.kind];
      model.mesh.setMatrixAt(index, this.matrix);
      model.mesh.setColorAt(index, this.tintFor(enemy));
    }

    for (const kind of ENEMY_KINDS) {
      const { mesh } = this.models[kind];
      mesh.count = this.used[kind];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const kind of ENEMY_KINDS) {
      const model = this.models[kind];
      this.scene.remove(model.mesh);
      model.geometry.dispose();
      model.material.dispose();
    }
  }

  /**
   * Multiplies the enemy's color. Hits flash it past the bloom threshold. Windups glow in the color
   * of the threat: vermilion for dives and mimic lunges, teal for spits.
   */
  private tintFor(enemy: Enemy): Color {
    if (enemy.phase === 'windup') {
      switch (enemy.kind) {
        case 'diver':
          return this.tint.setRGB(2.6, 0.9, 0.6);
        case 'spitter':
          return this.tint.setRGB(0.6, 2.4, 2.0);
        case 'mimic':
          return this.tint.setRGB(2.2, 0.8, 0.6);
        default:
          break;
      }
    }
    return this.tint.setScalar(1 + 3 * enemy.flash);
  }

  private model(geometry: BufferGeometry, material: MeshToonMaterial): Model {
    const mesh = new InstancedMesh(geometry, material, CAPACITY);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Color is always written, so the instance color buffer exists from the start.
    for (let i = 0; i < CAPACITY; i++) mesh.setColorAt(i, this.tint.setScalar(1));
    this.scene.add(mesh);
    return { mesh, geometry, material };
  }
}
