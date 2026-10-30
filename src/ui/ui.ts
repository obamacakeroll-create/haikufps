import { clampNumeric, type NumericKey, type Settings } from '../core/settings';
import type { Controls } from '../input/input';
import { Menu, type MenuRow } from './menu';

/** What the death screen shows. */
export interface DeathReport {
  title: string;
  distance: number;
  seconds: number;
  kills: number;
}

export interface UiHandlers {
  onStart(): void;
  onRetry(): void;
  onResume(): void;
  onQuit(): void;
  onSettingsChanged(): void;
}

type PauseView = 'main' | 'options';

const percent = (value: number): string => `${Math.round(value * 100)}%`;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function toggleRow(label: string, get: () => boolean, set: (value: boolean) => void): MenuRow {
  const flip = (): void => set(!get());
  return { label, value: () => (get() ? 'On' : 'Off'), activate: flip, adjust: flip };
}

export class Ui {
  private readonly titleScreen: HTMLElement;
  private readonly pauseScreen: HTMLElement;
  private readonly deathScreen: HTMLElement;
  private readonly deathTitle: HTMLElement;
  private readonly deathStats: HTMLElement;
  private readonly debugPanel: HTMLElement;
  private readonly mainMenu: Menu;
  private readonly optionsMenu: Menu;
  private view: PauseView = 'main';

  constructor(
    root: HTMLElement,
    private readonly settings: Settings,
    private readonly handlers: UiHandlers,
  ) {
    this.titleScreen = element('section', 'screen title-screen');
    this.titleScreen.append(
      element('h1', 'logo', 'HAIKUFPS'),
      element('p', 'tagline', 'Ink canyon. Keep moving.'),
      element('p', 'prompt', 'Press any button or click to start'),
      element('p', 'hint', 'PS5 DualSense: connect over USB or Bluetooth, then press any button'),
    );
    this.titleScreen.addEventListener('click', () => handlers.onStart());

    this.mainMenu = new Menu([
      { label: 'Resume', activate: () => handlers.onResume() },
      { label: 'Options', activate: () => this.showView('options') },
      { label: 'Quit to title', activate: () => handlers.onQuit() },
    ]);
    this.optionsMenu = new Menu(this.buildOptionRows());

    this.pauseScreen = element('section', 'screen pause-screen');
    this.pauseScreen.append(
      element('h2', 'heading', 'Paused'),
      this.mainMenu.element,
      this.optionsMenu.element,
    );

    this.deathTitle = element('h2', 'heading', 'The tide caught you');
    this.deathStats = element('p', 'death-stats');
    this.deathScreen = element('section', 'screen death-screen');
    this.deathScreen.append(
      this.deathTitle,
      this.deathStats,
      element('p', 'prompt', 'Jump or click to run again'),
      element('p', 'hint', 'Pause or back for the title'),
    );
    this.deathScreen.addEventListener('click', () => handlers.onRetry());

    this.debugPanel = element('pre', 'debug');
    this.debugPanel.hidden = true;

    root.append(this.titleScreen, this.pauseScreen, this.deathScreen, this.debugPanel);
    this.hideAll();
  }

  get debugVisible(): boolean {
    return !this.debugPanel.hidden;
  }

  toggleDebug(): void {
    this.debugPanel.hidden = !this.debugPanel.hidden;
  }

  setDebugText(text: string): void {
    this.debugPanel.textContent = text;
  }

  showTitle(): void {
    this.hideAll();
    this.titleScreen.hidden = false;
    this.view = 'main';
  }

  showPause(): void {
    this.hideAll();
    this.pauseScreen.hidden = false;
    this.showView('main');
  }

  showDeath(report: DeathReport): void {
    this.hideAll();
    const minutes = Math.floor(report.seconds / 60);
    const secs = Math.floor(report.seconds % 60).toString().padStart(2, '0');
    this.deathTitle.textContent = report.title;
    this.deathStats.textContent = `${Math.floor(report.distance)} m in ${minutes}:${secs}  |  ${report.kills} kills`;
    this.deathScreen.hidden = false;
  }

  hideAll(): void {
    this.titleScreen.hidden = true;
    this.pauseScreen.hidden = true;
    this.deathScreen.hidden = true;
  }

  /** Returns 'retry' or 'title' when the player picks an option on the death screen. */
  updateDeath(controls: Controls): 'retry' | 'title' | undefined {
    if (controls.pressed('pause') || controls.pressed('back')) return 'title';
    if (controls.pressed('confirm') || controls.pressed('fire') || controls.pressed('jump')) return 'retry';
    return undefined;
  }

  /** Returns 'resume' when the player leaves the pause menu. */
  updatePaused(controls: Controls): 'resume' | undefined {
    if (controls.pressed('pause')) return 'resume';
    if (controls.pressed('back')) {
      if (this.view === 'options') {
        this.showView('main');
        return undefined;
      }
      return 'resume';
    }
    (this.view === 'options' ? this.optionsMenu : this.mainMenu).update(controls);
    return undefined;
  }

  private showView(view: PauseView): void {
    this.view = view;
    this.mainMenu.element.hidden = view !== 'main';
    this.optionsMenu.element.hidden = view !== 'options';
    if (view === 'main') this.mainMenu.resetFocus();
    else this.optionsMenu.resetFocus();
  }

  private commit(): void {
    this.handlers.onSettingsChanged();
    this.optionsMenu.refresh();
  }

  private numericRow(
    label: string,
    key: NumericKey,
    step: number,
    format: (value: number) => string,
  ): MenuRow {
    const nudge = (direction: -1 | 1): void => {
      this.settings[key] = clampNumeric(key, this.settings[key] + direction * step);
      this.commit();
    };
    return {
      label,
      value: () => format(this.settings[key]),
      activate: () => nudge(1),
      adjust: nudge,
    };
  }

  private buildOptionRows(): MenuRow[] {
    const settings = this.settings;
    return [
      {
        label: 'Aim',
        value: () => (settings.aimMode === 'hold' ? 'Hold' : 'Toggle'),
        activate: () => this.cycleAim(),
        adjust: () => this.cycleAim(),
      },
      this.numericRow('Mouse sensitivity', 'mouseSensitivity', 0.01, (v) => v.toFixed(2)),
      this.numericRow('Stick sensitivity', 'stickSensitivity', 10, (v) => `${v.toFixed(0)}°/s`),
      this.numericRow('Stick dead zone', 'stickDeadzone', 0.02, (v) => v.toFixed(2)),
      toggleRow(
        'Invert Y',
        () => settings.invertY,
        (value) => {
          settings.invertY = value;
          this.commit();
        },
      ),
      this.numericRow('Field of view', 'fov', 1, (v) => `${v.toFixed(0)}°`),
      this.numericRow('Master volume', 'masterVolume', 0.05, percent),
      this.numericRow('Music volume', 'musicVolume', 0.05, percent),
      this.numericRow('Sound effects volume', 'sfxVolume', 0.05, percent),
      toggleRow(
        'Rumble',
        () => settings.rumble,
        (value) => {
          settings.rumble = value;
          this.commit();
        },
      ),
      toggleRow(
        'Reduced motion',
        () => settings.reducedMotion,
        (value) => {
          settings.reducedMotion = value;
          this.commit();
        },
      ),
      { label: 'Back', activate: () => this.showView('main') },
    ];
  }

  private cycleAim(): void {
    this.settings.aimMode = this.settings.aimMode === 'hold' ? 'toggle' : 'hold';
    this.commit();
  }
}
