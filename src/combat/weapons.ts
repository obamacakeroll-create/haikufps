export type WeaponId = 'rifle' | 'scatter' | 'bomb';

interface WeaponBase {
  readonly id: WeaponId;
  readonly name: string;
  /** Rounds in one magazine. The reserve is unlimited, so reloading is the cost. */
  readonly magazine: number;
  readonly reloadSeconds: number;
  /** Seconds between trigger pulls. */
  readonly fireInterval: number;
  /** Fires every frame the trigger is held. Otherwise each press fires once. */
  readonly automatic: boolean;
}

export interface HitscanWeapon extends WeaponBase {
  readonly kind: 'hitscan';
  readonly pellets: number;
  readonly damage: number;
  readonly range: number;
  /** Half-angle, in radians, of the cone each pellet is scattered through. */
  readonly hipSpread: number;
  readonly adsSpread: number;
  /** Meters per second of shove the shot gives the player, back along the aim. */
  readonly recoil: number;
}

export interface BombWeapon extends WeaponBase {
  readonly kind: 'bomb';
  /** Launch speed in meters per second. */
  readonly speed: number;
  readonly fuseSeconds: number;
  readonly blastRadius: number;
  /** Damage at the center of the blast. It falls off toward the edge. */
  readonly damage: number;
  /** Shove the blast gives the player at its center, so a bomb at your feet launches you. */
  readonly launch: number;
}

export type WeaponDef = HitscanWeapon | BombWeapon;

export const RIFLE: HitscanWeapon = {
  kind: 'hitscan',
  id: 'rifle',
  name: 'Ink Rifle',
  magazine: 30,
  reloadSeconds: 1.6,
  fireInterval: 1 / 7,
  automatic: true,
  pellets: 1,
  damage: 1,
  range: 140,
  hipSpread: 0.025,
  adsSpread: 0.003,
  recoil: 0.6,
};

export const SCATTER: HitscanWeapon = {
  kind: 'hitscan',
  id: 'scatter',
  name: 'Splatter Scatter',
  magazine: 6,
  reloadSeconds: 1.5,
  fireInterval: 0.85,
  automatic: false,
  pellets: 8,
  damage: 1.25,
  range: 30,
  hipSpread: 0.12,
  adsSpread: 0.06,
  recoil: 6,
};

export const BOMB: BombWeapon = {
  kind: 'bomb',
  id: 'bomb',
  name: 'Ink Bomb',
  magazine: 3,
  reloadSeconds: 2.2,
  fireInterval: 0.5,
  automatic: false,
  speed: 24,
  fuseSeconds: 1.6,
  blastRadius: 4.5,
  damage: 3,
  launch: 13,
};

/** Slot order: the number keys and the cycle buttons follow this list. */
export const WEAPONS: readonly WeaponDef[] = [RIFLE, SCATTER, BOMB];

/**
 * Magazines and timers for the three weapons. Each weapon keeps its own magazine, so switching away
 * from a half-empty one does not refill it. Switching cancels a reload in progress.
 */
export class Arsenal {
  private selected = 0;
  private readonly loaded: number[] = WEAPONS.map((weapon) => weapon.magazine);
  private cooldown = 0;
  private reloadLeft = 0;

  get index(): number {
    return this.selected;
  }

  get weapon(): WeaponDef {
    return WEAPONS[this.selected] ?? RIFLE;
  }

  /** Rounds left in the loaded magazine. */
  get ammo(): number {
    return this.loaded[this.selected] ?? 0;
  }

  get reloading(): boolean {
    return this.reloadLeft > 0;
  }

  /** 0 when no reload is running, rising to 1 as it finishes. */
  get reloadProgress(): number {
    return this.reloadLeft > 0 ? 1 - this.reloadLeft / this.weapon.reloadSeconds : 0;
  }

  select(index: number): void {
    if (index === this.selected || index < 0 || index >= WEAPONS.length) return;
    this.selected = index;
    this.cooldown = 0;
    this.reloadLeft = 0;
  }

  cycle(step: 1 | -1): void {
    this.select((this.selected + step + WEAPONS.length) % WEAPONS.length);
  }

  reload(): boolean {
    if (this.reloadLeft > 0 || this.ammo >= this.weapon.magazine) return false;
    this.reloadLeft = this.weapon.reloadSeconds;
    return true;
  }

  canFire(): boolean {
    return this.cooldown <= 0 && this.reloadLeft <= 0 && this.ammo > 0;
  }

  /** Spends one trigger pull. Returns false when the weapon cannot fire right now. */
  fire(): boolean {
    if (!this.canFire()) return false;
    this.loaded[this.selected] = this.ammo - 1;
    this.cooldown = this.weapon.fireInterval;
    if (this.ammo === 0) this.reload();
    return true;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloadLeft <= 0) return;
    this.reloadLeft = Math.max(0, this.reloadLeft - dt);
    if (this.reloadLeft === 0) this.loaded[this.selected] = this.weapon.magazine;
  }
}
