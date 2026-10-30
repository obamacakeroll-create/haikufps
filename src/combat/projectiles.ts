import { Color, DataTexture, Mesh, MeshBasicMaterial, MeshToonMaterial, Scene, SphereGeometry } from 'three';
import { type Vec3 } from '../core/math';
import { PALETTE } from '../render/palette';
import { createToonMaterial } from '../render/toon';

export interface Bomb extends Vec3 {
  vx: number;
  vy: number;
  vz: number;
  /** Seconds until the bomb goes off on its own. */
  fuse: number;
  bounces: number;
  readonly mesh: Mesh;
}

export interface Glob extends Vec3 {
  vx: number;
  vy: number;
  vz: number;
  /** Seconds left before the glob breaks up. */
  life: number;
  readonly mesh: Mesh;
}

/** Meshes for thrown bombs and spat globs. Their physics lives in `Combat`. */
export class ProjectileMeshes {
  private readonly bombGeometry = new SphereGeometry(0.22, 12, 8);
  private readonly globGeometry = new SphereGeometry(0.3, 10, 6);
  private readonly bombMaterial: MeshToonMaterial;
  /** Brighter than the bloom threshold, so globs glow. */
  private readonly globMaterial = new MeshBasicMaterial({
    color: new Color(PALETTE.teal).multiplyScalar(4),
    fog: false,
  });

  constructor(
    private readonly scene: Scene,
    ramp: DataTexture,
  ) {
    this.bombMaterial = createToonMaterial(ramp, { color: PALETTE.ink });
  }

  bomb(x: number, y: number, z: number): Mesh {
    const mesh = new Mesh(this.bombGeometry, this.bombMaterial);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    this.scene.add(mesh);
    return mesh;
  }

  glob(x: number, y: number, z: number): Mesh {
    const mesh = new Mesh(this.globGeometry, this.globMaterial);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    return mesh;
  }

  release(mesh: Mesh): void {
    this.scene.remove(mesh);
  }

  dispose(): void {
    this.bombGeometry.dispose();
    this.globGeometry.dispose();
    this.bombMaterial.dispose();
    this.globMaterial.dispose();
  }
}
