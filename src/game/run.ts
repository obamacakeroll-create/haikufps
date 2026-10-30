import { DataTexture, DoubleSide, MeshToonMaterial, Scene, Texture } from 'three';
import { createNoise } from '../procgen/noise';
import { PALETTE } from '../render/palette';
import { createToonMaterial } from '../render/toon';
import { createBody, stepBody, type Body, type Intent } from '../player/movement';
import { type Box } from '../world/collision';
import { Canyon } from '../world/canyon';
import { TideWave } from '../world/tide-wave';
import { paceAt } from './pace';
import { stepGap, TIDE } from './tide';

export interface RunAssets {
  ramp: DataTexture;
  mottle: Texture;
}

export type RunStatus = 'running' | 'over';

/** Radius around the player in which canyon colliders are gathered. Covers one dash step with margin. */
const COLLIDE_RADIUS = 3;
/** How quickly the measured forward speed follows the real speed, per second. */
const SPEED_SMOOTHING = 8;

/**
 * One endless run: the player, the canyon they run through, and the tide that chases them.
 * The seed fixes the canyon, so a run can be replayed exactly later.
 */
export class Run {
  readonly body: Body = createBody(0, 0, 0);
  private readonly canyon: Canyon;
  private readonly wave: TideWave;
  private readonly waveMaterial: MeshToonMaterial;
  private readonly boxes: Box[] = [];
  private previousZ = 0;
  private forwardSpeedValue = 0;
  private gapValue: number = TIDE.startGap;
  private distanceValue = 0;
  private timeValue = 0;
  private statusValue: RunStatus = 'running';

  constructor(
    private readonly scene: Scene,
    assets: RunAssets,
    seed: number,
  ) {
    this.canyon = new Canyon(scene, seed, createNoise(seed), assets);
    this.canyon.update(this.body.z);

    this.waveMaterial = createToonMaterial(assets.ramp, { color: PALETTE.ink });
    this.waveMaterial.side = DoubleSide;
    this.wave = new TideWave(this.waveMaterial);
    this.wave.update(this.body.z + this.gapValue, 0);
    scene.add(this.wave.mesh);
  }

  get status(): RunStatus {
    return this.statusValue;
  }

  /** Meters run so far. Taken from the farthest point reached, so backtracking does not lower it. */
  get distance(): number {
    return this.distanceValue;
  }

  /** Meters between the tide and the player. Zero ends the run. */
  get gap(): number {
    return this.gapValue;
  }

  /** Forward speed in meters per second, smoothed. */
  get forwardSpeed(): number {
    return this.forwardSpeedValue;
  }

  /** Seconds of simulated run time. */
  get time(): number {
    return this.timeValue;
  }

  get pace(): number {
    return paceAt(this.timeValue);
  }

  get loadedSections(): number {
    return this.canyon.loadedSections;
  }

  update(dt: number, intent: Intent): void {
    if (this.statusValue !== 'running') return;
    this.timeValue += dt;

    stepBody(this.body, intent, dt, this.canyon.boxesNear(this.body.z, COLLIDE_RADIUS, this.boxes));

    const instantSpeed = (this.previousZ - this.body.z) / dt;
    this.previousZ = this.body.z;
    this.forwardSpeedValue += (instantSpeed - this.forwardSpeedValue) * (1 - Math.exp(-SPEED_SMOOTHING * dt));
    this.distanceValue = Math.max(this.distanceValue, -this.body.z);

    if (this.timeValue > TIDE.graceSeconds) {
      this.gapValue = stepGap(this.gapValue, this.forwardSpeedValue, paceAt(this.timeValue), dt);
    }
    this.canyon.update(this.body.z);
    this.wave.update(this.body.z + this.gapValue, this.timeValue);

    if (this.gapValue <= 0) this.statusValue = 'over';
  }

  dispose(): void {
    this.scene.remove(this.wave.mesh);
    this.wave.dispose();
    this.waveMaterial.dispose();
    this.canyon.dispose();
  }
}
