# LOTR Tactics

A browser-based, 8-player auto battler in the style of Teamfight Tactics, with characters from The Lord of the Rings. Rendered in low-poly 3D with Three.js.

## Status

Playable: whole games against bots in the browser, and online lobbies of up to 8 people with bots in the empty seats. Numbers are placeholders until balancing.

## Docs

- [`docs/design.md`](docs/design.md): game design, the source of truth for rules and content.
- [`docs/sim-spec.md`](docs/sim-spec.md): implementation spec for the combat simulation.

## Running it locally

The server keeps accounts and match history in Postgres, and won't start without it. With Docker installed:

```bash
pnpm install
pnpm db      # starts a Postgres 17 container, lotr-tactics-db, on port 5433; safe to run again
pnpm dev     # the client and the game server; open http://localhost:5173/play.html
```

`pnpm dev` and `pnpm start` use the `pnpm db` database unless `DATABASE_URL` says otherwise. Its data is in the `lotr-tactics-db` Docker volume; `docker rm -f lotr-tactics-db && docker volume rm lotr-tactics-db` starts it afresh. Offline games against bots need no server or database.

The server's tests against Postgres run when `DATABASE_URL` is set, and are skipped otherwise. Each test file makes a schema of its own and drops it afterwards, so any database the user can create schemas in will do, such as the `pnpm db` one: `DATABASE_URL=postgres://lotr:lotr@localhost:5433/lotr pnpm test`.

## Deploying

The game is one Node process that serves the built client, the HTTP API and the WebSocket games, with Postgres beside it for accounts and match history. `compose.yaml` runs both in Docker behind [Caddy](https://caddyserver.com), which gets HTTPS certificates from Let's Encrypt on its own.

On a fresh Linux server (a Hetzner Cloud VPS with Ubuntu 24.04, for example):

1. Point your domain's DNS at the server: an A record for its IPv4 address, and an AAAA record for IPv6.
2. Let in only ports 22 (TCP), 80 (TCP) and 443 (TCP and UDP), for example with a Hetzner Cloud Firewall. Use the cloud firewall rather than `ufw`, because Docker's published ports go around `ufw`.
3. Install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
4. Get the code, and write `.env` with your domain and a password for the database:
   ```bash
   git clone https://github.com/thiemo-seys/lotr_tactics.git && cd lotr_tactics   # a private repo needs a deploy key or token
   echo "DOMAIN=tactics.example.com" > .env
   echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env
   ```
   `.env` is not committed. The password goes into a connection string, so keep to letters and digits. The game gets `DATABASE_URL`, `PUBLIC_URL=https://<DOMAIN>` and `TRUST_PROXY=1` from `compose.yaml`; the database's port isn't opened on the host.
5. Build and start it:
   ```bash
   docker compose up -d --build
   ```
   The game is at `https://<your domain>/play.html`; the fight viewer is at `/`.

To update, run `git pull && docker compose up -d --build`. The server applies new database migrations as it starts. Games live in memory, so a restart ends every game in progress; nothing is recorded for them. `docker compose logs -f` shows the logs.

**Backups.** Accounts and history are in the `pg_data` volume. A nightly dump from cron, kept for two weeks, for example with `crontab -e`:

```
0 4 * * * cd /root/lotr_tactics && docker compose exec -T db pg_dump --username lotr --format custom lotr > backups/lotr-$(date +\%F).dump && find backups -name '*.dump' -mtime +14 -delete
```

(Make the `backups` folder first, and copy it off the server now and then.) To restore one into the running database, stop the game, restore, and start it again:

```bash
docker compose stop game
docker compose exec -T db pg_restore --username lotr --dbname lotr --clean --if-exists < backups/lotr-2026-01-31.dump
docker compose start game
```

To run the image without Caddy, for example on your own machine: `docker build -t lotr-tactics .`, then, with `pnpm db` running, `docker run -p 8080:8080 -e DATABASE_URL=postgres://lotr:lotr@host.docker.internal:5433/lotr --add-host host.docker.internal:host-gateway lotr-tactics`, and open `http://localhost:8080/play.html`.

## Pull requests

Claude reviews each non-draft pull request automatically and posts its findings as inline comments. The workflow is in [`.github/workflows/claude-code-review.yml`](.github/workflows/claude-code-review.yml).
