"""Each unit's livery colour, from packages/client/src/livery.json, which the client reads too
(docs/viewer-spec.md section 4, Livery). No bpy, so it runs and is checked outside Blender.

    python3 packages/client/art/livery.py <model.glb>...   # prints each model's unit and colour
"""

import json
import os
import re
import sys

LIVERY_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'livery.json')


def load():
    with open(LIVERY_JSON, encoding='utf-8') as f:
        return json.load(f)


def unit_of(model_path):
    """The unit a model file is of: its name without `.glb` and a star level's `-2` or `-3`."""
    return re.sub(r'-[23]$', '', os.path.splitext(os.path.basename(model_path))[0])


def livery(model_path, data=None):
    """The livery colour of the unit a model file is of, as 0xrrggbb: the unit's own, its faction's,
    or the default for a file named after no unit, such as a study's."""
    data = data or load()
    value = data['units'].get(unit_of(model_path))
    colour = data['default'] if value is None else value if value.startswith('#') else data['factions'][value]
    return int(colour[1:], 16)


if __name__ == '__main__':
    data = load()
    for path in sys.argv[1:]:
        print(f'{path}: {unit_of(path)} #{livery(path, data):06x}')
