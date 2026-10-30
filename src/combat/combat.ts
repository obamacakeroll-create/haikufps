import { type DataTexture, type Scene, type Texture } from 'three';
import { Emitter } from '../core/events';
import { clamp, type Vec3 } from '../core/math';
import { type Rng } from '../core/rng';
import { Decals } from '../fx/decals';
import { Droplets } from '../fx/droplets';
import { Blasts, Tracers } from '../fx/tracers';
import { type Noise } from '../procgen/noise';
import { Health } from '../player/health';
import { BODY, shove, type Body } from '../player/movement';
import { type Canyon, type LiveSlot } from '../world/canyon';
import { type Box, separateCapsule } from '../world/collision';
import { LANE_HALF, LEDGE_HEIGHT, type SlotKind } from '../world/layout';
import { type ReshapeZone } from '../world/reshape';
import { awakenMimic, HOVER_HEIGHT, stepEnemy, type EnemyWorld } from './behaviors';
import { createEnemy, ENEMY_STATS, type Enemy, type EnemyKind, type EnemySpot } from './enemy';
import { EnemyModels } from './enemy-models';
import { type Bomb, type Glob, ProjectileMeshes } from './projectiles';
import { type Ray, traceShot } from './ray';
import { type SpawnOrder, Spawner } from './spawner';
import { Arsenal, BOMB, type BombWeapon, type HitscanWeapon, type WeaponId } from './weapons';

export interface CombatEvents {
  shot: { weapon: WeaponId };
  /** A shot or blast connected with an enemy. `kill` is true when it was the last hit. */
  hit: { kind: EnemyKind; kill: boolean };
  kill: { kind: EnemyKind; score: number };
  hurt: { amount: number; source: EnemyKind };
  blast: { x: number; y: number; z: number; radius: number };
  /** A dormant mimic showed itself. */
  reveal: { x: number; y: number; z: number };
}

/** The player's intent for one simulation step. */
export interface CombatInput {
  /** Trigger held. Automatic weapons fire on this. */
  readonly fireHeld: boolean;
  /** Trigger pressed this step. Semi-automatic weapons fire on this. */
  readonly firePressed: boolean;
  readonly reloadPressed: boolean;
  /** Index of the weapon to select, or -1 for none. */
  readonly weaponIndex: number;
  /** +1 for the next weapon, -1 for the previous, 0 for none. */
  readonly weaponStep: number;
  readonly aiming: boolean;
  /** Unit aim direction. */
  readonly aimX: number;
  readonly aimY: number;
  readonly aimZ: number;
}

export interface CombatAssets {
  readonly ramp: DataTexture;
  readonly splat: Texture;
}

const EYE = BODY.eyeHeight;
const PLAYER_CENTER = BODY.height / 2;
const UP: Vec3 = { x: 0, y: 1, z: 0 };
const BOMB_GRAVITY = 22;
const BOMB_RADIUS = 0.22;
const BOMB_BOUNCE = 0.45;
const BOMB_MAX_BOUNCES = 4;
const GLOB_SPEED = 15;
const GLOB_LIFE = 3.5;
const GLOB_DAMAGE = 14;
const GLOB_RANGE = 0.9;
const GLOB_RADIUS = 0.3;
/** Enemies further than this behind the player are dropped. */
const DESPAWN_BEHIND = 25;
/** Hitstop: a few frames of frozen enemies on each kind of impact. */
const HITSTOP_HIT = 0.02;
const HITSTOP_KILL = 0.06;
const HITSTOP_BLAST = 0.03;
/** Fraction of rifle shots that leave a wall splat. Rifle fire is fast, so splats would pile up. */
const RIFLE_SPLAT_CHANCE = 0.35;

/**
 * Weapons, enemies, projectiles, and the feedback around them. It reads the body and canyon from
 * the run, and reports what happened through `events`.
 */
export class Combat {
  readonly events = new Emitter<CombatEvents>();
  readonly arsenal = new Arsenal();
  /** Enemies the player killed this run. Enemies that spend themselves on the player do not count. */
  kills = 0;
  private readonly rng: Rng;
  private readonly spawner: Spawner;
  private readonly models: EnemyModels;
  private readonly projectiles: ProjectileMeshes;
  private readonly droplets: Droplets;
  private readonly decals: Decals;
  private readonly tracers: Tracers;
  private readonly blasts: Blasts;
  private readonly roster: Enemy[] = [];
  private readonly bombs: Bomb[] = [];
  private readonly globs: Glob[] = [];
  private readonly boxes: Box[] = [];
  private readonly slots: LiveSlot[] = [];
  private readonly world: EnemyWorld;
  /** Simulated seconds, which pause during hitstop. Spawn timing follows it. */
  private clock = 0;
  private hitstop = 0;

