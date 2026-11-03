"""Saruman the White, of the Istari: his 2★ model, with his gear (docs/viewer-spec.md section 4,
"Star levels").

The 1★ Saruman (saruman.py) plus one piece: his cape becomes a mantle with a high collar, standing up
behind his head and carrying it higher still, as proud as he is. The collar is the team colour,
flaring out and back from his neck to the height of his brow, open in front so his face and beard
stand clear. Its top and the cape's hem are edged with bands of `trim`, so from behind and from the
front his head is framed in the team's colour and edged in the star's. His long hair, which falls
over the cape on the 1★, is gathered inside the collar, so the fall of it down his back is left out.

Everything else is as at 1★: the team colour on his cape and the stole's ends, and `trim` on his
fittings: the cape's clasps, the girdle's buckle, the stone's setting and the ferrule at the staff's
foot, and the cup the palantir sits in.

It is rigged as the 1★ is: this script imports saruman.py, builds him with the collar on his cape,
bound to his spine with it, and his hair gathered inside it (saruman.build()), and finishes him with
the 1★'s rig, so he has the same bones and clips and moves as he does at 1★ (../README.md, Gear
models). The 1★ hair is kept as it is: main's collar rose from the cape's neckline and narrowed the
nape of his hair to fit inside it, so here the collar rises from a little lower on the cape, 2.6 cm
lower at the back, which brings its foot out round the 1★ hair at his nape.

    blender --background --factory-startup --python-exit-code 1 --python saruman-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand, on the staff, is at -X.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, bone, finish, loft, part  # noqa: E402

saruman = importlib.import_module('saruman')  # the 1★ model, which this one is with his gear
M = saruman.M  # his materials, made as he builds
CAPE, cape_ring = saruman.CAPE, saruman.cape_ring


# The gear for 2 stars: a high collar ------------------------------------------------------------

# The collar stands up from the cape and flares out and back round his head, lower at its front edges,
# which fall back from the face; a band of trim edges its top. Each ring as the cape's: z at the front
# and at the back, half-width, half-depth, centre y, folds and half the opening (degrees). It stands 3
# cm further back than main's, its front edges where they were: as main drew it, the back of his head
# went up to 15 mm through it as he tips his head back in his cast, his death and his victory.
COLLAR = [
    (1.22, 1.31, 0.17, 0.192, 0.042, 0.0, 58),
    (1.28, 1.43, 0.192, 0.21, 0.05, 0.008, 62),  # the top, under its edge
    (1.30, 1.46, 0.196, 0.214, 0.052, 0.008, 63),  # the edge
]
COLLAR_BANDS = [0, 0, 1]  # the team colour, then the trim along its top
# Its foot lies on the cape this far down from the neckline towards the shoulders: main's rose from the
# neckline itself, but the 1★ hair at his nape stands out over the neckline.
COLLAR_FOOT = 0.35
# The cape's hem is edged with a band of trim too, hanging just below it and a little proud of it.
HEM = (0.885, 0.795, 0.293, 0.223, 0.02, 0.018, 44)


def collar():
    """The collar and the band on the cape's hem, made after the 1★'s cape and bound to his spine with
    it."""
    neckline, shoulders = cape_ring(*CAPE[0]), cape_ring(*CAPE[1])
    foot = [a.lerp(b, COLLAR_FOOT) for a, b in zip(neckline, shoulders)]  # on the cape
    rings = [foot] + [cape_ring(*level) for level in COLLAR]
    with bone('spine'):  # with the cape
        verts, faces, bands = loft(rings, closed=False)
        face_mats = [COLLAR_BANDS[b] for b in bands]
        part('collar', verts, faces, [M['team'], M['trim']], face_mats, inside=lambda c: V(0, 0.01, c.z))
        verts, faces, _ = loft([cape_ring(*CAPE[-1]), cape_ring(*HEM)], closed=False)
        part('hem', verts, faces, M['trim'], inside=lambda c: V(0, 0.01, c.z))


def main():
    rig = saruman.build(collar=collar)  # the 1★ Saruman, the collar on his cape and his hair inside it
    finish('saruman-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
