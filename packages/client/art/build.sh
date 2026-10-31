#!/bin/sh
# Rebuilds models from their scripts with Blender 4.5 LTS, one Blender process each, into
# packages/client/public/models/. Prints each model's summary line and any warnings.
#
#   build.sh [id ...]    every unit in units/ when no id is given

cd "$(dirname "$0")" || exit 1
[ $# -eq 0 ] && set -- $(ls units/*.py | sed 's|^units/||; s|\.py$||')
log=$(mktemp)
trap 'rm -f "$log"' EXIT
for id in "$@"; do
  if ! blender --background --factory-startup --python-exit-code 1 --python "units/$id.py" > "$log" 2>&1; then
    tail -n 20 "$log" >&2
    echo "FAILED $id" >&2
    exit 1
  fi
  grep -E '^(MODEL|WARNING)' "$log"
done
