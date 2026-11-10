#!/usr/bin/env bash
# Builds the study's models from sauron-dense.py into models/<level>/sauron.glb, with Blender 4.5 LTS.
#   packages/client/art/sauron-study/build.sh [level ...]    every level when none is given: 3k, 5k, 10k, 40k
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
levels=("$@")
if [ ${#levels[@]} -eq 0 ]; then
  levels=(3k 5k 10k 40k)
fi
for level in "${levels[@]}"; do
  mkdir -p "$here/models/$level"
  if ! log=$(blender --background --factory-startup --python-exit-code 1 --python "$here/sauron-dense.py" -- \
    "$here/models/$level/sauron.glb" "$level" 2>&1); then
    echo "$log" | tail -20
    exit 1
  fi
  echo "$log" | grep -E '^(PARTS|MODEL|WARNING)' || true
done
