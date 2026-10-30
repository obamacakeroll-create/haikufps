import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { SKY_LAYER } from './layers';

export interface Sky {
  readonly mesh: Mesh;
  setTime(seconds: number): void;
}

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // Pin to the far plane so the sky always sits behind everything.
    gl_Position = clip.xyww;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amp * valueNoise(p);
      p = p * 2.02 + vec2(1.7, 9.2);
      amp *= 0.5;
    }
    return sum;
  }

  void main() {
    vec3 d = normalize(vDir);
    float up = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(up, 0.6));

    // Ink-wash streaks drifting across the sky.
    // Built from raw direction components, not atan, so there is no seam where the angle wraps.
    vec2 q = vec2(d.x + d.z * 0.6, d.y) * 5.0;
    float wash = fbm(q + vec2(uTime * 0.02, 0.0));
    float streak = smoothstep(0.5, 0.85, wash) * smoothstep(0.0, 0.5, d.y + 0.1);
    col = mix(col, uTop * 0.55 + uHorizon * 0.12, streak * 0.55);

    // Sun: a wide warm glow plus a hot disc above 1.0, so bloom catches it.
    float s = max(dot(d, normalize(uSun)), 0.0);
    col += uHorizon * pow(s, 12.0) * 0.8;
    col += vec3(1.0, 0.92, 0.75) * pow(s, 600.0) * 8.0;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createSky(top: Color, horizon: Color, sunDirection: Vector3): Sky {
  const uniforms = {
    uTop: { value: top },
    uHorizon: { value: horizon },
    uSun: { value: sunDirection },
    uTime: { value: 0 },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
  });
  const mesh = new Mesh(new SphereGeometry(400, 32, 16), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  mesh.layers.set(SKY_LAYER);
  return {
    mesh,
    setTime(seconds: number) {
      uniforms.uTime.value = seconds;
    },
  };
}
