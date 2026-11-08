// Runs the server (docs/server-spec.md section 9, docs/accounts-spec.md section 3): `pnpm start`,
// or `pnpm dev` next to the client. It needs Postgres, at DATABASE_URL.
//
// Flags, which pnpm dev and pnpm start pass:
//   --dev-db  without DATABASE_URL, use the development database that `pnpm db` starts;
//   --vite    without PUBLIC_URL, the page comes from Vite's dev server on port 5173.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SERVER } from './config.js';
import { DEV_DATABASE, createPool, migrate } from './node/db.js';
import { PgStore } from './node/store.js';
import { startServer } from './server.js';

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const devDatabase = process.argv.includes('--dev-db');
const databaseUrl = process.env.DATABASE_URL || (devDatabase ? DEV_DATABASE.url : '');
if (databaseUrl === '') {
  stop(
    [
      'DATABASE_URL is not set. The server keeps accounts and match history in Postgres, and needs it to start.',
      'Set DATABASE_URL to a Postgres database, such as postgres://lotr:secret@db:5432/lotr.',
      'For development, `pnpm db` starts a Postgres 17 container, which `pnpm dev` and `pnpm start` use by default.',
    ].join('\n'),
  );
}

/** The connection string without its password, for messages. */
function redacted(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password !== '') parsed.password = '***';
    return parsed.toString();
  } catch {
    return '(a DATABASE_URL that is not a URL)';
  }
}

const port = Number(process.env.PORT ?? SERVER.port);
const publicUrl = process.env.PUBLIC_URL || (process.argv.includes('--vite') ? 'http://localhost:5173' : `http://localhost:${port}`);
try {
  new URL(publicUrl);
} catch {
  stop(`PUBLIC_URL must be the site's origin, such as https://tactics.example.com, not ${publicUrl}.`);
}

const pool = createPool(databaseUrl);
try {
  const applied = await migrate(pool);
  if (applied.length > 0) console.log(`Applied migrations: ${applied.join(', ')}`);
} catch (error) {
  await pool.end().catch(() => {});
  stop(
    `Can't set up the database at ${redacted(databaseUrl)}: ${(error as Error).message}\n` +
      (databaseUrl === DEV_DATABASE.url ? 'Is it running? `pnpm db` starts it.' : 'Is it running, and is DATABASE_URL right?'),
  );
}

const clientDir = fileURLToPath(new URL('../../client/dist', import.meta.url));
const built = existsSync(clientDir);
const server = await startServer({
  port,
  clientDir: built ? clientDir : null,
  store: new PgStore(pool),
  publicUrl,
  trustProxy: process.env.TRUST_PROXY === '1',
});
console.log(`LOTR Tactics server on http://localhost:${server.port} for ${publicUrl}${built ? '' : ' (no client build to serve: run pnpm build)'}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () =>
    void server
      .close()
      .then(() => pool.end())
      .then(() => process.exit(0)),
  );
}