  constructor(
    scene: Scene,
    private readonly canyon: Canyon,
    private readonly body: Body,
    private readonly health: Health,
    noise: Noise,
    rng: Rng,
    assets: CombatAssets,
  ) {
    this.rng = rng;
    this.spawner = new Spawner(rng.fork(0x51));
    this.models = new EnemyModels(scene, assets.ramp, noise);
    this.projectiles = new ProjectileMeshes(scene, assets.ramp);
    this.droplets = new Droplets(scene, assets.ramp);
    this.decals = new Decals(scene, assets.splat);
    this.tracers = new Tracers(scene);
    this.blasts = new Blasts(scene);
    this.world = {
      player: body,
      rng,
      hurt: (amount, source) => this.hurtPlayer(amount, source),
      shove: (x, y, z) => shove(body, x, y, z),
      spit: (from, to) => this.spit(from, to),
      detonate: (enemy) => this.detonate(enemy),
      awaken: (enemy) => this.awaken(enemy),
    };
  }

  get enemyCount(): number {
    return this.roster.length;
  }

  /** The living and recently dead enemies, in spawn order. Read-only. */
  get enemies(): readonly Enemy[] {
    return this.roster;
  }

  /** Adds an enemy at `spot`. The spawner uses it, and tests use it to set up an arrangement. */
  spawn(kind: EnemyKind, spot: EnemySpot): Enemy {
    const enemy = createEnemy(kind, this.rng.next() * 1000, spot);
    this.roster.push(enemy);
    return enemy;
  }

  update(dt: number, input: CombatInput): void {
    this.droplets.update(dt);
    this.decals.update(dt);
    this.tracers.update(dt);
    this.blasts.update(dt);
    this.hitstop = Math.max(0, this.hitstop - dt);
    this.handleWeapons(dt, input);

    // Hitstop freezes enemies and projectiles for a few frames, so impacts land with weight.
    // The player keeps moving through it.
    if (this.hitstop > 0) return;
    this.clock += dt;
    this.spawnDue(dt);
    this.stepEnemies(dt);
    this.stepBombs(dt);
    this.stepGlobs(dt);
  }

  /** A reshape moved this zone, so any mimic inside it shows itself. */
  reveal(zone: ReshapeZone): void {
    const half = zone.depth / 2;
    for (const enemy of this.roster) {
      if (enemy.alive && enemy.phase === 'dormant' && Math.abs(enemy.z - zone.center) <= half) {
        this.awaken(enemy);
      }
    }
  }

  /** Render side: writes enemies into the GPU, blended between the last two simulation steps. */
  present(alpha: number): void {
    this.models.write(this.roster, alpha);
  }

  dispose(): void {
    for (const bomb of this.bombs) this.projectiles.release(bomb.mesh);
    for (const glob of this.globs) this.projectiles.release(glob.mesh);
    this.bombs.length = 0;
    this.globs.length = 0;
    this.roster.length = 0;
    this.models.dispose();
    this.projectiles.dispose();
    this.droplets.dispose();
    this.decals.dispose();
    this.tracers.dispose();
    this.blasts.dispose();
  }

  private handleWeapons(dt: number, input: CombatInput): void {
    this.arsenal.update(dt);
    if (input.weaponIndex >= 0) this.arsenal.select(input.weaponIndex);
    else if (input.weaponStep !== 0) this.arsenal.cycle(input.weaponStep > 0 ? 1 : -1);
    if (input.reloadPressed) this.arsenal.reload();

    const trigger = this.arsenal.weapon.automatic ? input.fireHeld : input.firePressed;
    if (trigger) this.fire(input);
  }

  private fire(input: CombatInput): void {
    const weapon = this.arsenal.weapon;
    if (!this.arsenal.fire()) return;
    this.events.emit('shot', { weapon: weapon.id });

    const eye: Vec3 = { x: this.body.x, y: this.body.y + EYE, z: this.body.z };
    const aim: Vec3 = { x: input.aimX, y: input.aimY, z: input.aimZ };
    if (weapon.kind === 'bomb') {
      this.throwBomb(weapon, eye, aim);
      return;
    }

    this.firePellets(weapon, eye, aim, input.aiming);
    // Recoil shoves the player back along the aim. Long bursts cost ground the tide can use.
    const flat = Math.max(Math.hypot(aim.x, aim.z), 0.3);
    shove(this.body, (-aim.x / flat) * weapon.recoil, 0, (-aim.z / flat) * weapon.recoil);
  }

