// The profile panel (docs/accounts-spec.md section 14): a person's name, stats and match history,
// newest first with "Load more", each match opening to all 8 final boards, whose people's names
// open their profiles. What it shows is worked out in profile.ts; this draws it.

import type { ItemId } from '@lotr-tactics/sim';
import { UNITS } from '@lotr-tactics/sim';
import type { AccountView } from '@lotr-tactics/server';
import type { Stats } from '../account.js';
import { TRAIT_ICONS } from '../icons.js';
import {
  favouriteTraits,
  favouriteUnits,
  games,
  historyRow,
  matchBoards,
  statTiles,
  type BoardTrait,
  type BoardUnit,
  type HistoryRow,
  type ProfileBrowser,
  type ProfileEntry,
  type SeatBoard,
} from '../profile.js';
import { ownedUnitTip, textTip, traitTip } from '../tips.js';
import { guestMark, itemChip, traitBadge } from '../ui/chips.js';
import { el, icon, starBadge } from '../ui/dom.js';
import { setTip } from '../ui/tooltip.js';

export interface ProfileActions {
  /** Back to the profile before, or to the menu from the first. */
  back(): void;
}

/** What the panel last drew, so it is drawn again only when something changes. */
let drawn = '';

/** Draws the profile on top of the browser's stack, keeping the place it was scrolled to and the focus. */
export function renderProfile(panel: HTMLElement, browser: ProfileBrowser, me: AccountView | null, actions: ProfileActions): void {
  const entry = browser.current;
  if (entry === null) return;
  const key = `${browser.version}|${me?.id}|${me?.name}`;
  if (drawn === key && panel.childElementCount > 0) return;
  const same = panel.dataset.entry === String(browserEntryId(entry));
  drawn = key;
  const scroller = panel.querySelector<HTMLElement>('.profile-body');
  const scrolled = same ? (scroller?.scrollTop ?? 0) : 0;
  const focused = same && panel.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focus : undefined;
  panel.dataset.entry = String(browserEntryId(entry));
  panel.replaceChildren(head(entry, browser, me, actions), body(entry, browser, me));
  panel.querySelector<HTMLElement>('.profile-body')!.scrollTop = scrolled;
  if (focused !== undefined) panel.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focused)}"]`)?.focus();
  else if (!same) panel.querySelector<HTMLElement>('.profile-back')?.focus();
}

/** A number for each profile entry, so the panel knows when another profile comes on screen. */
const entryIds = new WeakMap<ProfileEntry, number>();
let nextEntryId = 1;
function browserEntryId(entry: ProfileEntry): number {
  let id = entryIds.get(entry);
  if (id === undefined) {
    id = nextEntryId++;
    entryIds.set(entry, id);
  }
  return id;
}

function head(entry: ProfileEntry, browser: ProfileBrowser, me: AccountView | null, actions: ProfileActions): HTMLElement {
  const own = entry.account === null || entry.account === me?.id;
  const name = entry.profile?.name ?? entry.hint?.name ?? (own ? (me?.name ?? '') : '');
  const guest = entry.profile?.guest ?? entry.hint?.guest ?? (own ? me?.claimed === false : false);
  const back = el('button', 'btn btn-ghost btn-sm profile-back', icon('back'), browser.canGoBack ? 'Back' : 'Menu');
  back.dataset.focus = 'back';
  back.addEventListener('click', actions.back);
  return el(
    'div',
    'profile-head',
    el(
      'div',
      'profile-title-block',
      el('p', 'eyebrow', icon('profile'), own ? 'Your profile' : 'Profile'),
      el('h2', '', el('span', 'profile-name', name), guest ? guestMark() : null),
    ),
    back,
  );
}

