// Draws a `Tip` (tips.ts) as the tooltip card's contents: a header with an icon, title and
// subtitle, then a recipe, stats, traits, text, trait breakpoints, a trait's units, shop odds and a
// hint or reason.

import { ITEMS, TRAITS, UNITS } from '@lotr-tactics/sim';
import { TRAIT_ICONS } from '../icons.js';
import type { Tip, TipIcon } from '../tips.js';
import type { TraitUnit } from '../traits.js';
import { itemChip, ringChip, traitBadge } from './chips.js';
import { el, icon, kbd } from './dom.js';

function headerIcon(tipIcon: TipIcon): HTMLElement {
  switch (tipIcon.kind) {
    case 'icon':
      return el('span', 'tip-glyph', icon(tipIcon.name));
    case 'item':
      return itemChip(tipIcon.id, 'lg', false);
    case 'ring':
      return ringChip(tipIcon.corruption, 'lg', false);
    case 'trait':
      return traitBadge(tipIcon.trait, tipIcon.tone, 'lg');
  }
}

export function tipCard(tip: Tip): Node[] {
  const nodes: Node[] = [
    el(
      'div',
      'tip-head',
      tip.icon === undefined ? null : headerIcon(tip.icon),
      el('div', 'tip-titles', el('div', 'tip-title', tip.title), tip.subtitle === undefined ? null : el('div', 'tip-subtitle', tip.subtitle)),
      tip.key === undefined ? null : kbd(tip.key),
    ),
  ];
  if (tip.recipe !== undefined) {
    const [a, b] = tip.recipe;
    nodes.push(
      el(
        'div',
        'tip-recipe',
        itemChip(a!, 'sm', false),
        el('span', '', ITEMS[a!].name),
        el('span', 'plus', '+'),
        itemChip(b!, 'sm', false),
        el('span', '', ITEMS[b!].name),
      ),
    );
  }
  if (tip.traits !== undefined && tip.traits.length > 0) {
    nodes.push(el('div', 'tip-traits', ...tip.traits.map((t) => el('span', 'tip-trait', traitBadge(t, null, 'sm'), TRAITS[t].name))));
  }
  if (tip.stats !== undefined && tip.stats.length > 0) {
    nodes.push(el('ul', 'tip-stats', ...tip.stats.map((s) => el('li', '', s))));
  }
  if (tip.ability !== undefined) {
    const { name, mana, lines } = tip.ability;
    nodes.push(
      el(
        'div',
        'tip-ability',
        el('div', 'tip-ability-head', icon('ability'), el('span', 'tip-ability-name', name), mana === null ? null : el('span', 'tip-ability-mana', mana)),
        ...lines.map((line) => el('p', 'tip-ability-text', line)),
      ),
    );
  }
  for (const line of tip.body ?? []) nodes.push(el('p', line.bad === true ? 'tip-text bad' : 'tip-text', line.text));
  if (tip.levels !== undefined && tip.levels.length > 0) {
    nodes.push(el('ol', 'tip-levels', ...tip.levels.map((l) => el('li', l.active ? 'active' : '', el('b', '', String(l.count)), el('span', '', l.text)))));
  }
  if (tip.units !== undefined && tip.units.length > 0) nodes.push(el('div', 'tip-units', ...tip.units.map(traitUnitTile)));
  if (tip.odds !== undefined && tip.odds.length > 0) {
    const costs = tip.odds[0]!.percents.map((_, i) => i + 1);
    nodes.push(
      el(
        'div',
        'tip-odds',
        el('span', 'tip-odds-title', 'Shop odds'),
        ...costs.map((cost) => el('span', `tip-odds-cost cost-${cost}`, icon('coin'), String(cost))),
        ...tip.odds.flatMap((row) => [
          el('span', row.now ? 'tip-odds-level now' : 'tip-odds-level', el('span', 'level-badge', row.label)),
          ...row.percents.map((pct, i) => {
            const trend = row.trend[i] ?? null;
            const cell = el('span', `tip-odds-pct cost-${i + 1}${pct === 0 ? ' zero' : ''}${row.now ? ' now' : ''}${trend === null ? '' : ` ${trend}`}`, pct === 0 ? '–' : `${pct}%`);
            if (trend !== null) cell.append(el('i', 'tip-odds-trend', trend === 'up' ? '▲' : '▼'));
            return cell;
          }),
        ]),
      ),
    );
  }
  if (tip.note !== undefined) {
    nodes.push(el('p', tip.note.reason ? 'tip-note reason' : 'tip-note', tip.note.reason ? icon('alert') : null, tip.note.text));
  }
  return nodes;
}

/**
 * One of a trait's units: framed by cost with its origin's icon, lit when a copy is on the board,
 * half lit when copies are only on the bench, greyed when none are owned, with a pip per copy. A
 * unit that is a Nazgûl through a Ring of the Nine shows the ring.
 */
function traitUnitTile(unit: TraitUnit): HTMLElement {
  const owned = unit.stars.length > 0;
  return el(
    'div',
    `tip-unit cost-${unit.cost}${unit.onBoard ? ' on-board' : owned ? ' on-bench' : ' missing'}`,
    icon(TRAIT_ICONS[UNITS[unit.id].origin], 'emblem'),
    el('span', 'tip-unit-name', unit.name),
    el('span', 'tip-unit-cost', String(unit.cost)),
    owned ? el('span', 'owned', ...unit.stars.map((star) => el('i', `star-${star}`))) : null,
    unit.nine ? itemChip('ring-of-the-nine', 'sm', false) : null,
  );
}
