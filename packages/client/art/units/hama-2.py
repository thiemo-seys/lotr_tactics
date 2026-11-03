"""Háma, Doorward of King Théoden: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star
levels").

The 1★ Háma (hama.py), the same man of Rohan in his long mail coat, with his crested helm, the sun on
his round shield and his ash spear, plus one piece: the shoulder-guards of the King's guard. A broad
steel plate on each shoulder flares out from under his mantle and down over the upper arm, its lower
edge rolled and bound in `trim`, so his shoulders stand out past the mantle from in front, from
behind and from above. The mantle and the cape keep the team colour where they had it.

His fittings, the helm's band, the shield's boss, the belt buckle, the spear's socket, the brooches
on his shoulders and the shoulder-guards' edges, use `trim`, which the client colours silver at 2★.

It is rigged as the 1★ is: this script imports hama.py, builds him with a shoulder-guard on each
upper arm, bound to it (hama.build()), and finishes him with the 1★'s rig, so he has the same bones
and clips and moves as he does at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python hama-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand, on the spear, is at -X.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, bone, finish, tube  # noqa: E402

hama = importlib.import_module('hama')  # the 1★ model, which this one is with his gear
M = hama.M  # his materials, made as he builds


# The gear for 2 stars: the shoulder-guards of the King's guard --------------------------------------

# Each guard down the upper arm from the shoulder, as (fraction to the elbow, radius): it starts
# under the mantle, flares out past it over the point of the shoulder and ends in a rolled edge.
SPAULDER = [(0.0, 0.1), (0.13, 0.17), (0.4, 0.158), (0.47, 0.145)]
SPAULDER_BANDS = [0, 0, 1]  # steel, and the edge in trim


def spaulders():
    # Strapped round the top of each sleeve, made with the arms before he leans, so they move with the
    # upper arm, as the sleeve does.
    for side, shoulder, elbow in (('right', hama.R_SHOULDER, hama.R_ELBOW), ('left', hama.L_SHOULDER, hama.L_ELBOW)):
        with bone(f'upper_arm_{side[0]}'):
            tube(f'spaulder-{side}', shoulder, elbow, SPAULDER, [M['steel'], M['trim']], SPAULDER_BANDS, n=8,
                 phase=22.5)


def main():
    rig = hama.build(spaulders=spaulders)  # the 1★ Háma, with his shoulder-guards
    finish('hama-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
