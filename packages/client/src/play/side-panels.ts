// The play page's side panels (docs/game-spec.md section 12): the trait tracker on the left, from
// the sim's count of the board on screen, the person's or another player's they are looking at, or
// the person's side while their fight plays, and the players list on the right with the person's
// Gifts under it, as they were in planning while the fight plays (PlayFlow.shownView). A player's
// row shows their board when clicked.

import { GIFTS, type PlayerView } from '@lotr-tactics/sim';
import { ordinal, type PlayFlow, type TrackedTeam } from '../flow.js';
import { plural } from '../hud.js';
import { GIFT_TIER_ICONS } from '../icons.js';
import { playerRows, type PlayerRow } from '../players.js';
import { giftTip, textTip, traitTip } from '../tips.js';
import { traitRows, traitUnits, type TraitRow } from '../traits.js';
import { traitBadge } from '../ui/chips.js';
import { el, icon, rebuild } from '../ui/dom.js';
import { setTip } from '../ui/tooltip.js';

/** What the trait tracker last showed: a new team comes with each state from the game, and each fight. */
let tracked: { team: TrackedTeam | null; owner: string | null } = { team: null, owner: null };

/**
 * The trait tracker: every trait on a board, or the person's side in a fight, active ones first.
 * `owner` names the player whose board it is when it isn't the person's own.
 */
export function renderTraits(panel: HTMLElement, team: TrackedTeam, owner: string | null = null): void {
  if (team === tracked.team && owner === tracked.owner) return;
  tracked = { team, owner };
  const rows = traitRows(team.board, team.gifts);
  panel.setAttribute('aria-label', owner === null ? 'Traits on your board' : `Traits on ${owner}'s board`);
  rebuild(panel, JSON.stringify([rows, owner]), () => [
    el('h3', 'side-title', icon('board'), 'Traits', owner === null ? null : el('span', 'side-owner', icon('viewer'), el('span', '', owner))),
    ...(rows.length === 0
      ? [el('p', 'side-empty', owner === null ? 'Place units on the board to start traits.' : `${owner} has no units on the board.`)]
      : rows.map((row) => traitRow(row, owner))),
  ]);
}

function traitRow(row: TraitRow, owner: string | null): HTMLElement {
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
  // The rows are rebuilt only when the counts change, so the trait's units are read from the board
  // and bench on screen when hovered: buying or benching a unit changes them without changing a row.
  setTip(item, () => traitTip(row.trait, row, owner, tracked.team === null ? undefined : traitUnits(row.trait, tracked.team)));
  return item;
}

let listed: { state: unknown; lobby: unknown; viewing: string } = { state: null, lobby: null, viewing: '' };

/** The players list, in standings order, with the person's Gifts under it. Clicking a player shows their board. */
export function renderPlayers(panel: HTMLElement, flow: PlayFlow): void {
  // As it was in planning while the person's fight plays, so it doesn't give the outcome away.
  const s = flow.shownView();
  // Which boards can be looked at, and whose is on screen.
  const viewing = `${flow.canViewBoards}-${flow.viewed()?.seat ?? flow.you}`;
  if (listed.state === s && listed.lobby === flow.lobby && listed.viewing === viewing) return;
  listed = { state: s, lobby: flow.lobby, viewing };
  const rows = playerRows(s.players, flow.lobby?.seats, flow.you, s.ring, (seat) => flow.seatName(seat));
  const shown = flow.viewed()?.seat ?? flow.you;
  // Rebuilding the rows would lose the keyboard's place in the list, so it is given back after.
  const focused = panel.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.seat : undefined;
  rebuild(panel, JSON.stringify([rows, s.ring.corruption, s.me.gifts, viewing]), () => [
    el('h3', 'side-title', icon('person'), 'Players'),
    el(
      'div',
      'player-list',
      ...rows.map((row) => {
        const view = flow.canViewBoard(row.seat) ? { shown: row.seat === shown, open: () => flow.viewBoard(row.seat) } : null;
        return playerRow(row, s.ring.corruption, view);
      }),
    ),
    ...yourGifts(s.me),
  ]);
  if (focused !== undefined) panel.querySelector<HTMLElement>(`.player-row[data-seat="${focused}"]`)?.focus();
}

/** A row's board: whether it is the one on screen, and how to show it. */
interface RowBoard {
  readonly shown: boolean;
  readonly open: () => void;
}

function playerRow(row: PlayerRow, corruption: number, board: RowBoard | null): HTMLElement {
  // The winner has a place too, but isn't out.
  const out = row.placement !== null && row.placement > 1;
  const badges = el(
    'span',
    'badges',
    row.ringHolder ? el('span', 'badge ring', icon('one-ring')) : null,
    row.streak === null || row.streak.length < 2 ? null : el('span', `badge streak ${row.streak.kind}`, icon(row.streak.kind === 'win' ? 'streak-win' : 'streak-loss'), String(row.streak.length)),
    row.away ? el('span', 'badge away', icon('away')) : null,
    board?.shown === true && !row.you ? el('span', 'badge viewing', icon('viewer')) : null,
  );
  const item = el(
    'div',
    `player-row hp-${row.hpBand}${row.you ? ' you' : ''}${out ? ' out' : ''}${row.placement === 1 ? ' winner' : ''}${board === null ? '' : ' viewable'}${board?.shown === true ? ' shown' : ''}`,
    el('span', 'who', icon(row.bot ? 'bot' : 'person')),
    el('span', 'pname', row.name),
    badges,
    el('span', 'lvl', String(row.level)),
    row.placement !== null ? el('span', 'place', ordinal(row.placement)) : el('span', 'hp-num', String(Math.max(0, row.hp))),
    el('span', 'hp-bar', el('i', '', '')),
  );
  (item.querySelector('.hp-bar i') as HTMLElement).style.width = `${Math.round(row.hpShare * 100)}%`;
  item.tabIndex = 0;
  item.dataset.seat = String(row.seat);
  if (board !== null) {
    item.setAttribute('role', 'button');
    item.setAttribute('aria-pressed', String(board.shown));
    item.addEventListener('click', board.open);
    item.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      board.open();
    });
  }
  const look = board === null || board.shown ? [] : [row.you ? 'Click to go back to your board.' : 'Click to see their board and traits.'];
  setTip(
    item,
    textTip(
      row.name,
      row.placement === 1 ? 'The winner.' : out ? `Out in ${ordinal(row.placement!)} place.` : `${plural(row.hp, 'HP', 'HP')} · level ${row.level}`,
      ...(row.bot ? ['A bot.'] : row.away ? ['Away: a bot plays for them until they are back.'] : []),
      ...(row.streak === null ? [] : [`${plural(row.streak.length, row.streak.kind === 'win' ? 'win' : 'loss', row.streak.kind === 'win' ? 'wins' : 'losses')} in a row.`]),
      ...(row.ringHolder ? [`Holds the One Ring, at Corruption ${corruption}.`] : []),
      ...(row.gifts.length > 0 ? [`Gifts: ${row.gifts.map((g) => GIFTS[g].name).join(', ')}.`] : []),
      ...look,
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
