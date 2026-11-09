import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS } from '../src/config.js';
import { migrate } from '../src/node/db.js';
import { recordResult, recordedMatch } from '../src/node/record.js';
import { SESSION_COOKIE, Sessions, hashSecret, readCookie } from '../src/node/sessions.js';
import { DELETED_NAME, PgStore, canRename, type RecordedMatch, type Store } from '../src/node/store.js';
import { nameKey } from '../src/players.js';
import type { FinalBoard, MatchResult } from '../src/results.js';
import { SKIP_REASON, noteSkipped, testDatabase, type TestDatabase } from './db.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-01-01T12:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);

function board(units: string[], traits: [string, number, number][] = [], ringBearer: string | null = null): FinalBoard {
  return {
    level: 7,
    units: units.map((unit) => ({ unit, star: 2, items: [] })),
    traits: traits.map(([trait, count, tier]) => ({ trait, count, tier })),
    ringBearer,
  } as unknown as FinalBoard;
}

/** A finished private game with people in the first seats, by account id, and bots in the rest. */
function result(people: (string | null)[], places = [1, 2, 3, 4, 5, 6, 7, 8], boards: FinalBoard[] = []): MatchResult {
  return {
    kind: 'private',
    durationMs: 20 * 60 * 1000,
    lastRound: { stage: 5, round: 3 },
    seats: places.map((place, seat) => ({
      seat,
      player: people[seat] ?? null,
      name: people[seat] === undefined || people[seat] === null ? `Bot ${seat}` : `Person ${seat}`,
      place,
      left: false,
      board: boards[seat] ?? board(['sam']),
    })),
  };
}

noteSkipped();

