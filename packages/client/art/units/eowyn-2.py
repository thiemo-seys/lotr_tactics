"""Éowyn, shieldmaiden of Rohan: her 2★ model, with her gear (docs/viewer-spec.md section 4, "Star
levels").

The 1★ Éowyn (eowyn.py) plus one piece: the fair corslet the king gave her when he rode to war and
left her to lead the people ("Éowyn knelt before him and received from him a sword and a fair
corslet ... She was clad now in mail and shone like silver in the sun", The Two Towers, III 6). It
replaces her mail shirt and green kirtle with one long bright hauberk from her throat to the middle
of her calves, flaring over the tops of her boots, bound at the hem in `trim`, so from behind it
shines out below her cape and her golden hair, and from in front she is bright from the mantle to
the boots. Everything else is as on the 1★: bare-headed, her hair over the team-coloured cape, the
round shield forward on her left arm and the sword raised in her right.

Her fittings, the shield's boss and rim, the sword's cross-guard and pommel, the belt buckle, the
two round brooches that pin her cloak and the corslet's hem, use `trim`, which the client colours
silver at 2★.

It is rigged as the 1★ is: this script imports eowyn.py and builds her in the corslet
(eowyn.build()): its long skirt, in place of the kirtle, on her hips, and its bright steel on the
1★'s mail, the coat on her hips and her chest on her spine, bending at the belt as the mail does,
and the sleeves on her upper arms. It finishes her with the 1★'s rig, so she has the same bones and
clips and moves as she does at 1★ (../README.md, Gear models). The 1★'s thighs, under the skirt as
they were under the kirtle, are in its steel, as the skirt, split for riding, wraps them as she
strides or kneels.

    blender --background --factory-startup --python-exit-code 1 --python eowyn-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so her right hand, with the sword, is at -X.
"""

import importlib
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, finish, loft, material, part  # noqa: E402

eowyn = importlib.import_module('eowyn')  # the 1★ model, which this one is with her gear
M = eowyn.M  # her materials, made as she builds

CORSLET = 0xA7B0B9  # the fair corslet, bright as polished steel, lighter than the mail of the 1★


# The gear for 2 stars: the fair corslet ----------------------------------------------------------

# Its skirt, flaring from under the body of the corslet to the middle of her calves in twelve
# heavy folds: z, half-width, half-depth, centre y and the depth of the folds. The top ring is hidden
# under the corslet's body. The hem is bound in trim, a rolled edge standing out from the mail, so
# its top catches the light from the game's camera.
SKIRT = [
    (0.64, 0.15, 0.12, 0.0, 0.0),
    (0.5, 0.208, 0.178, 0.004, 0.01),
    (0.355, 0.244, 0.214, 0.01, 0.015),  # the foot of the mail
    (0.348, 0.262, 0.232, 0.012, 0.016),  # the top of the hem, stepping out
    (0.3, 0.268, 0.238, 0.012, 0.016),  # its lower edge, over the boots
]
SKIRT_BANDS = [0, 0, 1, 1]  # the corslet, then the hem


def corslet():
    """The corslet, made inside the 1★'s `with bone('hips'):` in place of the kirtle. The body of it
    is the 1★'s mail, the coat and the chest, and its sleeves the 1★'s: they are made after this, so
    the corslet's steel takes the mail's place in her materials, and they are made in it."""
    M['corslet'] = material('corslet', CORSLET, roughness=0.55, metallic=0.1)
    M['mail'] = M['corslet']
    # Her thighs, made before it, are in its steel too, as the long skirt split for riding wraps them:
    # in the 1★'s green they showed through the front of the skirt as each swings forward in a stride
    # or a kneel, where under the green kirtle they didn't show.
    for side in ('left', 'right'):
        bpy.data.objects[f'thigh-{side}'].data.materials[0] = M['corslet']
    rings = []
    for z, rx, ry, cy, fold in SKIRT:
        ring = []
        for i in range(12):
            a = math.tau * i / 12
            k = fold if i % 2 else 0.0
            ring.append(V((rx + k) * math.cos(a), cy + (ry + k) * math.sin(a), z))
        rings.append(ring)
    verts, faces, bands = loft(rings)
    face_mats = [SKIRT_BANDS[b] for b in bands]
    part('corslet-skirt', verts, faces, [M['corslet'], M['trim']], face_mats, inside=lambda c: V(0, 0.005, c.z))


def main():
    rig = eowyn.build(corslet=corslet)  # the 1★ Éowyn, in the corslet
    finish('eowyn-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
