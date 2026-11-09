// Everything that lasts, in Postgres (docs/accounts-spec.md section 5): accounts, sessions and
// match history. One method per use. Node only.

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { DELETED_NAME, type HistoryMatch, type PlaceStats, type Stats } from '../accounts.js';
import { ACCOUNTS, NAMES } from '../config.js';
import { checkName } from '../players.js';
import type { FinalBoard } from '../results.js';
import type { Pool } from './db.js';

export { DELETED_NAME };
export type { HistoryMatch, HistorySeat, PlaceStats, Stats } from '../accounts.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Account {
  readonly id: string;
  readonly name: string;
  readonly nameKey: string;
  /** Signed in with Google. */
  readonly claimed: boolean;
  /**
   * Claimed, with a name another claimed account holds or one kept for guests: it holds no name
   * until it renames (accounts-spec.md section 6.3).
   */
  readonly needsName: boolean;
  readonly createdAt: Date;
  readonly seenAt: Date;
  readonly renamedAt: Date | null;
}

export interface Session {
  readonly account: Account;
  readonly expiresAt: Date;
}

export interface RecordedSeat {
  readonly seat: number;
  /** Null for a bot. */
  readonly accountId: string | null;
  readonly name: string;
  readonly place: number;
  readonly left: boolean;
  readonly board: FinalBoard;
}

export interface RecordedMatch {
  readonly id: string;
  readonly kind: 'ranked' | 'private';
  /** Ranked only. */
  readonly season: number | null;
  readonly startedAt: Date;
  readonly endedAt: Date;
  /** The stage and round it ended on, as stage * 10 + round. */
  readonly rounds: number;
  readonly seats: readonly RecordedSeat[];
}

export interface Store {
  createGuest(name: string, nameKey: string, now: Date): Promise<Account>;
  account(id: string): Promise<Account | null>;
  /** The account signed in with a Google subject id. */
  accountBySub(sub: string): Promise<Account | null>;
  /** Marks the account as seen, which keeps a guest from being cleaned up. */
  touch(id: string, now: Date): Promise<void>;
  /**
   * Returns the renamed account; 'taken' if a claimed account holds the name; or 'wait' if the
   * account is claimed and renamed less than 7 days ago, and doesn't need a new name.
   */
  rename(id: string, name: string, nameKey: string, now: Date): Promise<Account | 'taken' | 'wait'>;
  /**
   * A guest claimed with a Google subject id, keeping its name and history. It needs a new name if
   * a claimed account holds its name, or the name is kept for guests. Returns 'taken' if the
   * account is claimed already, or another account has the subject id.
   */
  claim(id: string, sub: string): Promise<Account | 'taken'>;
  /**
   * Deletes an account, its sessions and what else is its own. Its seats stay in other people's
   * histories as "Deleted player"; matches with nobody else left in them go. Returns whether there
   * was such an account.
   */
  deleteAccount(id: string): Promise<boolean>;
  /** How many matches the account has in its history. */
  games(id: string): Promise<number>;
  createSession(hash: Buffer, accountId: string, expiresAt: Date): Promise<void>;
  /** The session with this hash, if it hasn't expired by `now`. */
  session(hash: Buffer, now: Date): Promise<Session | null>;
  renewSession(hash: Buffer, expiresAt: Date): Promise<void>;
  deleteSession(hash: Buffer): Promise<void>;
  /** Every session of the account: signing out everywhere. */
  deleteSessions(accountId: string): Promise<void>;
  /** Writes a match and its seats in one transaction. */
  recordMatch(match: RecordedMatch): Promise<void>;
  /** The account's matches, newest first, `limit` at a time, older than the match `before`. */
  history(accountId: string, before: string | null, limit: number): Promise<HistoryMatch[]>;
  stats(accountId: string): Promise<Stats>;
  /** Deletes expired sessions and guests not seen for 90 days. Returns how many of each. */
  cleanUp(now: Date): Promise<{ sessions: number; guests: number }>;
}

interface AccountRow {
  id: string;
  name: string;
  name_key: string;
  google_sub: string | null;
  needs_name: boolean;
  created_at: Date;
  seen_at: Date;
  renamed_at: Date | null;
}

function account(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    nameKey: row.name_key,
    claimed: row.google_sub !== null,
    needsName: row.needs_name,
    createdAt: row.created_at,
    seenAt: row.seen_at,
    renamedAt: row.renamed_at,
  };
}

