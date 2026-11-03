"""Sauron, the Dark Lord: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star levels").

The 1★ Sauron (sauron.py) plus one piece, a pair of haute-pieces, tall plates of iron standing up
from his pauldrons round either side of his neck and helm, their rolled top edges in `trim`. They
raise his shoulders into a high guard about his head that shows from in front, from behind and from
above, and leave the head itself for the crown-helm of his 3★ model (sauron-3.py). His other
fittings use `trim` as on the 1★ model.

It is rigged as the 1★ is: this script imports sauron.py, builds him with the haute-pieces standing
up from his pauldrons and leaned with him (sauron.build()), bound to his spine as the pauldrons are,
and finishes him with the 1★'s rig, so he has the same bones and clips and moves as he does at 1★
(../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python sauron-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import LARGE_GEAR_BUDGET, V, bone, finish, part, wind  # noqa: E402

sauron = importlib.import_module('sauron')  # the 1★ model, which this one is with its gear
M = sauron.M  # its materials, made as it builds


# The gear for 2 stars: haute-pieces --------------------------------------------------------------

# Each is a plate curved round the side of his neck, its foot sunk in the pauldron and the cape: it
# runs from HAUTE_ARC[0] to HAUTE_ARC[1] degrees round the neck (0 is straight out to his side, and
# negative towards his front), and its top arches from HAUTE_TOP[0] at the middle to HAUTE_TOP[1] at
# the ends. Its cross-section, out from the neck's axis: up the inner face, over the rolled top edge,
# which is trim, and down the outer face, as (radius, height above or below the top).
HAUTE_AXIS = V(0, 0.02, 0)  # the neck's axis, upright through this point
HAUTE_ARC = (-50, 50)
HAUTE_STEPS = 6
HAUTE_FOOT = 1.45
HAUTE_TOP = (1.82, 1.73)
HAUTE_SECTION = [(0.25, None), (0.25, 0.0), (0.285, 0.014), (0.278, -0.032), (0.272, None)]
HAUTE_BANDS = [0, 1, 1, 0]  # the inner face, the top edge's two faces, the outer face


def haute_pieces():
    """The haute-pieces, as main drew them, called inside the 1★'s build after the mace, before he
    leans. They stand up from the pauldrons, so they ride his spine with them."""
    n = len(HAUTE_SECTION)
    for side, s in (('right', -1), ('left', 1)):
        verts, sections = [], []
        for k in range(HAUTE_STEPS + 1):
            t = k / HAUTE_STEPS
            a = math.radians(HAUTE_ARC[0] + (HAUTE_ARC[1] - HAUTE_ARC[0]) * t)
            out = V(s * math.cos(a), math.sin(a), 0)
            top = HAUTE_TOP[0] + (HAUTE_TOP[1] - HAUTE_TOP[0]) * abs(2 * t - 1) ** 1.5
            sections.append(out)
            for r, dz in HAUTE_SECTION:
                verts.append(HAUTE_AXIS + r * out + V(0, 0, HAUTE_FOOT if dz is None else top + dz))
        faces, face_mats = [], []
        for k in range(HAUTE_STEPS):
            # Wound away from the plate's middle, a little below its top.
            middle = HAUTE_AXIS + 0.265 * (sections[k] + sections[k + 1]).normalized()
            for j in range(n - 1):
                quad = (k * n + j, (k + 1) * n + j, (k + 1) * n + j + 1, k * n + j + 1)
                centre = sum((verts[i] for i in quad), Vector()) / 4
                faces += wind(verts, [quad], inside=V(middle.x, middle.y, centre.z - 0.02))
                face_mats.append(HAUTE_BANDS[j])
        # Its two ends, closed square to the arc.
        for k, ahead in ((0, -1), (HAUTE_STEPS, 1)):
            tangent = V(0, 0, 1).cross(sections[k]) * s * ahead
            faces += wind(verts, [tuple(range(k * n, k * n + n))], outward=tangent)
            face_mats.append(0)
        with bone('spine'):
            part(f'haute-{side}', verts, faces, [M['iron'], M['trim']], face_mats)


def main():
    rig = sauron.build(haute=haute_pieces)  # the 1★ Sauron, with the haute-pieces
    finish('sauron-2', budget=LARGE_GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
