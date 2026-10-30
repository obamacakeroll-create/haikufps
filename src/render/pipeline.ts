import {
  DepthTexture,
  HalfFloatType,
  MeshNormalMaterial,
  PerspectiveCamera,
  Scene,
  Texture,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SKY_LAYER } from './layers';
import { createCompositeShader, type CompositeUniforms } from './outline';

/** A depth texture keeps the size it was created with, so the target is rebuilt whenever the size changes. */
function createNormalTarget(width: number, height: number): WebGLRenderTarget {
  const target = new WebGLRenderTarget(width, height, { type: HalfFloatType });
  target.depthTexture = new DepthTexture(width, height);
  return target;
}

/**
 * Frame order:
 * 1. Normal pre-pass into a target with a depth texture. Sky is excluded.
 * 2. Beauty pass into a 4x MSAA HDR target, followed by bloom on light over 1.0.
 * 3. Composite: ink outlines from the pre-pass, paper grain, vignette.
 * 4. Output: tone mapping and sRGB encoding.
 */
export class RenderPipeline {
  private readonly composer: EffectComposer;
  private normalTarget: WebGLRenderTarget;
  private readonly normalCamera = new PerspectiveCamera();
  private readonly normalMaterial = new MeshNormalMaterial();
  private readonly compositeUniforms: CompositeUniforms;
  private readonly drawingSize = new Vector2();

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    paper: Texture,
  ) {
    renderer.info.autoReset = false;

    this.normalTarget = createNormalTarget(1, 1);

    this.composer = new EffectComposer(
      renderer,
      new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 }),
    );
    this.composer.addPass(new RenderPass(scene, camera));
    // Threshold sits above 1.0, so only the sun and other emissive light bloom. Lit surfaces stay crisp.
    this.composer.addPass(new UnrealBloomPass(new Vector2(1, 1), 0.35, 0.4, 1.4));

    const composite = new ShaderPass(createCompositeShader(paper));
    // ShaderPass clones its uniforms in its constructor, so updates must go to the pass's own copy.
    this.compositeUniforms = composite.uniforms as unknown as CompositeUniforms;
    this.composer.addPass(composite);
    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);

    this.renderer.getDrawingBufferSize(this.drawingSize);
    const { x, y } = this.drawingSize;
    this.normalTarget.dispose();
    this.normalTarget = createNormalTarget(x, y);
    this.compositeUniforms.uTexel.value.set(1 / x, 1 / y);
    this.compositeUniforms.uThickness.value = pixelRatio * 1.5;
    this.compositeUniforms.uAspect.value = width / Math.max(1, height);
  }

  render(): void {
    this.renderer.info.reset();

    this.normalCamera.copy(this.camera);
    this.normalCamera.layers.disable(SKY_LAYER);
    const previousOverride = this.scene.overrideMaterial;
    this.scene.overrideMaterial = this.normalMaterial;
    this.renderer.setRenderTarget(this.normalTarget);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.normalCamera);
    this.scene.overrideMaterial = previousOverride;
    this.renderer.setRenderTarget(null);

    const uniforms = this.compositeUniforms;
    uniforms.tNormal.value = this.normalTarget.texture;
    uniforms.tDepth.value = this.normalTarget.depthTexture;
    uniforms.uNear.value = this.camera.near;
    uniforms.uFar.value = this.camera.far;

    this.composer.render();
  }
}