/** Postgres's code for a unique constraint broken. */
const UNIQUE_VIOLATION = '23505';

/** The unique index on claimed accounts' names (migrations/002_google.sql). */
const NAME_INDEX = 'accounts_claimed_name';

/** The first key of the advisory locks on names, so they can't meet other locks. */
const NAME_LOCK = 0x6e616d65;

/** An account that holds its name: claimed, and not waiting for a new one. Of the alias `c`. */
const HOLDS = 'c.google_sub is not null and not c.needs_name';

function brokenIndex(error: unknown): string | null {
  const e = error as { code?: string; constraint?: string };
  return e.code === UNIQUE_VIOLATION ? (e.constraint ?? '') : null;
}

/**
 * Whether an account may rename now: guests freely, claimed accounts once every 7 days, and at once
 * while they need a new name (accounts-spec.md section 6.3).
 */
export function canRename(account: Account, now: Date): boolean {
  if (!account.claimed || account.needsName || account.renamedAt === null) return true;
  return now.getTime() - account.renamedAt.getTime() >= NAMES.renameDays * DAY_MS;
}

export class PgStore implements Store {
  constructor(readonly pool: Pool) {}

  async createGuest(name: string, nameKey: string, now: Date): Promise<Account> {
    const { rows } = await this.pool.query<AccountRow>(
      'insert into accounts (id, name, name_key, created_at, seen_at) values ($1, $2, $3, $4, $4) returning *',
      [randomUUID(), name, nameKey, now],
    );
    return account(rows[0]!);
  }

  async account(id: string): Promise<Account | null> {
    const { rows } = await this.pool.query<AccountRow>('select * from accounts where id = $1', [id]);
    return rows.length === 0 ? null : account(rows[0]!);
  }

  async touch(id: string, now: Date): Promise<void> {
    await this.pool.query('update accounts set seen_at = $2 where id = $1', [id, now]);
  }

  async accountBySub(sub: string): Promise<Account | null> {
    const { rows } = await this.pool.query<AccountRow>('select * from accounts where google_sub = $1', [sub]);
    return rows.length === 0 ? null : account(rows[0]!);
  }

  async rename(id: string, name: string, nameKey: string, now: Date): Promise<Account | 'taken' | 'wait'> {
    const since = new Date(now.getTime() - NAMES.renameDays * DAY_MS);
    try {
      return await this.transaction(async (client) => {
        // A guest's check that no claimed account holds the name, and a claim that holds it, take
        // turns. The account's row is locked first, as in a claim, so the two can't deadlock.
        await client.query('select 1 from accounts where id = $1 for update', [id]);
        await lockName(client, nameKey);
        const { rows } = await client.query<AccountRow>(
          `update accounts set name = $2, name_key = $3, renamed_at = $4, needs_name = false
           where id = $1
             and (google_sub is null or needs_name or renamed_at is null or renamed_at <= $5)
             and (google_sub is not null or not exists (select 1 from accounts c where ${HOLDS} and c.name_key = $3))
           returning *`,
          [id, name, nameKey, now, since],
        );
        if (rows.length > 0) return account(rows[0]!);
        const current = await client.query<AccountRow>('select * from accounts where id = $1', [id]);
        if (current.rows.length === 0) throw new Error(`There is no account ${id}.`);
        return canRename(account(current.rows[0]!), now) ? 'taken' : 'wait';
      });
    } catch (error) {
      // Another claimed account holds the name.
      if (brokenIndex(error) !== null) return 'taken';
      throw error;
    }
  }

  async claim(id: string, sub: string): Promise<Account | 'taken'> {
    try {
      return await this.claimWith(id, sub, false);
    } catch (error) {
      const index = brokenIndex(error);
      // Another account was claimed with the same sub meanwhile.
      if (index !== null && index !== NAME_INDEX) return 'taken';
      // Another claim took the name first: the index keeps it for that one.
      if (index === NAME_INDEX) return this.claimWith(id, sub, true);
      throw error;
    }
  }

