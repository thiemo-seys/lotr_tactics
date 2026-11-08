import type { FinalBoard } from '@lotr-tactics/server';
import { describe, expect, it } from 'vitest';
import type { ApiResult, HistoryMatch, HistorySeat, Profile, Stats } from '../src/account.js';
import {
  DELETED_NAME,
  HistoryList,
  ProfileBrowser,
  boardTraits,
  boardUnits,
  durationText,
  favouriteTraits,
  favouriteUnits,
  historyRow,
  matchBoards,
  statTiles,
  whenText,
  type ProfileApi,
} from '../src/profile.js';

const stats = (games: number): Stats => ({
  all: { games, wins: games > 0 ? 1 : 0, top4Rate: games > 0 ? 2 / 3 : 0, averagePlace: games > 0 ? 3.3333 : null },
  units: [
    { unit: 'gimli', games: 3 },
    { unit: 'retired-unit', games: 2 },
    { unit: 'sam', games: 1 },
  ],
  traits: [
    { trait: 'dwarf', games: 3 },
    { trait: 'gone', games: 1 },
  ],
  ringGames: 1,
});

const board: FinalBoard = {
  level: 6,
  units: [
    { unit: 'sam', star: 2, items: [] },
    { unit: 'gimli', star: 1, items: ['blade', 'no-such-item' as never] },
    { unit: 'frodo', star: 2, items: [] },
    { unit: 'sam', star: 1, items: [] },
  ],
  traits: [
    { trait: 'hobbit', count: 3, tier: 1 },
    { trait: 'dwarf', count: 3, tier: 2 },
    { trait: 'ent', count: 1, tier: 1 },
  ],
  ringBearer: 'sam',
};

const empty: FinalBoard = { level: 3, units: [], traits: [], ringBearer: null };

function seat(n: number, place: number, extra: Partial<HistorySeat> = {}): HistorySeat {
  return { seat: n, account: null, name: `Bot ${n}`, guest: false, place, left: false, board: empty, pointsBefore: null, pointsAfter: null, ...extra };
}

function match(id: string, extra: Partial<HistoryMatch> = {}): HistoryMatch {
  return {
    id,
    kind: 'private',
    startedAt: '2026-11-08T14:00:00.000Z',
    endedAt: '2026-11-08T14:38:20.000Z',
    lastRound: { stage: 5, round: 3 },
    seat: 0,
    seats: [
      seat(0, 3, { account: 'me', name: 'Samwise', guest: true, board, left: true }),
      seat(1, 1, { account: 'b', name: 'Frodo' }),
      seat(2, 2),
      seat(3, 4, { name: DELETED_NAME }),
      seat(4, 8, { account: 'c', name: 'Pippin', guest: true }),
      seat(5, 6),
      seat(6, 5),
      seat(7, 7),
    ],
    ...extra,
  };
}

describe('profile stats', () => {
  it('show games, wins, top 4, average place and Ring games, with dashes before any game', () => {
    expect(statTiles(stats(3)).map((t) => [t.label, t.value])).toEqual([
      ['Games', '3'],
      ['Wins', '1'],
      ['Top 4', '67%'],
      ['Average place', '3.3'],
      ['Ring bearer', '1'],
    ]);
    expect(statTiles(stats(0)).map((t) => t.value)).toEqual(['0', '0', '—', '—', '1']);
  });

  it("name the favourite units and traits, leaving out any the game doesn't have", () => {
    expect(favouriteUnits(stats(3))).toEqual([
      { unit: 'gimli', name: 'Gimli', cost: 3, games: 3 },
      { unit: 'sam', name: 'Sam', cost: 1, games: 1 },
    ]);
    expect(favouriteTraits(stats(3))).toEqual([{ trait: 'dwarf', name: 'Dwarf', games: 3 }]);
  });
});

