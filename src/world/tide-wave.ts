import { Mesh, MeshToonMaterial, PlaneGeometry, type BufferAttribute, type BufferGeometry } from 'three';

const WIDTH = 64;
const HEIGHT = 16;
const SEGMENTS_X = 48;
const SEGMENTS_Y = 4;
/** The wave's base sits this far under the floor, so it never shows a gap at the ground. */
const BASE_Y = -1;

/**
 * The ink tide's front: a dark wall behind the player whose top edge churns. The wave's position is
 * driven by the run each step, so it always sits `gap` meters behind the player.
 */
export class TideWave {
  readonly mesh: Mesh;
  private readonly geometry: BufferGeometry;
  private readonly position: BufferAttribute;
  private readonly topIndices: number[] = [];
  private readonly baseX: number[] = [];
  private readonly baseY: number[] = [];

  constructor(material: MeshToonMaterial) {
    this.geometry = new PlaneGeometry(WIDTH, HEIGHT, SEGMENTS_X, SEGMENTS_Y);
    this.geometry.translate(0, HEIGHT / 2 + BASE_Y, 0);
    this.position = this.geometry.getAttribute('position') as BufferAttribute;

    const topEdge = HEIGHT + BASE_Y;
    for (let i = 0; i < this.position.count; i++) {
      const y = this.position.getY(i);
      this.baseX.push(this.position.getX(i));
      this.baseY.push(y);
      if (y > topEdge - 1e-3) this.topIndices.push(i);
    }

    // The plane faces +z by default. Turn it to face the player, who sits toward -z.
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.rotation.y = Math.PI;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  /** Puts the wave at `z` and moves its crest. */
  update(z: number, time: number): void {
    this.mesh.position.z = z;
    for (const i of this.topIndices) {
      const x = this.baseX[i] ?? 0;
      const ripple =
        Math.sin(x * 0.32 + time * 2.4) * 0.9 +
        Math.sin(x * 0.9 - time * 3.7) * 0.4 +
        Math.sin(x * 0.11 + time * 0.8) * 1.2;
      this.position.setY(i, (this.baseY[i] ?? 0) + ripple);
    }
    this.position.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
