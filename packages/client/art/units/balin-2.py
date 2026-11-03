"""Balin son of Fundin, Dwarf, Captain: his 2★ model, with his gear (docs/viewer-spec.md section 4,
"Star levels").

The 1★ Balin (balin.py) plus one piece, the jewelled belt of great magnificence Bilbo saw on him when
he came to Bag End years after the quest (The Hobbit, "The Last Stage"). It is a broad girdle of
plates in `trim`, set with white gems, in place of his plain belt and its studs, slung on his hips so
it shows below the mantle from behind, and either side of his beard from in front. His other
fittings, the point on the banner pole and the axe's pommel and collar, use `trim` too.

Main's model, built before the rig, had him wear it over his beard, as his brother Dwalin wore his
tucked into a golden belt ("An Unexpected Party"), crossing the beard in front with a lozenge clasp
and a great white gem in the middle, and the beard's forks a few inches longer below it, as Bilbo
saw it then. Rigged, the girdle rides his hips and the beard hangs from his chin on a bone of its
own, which swings it up to 5 cm forward, 13 cm up and 18 cm aside of his hips as he heaves the
standard, wins and runs: over the beard, the girdle would cut through it. So he wears it under his
beard, as his plain belt is at 1★: the beard hangs over it in front, and its plates and gems show
either side of the beard and all round his back. The clasp, which the beard would hide, is left out,
and the beard is as long as at 1★: the longer forks reached the ground as he falls to his knees,
which would have held his hips up off them (clips.grounded()), changing the 1★'s clip.

It is rigged as the 1★ is: this script imports balin.py, builds him with the girdle on his hips in
place of the plain belt, bound to them as the belt is (balin.build()), and finishes him with the 1★'s
rig, so he has the same bones and clips and moves as he does at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python balin-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, bone, cone, finish, loft, material, part  # noqa: E402

balin = importlib.import_module('balin')  # the 1★ model, which this one is with his gear
M = balin.M  # its materials, made as it builds

GEM = 0xF4F2EC  # the belt's gems: white, never blue


# The gear for 2 stars: the jewelled belt ---------------------------------------------------------

# The girdle as three rings from its lower edge up, the middle one standing proud, so its plates
# catch the light above and fall into shade below. Each ring is the coat's octagon at its height,
# grown by a factor, from his left round his back to his right and across his front, under the beard.
# Each: z and the factor.
GIRDLE = [(0.325, 1.05), (0.4, 1.1), (0.475, 1.05)]
GIRDLE_CORNERS = [337.5, 22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5]  # degrees from +X
# A gem on the plates round his sides and back (faces 0 to 4, from his left round the back) and on
# those either side of the beard (5 and 7); none on the plate the beard hangs over (6).
GEM_FACES = [0, 1, 2, 3, 4, 5, 7]


def coat_at(z):
    """The coat's octagon at height z, as (half-width, half-depth, centre y), from balin.TORSO."""
    for (z0, rx0, ry0, cy0), (z1, rx1, ry1, cy1) in zip(balin.TORSO, balin.TORSO[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return rx0 + t * (rx1 - rx0), ry0 + t * (ry1 - ry0), cy0 + t * (cy1 - cy0)
    raise ValueError(z)


def girdle():
    M['gem'] = material('gem', GEM, roughness=0.15, emission=GEM, emission_strength=0.4)
    with bone('hips'):  # slung on his hips, in the plain belt's place
        girdle_parts()


def girdle_parts():
    rings = []
    for z, grow in GIRDLE:
        rx, ry, cy = coat_at(z)
        rings.append([V(grow * rx * math.cos(math.radians(a)), cy + grow * ry * math.sin(math.radians(a)), z)
                      for a in GIRDLE_CORNERS])
    verts, faces, _ = loft(rings)
    part('girdle', verts, faces, M['trim'], inside=lambda c: V(0, 0, c.z))

    # A white gem on each plate round the back and sides, at the crest of the band.
    middle, n = rings[1], len(rings[1])
    for k in GEM_FACES:
        a, b = middle[k], middle[(k + 1) % n]
        at = (a + b) / 2
        out = V(b.y - a.y, a.x - b.x, 0).normalized()  # square to the plate, outwards
        if out.dot(V(at.x, at.y, 0)) < 0:
            out = -out
        cone(f'gem-{k}', at - 0.004 * out, at + 0.03 * out, 0.028, M['gem'], n=4, back=None)


def main():
    rig = balin.build(girdle=girdle)  # the 1★ Balin, with the jewelled belt
    finish('balin-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
