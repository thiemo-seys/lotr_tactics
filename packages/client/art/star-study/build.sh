#!/usr/bin/env bash
# Builds the study's models from the scripts here into models/.
#   packages/client/art/star-study/build.sh [name ...]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$here/models"
names=("$@")
if [ ${#names[@]} -eq 0 ]; then
  names=()
  for f in "$here"/*.py; do names+=("$(basename "$f" .py)"); done
fi
for name in "${names[@]}"; do
  if ! log=$(blender --background --factory-startup --python-exit-code 1 --python "$here/$name.py" -- "$here/models/$name.glb" 2>&1); then
    echo "$log" | tail -20
    exit 1
  fi
  echo "$log" | grep -E '^(MODEL|WARNING)' || true
done