  private firePellets(weapon: HitscanWeapon, eye: Vec3, aim: Vec3, aiming: boolean): void {
    const spread = aiming ? weapon.adsSpread : weapon.hipSpread;
    const boxes = this.canyon.boxesNear(eye.z - weapon.range / 2, weapon.range / 2 + 2, this.boxes);
    for (let pellet = 0; pellet < weapon.pellets; pellet++) {
      const dir = spreadDirection(aim, spread, this.rng);
      const ray: Ray = { x: eye.x, y: eye.y, z: eye.z, dx: dir.x, dy: dir.y, dz: dir.z };
      const trace = traceShot(ray, weapon.range, boxes, this.roster);
      const end: Vec3 = {
        x: eye.x + dir.x * trace.distance,
        y: eye.y + dir.y * trace.distance,
        z: eye.z + dir.z * trace.distance,
      };
      const muzzle: Vec3 = { x: eye.x + dir.x * 0.6, y: eye.y + dir.y * 0.6, z: eye.z + dir.z * 0.6 };
      this.tracers.trace(muzzle, end);

      if (trace.enemy !== undefined) {
        const scale = weapon.id === 'rifle' ? ENEMY_STATS[trace.enemy.kind].rifleScale : 1;
        this.damageEnemy(trace.enemy, weapon.damage * scale, end);
      } else if (trace.wall !== undefined) {
        const rifleSkips = weapon.id === 'rifle' && !this.rng.chance(RIFLE_SPLAT_CHANCE);
        if (!rifleSkips) {
          const normal = { x: trace.wall.nx, y: trace.wall.ny, z: trace.wall.nz };
          this.decals.stamp(end, normal, this.rng.range(0.35, 0.7), this.rng);
        }
      }
    }
  }

  private throwBomb(weapon: BombWeapon, eye: Vec3, aim: Vec3): void {
    const x = eye.x + aim.x * 0.8;
    const y = eye.y + aim.y * 0.8;
    const z = eye.z + aim.z * 0.8;
    this.bombs.push({
      x,
      y,
      z,
      vx: aim.x * weapon.speed,
      // A small lob, so bombs drop a little and rarely go straight into the floor.
      vy: aim.y * weapon.speed + 2,
      vz: aim.z * weapon.speed,
      fuse: weapon.fuseSeconds,
      bounces: 0,
      mesh: this.projectiles.bomb(x, y, z),
    });
  }

  private damageEnemy(enemy: Enemy, amount: number, point: Vec3): void {
    if (!enemy.alive) return;
    const stats = ENEMY_STATS[enemy.kind];
    enemy.hp -= amount;
    enemy.flash = 1;
    if (enemy.kind === 'mimic') this.awaken(enemy);

    if (enemy.hp > 0) {
      this.droplets.burst(point, stats.color, 5, 3, this.rng);
      this.hitstop = Math.max(this.hitstop, HITSTOP_HIT);
      this.events.emit('hit', { kind: enemy.kind, kill: false });
      return;
    }

    enemy.alive = false;
    this.kills++;
    this.droplets.burst(point, stats.color, 22, 8, this.rng);
    this.decals.stamp({ x: enemy.x, y: 0, z: enemy.z }, UP, 1.1, this.rng);
    this.hitstop = Math.max(this.hitstop, HITSTOP_KILL);
    this.events.emit('hit', { kind: enemy.kind, kill: true });
    this.events.emit('kill', { kind: enemy.kind, score: stats.score });
  }

  private awaken(enemy: Enemy): void {
    if (!awakenMimic(enemy)) return;
    this.events.emit('reveal', { x: enemy.x, y: enemy.y, z: enemy.z });
  }

  private hurtPlayer(amount: number, source: EnemyKind): void {
    this.health.damage(amount);
    this.events.emit('hurt', { amount, source });
  }

  private detonate(enemy: Enemy): void {
    enemy.alive = false;
    this.droplets.burst(enemy, ENEMY_STATS[enemy.kind].color, 12, 6, this.rng);
    this.hitstop = Math.max(this.hitstop, HITSTOP_HIT);
  }