  private claimWith(id: string, sub: string, needsName: boolean): Promise<Account | 'taken'> {
    return this.transaction(async (client) => {
      const { rows } = await client.query<AccountRow>('select * from accounts where id = $1 for update', [id]);
      const row = rows[0];
      if (row === undefined) throw new Error(`There is no account ${id}.`);
      if (row.google_sub !== null) return 'taken';
      await lockName(client, row.name_key);
      // Names like "Guest 0427" are kept for guests, so a guest claiming with one picks another.
      const kept = needsName || 'error' in checkName(row.name);
      // A rename as a guest doesn't count towards the limit, which is for claimed accounts.
      const claimed = await client.query<AccountRow>(
        `update accounts set google_sub = $2, renamed_at = null,
           needs_name = $3 or exists (select 1 from accounts c where ${HOLDS} and c.name_key = accounts.name_key and c.id <> accounts.id)
         where id = $1
         returning *`,
        [id, sub, kept],
      );
      return account(claimed.rows[0]!);
    });
  }

  async deleteAccount(id: string): Promise<boolean> {
    return this.transaction(async (client) => {
      const { rows } = await client.query<{ match_id: string }>('select match_id from match_seats where account_id = $1', [id]);
      await client.query('update match_seats set name = $2 where account_id = $1', [id, DELETED_NAME]);
      // Sessions go with it, and the seats lose their link (on delete cascade, and set null).
      const deleted = await client.query('delete from accounts where id = $1', [id]);
      await deleteEmptyMatches(
        client,
        rows.map((r) => r.match_id),
      );
      return (deleted.rowCount ?? 0) > 0;
    });
  }

  async games(id: string): Promise<number> {
    const { rows } = await this.pool.query<{ games: number }>('select count(*)::int as games from match_seats where account_id = $1', [id]);
    return rows[0]!.games;
  }

  async createSession(hash: Buffer, accountId: string, expiresAt: Date): Promise<void> {
    await this.pool.query('insert into sessions (hash, account_id, expires_at) values ($1, $2, $3)', [hash, accountId, expiresAt]);
  }

  async session(hash: Buffer, now: Date): Promise<Session | null> {
    const { rows } = await this.pool.query<AccountRow & { expires_at: Date }>(
      `select a.*, s.expires_at from sessions s join accounts a on a.id = s.account_id
       where s.hash = $1 and s.expires_at > $2`,
      [hash, now],
    );
    return rows.length === 0 ? null : { account: account(rows[0]!), expiresAt: rows[0]!.expires_at };
  }

  async renewSession(hash: Buffer, expiresAt: Date): Promise<void> {
    await this.pool.query('update sessions set expires_at = $2 where hash = $1', [hash, expiresAt]);
  }

  async deleteSession(hash: Buffer): Promise<void> {
    await this.pool.query('delete from sessions where hash = $1', [hash]);
  }

  async deleteSessions(accountId: string): Promise<void> {
    await this.pool.query('delete from sessions where account_id = $1', [accountId]);
  }

  async recordMatch(match: RecordedMatch): Promise<void> {
    await this.transaction(async (client) => {
      await client.query('insert into matches (id, kind, season, started_at, ended_at, rounds) values ($1, $2, $3, $4, $5, $6)', [
        match.id,
        match.kind,
        match.season,
        match.startedAt,
        match.endedAt,
        match.rounds,
      ]);
      for (const s of match.seats) {
        // An account deleted during the game is a deleted player here too.
        await client.query(
          `insert into match_seats (match_id, seat, account_id, name, place, left_game, board)
           values ($1, $2, (select id from accounts where id = $3::uuid),
                   case when $3::uuid is null or exists (select 1 from accounts where id = $3::uuid) then $4 else $8 end,
                   $5, $6, $7)`,
          [match.id, s.seat, s.accountId, s.name, s.place, s.left, JSON.stringify(s.board), DELETED_NAME],
        );
      }
    });
  }

