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

Google sign-in is off unless `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. To try it in development, make a Google OAuth client with `http://localhost:5173/auth/google/callback` among its redirect URIs (see [Google sign-in](#google-sign-in) below), and start the server with both in the environment: `GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... pnpm dev`.

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
5. To let people sign in with Google, so their accounts work on every device, make a Google OAuth client ([Google sign-in](#google-sign-in) below) and add it to `.env`:
   ```bash
   echo "GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com" >> .env
   echo "GOOGLE_CLIENT_SECRET=GOCSPX-..." >> .env
   ```
   Without them everyone plays as a guest, and the page hides Sign in with Google.
6. Build and start it:
   ```bash
   docker compose up -d --build
   ```
   The game is at `https://<your domain>/play.html`; the fight viewer is at `/`.

### Google sign-in

The server signs people in with Google's OpenID Connect, asking only for the `openid` scope, so it learns nothing but an id for the Google account: no name, email or picture (`docs/accounts-spec.md` section 6.2). To make its OAuth client, in the [Google Cloud Console](https://console.cloud.google.com):

1. Make a project for the game, or pick one, in the project picker at the top.
2. Open **Google Auth Platform** (APIs & Services, then OAuth consent screen) and **Get started**. Give the app's name, as people will see it when they sign in, and a support email; choose **External** for the audience; and give a contact email.
3. Under **Branding**, add your domain (such as `example.com` for `tactics.example.com`) to the authorized domains, and the links to your home page if you like. Under **Data access**, add the `openid` scope only. It is not a sensitive scope, so Google needn't verify the app.
4. Under **Audience**, **Publish app**, so that anyone with a Google account can sign in. While it is in testing, only the test users listed there can.
5. Under **Clients**, **Create client**, of type **Web application**. It needs no JavaScript origins. Add the **Authorized redirect URIs**:
   - `https://<DOMAIN>/auth/google/callback`, for the server (the `PUBLIC_URL` and `/auth/google/callback`);
   - `http://localhost:5173/auth/google/callback`, for `pnpm dev`, if you will try it there. A separate client for development works as well.
6. Copy the client's **Client ID** and **Client secret** into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (step 5 above), and run `docker compose up -d` to restart the game with them. Its log says whether Google sign-in is on. Keep the secret out of the repository; if it leaks, make a new one under the client and delete the old.

### Updating and backups

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
