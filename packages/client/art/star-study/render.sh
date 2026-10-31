#!/usr/bin/env bash
# Renders every option in options/ on the board: the whole study at the game's camera and each unit
# close up, into <out>/<option>/. Needs the study's models in models/ (build.sh).
#   packages/client/art/star-study/render.sh <out dir> [option ...]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:?usage: render.sh <out dir> [option ...]}"
shift
options=("$@")
if [ ${#options[@]} -eq 0 ]; then
  options=()
  for f in "$here"/options/*.json; do options+=("$(basename "$f" .json)"); done
fi
for option in "${options[@]}"; do
  spec="$here/options/$option.json"
  node "$here/../board.mjs" "$out/$option/all" --stars "$spec" >/dev/null
  count=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$spec','utf8')).units.length)")
  for ((u = 0; u < count; u++)); do
    node "$here/../board.mjs" "$out/$option/unit-$u" --stars "$spec" --unit=$u >/dev/null
  done
  echo "RENDERED $option"
done