describe('a match in the history', () => {
  it("gives the owner's place, the kind, when it ended, the last round, how long it took and their board", () => {
    const now = new Date(2026, 10, 8, 23, 0);
    const row = historyRow(match('m1', { endedAt: new Date(2026, 10, 8, 14, 5).toISOString(), startedAt: new Date(2026, 10, 8, 13, 27).toISOString() }), now);
    expect(row).toMatchObject({ id: 'm1', place: 3, placeText: '3rd', medal: 'bronze', kind: 'Private lobby', when: 'Today, 14:05', round: 'Round 5-3', duration: '38 min', left: true, points: null });
    expect(row.units.map((u) => u.unit)).toEqual(['frodo', 'sam', 'gimli', 'sam']);
  });

  it('shows the points change of a ranked game', () => {
    const ranked = match('m2', { kind: 'ranked' });
    const own = (before: number, after: number) => ({ ...ranked, seats: ranked.seats.map((s) => (s.seat === 0 ? { ...s, pointsBefore: before, pointsAfter: after } : s)) });
    const now = new Date();
    expect([historyRow(own(100, 132), now).points, historyRow(own(100, 80), now).points, historyRow(own(0, 0), now).points]).toEqual(['+32', '−20', '±0']);
    expect(historyRow(ranked, now).kind).toBe('Ranked');
  });

  it('says when, in the page time zone', () => {
    const now = new Date(2026, 10, 8, 9, 0);
    expect(whenText(new Date(2026, 10, 8, 0, 4), now)).toBe('Today, 00:04');
    expect(whenText(new Date(2026, 10, 7, 23, 59), now)).toBe('Yesterday, 23:59');
    expect(whenText(new Date(2026, 10, 3, 18, 20), now)).toBe('3 Nov, 18:20');
    expect(whenText(new Date(2025, 11, 31, 9, 30), now)).toBe('31 Dec 2025, 09:30');
    expect(whenText(new Date('nonsense'), now)).toBe('');
  });

  it('says how long a game took', () => {
    expect([durationText(20_000), durationText(38 * 60_000), durationText(60 * 60_000), durationText(65 * 60_000), durationText(-1)]).toEqual([
      '1 min',
      '38 min',
      '1 h',
      '1 h 5 min',
      '',
    ]);
  });
});

