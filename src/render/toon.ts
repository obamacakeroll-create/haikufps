import {
  DataTexture,
  MeshToonMaterial,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  type ColorRepresentation,
  type Texture,
} from 'three';

/** Three light steps (shadow, mid, lit). NearestFilter keeps the bands hard. */
export function createToonRamp(): DataTexture {
  const data = new Uint8Array([96, 96, 96, 255, 178, 178, 178, 255, 255, 255, 255, 255]);
  const texture = new DataTexture(data, 3, 1, RGBAFormat, UnsignedByteType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export interface ToonOptions {
  color?: ColorRepresentation;
  map?: Texture | null;
  vertexColors?: boolean;
}

export function createToonMaterial(ramp: Texture, options: ToonOptions = {}): MeshToonMaterial {
  return new MeshToonMaterial({
    gradientMap: ramp,
    color: options.color ?? 0xffffff,
    map: options.map ?? null,
    vertexColors: options.vertexColors ?? false,
  });
}
