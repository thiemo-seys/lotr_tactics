// `pnpm db`: starts a Postgres 17 container for development, which `pnpm dev` and `pnpm start`
// use unless DATABASE_URL says otherwise (docs/accounts-spec.md section 3). Safe to run again:
// it starts the container if it is stopped, and leaves it be if it is running. Its data is kept
// in a Docker volume, so it lasts until the volume is removed.

import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { DEV_DATABASE } from '../src/node/db.js';

const { container, volume, port, user, password, database, url } = DEV_DATABASE;

function docker(...args: string[]) {
  return spawnSync('docker', args, { encoding: 'utf8' });
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const inspect = docker('inspect', '--format', '{{.State.Running}}', container);
if (inspect.error !== undefined) fail('pnpm db needs Docker. Install it, or point DATABASE_URL at a Postgres of your own.');
if (inspect.status !== 0) {
  const run = docker(
    'run', '--detach', '--name', container,
    '--publish', `127.0.0.1:${port}:5432`,
    '--env', `POSTGRES_USER=${user}`, '--env', `POSTGRES_PASSWORD=${password}`, '--env', `POSTGRES_DB=${database}`,
    '--volume', `${volume}:/var/lib/postgresql/data`,
    'postgres:17',
  );
  if (run.status !== 0) fail(`Couldn't start the database container:\n${run.stderr}`);
  console.log(`Started a new Postgres 17 container, ${container}.`);
} else if (inspect.stdout.trim() !== 'true') {
  const start = docker('start', container);
  if (start.status !== 0) fail(`Couldn't start the database container:\n${start.stderr}`);
  console.log(`Started the Postgres container ${container} again.`);
} else {
  console.log(`The Postgres container ${container} is already running.`);
}

// Waits until it takes connections, which a new container takes a few seconds to do.
for (let i = 0; i < 60; i++) {
  if (docker('exec', container, 'pg_isready', '--username', user, '--dbname', database).status === 0) {
    console.log(`Postgres is ready at ${url}. pnpm dev and pnpm start use it.`);
    process.exit(0);
  }
  await sleep(500);
}
fail(`The database container ${container} didn't become ready. See: docker logs ${container}`);
