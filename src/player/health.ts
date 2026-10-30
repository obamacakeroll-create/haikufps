export const HEALTH = {
  max: 100,
  /** Seconds without damage before regeneration starts. Hits cannot be healed through. */
  regenDelay: 4,
  regenPerSecond: 6,
} as const;

export class Health {
  private value: number = HEALTH.max;
  private quietFor: number = HEALTH.regenDelay;

  get current(): number {
    return this.value;
  }

  /** 0 to 1. */
  get fraction(): number {
    return this.value / HEALTH.max;
  }

  get dead(): boolean {
    return this.value <= 0;
  }

  damage(amount: number): void {
    if (this.dead || amount <= 0) return;
    this.value = Math.max(0, this.value - amount);
    this.quietFor = 0;
  }

  update(dt: number): void {
    this.quietFor = Math.min(HEALTH.regenDelay, this.quietFor + dt);
    if (this.quietFor >= HEALTH.regenDelay && !this.dead) {
      this.value = Math.min(HEALTH.max, this.value + HEALTH.regenPerSecond * dt);
    }
  }
}