describe.skipIf(SKIP_REASON !== null)('PgStore', () => {
  let db: TestDatabase;
  let store: PgStore;

  beforeAll(async () => {
    db = await testDatabase();
    store = new PgStore(db.pool);
  });
  afterAll(() => db?.close());

  const guest = (name = 'Guest 0001', now = T0) => store.createGuest(name, nameKey(name), now);
  let subs = 0;
  /** A new Google subject id. */
  const sub = () => `google-${++subs}-${Math.random()}`;
  /** A claimed account with a name. */
  const claimed = async (name: string) => {
    const account = await store.claim((await guest(name)).id, sub());
    if (account === 'taken') throw new Error('Not claimed.');
    return account;
  };
  const rename = (id: string, name: string, now = T0) => store.rename(id, name, nameKey(name), now);

  describe('migrations', () => {
    it('apply on an empty database and are a no-op the second time', async () => {
      const empty = await testDatabase(false);
      try {
        expect(await migrate(empty.pool)).toEqual(['001_accounts.sql', '002_google.sql']);
        expect(await migrate(empty.pool)).toEqual([]);
        const tables = await empty.pool.query<{ table_name: string }>(
          'select table_name from information_schema.tables where table_schema = $1 order by table_name',
          [empty.schema],
        );
        expect(tables.rows.map((r) => r.table_name)).toEqual(['accounts', 'match_seats', 'matches', 'schema_migrations', 'sessions']);
      } finally {
        await empty.close();
      }
    });
  });

  describe('guests and sessions', () => {
    it('makes guests, and finds a session until it expires', async () => {
      const a = await guest('Guest 1234');
      expect(a).toMatchObject({ name: 'Guest 1234', nameKey: 'guest1234', claimed: false, renamedAt: null });
      expect(await store.account(a.id)).toEqual(a);
      const hash = hashSecret('secret-a');
      await store.createSession(hash, a.id, at(10));
      expect((await store.session(hash, at(9)))?.account.id).toBe(a.id);
      expect(await store.session(hash, at(10))).toBeNull();
      await store.renewSession(hash, at(20));
      expect((await store.session(hash, at(15)))?.expiresAt).toEqual(at(20));
    });

    it('signs out one session, or every session of an account', async () => {
      const a = await guest();
      const [one, two] = [hashSecret('one'), hashSecret('two')];
      await store.createSession(one, a.id, at(100));
      await store.createSession(two, a.id, at(100));
      await store.deleteSession(one);
      expect(await store.session(one, T0)).toBeNull();
      expect(await store.session(two, T0)).not.toBeNull();
      await store.deleteSessions(a.id);
      expect(await store.session(two, T0)).toBeNull();
    });

    it('renames, and guests can share a name', async () => {
      const [a, b] = [await guest(), await guest()];
      const renamed = await store.rename(a.id, 'Strider', 'strider', at(1));
      expect(renamed).toMatchObject({ name: 'Strider', nameKey: 'strider', renamedAt: at(1) });
      expect(await store.rename(b.id, 'strider', 'strider', at(1))).toMatchObject({ name: 'strider' });
    });
  });

  describe('Sessions', () => {
    it('keeps only the hash of the secret, and renews a session used a day after its last renewal', async () => {
      let now = T0;
      const sessions = new Sessions(store, { secure: true, now: () => now });
      const { account, cookie } = await sessions.newGuest();
      expect(account.name).toMatch(/^Guest \d{4}$/);
      expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Lax; Path=/; Secure; Max-Age=${ACCOUNTS.sessionDays * 86400}$`));
      const secret = readCookie(cookie.split(';')[0], SESSION_COOKIE)!;
      const rows = await db.pool.query<{ hash: Buffer }>('select hash from sessions where account_id = $1', [account.id]);
      expect(rows.rows.map((r) => r.hash.toString('hex'))).toEqual([hashSecret(secret).toString('hex')]);
      expect(JSON.stringify(rows.rows)).not.toContain(secret);

      const header = `other=1; ${SESSION_COOKIE}=${secret}`;
      now = new Date(T0.getTime() + DAY / 2);
      expect(await sessions.find(header)).toMatchObject({ account: { id: account.id }, cookie: null });
      now = at(2);
      const renewed = await sessions.find(header);
      expect(renewed?.cookie).toContain(`${SESSION_COOKIE}=${secret}`);
      expect((await store.session(hashSecret(secret), now))?.expiresAt).toEqual(at(2 + ACCOUNTS.sessionDays));
      // Seen when used.
      expect((await store.account(account.id))?.seenAt).toEqual(at(2));
      now = at(3 + ACCOUNTS.sessionDays);
      expect(await sessions.find(header)).toBeNull();
      expect(await sessions.find(undefined)).toBeNull();
      expect(await sessions.find(`${SESSION_COOKIE}=nonsense`)).toBeNull();
    });

    it('signs out', async () => {
      const sessions = new Sessions(store, { secure: false, now: () => T0 });
      const { cookie } = await sessions.newGuest();
      const header = cookie.split(';')[0];
      const found = (await sessions.find(header))!;
      await sessions.signOut(found, false);
      expect(await sessions.find(header)).toBeNull();
      expect(sessions.clearCookie()).toBe(`${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    });
  });

  describe('claiming with Google', () => {
    it('claims a guest with a new sub, keeping its name and history', async () => {
      const a = await guest('Meriadoc');
      await store.recordMatch(recordedMatch(result([a.id]), T0));
      const id = sub();
      expect(await store.accountBySub(id)).toBeNull();
      const done = await store.claim(a.id, id);
      expect(done).toMatchObject({ id: a.id, name: 'Meriadoc', claimed: true, needsName: false });
      expect(await store.accountBySub(id)).toEqual(done);
      const [match] = await store.history(a.id, null, 20);
      expect(match!.seats[0]).toMatchObject({ account: a.id, guest: false });
      expect(await store.games(a.id)).toBe(1);
    });

    it('refuses to claim an account twice, or with a sub another account has', async () => {
      const id = sub();
      const a = await guest('Pippin');
      expect(await store.claim(a.id, id)).toMatchObject({ claimed: true });
      expect(await store.claim(a.id, sub())).toBe('taken');
      expect(await store.claim((await guest('Pippin')).id, id)).toBe('taken');
      expect((await store.accountBySub(id))!.id).toBe(a.id);
    });

    it("makes a guest claiming with a name a claimed account holds, or a guest's name, pick a new one", async () => {
      const holder = await claimed('Faramir');
      const late = (await store.claim((await guest('FARAMIR')).id, sub())) as Exclude<Awaited<ReturnType<Store['claim']>>, 'taken'>;
      expect(late).toMatchObject({ name: 'FARAMIR', claimed: true, needsName: true });
      expect(await store.claim((await guest('Guest 0427')).id, sub())).toMatchObject({ name: 'Guest 0427', needsName: true });
      // It may rename at once, but not to a name a claimed account holds.
      expect(canRename(late, T0)).toBe(true);
      expect(await rename(late.id, 'faramir')).toBe('taken');
      // It holds no name until it renames: once the holder lets the name go, a guest may take it.
      await rename(holder.id, 'Captain', T0);
      expect(await rename((await guest()).id, 'Faramir')).toMatchObject({ name: 'Faramir' });
      const fixed = await rename(late.id, 'Faramir');
      expect(fixed).toMatchObject({ name: 'Faramir', needsName: false, renamedAt: T0 });
      // Now it holds it.
      expect(await rename((await guest()).id, 'Faramir')).toBe('taken');
    });

    it('settles two claims for the same name at once: the index keeps it for one', async () => {
      const [a, b] = [await guest('Arwen'), await guest('arwen')];
      const both = await Promise.all([store.claim(a.id, sub()), store.claim(b.id, sub())]);
      expect(both.map((x) => (x as { needsName: boolean }).needsName).sort()).toEqual([false, true]);
    });
  });

  describe('names', () => {
    it('are unique among claimed accounts, ignoring case, spaces and NFKC', async () => {
      const holder = await claimed('Strider');
      const g = await guest('Someone');
      for (const name of ['STRIDER', 'Stri der', 'ＳＴＲＩＤＥＲ']) expect(await rename(g.id, name)).toBe('taken');
      const other = await claimed('Halbarad');
      expect(await rename(other.id, 'strider')).toBe('taken');
      // The holder may change its own name's case.
      expect(await rename(holder.id, 'STRIDER')).toMatchObject({ name: 'STRIDER' });
      // A name freed by a rename is free at once.
      expect(await rename(holder.id, 'Elessar', at(10))).toMatchObject({ name: 'Elessar' });
      expect(await rename(g.id, 'Strider')).toMatchObject({ name: 'Strider' });
    });

    it('let guests share a name, and take one a claimed account held before', async () => {
      const [a, b] = [await guest('Boromir'), await guest('boromir')];
      expect([a.nameKey, b.nameKey]).toEqual(['boromir', 'boromir']);
      expect(await rename(a.id, 'Denethor')).toMatchObject({ name: 'Denethor' });
      expect(await rename(b.id, 'Denethor')).toMatchObject({ name: 'Denethor' });
    });

    it('let a claimed account rename once every 7 days, and a guest freely', async () => {
      const g = await guest('Renamer');
      expect(await rename(g.id, 'Renamer One', T0)).toMatchObject({ name: 'Renamer One' });
      expect(await rename(g.id, 'Renamer Two', T0)).toMatchObject({ name: 'Renamer Two' });
      // Renames as a guest don't count once claimed.
      const c = (await store.claim(g.id, sub())) as { id: string; renamedAt: Date | null };
      expect(c.renamedAt).toBeNull();
      expect(await rename(c.id, 'Renamer Three', T0)).toMatchObject({ name: 'Renamer Three', renamedAt: T0 });
      expect(await rename(c.id, 'Renamer Four', at(6.9))).toBe('wait');
      expect((await store.account(c.id))!.name).toBe('Renamer Three');
      expect(canRename((await store.account(c.id))!, at(6.9))).toBe(false);
      expect(canRename((await store.account(c.id))!, at(7))).toBe(true);
      expect(await rename(c.id, 'Renamer Four', at(7))).toMatchObject({ name: 'Renamer Four' });
    });
  });

  describe('deleting an account', () => {
    it('deletes it and its sessions, keeping its seats in others\' histories as "Deleted player"', async () => {
      const [gone, stays] = [await claimed('Saruman'), await guest('Radagast')];
      await store.createSession(hashSecret('saruman'), gone.id, at(100));
      const shared = recordedMatch(result([gone.id, stays.id]), at(1));
      const alone = recordedMatch(result([gone.id]), at(2));
      await store.recordMatch(shared);
      await store.recordMatch(alone);
      expect(await store.deleteAccount(gone.id)).toBe(true);
      expect(await store.account(gone.id)).toBeNull();
      expect(await store.accountBySub('anything')).toBeNull();
      expect(await store.session(hashSecret('saruman'), T0)).toBeNull();
      const [match] = await store.history(stays.id, null, 20);
      expect(match!.id).toBe(shared.id);
      expect(match!.seats[0]).toMatchObject({ account: null, name: DELETED_NAME, guest: false });
      expect(match!.seats[1]).toMatchObject({ account: stays.id, name: 'Person 1' });
      // A match nobody else was in goes with it.
      expect((await db.pool.query('select 1 from matches where id = $1', [alone.id])).rowCount).toBe(0);
      // Its name is free at once.
      expect(await rename((await guest()).id, 'Saruman')).toMatchObject({ name: 'Saruman' });
      expect(await store.deleteAccount(gone.id)).toBe(false);
    });

    it('records a game that ends after a person in it was deleted, with "Deleted player" in their seat', async () => {
      const [gone, stays] = [await guest('Gone'), await guest('Stays')];
      await store.deleteAccount(gone.id);
      await store.recordMatch(recordedMatch(result([gone.id, stays.id]), T0));
      const [match] = await store.history(stays.id, null, 20);
      expect(match!.seats[0]).toMatchObject({ account: null, name: DELETED_NAME });
    });
  });

  describe('history and stats', () => {
    it('records a match with its seats, and pages through history newest first', async () => {
      const [a, b] = [await guest('Ann'), await guest('Bo')];
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const kept = [i + 1, 8 - i];
        const places = [...kept, ...[1, 2, 3, 4, 5, 6, 7, 8].filter((p) => !kept.includes(p))];
        const match = recordedMatch(result([a.id, b.id], places), at(i));
        ids.push(match.id);
        await store.recordMatch(match);
      }
      const page = await store.history(a.id, null, 2);
      expect(page.map((m) => m.id)).toEqual([ids[2], ids[1]]);
      const next = await store.history(a.id, page[1]!.id, 2);
      expect(next.map((m) => m.id)).toEqual([ids[0]]);
      const match = next[0]!;
      expect(match).toMatchObject({ kind: 'private', seat: 0, lastRound: { stage: 5, round: 3 }, endedAt: at(0).toISOString() });
      expect(match.startedAt).toBe(new Date(at(0).getTime() - 20 * 60 * 1000).toISOString());
      expect(match.seats.map((s) => s.seat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(match.seats[1]).toMatchObject({ account: b.id, name: 'Person 1', guest: true, left: false, pointsBefore: null });
      expect(match.seats[2]).toMatchObject({ account: null, name: 'Bot 2', guest: false });
      expect(match.seats[0]!.board).toEqual(board(['sam']));
      expect(await store.history(b.id, null, 20)).toHaveLength(3);
      // An unknown match to page from gives nothing.
      expect(await store.history(a.id, '00000000-0000-4000-8000-000000000000', 20)).toEqual([]);
    });

    it('works out stats from the final boards', async () => {
      const a = await guest('Stats');
      const games: [number, FinalBoard][] = [
        [1, board(['frodo', 'sam', 'sam'], [['hobbit', 2, 1]], 'frodo')],
        [4, board(['frodo', 'balin'], [['hobbit', 1, 1], ['dwarf', 1, 1]])],
        [7, board(['balin'], [['dwarf', 1, 1]])],
        [2, board(['haldir', 'balin'], [['elf', 1, 1], ['dwarf', 1, 1]], 'haldir')],
      ];
      for (const [i, [place, b]] of games.entries()) {
        const places = [place, ...[1, 2, 3, 4, 5, 6, 7, 8].filter((p) => p !== place)];
        await store.recordMatch(recordedMatch(result([a.id], places, [b]), at(i)));
      }
      const stats = await store.stats(a.id);
      expect(stats.all).toEqual({ games: 4, wins: 1, top4Rate: 0.75, averagePlace: 3.5 });
      // Counted once a game, most first, then by id.
      expect(stats.units).toEqual([
        { unit: 'balin', games: 3 },
        { unit: 'frodo', games: 2 },
        { unit: 'haldir', games: 1 },
        { unit: 'sam', games: 1 },
      ]);
      expect(stats.traits).toEqual([
        { trait: 'dwarf', games: 3 },
        { trait: 'hobbit', games: 2 },
        { trait: 'elf', games: 1 },
      ]);
      expect(stats.ringGames).toBe(2);
      const none = await store.stats((await guest()).id);
      expect(none).toEqual({ all: { games: 0, wins: 0, top4Rate: 0, averagePlace: null }, units: [], traits: [], ringGames: 0 });
    });

    it('writes nothing of a match when a write fails in the middle', async () => {
      const a = await guest();
      const match = recordedMatch(result([a.id]), T0);
      // Two seats with the same number break the primary key on the second insert.
      const broken: RecordedMatch = { ...match, seats: [match.seats[0]!, match.seats[0]!] };
      await expect(store.recordMatch(broken)).rejects.toThrow();
      expect((await db.pool.query('select 1 from matches where id = $1', [match.id])).rowCount).toBe(0);
      expect(await store.history(a.id, null, 20)).toEqual([]);
    });
  });

  describe('clean-up', () => {
    it('deletes expired sessions and guests unseen for 90 days, keeping their seats for others as "Deleted player"', async () => {
      const old = await guest('Old', at(-200));
      const recent = await guest('Recent', at(-200));
      await store.touch(recent.id, at(-ACCOUNTS.guestDays + 1));
      await store.createSession(hashSecret('expired'), recent.id, at(-1));
      await store.createSession(hashSecret('live'), recent.id, at(5));
      await store.createSession(hashSecret('old'), old.id, at(5));
      await store.recordMatch(recordedMatch(result([old.id, recent.id]), at(-150)));

      const cleaned = await store.cleanUp(T0);
      expect(cleaned.guests).toBeGreaterThanOrEqual(1);
      expect(cleaned.sessions).toBeGreaterThanOrEqual(1);
      expect(await store.account(old.id)).toBeNull();
      expect(await store.account(recent.id)).not.toBeNull();
      expect(await store.session(hashSecret('old'), T0)).toBeNull();
      expect(await store.session(hashSecret('live'), T0)).not.toBeNull();
      const rows = await db.pool.query('select 1 from sessions where hash = $1', [hashSecret('expired')]);
      expect(rows.rowCount).toBe(0);
      const [match] = await store.history(recent.id, null, 20);
      expect(match!.seats[0]).toMatchObject({ account: null, name: DELETED_NAME, guest: false });
      expect(match!.seats[1]).toMatchObject({ account: recent.id, name: 'Person 1' });
    });
  });
});

describe('recordResult', () => {
  /** A store whose recordMatch fails a number of times first. */
  function flaky(failures: number) {
    const written: RecordedMatch[] = [];
    let calls = 0;
    const store = {
      recordMatch: (match: RecordedMatch) => {
        calls++;
        if (calls <= failures) return Promise.reject(new Error('connection lost'));
        written.push(match);
        return Promise.resolve();
      },
    } as unknown as Store;
    return { store, written, calls: () => calls };
  }

  it('turns a result into a match and its seats', () => {
    const match = recordedMatch(result(['a', 'b']), T0, 'id');
    expect(match).toMatchObject({ id: 'id', kind: 'private', season: null, rounds: 53, endedAt: T0 });
    expect(match.startedAt).toEqual(new Date(T0.getTime() - 20 * 60 * 1000));
    expect(match.seats.map((s) => s.accountId)).toEqual(['a', 'b', null, null, null, null, null, null]);
  });

  it('tries a failed write again 3 times', async () => {
    const t = flaky(3);
    expect(await recordResult(t.store, result(['a']), { retryMs: 1, log: () => {} })).toBe(true);
    expect([t.calls(), t.written.length]).toEqual([4, 1]);
  });

  it('then logs the whole result as JSON', async () => {
    const t = flaky(4);
    const logged: string[] = [];
    expect(await recordResult(t.store, result(['a']), { retryMs: 1, log: (m) => logged.push(m) })).toBe(false);
    expect(t.calls()).toBe(4);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('connection lost');
    expect(logged[0]).toContain('"accountId":"a"');
  });
});
