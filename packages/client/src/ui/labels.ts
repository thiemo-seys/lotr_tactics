// The overlay above each unit (docs/viewer-spec.md section 4): a name plate with star pips, the
// unit's items and the One Ring, and in fights a health bar with ticks for chunks of health and the
// shield after it, a mana bar and status icons. `update` runs every frame, so it only writes to the
// DOM when a value has changed, and allocates nothing otherwise.

import type { ItemId, Star, Team, UnitState } from '@lotr-tactics/sim';
import { STATUS_ICONS } from '../icons.js';
import { itemChip, ringChip } from './chips.js';
import { el, icon } from './dom.js';

/** Health per tick mark on a health bar, and per heavier mark. */
export const HEALTH_CHUNK = 250;
const HEALTH_BLOCK = 1000;

export interface LabelOptions {
  /** Null for the summons that have no name. */
  readonly name: string | null;
  /** Null for summons, which have no star level. */
  readonly star: Star | null;
  /** The near team (A) or the far one. */
  readonly look: Team;
  readonly items: readonly ItemId[];
  /** The One Ring's Corruption on its bearer. */
  readonly ring: number | null;
  /** Health, mana and statuses, shown in fights. */
  readonly bars: boolean;
  readonly mana: boolean;
}

const STATUSES = ['stun', 'stunImmune', 'untargetable'] as const;
const STATUS_NAMES = { stun: 'Stunned', stunImmune: "Can't be stunned", untargetable: 'Untargetable' } as const;

export class UnitLabel {
  readonly element: HTMLElement;
  private readonly bar: HTMLElement | null = null;
  private readonly health: HTMLElement | null = null;
  private readonly shield: HTMLElement | null = null;
  private readonly manaFill: HTMLElement | null = null;
  private readonly statusIcons: HTMLElement[] = [];
  /** What the DOM shows now. */
  private shown = { health: -1, shield: -1, total: -1, mana: -1, statuses: -1 };

  constructor(options: LabelOptions) {
    this.element = el('div', `unit-label team-${options.look}`);
    if (options.name !== null || options.star !== null) {
      const plate = el('div', 'plate');
      if (options.name !== null) plate.append(el('span', 'name', options.name));
      if (options.star !== null) {
        const pips = el('span', `pips star-${options.star}`);
        pips.setAttribute('role', 'img');
        pips.setAttribute('aria-label', `${options.star} star`);
        for (let i = 0; i < options.star; i++) pips.append(el('i'));
        plate.append(pips);
      }
      this.element.append(plate);
    }
    if (options.bars) {
      this.health = el('i', 'fill');
      this.shield = el('i', 'shield');
      this.bar = el('div', 'bar health', this.health, this.shield);
      this.element.append(this.bar);
      if (options.mana) {
        this.manaFill = el('i', 'fill');
        this.element.append(el('div', 'bar mana', this.manaFill));
      }
      const statuses = el('div', 'statuses');
      for (const status of STATUSES) {
        const badge = el('span', `status ${status}`, icon(STATUS_ICONS[status]));
        badge.setAttribute('role', 'img');
        badge.setAttribute('aria-label', STATUS_NAMES[status]);
        badge.hidden = true;
        statuses.append(badge);
        this.statusIcons.push(badge);
      }
      this.element.append(statuses);
    }
    if (options.items.length > 0 || options.ring !== null) {
      const row = el('div', 'items');
      if (options.ring !== null) row.append(ringChip(options.ring, 'sm'));
      for (const id of options.items) row.append(itemChip(id, 'sm'));
      this.element.append(row);
    }
  }

  /** Shows a fighting unit's health, shield, mana and statuses. */
  update(unit: UnitState): void {
    if (this.bar === null) return;
    const shield = unit.statuses.shield;
    const total = Math.max(unit.stats.maxHealth, unit.health + shield);
    const shown = this.shown;
    if (total !== shown.total) {
      // Tick marks every chunk of health, heavier every block, as a share of the bar.
      this.bar.style.setProperty('--chunk', `${(100 * HEALTH_CHUNK) / total}%`);
      this.bar.style.setProperty('--block', `${(100 * HEALTH_BLOCK) / total}%`);
    }
    if (unit.health !== shown.health || total !== shown.total) this.health!.style.width = `${(100 * unit.health) / total}%`;
    if (shield !== shown.shield || total !== shown.total) this.shield!.style.width = `${(100 * shield) / total}%`;
    shown.health = unit.health;
    shown.shield = shield;
    shown.total = total;
    if (this.manaFill !== null && unit.mana !== shown.mana) {
      shown.mana = unit.mana;
      this.manaFill.style.width = `${(100 * unit.mana) / unit.base.maxMana}%`;
    }
    let statuses = 0;
    for (let i = 0; i < STATUSES.length; i++) if (unit.statuses.has(STATUSES[i]!)) statuses |= 1 << i;
    if (statuses !== shown.statuses) {
      shown.statuses = statuses;
      for (let i = 0; i < STATUSES.length; i++) this.statusIcons[i]!.hidden = (statuses & (1 << i)) === 0;
    }
  }
}
