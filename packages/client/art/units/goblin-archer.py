"""A goblin archer of Moria: a PvE monster (packages/sim/src/data/monsters.ts), in the Faceted style
(docs/viewer-spec.md section 4).

The Moria goblin (goblin.py) with a bow: the same scrawny, stooped body, big head, bat ears and big pale
eyes, built by the goblin's build() with this script's bow in place of its blade, its shield and the arms
that hold them. It draws a short, crude bow of dark wood, bound with cord at the grip, to under its jutting
chin, as Gorbag does (gorbag.py), a black-feathered arrow on the string, and a quiver of them rides its
hump. Its livery, Moria rust, is the goblin's: the cowl and the loincloth's flaps.

It is an archer at the draw (../README.md, An archer at the draw), as Gorbag is: the middle of the string
and the nocked arrow follow bones of their own, so the string stays in its fingers as it stands and runs,
and its shot flies its hand out past its shoulder and fetches the next arrow from the quiver on its back
(anchor 'chin'). Its shot leaves from the arrow's rest on the bow, which the export writes as its
`muzzle`. It has no ability, so it never casts and has six clips, without `cast`. Its fittings, the
quiver's bands and the bow's ferrules, and the goblin's buckle, use `trim`.

    blender --background --factory-startup --python-exit-code 1 --python goblin-archer.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so its right hand is at -X. Like the goblin, it is
built in the measure of Gorbag's and shrunk at the end (goblin.SCALE).
"""

import importlib
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]  # the kit, and the goblin's script beside this one
from kit import V, bone, finish, loft, material, nearest_on_polyline, part, segment, tube  # noqa: E402
from clips import fit  # noqa: E402
from rig import Rig, hold, joint  # noqa: E402

goblin = importlib.import_module('goblin')
M = goblin.M  # its materials, made as it builds

WOOD = 0x4E3B29  # the bow's dark wood
STRING = 0xBDB39A  # its string, pale gut
FEATHERS = 0x2B2623  # black-feathered arrows


# The quiver, slung across its hump, its mouth over its right shoulder ---------------------------------

QUIVER_BOTTOM, QUIVER_TOP = V(0.1, 0.24, 0.56), V(-0.1, 0.25, 0.88)  # on the upright body, before the stoop
# The ends of the arrows in it, fanned out of its mouth: (across its back, away from it) where each
# leaves the mouth, and how far it stands out.
ARROWS = [(-0.022, -0.008, 0.13), (0.022, -0.004, 0.11), (0.0, 0.016, 0.15)]


def quiver():
    axis = (QUIVER_TOP - QUIVER_BOTTOM).normalized()
    tube('quiver', QUIVER_BOTTOM, QUIVER_TOP, [(0, 0.036), (0.84, 0.044), (0.87, 0.05), (1, 0.05)],
         [M['leather'], M['trim']], [0, 0, 1], n=5)
    ring = segment(QUIVER_BOTTOM, QUIVER_TOP, [(0, 0.036)], 5)[0]
    verts = ring + [QUIVER_BOTTOM - 0.025 * axis]
    part('quiver-end', verts, [(i, (i + 1) % 5, 5) for i in range(5)], M['leather'], inside=QUIVER_BOTTOM)
    ring = segment(QUIVER_BOTTOM, QUIVER_TOP, [(1, 0.05)], 5)[0]
    verts = ring + [QUIVER_TOP + 0.03 * axis]
    part('quiver-mouth', verts, [(i, (i + 1) % 5, 5) for i in range(5)], M['feathers'], inside=QUIVER_TOP)
    across = axis.cross(V(0, 1, 0)).normalized()
    out = across.cross(axis)
    for k, (a, b, length) in enumerate(ARROWS):
        base = QUIVER_TOP + a * across + b * out
        end = base + length * axis + 1.5 * (a * across + b * out)
        tube(f'shaft-{k}', base - 0.02 * axis, end, [(0, 0.008), (1, 0.008)], M['wood'], n=3)
        along = (end - base).normalized()
        flat = (across if k % 2 else out) - 0.3 * (out if k % 2 else across)
        flat = (flat - flat.dot(along) * along).normalized()
        verts = [end + 0.01 * along, end - 0.05 * along + 0.026 * flat, end - 0.09 * along,
                 end - 0.05 * along - 0.026 * flat]
        part(f'vane-{k}', verts, [(0, 1, 2, 3)], M['feathers'])


# The bow, drawn to under its chin ---------------------------------------------------------------------

