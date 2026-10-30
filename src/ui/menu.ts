import type { Controls } from '../input/input';

export interface MenuRow {
  label: string;
  /** Current value shown on the right. Omit for plain buttons. */
  value?: () => string;
  /** Runs on confirm or click. Choice rows use this to step forward. */
  activate: () => void;
  /** Runs on left or right. Omit for rows that ignore horizontal input. */
  adjust?: (direction: -1 | 1) => void;
}

/** Keyboard, gamepad, and mouse navigable list of rows. */
export class Menu {
  readonly element: HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly values: HTMLElement[] = [];
  private focus = 0;

  constructor(private readonly rows: readonly MenuRow[]) {
    this.element = document.createElement('div');
    this.element.className = 'menu';

    rows.forEach((row, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-row';

      const label = document.createElement('span');
      label.className = 'menu-label';
      label.textContent = row.label;

      const value = document.createElement('span');
      value.className = 'menu-value';

      button.append(label, value);
      button.addEventListener('mouseenter', () => this.setFocus(index));
      button.addEventListener('click', () => {
        this.setFocus(index);
        row.activate();
        this.refresh();
      });

      this.buttons.push(button);
      this.values.push(value);
      this.element.append(button);
    });

    this.setFocus(0);
    this.refresh();
  }

  resetFocus(): void {
    this.setFocus(0);
  }

  update(controls: Controls): void {
    const count = this.rows.length;
    if (controls.pressed('up')) this.setFocus((this.focus + count - 1) % count);
    if (controls.pressed('down')) this.setFocus((this.focus + 1) % count);

    const row = this.rows[this.focus];
    if (row !== undefined) {
      if (controls.pressed('left')) row.adjust?.(-1);
      if (controls.pressed('right')) row.adjust?.(1);
      if (controls.pressed('confirm')) row.activate();
    }
    this.refresh();
  }

  refresh(): void {
    this.rows.forEach((row, index) => {
      const value = this.values[index];
      if (value !== undefined) value.textContent = row.value?.() ?? '';
    });
  }

  private setFocus(index: number): void {
    this.focus = index;
    this.buttons.forEach((button, i) => button.classList.toggle('is-focused', i === this.focus));
  }
}
