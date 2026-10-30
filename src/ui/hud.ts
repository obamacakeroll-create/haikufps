import { TIDE } from '../game/tide';

export interface HudState {
  distance: number;
  gap: number;
  fuel: number;
  dashReady: boolean;
  /** Warning text for the current reshape phase. Empty when there is nothing to warn about. */
  warning: string;
}

/** Gap below this many meters turns the tide meter into a warning. */
const DANGER_GAP = 8;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function bar(label: string, fillClass: string): { row: HTMLElement; fill: HTMLElement; value: HTMLElement } {
  const row = element('div', 'hud-meter');
  const name = element('span', 'hud-label');
  name.textContent = label;
  const track = element('div', 'hud-track');
  const fill = element('div', `hud-fill ${fillClass}`);
  track.append(fill);
  const value = element('span', 'hud-value');
  row.append(name, track, value);
  return { row, fill, value };
}

/** Run readouts shown during play: distance, the tide's gap, jetpack fuel, and dash readiness. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly distance: HTMLElement;
  private readonly tide: ReturnType<typeof bar>;
  private readonly fuel: ReturnType<typeof bar>;
  private readonly dash: HTMLElement;
  private readonly warning: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = element('section', 'hud');
    this.root.hidden = true;

    this.distance = element('p', 'hud-distance');
    this.warning = element('p', 'hud-warning');
    this.tide = bar('TIDE', 'hud-fill-tide');
    this.fuel = bar('JET', 'hud-fill-fuel');
    this.dash = element('p', 'hud-dash');
    this.dash.textContent = 'DASH';

    const side = element('div', 'hud-side');
    side.append(this.tide.row, this.fuel.row, this.dash);
    this.root.append(this.distance, this.warning, side);
    parent.append(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(state: HudState): void {
    this.distance.textContent = `${Math.floor(state.distance)} m`;

    this.tide.fill.style.width = `${(Math.min(state.gap, TIDE.maxGap) / TIDE.maxGap) * 100}%`;
    this.tide.fill.classList.toggle('is-danger', state.gap < DANGER_GAP);
    this.tide.value.textContent = `${state.gap.toFixed(0)} m`;

    this.fuel.fill.style.width = `${state.fuel * 100}%`;
    this.fuel.value.textContent = `${Math.round(state.fuel * 100)}%`;

    this.dash.classList.toggle('is-ready', state.dashReady);

    this.warning.textContent = state.warning;
    this.warning.hidden = state.warning === '';
  }
}
