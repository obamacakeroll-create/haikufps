import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
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
import { Ui } from '../ui/ui';

type GameState = 'title' | 'playing' | 'paused';

const DEG = Math.PI / 180;
const PITCH_LIMIT = 1.5;
const ADS_SENSITIVITY = 0.55;
const ADS_ZOOM = 0.62;
const FLY_SPEED = 12;
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
  private readonly store: KeyValueStore = browserStore();
  private readonly settings: Settings;
  private readonly events = new Emitter<InputEvents>();
  private readonly keyboard: KeyboardMouseSource;
  private readonly gamepad: GamepadSource;
  private readonly input: InputManager;
  private readonly aim: AimState;
  private readonly ui: Ui;
  private readonly loop: Loop;
  private readonly position = new Vector3(0, 1.7, 8);
  private state: GameState = 'title';
  private yaw = 0;
  private pitch = 0;
  private adsBlend = 0;

  constructor(root: HTMLElement) {
    this.settings = loadSave(this.store).settings;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game';
    root.append(this.canvas);

    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.buildPlaceholderWorld();

    this.keyboard = new KeyboardMouseSource(this.canvas, () => this.settings);
    this.gamepad = new GamepadSource(() => this.settings);
    this.input = new InputManager([this.keyboard, this.gamepad], this.events);
    this.aim = new AimState(this.settings.aimMode);

    const uiRoot = document.createElement('div');
    uiRoot.className = 'ui';
    root.append(uiRoot);
    this.ui = new Ui(uiRoot, this.settings, {
      onStart: () => this.startFromTitle(),
      onResume: () => this.resume(),
      onQuit: () => this.quitToTitle(),
      onSettingsChanged: () => this.persist(),
    });

    this.loop = createLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    });

    window.addEventListener('resize', this.resize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    this.resize();
    this.ui.showTitle();
  }

  start(): void {
    this.loop.start();
  }

  private update(dt: number): void {
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

    // Placeholder free-fly movement. Real movement arrives with the player controller.
    const step = FLY_SPEED * dt;
    const forwardX = Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = Math.sin(this.yaw);
    this.position.x += (forwardX * controls.move.y + rightX * controls.move.x) * step;
    this.position.z += (forwardZ * controls.move.y + rightZ * controls.move.x) * step;
    if (controls.held('jump')) this.position.y += step;

    this.adsBlend += ((aiming ? 1 : 0) - this.adsBlend) * Math.min(1, dt * 14);
  }

  private render(): void {
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    if (this.ui.debugVisible) this.ui.setDebugText(this.debugText());
  }

  private updateCamera(): void {
    const fov = this.settings.fov * (1 - (1 - ADS_ZOOM) * this.adsBlend);
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch, -this.yaw, 0, 'YXZ');
  }

  private debugText(): string {
    const calls = this.renderer.info.render.calls;
    const triangles = this.renderer.info.render.triangles;
    const { x, y, z } = this.position;
    return [
      `fps ${this.loop.stats.fps.toFixed(0)}   frame ${this.loop.stats.frameMs.toFixed(1)} ms`,
      `draw calls ${calls}   triangles ${triangles}`,
      `state ${this.state}   device ${this.input.device}`,
      `aim ${this.settings.aimMode}   ${this.aim.active ? 'ON' : 'off'}`,
      `pos ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)}`,
    ].join('\n');
  }

  private startFromTitle(): void {
    if (this.state !== 'title') return;
    this.state = 'playing';
    this.ui.hideAll();
    this.requestLock();
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
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  };

  /** Stand-in geometry so the camera and aim have something to look at. Replaced in milestone 2. */
  private buildPlaceholderWorld(): void {
    const rng = createRng(7);
    const floor = new Mesh(
      new PlaneGeometry(400, 400),
      new MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const crate = new BoxGeometry(1, 1, 1);
    const material = new MeshStandardMaterial({ color: 0xc86b3c, roughness: 0.6 });
    for (let i = 0; i < 120; i++) {
      const mesh = new Mesh(crate, material);
      mesh.position.set(rng.range(-60, 60), rng.range(0.5, 4), rng.range(-120, 20));
      mesh.scale.setScalar(rng.range(0.6, 3));
      this.scene.add(mesh);
    }

    this.scene.background = new Color(0x0b0c10);
    this.scene.fog = new Fog(0x0b0c10, 30, 160);
    this.scene.add(new HemisphereLight(0xbfd8ff, 0x1a1408, 1.2));
    const sun = new DirectionalLight(0xffe2b8, 2.2);
    sun.position.set(20, 40, 10);
    this.scene.add(sun);
  }
}
