// The damage meter's panel (docs/viewer-spec.md section 8), on both pages: a button opens and
// closes it, and it remembers whether it was open and which tab was picked. What it shows comes
// from meter.ts.

import type { CombatEvent, Team } from '@lotr-tactics/sim';
import { METER_TABS, meterRows, type MeterPart, type MeterRow, type MeterTab } from '../meter.js';
import { textTip } from '../tips.js';
import { displayName } from '../units.js';
import { el, icon, rebuild, show } from './dom.js';
import { setTip } from './tooltip.js';

const SAVED_KEY = 'lotr-tactics-meter';

const PART_NAMES: Record<MeterPart, string> = {
  physical: 'Physical',
  magic: 'Magic',
  true: 'True',
  heal: 'Healing',
  shield: 'Shielding',
};

/** What the meter shows: a fight's events so far, and the team whose units are listed. */
export interface MeterSource {
  readonly events: readonly CombatEvent[];
  readonly team: Team;
}

export class MeterPanel {
  private open: boolean;
  private tab: MeterTab;
  private readonly rows = el('div', 'meter-rows');
  /** What the rows were last worked out from, to do it again only when something changed. */
  private shown: { events: readonly CombatEvent[] | null; count: number; tab: MeterTab; team: Team | null } = {
    events: null,
    count: 0,
    tab: 'dealt',
    team: null,
  };

  /** With `teamChoice`, the panel has its own switch between teams A and B, and `render` ignores the source's team. */
  constructor(
    private readonly panel: HTMLElement,
    private readonly button: HTMLElement,
    private readonly teamChoice: boolean,
  ) {
    const saved = readSaved();
    this.open = saved.open;
    this.tab = saved.tab;
    const close = el('button', 'btn btn-ghost btn-sm btn-icon meter-close', icon('cross'));
    close.setAttribute('aria-label', 'Close the damage meter');
    close.addEventListener('click', () => this.setOpen(false));
    const head = el('div', 'meter-head', el('h3', 'side-title', icon('blade'), 'Damage'), teamChoice ? this.segmented('meter-team', 'Team', [['A', 'A'], ['B', 'B']], 'A', () => undefined) : null, close);
    const tabs = this.segmented(
      'meter-tab',
      'Show',
      METER_TABS.map(({ tab, label }) => [tab, label]),
      this.tab,
      (value) => {
        this.tab = value as MeterTab;
        this.save();
      },
    );
    tabs.classList.add('meter-tabs');
    panel.replaceChildren(head, tabs, this.rows);
    button.addEventListener('click', () => this.setOpen(!this.open));
    button.setAttribute('aria-pressed', String(this.open));
  }

  /** Draws the meter for a fight, or hides it when there is none. Cheap when nothing changed. */
  render(source: MeterSource | null): void {
    show(this.panel, this.open && source !== null);
    if (!this.open || source === null) return;
    const team = this.teamChoice ? this.pickedTeam() : source.team;
    const { shown } = this;
    if (shown.events === source.events && shown.count === source.events.length && shown.tab === this.tab && shown.team === team) return;
    this.shown = { events: source.events, count: source.events.length, tab: this.tab, team };
    const rows = meterRows(source.events, team, this.tab);
    rebuild(this.rows, JSON.stringify([rows, this.tab]), () =>
      rows.length === 0 ? [el('p', 'side-empty', 'No units in this fight.')] : rows.map((row) => meterRow(row, rows[0]!.total)),
    );
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.button.setAttribute('aria-pressed', String(open));
    this.save();
  }

  private pickedTeam(): Team {
    return this.panel.querySelector<HTMLInputElement>('input[name="meter-team"]:checked')?.value === 'B' ? 'B' : 'A';
  }

  private segmented(name: string, legend: string, options: readonly (readonly [string, string])[], checked: string, change: (value: string) => void): HTMLFieldSetElement {
    const fieldset = el('fieldset', 'segmented', el('legend', '', legend));
    for (const [value, label] of options) {
      const input = el('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = value === checked;
      input.addEventListener('change', () => change(value));
      fieldset.append(el('label', '', input, el('span', '', label)));
    }
    return fieldset;
  }

  private save(): void {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify({ open: this.open, tab: this.tab }));
    } catch {
      // It just isn't remembered.
    }
  }
}

function meterRow(row: MeterRow, most: number): HTMLElement {
  const name = displayName(row.unitId);
  const bar = el('span', 'meter-bar');
  for (const { part, amount } of row.parts) {
    const share = el('i', `part-${part}`);
    share.style.width = `${(amount / most) * 100}%`;
    bar.append(share);
  }
  const item = el(
    'div',
    `meter-row${row.dead ? ' dead' : ''}`,
    el('span', 'meter-name', name, el('span', 'meter-star', '★'.repeat(row.star))),
    el('span', 'meter-total', amountText(row.total)),
    bar,
  );
  item.tabIndex = 0;
  item.setAttribute('aria-label', `${name}: ${amountText(row.total)}`);
  setTip(item, textTip(name, ...(row.parts.length === 0 ? ['Nothing yet.'] : row.parts.map(({ part, amount }) => `${PART_NAMES[part]}: ${amountText(amount)}`))));
  return item;
}

function amountText(amount: number): string {
  return Math.round(amount).toLocaleString('en-US');
}

function readSaved(): { open: boolean; tab: MeterTab } {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') as { open?: unknown; tab?: unknown };
    return { open: saved.open === true, tab: METER_TABS.some((t) => t.tab === saved.tab) ? (saved.tab as MeterTab) : 'dealt' };
  } catch {
    return { open: false, tab: 'dealt' };
  }
}
