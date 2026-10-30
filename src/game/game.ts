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
import { clamp } from '../core/math';
import { createLoop, type Loop } from '../core/loop';
import { createRng } from '../core/rng';
import { SAVE_VERSION, loadSave, type SaveData, writeSave } from '../core/save';
import { type Settings } from '../core/settings';
import { browserStore, type KeyValueStore } from '../core/storage';
import { AudioEngine } from '../audio/engine';
import { Music } from '../audio/music';
import { Sfx } from '../audio/sfx';
import { difficulty } from '../combat/spawner';
import { type WeaponId } from '../combat/weapons';
import { type InputDevice } from '../input/actions';
import { GhostRecorder, type GhostPose, type GhostTrack, sampleGhost } from '../meta/ghost';
import { loadoutFor, type Loadout, recordRun, UNLOCKS } from '../meta/progress';
import { addRecord, placeOf, type RunRecord, scoreRun } from '../meta/records';
import { GhostView } from '../render/ghost-view';
import type { Action } from '../input/actions';
import { AimState } from '../input/aim';
import { GamepadSource } from '../input/gamepad';
import { type Controls, InputManager, type InputEvents } from '../input/input';
import { KeyboardMouseSource } from '../input/keyboard-mouse';
import { BODY } from '../player/movement';
import { createMottleTexture, createPaperTexture, createSplatTexture } from '../procgen/textures';
import { createLighting, SUN_DIRECTION, type Lighting } from '../render/lighting';
import { BEAUTY_ONLY_LAYER } from '../render/layers';
import { PALETTE } from '../render/palette';
import { RenderPipeline } from '../render/pipeline';
import { createSky, type Sky } from '../render/sky';
import { createToonRamp } from '../render/toon';
import { Viewmodel } from '../render/viewmodel';
import { Hud } from '../ui/hud';
import { type ProgressView, Ui } from '../ui/ui';
import { Run, type RunAssets, type RunCause } from './run';

type GameState = 'title' | 'playing' | 'paused' | 'dead';

const DEG = Math.PI / 180;
const PITCH_LIMIT = 1.5;
const ADS_SENSITIVITY = 0.55;
const ADS_ZOOM = 0.62;
const ADS_MOVE_SCALE = 0.85;
/** Camera shake in radians while the canyon is reshaping. */
const RESHAPE_SHAKE = 0.012;
/** Camera shake in radians when the player takes damage. */
const HURT_SHAKE = 0.02;
const KICK_DECAY = 10;
const HURT_SHAKE_DECAY = 6;
/** Seconds after death before input can restart. Stops a held button from restarting at once. */
const DEATH_DELAY = 0.6;
const MAX_PIXEL_RATIO = 1.5;
const WEAPON_KEYS: readonly Action[] = ['weapon1', 'weapon2', 'weapon3'];
const WEAPON_ACTIONS: readonly Action[] = ['weaponNext', 'weaponPrev', ...WEAPON_KEYS];
/** How each shot feels: camera kick in radians, gun kick from 0 to 1, and rumble. */
const SHOT_FEEL: Readonly<
  Record<WeaponId, { pitch: number; gun: number; rumble: readonly [strong: number, weak: number, ms: number] }>
