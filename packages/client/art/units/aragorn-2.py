"""Aragorn, Gondor, Captain: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star levels").

The 1★ Aragorn (aragorn.py) plus one piece, the steel spaulders of a captain of the Dúnedain, two
lames on each shoulder edged in `trim`, which broaden his shoulders out past his mantle.

Everything else is as at 1★: the team colour on his cloak, its hood thrown back over his shoulders as
a mantle, and `trim` on his fittings: the belt buckle, Andúril's cross-guard and the standard's
spear-point.

It is rigged as the 1★ is: this script imports aragorn.py, builds him with the spaulders on his upper
arms, bound to them as the sleeves are (aragorn.build()), and finishes him with the 1★'s rig, so he
has the same bones and clips and moves as he does at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python aragorn-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, bone, finish, tube  # noqa: E402

aragorn = importlib.import_module('aragorn')  # the 1★ model, which this one is with his gear
M = aragorn.M  # its materials, made as it builds


# The gear for 2 stars: spaulders ------------------------------------------------------------------

# Each lame of a spaulder, down the upper arm from the shoulder: (fraction to the elbow, radius).
# The upper lame flares out from under the mantle; the lower one overlaps it and has a trim edge.
UPPER_LAME = [(0.0, 0.1), (0.12, 0.152), (0.36, 0.142)]
LOWER_LAME = [(0.3, 0.13), (0.52, 0.124), (0.6, 0.124)]


def spaulders():
    # Strapped round the top of each sleeve, they move with the upper arm, as the sleeve does.
    for side, shoulder, elbow in (('right', aragorn.R_SHOULDER, aragorn.R_ELBOW),
                                  ('left', aragorn.L_SHOULDER, aragorn.L_ELBOW)):
        with bone(f'upper_arm_{side[0]}'):
            tube(f'spaulder-{side}', shoulder, elbow, UPPER_LAME, M['steel'], n=8, phase=22.5)
            tube(f'lame-{side}', shoulder, elbow, LOWER_LAME, [M['steel'], M['trim']], [0, 1], n=8, phase=22.5)


def main():
    rig = aragorn.build(spaulders=spaulders)  # the 1★ Aragorn, with his spaulders
    finish('aragorn-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
