// The profile screen's words and numbers (docs/accounts-spec.md sections 9 and 14): a person's
// stats, their match history a page at a time, and each match's 8 final boards, from what the
// server's API returns; and moving between profiles. No DOM or Three.js, so it can be tested.

import { ACCOUNTS } from '@lotr-tactics/server';
import { ITEMS, TRAITS, UNITS, type Cost, type ItemId, type Star, type TraitId, type UnitId } from '@lotr-tactics/sim';
import type { ApiResult, HistoryMatch, HistorySeat, Profile, Stats } from './account.js';
import { ordinal } from './flow.js';
import { medal } from './players.js';
import type { TraitTone } from './traits.js';

/** The name a deleted account's seats keep in other people's histories (accounts-spec.md section 5). */
export const DELETED_NAME = 'Deleted player';

export interface StatTile {
  readonly label: string;
  readonly value: string;
}

/** The stats as tiles: games, wins, top-4 rate, average place, and games bearing the One Ring. */
export function statTiles(stats: Stats): StatTile[] {
  const { games, wins, top4Rate, averagePlace } = stats.all;
  return [
    { label: 'Games', value: String(games) },
    { label: 'Wins', value: String(wins) },
    { label: 'Top 4', value: games === 0 ? '—' : `${Math.round(top4Rate * 100)}%` },
    { label: 'Average place', value: averagePlace === null ? '—' : averagePlace.toFixed(1) },
    { label: 'Ring bearer', value: String(stats.ringGames) },
  ];
}

export interface FavouriteUnit {
  readonly unit: UnitId;
  readonly name: string;
  readonly cost: Cost;
  readonly games: number;
}

export interface FavouriteTrait {
  readonly trait: TraitId;
  readonly name: string;
  readonly games: number;
}

/** The units most often on the final board, in the server's order, leaving out any the game no longer has. */
export function favouriteUnits(stats: Stats): FavouriteUnit[] {
  return stats.units.flatMap(({ unit, games }) => (isUnit(unit) ? [{ unit, name: UNITS[unit].name, cost: UNITS[unit].cost, games }] : []));
}

/** The traits most often active on the final board, in the server's order, leaving out any the game no longer has. */
export function favouriteTraits(stats: Stats): FavouriteTrait[] {
  return stats.traits.flatMap(({ trait, games }) => (isTrait(trait) ? [{ trait, name: TRAITS[trait].name, games }] : []));
}

/** "1 game", "3 games". */
export function games(n: number): string {
  return `${n} ${n === 1 ? 'game' : 'games'}`;
}

// One match in the history

export interface HistoryRow {
  readonly id: string;
  /** The profile's owner's place. */
  readonly place: number;
  readonly placeText: string;
  readonly medal: 'gold' | 'silver' | 'bronze' | null;
  readonly kind: string;
  /** When it ended. */
  readonly when: string;
  /** The round it ended on, as "Round 5-3". */
  readonly round: string;
  readonly duration: string;
  /** The owner left before the end, and a bot played their seat. */
  readonly left: boolean;
  /** The owner's final board, for a glance. */
  readonly units: readonly BoardUnit[];
  /** The owner's points change in a ranked game, such as "+32"; null otherwise. */
  readonly points: string | null;
}

const KINDS = { private: 'Private lobby', ranked: 'Ranked' } as const;

export function historyRow(match: HistoryMatch, now: Date): HistoryRow {
  const own = match.seats.find((s) => s.seat === match.seat);
  const place = own?.place ?? 0;
  return {
    id: match.id,
    place,
    placeText: place === 0 ? '—' : ordinal(place),
    medal: medal(place),
    kind: KINDS[match.kind] ?? match.kind,
    when: whenText(new Date(match.endedAt), now),
    round: `Round ${match.lastRound.stage}-${match.lastRound.round}`,
    duration: durationText(Date.parse(match.endedAt) - Date.parse(match.startedAt)),
    left: own?.left ?? false,
    units: own === undefined ? [] : boardUnits(own.board.units, own.board.ringBearer),
    points: pointsChange(own),
  };
}

