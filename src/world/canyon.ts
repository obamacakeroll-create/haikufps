import {
  BufferGeometry,
  DataTexture,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshToonMaterial,
  Quaternion,
  Scene,
  Texture,
  Vector3,
} from 'three';
import type { Noise } from '../procgen/noise';
import { buildFloor, buildSlab, paintNoise, paintStrata } from '../procgen/geometry';
import { PALETTE } from '../render/palette';
import { createToonMaterial } from '../render/toon';
import { type Box } from './collision';
import {
  generateSection,
  LEDGE_BASE,
  SECTION_LENGTH,
  sectionIndexAt,
  slotBox,
  WALL_VARIANTS,
  type Section,
  type Slot,
} from './layout';

/** Sections kept behind the player. The tide can reach this far back. */
const BEHIND_SECTIONS = 2;
/** Sections kept ahead of the player. Fog hides the far edge. */
const AHEAD_SECTIONS = 5;
const FLOOR_HALF_WIDTH = 22;
const FLOOR_FLAT_HALF_WIDTH = 7;
const MAX_SLABS_PER_MESH = 256;
const UP = new Vector3(0, 1, 0);

/**
 * A slot in a loaded section. Its placement and collider change during a reshape, while `slot`
 * keeps the generated values it started from.
 */
export interface LiveSlot {
  readonly slot: Slot;
  readonly meshIndex: number;
  /** Current center and width. Height and depth never change. */
  x: number;
  y: number;
  width: number;
  /** Collider that mirrors the placement above. `Canyon.setPose` keeps the two in step. */
  readonly box: Box;
}

interface LoadedSection {
  readonly section: Section;
  readonly floor: Mesh;
  readonly slots: LiveSlot[];
}

/** Placement of one slot, kept while its section is unloaded. */
interface SavedPose {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/**
 * Streams canyon sections around the player. Walls and ledges are drawn with one InstancedMesh per
 * geometry variant. Placement changes are written in one pass by `flush`.
 */
export class Canyon {
  private readonly sections = new Map<number, LoadedSection>();
  /** Wall variants first, then the ledge mesh last. */
  private readonly meshes: InstancedMesh[];
  private readonly geometries: BufferGeometry[];
  private readonly counts: number[];
  private readonly floorMaterial: MeshToonMaterial;
  private readonly stoneMaterial: MeshToonMaterial;
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3();
  private readonly matrix = new Matrix4();
  /** Reshaped placements of unloaded sections, so walking back finds the canyon as it was left. */
  private readonly savedPoses = new Map<number, SavedPose[]>();
  private dirty = false;

  constructor(
    private readonly scene: Scene,
    private readonly runSeed: number,
    private readonly noise: Noise,
    assets: { ramp: DataTexture; mottle: Texture },
  ) {
    this.stoneMaterial = createToonMaterial(assets.ramp, { vertexColors: true });
    this.floorMaterial = createToonMaterial(assets.ramp, { map: assets.mottle, vertexColors: true });

    this.geometries = WALL_VARIANTS.map((size) => {
      const geometry = buildSlab(noise, size.width, size.height, size.depth, 6, 0.05);
      paintStrata(geometry, PALETTE.strata, noise, 2.6);
      return geometry;
    });
    const ledge = buildSlab(noise, LEDGE_BASE.width, LEDGE_BASE.height, LEDGE_BASE.depth, 4, 0.04);
    paintStrata(ledge, PALETTE.strata, noise, 0.6);
    this.geometries.push(ledge);

    this.meshes = this.geometries.map((geometry) => {
      const mesh = new InstancedMesh(geometry, this.stoneMaterial, MAX_SLABS_PER_MESH);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // InstancedMesh culls as one object, so per-instance culling is not useful at this count.
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    });
    this.counts = this.meshes.map(() => 0);
  }

  /** Loads sections in the window around `playerZ` and unloads the rest. */
  update(playerZ: number): void {
    const current = sectionIndexAt(playerZ);
    const first = current - BEHIND_SECTIONS;
    const last = current + AHEAD_SECTIONS;

    for (const index of [...this.sections.keys()]) {
      if (index < first || index > last) this.unload(index);
    }
    for (let index = first; index <= last; index++) {
      if (!this.sections.has(index)) this.load(index);
    }
  }

