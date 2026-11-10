"""Treebeard, the Ent: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star levels").

Fangorn, the oldest of the Ents, after the books: a large Man-like, almost Troll-like figure, very
sturdy, with a tall head on hardly any neck, clad in green and grey bark, his arms covered in smooth
brown skin away from the trunk, seven toes on each large foot, and a sweeping grey beard, twiggy at
the roots and mossy at the ends. He guards by sheer mass, broad and planted on root-like feet, with
a boulder in his right hand for Boulder, his ability. Built at full size, about 2.2 to the top of
his head and inside his hex.

Team colour is on what grows on him: the leaves on his head, the moss over his shoulders and the
mossy ends of his beard.

His 2★ model, with his gear: the 1★ Treebeard (treebeard.py) plus one piece. An Ent's gear is what
grows on him, so it is young branches in leaf, rising out of the moss on his shoulders and the leaves
on his head and spreading over and behind his head like the crown of a tree. Their leaves are the
team colour, so the crown reads from the front, from behind and from above, and his arms stay free.
His lichen, as on the 1★, uses `trim`, which the client colours by star level.

It is rigged as the 1★ is: this script imports treebeard.py, builds him with the young branches
(treebeard.build()), the boughs from his shoulders bound to his spine with the moss they rise out of
and the shoots from his head to the leaves they rise out of, and finishes him with the 1★'s rig, so
he has the same bones and clips and moves as he does at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python treebeard-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import LARGE_GEAR_BUDGET, V, bone, finish, material  # noqa: E402

treebeard = importlib.import_module('treebeard')  # the 1★ model, which this one is with its gear
M = treebeard.M  # its materials, made as it builds

BRANCHES_BARK = 0x7A6C58  # the young branches' smoother, browner bark


# The gear for 2 stars: young branches in leaf ----------------------------------------------------

# Young branches rising out of the moss on his shoulders and out of the leaves on his head, which
# spread over and behind his head like the crown of a tree, clear of his arms. Each: its points from
# its root, hidden in the moss or the leaves, to its tip, and its radius at each but the tip.
BRANCHES = [
    # A bough from each shoulder, bending up past his head, with a shoot from its elbow.
    ([V(-0.33, 0.12, 1.62), V(-0.42, 0.2, 1.84), V(-0.5, 0.22, 2.05), V(-0.53, 0.24, 2.25), V(-0.5, 0.25, 2.42)],
     [0.058, 0.046, 0.036, 0.028]),
    ([V(-0.5, 0.22, 2.05), V(-0.6, 0.2, 2.18), V(-0.64, 0.18, 2.28)], [0.024, 0.017]),
    ([V(0.34, 0.13, 1.64), V(0.44, 0.22, 1.86), V(0.52, 0.26, 2.08), V(0.56, 0.28, 2.3), V(0.52, 0.3, 2.48)],
     [0.058, 0.046, 0.036, 0.028]),
    ([V(0.52, 0.26, 2.08), V(0.62, 0.22, 2.22), V(0.66, 0.2, 2.32)], [0.024, 0.017]),
    # Two shoots from the leaves on his head.
    ([V(-0.06, 0.08, 2.32), V(-0.1, 0.14, 2.5), V(-0.13, 0.19, 2.64)], [0.036, 0.026]),
    ([V(0.06, 0.12, 2.34), V(0.09, 0.2, 2.54), V(0.13, 0.26, 2.7)], [0.036, 0.026]),
]
# The young leaves, in the team colour, in three masses of overlapping clumps, on the right bough,
# the left bough and the shoots from his head, with the dark between them: centre, half-sizes, seed.
YOUNG_LEAVES = [
    (V(-0.52, 0.24, 2.4), (0.17, 0.14, 0.12), 61),
    (V(-0.64, 0.19, 2.29), (0.12, 0.11, 0.1), 62),
    (V(-0.43, 0.27, 2.52), (0.11, 0.1, 0.09), 63),
    (V(0.53, 0.29, 2.46), (0.17, 0.14, 0.12), 64),
    (V(0.66, 0.21, 2.33), (0.12, 0.11, 0.1), 65),
    (V(0.44, 0.31, 2.58), (0.11, 0.1, 0.09), 66),
    (V(-0.02, 0.22, 2.7), (0.19, 0.15, 0.12), 67),
    (V(0.16, 0.27, 2.74), (0.12, 0.11, 0.09), 68),
    (V(-0.18, 0.18, 2.64), (0.12, 0.1, 0.09), 69),
]


# The boughs and their shoots, with their leaves, ride the spine with the moss they rise out of; the
# shoots from his head and their leaves ride `leaves`, with the canopy, which sways after his head.
BOUGHS, CROWNING = range(4), range(4, 6)  # in BRANCHES
ON_BOUGHS, ON_HEAD = range(6), range(6, 9)  # in YOUNG_LEAVES
SIDES = {0: 5, 2: 5}  # round each bough; the thin shoots have 4, which keeps his .glb in its limit

# Rigged, the crown as drawn above reached 1.13 from his centre as he bows to tear up a boulder (his
# cast) and as he falls, and the boulder he hurls passed through the right bough's shoot and leaves.
# So each group is swept back about the X axis through its roots, the moss on his shoulders or the
# leaves on his head, and drawn in towards them: degrees back, how much of its size, and the pivot.
# The first rigged crown drew both in to 0.8, the boughs swept back 20 degrees and the shoots 35. The
# room a cast has ahead (docs/viewer-spec.md section 4, Size) doesn't help it, since the boughs reach
# out past his left shoulder as he heaves, outside the wedge ahead, and his death (`knees`) has none.
# What does: the shoots from his head, swept back 40 degrees, keep their full size, their leaves
# behind his head as he bows and kneels; and the boughs, swept back 25 degrees, keep 0.85 of theirs,
# which keeps them in the hex as he heaves, the boulder clear of the right bough's leaves as he hurls
# it (0.88 at 20 degrees put it 24 mm in on frame 15.5) and his death ending 1.94 tall, under four
# fifths of the 2.45 he now stands (0.88 ended it 1.96, too tall).
SWEEP = {'spine': (25, 0.85, V(0, 0.12, 1.62)), 'leaves': (40, 1.0, V(0, 0.08, 2.31))}


def swept(on):
    degrees, scale, pivot = SWEEP[on]
    return (Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(-degrees), 4, 'X') @ Matrix.Scale(scale, 4)
            @ Matrix.Translation(-pivot))


def young_branches():
    M['branches'] = material('branches', BRANCHES_BARK, roughness=0.9)
    for on, branches, leaves in (('spine', BOUGHS, ON_BOUGHS), ('leaves', CROWNING, ON_HEAD)):
        made = set(bpy.context.scene.objects)
        with bone(on):
            for k in branches:
                points, radii = BRANCHES[k]
                treebeard.limb(f'branch-{k}', points, radii, M['branches'], n=SIDES.get(k, 4))
            for k in leaves:
                centre, size, seed = YOUNG_LEAVES[k]
                treebeard.lump(f'young-leaves-{k}', centre, size, M['team'], seed, rough=0.15, turn=(0, 0, 40 * k))
        for o in bpy.context.scene.objects:
            if o not in made:
                o.data.transform(swept(on))


def main():
    rig = treebeard.build(branches=young_branches)  # the 1★ Treebeard, with the young branches
    finish('treebeard-2', budget=LARGE_GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
