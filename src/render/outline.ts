import { Color, Texture, Vector2 } from 'three';
import { PALETTE } from './palette';

/**
 * Composite pass: ink outlines from the normal pre-pass (depth discontinuities and normal creases),
 * then paper grain, vignette, and a gentle ink tint. Runs on linear HDR, before the output pass.
 */
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;
  uniform sampler2D tPaper;
  uniform vec2 uTexel;
  uniform float uThickness;
  uniform float uNear;
  uniform float uFar;
  uniform vec3 uInk;
  uniform float uInkStrength;
  uniform float uPaper;
  uniform float uPaperScale;
  uniform float uVignette;
  uniform float uAspect;
  varying vec2 vUv;

  float linearDepth(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return (uNear * uFar) / (uFar - (uFar - uNear) * d);
  }

  vec3 normalAt(vec2 uv) {
    return texture2D(tNormal, uv).xyz * 2.0 - 1.0;
  }

  float edgeAt(vec2 offset, float depthC, vec3 normalC) {
    vec2 uv = vUv + offset * uTexel * uThickness;
    float depthN = linearDepth(uv);
    float depthEdge = smoothstep(0.03, 0.08, abs(depthN - depthC) / depthC);
    float normalEdge = smoothstep(0.3, 0.55, 1.0 - dot(normalC, normalAt(uv)));
    return max(depthEdge, normalEdge);
  }

  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb;

    float depthC = linearDepth(vUv);
    float ink = 0.0;
    // Sky and empty pixels have no normal, so they never get an outline of their own.
    if (texture2D(tDepth, vUv).x < 0.99999) {
      vec3 normalC = normalAt(vUv);
      ink = max(ink, edgeAt(vec2( 1.0,  0.0), depthC, normalC));
      ink = max(ink, edgeAt(vec2(-1.0,  0.0), depthC, normalC));
      ink = max(ink, edgeAt(vec2( 0.0,  1.0), depthC, normalC));
      ink = max(ink, edgeAt(vec2( 0.0, -1.0), depthC, normalC));
    }
    color = mix(color, uInk, clamp(ink * uInkStrength, 0.0, 1.0));

    float paper = texture2D(tPaper, vUv * vec2(uAspect, 1.0) * uPaperScale).r;
    color *= mix(1.0, 0.9 + 0.2 * paper, uPaper);

    float vig = smoothstep(0.35, 0.95, length((vUv - 0.5) * vec2(uAspect, 1.0)));
    color *= 1.0 - uVignette * vig;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export type CompositeUniforms = ReturnType<typeof createCompositeShader>['uniforms'];

export function createCompositeShader(paper: Texture) {
  return {
    uniforms: {
      tDiffuse: { value: null as Texture | null },
      tNormal: { value: null as Texture | null },
      tDepth: { value: null as Texture | null },
      tPaper: { value: paper },
      uTexel: { value: new Vector2(1, 1) },
      uThickness: { value: 1.5 },
      uNear: { value: 0.1 },
      uFar: { value: 400 },
      uInk: { value: new Color(PALETTE.ink) },
      uInkStrength: { value: 0.9 },
      uPaper: { value: 0.35 },
      uPaperScale: { value: 2.5 },
      uVignette: { value: 0.35 },
      uAspect: { value: 1.7 },
    },
    vertexShader,
    fragmentShader,
  };
}
