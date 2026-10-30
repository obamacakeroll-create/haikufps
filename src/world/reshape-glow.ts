import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { PALETTE } from '../render/palette';
import { BEAUTY_ONLY_LAYER } from '../render/layers';
import { type ReshapePhase, type ReshapeZone } from './reshape';

const WIDTH = 22;
/** Glow sits just above the floor so it never z-fights with it. */
const HEIGHT = 0.04;
const PULSE_RATE = 18;

/**
 * The telegraph for a reshape: a teal strip across the lane that marks the zone before it moves.
 * It is drawn only in the beauty pass, so the ink outlines leave it alone.
 */
export class ReshapeGlow {
  readonly mesh: Mesh;
  private readonly material: MeshBasicMaterial;

  constructor() {
    const geometry = new PlaneGeometry(WIDTH, 1);
    geometry.rotateX(-Math.PI / 2);
    this.material = new MeshBasicMaterial({
      color: PALETTE.teal,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.layers.set(BEAUTY_ONLY_LAYER);
    this.mesh.visible = false;
  }

  show(zone: ReshapeZone): void {
    this.mesh.position.set(0, HEIGHT, zone.center);
    this.mesh.scale.set(1, 1, zone.depth);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  /** Pulses while the zone is telegraphed and fades as it moves. Reduced motion holds it steady. */
  update(phase: ReshapePhase, progress: number, time: number, reducedMotion: boolean): void {
    if (phase === 'telegraph') {
      const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * PULSE_RATE);
      this.material.opacity = 0.35 + 0.35 * pulse;
    } else if (phase === 'moving') {
      this.material.opacity = 0.5 * (1 - progress);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
