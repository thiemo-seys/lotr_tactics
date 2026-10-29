// Runs the server (docs/server-spec.md section 9): `pnpm start`, or `pnpm dev` next to the client.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SERVER } from './config.js';
import { startServer } from './server.js';

const clientDir = fileURLToPath(new URL('../../client/dist', import.meta.url));
const built = existsSync(clientDir);
const server = await startServer({ port: Number(process.env.PORT ?? SERVER.port), clientDir: built ? clientDir : null });
console.log(`LOTR Tactics server on http://localhost:${server.port}${built ? '' : ' (no client build to serve: run pnpm build)'}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void server.close().then(() => process.exit(0)));
}
