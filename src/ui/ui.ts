import { clampNumeric, type NumericKey, type Settings } from '../core/settings';
import { type Action, type InputDevice } from '../input/actions';
import type { Controls } from '../input/input';
import { type Stats } from '../meta/progress';
import { type RunRecord } from '../meta/records';
import { glyph } from './glyphs';
import { Menu, type MenuRow } from './menu';

/** What the death screen shows. */
export interface DeathReport {
  title: string;
  distance: number;
  seconds: number;
  kills: number;
  /** Place on the leaderboard, or undefined when the run did not make it. */
  place: number | undefined;
  newBest: boolean;
  /** Meters ahead of (positive) or behind the ghost at the same moment. Undefined when not racing. */
  ghostDelta: number | undefined;
}

export interface UnlockView {
  readonly title: string;
  readonly goal: string;
  readonly effect: string;
  readonly earned: boolean;
}

/** What the title screen shows about the player's progress. */
export interface ProgressView {
  readonly records: readonly RunRecord[];
  readonly stats: Stats;
  readonly unlocks: readonly UnlockView[];
}

export interface UiHandlers {
  onStart(): void;
  onRetry(): void;
  onResume(): void;
  onQuit(): void;
  onSettingsChanged(): void;
}

type PauseView = 'main' | 'options';
type TitleView = 'main' | 'options' | 'leaderboard' | 'unlocks';

