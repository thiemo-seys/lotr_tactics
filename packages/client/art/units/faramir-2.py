"""Faramir, Gondor, Archer: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star levels").

The 1★ Faramir (faramir.py) plus one piece, the long sword of Gondor at his left hip, for the
Rangers of Ithilien "all had swords at their sides" (The Two Towers, IV 4). It hangs from his belt
below the cloak, the hilt forward and the scabbard swept back and out past his left leg, so it shows
from behind as well as from in front. Its cross-guard, pommel, locket, middle band and chape are
`trim`, like his other fittings, so it reads as a line of them at his hip.

Everything else is as at 1★: the team colour on his hooded cloak, the hood up, and `trim` on his
fittings: the belt buckle, the clasp at the throat of his cloak, the buckle of the quiver's strap on
his breast, the quiver's mouth and its shod foot, and the bands either side of the bow's grip.

It is rigged as the 1★ is: this script imports faramir.py, builds him with the sword at his left hip,
bound to his hips as the belt it hangs from is (faramir.build()), and finishes him with the 1★'s rig,
so he has the same bones and clips and moves as he does at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python faramir-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, bone, box, cone, finish, tube  # noqa: E402

faramir = importlib.import_module('faramir')  # the 1★ model, which this one is with his gear
M = faramir.M  # its materials, made as it builds


# The gear for 2 stars: the long sword at his left hip -----------------------------------------------

# In the torso's frame: the mouth of the scabbard, below the belt at his left side, and the way the
# scabbard runs from it, back, down and out; the hilt runs the other way, up and forward. Main's
# model, built before the rig, hung it from further forward and steeper (33 degrees from upright), its
# hilt across the front of his left thigh and its chape 7 cm off the ground. Rigged, it rides his
# hips: there his left thigh went through the hilt as he stands and runs, his bow arm through it as
# it droops in his daze, and its chape up to 11 cm into the ground as his hips sank in his run, his
# daze and his fall to his knees, where it would have held his hips up off his knees
# (clips.grounded()), changing the 1★'s clip. So it hangs from further back at his side, swept back
# 50 degrees from upright and only a little out, as long as main's: its chape clears the ground in
# every frame and between frames of the 1★'s clips, by 3 cm, and the hilt, pointing ahead past his
# thigh, is only grazed: by the thigh in three frames of his run and by the drooping bow arm in six
# of his daze; the scabbard, by the bow hand as it falls past it in his fall (frames 9.5 to 12).
SWORD_MOUTH = V(0.27, 0.08, 0.62)
SWORD_DOWN = V(0.1983, 0.7399, -0.6428).normalized()  # 50 degrees from upright, heading 15 degrees out
SCABBARD = 0.56  # long: the hand-and-a-half sword of a captain of Gondor
HILT = 0.12  # from the cross-guard to the pommel


def sword():
    with bone('hips'):  # hung from the belt, it moves with his hips, as the skirt of his tunic does
        sword_parts()


def sword_parts():
    d, mouth = SWORD_DOWN, SWORD_MOUTH
    tip = mouth + SCABBARD * d
    # The scabbard, broader across than deep, with a metal locket at its mouth, a band halfway down
    # and a long chape at its foot.
    stations = [(0, 0.037), (0.1, 0.035), (0.44, 0.032), (0.5, 0.032), (0.78, 0.029), (1, 0.026)]
    tube('scabbard', mouth, tip, stations, [M['trim'], M['leather']], [0, 1, 0, 1, 0], n=6, squash=0.7)
    cone('chape', tip, tip + 0.05 * d, 0.026, M['trim'], n=6, squash=0.7, back=None)

    # The hilt: a broad cross-guard on the mouth, the grip wound with leather, a faceted pommel.
    flat = (V(1, 0, 0) - d.x * d).normalized()
    edge = d.cross(flat).normalized()
    guard = mouth - 0.014 * d
    box('guard', guard, [d, edge, flat], (0.013, 0.095, 0.024), M['trim'], 0.85)
    end = guard - HILT * d
    tube('grip', guard, end, [(0, 0.018), (1, 0.02)], M['leather'], n=4, phase=45)
    cone('pommel', end - 0.014 * d, end - 0.056 * d, 0.032, M['trim'], n=6, back=end + 0.004 * d)


def main():
    rig = faramir.build(sword=sword)  # the 1★ Faramir, with the sword at his left hip
    finish('faramir-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