> = {
  rifle: { pitch: 0.006, gun: 0.25, rumble: [0.08, 0.15, 40] },
  scatter: { pitch: 0.035, gun: 1, rumble: [0.5, 0.4, 120] },
  bomb: { pitch: 0.02, gun: 0.6, rumble: [0.25, 0.3, 90] },
};
const CAUSE_TITLE: Readonly<Record<RunCause, string>> = {
  tide: 'The tide caught you',
  overrun: 'Overrun',
};

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(75, 1, 0.05, 400);
  private readonly pipeline: RenderPipeline;
  private readonly sky: Sky;
  private readonly lighting: Lighting;
  private readonly viewmodel: Viewmodel;
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
  private readonly engine = new AudioEngine();
  private readonly sfx = new Sfx(this.engine);
  private readonly music = new Music(this.engine);
  private run: Run;
  private save: SaveData;
  /** The ghost this run races, when the setting is on and a best run exists. */
  private raceTrack: GhostTrack | undefined;
  private recorder = new GhostRecorder();
  private readonly ghostView = new GhostView();
  private readonly ghostPose: GhostPose = { x: 0, y: 0, z: 0, yaw: 0 };
  private runReshapes = 0;
  private shownDevice: InputDevice | undefined;
  /** Camera eye at the last two simulation steps. Rendering blends between them. */
  private readonly eye = new Vector3(0, BODY.eyeHeight, 0);
  private readonly previousEye = new Vector3(0, BODY.eyeHeight, 0);
  private state: GameState = 'title';
  private yaw = 0;
  private pitch = 0;
  private adsBlend = 0;
  /** Pitch kick from the last shot, fading back to zero. */
  private kick = 0;
  /** Hurt shake, from 1 when the player takes damage, fading to zero. */
  private hurtShake = 0;
  private deadTime = 0;
  private elapsed = 0;

  constructor(root: HTMLElement) {
    this.save = loadSave(this.store);
    this.settings = this.save.settings;
    this.applyVolumes();
    // Browsers only allow sound after a real gesture, so the first click or key unlocks it.
    const unlock = (): void => this.engine.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

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
    this.assets = { ramp, mottle, splat: createSplatTexture(rng) };

    this.scene.background = null;
    this.scene.fog = new Fog(PALETTE.fog, 40, 240);
    this.sky = createSky(PALETTE.skyTop, PALETTE.skyHorizon, SUN_DIRECTION);
    this.scene.add(this.sky.mesh);
    this.lighting = createLighting(this.scene);
    this.camera.layers.enable(BEAUTY_ONLY_LAYER);
    // The camera sits in the scene so the held weapon, which is parented to it, is drawn.
    this.viewmodel = new Viewmodel(ramp);
    this.camera.add(this.viewmodel.root);
    this.scene.add(this.camera);
    this.scene.add(this.ghostView.mesh);
    this.pipeline = new RenderPipeline(this.renderer, this.scene, this.camera, paper);
    this.run = this.createRun(randomSeed(), loadoutFor(this.save.stats));

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
      onSettingsChanged: () => {
        this.persist();
        this.applyVolumes();
      },
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
    this.showTitle();
  }

  start(): void {
    this.loop.start();
  }

  private update(dt: number): void {
    this.elapsed += dt;
    this.previousEye.copy(this.eye);
    const controls = this.input.poll(dt);
    if (this.input.device !== this.shownDevice) {
      this.shownDevice = this.input.device;
      this.ui.setDevice(this.shownDevice);
    }
    if (controls.pressed('debug')) this.ui.toggleDebug();
    if (this.state !== 'playing') this.menuSounds(controls);
    this.aim.setMode(this.settings.aimMode);

    switch (this.state) {
      case 'title':
        this.ui.updateTitle(controls);
        break;
      case 'playing':
        this.updatePlaying(controls, dt);
        break;
      case 'paused':
        if (this.ui.updatePaused(controls) === 'resume') this.resume();
        break;
      case 'dead':
        this.updateDead(controls, dt);
        break;
    }
  }

  /** Menu feedback. The same buttons move the player in a run, so this only runs outside one. */
  private menuSounds(controls: Controls): void {
    if (controls.pressed('up') || controls.pressed('down')) this.sfx.ui('move');
    if (controls.pressed('confirm')) this.sfx.ui('confirm');
    if (controls.pressed('back')) this.sfx.ui('back');
  }

  private applyVolumes(): void {
    this.engine.setVolumes({
      master: this.settings.masterVolume,
      music: this.settings.musicVolume,
      sfx: this.settings.sfxVolume,
    });
  }

  private updatePlaying(controls: Controls, dt: number): void {
    if (controls.pressed('pause')) {
      this.pause();
      return;
    }
    const weaponIndex = WEAPON_KEYS.findIndex((action) => controls.pressed(action));
    const weaponStep = stepFrom(controls);
    if (WEAPON_ACTIONS.some((action) => controls.pressed(action))) this.aim.release();

    const aiming = this.aim.update(controls.held('aim'), controls.pressed('aim'));
    const sensitivity = aiming ? ADS_SENSITIVITY : 1;
    this.yaw += controls.look.x * sensitivity * DEG;
    this.pitch = clamp(this.pitch + controls.look.y * sensitivity * DEG, -PITCH_LIMIT, PITCH_LIMIT);

    const forwardX = Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = Math.sin(this.yaw);
    // The aim is the camera's forward vector, so shots land where the reticle is.
    const pitchCos = Math.cos(this.pitch);
    const { body } = this.run;
    const wasGrounded = body.grounded;
    const dashWas = body.dashTime;
    this.run.update(dt, {
      wishX: forwardX * controls.move.y + rightX * controls.move.x,
      wishZ: forwardZ * controls.move.y + rightZ * controls.move.x,
      speedScale: aiming ? ADS_MOVE_SCALE : 1,
      facingX: forwardX,
      facingZ: forwardZ,
      jumpPressed: controls.pressed('jump'),
      jumpHeld: controls.held('jump'),
      dashPressed: controls.pressed('dash'),
      fireHeld: controls.held('fire'),
      firePressed: controls.pressed('fire'),
      reloadPressed: controls.pressed('reload'),
      weaponIndex,
      weaponStep,
      aiming,
      aimX: forwardX * pitchCos,
      aimY: Math.sin(this.pitch),
      aimZ: forwardZ * pitchCos,
    });
    if (controls.pressed('jump') && wasGrounded) this.sfx.jump();
    if (body.dashTime > 0 && dashWas <= 0) this.sfx.dash();
    this.music.update(difficulty(this.run.time), this.run.gap);
    this.recorder.update(dt, this.run.body.x, this.run.body.y, this.run.body.z, this.yaw);
    this.syncEye();

    this.adsBlend += ((aiming ? 1 : 0) - this.adsBlend) * Math.min(1, dt * 14);
    const { arsenal } = this.run.combat;
    this.viewmodel.select(arsenal.index);
    this.viewmodel.update(dt, this.adsBlend, arsenal.reloadProgress);
    this.kick = Math.max(0, this.kick - KICK_DECAY * dt);
    this.hurtShake = Math.max(0, this.hurtShake - HURT_SHAKE_DECAY * dt);
    if (this.run.status === 'over') this.die();
  }

  private updateDead(controls: Controls, dt: number): void {
    this.deadTime += dt;
    if (this.deadTime < DEATH_DELAY) return;
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
    this.run.present(alpha, this.settings.reducedMotion);
    this.placeGhost();
    this.updateCamera(alpha);
    this.sky.mesh.position.copy(this.camera.position);
    this.sky.setTime(this.elapsed);
    this.lighting.follow(this.camera.position);

    const playing = this.state === 'playing';
    this.hud.setVisible(playing);
    if (playing) this.updateHud();

    this.pipeline.render();
    if (this.ui.debugVisible) this.ui.setDebugText(this.debugText());
  }

  private updateHud(): void {
    const { body, combat } = this.run;
    this.hud.update({
      distance: this.run.distance,
      gap: this.run.gap,
      fuel: body.fuel,
      dashReady: body.dashCooldown <= 0,
      warning: this.reshapeWarning(),
      health: this.run.health.fraction,
      weaponIndex: combat.arsenal.index,
      ammo: combat.arsenal.ammo,
      reloading: combat.arsenal.reloading,
      kills: combat.kills,
      aiming: this.aim.active,
    });
  }

  private updateCamera(alpha: number): void {
    const fov = this.settings.fov * (1 - (1 - ADS_ZOOM) * this.adsBlend);
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.lerpVectors(this.previousEye, this.eye, alpha);

    // Reduced motion turns every shake and kick off.
    const calm = this.settings.reducedMotion;
    const reshaping = this.run.reshapePhase !== 'idle' && !calm ? RESHAPE_SHAKE : 0;
    const hurt = calm ? 0 : this.hurtShake * HURT_SHAKE;
    const kick = calm ? 0 : this.kick;
    const shudder = this.elapsed * 60;
    this.camera.rotation.set(
      this.pitch + kick + Math.sin(shudder) * reshaping + Math.sin(this.elapsed * 90) * hurt,
      -this.yaw + Math.cos(shudder * 0.7) * reshaping + Math.cos(this.elapsed * 75) * hurt,
      0,
      'YXZ',
    );
  }

  private syncEye(): void {
    const { x, y, z } = this.run.body;
    this.eye.set(x, y + BODY.eyeHeight, z);
  }

  private createRun(seed: number, loadout: Loadout): Run {
    const run = new Run(this.scene, this.assets, seed, loadout);
    run.reshaper.events.on('settle', () => this.runReshapes++);
    // A soft pulse when the zone is marked, and a firmer one when the walls start to move.
    run.reshaper.events.on('telegraph', () => {
      this.gamepad.rumble(0.2, 0.45, 700);
      this.music.stinger('telegraph');
    });
    run.reshaper.events.on('move', () => {
      this.gamepad.rumble(0.55, 0.9, 900);
      this.music.stinger('move');
    });

    const { events } = run.combat;
    events.on('shot', ({ weapon }) => {
      this.sfx.shot(weapon);
      const feel = SHOT_FEEL[weapon];
      this.viewmodel.kick(feel.gun);
      if (!this.settings.reducedMotion) this.kick = Math.max(this.kick, feel.pitch);
      this.gamepad.rumble(feel.rumble[0], feel.rumble[1], feel.rumble[2]);
    });
    events.on('hit', ({ kill }) => {
      this.sfx.hit(kill);
      this.hud.hit(kill);
      if (kill) this.gamepad.rumble(0.35, 0.5, 120);
      else this.gamepad.rumble(0.12, 0.25, 50);
    });
    events.on('hurt', () => {
      this.sfx.hurt();
      this.hud.hurt();
      this.hurtShake = 1;
      this.gamepad.rumble(0.9, 0.5, 220);
    });
    events.on('kill', ({ kind }) => this.sfx.kill(kind));
    events.on('blast', () => {
      this.sfx.blast();
      this.gamepad.rumble(0.6, 0.6, 200);
    });
    events.on('reveal', () => {
      this.sfx.reveal();
      this.gamepad.rumble(0.7, 0.4, 260);
    });
    events.on('switch', () => this.sfx.switchWeapon());
    events.on('reload', () => this.sfx.reloadStart());
    events.on('reloaded', () => this.sfx.reloadDone());
    events.on('spit', () => this.sfx.spit());
    return run;
  }

  private reshapeWarning(): string {
    switch (this.run.reshapePhase) {
      case 'telegraph':
        return 'INK SHIFTING';
      case 'moving':
        return 'RESHAPING';
      case 'idle':
        return '';
    }
  }

  private debugText(): string {
    const { calls, triangles } = this.renderer.info.render;
    const { body, combat } = this.run;
    const dash = body.dashCooldown > 0 ? `${body.dashCooldown.toFixed(1)} s` : 'ready';
    const { arsenal } = combat;
    const reload = arsenal.reloading ? ' (reloading)' : '';
    return [
      `fps ${this.loop.stats.fps.toFixed(0)}   frame ${this.loop.stats.frameMs.toFixed(1)} ms`,
      `draw calls ${calls}   triangles ${triangles}   sections ${this.run.loadedSections}`,
      `view yaw ${((this.yaw / DEG) % 360).toFixed(0)}   pitch ${(this.pitch / DEG).toFixed(0)}`,
      `state ${this.state}   device ${this.input.device}`,
      `aim ${this.settings.aimMode}   ${this.aim.active ? 'ON' : 'off'}`,
      `run ${this.run.time.toFixed(1)} s   dist ${this.run.distance.toFixed(1)} m`,
      `speed ${this.run.forwardSpeed.toFixed(1)}   pace ${this.run.pace.toFixed(1)}   gap ${this.run.gap.toFixed(1)} m`,
      `pos ${body.x.toFixed(1)} ${body.y.toFixed(1)} ${body.z.toFixed(1)}   ${body.grounded ? 'ground' : 'air'}`,
      `fuel ${(body.fuel * 100).toFixed(0)}%   dash ${dash}`,
      `hp ${this.run.health.current.toFixed(0)}   enemies ${combat.enemyCount}   kills ${combat.kills}`,
      `weapon ${arsenal.weapon.name}   ammo ${arsenal.ammo}${reload}`,
      `reshape ${this.run.reshapePhase}`,
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
    // Racing a ghost replays its canyon, so the ghost and the player run the same course.
    const race = this.settings.raceGhost ? this.save.ghost : undefined;
    this.raceTrack = race;
    this.recorder = new GhostRecorder();
    this.runReshapes = 0;
    this.run.dispose();
    this.run = this.createRun(race?.seed ?? randomSeed(), loadoutFor(this.save.stats));
    this.yaw = 0;
    this.pitch = 0;
    this.adsBlend = 0;
    this.kick = 0;
    this.hurtShake = 0;
    this.aim.release();
    this.syncEye();
    this.previousEye.copy(this.eye);
    this.state = 'playing';
    this.ui.hideAll();
    this.requestLock();
    this.music.duck(false);
    this.music.start();
  }

  private die(): void {
    this.state = 'dead';
    this.sfx.death();
    this.music.duck(true);
    this.deadTime = 0;
    this.aim.release();
    this.ghostView.hide();

    const distance = this.run.distance;
    const kills = this.run.combat.kills;
    const seconds = this.run.time;
    const cause = this.run.cause ?? 'tide';
    const record: RunRecord = {
      distance,
      kills,
      seconds,
      score: scoreRun(distance, kills, seconds),
      seed: this.run.seed,
      cause,
      date: Date.now(),
    };
    let ghostDelta: number | undefined;
    if (this.raceTrack) {
      sampleGhost(this.raceTrack, seconds, this.ghostPose);
      // The ghost's distance is minus its z, so the gap at this moment is the sum.
      ghostDelta = distance + this.ghostPose.z;
    }

    const previousBest = this.save.stats.bestDistance;
    const records = addRecord(this.save.records, record);
    const ghost =
      this.save.ghost === undefined || distance > this.save.ghost.distance
        ? this.recorder.track(this.run.seed, distance)
        : this.save.ghost;
    this.save = {
      version: SAVE_VERSION,
      settings: this.settings,
      records,
      stats: recordRun(this.save.stats, { distance, kills, reshapes: this.runReshapes }),
      ghost,
    };
    this.persist();

    this.ui.showDeath({
      title: CAUSE_TITLE[cause],
      distance,
      seconds,
      kills,
      place: placeOf(records, record),
      newBest: distance > previousBest,
      ghostDelta,
    });
    this.exitLock();
  }

  /** Puts the ghost where the best run was at this moment. Hidden when not racing. */
  private placeGhost(): void {
    if (!this.raceTrack || this.state === 'title' || this.state === 'dead') {
      this.ghostView.hide();
      return;
    }
    this.ghostView.place(sampleGhost(this.raceTrack, this.run.time, this.ghostPose));
  }

  private showTitle(): void {
    this.ui.showTitle(this.progressView());
  }

  private progressView(): ProgressView {
    const { stats } = this.save;
    return {
      records: this.save.records,
      stats,
      unlocks: UNLOCKS.map((unlock) => ({
        title: unlock.title,
        goal: unlock.goal,
        effect: unlock.effect,
        earned: unlock.earned(stats),
      })),
    };
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.aim.release();
    this.ui.showPause();
    this.music.duck(true);
    this.exitLock();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.hideAll();
    this.requestLock();
    this.music.duck(false);
  }

  private quitToTitle(): void {
    this.state = 'title';
    this.aim.release();
    this.showTitle();
    this.music.stop();
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
    writeSave(this.store, this.save);
  }

  private readonly resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.pipeline.setSize(width, height, Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  };
}

/** +1 for the next weapon, -1 for the previous, 0 for neither pressed this step. */
/** A fresh canyon for each run that is not racing a ghost. */
function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

function stepFrom(controls: Controls): number {
  if (controls.pressed('weaponNext')) return 1;
  if (controls.pressed('weaponPrev')) return -1;
  return 0;
}
