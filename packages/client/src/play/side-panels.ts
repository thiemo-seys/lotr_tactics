// The play page's side panels (docs/game-spec.md section 12): the trait tracker on the left, from
// the sim's count of the person's board, and the players list on the right with the person's
// Gifts under it.

import { GIFTS, type PlayerView } from '@lotr-tactics/sim';
import { ordinal, type PlayFlow } from '../flow.js';
import { plural } from '../hud.js';
import { GIFT_TIER_ICONS } from '../icons.js';
import { playerRows, type PlayerRow } from '../players.js';
import { giftTip, textTip, traitTip } from '../tips.js';
import { traitRows, type TraitRow } from '../traits.js';
import { traitBadge } from '../ui/chips.js';
import { el, icon, rebuild } from '../ui/dom.js';
import { setTip } from '../ui/tooltip.js';

/** The view the trait tracker last showed: a new one comes with each state from the game. */
let tracked: PlayerView | null = null;

/** The trait tracker: every trait on the person's board, active ones first. */
export function renderTraits(panel: HTMLElement, p: PlayerView): void {
  if (p === tracked) return;
  tracked = p;
  const rows = traitRows(p.board, p.gifts);
  rebuild(panel, JSON.stringify(rows), () => [
    el('h3', 'side-title', icon('board'), 'Traits'),
    ...(rows.length === 0 ? [el('p', 'side-empty', 'Place units on the board to start traits.')] : rows.map(traitRow)),
  ]);
}

function traitRow(row: TraitRow): HTMLElement {
  const steps = el(
    'span',
    'trait-steps',
    ...row.breakpoints.flatMap((count, i) => [
      ...(i > 0 ? [el('i', '', '›')] : []),
      el('b', i === row.level ? 'reached' : count <= row.count ? 'passed' : '', String(count)),
    ]),
  );
  const item = el(
    'div',
    `trait-row ${row.tone === null ? 'inactive' : `tone-${row.tone}`}`,
    traitBadge(row.trait, row.tone),
    el('span', 'trait-text', el('span', 'trait-name', row.name), steps),
    el('span', 'trait-count', String(row.count)),
  );
  item.tabIndex = 0;
  item.setAttribute('aria-label', `${row.name}: ${row.count}${row.level === null ? ', not active' : `, active at ${row.breakpoints[row.level]}`}`);
  setTip(item, traitTip(row.trait, row));
  return item;
}

let listed: { state: unknown; lobby: unknown } = { state: null, lobby: null };

/** The players list, in standings order, with the person's Gifts under it. */
export function renderPlayers(panel: HTMLElement, flow: PlayFlow): void {
  const s = flow.state!;
  if (listed.state === s && listed.lobby === flow.lobby) return;
  listed = { state: s, lobby: flow.lobby };
  const rows = playerRows(s.players, flow.lobby?.seats, flow.you, s.ring, (seat) => flow.seatName(seat));
  rebuild(panel, JSON.stringify([rows, s.ring.corruption, s.me.gifts]), () => [
    el('h3', 'side-title', icon('person'), 'Players'),
    el('div', 'player-list', ...rows.map((row) => playerRow(row, s.ring.corruption))),
    ...yourGifts(s.me),
  ]);
}

function playerRow(row: PlayerRow, corruption: number): HTMLElement {
  // The winner has a place too, but isn't out.
  const out = row.placement !== null && row.placement > 1;
  const badges = el(
    'span',
    'badges',
    row.ringHolder ? el('span', 'badge ring', icon('one-ring')) : null,
    row.streak === null || row.streak.length < 2 ? null : el('span', `badge streak ${row.streak.kind}`, icon(row.streak.kind === 'win' ? 'streak-win' : 'streak-loss'), String(row.streak.length)),
    row.away ? el('span', 'badge away', icon('away')) : null,
  );
  const item = el(
    'div',
    `player-row hp-${row.hpBand}${row.you ? ' you' : ''}${out ? ' out' : ''}${row.placement === 1 ? ' winner' : ''}`,
    el('span', 'who', icon(row.bot ? 'bot' : 'person')),
    el('span', 'pname', row.name),
    badges,
    el('span', 'lvl', String(row.level)),
    row.placement !== null ? el('span', 'place', ordinal(row.placement)) : el('span', 'hp-num', String(Math.max(0, row.hp))),
    el('span', 'hp-bar', el('i', '', '')),
  );
  (item.querySelector('.hp-bar i') as HTMLElement).style.width = `${Math.round(row.hpShare * 100)}%`;
  item.tabIndex = 0;
  setTip(
    item,
    textTip(
      row.name,
      row.placement === 1 ? 'The winner.' : out ? `Out in ${ordinal(row.placement!)} place.` : `${plural(row.hp, 'HP', 'HP')} · level ${row.level}`,
      ...(row.bot ? ['A bot.'] : row.away ? ['Away: a bot plays for them until they are back.'] : []),
      ...(row.streak === null ? [] : [`${plural(row.streak.length, row.streak.kind === 'win' ? 'win' : 'loss', row.streak.kind === 'win' ? 'wins' : 'losses')} in a row.`]),
      ...(row.ringHolder ? [`Holds the One Ring, at Corruption ${corruption}.`] : []),
      ...(row.gifts.length > 0 ? [`Gifts: ${row.gifts.map((g) => GIFTS[g].name).join(', ')}.`] : []),
    ),
  );
  return item;
}

/** The person's Gifts, each with its tier's icon and what it does when hovered. */
function yourGifts(p: PlayerView): HTMLElement[] {
  if (p.gifts.length === 0) return [];
  return [
    el('h3', 'side-title', icon('brooch'), 'Your Gifts'),
    el(
      'div',
      'gift-list',
      ...p.gifts.map((id) => {
        const tier = GIFTS[id].tier;
        const gift = el('div', `gift-chip tier-${tier}`, icon(GIFT_TIER_ICONS[tier]), el('span', '', GIFTS[id].name));
        gift.tabIndex = 0;
        setTip(gift, giftTip(id));
        return gift;
      }),
    ),
  ];
}