  async history(accountId: string, before: string | null, limit: number): Promise<HistoryMatch[]> {
    const { rows: matches } = await this.pool.query<{ id: string; kind: 'ranked' | 'private'; started_at: Date; ended_at: Date; rounds: number; seat: number }>(
      `select m.id, m.kind, m.started_at, m.ended_at, m.rounds, s.seat
       from match_seats s join matches m on m.id = s.match_id
       where s.account_id = $1
         and ($2::uuid is null or (m.ended_at, m.id) < (select ended_at, id from matches where id = $2))
       order by m.ended_at desc, m.id desc
       limit $3`,
      [accountId, before, limit],
    );
    if (matches.length === 0) return [];
    const { rows: seats } = await this.pool.query<{
      match_id: string;
      seat: number;
      account_id: string | null;
      name: string;
      claimed: boolean | null;
      place: number;
      left_game: boolean;
      board: FinalBoard;
      points_before: number | null;
      points_after: number | null;
    }>(
      `select s.match_id, s.seat, s.account_id, s.name, a.google_sub is not null as claimed, s.place, s.left_game, s.board,
              s.points_before, s.points_after
       from match_seats s left join accounts a on a.id = s.account_id
       where s.match_id = any($1::uuid[])
       order by s.match_id, s.seat`,
      [matches.map((m) => m.id)],
    );
    return matches.map((m) => ({
      id: m.id,
      kind: m.kind,
      startedAt: m.started_at.toISOString(),
      endedAt: m.ended_at.toISOString(),
      lastRound: { stage: Math.floor(m.rounds / 10), round: m.rounds % 10 },
      seat: m.seat,
      seats: seats
        .filter((s) => s.match_id === m.id)
        .map((s) => ({
          seat: s.seat,
          account: s.account_id,
          name: s.name,
          guest: s.account_id !== null && s.claimed !== true,
          place: s.place,
          left: s.left_game,
          board: s.board,
          pointsBefore: s.points_before,
          pointsAfter: s.points_after,
        })),
    }));
  }

  async stats(accountId: string): Promise<Stats> {
    const totals = await this.pool.query<{ games: number; wins: number; top4: number; place_sum: number; ring_games: number }>(
      `select count(*)::int as games,
              count(*) filter (where place = 1)::int as wins,
              count(*) filter (where place <= 4)::int as top4,
              coalesce(sum(place), 0)::int as place_sum,
              count(*) filter (where board->>'ringBearer' is not null)::int as ring_games
       from match_seats where account_id = $1`,
      [accountId],
    );
    // Ids compared byte by byte, as JavaScript compares them, whatever the database's collation.
    const units = await this.pool.query<{ unit: string; games: number }>(
      `select u->>'unit' as unit, count(distinct s.match_id)::int as games
       from match_seats s cross join jsonb_array_elements(s.board->'units') u
       where s.account_id = $1
       group by 1 order by 2 desc, (u->>'unit') collate "C" limit $2`,
      [accountId, ACCOUNTS.topCount],
    );
    const traits = await this.pool.query<{ trait: string; games: number }>(
      `select t->>'trait' as trait, count(distinct s.match_id)::int as games
       from match_seats s cross join jsonb_array_elements(s.board->'traits') t
       where s.account_id = $1
       group by 1 order by 2 desc, (t->>'trait') collate "C" limit $2`,
      [accountId, ACCOUNTS.topCount],
    );
    const t = totals.rows[0]!;
    return {
      all: placeStats(t.games, t.wins, t.top4, t.place_sum),
      units: units.rows,
      traits: traits.rows,
      ringGames: t.ring_games,
    };
  }

  async cleanUp(now: Date): Promise<{ sessions: number; guests: number }> {
    const cutoff = new Date(now.getTime() - ACCOUNTS.guestDays * DAY_MS);
    return this.transaction(async (client) => {
      const sessions = await client.query('delete from sessions where expires_at <= $1', [now]);
      // Other people's histories keep the seats, without the link or the name.
      const { rows } = await client.query<{ match_id: string }>(
        `update match_seats set name = $2
         where account_id in (select id from accounts where google_sub is null and seen_at < $1)
         returning match_id`,
        [cutoff, DELETED_NAME],
      );
      const guests = await client.query('delete from accounts where google_sub is null and seen_at < $1', [cutoff]);
      await deleteEmptyMatches(
        client,
        rows.map((r) => r.match_id),
      );
      return { sessions: sessions.rowCount ?? 0, guests: guests.rowCount ?? 0 };
    });
  }

  private async transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

/** Takes a lock on a name's key until the transaction ends. */
async function lockName(client: pg.PoolClient, nameKey: string): Promise<void> {
  await client.query('select pg_advisory_xact_lock($1, hashtext($2))', [NAME_LOCK, nameKey]);
}

/** Of these matches, deletes those that no longer have anyone with an account in them, which nobody can see. */
async function deleteEmptyMatches(client: pg.PoolClient, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await client.query(
    `delete from matches m
     where m.id = any($1::uuid[])
       and not exists (select 1 from match_seats s where s.match_id = m.id and s.account_id is not null)`,
    [[...new Set(ids)]],
  );
}

export function placeStats(games: number, wins: number, top4: number, placeSum: number): PlaceStats {
  return { games, wins, top4Rate: games === 0 ? 0 : top4 / games, averagePlace: games === 0 ? null : placeSum / games };
}