function body(entry: ProfileEntry, browser: ProfileBrowser, me: AccountView | null): HTMLElement {
  const content = el('div', 'profile-body');
  if (entry.error !== null) {
    content.append(el('p', 'profile-error', icon('alert'), el('span', '', entry.error)));
    return content;
  }
  const { profile } = entry;
  if (profile === null) {
    content.append(el('p', 'profile-loading', 'Loading the profile…'));
    return content;
  }
  content.append(statsSection(profile.stats));
  content.append(el('h3', 'profile-section', icon('history'), 'Match history'));
  const list = entry.history;
  const owner = profile.id;
  const now = new Date();
  if (list.matches.length > 0) {
    content.append(
      el(
        'ol',
        'match-list',
        ...list.matches.map((match) => {
          const row = historyRow(match, now);
          const open = entry.open.has(match.id);
          return el(
            'li',
            `match-item${open ? ' open' : ''}`,
            matchRow(row, open, () => browser.toggle(match.id)),
            open ? boards(matchBoards(match, owner, me?.id ?? null), browser) : null,
          );
        }),
      ),
    );
  } else if (!list.loading && list.error === null) {
    content.append(el('p', 'profile-empty', 'No online games yet. Games in private lobbies show here once they end.'));
  }
  if (list.loading) content.append(el('p', 'profile-loading', 'Loading matches…'));
  else if (list.error !== null) content.append(el('p', 'profile-error', icon('alert'), el('span', '', list.error)));
  if (list.more && !list.loading) {
    const more = el('button', 'btn btn-secondary btn-block load-more', icon('chevron'), 'Load more');
    more.dataset.focus = 'more';
    more.addEventListener('click', () => browser.more());
    content.append(more);
  }
  return content;
}

function statsSection(stats: Stats): HTMLElement {
  const units = favouriteUnits(stats);
  const traits = favouriteTraits(stats);
  return el(
    'div',
    'profile-stats',
    el(
      'div',
      'stat-tiles',
      ...statTiles(stats).map((tile) => el('div', 'stat-tile', el('span', 'stat-value', tile.value), el('span', 'stat-label', tile.label))),
    ),
    units.length + traits.length === 0
      ? null
      : el(
          'div',
          'favourites',
          el(
            'div',
            'favourite-group',
            el('h4', '', 'Most played units'),
            el(
              'div',
              'favourite-list',
              ...units.map((u) => {
                const chip = el('span', `favourite unit-favourite cost-${u.cost}`, portrait(u.unit), el('span', 'fav-name', u.name), el('span', 'fav-games', String(u.games)));
                chip.tabIndex = 0;
                setTip(chip, textTip(u.name, `On the final board in ${games(u.games)}.`));
                return chip;
              }),
            ),
          ),
          el(
            'div',
            'favourite-group',
            el('h4', '', 'Most played traits'),
            el(
              'div',
              'favourite-list',
              ...traits.map((t) => {
                const chip = el('span', 'favourite', traitBadge(t.trait, 'gold', 'sm'), el('span', 'fav-name', t.name), el('span', 'fav-games', String(t.games)));
                chip.tabIndex = 0;
                setTip(chip, { ...traitTip(t.trait), note: { text: `Active on the final board in ${games(t.games)}.`, reason: false } });
                return chip;
              }),
            ),
          ),
        ),
  );
}

function matchRow(row: HistoryRow, open: boolean, toggle: () => void): HTMLElement {
  const button = el(
    'button',
    'match-row',
    el('span', `match-place${row.medal === null ? '' : ` medal-${row.medal}`}`, row.medal === null ? null : icon('medal'), el('span', '', row.placeText)),
    el(
      'span',
      'match-info',
      el('span', 'match-kind', `${row.kind} · ${row.round}`, row.points === null ? null : el('span', 'match-points', ` · ${row.points}`)),
      el('span', 'match-when', [row.when, row.duration].filter((t) => t !== '').join(' · '), row.left ? el('span', 'tag', 'Left') : null),
    ),
    el('span', 'match-units', ...row.units.map((u) => miniUnit(u))),
    icon('chevron', 'chev'),
  );
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', `${row.placeText} place, ${row.kind}, ${row.when}. ${open ? 'Hide' : 'Show'} the final boards.`);
  button.dataset.focus = `match-${row.id}`;
  button.addEventListener('click', toggle);
  return button;
}

/** All 8 final boards of a match, by place. */
function boards(seats: readonly SeatBoard[], browser: ProfileBrowser): HTMLElement {
  return el('div', 'match-boards', ...seats.map((seat) => seatBoard(seat, browser)));
}

