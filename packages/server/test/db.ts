// A Postgres schema of its own for each test file, so files can run at once against one database.

import { randomBytes } from 'node:crypto';
import { it } from 'vitest';
import { createPool, migrate, type Pool } from '../src/node/db.js';

export const DATABASE_URL = process.env.DATABASE_URL ?? '';

/** Why the database tests are skipped, or null if they run. */
export const SKIP_REASON =
  DATABASE_URL === '' ? 'DATABASE_URL is not set, so the tests against Postgres are skipped. Set it to run them; CI does.' : null;

/** Says, in the test output, why the database tests are skipped. Call it in each file that has them. */
export function noteSkipped(): void {
  it.runIf(SKIP_REASON !== null)('skips the tests against Postgres', () => console.warn(SKIP_REASON));
}

export interface TestDatabase {
  readonly pool: Pool;
  readonly schema: string;
  close(): Promise<void>;
}

/** A pool whose tables live in a new, empty schema, migrated unless asked not to be. */
export async function testDatabase(migrated = true): Promise<TestDatabase> {
  const schema = `test_${randomBytes(6).toString('hex')}`;
  const admin = createPool(DATABASE_URL, { max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = createPool(DATABASE_URL, { options: `-c search_path=${schema}` });
  if (migrated) await migrate(pool);
  return {
    pool,
    schema,
    async close() {
      await pool.end();
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    },
  };
}