/** Any of these starts a run straight from the title, without going through the menu. */
const START_ACTIONS: readonly Action[] = ['fire', 'jump', 'dash', 'reload', 'aim'];

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
  private readonly deathNotes: HTMLElement;
  private readonly deathPrompt: HTMLElement;
  private readonly deathHint: HTMLElement;
  private readonly titlePrompt: HTMLElement;
  private readonly titleStats: HTMLElement;
  private readonly titleMenu: Menu;
  private readonly titleOptions: Menu;
  private readonly titleBack: Menu;
  private readonly leaderboardPanel: HTMLElement;
  private readonly unlocksPanel: HTMLElement;
  private titleView: TitleView = 'main';
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
    this.titleStats = element('p', 'title-stats');
    this.titlePrompt = element('p', 'prompt', 'Press any button or click to start');
    this.titleMenu = new Menu([
      { label: 'Start run', activate: () => handlers.onStart() },
      { label: 'Leaderboard', activate: () => this.showTitleView('leaderboard') },
      { label: 'Unlocks', activate: () => this.showTitleView('unlocks') },
      { label: 'Options', activate: () => this.showTitleView('options') },
    ]);
    this.titleOptions = new Menu(this.buildOptionRows(() => this.showTitleView('main')));
    this.leaderboardPanel = element('div', 'panel');
    this.unlocksPanel = element('div', 'panel');
    this.titleBack = new Menu([{ label: 'Back', activate: () => this.showTitleView('main') }]);
    this.titleScreen.append(
      element('h1', 'logo', 'HAIKUFPS'),
      element('p', 'tagline', 'Ink canyon. Keep moving.'),
      this.titleStats,
      this.titlePrompt,
      this.titleMenu.element,
      this.titleOptions.element,
      this.leaderboardPanel,
      this.unlocksPanel,
      this.titleBack.element,
      element('p', 'hint', 'PS5 DualSense: connect over USB or Bluetooth, then press any button'),
    );
    // Buttons and panels handle their own clicks. Anywhere else on the title starts a run.
    this.titleScreen.addEventListener('click', (event) => {
      if (this.titleView !== 'main') return;
      if (event.target instanceof Element && event.target.closest('button, .panel')) return;
      handlers.onStart();
    });

    this.mainMenu = new Menu([
      { label: 'Resume', activate: () => handlers.onResume() },
      { label: 'Options', activate: () => this.showView('options') },
      { label: 'Quit to title', activate: () => handlers.onQuit() },
    ]);
    this.optionsMenu = new Menu(this.buildOptionRows(() => this.showView('main')));

    this.pauseScreen = element('section', 'screen pause-screen');
    this.pauseScreen.append(
      element('h2', 'heading', 'Paused'),
      this.mainMenu.element,
      this.optionsMenu.element,
    );

    this.deathTitle = element('h2', 'heading', 'The tide caught you');
    this.deathStats = element('p', 'death-stats');
    this.deathNotes = element('p', 'death-notes');
    this.deathPrompt = element('p', 'prompt', 'Jump or click to run again');
    this.deathHint = element('p', 'hint', 'Pause or back for the title');
    this.deathScreen = element('section', 'screen death-screen');
    this.deathScreen.append(this.deathTitle, this.deathStats, this.deathNotes, this.deathPrompt, this.deathHint);
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

  /** Shows the title with the player's progress. Starts on the main menu. */
  showTitle(progress: ProgressView): void {
    this.hideAll();
    this.titleScreen.hidden = false;
    this.renderProgress(progress);
    this.showTitleView('main');
  }

  /** Feedback on the title, pause, and death screens. Prompts name the buttons for the active device. */
  setDevice(device: InputDevice): void {
    this.deathPrompt.textContent = `Press ${glyph('jump', device)} or click to run again`;
    this.deathHint.textContent = `${glyph('back', device)} for the title`;
  }

  /** Title input. Starts a run on a start button, and otherwise drives the title menus. */
  updateTitle(controls: Controls): void {
    if (this.titleView !== 'main') {
      if (controls.pressed('back')) this.showTitleView('main');
      else (this.titleView === 'options' ? this.titleOptions : this.titleBack).update(controls);
      return;
    }
    if (START_ACTIONS.some((action) => controls.pressed(action))) {
      this.handlers.onStart();
      return;
    }
    this.titleMenu.update(controls);
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
    const notes: string[] = [];
    if (report.newBest) notes.push('New best');
    if (report.place !== undefined) notes.push(`Leaderboard #${report.place}`);
    if (report.ghostDelta !== undefined) {
      const sign = report.ghostDelta >= 0 ? '+' : '';
      notes.push(`Ghost ${sign}${Math.round(report.ghostDelta)} m`);
    }
    this.deathNotes.textContent = notes.join('  ·  ');
    this.deathNotes.hidden = notes.length === 0;
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
    this.titleOptions.refresh();
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

  private buildOptionRows(back: () => void): MenuRow[] {
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
      toggleRow(
        'Race your ghost',
        () => settings.raceGhost,
        (value) => {
          settings.raceGhost = value;
          this.commit();
        },
      ),
      { label: 'Back', activate: back },
    ];
  }

  private showTitleView(view: TitleView): void {
    this.titleView = view;
    this.titleMenu.element.hidden = view !== 'main';
    this.titleOptions.element.hidden = view !== 'options';
    this.leaderboardPanel.hidden = view !== 'leaderboard';
    this.unlocksPanel.hidden = view !== 'unlocks';
    this.titleBack.element.hidden = view !== 'leaderboard' && view !== 'unlocks';
    this.titlePrompt.hidden = view !== 'main';
    this.titleStats.hidden = view !== 'main';
    if (view === 'main') this.titleMenu.resetFocus();
    else if (view === 'options') this.titleOptions.resetFocus();
    else this.titleBack.resetFocus();
  }

  private renderProgress(progress: ProgressView): void {
    const { stats, records, unlocks } = progress;
    this.titleStats.textContent =
      stats.runs === 0
        ? 'No runs yet'
        : `Best ${Math.floor(stats.bestDistance)} m  |  ${stats.runs} runs  |  ${stats.totalKills} kills`;

    this.leaderboardPanel.replaceChildren();
    if (records.length === 0) {
      this.leaderboardPanel.append(element('p', 'empty', 'No runs yet. Go run.'));
    }
    records.forEach((record, index) => {
      const minutes = Math.floor(record.seconds / 60);
      const secs = Math.floor(record.seconds % 60).toString().padStart(2, '0');
      const date = new Date(record.date).toLocaleDateString();
      const line = `${Math.floor(record.distance)} m  ${minutes}:${secs}  ${record.kills} kills  ${date}`;
      this.leaderboardPanel.append(element('p', 'row', `${index + 1}. ${line}`));
    });

    this.unlocksPanel.replaceChildren();
    for (const unlock of unlocks) {
      const card = element('div', unlock.earned ? 'unlock is-earned' : 'unlock');
      card.append(
        element('p', 'unlock-title', `${unlock.title}  ${unlock.earned ? 'Unlocked' : 'Locked'}`),
        element('p', 'unlock-goal', unlock.earned ? unlock.effect : unlock.goal),
      );
      this.unlocksPanel.append(card);
    }
  }

  private cycleAim(): void {
    this.settings.aimMode = this.settings.aimMode === 'hold' ? 'toggle' : 'hold';
    this.commit();
  }
}
