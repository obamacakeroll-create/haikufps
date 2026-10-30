import {
  Fog,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Emitter } from '../core/events';
import { createLoop, type Loop } from '../core/loop';
import { createRng } from '../core/rng';
import { SAVE_VERSION, loadSave, writeSave } from '../core/save';
import { type Settings } from '../core/settings';
import { browserStore, type KeyValueStore } from '../core/storage';
import type { Action } from '../input/actions';
import { AimState } from '../input/aim';
import { GamepadSource } from '../input/gamepad';
import { type Controls, InputManager, type InputEvents } from '../input/input';
import { KeyboardMouseSource } from '../input/keyboard-mouse';
import { BODY } from '../player/movement';
import { createMottleTexture, createPaperTexture } from '../procgen/textures';
import { createLighting, SUN_DIRECTION, type Lighting } from '../render/lighting';
import { SKY_LAYER } from '../render/layers';
import { PALETTE } from '../render/palette';
import { RenderPipeline } from '../render/pipeline';
import { createSky, type Sky } from '../render/sky';
import { createToonRamp } from '../render/toon';
import { Hud } from '../ui/hud';
import { Ui } from '../ui/ui';
import { Run, type RunAssets } from './run';

type GameState = 'title' | 'playing' | 'paused' | 'dead';

