import { describe, expect, it } from 'vitest';
import { Arsenal, BOMB, RIFLE, SCATTER } from '../src/combat/weapons';

describe('Arsenal', () => {
  it('fires its magazine, then refuses until the reload finishes', () => {
    const arsenal = new Arsenal();
    arsenal.select(1);
    for (let i = 0; i < SCATTER.magazine; i++) {
      expect(arsenal.fire()).toBe(true);
      arsenal.update(SCATTER.fireInterval);
    }
    expect(arsenal.reloading).toBe(true);
    expect(arsenal.fire()).toBe(false);

    arsenal.update(SCATTER.reloadSeconds);
    expect(arsenal.reloading).toBe(false);
    expect(arsenal.ammo).toBe(SCATTER.magazine);
  });

  it('waits out the fire interval between trigger pulls', () => {
    const arsenal = new Arsenal();
    expect(arsenal.fire()).toBe(true);
    expect(arsenal.fire()).toBe(false);
    arsenal.update(RIFLE.fireInterval);
    expect(arsenal.fire()).toBe(true);
  });

  it('keeps each magazine when switching weapons', () => {
    const arsenal = new Arsenal();
    arsenal.fire();
    arsenal.select(2);
    arsenal.select(0);
    expect(arsenal.ammo).toBe(RIFLE.magazine - 1);
  });

  it('cancels a reload when the weapon changes, and the reload can start again', () => {
    const arsenal = new Arsenal();
    arsenal.select(1);
    for (let i = 0; i < SCATTER.magazine; i++) {
      arsenal.fire();
      arsenal.update(SCATTER.fireInterval);
    }
    expect(arsenal.reloading).toBe(true);

    arsenal.select(0);
    arsenal.select(1);
    expect(arsenal.reloading).toBe(false);
    expect(arsenal.ammo).toBe(0);
    expect(arsenal.reload()).toBe(true);
  });

  it('reloads on its own when the last round is spent', () => {
    const arsenal = new Arsenal();
    arsenal.select(2);
    for (let i = 0; i < BOMB.magazine; i++) {
      expect(arsenal.fire()).toBe(true);
      arsenal.update(BOMB.fireInterval);
    }
    expect(arsenal.reloading).toBe(true);
  });

  it('cycles through the weapons in both directions', () => {
    const arsenal = new Arsenal();
    arsenal.cycle(-1);
    expect(arsenal.index).toBe(2);
    arsenal.cycle(1);
    expect(arsenal.index).toBe(0);
  });
});
