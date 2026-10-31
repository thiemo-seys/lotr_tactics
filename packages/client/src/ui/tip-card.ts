// Draws a `Tip` (tips.ts) as the tooltip card's contents: a header with an icon, title and
// subtitle, then a recipe, stats, traits, text, trait breakpoints and a hint or reason.

import { ITEMS, TRAITS } from '@lotr-tactics/sim';
import type { Tip, TipIcon } from '../tips.js';
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
  for (const line of tip.body ?? []) nodes.push(el('p', line.bad === true ? 'tip-text bad' : 'tip-text', line.text));
  if (tip.levels !== undefined && tip.levels.length > 0) {
    nodes.push(el('ol', 'tip-levels', ...tip.levels.map((l) => el('li', l.active ? 'active' : '', el('b', '', String(l.count)), el('span', '', l.text)))));
  }
  if (tip.note !== undefined) {
    nodes.push(el('p', tip.note.reason ? 'tip-note reason' : 'tip-note', tip.note.reason ? icon('alert') : null, tip.note.text));
  }
  return nodes;
}