function pointsChange(seat: HistorySeat | undefined): string | null {
  if (seat === undefined || seat.pointsBefore === null || seat.pointsAfter === null) return null;
  const change = seat.pointsAfter - seat.pointsBefore;
  return change > 0 ? `+${change}` : change < 0 ? `−${-change}` : '±0';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A moment in the page's time zone: "Today, 14:05", "Yesterday, 09:30", "3 Nov, 18:20", or with the year if it isn't this one. */
export function whenText(date: Date, now: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${year}, ${time}`;
}

/** How long a game took: "38 min", "1 h 5 min". */
export function durationText(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest === 0 ? '' : ` ${rest} min`}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// A match's final boards

export interface BoardUnit {
  readonly unit: UnitId;
  readonly name: string;
  readonly star: Star;
  readonly cost: Cost;
  readonly items: readonly ItemId[];
  /** Wore the One Ring in the last fight. */
  readonly ring: boolean;
}

export interface BoardTrait {
  readonly trait: TraitId;
  readonly name: string;
  readonly count: number;
  readonly breakpoints: readonly number[];
  /** The breakpoint reached, as an index into `breakpoints`. */
  readonly level: number;
  readonly tone: TraitTone;
}

export interface SeatBoard {
  readonly seat: number;
  readonly name: string;
  readonly place: number;
  readonly placeText: string;
  readonly medal: 'gold' | 'silver' | 'bronze' | null;
  readonly kind: 'person' | 'bot' | 'deleted';
  readonly guest: boolean;
  /** The account whose profile the name opens, or null for bots, deleted accounts and the profile on screen. */
  readonly link: string | null;
  /** The seat of the profile's owner. */
  readonly owner: boolean;
  /** The person looking. */
  readonly you: boolean;
  readonly left: boolean;
  readonly level: number;
  readonly units: readonly BoardUnit[];
  readonly traits: readonly BoardTrait[];
}

/**
 * All 8 seats of a match, by place, with their final boards. `profile` is the account whose
 * history it is, whose name needs no link; `you` is the person looking.
 */
export function matchBoards(match: HistoryMatch, profile: string, you: string | null): SeatBoard[] {
  return [...match.seats]
    .sort((a, b) => a.place - b.place || a.seat - b.seat)
    .map((s) => {
      const kind = s.account !== null ? 'person' : s.name === DELETED_NAME ? 'deleted' : 'bot';
      return {
        seat: s.seat,
        name: s.name,
        place: s.place,
        placeText: ordinal(s.place),
        medal: medal(s.place),
        kind,
        guest: s.guest,
        link: s.account === null || s.account === profile ? null : s.account,
        owner: s.seat === match.seat,
        you: you !== null && s.account === you,
        left: s.left,
        level: s.board.level,
        units: boardUnits(s.board.units, s.board.ringBearer),
        traits: boardTraits(s.board.traits),
      };
    });
}

/**
 * A board's units, strongest first: by star level, then cost, then name. The One Ring's wearer is
 * marked once, on the first copy of that unit, leaving out anything the game no longer has.
 */
export function boardUnits(units: FinalUnits, ringBearer: string | null): BoardUnit[] {
  const known = units.filter((u) => isUnit(u.unit));
  const wearer = ringBearer === null ? -1 : known.findIndex((u) => u.unit === ringBearer);
  return known
    .map((u, i) => {
      const def = UNITS[u.unit as UnitId];
      return {
        unit: u.unit as UnitId,
        name: def.name,
        star: u.star,
        cost: def.cost,
        items: u.items.filter((id): id is ItemId => Object.hasOwn(ITEMS, id)),
        ring: i === wearer,
      };
    })
    .sort((a, b) => b.star - a.star || b.cost - a.cost || a.name.localeCompare(b.name));
}

type FinalUnits = readonly { readonly unit: string; readonly star: Star; readonly items: readonly string[] }[];

/** A board's active traits, in the server's order, with the tone the trait tracker gives them. */
export function boardTraits(traits: readonly { readonly trait: string; readonly count: number; readonly tier: number }[]): BoardTrait[] {
  return traits.flatMap((t) => {
    if (!isTrait(t.trait)) return [];
    const { name, breakpoints } = TRAITS[t.trait];
    const level = Math.min(Math.max(t.tier - 1, 0), breakpoints.length - 1);
    const tone: TraitTone = breakpoints.length === 1 ? 'unique' : level === breakpoints.length - 1 ? 'gold' : level === 0 ? 'bronze' : 'silver';
    return [{ trait: t.trait, name, count: t.count, breakpoints, level, tone }];
  });
}

function isUnit(id: string): id is UnitId {
  return Object.hasOwn(UNITS, id);
}

function isTrait(id: string): id is TraitId {
  return Object.hasOwn(TRAITS, id);
}

// Moving between profiles

/** A profile's history, loaded a page at a time. */
export class HistoryList {
  matches: HistoryMatch[] = [];
  loading = false;
  /** The last page was short: there is nothing older. */
  done = false;
  error: string | null = null;

  /** The match to load older ones than, or null for the first page. */
  get before(): string | null {
    return this.matches.at(-1)?.id ?? null;
  }

  /** Whether "Load more" has anything to load. */
  get more(): boolean {
    return !this.done && this.matches.length > 0;
  }

  loaded(page: readonly HistoryMatch[]): void {
    const seen = new Set(this.matches.map((m) => m.id));
    this.matches.push(...page.filter((m) => !seen.has(m.id)));
    this.done = page.length < ACCOUNTS.historyPage;
    this.loading = false;
    this.error = null;
  }

  failed(error: string): void {
    this.loading = false;
    this.error = error;
  }
}

/** One profile on screen: the person's own (`account` null) or someone else's. */
export interface ProfileEntry {
  readonly account: string | null;
  /** The name to show until the profile arrives, from the link that opened it. */
  readonly hint: { readonly name: string; readonly guest: boolean } | null;
  profile: Profile | null;
  /** Why it couldn't be loaded, such as an unknown account or a guest's. */
  error: string | null;
  readonly history: HistoryList;
  /** The matches opened to their final boards. */
  readonly open: Set<string>;
}

/** What the profile screen needs of the API. */
export interface ProfileApi {
  profile(account: string | null): Promise<ApiResult<Profile>>;
  history(account: string | null, before: string | null): Promise<ApiResult<{ readonly matches: readonly HistoryMatch[] }>>;
}

/**
 * The profiles the person has opened, the last on screen, each loaded once with its first page of
 * history. Answers for a profile no longer open are dropped. `changed` is called after every
 * change, and `version` counts them, so the screen is drawn again only then.
 */
export class ProfileBrowser {
  private readonly stack: ProfileEntry[] = [];
  version = 0;

  constructor(
    private readonly api: ProfileApi,
    private readonly changed: () => void = () => {},
  ) {}

  get current(): ProfileEntry | null {
    return this.stack.at(-1) ?? null;
  }

  /** Whether there is a profile to go back to. */
  get canGoBack(): boolean {
    return this.stack.length > 1;
  }

  /** Opens a profile on top of the one on screen: null for the person's own, or an account from a link. */
  open(account: string | null, hint: ProfileEntry['hint'] = null): void {
    const entry: ProfileEntry = { account, hint, profile: null, error: null, history: new HistoryList(), open: new Set() };
    this.stack.push(entry);
    this.touch();
    const profile = this.api.profile(account).then((result) => {
      if (!this.stack.includes(entry)) return false;
      if (result.ok) entry.profile = result.value;
      else entry.error = profileError(result, hint);
      this.touch();
      return result.ok;
    });
    // The person's own history loads with their profile. Someone else's waits for theirs, which
    // may not be shown to the person, such as a guest's.
    if (account === null) this.loadMore(entry);
    else void profile.then((shown) => shown && this.loadMore(entry));
  }

  /** Back to the profile before. Returns false when there is none, and the screen should close. */
  back(): boolean {
    this.stack.pop();
    this.touch();
    return this.stack.length > 0;
  }

  close(): void {
    this.stack.length = 0;
    this.touch();
  }

  /** Loads the next page of the profile's history. */
  more(): void {
    const entry = this.current;
    if (entry !== null && entry.history.more) this.loadMore(entry);
  }

  /** Opens or closes a match's final boards. */
  toggle(match: string): void {
    const open = this.current?.open;
    if (open === undefined) return;
    if (open.has(match)) open.delete(match);
    else open.add(match);
    this.touch();
  }

  /** The person was renamed: their own profile on screen shows the new name. */
  renamed(account: string, name: string): void {
    for (const entry of this.stack) if (entry.profile?.id === account) entry.profile = { ...entry.profile, name };
    this.touch();
  }

  private loadMore(entry: ProfileEntry): void {
    const list = entry.history;
    if (list.loading) return;
    list.loading = true;
    list.error = null;
    this.touch();
    void this.api.history(entry.account, list.before).then((result) => {
      if (!this.stack.includes(entry)) return;
      if (result.ok) list.loaded(result.value.matches);
      else list.failed(result.error);
      this.touch();
    });
  }

  private touch(): void {
    this.version++;
    this.changed();
  }
}

/** Why a profile can't be shown. The server answers 404 for a guest's profile to anyone else (accounts-spec.md section 9.4). */
function profileError(result: { readonly status: number; readonly error: string }, hint: ProfileEntry['hint']): string {
  if (result.status !== 404) return result.error;
  if (hint?.guest === true) return `${hint.name} plays as a guest. A guest's profile and history are shown only to them.`;
  return 'This player has no profile to show. Their account may have been deleted.';
}
