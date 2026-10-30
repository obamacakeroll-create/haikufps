import { describe, expect, it } from 'vitest';
import { HEALTH, Health } from '../src/player/health';

describe('Health', () => {
  it('starts full and loses what it takes', () => {
    const health = new Health();
    expect(health.current).toBe(HEALTH.max);
    health.damage(25);
    expect(health.current).toBe(HEALTH.max - 25);
  });

  it('waits for the quiet delay before regenerating', () => {
    const health = new Health();
    health.damage(40);
    health.update(HEALTH.regenDelay - 0.1);
    expect(health.current).toBe(HEALTH.max - 40);
    health.update(0.5);
    expect(health.current).toBeGreaterThan(HEALTH.max - 40);
  });

  it('restarts the quiet delay after every hit', () => {
    const health = new Health();
    health.damage(10);
    health.update(HEALTH.regenDelay - 0.1);
    health.damage(1);
    health.update(HEALTH.regenDelay - 0.1);
    expect(health.current).toBe(HEALTH.max - 11);
  });

  it('caps regeneration at the maximum', () => {
    const health = new Health();
    health.damage(5);
    health.update(60);
    expect(health.current).toBe(HEALTH.max);
  });

  it('dies at zero and stops regenerating', () => {
    const health = new Health();
    health.damage(HEALTH.max + 50);
    expect(health.dead).toBe(true);
    expect(health.current).toBe(0);
    health.update(60);
    expect(health.current).toBe(0);
  });
});
