#!/bin/sh
# Rebuilds models and arenas from their scripts with Blender 4.5 LTS, one Blender process each, into
# packages/client/public/models/ and public/arenas/. Prints each one's summary line and any warnings.
#
#   build.sh [id ...]    every script in units/ and arenas/ when no id is given; for a unit's id, its
#                        1★ model and its 2★ and 3★ models (<id>-2.py, <id>-3.py) if it has them;
#                        for an arena's, the arena

cd "$(dirname "$0")" || exit 1
if [ $# -eq 0 ]; then
  set -- $(ls units/*.py arenas/*.py | sed 's|^[a-z]*/||; s|\.py$||')
else
  for id in "$@"; do
    shift
    set -- "$@" "$id"
    for star in 2 3; do
      [ -f "units/$id-$star.py" ] && set -- "$@" "$id-$star"
    done
  done
fi
log=$(mktemp)
trap 'rm -f "$log"' EXIT
for id in "$@"; do
  script="units/$id.py"
  [ -f "$script" ] || script="arenas/$id.py"
  if ! blender --background --factory-startup --python-exit-code 1 --python "$script" > "$log" 2>&1; then
    tail -n 20 "$log" >&2
    echo "FAILED $id" >&2
    exit 1
  fi
  grep -E '^(MODEL|WARNING)' "$log"
done
