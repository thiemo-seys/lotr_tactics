# LOTR Tactics

A browser-based, 8-player auto battler in the style of Teamfight Tactics, with characters from The Lord of the Rings. Rendered in low-poly 3D with Three.js.

## Status

Playable: whole games against bots in the browser, and online lobbies of up to 8 people with bots in the empty seats. Numbers are placeholders until balancing.

## Docs

- [`docs/design.md`](docs/design.md): game design, the source of truth for rules and content.
- [`docs/sim-spec.md`](docs/sim-spec.md): implementation spec for the combat simulation.

## Deploying

The game is one Node process that serves the built client and the WebSocket games. `compose.yaml` runs it in Docker behind [Caddy](https://caddyserver.com), which gets HTTPS certificates from Let's Encrypt on its own.

On a fresh Linux server (a Hetzner Cloud VPS with Ubuntu 24.04, for example):

1. Point your domain's DNS at the server: an A record for its IPv4 address, and an AAAA record for IPv6.
2. Let in only ports 22 (TCP), 80 (TCP) and 443 (TCP and UDP), for example with a Hetzner Cloud Firewall. Use the cloud firewall rather than `ufw`, because Docker's published ports go around `ufw`.
3. Install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
4. Get the code and name your domain:
   ```bash
   git clone https://github.com/thiemo-seys/lotr_tactics.git && cd lotr_tactics   # a private repo needs a deploy key or token
   echo "DOMAIN=tactics.example.com" > .env
   ```
5. Build and start it:
   ```bash
   docker compose up -d --build
   ```
   The game is at `https://<your domain>/play.html`; the fight viewer is at `/`.

To update, run `git pull && docker compose up -d --build`. Games live in memory, so a restart ends every game in progress. `docker compose logs -f` shows the logs.

To run the image without Caddy, for example on your own machine: `docker build -t lotr-tactics .`, then `docker run -p 8080:8080 lotr-tactics`, and open `http://localhost:8080/play.html`.

## Pull requests

Claude reviews each non-draft pull request automatically and posts its findings as inline comments. The workflow is in [`.github/workflows/claude-code-review.yml`](.github/workflows/claude-code-review.yml).
