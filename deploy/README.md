# Deploying

The game runs on one server as two containers: the game server (the `Dockerfile` at the root) and Caddy in front of it for HTTPS. These steps are for a Hetzner Cloud VPS, but any Linux server with Docker works.

- `compose.yml`: the game and Caddy. Only Caddy has ports; the game is reached over the compose network.
- `Caddyfile`: HTTPS, compression, `/` sent to `/play.html`, and caching for built files.
- `deploy.sh`: updates to the newest image, once no game is running.
- `.env.example`: the settings, copied to `.env` on the server.

## How an image is made

`.github/workflows/docker.yml` builds the image when CI passes on `main` and pushes it to `ghcr.io/thiemo-seys/lotr_tactics`, tagged `latest` and with the commit SHA. You can also run it by hand from the Actions tab. The workflow only runs once it is on `main`.

The images are built for Arm (`linux/arm64`), so pick an Arm server (CAX), not an x86 one (CX or CPX). To build for x86 instead, change `--platform` in the workflow to `linux/amd64`.

Each image has a version: a hash of the source under `packages/`. The server only lets pages of the same version into lobbies. A page that was left open over an update is told "The game has been updated. Reload the page to play." (`docs/server-spec.md` section 8).

## Setting up the server

1. **Create the server** in the Hetzner Cloud console: the smallest Arm plan (CAX11) is plenty, with Ubuntu 24.04 and your SSH key.
2. **Firewall:** add a Hetzner Cloud Firewall that lets in TCP 22, 80 and 443 and UDP 443, and apply it to the server. Docker bypasses `ufw` for published ports, so use the Cloud Firewall rather than `ufw`.
3. **DNS:** point an A record (and an AAAA record for IPv6) for your domain at the server's IP. Caddy needs this to get a certificate.
4. **Install Docker:** log in as root and run

   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

5. **Log in to the registry**, since the image is private. Create a GitHub personal access token (classic) with only `read:packages`, then:

   ```bash
   docker login ghcr.io -u <your GitHub user>
   ```

6. **Copy this folder** to the server, for example to `/opt/lotr-tactics`. From your machine:

   ```bash
   scp -r deploy root@<server>:/opt/lotr-tactics
   ```

7. **Settings:** on the server, copy `.env.example` to `.env` and set `DOMAIN`.

   ```bash
   cd /opt/lotr-tactics && cp .env.example .env && nano .env
   ```

8. **Start it:**

   ```bash
   /opt/lotr-tactics/deploy.sh
   ```

   The game is now at `https://<your domain>`. Caddy gets its certificate on the first request, which takes a few seconds.

## Updating

Run `deploy.sh` on the server after the image workflow has finished:

```bash
/opt/lotr-tactics/deploy.sh
```

Games live in memory, so a restart ends every game in progress. `deploy.sh` pulls the new image first, then waits until no game is running before restarting the game container, which takes a few seconds. People in a lobby that hasn't started, or on the menu, are moved back to the menu. Caddy keeps running.

- It waits at most `WAIT_MINUTES` (default 60), then gives up and changes nothing. Run it again later, or with `--now` to restart at once and end the running games.
- There is a small race: a game that starts in the second between the last check and the restart is ended.

## Rolling back

Set `IMAGE` in `.env` to an older commit's tag, then run `deploy.sh`:

```
IMAGE=ghcr.io/thiemo-seys/lotr_tactics:<commit SHA>
```

Set it back to `:latest` for the next update.

## Looking at it

All of these run in `/opt/lotr-tactics`.

- What is running, and whether the game is healthy:

  ```bash
  docker compose ps
  ```

- The game's log:

  ```bash
  docker compose logs -f game
  ```

- Lobbies, running games and people connected. `/status` is only reachable from inside the server; Caddy hides it.

  ```bash
  docker compose exec game node -e "fetch('http://127.0.0.1:8080/status').then((r) => r.text()).then(console.log)"
  ```

## Building the image yourself

From the root of the repository, an image for your own machine:

```bash
docker build -t lotr-tactics .
```

Or for an Arm server, from any machine:

```bash
docker build --platform linux/arm64 -t lotr-tactics .
```

```bash
docker run --rm -p 8080:8080 lotr-tactics
```

The game is then at `http://localhost:8080/play.html`.
