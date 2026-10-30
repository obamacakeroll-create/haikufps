import { DirectionalLight, HemisphereLight, Scene, Vector3 } from 'three';

export const SUN_DIRECTION = new Vector3(0.45, 0.8, 0.35).normalize();

export interface Lighting {
  /** Keeps the sun's shadow frustum centered on the player. */
  follow(center: Vector3): void;
}

export function createLighting(scene: Scene): Lighting {
  const hemisphere = new HemisphereLight(0x9fb6d9, 0x2a1b1f, 1.1);
  const sun = new DirectionalLight(0xffd7a8, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -35;
  shadowCamera.right = 35;
  shadowCamera.top = 35;
  shadowCamera.bottom = -35;
  shadowCamera.near = 1;
  shadowCamera.far = 140;
  shadowCamera.updateProjectionMatrix();
  scene.add(hemisphere, sun, sun.target);

  return {
    follow(center) {
      sun.target.position.copy(center);
      sun.position.copy(center).addScaledVector(SUN_DIRECTION, 60);
    },
  };
}
