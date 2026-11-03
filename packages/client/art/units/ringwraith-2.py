"""A Ringwraith, one of the Nine: its 2★ model, with its gear (docs/viewer-spec.md section 4, "Star
levels").

The 1★ Ringwraith (ringwraith.py) plus one piece, a long sword of steel drawn in the left hand, as the
Nine came up Weathertop against Frodo: "in their haggard hands were swords of steel" (The Fellowship
of the Ring, I 11). The haggard hand that reached out with the Black Breath closes round its grip and
holds it up, the blade leaning back over its left shoulder, so that it rises beside the hood from
in front and from behind. Its guard and pommel are `trim`, as are the knife's, the clasp,
the buckle and the bosses on the shoulders. The hood stays dark and faceless: the face is for the 3★.

It is rigged as the 1★ is: this script imports ringwraith.py, builds it with the fist and the sword
in its left hand in place of the claw, bound to the hand (ringwraith.build()), and finishes it with
the 1★'s rig, so it has the same bones and clips and moves as it does at 1★ (../README.md, Gear
models). Main's 2★ model, built before the rig, tipped the knife up a little further, so that the
static model reached no further than 0.85 from its centre and the client grew it the full 10%; a
rigged model is scaled by the reach of its clips, so the knife is the 1★'s.

    blender --background --factory-startup --python-exit-code 1 --python ringwraith-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so its right hand is at -X.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, box, cone, finish, loft, material, part  # noqa: E402

ringwraith = importlib.import_module('ringwraith')  # the 1★ model, which this one is with its gear
M = ringwraith.M  # its materials, made as it builds

STEEL = 0xB7BAB9  # the sword's plain steel, a neutral light grey
GRIP = 0x1F1D1C  # its black grip


# The gear for 2 stars: a long sword --------------------------------------------------------------

# Drawn in the left hand and held up, leaning back over its left shoulder and a little out, its flat
# to the front and the back. Main held it leaning forward and out (0.34, -0.12, 0.93), from the claw
# reaching out before it; on the rigged 1★ arm, that put its point out of the hex as the Black Breath
# thrusts the hand at the foe's face, and into the ground as the hand drops by its knee in death, so
# fit() drew the arm in and turned it up, by up to 103 and 175 degrees. Leaning back, it stays in the
# hex and out of the ground in every clip, and the clips are the 1★'s, key for key.
SWORD = V(0.15, 0.6, 0.8).normalized()
SWORD_LENGTH = 0.62  # from the guard to the point, which stays below the label
# Stations along the blade: fraction of its length, half-width and half-thickness.
SWORD_STATIONS = [(0.0, 0.034, 0.011), (0.8, 0.026, 0.009)]
SWORD_GUARD = 0.085  # half the cross-guard's width
SWORD_GRIP = 0.15  # from the guard down to the pommel


def sword():
    """The fist and the sword in it, made inside the 1★'s `with bone('hand_l'):` in place of the claw,
    so they go with the hand."""
    M['steel'] = material('steel', STEEL, roughness=0.4, metallic=0.1)
    M['grip'] = material('grip', GRIP, roughness=0.8)
    ahead = (ringwraith.L_WRIST - ringwraith.L_ELBOW).normalized()
    fist = ringwraith.L_WRIST + 0.045 * ahead
    # The fist closes round the grip, its knuckles along the forearm.
    knuckles = (ahead - ahead.dot(SWORD) * SWORD).normalized()
    box('fist-left', fist, [knuckles, SWORD, knuckles.cross(SWORD)], (0.05, 0.054, 0.05), M['skin'], 0.86)

    # The blade's edges lie in the plane it leans in, so its flat faces the front and the back.
    width = SWORD.cross(V(0, 1, 0)).normalized()
    side = SWORD.cross(width).normalized()
    guard = fist + 0.072 * SWORD
    rings = []
    for t, w, th in SWORD_STATIONS:
        c = guard + t * SWORD_LENGTH * SWORD
        rings.append([c + w * width, c + th * side, c - w * width, c - th * side])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * 4
    verts.append(guard + SWORD_LENGTH * SWORD)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    part('sword', verts, faces, M['steel'], inside=lambda c: guard + (c - guard).dot(SWORD) * SWORD)

    # A straight cross-guard and a pommel in `trim`, and the black grip through the fist.
    box('sword-guard', guard, [SWORD, width, side], (0.014, SWORD_GUARD, 0.02), M['trim'], 0.8)
    end = guard - SWORD_GRIP * SWORD
    ringwraith.limb('sword-grip', [end, guard], [0.017, 0.017], M['grip'], n=4, phase=45)
    cone('sword-pommel', end, end - 0.045 * SWORD, 0.03, M['trim'], n=4, phase=45, back=end + 0.016 * SWORD)


def main():
    rig = ringwraith.build(sword=sword)  # the 1★ Ringwraith, with the sword in its left hand
    finish('ringwraith-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