describe("a match's final boards", () => {
  it('list all 8 seats by place, linking people other than the profile shown, and telling bots from deleted accounts', () => {
    const seats = matchBoards(match('m1'), 'me', 'c');
    expect(seats.map((s) => s.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(seats.map((s) => s.name)).toEqual(['Frodo', 'Bot 2', 'Samwise', DELETED_NAME, 'Bot 6', 'Bot 5', 'Bot 7', 'Pippin']);
    expect(seats.map((s) => s.kind)).toEqual(['person', 'bot', 'person', 'deleted', 'bot', 'bot', 'bot', 'person']);
    expect(seats.map((s) => s.link)).toEqual(['b', null, null, null, null, null, null, 'c']);
    expect(seats.find((s) => s.owner)?.name).toBe('Samwise');
    expect(seats.find((s) => s.you)?.name).toBe('Pippin');
    expect(seats[2]).toMatchObject({ guest: true, left: true, level: 6, placeText: '3rd', medal: 'bronze' });
  });

  it('put the strongest units first, mark the One Ring once, and drop what the game no longer has', () => {
    const units = boardUnits([...board.units, { unit: 'retired', star: 3, items: [] }], board.ringBearer);
    expect(units.map((u) => [u.unit, u.star, u.ring])).toEqual([
      ['frodo', 2, false],
      ['sam', 2, true],
      ['gimli', 1, false],
      ['sam', 1, false],
    ]);
    expect(units.find((u) => u.unit === 'gimli')?.items).toEqual(['blade']);
    expect(boardUnits(board.units, null).some((u) => u.ring)).toBe(false);
  });

  it('give active traits the tracker’s tones from their tier', () => {
    expect(boardTraits([...board.traits, { trait: 'gone', count: 2, tier: 1 }]).map((t) => [t.trait, t.level, t.tone])).toEqual([
      ['hobbit', 0, 'bronze'],
      ['dwarf', 1, 'gold'],
      ['ent', 0, 'unique'],
    ]);
  });
});

describe('the history list', () => {
  it('loads a page at a time, until a short page, older than the last match', () => {
    const list = new HistoryList();
    expect([list.before, list.more]).toEqual([null, false]);
    const page = Array.from({ length: 20 }, (_, i) => match(`m${i}`));
    list.loaded(page);
    expect([list.matches.length, list.before, list.more]).toEqual([20, 'm19', true]);
    list.failed('Too many requests. Slow down a little.');
    expect([list.error, list.loading]).toEqual(['Too many requests. Slow down a little.', false]);
    // A match seen already isn't listed twice.
    list.loaded([match('m19'), match('m20')]);
    expect([list.matches.length, list.more, list.error]).toEqual([21, false, null]);
  });
});

/** An API whose answers the test gives, in any order. */
function pendingApi() {
  const calls: { kind: 'profile' | 'history'; account: string | null; before?: string | null; answer: (result: ApiResult<never>) => void }[] = [];
  const api: ProfileApi = {
    profile: (account) => new Promise((done) => calls.push({ kind: 'profile', account, answer: done as never })),
    history: (account, before) => new Promise((done) => calls.push({ kind: 'history', account, before, answer: done as never })),
  };
  return { api, calls };
}

const profile = (id: string, name: string): Profile => ({ id, name, guest: true, stats: stats(1) });
const flush = () => new Promise((done) => setTimeout(done, 0));

describe('the profile browser', () => {
  it("loads the person's own profile and history together, and more history on request", async () => {
    const { api, calls } = pendingApi();
    let changes = 0;
    const browser = new ProfileBrowser(api, () => changes++);
    browser.open(null);
    expect(calls.map((c) => [c.kind, c.account, c.before])).toEqual([
      ['profile', null, undefined],
      ['history', null, null],
    ]);
    calls[0]!.answer({ ok: true, value: profile('me', 'Samwise') } as never);
    calls[1]!.answer({ ok: true, value: { matches: Array.from({ length: 20 }, (_, i) => match(`m${i}`)) } } as never);
    await flush();
    const entry = browser.current!;
    expect([entry.profile?.name, entry.history.matches.length, entry.history.more]).toEqual(['Samwise', 20, true]);
    browser.more();
    expect(calls[2]).toMatchObject({ kind: 'history', account: null, before: 'm19' });
    browser.toggle('m3');
    expect(entry.open.has('m3')).toBe(true);
    browser.toggle('m3');
    expect(entry.open.has('m3')).toBe(false);
    browser.renamed('me', 'Sam');
    expect(entry.profile?.name).toBe('Sam');
    expect(changes).toBeGreaterThan(4);
  });

  it("asks for someone else's history only once their profile can be shown, and says gracefully when it can't", async () => {
    const { api, calls } = pendingApi();
    const browser = new ProfileBrowser(api);
    browser.open(null);
    browser.open('guest-id', { name: 'Pippin', guest: true });
    expect(browser.canGoBack).toBe(true);
    expect(calls.filter((c) => c.account === 'guest-id').map((c) => c.kind)).toEqual(['profile']);
    calls.find((c) => c.account === 'guest-id')!.answer({ ok: false, status: 404, error: 'There is no such player.' } as never);
    await flush();
    expect(browser.current!.error).toBe("Pippin plays as a guest. A guest's profile and history are shown only to them.");
    expect(calls.filter((c) => c.account === 'guest-id').map((c) => c.kind)).toEqual(['profile']);
    // An account that isn't known as a guest, and other failures.
    browser.open('gone');
    calls.at(-1)!.answer({ ok: false, status: 404, error: 'There is no such player.' } as never);
    browser.open('busy');
    calls.at(-1)!.answer({ ok: false, status: 429, error: 'Too many requests. Slow down a little.' } as never);
    await flush();
    expect(browser.current!.error).toBe('Too many requests. Slow down a little.');
    browser.back();
    expect(browser.current!.error).toBe('This player has no profile to show. Their account may have been deleted.');
    // A claimed account's profile, then its history.
    browser.open('claimed');
    calls.at(-1)!.answer({ ok: true, value: profile('claimed', 'Frodo') } as never);
    await flush();
    expect(calls.at(-1)).toMatchObject({ kind: 'history', account: 'claimed', before: null });
  });

  it('goes back through the profiles opened, and drops answers for one that was closed', async () => {
    const { api, calls } = pendingApi();
    const browser = new ProfileBrowser(api);
    browser.open(null);
    browser.open('b');
    expect(browser.back()).toBe(true);
    expect(browser.current!.account).toBeNull();
    calls[2]!.answer({ ok: true, value: profile('b', 'Frodo') } as never);
    await flush();
    expect(browser.current!.profile).toBeNull();
    expect(browser.back()).toBe(false);
    expect(browser.current).toBeNull();
    browser.open(null);
    browser.close();
    expect(browser.current).toBeNull();
  });
});
