"""Gimli, the Dwarf: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star levels").

The 1★ Gimli (gimli.py) plus one piece: in place of his round cap, the cap he chose at Edoras when
the Company was armed for war ("he chose a cap of iron and leather that fitted well upon his round
head", The Two Towers, III 6), drawn as a dwarf's war-cap of iron. It is taller, rises to a spike,
and has a deep band of trim set with rivets, a nasal, and a skirt of plates over his cheeks and the
back of his neck, so from behind and above, as well as from the front, his head reads as a bigger
helm.

Everything else is as at 1★: the team colour on his hood thrown back as a mantle, his cape and his
shield's face, and `trim` on his fittings: the war-cap's band, rivets and spike, the belt buckle, the
shield's rim and boss, and the axe's finial, socket and pommel.

It is rigged as the 1★ is: this script imports gimli.py, builds him with the war-cap in place of the
round cap, bound to his head as the cap is (gimli.build()), and finishes him with the 1★'s rig, so he
has the same bones and clips and moves as he does at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python gimli-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, cone, ellipse, finish, loft, part  # noqa: E402

gimli = importlib.import_module('gimli')  # the 1★ model, which this one is with its gear
M = gimli.M  # its materials, made as it builds


# The gear for 2 stars: the war-cap from Edoras, in place of the round cap ------------------------

# The cap of eight facets, each ring a height and a radius: a band of trim, deeper than the round
# cap's, and a fuller, taller dome above it that rises to a spike.
CAP = [
    (0.925, 0.2),
    (0.992, 0.2),
    (0.998, 0.183),  # the dome steps in above the band
    (1.092, 0.172),
    (1.168, 0.118),
]
CAP_TOP = 1.212
SPIKE = 0.055  # how far the spike of trim stands above the point
RIVETS = [215, 245, 295, 325, 150, 30]  # degrees round the band from +X; the front is 270
# The skirt's lower edge, from his right cheek round the back to his left: the angle from +X, the
# radius and the height. It comes forward over his cheeks beside the beard, and clears the bunched
# hood behind.
SKIRT = [
    (226, 0.245, 0.835),
    (200, 0.24, 0.83),
    (165, 0.238, 0.84),
    (128, 0.242, 0.858),
    (90, 0.246, 0.876),
    (52, 0.242, 0.858),
    (15, 0.238, 0.84),
    (-20, 0.24, 0.83),
    (-46, 0.245, 0.835),
]
# The nasal down the front, over the frown and the bridge of his nose: the y and z of its middle and
# its half-width, from the band down.
NASAL = [(-0.185, 0.975, 0.017), (-0.226, 0.93, 0.014), (-0.243, 0.886, 0.01)]


def war_cap():
    """The cap of iron he chose at Edoras, as a dwarf's war-cap: a tall dome on a band of trim set
    with rivets, a spike, a nasal, and a skirt of plates for his cheeks and neck, so from behind and
    above his head reads as a bigger helm than the round cap at 1 star."""
    rings = [ellipse(0, 0.015, z, r, r * 0.97, 8, 0) for z, r in CAP]
    verts, faces, bands = loft(rings)
    face_mats = [0 if b < 2 else 1 for b in bands]
    apex, last = len(verts), (len(CAP) - 1) * 8
    verts.append(V(0, 0.015, CAP_TOP))
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    face_mats += [1] * 8
    part('war-cap', verts, faces, [M['trim'], M['steel']], face_mats, inside=V(0, 0.015, 0.95))
    peak = V(0, 0.015, CAP_TOP)
    cone('spike', peak - V(0, 0, 0.03), peak + V(0, 0, SPIKE), 0.028, M['trim'], n=4, back=None)

    for a in RIVETS:
        r = math.radians(a)
        out = V(math.cos(r), math.sin(r), 0)
        at = V(0.2 * math.cos(r), 0.015 + 0.2 * 0.97 * math.sin(r), 0.9585)
        cone(f'rivet-{a}', at - 0.004 * out, at + 0.011 * out, 0.016, M['trim'], n=4, phase=45, back=None)

    # The skirt, tucked under the band at the top and flared out over his hair and the mantle.
    def point(a, r, z):  # at `a` degrees round the cap from +X, `r` out from its middle
        return V(r * math.cos(math.radians(a)), 0.015 + r * 0.97 * math.sin(math.radians(a)), z)

    top = [point(a, 0.19, 0.94) for a, _, _ in SKIRT]
    hem = [point(a, r, z) for a, r, z in SKIRT]
    verts, faces, _ = loft([top, hem], closed=False)
    part('skirt', verts, faces, M['steel'], inside=lambda c: V(0, 0.015, c.z + 0.05))

    # The nasal: its front and sides, open behind where it lies on the brows.
    verts = []
    for y, z, w in NASAL:
        verts += [V(-w, y + 0.012, z), V(-w, y, z), V(w, y, z), V(w, y + 0.012, z)]
    faces = []
    for k in range(len(NASAL) - 1):
        a, b = 4 * k, 4 * (k + 1)
        faces += [(a, a + 1, b + 1, b), (a + 1, a + 2, b + 2, b + 1), (a + 2, a + 3, b + 3, b + 2)]
    faces.append((b, b + 1, b + 2, b + 3))  # its tip
    part('nasal', verts, faces, M['steel'], inside=lambda c: V(0, c.y + 0.03, c.z + 0.01))


def main():
    rig = gimli.build(cap=war_cap)  # the 1★ Gimli, wearing the war-cap
    finish('gimli-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
