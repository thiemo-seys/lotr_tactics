"""Peregrin Took, Pippin: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star levels").

The 1★ Pippin (pippin.py) plus one piece, his blade from the Barrow-downs drawn in his free left hand,
which comes out from under the cloak. Tom Bombadil gave each hobbit "a dagger, long, leaf-shaped,
and keen, of marvellous workmanship" (The Fellowship of the Ring, I 8), a sword to a hobbit; it is
the blade Pippin lays at Denethor's feet when he offers his service, and "the written blade of
Westernesse" with which he kills a troll before the Black Gate (The Return of the King, V 1 and
V 10). Plain bright steel, with no glow, held up and out to his left, its flat to the front, so it
shows beside the cloak from behind and against it from the front.

Everything else is as at 1★: the team colour on his cloak, and `trim` on his fittings: the setting
behind the leaf clasp, the belt buckle, the jerkin's buttons and the ring that gathers the pouch's
neck, and the blade's cross-guard and pommel.

It is rigged as the 1★ is: this script imports pippin.py, builds him with his left arm and the blade
in its hand, bound to the left arm's bones (pippin.build()), and finishes him with the 1★'s rig, so he
has the same bones and clips and moves as he does at 1★ (../README.md, Gear models). At 1★ that arm
has its joints under the cloak but no parts; main's 2★ model, built before the rig, brought it out
further forward; this one builds the sleeve and the fist on the 1★'s joints, where the twist has
carried them, so the fist comes out at the cloak's front edge, and the blade from there. The fist and
the blade ride the forearm, not the hand (the note on BLADE_ALONG says why).

    blender --background --factory-startup --python-exit-code 1 --python pippin-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import (  # noqa: E402
    GEAR_BUDGET,
    V,
    bone,
    box,
    cone,
    finish,
    loft,
    material,
    nearest_on_line,
    part,
    tube,
)

pippin = importlib.import_module('pippin')  # the 1★ model, which this one is with its gear
M = pippin.M  # its materials, made as it builds

BLADE = 0xCED3D6  # the barrow-blade: plain bright steel


# The gear for 2 stars: the barrow-blade, in his left hand --------------------------------------------

# The left arm on the 1★'s joints (pippin.L_SHOULDER and the rest), where the twist carries them: the
# upper arm and forearm inside the cloak, and the fist at its front edge, forward by his hip. The fist
# and the blade are bound to the forearm, the wrist held stiff: at 1★ the hand held nothing, and its
# clips turn it freely, as far as upside down against his belly as he dies (`knees`), which on the
# hand put the blade through his body and up out of his back; on the forearm it lies out at his side.
BLADE_ALONG = V(0.6, -0.15, 0.78).normalized()  # up and out to his left, a little forward
BLADE_LENGTH = 0.34  # from the guard to the point
# Stations along the blade: fraction of its length, half-width and half-thickness at the ridge. It
# is leaf-shaped, widest past the middle.
BLADE_STATIONS = [(0.0, 0.022, 0.008), (0.55, 0.03, 0.008), (0.84, 0.02, 0.006)]


def barrow_blade():
    """His left arm, a full linen sleeve in two that overlap at the elbow as the right's, and his
    fist, on the 1★'s joints, with the blade in it; called after the twist, before he leans."""
    M['steel'] = material('steel', BLADE, roughness=0.4, metallic=0.1)
    shoulder, elbow, wrist = (pippin.twisted(p) for p in (pippin.L_SHOULDER, pippin.L_ELBOW, pippin.L_WRIST))
    with bone('upper_arm_l'):
        past = 1 + pippin.ELBOW / (elbow - shoulder).length
        tube('sleeve-left', shoulder, elbow, [(0, 0.05), (past, 0.047)], M['shirt'])
    with bone('forearm_l'):
        tube('cuff-left', elbow, wrist, [(-pippin.ELBOW / (wrist - elbow).length, 0.048), (1, 0.04)], M['shirt'])

    ahead = (wrist - elbow).normalized()
    up = (BLADE_ALONG - BLADE_ALONG.dot(ahead) * ahead).normalized()  # the thumb along the blade
    across = ahead.cross(up)
    fist = wrist + 0.03 * ahead

    # The flat of the blade faces forward, so that it shows broad from in front and from behind.
    along = BLADE_ALONG
    forward = V(0, -1, 0)
    flat = (forward - forward.dot(along) * along).normalized()
    width = flat.cross(along)
    guard = fist + 0.055 * along
    rings = []
    for t, w, th in BLADE_STATIONS:
        c = guard + t * BLADE_LENGTH * along
        rings.append([c + w * width, c + th * flat, c - w * width, c - th * flat])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * 4
    verts.append(guard + BLADE_LENGTH * along)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]

    with bone('forearm_l'):  # the wrist held stiff, above
        box('fist-left', fist, [ahead, up, across], (0.038, 0.04, 0.042), M['skin'], 0.86)
        part('blade', verts, faces, M['steel'], inside=nearest_on_line(guard, guard + along))
        # A short cross-guard, a leather grip and a pommel.
        box('guard', guard, [along, width, flat], (0.011, 0.056, 0.016), M['trim'], 0.8)
        end = fist - 0.058 * along
        tube('grip', end, guard, [(0, 0.015), (1, 0.015)], M['leather'], n=4, phase=45)
        cone('pommel', end, end - 0.03 * along, 0.023, M['trim'], n=4, phase=45, back=end + 0.012 * along)


def main():
    rig = pippin.build(blade=barrow_blade)  # the 1★ Pippin, with the blade in his left hand
    finish('pippin-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