  private spit(from: Vec3, to: Vec3): void {
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) || 1;
    const vx = ((to.x - from.x) / length) * GLOB_SPEED;
    const vy = ((to.y - from.y) / length) * GLOB_SPEED;
    const vz = ((to.z - from.z) / length) * GLOB_SPEED;
    this.globs.push({
      x: from.x,
      y: from.y,
      z: from.z,
      vx,
      vy,
      vz,
      life: GLOB_LIFE,
      mesh: this.projectiles.glob(from.x, from.y, from.z),
    });
  }

  private spawnDue(dt: number): void {
    const order: SpawnOrder | undefined = this.spawner.update(dt, this.clock, this.roster.length);
    if (order === undefined) return;
    for (let i = 0; i < order.count; i++) {
      const spot = this.spotFor(order.kind, i);
      if (spot !== undefined) this.spawn(order.kind, spot);
    }
  }

  /** Where a new enemy of this kind appears, ahead of the player. Undefined when there is no room for it. */
  private spotFor(kind: EnemyKind, index: number): EnemySpot | undefined {
    const { body, rng } = this;
    const radius = ENEMY_STATS[kind].radius;
    switch (kind) {
      case 'swarmling':
        return {
          x: rng.range(-3.5, 3.5),
          y: rng.range(1.2, 2.6),
          z: body.z - rng.range(42, 56) - index * 1.5,
          perch: undefined,
        };
      case 'brute':
        return { x: rng.range(-2.5, 2.5), y: radius, z: body.z - rng.range(46, 62), perch: undefined };
      case 'diver':
        return { x: rng.range(-3, 3), y: HOVER_HEIGHT, z: body.z - rng.range(40, 55), perch: undefined };
      case 'spitter': {
        const ledge = this.pickSlot('ledge', body.z - 84, body.z - 44);
        if (ledge !== undefined) {
          return {
            x: ledge.x,
            y: ledge.y + LEDGE_HEIGHT / 2 + radius * 0.9,
            z: ledge.slot.z,
            perch: ledge,
          };
        }
        const side = rng.chance(0.5) ? -1 : 1;
        return { x: side * (LANE_HALF - 1.2), y: radius, z: body.z - rng.range(46, 62), perch: undefined };
      }
      case 'mimic': {
        const wall = this.pickSlot('wall', body.z - 70, body.z - 44);
        if (wall === undefined) return undefined;
        const side = wall.x < 0 ? -1 : 1;
        const inner = Math.abs(wall.x) - wall.width / 2;
        return { x: side * (inner + 0.2), y: clamp(wall.y, 1.6, 4), z: wall.slot.z, perch: wall };
      }
    }
  }

  private pickSlot(kind: SlotKind, zFar: number, zNear: number): LiveSlot | undefined {
    const matches = this.canyon.slotsBetween(zFar, zNear, this.slots).filter((live) => live.slot.kind === kind);
    return matches.length > 0 ? this.rng.pick(matches) : undefined;
  }

  private stepEnemies(dt: number): void {
    for (const enemy of this.roster) {
      if (!enemy.alive) continue;
      enemy.px = enemy.x;
      enemy.py = enemy.y;
      enemy.pz = enemy.z;
      stepEnemy(enemy, this.world, dt);
      if (enemy.z > this.body.z + DESPAWN_BEHIND) enemy.alive = false;
    }
    compact(this.roster);
  }

  private stepBombs(dt: number): void {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bomb = this.bombs[i];
      if (bomb === undefined) continue;
      bomb.fuse -= dt;
      bomb.vy -= BOMB_GRAVITY * dt;
      bomb.x += bomb.vx * dt;
      bomb.y += bomb.vy * dt;
      bomb.z += bomb.vz * dt;
      if (bomb.y < BOMB_RADIUS) {
        bomb.y = BOMB_RADIUS;
        if (bomb.vy < 0) bomb.vy = -bomb.vy * BOMB_BOUNCE;
        bomb.vx *= 0.7;
        bomb.vz *= 0.7;
        bomb.bounces++;
      }
      for (const box of this.canyon.boxesNear(bomb.z, 3, this.boxes)) {
        const contact = separateCapsule(bomb, BOMB_RADIUS, BOMB_RADIUS * 2, box);
        if (contact === undefined) continue;
        const into = bomb.vx * contact.nx + bomb.vy * contact.ny + bomb.vz * contact.nz;
        if (into < 0) {
          const push = (1 + BOMB_BOUNCE) * into;
          bomb.vx -= push * contact.nx;
          bomb.vy -= push * contact.ny;
          bomb.vz -= push * contact.nz;
          bomb.bounces++;
        }
      }

      const touching = this.roster.some(
        (enemy) => enemy.alive && distance(bomb, enemy) < BOMB_RADIUS + ENEMY_STATS[enemy.kind].radius + 0.2,
      );
      if (bomb.fuse <= 0 || bomb.bounces >= BOMB_MAX_BOUNCES || touching) {
        this.projectiles.release(bomb.mesh);
        this.bombs.splice(i, 1);
        this.explode(bomb, BOMB);
        continue;
      }
      bomb.mesh.position.set(bomb.x, bomb.y, bomb.z);
    }
  }

  private explode(center: Vec3, weapon: BombWeapon): void {
    this.blasts.flash(center, weapon.blastRadius);
    this.events.emit('blast', { x: center.x, y: center.y, z: center.z, radius: weapon.blastRadius });
    this.hitstop = Math.max(this.hitstop, HITSTOP_BLAST);

    for (const enemy of this.roster) {
      if (!enemy.alive) continue;
      const d = distance(center, enemy);
      if (d > weapon.blastRadius + ENEMY_STATS[enemy.kind].radius) continue;
      this.damageEnemy(enemy, weapon.damage * Math.max(0.35, 1 - d / weapon.blastRadius), center);
    }

    // The blast pushes the player too. A bomb at your feet launches you, which is the jetpack's cousin.
    const dx = this.body.x - center.x;
    const dy = this.body.y + PLAYER_CENTER - center.y;
    const dz = this.body.z - center.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < weapon.blastRadius) {
      const strength = weapon.launch * (1 - d / weapon.blastRadius);
      // Too close to have a direction, so the blast throws the player straight up.
      const near = d > 0.3;
      shove(
        this.body,
        near ? (dx / d) * strength : 0,
        near ? (dy / d) * strength : strength,
        near ? (dz / d) * strength : 0,
      );
    }

    if (center.y < 1.5) this.decals.stamp({ x: center.x, y: 0, z: center.z }, UP, 2.2, this.rng);
  }

  private stepGlobs(dt: number): void {
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const glob = this.globs[i];
      if (glob === undefined) continue;
      glob.life -= dt;
      glob.x += glob.vx * dt;
      glob.y += glob.vy * dt;
      glob.z += glob.vz * dt;
      glob.mesh.position.set(glob.x, glob.y, glob.z);

      const center: Vec3 = { x: this.body.x, y: this.body.y + PLAYER_CENTER, z: this.body.z };
      let gone = glob.life <= 0;
      if (!gone && distance(glob, center) < GLOB_RANGE) {
        this.hurtPlayer(GLOB_DAMAGE, 'spitter');
        gone = true;
      }
      if (!gone) gone = this.hitsWall(glob);
      if (gone) {
        this.projectiles.release(glob.mesh);
        this.globs.splice(i, 1);
      }
    }
  }

  private hitsWall(point: Vec3): boolean {
    for (const box of this.canyon.boxesNear(point.z, 1, this.boxes)) {
      if (separateCapsule(point, GLOB_RADIUS, GLOB_RADIUS * 2, box) !== undefined) return true;
    }
    return false;
  }
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Drops dead entries in place, keeping the order of the living ones. */
function compact<T extends { readonly alive: boolean }>(items: T[]): void {
  let write = 0;
  for (const item of items) {
    if (item.alive) items[write++] = item;
  }
  items.length = write;
}

/** A random direction within `spread` radians of `aim`, uniform over the cone's cross-section. */
function spreadDirection(aim: Vec3, spread: number, rng: Rng): Vec3 {
  // Two axes across the aim, so the spread is round rather than square.
  const side = Math.hypot(aim.x, aim.z);
  const rx = side > 1e-6 ? -aim.z / side : 1;
  const rz = side > 1e-6 ? aim.x / side : 0;
  const ux = -rz * aim.y;
  const uy = rz * aim.x - rx * aim.z;
  const uz = rx * aim.y;

  const angle = rng.range(0, Math.PI * 2);
  const radius = Math.sqrt(rng.next()) * spread;
  const c = Math.cos(angle) * radius;
  const s = Math.sin(angle) * radius;
  const x = aim.x + rx * c + ux * s;
  const y = aim.y + uy * s;
  const z = aim.z + rz * c + uz * s;
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}
