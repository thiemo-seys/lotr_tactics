#!/bin/sh
# Updates the game on the server to the newest image (deploy/README.md).
#
# A restart ends every game, since games live in memory. So once the new image is pulled, this waits
# until no game is running before restarting: at most WAIT_MINUTES (default 60), then it gives up.
#
#   ./deploy.sh         wait for running games to end, then restart
#   ./deploy.sh --now   restart at once, ending any running games

set -eu
cd "$(dirname "$0")"

now=false
case "${1:-}" in
  --now) now=true ;;
  '') ;;
  *) echo "Usage: $0 [--now]" >&2; exit 2 ;;
esac

image=$(docker compose config --images game)
docker compose pull game

container=$(docker compose ps -q game)
if [ -n "$container" ] && [ "$(docker inspect --format '{{.Image}}' "$container")" = "$(docker image inspect --format '{{.Id}}' "$image")" ]; then
  echo "Already running the newest $image."
  docker compose up -d
  exit 0
fi

# Games running on the server, or 0 if it isn't up.
games() {
  docker compose exec -T game node -e \
    "fetch('http://127.0.0.1:8080/status').then((r) => r.json()).then((s) => console.log(s.games))" 2>/dev/null || echo 0
}

if [ -n "$container" ] && [ "$now" = false ]; then
  deadline=$(($(date +%s) + ${WAIT_MINUTES:-60} * 60))
  while [ "$(games)" -gt 0 ]; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "Games are still running after ${WAIT_MINUTES:-60} minutes. Try again later, or run $0 --now to end them." >&2
      exit 1
    fi
    echo "$(games) game(s) running. Waiting..."
    sleep 30
  done
fi

docker compose up -d
docker image prune -f
echo "Now running $image."
