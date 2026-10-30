import { DataTexture, DoubleSide, MeshToonMaterial, Scene, Texture } from 'three';
import { createRng } from '../core/rng';
import { createNoise } from '../procgen/noise';
import { PALETTE } from '../render/palette';
import { createToonMaterial } from '../render/toon';
import { Combat, type CombatInput } from '../combat/combat';
import { Health } from '../player/health';
import { createBody, stepBody, type Body, type Intent } from '../player/movement';
import { type Box } from '../world/collision';
import { Canyon } from '../world/canyon';
import { DEFAULT_LOADOUT, type Loadout } from '../meta/progress';
import { Reshaper, type ReshapePhase } from '../world/reshape';
import { ReshapeGlow } from '../world/reshape-glow';
import { TideWave } from '../world/tide-wave';
import { paceAt } from './pace';
import { stepGap, TIDE } from './tide';

export interface RunAssets {
  ramp: DataTexture;
  mottle: Texture;
  splat: Texture;
}

export type RunStatus = 'running' | 'over';
/** Why a run ended: the tide reached the player, or enemies wore their health down. */
export type RunCause = 'tide' | 'overrun';

/** One simulation step of player input: movement and combat. */
export type RunInput = Intent & CombatInput;

/** Radius around the player in which canyon colliders are gathered. Covers one dash step with margin. */
const COLLIDE_RADIUS = 3;
/** How quickly the measured forward speed follows the real speed, per second. */
const SPEED_SMOOTHING = 8;

/**
 * One endless run: the player, the canyon they run through, the tide that chases them, and the
 * enemies that try to stop them. The seed fixes the canyon and the spawns, so a run can be replayed.
 */
export class Run {
  readonly body: Body = createBody(0, 0, 0);
  private readonly canyon: Canyon;
  private readonly wave: TideWave;
  private readonly waveMaterial: MeshToonMaterial;
  private readonly glow: ReshapeGlow;
  /** Subscribe to `reshaper.events` to react to telegraphs and moves, such as rumble or HUD warnings. */
  readonly reshaper: Reshaper;
  readonly health = new Health();
  readonly combat: Combat;
  private readonly boxes: Box[] = [];
  private previousZ = 0;
  private forwardSpeedValue = 0;
  private gapValue: number = TIDE.startGap;
  private distanceValue = 0;
  private timeValue = 0;
  private statusValue: RunStatus = 'running';
  private causeValue: RunCause | undefined;

  constructor(
    private readonly scene: Scene,
    assets: RunAssets,
    readonly seed: number,
    loadout: Loadout = DEFAULT_LOADOUT,
  ) {
    this.body.fuelBurn = 1 / loadout.fuelScale;
    this.canyon = new Canyon(scene, seed, createNoise(seed), assets);
    this.canyon.update(this.body.z);

    this.waveMaterial = createToonMaterial(assets.ramp, { color: PALETTE.ink });
    this.waveMaterial.side = DoubleSide;
    this.wave = new TideWave(this.waveMaterial);
    this.wave.update(this.body.z + this.gapValue, 0);
    scene.add(this.wave.mesh);

    this.reshaper = new Reshaper(createRng(seed ^ 0x3a7c91));
    this.glow = new ReshapeGlow();
    scene.add(this.glow.mesh);
    this.reshaper.events.on('telegraph', (zone) => this.glow.show(zone));
    this.reshaper.events.on('settle', () => this.glow.hide());

    this.combat = new Combat(
      scene,
      this.canyon,
      this.body,
      this.health,
      createNoise(seed ^ 0x51ab),
      createRng(seed ^ 0x2f1d),
      { ramp: assets.ramp, splat: assets.splat },
      loadout,
    );
    // A reshape that moves a mimic's zone shows it, so the player learns that walls can hide enemies.
    this.reshaper.events.on('move', ({ zone }) => this.combat.reveal(zone));
  }

  get reshapePhase(): ReshapePhase {
    return this.reshaper.phase;
  }

  get status(): RunStatus {
    return this.statusValue;
  }

  /** Set once the run is over. */
  get cause(): RunCause | undefined {
    return this.causeValue;
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

  update(dt: number, input: RunInput): void {
    if (this.statusValue !== 'running') return;
    this.timeValue += dt;

    stepBody(this.body, input, dt, this.canyon.boxesNear(this.body.z, COLLIDE_RADIUS, this.boxes));
    this.health.update(dt);

    const instantSpeed = (this.previousZ - this.body.z) / dt;
    this.previousZ = this.body.z;
    this.forwardSpeedValue += (instantSpeed - this.forwardSpeedValue) * (1 - Math.exp(-SPEED_SMOOTHING * dt));
    this.distanceValue = Math.max(this.distanceValue, -this.body.z);

    if (this.timeValue > TIDE.graceSeconds) {
      this.gapValue = stepGap(this.gapValue, this.forwardSpeedValue, paceAt(this.timeValue), dt);
    }
    this.canyon.update(this.body.z);
    this.reshaper.update(dt, this.timeValue, this.body.z, this.canyon);
    this.wave.update(this.body.z + this.gapValue, this.timeValue);
    this.combat.update(dt, input);

    if (this.gapValue <= 0) this.end('tide');
    else if (this.health.dead) this.end('overrun');
  }

  /** Fills `out` with the colliders near the player. Exposed for tests and debugging. */
  collidersNear(out: Box[]): Box[] {
    return this.canyon.boxesNear(this.body.z, COLLIDE_RADIUS, out);
  }

  /**
   * Render-side work: pulses the telegraph, writes moved slots and enemies to the GPU. `alpha` is how
   * far the render sits between the last two simulation steps. Call once per frame.
   */
  present(alpha: number, reducedMotion: boolean): void {
    this.glow.update(this.reshaper.phase, this.reshaper.progress, this.timeValue, reducedMotion);
    this.canyon.flush();
    this.combat.present(alpha);
  }

  dispose(): void {
    this.combat.dispose();
    this.scene.remove(this.wave.mesh);
    this.wave.dispose();
    this.waveMaterial.dispose();
    this.scene.remove(this.glow.mesh);
    this.glow.dispose();
    this.canyon.dispose();
  }

  private end(cause: RunCause): void {
    this.statusValue = 'over';
    this.causeValue = cause;
  }
}