# It draws in an archer's open stance, the arrow aimed well to its left of where its feet point, as
# Gorbag's is, so the bow stands clear beside its head and shows its curve from in front and behind.
NOCK = V(0.08, -0.46, 0.655)  # where the string is drawn to, under its jutting chin
AIM_YAW = 55  # degrees to its left of straight ahead that the arrow points
ELEVATION = 8  # degrees the arrow points up
CANT = 10  # degrees the top of the bow tips to its right from square to the arrow
DRAW = 0.34  # from the nock forward to where the arrow crosses the bow
REST = 0.05  # from the middle of the grip up the bow to where the arrow crosses it
BOW_SCALE = 1.15  # the bow is drawn in the measure of STAVE, then scaled

# The upper limb of the bow from the end of the grip, in the bow's plane: (u, w, t, h), with u up the
# bow, w forward along the arrow, t the half-thickness in the bow's plane and h across it. The lower
# limb mirrors it: a plain, crude stave, bent back to where the string leaves it. TIP is (u, w) of each
# end.
STAVE = [
    (0.05, 0.0, 0.03, 0.022),  # the end of the grip
    (0.17, 0.0, 0.026, 0.02),  # the limb
    (0.26, -0.035, 0.021, 0.017),
    (0.31, -0.075, 0.017, 0.014),  # where the string leaves it
]
TIP = (0.33, -0.1)
FERRULE = (0.05, 0.08)  # where the bindings start and end, up the limb from the middle of the grip
STRING_END = STAVE[3][1] - STAVE[3][2]  # how far back along the arrow the string leaves each limb


def bow_axes():
    """The arrow's direction, the way up the bow and the direction across the bow's plane."""
    y, e, c = (math.radians(a) for a in (AIM_YAW, ELEVATION, CANT))
    aim = V(math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e))
    right = aim.cross(V(0, 0, 1)).normalized()  # to its right of the arrow
    upright = right.cross(aim)  # square to the arrow, in its vertical plane
    up = math.cos(c) * upright + math.sin(c) * right
    return aim, up, aim.cross(up)


def grip():
    aim, up, _ = bow_axes()
    return NOCK + DRAW * aim - REST * up


def stave():
    """Builds the bow and its string."""
    aim, up, side = bow_axes()
    middle = grip()

    def at(u, w):
        return middle + BOW_SCALE * (u * up + w * aim)

    stations = [(-u, w, t, hh) for u, w, t, hh in reversed(STAVE)] + list(STAVE)
    centres = [at(u, w) for u, w, _, _ in stations]
    rings = []
    for k, (u, w, t, hh) in enumerate(stations):
        before, after = centres[max(k - 1, 0)], centres[min(k + 1, len(centres) - 1)]
        along = (after - before).normalized()
        normal = side.cross(along).normalized()  # in the bow's plane, across the stave
        c = centres[k]
        rings.append([c + t * normal, c + hh * side, c - t * normal, c - hh * side])
    verts, faces, bands = loft(rings)
    face_mats = [1 if b == len(STAVE) - 1 else 0 for b in bands]  # cord round the grip
    for end, (u, w) in ((0, (-TIP[0], TIP[1])), (len(rings) - 1, TIP)):
        verts.append(at(u, w))
        faces += [(end * 4 + i, end * 4 + (i + 1) % 4, len(verts) - 1) for i in range(4)]
        face_mats += [0] * 4
    path = [at(-TIP[0], TIP[1])] + centres + [at(*TIP)]
    part('bow', verts, faces, [M['bow'], M['string']], face_mats, inside=nearest_on_polyline(path))

    # Iron bindings either side of the grip, just clear of its fist.
    (u0, w0, t0, h0), (u1, w1, t1, h1) = STAVE[0], STAVE[1]
    for s in (-1, 1):
        along = (at(s * u1, w1) - at(s * u0, w0)).normalized()
        normal = side.cross(along).normalized()
        rings = []
        for u in FERRULE:
            k = (u - u0) / (u1 - u0)
            c = at(s * u, w0 + k * (w1 - w0))
            t, hh = t0 + k * (t1 - t0) + 0.006, h0 + k * (h1 - h0) + 0.006
            rings.append([c + t * normal, c + hh * side, c - t * normal, c - hh * side])
        verts, faces, _ = loft(rings)
        ends = [at(s * u, w0) for u in FERRULE]
        part(f'ferrule-{s}', verts, faces, M['trim'], inside=nearest_on_polyline(ends))

    # The string, from where it leaves each limb back to the nock.
    u, w, t, _ = STAVE[3]
    for name, end in (('upper', at(u, w - t)), ('lower', at(-u, w - t))):
        tube(f'string-{name}', end, NOCK, [(0, 0.006), (1, 0.006)], M['string'], n=3)


