import { clampNumeric, type NumericKey, type Settings } from '../core/settings';
import type { Controls } from '../input/input';
import { Menu, type MenuRow } from './menu';

export interface UiHandlers {
  onStart(): void;
  onResume(): void;
  onQuit(): void;
  onSettingsChanged(): void;
}

type PauseView = 'main' | 'options';

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

    this.debugPanel = element('pre', 'debug');
    this.debugPanel.hidden = true;

    root.append(this.titleScreen, this.pauseScreen, this.debugPanel);
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
    this.titleScreen.hidden = false;
    this.pauseScreen.hidden = true;
    this.view = 'main';
  }

  showPause(): void {
    this.titleScreen.hidden = true;
    this.pauseScreen.hidden = false;
    this.showView('main');
  }

  hideAll(): void {
    this.titleScreen.hidden = true;
    this.pauseScreen.hidden = true;
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
