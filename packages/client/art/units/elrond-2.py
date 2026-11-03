"""Elrond Half-elven, master of Rivendell: his 2★ model, with his gear (docs/viewer-spec.md section 4,
"Star levels").

The 1★ Elrond (elrond.py) plus one piece, a long sword of the Noldor, for the "tried warrior in the
fulness of his strength" the books see in him at the feast in Rivendell (The Fellowship of the Ring,
II 1). It hangs at his left hip from a silver-grey belt across his chest, its hilt rising in the
opening of his mantle, and its scabbard sweeps back under the mantle and out below its hem behind his
left leg, so it shows from in front and from behind. Its cross-guard, pommel, locket, bands and chape
use `trim`, with his other fittings.

Everything else is as at 1★: the team colour on his long mantle, and `trim` on his fittings: the
clasps of his mantle, his girdle and his hair, and the band and the ferrule of his staff.

It is rigged as the 1★ is: this script imports elrond.py, builds him with the sword at his hip
(elrond.build()), and finishes him with the 1★'s rig, so he has the same bones and clips and moves as
he does at 1★ (../README.md, Gear models). The sword hangs from his hips, as the girdle does, and the
belt lies on his chest, on his spine, its end on the locket following his hips.

As main drew it, the scabbard ran 0.88 from its mouth to a chape 0.1 above the ground behind his left
heel, sweeping back under the mantle and lifting its hem. Here the 1★ mantle is kept as it is, and
the scabbard is 0.67 long, 5 degrees less steep, its chape 0.3 above the ground: as main had it, the
chape went 12 cm into the ground as he sinks to his knees in his death (frame 7).

    blender --background --factory-startup --python-exit-code 1 --python elrond-2.py [-- <out.glb>]

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
    bent_tube,
    bone,
    box,
    cone,
    finish,
    loft,
    material,
    nearest_on_polyline,
    part,
    path_rings,
    tube,
)

elrond = importlib.import_module('elrond')  # the 1★ model, which this one is with his gear
M = elrond.M  # his materials, made as he builds

SCABBARD = 0x9C9FA3  # silver-grey: the scabbard, its belt and the wire bound round the grip


# The gear for 2 stars: a long sword of the Noldor ---------------------------------------------------

# It hangs at his left hip, the scabbard's mouth at the girdle and its chape out behind his left leg,
# clear of the ground as he kneels.
MOUTH, CHAPE = V(0.108, -0.088, 0.8), V(0.32, 0.31, 0.3)
GRIP, POMMEL = 0.19, 0.05  # how long the grip is, and how far the pommel reaches past it
BELT_END = 0.86  # the sword-belt follows his hips below this height, where it reaches the locket


def sheath(name, a, b, half_width, half_depth, mat, width):
    """A length of the scabbard from a to b, lens-shaped in section: `half_width` along `width`, its
    edges, and `half_depth` across its flat. Each half-size is a number or one for each end."""
    hw = half_width if isinstance(half_width, tuple) else (half_width, half_width)
    hd = half_depth if isinstance(half_depth, tuple) else (half_depth, half_depth)
    return bent_tube(name, [a, b], [(hw[0], hd[0]), (hw[1], hd[1])], mat, n=6, side=width)


def sword():
    """The sword at his hip, made last in the 1★'s build: the sword on his hips, the belt on his chest."""
    M['scabbard'] = material('scabbard', SCABBARD, roughness=0.6, metallic=0.05)
    down = (CHAPE - MOUTH).normalized()
    length = (CHAPE - MOUTH).length
    # The flat of the scabbard lies against his leg, facing out from his middle; its edges run
    # forward and back.
    radial = V(CHAPE.x, CHAPE.y, 0).normalized()
    flat = (radial - radial.dot(down) * down).normalized()
    width = down.cross(flat).normalized()

    with bone('hips'):  # it hangs from the belt at his hip
        tip = MOUTH + length * down
        sheath('scabbard', MOUTH, tip - 0.09 * down, (0.032, 0.026), (0.017, 0.014), M['scabbard'], width)
        # The fittings stand proud of it: the locket at its mouth, two bands and the chape.
        sheath('locket', MOUTH - 0.006 * down, MOUTH + 0.07 * down, 0.038, 0.021, M['trim'], width)
        for k, at in enumerate((0.56, 0.74)):
            band = MOUTH + at * length * down
            sheath(f'scabbard-band-{k}', band, band + 0.035 * down, 0.033, 0.019, M['trim'], width)
        rings = path_rings([tip - 0.1 * down, tip], [(0.031, 0.018), (0.01, 0.008)], n=6, side=width)
        verts, faces, _ = loft(rings)
        part('chape', verts, faces, M['trim'], inside=nearest_on_polyline([tip - 0.1 * down, tip]))

        # The hilt, rising forward out of the scabbard across his waist: a cross-guard along the
        # blade's edges, a long grip bound in silver wire and a pommel.
        guard = MOUTH - 0.02 * down
        box('guard', guard, [down, width, flat], (0.015, 0.1, 0.02), M['trim'], 0.85)
        end = guard - GRIP * down
        tube('grip', guard, end, [(0, 0.018), (1, 0.017)], M['scabbard'], n=6)
        cone('pommel', end - 0.008 * down, end - POMMEL * down, 0.034, M['trim'], n=4, phase=45,
             back=end + 0.006 * down)

    # The sword-belt, from under the mantle on his right shoulder across his chest to the locket: on his
    # chest, its end on the locket going with his hips.
    path = [V(-0.118, -0.083, 1.095), V(-0.06, -0.118, 1.03), V(0.012, -0.128, 0.95), V(0.07, -0.118, 0.875),
            MOUTH + V(-0.006, -0.012, 0.03)]
    rings = path_rings(path, [(0.022, 0.006)] * len(path), n=4, phase=0, side=V(0.77, 0, 0.64))
    verts, faces, _ = loft(rings)
    with bone('spine', follows=lambda p: 'hips' if p.z < BELT_END else None):
        part('sword-belt', verts, faces, M['scabbard'], inside=nearest_on_polyline(path))


def main():
    rig = elrond.build(sword=sword)  # the 1★ Elrond, with the sword at his hip
    finish('elrond-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
