/** An axis-aligned box that may be turned about the vertical axis. Reshaping moves it in place. */
export interface Box {
  /** Center in world space. */
  x: number;
  y: number;
  z: number;
  /** Half extents in the box's own frame, before yaw. */
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
}

/** Unit normal of a contact, pointing from the box toward the capsule. */
export interface Contact {
  nx: number;
  ny: number;
  nz: number;
}

/** Above this normal.y, a surface counts as ground. */
export const GROUND_NORMAL_Y = 0.5;

const scratchContact: Contact = { nx: 0, ny: 0, nz: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Pushes a vertical capsule out of a box if they overlap. `position` is the capsule's feet and is
 * moved in place. Returns the contact normal when a push happened, or `undefined` otherwise. The
 * returned object is reused on the next call, so read it before calling again.
 *
 * The capsule is a segment of sphere centers with radius `radius`. The segment and box are
 * compared in the box's local frame, where the nearest pair of points is exact.
 */
export function separateCapsule(
  position: { x: number; y: number; z: number },
  radius: number,
  height: number,
  box: Box,
): Contact | undefined {
  const cos = Math.cos(box.yaw);
  const sin = Math.sin(box.yaw);
  const dx = position.x - box.x;
  const dz = position.z - box.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;

  const low = position.y + radius - box.y;
  const high = Math.max(low, position.y + height - radius - box.y);
  // The segment point nearest the box's vertical center is the closest point when the segment overlaps the box.
  const ly = clamp(0, low, high);

  const qx = clamp(lx, -box.hx, box.hx);
  const qy = clamp(ly, -box.hy, box.hy);
  const qz = clamp(lz, -box.hz, box.hz);
  const ex = lx - qx;
  const ey = ly - qy;
  const ez = lz - qz;
  const distanceSquared = ex * ex + ey * ey + ez * ez;
  if (distanceSquared > radius * radius) return undefined;

  let nlx = 0;
  let nly = 0;
  let nlz = 0;
  let depth: number;
  if (distanceSquared > 1e-12) {
    const distance = Math.sqrt(distanceSquared);
    nlx = ex / distance;
    nly = ey / distance;
    nlz = ez / distance;
    depth = radius - distance;
  } else {
    // The center is inside the box. Leave through the nearest face.
    const px = box.hx - Math.abs(lx);
    const py = box.hy - Math.abs(ly);
    const pz = box.hz - Math.abs(lz);
    if (px <= py && px <= pz) {
      nlx = lx < 0 ? -1 : 1;
      depth = px + radius;
    } else if (py <= pz) {
      nly = ly < 0 ? -1 : 1;
      depth = py + radius;
    } else {
      nlz = lz < 0 ? -1 : 1;
      depth = pz + radius;
    }
  }

  // Local to world: rotate back by the box's yaw.
  const nx = nlx * cos + nlz * sin;
  const nz = -nlx * sin + nlz * cos;
  const ny = nly;
  position.x += nx * depth;
  position.y += ny * depth;
  position.z += nz * depth;

  scratchContact.nx = nx;
  scratchContact.ny = ny;
  scratchContact.nz = nz;
  return scratchContact;
}
