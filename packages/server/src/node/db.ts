// The Postgres pool and migrations (docs/accounts-spec.md section 5). Node only.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export type Pool = pg.Pool;

/** The development database that `pnpm db` starts, which `pnpm dev` and `pnpm start` use by default. */
export const DEV_DATABASE = {
  container: 'lotr-tactics-db',
  volume: 'lotr-tactics-db',
  port: 5433,
  user: 'lotr',
  password: 'lotr',
  database: 'lotr',
  url: 'postgres://lotr:lotr@localhost:5433/lotr',
} as const;

/** The migrations shipped with the server, in packages/server/migrations. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

/** Any number, so two servers starting at once don't migrate the same database together. */
const MIGRATION_LOCK = 0x6c6f7472;

export function createPool(connectionString: string, options: pg.PoolConfig = {}): Pool {
  const pool = new pg.Pool({ connectionString, max: 10, ...options });
  // An idle client losing its connection mustn't crash the server; the pool replaces it.
  pool.on('error', (error) => console.error('Postgres connection error:', error.message));
  return pool;
}

/**
 * Applies the migrations not yet applied, in name order, each in a transaction of its own, and
 * records them in schema_migrations. Returns the names applied. A migration that fails throws.
 */
export async function migrate(pool: Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      await client.query('begin');
      try {
        await client.query(readFileSync(join(dir, file), 'utf8'));
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
      }
      applied.push(file);
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
  return applied;
}