  /**
   * Fills `out` with the boxes that could touch a capsule at `z`. The array is reused, so callers
   * should not keep it across steps.
   */
  boxesNear(z: number, radius: number, out: Box[]): Box[] {
    out.length = 0;
    for (const loaded of this.sections.values()) {
      for (const live of loaded.slots) {
        const { box } = live;
        if (Math.abs(box.z - z) <= Math.max(box.hx, box.hz) + radius) out.push(box);
      }
    }
    return out;
  }

  /** Fills `out` with the live slots whose centers lie between `zFar` and `zNear`. */
  slotsBetween(zFar: number, zNear: number, out: LiveSlot[]): LiveSlot[] {
    out.length = 0;
    for (const loaded of this.sections.values()) {
      for (const live of loaded.slots) {
        if (live.box.z >= zFar && live.box.z <= zNear) out.push(live);
      }
    }
    return out;
  }

  /** Moves a slot and its collider. Call `flush` once after a batch of moves. */
  setPose(live: LiveSlot, x: number, y: number, width: number): void {
    live.x = x;
    live.y = y;
    live.width = width;
    live.box.x = x;
    live.box.y = y;
    live.box.hx = width / 2;
    this.dirty = true;
  }

  /** Writes instance matrices when any slot has moved or sections have changed. */
  flush(): void {
    if (this.dirty) this.sync();
  }

  /** Number of loaded sections. Exposed for tests and the debug overlay. */
  get loadedSections(): number {
    return this.sections.size;
  }

  dispose(): void {
    for (const index of [...this.sections.keys()]) this.unload(index);
    for (const mesh of this.meshes) this.scene.remove(mesh);
    for (const geometry of this.geometries) geometry.dispose();
    this.stoneMaterial.dispose();
    this.floorMaterial.dispose();
  }

  private load(index: number): void {
    const section = generateSection(this.runSeed, index);
    const floor = new Mesh(this.buildFloorGeometry(section), this.floorMaterial);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const slots = section.slots.map(
      (slot): LiveSlot => ({
        slot,
        meshIndex: slot.kind === 'ledge' ? this.meshes.length - 1 : slot.variant,
        x: slot.x,
        y: slot.y,
        width: slot.width,
        box: slotBox(slot),
      }),
    );
    this.savedPoses.get(index)?.forEach((pose, i) => {
      const live = slots[i];
      if (live) this.setPose(live, pose.x, pose.y, pose.width);
    });
    this.savedPoses.delete(index);
    this.sections.set(index, { section, floor, slots });
    this.dirty = true;
  }

  private unload(index: number): void {
    const loaded = this.sections.get(index);
    if (!loaded) return;
    this.savedPoses.set(
      index,
      loaded.slots.map(({ x, y, width }) => ({ x, y, width })),
    );
    this.scene.remove(loaded.floor);
    loaded.floor.geometry.dispose();
    this.sections.delete(index);
    this.dirty = true;
  }

  private buildFloorGeometry(section: Section): BufferGeometry {
    const geometry = buildFloor(this.noise, {
      width: FLOOR_HALF_WIDTH * 2,
      depth: SECTION_LENGTH,
      segmentsX: FLOOR_HALF_WIDTH * 2,
      segmentsZ: SECTION_LENGTH,
      centerZ: (section.zNear + section.zFar) / 2,
      flatHalfWidth: FLOOR_FLAT_HALF_WIDTH,
    });
    paintNoise(geometry, PALETTE.floorDark, PALETTE.floorLight, this.noise, 0.05);
    return geometry;
  }

  /** Rewrites every instance matrix from the loaded slots. */
  private sync(): void {
    this.counts.fill(0);
    for (const loaded of this.sections.values()) {
      for (const live of loaded.slots) {
        const mesh = this.meshes[live.meshIndex];
        const instance = this.counts[live.meshIndex] ?? 0;
        if (!mesh || instance >= MAX_SLABS_PER_MESH) continue;
        this.writeInstance(mesh, instance, live);
        this.counts[live.meshIndex] = instance + 1;
      }
    }
    this.meshes.forEach((mesh, i) => {
      mesh.count = this.counts[i] ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    });
    this.dirty = false;
  }

  private writeInstance(mesh: InstancedMesh, instance: number, live: LiveSlot): void {
    const { slot } = live;
    const base = slot.kind === 'ledge' ? LEDGE_BASE : WALL_VARIANTS[slot.variant] ?? LEDGE_BASE;
    this.position.set(live.x, live.y, slot.z);
    this.quaternion.setFromAxisAngle(UP, slot.yaw);
    this.scale.set(live.width / base.width, slot.height / base.height, slot.depth / base.depth);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    mesh.setMatrixAt(instance, this.matrix);
  }
}