function seatBoard(seat: SeatBoard, browser: ProfileBrowser): HTMLElement {
  let name: HTMLElement;
  if (seat.link !== null) {
    const link = seat.link;
    name = el('button', 'seat-board-name link', seat.name);
    name.dataset.focus = `link-${seat.seat}-${link}`;
    name.addEventListener('click', () => browser.open(link, { name: seat.name, guest: seat.guest }));
    setTip(name, textTip(seat.name, `Open ${seat.name}'s profile.`));
  } else {
    name = el('span', 'seat-board-name', seat.name);
  }
  const kindIcon = seat.kind === 'bot' ? 'bot' : seat.kind === 'deleted' ? 'empty' : 'person';
  return el(
    'div',
    `seat-board${seat.owner ? ' owner' : ''}${seat.you ? ' you' : ''}`,
    el(
      'div',
      'seat-board-head',
      el('span', `rank${seat.medal === null ? '' : ` medal-${seat.medal}`}`, seat.placeText),
      el('span', 'seat-board-who', icon(kindIcon), name, seat.guest ? guestMark() : null, seat.left ? el('span', 'tag', 'Left') : null),
      levelBadge(seat.level),
    ),
    seat.traits.length === 0 ? null : el('div', 'seat-traits', ...seat.traits.map((t) => traitPill(t, seat.you ? null : seat.name))),
    seat.units.length === 0 ? el('p', 'seat-empty', 'No units on the board.') : el('div', 'seat-units', ...seat.units.map(finalUnit)),
  );
}

function levelBadge(level: number): HTMLElement {
  const badge = el('span', 'level-badge seat-level', String(level));
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', `Level ${level}`);
  setTip(badge, textTip(`Level ${level}`, 'Their level at the end.'));
  return badge;
}

function traitPill(t: BoardTrait, owner: string | null): HTMLElement {
  const pill = el('span', `trait-pill tone-${t.tone}`, traitBadge(t.trait, t.tone, 'sm'), el('span', 'trait-pill-count', String(t.count)));
  pill.tabIndex = 0;
  pill.setAttribute('aria-label', `${t.name}: ${t.count}`);
  setTip(pill, traitTip(t.trait, { count: t.count, level: t.level, tone: t.tone }, owner));
  return pill;
}

/** A unit on a final board: its portrait with its star level, name, items and the One Ring if it wore it. */
function finalUnit(u: BoardUnit): HTMLElement {
  const tile = el(
    'div',
    `final-unit cost-${u.cost}${u.ring ? ' ring' : ''}`,
    el('span', 'final-portrait', portrait(u.unit), starBadge(u.star, 'final-star'), u.ring ? el('span', 'final-ring', icon('one-ring')) : null),
    el('span', 'final-name', u.name),
    u.items.length === 0 ? null : el('span', 'final-items', ...u.items.map((id: ItemId) => itemChip(id, 'sm'))),
  );
  tile.tabIndex = 0;
  tile.setAttribute('aria-label', `${u.name}, ${u.star} star${u.ring ? ', wore the One Ring' : ''}`);
  const tip = ownedUnitTip({ id: 0, unitId: u.unit, star: u.star, items: u.items });
  setTip(tile, u.ring ? { ...tip, body: [...(tip.body ?? []), { text: 'Wore the One Ring in the last fight.' }] } : tip);
  return tile;
}

/** A small unit portrait for a history row: the origin's icon on the cost's colour, with the star level. */
function miniUnit(u: BoardUnit): HTMLElement {
  const mini = el('span', `mini-unit cost-${u.cost} star-${u.star}${u.ring ? ' ring' : ''}`, portrait(u.unit));
  mini.setAttribute('aria-hidden', 'true');
  return mini;
}

/** A unit's portrait: its origin's icon on its cost's colour, as shop cards show it. */
function portrait(unit: BoardUnit['unit']): HTMLElement {
  return el('span', `portrait-icon cost-${UNITS[unit].cost}`, icon(TRAIT_ICONS[UNITS[unit].origin]));
}
