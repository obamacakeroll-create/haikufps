import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { PALETTE } from './palette';
import { createToonMaterial } from './toon';

/** Gun position in camera space, at the hip and aimed down the sights. */
const HIP = new Vector3(0.26, -0.22, -0.46);
const AIM = new Vector3(0, -0.16, -0.36);
const KICK_DECAY = 14;
const RELOAD_DIP = 0.5;

/** The held weapon, drawn in camera space. Its shapes are built in code like everything else. */
export class Viewmodel {
  readonly root = new Group();
  private readonly guns: Group[];
  private readonly position = new Vector3();
  private kickValue = 0;

  constructor(ramp: DataTexture) {
    const metal = this.toon(ramp, PALETTE.floorDark);
    const ink = this.toon(ramp, PALETTE.ink);
    const glow = new MeshBasicMaterial({ color: new Color(PALETTE.teal).multiplyScalar(4), fog: false });

    this.guns = [this.rifle(metal, ink, glow), this.scatter(metal, ink, glow), this.bomb(metal, ink, glow)];
    for (const gun of this.guns) {
      gun.visible = false;
      this.root.add(gun);
    }
    const [first] = this.guns;
    if (first !== undefined) first.visible = true;
    this.root.position.copy(HIP);
    this.root.traverse((object) => {
      object.castShadow = false;
      object.receiveShadow = false;
    });
  }

  select(index: number): void {
    this.guns.forEach((gun, i) => {
      gun.visible = i === index;
    });
  }

  /** Recoil from a shot, from 0 to 1. Larger shots kick harder. */
  kick(strength: number): void {
    this.kickValue = Math.min(1, this.kickValue + strength);
  }

  update(dt: number, adsBlend: number, reloadProgress: number): void {
    this.kickValue *= Math.exp(-KICK_DECAY * dt);
    this.root.position.lerpVectors(HIP, AIM, adsBlend);
    this.root.position.z += this.kickValue * 0.06;
    const reload = Math.sin(reloadProgress * Math.PI);
    this.root.position.y -= reload * 0.08;
    // Positive x tips the muzzle up, which is the recoil direction. Reloading dips it down.
    this.root.rotation.x = this.kickValue * 0.25 - reload * RELOAD_DIP;
  }

  private toon(ramp: DataTexture, color: Color): MeshToonMaterial {
    return createToonMaterial(ramp, { color });
  }

  private part(
    geometry: BufferGeometry,
    material: MeshToonMaterial | MeshBasicMaterial,
    position: [number, number, number],
    tilt = 0,
  ): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.x = tilt;
    return mesh;
  }

  private group(parts: Mesh[]): Group {
    const group = new Group();
    group.add(...parts);
    return group;
  }

  private rifle(metal: MeshToonMaterial, ink: MeshToonMaterial, glow: MeshBasicMaterial): Group {
    return this.group([
      this.part(new BoxGeometry(0.07, 0.11, 0.42), metal, [0, 0, 0]),
      this.part(new CylinderGeometry(0.018, 0.018, 0.36, 8), ink, [0, 0.01, -0.36], Math.PI / 2),
      this.part(new BoxGeometry(0.02, 0.03, 0.05), glow, [0, 0.08, -0.06]),
      this.part(new BoxGeometry(0.05, 0.12, 0.05), ink, [0, -0.11, 0.12]),
    ]);
  }

  private scatter(metal: MeshToonMaterial, ink: MeshToonMaterial, glow: MeshBasicMaterial): Group {
    return this.group([
      this.part(new CylinderGeometry(0.028, 0.028, 0.42, 8), metal, [-0.03, 0.01, -0.2], Math.PI / 2),
      this.part(new CylinderGeometry(0.028, 0.028, 0.42, 8), metal, [0.03, 0.01, -0.2], Math.PI / 2),
      this.part(new BoxGeometry(0.08, 0.12, 0.3), ink, [0, -0.04, 0.18]),
      this.part(new BoxGeometry(0.1, 0.02, 0.02), glow, [0, 0.05, -0.04]),
    ]);
  }

  private bomb(metal: MeshToonMaterial, ink: MeshToonMaterial, glow: MeshBasicMaterial): Group {
    return this.group([
      this.part(new CylinderGeometry(0.06, 0.06, 0.4, 10), metal, [0, 0, -0.2], Math.PI / 2),
      this.part(new SphereGeometry(0.07, 10, 8), ink, [0, 0, -0.4]),
      this.part(new SphereGeometry(0.035, 8, 6), glow, [0, 0.07, -0.1]),
      this.part(new BoxGeometry(0.05, 0.14, 0.06), ink, [0, -0.1, 0.05]),
    ]);
  }
}
