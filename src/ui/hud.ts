import { WEAPONS } from '../combat/weapons';
import { TIDE } from '../game/tide';

export interface HudState {
  distance: number;
  gap: number;
  fuel: number;
  dashReady: boolean;
  /** Warning text for the current reshape phase. Empty when there is nothing to warn about. */
  warning: string;
  /** 0 to 1. */
  health: number;
  weaponIndex: number;
  ammo: number;
  reloading: boolean;
  kills: number;
  aiming: boolean;
}

/** Gap below this many meters turns the tide meter into a warning. */
const DANGER_GAP = 8;
/** Health below this fraction turns the health meter into a warning. */
const DANGER_HEALTH = 0.3;

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

function bar(label: string, fillClass: string): { row: HTMLElement; fill: HTMLElement; value: HTMLElement } {
  const row = element('div', 'hud-meter');
  const name = element('span', 'hud-label', label);
  const track = element('div', 'hud-track');
  const fill = element('div', `hud-fill ${fillClass}`);
  track.append(fill);
  const value = element('span', 'hud-value');
  row.append(name, track, value);
  return { row, fill, value };
}

/** Restarts a CSS animation by removing the class, forcing a reflow, and adding it back. */
function pulse(node: HTMLElement, className: string): void {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

/** Run readouts shown during play: distance, kills, the tide, health, fuel, weapon, and the crosshair. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly distance: HTMLElement;
  private readonly kills: HTMLElement;
  private readonly warning: HTMLElement;
  private readonly tide: ReturnType<typeof bar>;
  private readonly health: ReturnType<typeof bar>;
  private readonly fuel: ReturnType<typeof bar>;
  private readonly dash: HTMLElement;
  private readonly weaponName: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly pips: HTMLElement[];
  private readonly crosshair: HTMLElement;
  private readonly damage: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = element('section', 'hud');
    this.root.hidden = true;

    this.distance = element('p', 'hud-distance');
    this.kills = element('p', 'hud-kills');
    this.warning = element('p', 'hud-warning');
    this.tide = bar('TIDE', 'hud-fill-tide');
    this.health = bar('HP', 'hud-fill-health');
    this.fuel = bar('JET', 'hud-fill-fuel');
    this.dash = element('p', 'hud-dash', 'DASH');

    const side = element('div', 'hud-side');
    side.append(this.tide.row, this.health.row, this.fuel.row, this.dash);

    this.weaponName = element('p', 'hud-weapon-name');
    this.ammo = element('p', 'hud-ammo');
    const pipRow = element('div', 'hud-pips');
    this.pips = WEAPONS.map((weapon, i) => {
      const pip = element('span', 'hud-pip', String(i + 1));
      pip.title = weapon.name;
      pipRow.append(pip);
      return pip;
    });
    const weapon = element('div', 'hud-weapon');
    weapon.append(this.weaponName, this.ammo, pipRow);

    this.damage = element('div', 'hud-damage');
    this.crosshair = element('div', 'crosshair');
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      this.crosshair.append(element('span', `tick tick-${edge}`));
    }
    this.crosshair.append(element('span', 'dot'));

    this.root.append(this.damage, this.distance, this.kills, this.warning, this.crosshair, side, weapon);
    parent.append(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** Crosshair flash for a hit. A kill flashes differently, so it reads at a glance. */
  hit(kill: boolean): void {
    pulse(this.crosshair, kill ? 'is-kill' : 'is-hit');
  }

  /** Red wash over the screen when the player takes damage. */
  hurt(): void {
    pulse(this.damage, 'is-on');
  }

  update(state: HudState): void {
    this.distance.textContent = `${Math.floor(state.distance)} m`;
    this.kills.textContent = `${state.kills} KILLS`;

    this.tide.fill.style.width = `${(Math.min(state.gap, TIDE.maxGap) / TIDE.maxGap) * 100}%`;
    this.tide.fill.classList.toggle('is-danger', state.gap < DANGER_GAP);
    this.tide.value.textContent = `${state.gap.toFixed(0)} m`;

    this.health.fill.style.width = `${state.health * 100}%`;
    this.health.fill.classList.toggle('is-danger', state.health < DANGER_HEALTH);
    this.health.value.textContent = `${Math.ceil(state.health * 100)}`;

    this.fuel.fill.style.width = `${state.fuel * 100}%`;
    this.fuel.value.textContent = `${Math.round(state.fuel * 100)}%`;

    this.dash.classList.toggle('is-ready', state.dashReady);

    this.warning.textContent = state.warning;
    this.warning.hidden = state.warning === '';

    const weapon = WEAPONS[state.weaponIndex];
    if (weapon !== undefined) {
      this.weaponName.textContent = weapon.name;
      this.ammo.textContent = state.reloading ? 'RELOADING' : `${state.ammo} / ${weapon.magazine}`;
      this.ammo.classList.toggle('is-warn', state.reloading || state.ammo === 0);
    }
    this.pips.forEach((pip, i) => pip.classList.toggle('is-active', i === state.weaponIndex));
    this.crosshair.classList.toggle('is-ads', state.aiming);
  }
}
