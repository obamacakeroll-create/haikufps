import { Mesh, Scene, type DataTexture, type Texture } from 'three';
import { createRng } from '../core/rng';
import { createNoise } from '../procgen/noise';
import { buildFloor, buildRock, buildSlab, paintNoise, paintStrata } from '../procgen/geometry';
import { PALETTE } from '../render/palette';
import { createToonMaterial } from '../render/toon';

export interface LookTestTextures {
  ramp: DataTexture;
  mottle: Texture;
}

const SEED = 7;

/**
 * Stand-in canyon for judging the look: strata walls, scattered rocks, and a mottled floor.
 * Replaced by the real canyon generator in milestone 3.
 */
export function buildLookTestSet(scene: Scene, textures: LookTestTextures): void {
  const rng = createRng(SEED);
  const noise = createNoise(SEED);
  const stoneMaterial = createToonMaterial(textures.ramp, { vertexColors: true });
  const groundMaterial = createToonMaterial(textures.ramp, { map: textures.mottle, vertexColors: true });

  const floorGeometry = buildFloor(noise, 70, 280, 40, 140);
  paintNoise(floorGeometry, PALETTE.floorDark, PALETTE.floorLight, noise, 0.05);
  const floor = new Mesh(floorGeometry, groundMaterial);
  floor.position.z = -80;
  scene.add(floor);

  for (let z = 40; z > -220; z -= rng.range(10, 16)) {
    for (const side of [-1, 1]) {
      const width = rng.range(7, 12);
      const height = rng.range(14, 34);
      const depth = rng.range(10, 16);
      const geometry = buildSlab(noise, width, height, depth, 6);
      paintStrata(geometry, PALETTE.strata, noise, 2.6);
      const wall = new Mesh(geometry, stoneMaterial);
      wall.position.set(side * (17 + rng.range(0, 5)), height * 0.5 - 2, z);
      wall.rotation.y = rng.range(-0.15, 0.15);
      scene.add(wall);
    }
  }

  for (let i = 0; i < 70; i++) {
    const radius = rng.range(0.4, 2.2);
    const geometry = buildRock(noise, radius, 1);
    paintStrata(geometry, PALETTE.strata, noise, 1.2);
    const rock = new Mesh(geometry, stoneMaterial);
    rock.position.set(rng.range(-12, 12), radius * 0.2, rng.range(-210, 30));
    rock.rotation.set(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6));
    scene.add(rock);
  }
}