def nocked():
    """The arrow: a shaft, a black-feathered end and a crude iron head. Returns its point."""
    aim, up, side = bow_axes()
    head = NOCK + (DRAW + 0.1) * aim
    tube('arrow', NOCK - 0.01 * aim, head, [(0, 0.009), (1, 0.009)], M['wood'], n=3)
    ring = [head + 0.024 * side, head + 0.011 * up, head - 0.024 * side, head - 0.011 * up]
    verts = ring + [head + 0.07 * aim, head - 0.018 * aim]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('arrowhead', verts, faces, M['iron'], inside=head + 0.02 * aim)
    for k, across in enumerate((up, side)):
        a, b = NOCK + 0.02 * aim, NOCK + 0.09 * aim
        verts = [a, b, b + 0.026 * across - 0.01 * aim, a + 0.028 * across, b - 0.026 * across - 0.01 * aim,
                 a - 0.028 * across]
        part(f'feather-{k}', verts, [(0, 1, 2, 3), (0, 5, 4, 1)], M['feathers'])
    return head + 0.07 * aim


# Its clips (../clips.py): the goblin's idle and run with the bow kept drawn, and Gorbag's shot from
# under the chin: its hand flies out past its shoulder from the loose and fetches the next arrow from its
# back (anchor 'chin'), the bow tipping forward as it is nocked and coming in only a share of the way, so
# its limb and the arrow keep clear of its face. Stunned, the bow droops; falling, it goes down on its
# knees over the bow; as it wins, it holds the bow aloft. It has no ability, so it has no cast.
CLIPS = fit({
    'idle': ('ready', {'hand': 'l', 'seconds': 2.0, 'crouch': 0.06}),
    'move': ('run', {'hand': 'l', 'seconds': 0.43, 'heavy': 0.7, 'stride': 0.3, 'lift': 0.25, 'lean': 6.0,
                     'carry': 'steady'}),
    'attack': ('shot', {'drawn': True, 'anchor': 'chin', 'snap': (0.16, -0.04, 0.0), 'point': 35.0, 'gather': 0.3}),
    'stun': ('dazed', {'hand': 'l', 'low': 0.45, 'droop': 0.8}),
    'death': ('knees', {'hand': 'r', 'slump': 0.7}),
    'victory': ('aloft', {}),
}, bow='l', between=True)
BONES = {'string': ('hand_l', 'nock', 'loose'), 'arrow': ('hand_l', 'nock', 'arrow_point')}


def bow():
    """The archer's part of the build, on the goblin's hunched body: the quiver on its hump, the bow at
    the draw with its string and arrow, and the arms that hold them. Returns the archer's rig."""
    M.update(
        bow=material('bow', WOOD, roughness=0.85),
        string=material('string', STRING, roughness=0.8),
        feathers=material('feathers', FEATHERS, roughness=0.95),
    )
    before = set(bpy.context.scene.objects)
    with bone('spine'):
        quiver()
    # Where a fresh arrow is drawn from, and a loosed one put away (../clips.py, Bow).
    joint('quiver_mouth', QUIVER_TOP)
    joint('quiver_foot', QUIVER_BOTTOM)
    goblin.hunch(goblin.new_objects(before))

    aim, up, _ = bow_axes()
    with bone('hand_l', follows=lambda p: 'string' if (p - NOCK).length < 0.02 else None):
        stave()
    with bone('arrow'):
        point = nocked()
    top = grip() + BOW_SCALE * (STAVE[3][0] * up + STRING_END * aim)  # where the string leaves the upper limb
    hold('l', grip(), top, grip() + aim)
    joint('nock', NOCK)
    joint('loose', grip() + REST * up + BOW_SCALE * STRING_END * aim)
    joint('arrow_point', point)

    # The bow arm reaches forward and up, the elbow turned down and out; the drawing hand holds the
    # string at the nock, the elbow out to its right and back. Neither has a bracer: the bow arm's
    # would rub the string.
    left, right = goblin.SHOULDERS[1], goblin.SHOULDERS[-1]
    goblin.arm('left', grip(), (left + grip()) / 2 + V(0.25, 0.05, -0.2), up, bracer=False)
    goblin.arm('right', NOCK - 0.02 * aim - 0.03 * up, right + V(-0.3, 0.12, 0.05), up)
    return Rig(bones=BONES, clips=CLIPS)


def main():
    finish('goblin-archer', rig=goblin.build(bow=bow))


if __name__ == '__main__':
    main()
