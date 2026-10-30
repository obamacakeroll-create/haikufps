import { CapsuleGeometry, Mesh, MeshBasicMaterial } from 'three';
import { type GhostPose } from '../meta/ghost';
import { BEAUTY_ONLY_LAYER } from './layers';
import { PALETTE } from './palette';

const RADIUS = 0.36;
const LENGTH = 0.9;

/**
 * The best run's ghost: a translucent teal capsule. It is drawn only in the beauty pass, so the ink
 * outlines leave it alone and it reads as something seen through the ink.
 */
export class GhostView {
  readonly mesh: Mesh;
  private readonly material: MeshBasicMaterial;

  constructor() {
    this.material = new MeshBasicMaterial({
      color: PALETTE.teal,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new Mesh(new CapsuleGeometry(RADIUS, LENGTH, 4, 8), this.material);
    this.mesh.layers.set(BEAUTY_ONLY_LAYER);
    this.mesh.visible = false;
  }

  place(pose: GhostPose): void {
    // The pose is at the feet, so lift the capsule to stand on the floor.
    this.mesh.position.set(pose.x, pose.y + RADIUS + LENGTH / 2, pose.z);
    this.mesh.rotation.set(0, pose.yaw, 0);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