const DEG = Math.PI / 180;
const PITCH_LIMIT = 1.5;
const ADS_SENSITIVITY = 0.55;
const ADS_ZOOM = 0.62;
const ADS_MOVE_SCALE = 0.85;
const MAX_PIXEL_RATIO = 1.5;
const START_ACTIONS: readonly Action[] = ['confirm', 'fire', 'jump', 'dash', 'reload', 'aim', 'pause', 'back'];
const WEAPON_ACTIONS: readonly Action[] = ['weaponNext', 'weaponPrev', 'weapon1', 'weapon2', 'weapon3'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(75, 1, 0.05, 400);
  private readonly pipeline: RenderPipeline;
  private readonly sky: Sky;
  private readonly lighting: Lighting;
  private readonly assets: RunAssets;
  private readonly hud: Hud;
  private readonly store: KeyValueStore = browserStore();
  private readonly settings: Settings;
  private readonly events = new Emitter<InputEvents>();
  private readonly keyboard: KeyboardMouseSource;
  private readonly gamepad: GamepadSource;
  private readonly input: InputManager;
  private readonly aim: AimState;
  private readonly ui: Ui;
  private readonly loop: Loop;
  private run: Run;
  /** Camera eye at the last two simulation steps. Rendering blends between them. */
  private readonly eye = new Vector3(0, BODY.eyeHeight, 0);
  private readonly previousEye = new Vector3(0, BODY.eyeHeight, 0);
  private state: GameState = 'title';
  private yaw = 0;
  private pitch = 0;
  private adsBlend = 0;
  private elapsed = 0;

  constructor(root: HTMLElement) {
    this.settings = loadSave(this.store).settings;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game';
    root.append(this.canvas);

    this.renderer = new WebGLRenderer({ canvas: this.canvas });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.toneMapping = NeutralToneMapping;

    const rng = createRng(11);
    const ramp = createToonRamp();
    const mottle = createMottleTexture(rng);
    const paper = createPaperTexture(rng);
    this.assets = { ramp, mottle };

    this.scene.background = null;
    this.scene.fog = new Fog(PALETTE.fog, 40, 240);
    this.sky = createSky(PALETTE.skyTop, PALETTE.skyHorizon, SUN_DIRECTION);
    this.scene.add(this.sky.mesh);
    this.lighting = createLighting(this.scene);
    this.camera.layers.enable(SKY_LAYER);
    this.pipeline = new RenderPipeline(this.renderer, this.scene, this.camera, paper);
    this.run = this.createRun();

    this.keyboard = new KeyboardMouseSource(this.canvas, () => this.settings);
    this.gamepad = new GamepadSource(() => this.settings);
    this.input = new InputManager([this.keyboard, this.gamepad], this.events);
    this.aim = new AimState(this.settings.aimMode);

    const uiRoot = document.createElement('div');
    uiRoot.className = 'ui';
    root.append(uiRoot);
    this.hud = new Hud(uiRoot);
    this.ui = new Ui(uiRoot, this.settings, {
      onStart: () => this.startFromTitle(),
      onRetry: () => this.retry(),
      onResume: () => this.resume(),
      onQuit: () => this.quitToTitle(),
      onSettingsChanged: () => this.persist(),
    });

    this.loop = createLoop({
      update: (dt) => this.update(dt),
      render: (alpha) => this.render(alpha),
    });

    window.addEventListener('resize', this.resize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    this.resize();
    this.syncEye();
    this.previousEye.copy(this.eye);
    this.ui.showTitle();
  }

  start(): void {
    this.loop.start();
  }

  private update(dt: number): void {
    this.elapsed += dt;
    this.previousEye.copy(this.eye);
    const controls = this.input.poll(dt);
    if (controls.pressed('debug')) this.ui.toggleDebug();
    this.aim.setMode(this.settings.aimMode);

    switch (this.state) {
      case 'title':
        if (START_ACTIONS.some((action) => controls.pressed(action))) this.startFromTitle();
        break;
      case 'playing':
        this.updatePlaying(controls, dt);
        break;
      case 'paused':
        if (this.ui.updatePaused(controls) === 'resume') this.resume();
        break;
      case 'dead':
        this.updateDead(controls);
        break;
    }
  }

  private updatePlaying(controls: Controls, dt: number): void {
    if (controls.pressed('pause')) {
      this.pause();
      return;
    }
    if (WEAPON_ACTIONS.some((action) => controls.pressed(action))) this.aim.release();

    const aiming = this.aim.update(controls.held('aim'), controls.pressed('aim'));
    const sensitivity = aiming ? ADS_SENSITIVITY : 1;
    this.yaw += controls.look.x * sensitivity * DEG;
    this.pitch = clamp(this.pitch + controls.look.y * sensitivity * DEG, -PITCH_LIMIT, PITCH_LIMIT);

    const forwardX = Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = Math.sin(this.yaw);
    this.run.update(dt, {
      wishX: forwardX * controls.move.y + rightX * controls.move.x,
      wishZ: forwardZ * controls.move.y + rightZ * controls.move.x,
      speedScale: aiming ? ADS_MOVE_SCALE : 1,
      facingX: forwardX,
      facingZ: forwardZ,
      jumpPressed: controls.pressed('jump'),
      jumpHeld: controls.held('jump'),
      dashPressed: controls.pressed('dash'),
    });
    this.syncEye();

    this.adsBlend += ((aiming ? 1 : 0) - this.adsBlend) * Math.min(1, dt * 14);
    if (this.run.status === 'over') this.die();
  }

  private updateDead(controls: Controls): void {
    switch (this.ui.updateDeath(controls)) {
      case 'retry':
        this.retry();
        break;
      case 'title':
        this.quitToTitle();
        break;
      default:
        break;
    }
  }

  private render(alpha: number): void {
    this.updateCamera(alpha);
    this.sky.mesh.position.copy(this.camera.position);
    this.sky.setTime(this.elapsed);
    this.lighting.follow(this.camera.position);

    const playing = this.state === 'playing';
    this.hud.setVisible(playing);
    if (playing) {
      this.hud.update({
        distance: this.run.distance,
        gap: this.run.gap,
        fuel: this.run.body.fuel,
        dashReady: this.run.body.dashCooldown <= 0,
      });
    }

    this.pipeline.render();
    if (this.ui.debugVisible) this.ui.setDebugText(this.debugText());
  }

  private updateCamera(alpha: number): void {
    const fov = this.settings.fov * (1 - (1 - ADS_ZOOM) * this.adsBlend);
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.lerpVectors(this.previousEye, this.eye, alpha);
    this.camera.rotation.set(this.pitch, -this.yaw, 0, 'YXZ');
  }

  private syncEye(): void {
    const { x, y, z } = this.run.body;
    this.eye.set(x, y + BODY.eyeHeight, z);
  }

  private createRun(): Run {
    return new Run(this.scene, this.assets, Math.floor(Math.random() * 0x7fffffff));
  }

  private debugText(): string {
    const { calls, triangles } = this.renderer.info.render;
    const { body } = this.run;
    const dash = body.dashCooldown > 0 ? `${body.dashCooldown.toFixed(1)} s` : 'ready';
    return [
      `fps ${this.loop.stats.fps.toFixed(0)}   frame ${this.loop.stats.frameMs.toFixed(1)} ms`,
      `draw calls ${calls}   triangles ${triangles}   sections ${this.run.loadedSections}`,
      `state ${this.state}   device ${this.input.device}`,
      `aim ${this.settings.aimMode}   ${this.aim.active ? 'ON' : 'off'}`,
      `run ${this.run.time.toFixed(1)} s   dist ${this.run.distance.toFixed(1)} m`,
      `speed ${this.run.forwardSpeed.toFixed(1)}   pace ${this.run.pace.toFixed(1)}   gap ${this.run.gap.toFixed(1)} m`,
      `pos ${body.x.toFixed(1)} ${body.y.toFixed(1)} ${body.z.toFixed(1)}   ${body.grounded ? 'ground' : 'air'}`,
      `fuel ${(body.fuel * 100).toFixed(0)}%   dash ${dash}`,
    ].join('\n');
  }

  private startFromTitle(): void {
    if (this.state !== 'title') return;
    this.beginRun();
  }

  private retry(): void {
    if (this.state !== 'dead') return;
    this.beginRun();
  }

  private beginRun(): void {
    this.run.dispose();
    this.run = this.createRun();
    this.yaw = 0;
    this.pitch = 0;
    this.adsBlend = 0;
    this.aim.release();
    this.syncEye();
    this.previousEye.copy(this.eye);
    this.state = 'playing';
    this.ui.hideAll();
    this.requestLock();
  }

  private die(): void {
    this.state = 'dead';
    this.aim.release();
    this.ui.showDeath(this.run.distance, this.run.time);
    this.exitLock();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.aim.release();
    this.ui.showPause();
    this.exitLock();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.hideAll();
    this.requestLock();
  }

  private quitToTitle(): void {
    this.state = 'title';
    this.aim.release();
    this.ui.showTitle();
    this.exitLock();
  }

  private readonly onPointerLockChange = (): void => {
    if (document.pointerLockElement === null) this.pause();
  };

  private requestLock(): void {
    // Chromium returns a promise that rejects without user activation, such as a gamepad-only start.
    const result: unknown = this.canvas.requestPointerLock();
    if (result instanceof Promise) result.catch(() => undefined);
  }

  private exitLock(): void {
    if (document.pointerLockElement !== null) document.exitPointerLock();
  }

  private persist(): void {
    writeSave(this.store, { version: SAVE_VERSION, settings: this.settings });
  }

  private readonly resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.pipeline.setSize(width, height, Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  };
}
