"""The Witch-king of Angmar in the war-gear of the Black Captain: his 2★ model, with its gear
(docs/viewer-spec.md section 4, "Star levels").

Built on witch-king.py, the same Lord of the Nazgûl on the same black horse, with one piece added:
pauldrons of steel over the mantle, the war-gear of the Black Captain as he leads the host of Minas
Morgul against Minas Tirith (The Return of the King, V 4). Each is a cop arched over the shoulder and
two lames stepping down the upper arm, the lower edged and closed at its end in `trim`. They broaden
his shoulders past the mantle, so they read from behind as well as in front, and they stand clear of
it, so that its team colour still shows down his back, at his throat and round them. The books give
him a hauberk under the mantle but don't describe his armour further, so their shape is this
model's own: plain and round, not spiked. The hood, the crown and the mace in his raised right hand
are as at 1★, since his 3★ model (witch-king-3.py) changes those.

His fittings use `trim`, which the client colours silver at 2★: the edges and ends of the
pauldrons' lower lames, the mace's pommel, a band on its haft and the socket under its head, a
lozenge clasp closing the mantle at his throat, the buckle of the belt on his hauberk, the stirrup
irons under his boots and the horse's browband. The crown of steel stays steel: it is a crown, not a
fitting.

It is rigged as the 1★ is: this script imports witch-king.py, builds him and his horse with a
pauldron on each upper arm, bound to it (witch-king.build()), and finishes them with the 1★'s rig,
so they have the same bones and clips and move as they do at 1★ (../README.md, Gear models). The
pauldrons are laid over the 1★'s mantle and upper sleeves, which the rig split from the sleeves
below the elbow, as main laid them over its mantle and whole sleeves.

    blender --background --factory-startup --python-exit-code 1 --python witch-king-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import MOUNTED_GEAR_BUDGET, V, bone, finish, loft, nearest_on_line, part, wind  # noqa: E402
from mounts import Surface  # noqa: E402

witch_king = importlib.import_module('witch-king')  # the 1★ model, which this one is with his gear
M = witch_king.M  # his materials, made as he builds
R_SHOULDER, L_SHOULDER = witch_king.R_SHOULDER, witch_king.L_SHOULDER


# The gear for 2 stars: pauldrons -----------------------------------------------------------------

# A pauldron of steel on each shoulder, over the mantle: a cop arched over the shoulder and the top of
# the arm, and two lames stepping down the arm from under it, the lower edged in trim. Each part is
# built of arches over a line from the shoulder outwards, open underneath where the arm and the
# mantle are, and stands clear of them. The lines run out over the right arm, raised to the side,
# and down the left a little less steeply than the arm, which reaches forward with the fire.
PAULDRON_LINES = {
    'right': (R_SHOULDER, V(-0.37, 0.06, 1.10)),
    'left': (L_SHOULDER, V(0.35, 0.0, 1.04)),
}
ARCH = 7  # points across an arch
ARCH_SPAN = 105  # degrees either side of its top
ARCH_UP = 0.35  # how far out from him the tops of the arches lean, for each unit up
# Each part's arches along its line: (fraction of the way, radius). The cop's first arch is tucked
# under the mantle, so it is drawn out onto it.
COP = [(0.1, 0.07), (0.3, 0.15), (0.55, 0.149)]
LAMES = [
    ([(0.48, 0.14), (0.7, 0.137)], [0]),
    ([(0.64, 0.13), (0.8, 0.127), (0.88, 0.126)], [0, 1]),  # its last band, the edge, in trim
]
PAULDRON_CLEAR = 0.014  # how far they stand clear of the mantle and the sleeves under them


def arches(start, end, stations, up):
    """Arches of ARCH points over the line from `start` to `end`, one at each station, their tops
    towards `up`."""
    axis = (end - start).normalized()
    top = (up - up.dot(axis) * axis).normalized()
    side = axis.cross(top)
    spread = [math.radians(-ARCH_SPAN + 2 * ARCH_SPAN * k / (ARCH - 1)) for k in range(ARCH)]
    return [[start.lerp(end, t) + r * (math.cos(a) * top + math.sin(a) * side) for a in spread]
            for t, r in stations]


def pauldrons():
    """Made after the 1★'s sleeves and before he leans, over his mantle and his upper sleeves, each
    pauldron on the upper arm it is strapped to, so it moves with the arm as the sleeve does."""
    surface = Surface(*(bpy.data.objects[n] for n in ('mantle', 'sleeve-right', 'sleeve-left')))
    for side, (start, end) in PAULDRON_LINES.items():
        up = V(math.copysign(ARCH_UP, end.x), 0, 1).normalized()
        line = nearest_on_line(start, end)

        def clear(p, line=line):
            # Out from the line through p, to just outside the mantle or sleeve if they reach further.
            inside = line(p)
            try:
                hit = surface.onto(inside, p - inside, PAULDRON_CLEAR)
            except ValueError:
                return p
            return hit if (hit - inside).length > (p - inside).length else p

        parts = [(f'cop-{side}', COP, [0])] + [(f'lame-{side}-{k}', *lame) for k, lame in enumerate(LAMES)]
        for name, stations, band_mats in parts:
            rows = [[clear(p) for p in row] for row in arches(start, end, stations, up)]
            verts, faces, bands = loft(rows, closed=False)
            faces = wind(verts, faces, inside=line)
            mats = [band_mats[min(b, len(band_mats) - 1)] for b in bands]
            if name.endswith(f'-{len(LAMES) - 1}'):
                # The last lame is closed at its end by a plate down to the arm, so that seen along
                # the arm it shows as a plate, not as the thin edges of the arches inside it.
                last = len(verts) - ARCH
                verts.append(start.lerp(end, stations[-1][0]))
                cap = [(last + k, last + k + 1, len(verts) - 1) for k in range(ARCH - 1)]
                faces += wind(verts, cap, outward=end - start)
                mats += [1] * (ARCH - 1)
            with bone(f'upper_arm_{side[0]}'):
                part(name, verts, faces, [M['steel'], M['trim']], mats)


def main():
    rig = witch_king.build(pauldrons=pauldrons)  # the 1★ Witch-king and his horse, with the pauldrons
    finish('witch-king-2', budget=MOUNTED_GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
