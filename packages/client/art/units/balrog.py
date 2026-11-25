"""The Balrog of Moria, Durin's Bane: the late-game Large PvE monster (packages/sim/src/data/monsters.ts),
in the Faceted style (docs/viewer-spec.md section 4).

After the books (The Fellowship of the Ring, The Bridge of Khazad-dum): a great shadow, in the middle of
which was a dark form, of man-shape maybe, yet greater; and a power and terror seemed to be in it and to
go before it. Its streaming mane kindled and blazed behind it; in its right hand was a blade like a
stabbing tongue of fire, and in its left a whip of many thongs. Its wings, which the book leaves in
doubt, are drawn as shadow, folded behind it, so they keep to its hex.

About 2.4 tall to the crown of its head, built at full size as Treebeard is (treebeard.py, the Large
pattern) and leaning a little into its stride: a dark, smoky body of facets in two shades of shadow,
cracked with embers that glow within; a small, heavy-browed head with eyes of flame and a glowing
mouth; a mane of fire about its head and down its back and shoulders, as faceted tongues of flame in
two emissive colours (`fire` and `flame`, flat shaded, no textures); great clawed feet; a sword whose
blade is a tongue of flame, its hilt dark iron; and in its left fist a whip of five thongs of flame,
hanging from an iron handle.

Its livery, ember (packages/client/src/livery.json), is a scorched harness: two straps crossed over its
chest and back, over its shoulders where it shows from above, and a broad girdle with a tasset before
and behind, dull and matte against the black of it and the brightness of the fire. Its fittings, the
bosses, the buckle, the sword's guard and pommel and the whip's band, use `trim`, which the client colours iron at 1★, the only star level a monster has.

It is rigged as a Large figure (../rig.py, Rig(kind='large')) with the 16 bones and six of its own: the
whip's three, `whip_1` to `whip_3`, from the handle out; its wings, `wing_l` and `wing_r`, on the
spine; and its mane, `mane`, on its head. Its legs bend at the knee where the thigh runs on inside the
shin, its body at the waist where the upper body runs on inside the lower, and its arms at the elbow.

Its attack is a ranged one in the sim (range 2, monsters.ts): a bolt of fire. It sweeps the sword up
over its right shoulder and slashes it down before it, flinging the bolt from the blade's point at the
foe as the shot leaves on frame 3 (its muzzle). Its cast, Whip of flame (a cone of the three hexes
ahead and the three beyond them, at the end of a 0.5 s wind-up), draws the whip back behind it, swings
it up over its shoulder and cracks it out across the cone in front on the release, the thongs
streaming ahead, then sweeps them down to the right. As it wins it rears up, sword and whip raised and
its wings lifted. The whip hangs and trails after the hand in every other clip (clips.swaying()), and
the mane streams after the head.

    blender --background --factory-startup --python-exit-code 1 --python balrog.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so its right hand is at -X.
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from clips import BLOW, EASES, ROOM, Body, Keys, arc, degrees_of, fit, frames_for, made, swaying, timed  # noqa: E402
from kit import (  # noqa: E402
    LARGE_BUDGET,
    V,
    bone,
    box,
    cone,
    ellipse,
    finish,
    loft,
    material,
    nearest_on_line,
    nearest_on_polyline,
    part,
    path_rings,
    reset,
    segment,
    team_material,
    trim_material,
    tube,
    wind,
)
from rig import Clip, Rig, hold, joint, measured  # noqa: E402

# Its own colours (sRGB).
SHADOW = 0x19161A  # its body, a dark shadow...
SMOKE = 0x2D292D  # ...in facets of smoke
WING = 0x242025  # its wings, shadow too
CLAWS = 0x3A302B  # horn-dark claws
EMBER = 0x8C2A10  # the embers glowing in the cracks of it
FIRE = 0xF2641A  # its fire...
FLAME = 0xFFB238  # ...brightest at the tips of the flames
EYES = 0xFFD45E  # eyes of flame
IRON = 0x2E2B2B  # the sword's grip and the whip's handle, black iron

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        shadow=material('shadow', SHADOW, roughness=0.9),
        smoke=material('smoke', SMOKE, roughness=0.95),
        wing=material('wing', WING, roughness=0.95),
        claws=material('claws', CLAWS, roughness=0.7),
        # The glowing parts: a dark base colour, so the light falling on them doesn't wash them out,
        # and the colour itself as their emission, which the client keeps under a hit's flash.
        ember=material('ember', 0x3A1006, roughness=0.8, emission=EMBER, emission_strength=1.0),
        fire=material('fire', 0x5A2008, roughness=0.8, emission=FIRE, emission_strength=1.0),
        flame=material('flame', 0x6A4010, roughness=0.8, emission=FLAME, emission_strength=1.0),
        eyes=material('eyes', 0x6A5020, roughness=0.6, emission=EYES, emission_strength=1.0),
        iron=material('iron', IRON, roughness=0.6, metallic=0.1),
        trim=trim_material(),  # the buckles and the sword's guard and pommel, coloured by star level
    )


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o not in before]


def cracked(faces, n, ember=None):
    """Material indexes for the faces of a lofted tube of n sides: shadow and smoke in a checker, so
    the facets read, and here and there an ember glowing in a crack (`ember`, by face index in its band
    and band, or a scatter)."""
    out = []
    for f in range(len(faces)):
        i, band = f % n, f // n
        glow = ember(i, band) if ember else False
        out.append(2 if glow else (i + band) % 2)
    return out


def skin():
    return [M['shadow'], M['smoke'], M['ember']]


# The lean ---------------------------------------------------------------------------------------
#
# The body is built upright and leaned by hunched(): forward about its hips, and above the middle of
# its back its shoulders come a little further, so its head is carried forward and low, menacing.

PIVOT = V(0, 0.02, 1.1)  # the hips
LEAN = 7  # degrees the body above the hips leans forward
MID = V(0, 0.03, 1.62)  # the middle of its back
CURL = 9  # further degrees its shoulders come forward over it
CURL_SPAN = 0.3


def hunched(p):
    """Where a point of the upright body is once it leans."""
    p = Vector(p)
    t = min(max((p.z - MID.z) / CURL_SPAN, 0.0), 1.0)
    if t > 0:
        p = MID + Matrix.Rotation(math.radians(CURL * t), 3, 'X') @ (p - MID)
    return PIVOT + Matrix.Rotation(math.radians(LEAN), 3, 'X') @ (p - PIVOT)


def hunch(objects):
    for obj in objects:
        for v in obj.data.vertices:
            v.co = hunched(v.co)


def bend(root, end, upper, lower, pole):
    """The middle joint of a limb from root to end, its bones upper and lower long, bent towards pole."""
    root, end, pole = Vector(root), Vector(end), Vector(pole)
    axis = end - root
    reach = min(axis.length, upper + lower - 1e-3)
    axis.normalize()
    along = (upper * upper - lower * lower + reach * reach) / (2 * reach)
    out = math.sqrt(max(upper * upper - along * along, 0.0))
    side = pole - root
    side = (side - side.dot(axis) * axis).normalized()
    return root + along * axis + out * side


# Fire -------------------------------------------------------------------------------------------


def flame(name, base, way, length, radius, curl=None, n=3, phase=0.0):
    """A tongue of flame from `base` (hidden in what it rises from) along `way`, `length` long: a
    faceted point of n sides, bent towards `curl` (a direction) as it rises, its lower band `fire` and
    its tip `flame`."""
    base, way = Vector(base), Vector(way).normalized()
    curl = Vector(curl).normalized() if curl is not None else V(0, 0, 0)
    middle = base + 0.5 * length * way + 0.12 * length * curl
    tip = base + length * way + 0.35 * length * curl
    rings = path_rings([base, middle], [radius, 0.55 * radius], n, phase)
    verts = rings[0] + rings[1] + [tip]
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    faces += [(n + i, n + (i + 1) % n, 2 * n) for i in range(n)]
    face_mats = [0] * n + [1] * n
    faces = wind(verts, faces, inside=nearest_on_polyline([base, middle, tip]))
    return part(name, verts, faces, [M['fire'], M['flame']], face_mats)


# Feet and legs -----------------------------------------------------------------------------------

# Heavy legs planted wide, the left foot a little forward; the knees forward of the line from hip to
# ankle, so they bend forward.
LEGS = [  # side, hip, knee, ankle, the foot's yaw (degrees, turned out)
    ('right', V(-0.22, 0.05, 1.07), V(-0.29, -0.06, 0.6), V(-0.31, 0.08, 0.15), -10),
    ('left', V(0.22, 0.01, 1.07), V(0.29, -0.12, 0.6), V(0.31, 0.0, 0.15), 10),
]
KNEE_OVERLAP = 0.07  # how far the thigh runs on past the knee, and the shin starts above it

# A broad clawed foot round its own centre under the ankle: z, centre y, half-width and half-length.
FOOT = [(0.0, -0.07, 0.13, 0.21), (0.07, -0.06, 0.13, 0.2), (0.17, 0.0, 0.09, 0.11)]


def foot(side, ankle, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    rings = [[at + turn @ p for p in ellipse(0, cy, z, rx, ry, 6, 30)] for z, cy, rx, ry in FOOT]
    verts, faces, bands = loft(rings)
    face_mats = [0 if b == 0 else 1 for b in bands]
    verts.append(at + turn @ V(0, -0.07, 0))
    faces += [(i, (i + 1) % 6, len(verts) - 1) for i in range(6)]  # the sole
    face_mats += [0] * 6
    part(f'foot-{side}', verts, faces, [M['shadow'], M['smoke']], face_mats, inside=at + V(0, -0.04, 0.07))
    # Three great claws from the front of the foot, hooked down to the ground.
    for k, x in enumerate((-0.075, 0.0, 0.075)):
        base = at + turn @ V(x, -0.2, 0.06)
        tip = at + turn @ V(1.3 * x, -0.33, 0.005)
        cone(f'claw-{side}-{k}', base, tip, 0.035, M['claws'], n=3, back=None)
    joint(f'toe_{side[0]}', at + turn @ V(0, -0.3, 0.04))


def legs():
    for side, hip, knee, ankle, yaw in LEGS:
        s = side[0]
        past = knee + KNEE_OVERLAP * (ankle - knee).normalized()
        above = knee + KNEE_OVERLAP * (hip - knee).normalized()
        calf = knee.lerp(ankle, 0.35) + V(0, 0.03, 0)
        with bone(f'thigh_{s}'):
            verts, faces, _ = loft(segment(hip, past, [(0, 0.18), (0.55, 0.165), (1, 0.135)], 6, 30))
            part(f'thigh-{side}', verts, faces, skin(), cracked(faces, 6), inside=nearest_on_line(hip, past))
        with bone(f'shin_{s}'):
            rings = [segment(above, calf, [(0, 0.12)], 6, 30)[0], segment(above, calf, [(1, 0.135)], 6, 30)[0],
                     segment(calf, ankle, [(1, 0.095)], 6, 30)[0]]
            verts, faces, _ = loft(rings)
            part(f'shin-{side}', verts, faces, skin(), cracked(faces, 6),
                 inside=nearest_on_polyline([above, calf, ankle]))
        with bone(f'foot_{s}'):
            foot(side, ankle, yaw)
        joint(f'hip_{s}', hip)
        joint(f'knee_{s}', knee)
        joint(f'ankle_{s}', ankle)


# The body ---------------------------------------------------------------------------------------

# Built upright, rings of eight round it: z, half-width, half-depth and centre y. Narrow at the waist
# and broad at the shoulders, as a Man is, yet greater. It bends at the waist in two pieces: the lower
# body on the hips, from the fork of the legs to WAIST_TOP, and the upper body on the spine, from a
# ring inside it (WAIST_INSIDE) up to its neck.
BODY = [
    (0.9, 0.24, 0.18, 0.03),  # the fork of the legs
    (1.1, 0.35, 0.25, 0.02),  # hips
    (1.33, 0.3, 0.22, 0.0),  # the waist
    (1.58, 0.42, 0.29, -0.02),  # the chest
    (1.82, 0.47, 0.27, 0.02),  # the shoulders
    (1.95, 0.3, 0.21, 0.04),  # the slope of the shoulders
    (2.04, 0.15, 0.14, 0.01),  # the neck
]
WAIST_TOP = 1.42
WAIST_INSIDE = (1.28, 0.28, 0.2, 0.0)
SIDES = 8
PELVIS, WAIST, NECK = V(0, 0.02, 1.1), V(0, 0.06, 1.38), V(0, 0.02, 2.02)


def ring(z, rx, ry, cy, k=1.0):
    return ellipse(0, cy, z, k * rx, k * ry, SIDES, 22.5)


def at_height(z):
    """The BODY row at height z, between the rows either side."""
    for a, b in zip(BODY, BODY[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return tuple(p + t * (q - p) for p, q in zip(a, b))
    raise ValueError(f'no body at z = {z}')


def on_body(z, angle, k=1.04):
    """A point on the upright body's surface at height z, `angle` degrees round from its left (+X)
    towards its back (+Y), pushed out by k."""
    _, rx, ry, cy = at_height(z)
    a = math.radians(angle)
    return V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z)


def body():
    def inside(c):
        return V(0, 0.02, min(max(c.z, 0.95), 1.95))

    lower = [ring(*BODY[0]), ring(*BODY[1]), ring(*BODY[2]), ring(*at_height(WAIST_TOP))]
    verts, faces, _ = loft(lower)
    face_mats = cracked(faces, SIDES)
    verts.append(V(0, 0.03, 0.86))
    faces += [(i, (i + 1) % SIDES, len(verts) - 1) for i in range(SIDES)]  # closed between the legs
    face_mats += [0] * SIDES
    with bone('hips'):
        part('body-lower', verts, faces, skin(), face_mats, inside=inside)
    upper = [ring(*WAIST_INSIDE)] + [ring(*row) for row in BODY[3:]]
    verts, faces, _ = loft(upper)
    # The chest's middle facets glow, the fire within it showing through the cracks of its shadow.
    face_mats = cracked(faces, SIDES)
    with bone('spine'):
        part('body-upper', verts, faces, skin(), face_mats, inside=inside)
    joint('pelvis', PELVIS)
    joint('waist', WAIST)
    joint('neck', NECK)


def strap(name, path, width=0.09, k=1.05):
    """A strap of the livery along the body's surface, through (z, angle) points (on_body())."""
    centres = [on_body(z, a, k) for z, a in path]
    verts = []
    for i, c in enumerate(centres):
        ahead = centres[min(i + 1, len(centres) - 1)] - centres[max(i - 1, 0)]
        out = c - V(0, at_height(c.z)[3], c.z)
        across = ahead.cross(out).normalized()
        verts += [c - 0.5 * width * across, c + 0.5 * width * across]
    faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(centres) - 1)]
    return part(name, verts, faces, M['team'], inside=lambda c: V(0, at_height(min(max(c.z, 0.9), 2.04))[3], c.z))


# Over the left shoulder from the right hip before, and down the back to the right hip behind; the
# other strap mirrors it, so they cross on the breast and between the shoulders.
STRAP = [(1.26, 240), (1.42, 256), (1.58, 280), (1.74, 302), (1.86, 326), (1.95, 0), (1.86, 34), (1.74, 58),
         (1.58, 80), (1.42, 104), (1.26, 120)]


def harness():
    """The scorched harness, in the livery: two straps crossed on its chest and back, a broad girdle
    round its hips, and a tasset hanging from it before and behind; its buckles in trim."""
    with bone('spine'):
        strap('strap-left', STRAP, k=1.05)
        strap('strap-right', [(z, 180 - a) for z, a in STRAP], k=1.075)
        for name, z, a in (('boss-front', 1.6, 270), ('boss-back', 1.6, 90)):
            c = on_body(z, a, 1.1)
            out = V(0, math.copysign(1, math.sin(math.radians(a))), 0)
            cone(name, c - 0.02 * out, c + 0.035 * out, 0.05, M['trim'], n=5, back=None)
    with bone('hips'):
        band = [ring(z, *at_height(z)[1:], k=1.07) for z in (1.08, 1.22)]
        verts, faces, _ = loft(band)
        part('girdle', verts, faces, M['team'], inside=lambda c: V(0, 0.02, c.z))
        c = on_body(1.15, 270, 1.13)
        box('buckle', c, [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)], (0.02, 0.06, 0.05), M['trim'])
        for name, y, sign, drop in (('tasset-front', -0.27, -1, 0.42), ('tasset-back', 0.29, 1, 0.38)):
            top, w = 1.12, 0.17
            verts = [V(-w, y, top), V(w, y, top),
                     V(-0.95 * w, y + sign * 0.05, top - 0.55 * drop), V(0.95 * w, y + sign * 0.05, top - 0.55 * drop),
                     V(-0.8 * w, y + sign * 0.07, top - drop), V(0.0, y + sign * 0.075, top - drop - 0.07),
                     V(0.8 * w, y + sign * 0.07, top - drop)]
            faces = [(0, 1, 3, 2), (2, 3, 6, 5, 4)]
            part(name, verts, faces, M['team'], outward=V(0, sign, 0))


def back_fire():
    """The fire kindled about it: tongues of flame from the back of its neck, between its shoulders
    and on top of them, streaming up and back, on the spine."""
    with bone('spine'):
        for k, (base, way, length) in enumerate((
            (V(0.0, 0.17, 1.97), V(0, 0.6, 1), 0.36),
            (V(0.13, 0.17, 1.93), V(0.3, 0.7, 1), 0.3),
            (V(-0.13, 0.17, 1.93), V(-0.3, 0.7, 1), 0.3),
            (V(0.0, 0.26, 1.78), V(0, 1, 0.75), 0.3),
            (V(0.36, 0.06, 1.86), V(0.3, 0.35, 1), 0.26),
            (V(-0.36, 0.06, 1.86), V(-0.3, 0.35, 1), 0.26),
        )):
            flame(f'back-flame-{k}', base, way, length, 0.07, curl=V(0, 1, 0.2), phase=30 * k)


# Wings: shadow, folded behind it, from its shoulder blades up past its shoulders and hanging down its
# back, each on a bone of its own from the spine (wing_l, wing_r). Built upright, as the body is.
WING_ROOT = V(0.14, 0.25, 1.74)
WING_PEAK = V(0.38, 0.44, 2.36)
WING_TIPS = [V(0.46, 0.53, 1.5), V(0.4, 0.58, 1.18), V(0.26, 0.5, 1.02)]  # down from the peak, out to in
WING_NOTCHES = [V(0.42, 0.5, 1.48), V(0.33, 0.52, 1.2)]  # the tattered edge between them


def wings():
    for s, side in ((1, 'l'), (-1, 'r')):
        def m(p):
            return V(s * p.x, p.y, p.z)

        root, peak = m(WING_ROOT), m(WING_PEAK)
        elbow = root.lerp(peak, 0.55) + m(V(0.06, -0.02, 0))
        with bone(f'wing_{side}'):
            # The leading edge, a dark strut from the root up to the peak.
            rings = path_rings([root, elbow, peak], [0.045, 0.04, 0.02], 4, 45)
            verts = rings[0] + rings[1] + rings[2] + [peak + (peak - elbow).normalized() * 0.08]
            faces = [(r * 4 + i, r * 4 + (i + 1) % 4, (r + 1) * 4 + (i + 1) % 4, (r + 1) * 4 + i)
                     for r in range(2) for i in range(4)]
            faces += [(8 + i, 8 + (i + 1) % 4, 12) for i in range(4)]
            part(f'wing-edge-{side}', verts, faces, M['shadow'], inside=nearest_on_polyline([root, elbow, peak]))
            # The membrane, a fan from the elbow of the edge, tattered along its lower edge.
            tips = [m(t) for t in WING_TIPS]
            notches = [m(t) for t in WING_NOTCHES]
            rim = [peak, tips[0], notches[0], tips[1], notches[1], tips[2], root]
            verts = [elbow] + rim
            faces = [(0, i, i + 1) for i in range(1, len(rim))]
            part(f'wing-{side}', verts, faces, M['wing'], outward=V(0, 1, 0))
        joint(f'wing_{side}_root', root)
        joint(f'wing_{side}_peak', peak)


# The head ----------------------------------------------------------------------------------------

# The skull in rings from under the jaw up: the height above the head's origin, then the left half as
# (x, y): the side, the back corner, the back, the front corner and the front. A heavy jaw, a brow like
# a shelf over the eyes, and a low crown sloping back into the mane.
SKULL = [
    (0.0, (0.11, 0.0), (0.08, 0.08), 0.09, (0.1, -0.12), -0.16),  # under the jaw
    (0.1, (0.135, 0.02), (0.1, 0.11), 0.13, (0.115, -0.12), -0.17),  # the mouth
    (0.2, (0.145, 0.03), (0.11, 0.13), 0.15, (0.105, -0.1), -0.14),  # the cheeks, under the eyes
    (0.27, (0.145, 0.04), (0.11, 0.13), 0.15, (0.125, -0.13), -0.17),  # the brow, a shelf
    (0.36, (0.1, 0.06), (0.07, 0.12), 0.13, (0.07, -0.05), -0.07),  # the crown
]
CROWN = (0, 0.05, 0.4)


def head_origin():
    """The middle of the underside of its jaw, carried forward before its shoulders."""
    return hunched(NECK) + V(0, -0.07, -0.05)


def h(x, y, z):
    return head_origin() + V(x, y, z)


def head():
    with bone('head'):
        skull()
        features()
    joint('crown', h(*CROWN))


def skull():
    rings = []
    for z, side, corner, back, front_corner, front_y in SKULL:
        points = [side, corner, (0, back), (-corner[0], corner[1]), (-side[0], side[1]),
                  (-front_corner[0], front_corner[1]), (0, front_y), front_corner]
        rings.append([h(x, y, z) for x, y in points])
    verts, faces, bands = loft(rings)
    face_mats = [1 if (f % 8 + b) % 2 else 0 for f, b in enumerate(bands)]
    faces.append(tuple(range(8)))
    face_mats.append(0)
    verts.append(h(*CROWN))
    last = (len(rings) - 1) * 8
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    face_mats += [1 if i % 2 else 0 for i in range(8)]
    part('skull', verts, faces, [M['shadow'], M['smoke']], face_mats, inside=h(0, 0.0, 0.18))


def features():
    # Eyes of flame, slanting slits deep under the brow.
    for s in (-1, 1):
        verts = [h(s * 0.03, -0.142, 0.225), h(s * 0.105, -0.12, 0.25), h(s * 0.09, -0.125, 0.212)]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))
    # A mouth that glows, the fire within it.
    verts = [h(0.09, -0.155, 0.08), h(0.03, -0.172, 0.095), h(-0.03, -0.172, 0.095), h(-0.09, -0.155, 0.08),
             h(-0.03, -0.172, 0.065), h(0.03, -0.172, 0.065)]
    part('mouth', verts, [(0, 1, 5), (1, 2, 4, 5), (2, 3, 4)], M['ember'], outward=V(0, -1, 0))


# The mane: tongues of flame from its brow over its crown and down the back of its head, streaming up
# and back, on a bone of its own (`mane`) that trails after the head (clips.swaying()). In the head's
# measure: base, way and length.
MANE = [
    ((0.0, -0.06, 0.36), (0, 0.25, 1), 0.34),
    ((0.07, -0.01, 0.37), (0.3, 0.4, 1), 0.32),
    ((-0.07, -0.01, 0.37), (-0.3, 0.4, 1), 0.32),
    ((0.0, 0.05, 0.39), (0, 0.6, 1), 0.42),
    ((0.1, 0.07, 0.31), (0.6, 0.7, 0.8), 0.3),
    ((-0.1, 0.07, 0.31), (-0.6, 0.7, 0.8), 0.3),
    ((0.0, 0.13, 0.28), (0, 1, 0.65), 0.38),
    ((0.08, 0.12, 0.17), (0.4, 1, 0.45), 0.28),
    ((-0.08, 0.12, 0.17), (-0.4, 1, 0.45), 0.28),
]


def mane():
    with bone('mane'):
        for k, (base, way, length) in enumerate(MANE):
            flame(f'mane-{k}', h(*base), V(*way), length, 0.065, curl=V(0, 1, 0.3), phase=40 * k)
    joint('mane_root', h(0, 0.05, 0.3))
    joint('mane_tip', h(0, 0.3, 0.6))


# Arms, the sword and the whip ---------------------------------------------------------------------

SHOULDERS = {s: hunched(V(s * 0.46, 0.04, 1.84)) for s in (-1, 1)}  # its left (+X) and right
UPPER_ARM, FOREARM = 0.5, 0.48

# The sword is held up before its right shoulder, its flame beside its head; the whip hangs from its
# left fist, low by its side.
R_FIST = V(-0.5, -0.36, 1.12)
SWORD = V(-0.04, -0.17, 0.98).normalized()
POMMEL_AT, GUARD_AT, TIP_AT = -0.13, 0.11, 0.95  # along the sword from the fist
L_FIST = V(0.55, -0.16, 1.06)
HANDLE = V(0.06, -0.45, -0.89).normalized()
HANDLE_END = 0.26  # how far along it from the fist the thongs start
# The whip's chain, from the end of its handle: it hangs down and a little back from there.
WHIP = [V(0.0, 0.0, 0.0), V(0.01, 0.01, -0.27), V(0.03, 0.08, -0.5), V(0.05, 0.2, -0.7)]
THONGS = 5


def arm(side, fist, pole, along):
    """An arm from its shoulder to a fist at `fist`, the elbow bent towards `pole`; the fist round
    what it holds, which runs along `along`."""
    s = 'l' if side == 'left' else 'r'
    shoulder = SHOULDERS[1 if s == 'l' else -1]
    reach = (fist - shoulder).normalized()
    elbow = bend(shoulder, fist - 0.08 * reach, UPPER_ARM, FOREARM, pole)
    wrist = fist - 0.08 * (fist - elbow).normalized()
    past = elbow + 0.06 * (wrist - elbow).normalized()
    above = elbow + 0.06 * (shoulder - elbow).normalized()
    with bone(f'upper_arm_{s}'):
        verts, faces, _ = loft(segment(shoulder, past, [(-0.12, 0.14), (0.5, 0.125), (1, 0.11)], 6, 30))
        part(f'upper-arm-{side}', verts, faces, skin(), cracked(faces, 6), inside=nearest_on_line(shoulder, past))
    with bone(f'forearm_{s}'):
        verts, faces, _ = loft(segment(above, wrist, [(0, 0.1), (0.5, 0.12), (1, 0.095)], 6, 30))
        part(f'forearm-{side}', verts, faces, skin(), cracked(faces, 6),
             inside=nearest_on_line(above, wrist))
        # Fire licking up from the back of the forearm.
        out = V(1 if s == 'l' else -1, 0.4, 0.2)
        ahead = (wrist - above).normalized()
        out = (out - out.dot(ahead) * ahead).normalized()
        base = above.lerp(wrist, 0.4) + 0.08 * out
        flame(f'arm-flame-{side}', base, 0.35 * out + V(0, 0.35, 1) - 0.5 * ahead, 0.18, 0.045, curl=V(0, 0.5, 1))
    ahead = (fist - elbow).normalized()
    across = (along - along.dot(ahead) * ahead).normalized()
    with bone(f'hand_{s}'):
        box(f'fist-{side}', fist, [ahead, across, ahead.cross(across)], (0.1, 0.095, 0.09), M['shadow'], 0.85)
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)
    joint(f'fist_{s}', fist + 0.04 * ahead)


def sword():
    """A blade like a stabbing tongue of fire, wavering as it narrows to its point, on a hilt of black
    iron, its guard and pommel in trim; on the right hand, which holds it from the fist to its point."""
    along = SWORD
    edge = V(0, -1, 0)
    edge = (edge - edge.dot(along) * along).normalized()  # its edge forward
    flat = along.cross(edge)
    start = R_FIST + GUARD_AT * along
    tip = R_FIST + TIP_AT * along
    stations = [(0.0, 0.055), (0.22, 0.085), (0.45, 0.065), (0.68, 0.08), (0.86, 0.05)]
    rings = []
    for t, w in stations:
        c = start.lerp(tip, t)
        rings.append([c + w * edge, c + 0.3 * w * flat, c - w * edge, c - 0.3 * w * flat])
    verts, faces, bands = loft(rings)
    face_mats = [b % 2 for b in bands]
    verts.append(tip)
    last = (len(stations) - 1) * 4
    faces += [(last + i, last + (i + 1) % 4, len(verts) - 1) for i in range(4)]
    face_mats += [1] * 4
    part('blade', verts, faces, [M['fire'], M['flame']], face_mats, inside=nearest_on_line(start, tip))
    # Flames licking back off its edge.
    for k, (t, w) in enumerate(((0.3, 1), (0.62, -1))):
        base = start.lerp(tip, t) + 0.05 * w * edge
        flame(f'blade-flame-{k}', base, w * edge + 1.1 * along, 0.18, 0.035, curl=-w * edge)
    # The hilt: the grip through the fist, the guard across it and the pommel below.
    tube('grip', R_FIST + POMMEL_AT * along, R_FIST + GUARD_AT * along, [(0, 0.035), (1, 0.035)], M['iron'], n=5)
    box('guard', R_FIST + GUARD_AT * along, [along, edge, flat], (0.025, 0.14, 0.04), M['trim'], 0.8)
    cone('pommel', R_FIST + (POMMEL_AT + 0.01) * along, R_FIST + (POMMEL_AT - 0.06) * along, 0.05, M['trim'], n=5,
         back=None)
    return tip, edge


def whip():
    """The whip of many thongs: an iron handle in the left fist, and five thongs of flame from its end,
    brightest at their tips, on the whip's three bones, each thong's points following the bone of the
    length they are on, so the thongs bend where the bones turn. (Of the livery, thin and dark, they
    hardly showed.)"""
    root = L_FIST + HANDLE_END * HANDLE
    chain = [root + p for p in WHIP]
    tube('handle', L_FIST - 0.09 * HANDLE, root + 0.02 * HANDLE, [(0, 0.035), (1, 0.03)], M['iron'], n=5)
    tube('handle-band', root - 0.03 * HANDLE, root + 0.02 * HANDLE, [(0, 0.042), (1, 0.042)], M['trim'], n=5)

    def follows(p):
        """The bone of the length of the whip a point of a thong is on."""
        heights = [c.z for c in chain]
        if p.z > heights[1] + 0.02:
            return 'whip_1'
        return 'whip_2' if p.z > heights[2] + 0.02 else 'whip_3'

    with bone('whip_1', follows=follows):
        for k in range(THONGS):
            a = math.radians(72 * k + 15)
            spread = V(math.cos(a), math.sin(a), 0)
            points = [chain[0], chain[1] + 0.025 * spread, chain[2] + 0.06 * spread, chain[3] + 0.1 * spread]
            rings = path_rings(points[:3], [0.03, 0.026, 0.02], 3, 60 * k)
            verts = rings[0] + rings[1] + rings[2] + [points[3]]
            faces = [(r * 3 + i, r * 3 + (i + 1) % 3, (r + 1) * 3 + (i + 1) % 3, (r + 1) * 3 + i)
                     for r in range(2) for i in range(3)]
            faces += [(6 + i, 6 + (i + 1) % 3, 9) for i in range(3)]
            face_mats = [0] * 3 + [1] * 3 + [1] * 3
            faces = wind(verts, faces, inside=nearest_on_polyline(points))
            part(f'thong-{k}', verts, faces, [M['fire'], M['flame']], face_mats)
    for name, p in zip(('whip_root', 'whip_a', 'whip_b', 'whip_end'), chain):
        joint(name, p)
    return root


def arms():
    with bone('hand_r'):
        tip, edge = sword()
    with bone('hand_l'):
        root = whip()
    # The right arm bends forward to hold the sword up, the elbow out and back; the left hangs by its
    # side with the whip, the elbow out and back.
    arm('right', R_FIST, SHOULDERS[-1] + V(-0.12, 0.3, -0.3), SWORD)
    arm('left', L_FIST, SHOULDERS[1] + V(0.12, 0.3, -0.3), HANDLE)
    hold('r', R_FIST, tip, tip + 0.1 * edge)
    hold('l', L_FIST, root, root + 0.1 * V(0, -1, 0))


# Its clips ----------------------------------------------------------------------------------------
#
# Its attack, a bolt of fire flung from its sword (a shot, on frame 3 as keyed: its range is 2), and its
# cast, the whip lashed across the cone in front, are its own. Each is drawn where it goes, the hands'
# paths in the model's frame as the library's blows are, from the rig's measurements (clips.Body).

WHIP_BONES = ('whip_1', 'whip_2', 'whip_3')


def slash(rig):
    """Its attack: the sword swept up and back over its right shoulder, the body turned to it and
    rearing, then over the top and slashed down before it, the body bowing in after it, so that on
    frame 3 the blade points down at the foe ahead, and the bolt of fire leaves from its point (its
    muzzle); a hold, and the sword brought back up to where it is held."""
    b = Body(rig, 'r')
    n = frames_for(0.6)
    leg = b.leg
    k = Keys(lag={'head': 1})
    k.key(0, **b.still())

    def blade(theta, at, yaw=0.0, elbow=(0.12, 0.4, -0.9)):
        aim, face = arc(theta, b.yaw(yaw))
        return b.arm('r', b.near(*at), rig.aim('r', aim, face), elbow, world=1.0)

    path = [
        (0, 'smooth', -58, (0.0, 0.24, 0.36), -6),  # drawn back over its shoulder
        (1, 'in', -42, (-0.02, 0.18, 0.44), -4),  # further, the body rearing
        (2, 'in', 40, (-0.1, -0.12, 0.46), -2),  # over the top, coming down
        (BLOW, 'in', 132, (-0.14, -0.5, -0.1), -4),  # slashed down at the foe: the bolt leaves
        (BLOW + 3, 'out', 126, (-0.14, -0.48, -0.06), -4),
        (BLOW + 7, 'smooth', 118, (-0.12, -0.45, -0.06), -4),
        (BLOW + 11, 'smooth', 50, (-0.05, -0.32, -0.2), -2),
    ]
    for f, ease, theta, at, yaw in path:
        k.key(f, ease, **blade(theta, at, yaw))
    body_keys = [  # spine and hips as pitch and yaw to the sword's side, hips forward and down
        (0, 'smooth', (-8, 14), (-2, 6), (-0.02, 0.03)),
        (1, 'in', (-11, 10), (-3, 5), (-0.02, 0.03)),
        (2, 'in', (-2, 4), (0, 2), (0.0, 0.05)),
        (BLOW, 'in', (13, -16), (4, -8), (0.04, 0.09)),
        (BLOW + 3, 'out', (12, -15), (4, -7), (0.035, 0.085)),
        (BLOW + 7, 'smooth', (10, -12), (3, -6), (0.03, 0.07)),
        (BLOW + 11, 'smooth', (3, -3), (1, -1), (0.01, 0.03)),
    ]
    for f, ease, spine, hips, (ahead, low) in body_keys:
        k.key(f, ease, spine=V(spine[0], 0, b.yaw(spine[1])), hips=V(hips[0], 0, b.yaw(hips[1])),
              hips_at=V(0, -ahead * leg, -low * leg))
    k.key(0, head=V(4, 0, b.yaw(-10)), **b.arm('l', b.wrist('l', 0.04, -0.06, 0.04)))
    k.key(BLOW, 'in', head=V(-6, 0, b.yaw(6)), **b.arm('l', b.wrist('l', 0.08, 0.14, 0.02)))
    k.key(n, **b.still())
    k.key(n, **{'hand_r_world': 1.0})
    return timed(rig, 'attack', Clip(n, k, marks={'strike': BLOW}, muzzle=('hand_r', rig.joint('tip_r'))))


def lashed(rig, ch, yaw, swings, room=ROOM - 0.01, ahead=True):
    """Channels `ch` with the whip's bones turned so each length points `swings` degrees round from
    hanging down towards behind its heading (90 behind, 180 up, 270 ahead, 360 down again), the heading
    `yaw` degrees round from straight ahead to its left. A length that points ahead and down droops
    further, towards hanging, as far as it must to keep the whip in its room and out of the ground."""
    ch = dict(ch)
    heading = Matrix.Rotation(math.radians(yaw), 3, 'Z')

    def turns(swing):
        return [(heading @ Matrix.Rotation(math.radians(a), 3, 'X')).to_quaternion() for a in swing]

    def apply(swing):
        motions = rig.solve(ch)
        parent = motions['hand_l'].turn
        for name, turn in zip(WHIP_BONES, turns(swing)):
            ch[name] = degrees_of(parent.inverted() @ turn)
            parent = turn

    def fits():
        pose = rig.solve(ch)
        points = []
        for name in WHIP_BONES:
            m = pose[name]
            pts = rig.points(name)
            if len(pts):
                points.append((pts - np.array(m.head)) @ np.array(m.turn.to_matrix()).T + np.array(m.at))
        p = np.concatenate(points)
        return float(measured(p, ahead).max()) <= room and float(p[:, 2].min()) >= 0.005

    swing = list(swings)
    apply(swing)
    for _ in range(40):
        if fits():
            break
        swing = [a + 3 if 180 < a < 357 else a for a in swing]  # droop the lengths that point ahead
        apply(swing)
    return ch


def lash(rig):
    """Its cast, Whip of flame: the whip drawn back behind it, low, the body turned to it and rearing;
    swung up over its left shoulder, the thongs trailing up behind the hand; then cracked out across the
    front on frame 4 as keyed (its height, the end of its wind-up once retimed), the arm thrown forward
    and down and the thongs streaming out at the foes ahead; swept on across to its right as the thongs
    fall to the ground; held, and drawn back to hang by its side. The sword is held up and out to its
    right all the while."""
    b = Body(rig, 'l')
    n = frames_for(0.8)
    height = 4
    leg = b.leg
    k = Keys(lag={'head': 1})
    k.key(0, **b.still())
    # (frame, ease, the whip hand by its shoulder, its elbow, the heading, and each length's swing)
    path = [
        (0, 'smooth', (0.04, 0.06, -0.3), (0.45, 0.15, -0.88), 20, (24, 16, 8)),
        (2, 'in', (0.0, -0.05, 0.62), (0.1, 0.45, -0.88), 12, (150, 130, 110)),
        (3, 'in', (-0.04, -0.3, 0.55), (0.3, 0.4, -0.8), 8, (215, 200, 175)),
        (height, 'in', (-0.28, -0.5, 0.05), (0.2, 0.3, -0.9), 4, (258, 262, 266)),
        (height + 2, 'out', (-0.3, -0.48, -0.25), (0.2, 0.3, -0.9), -26, (285, 300, 318)),
        (height + 5, 'smooth', (-0.3, -0.45, -0.35), (0.2, 0.3, -0.9), -36, (318, 335, 350)),
        (height + 10, 'smooth', (-0.12, -0.2, -0.35), (0.2, 0.4, -0.85), -15, (350, 355, 358)),
        (n, 'smooth', None, None, 0, (360, 360, 360)),
    ]
    for f, ease, at, elbow, yaw, swing in path:
        if at is not None:
            k.key(f, ease, **b.arm('l', b.near(*at), None, elbow, world=1.0))
        k.key(f, ease, lash_yaw=float(yaw), **{f'lash_{i}': float(a) for i, a in enumerate(swing)})
    body_keys = [  # spine and hips as pitch and yaw to the whip's side, hips forward and down
        (0, 'smooth', (-8, 12), (-2, 5), (-0.02, 0.03)),
        (2, 'in', (-10, 10), (-3, 4), (-0.02, 0.03)),
        (3, 'in', (2, 2), (1, 1), (0.01, 0.05)),
        (height, 'in', (14, -18), (5, -8), (0.04, 0.09)),
        (height + 2, 'out', (13, -26), (5, -11), (0.04, 0.09)),
        (height + 5, 'smooth', (12, -28), (4, -12), (0.035, 0.085)),
        (height + 10, 'smooth', (5, -10), (2, -4), (0.015, 0.04)),
    ]
    for f, ease, spine, hips, (ahead, low) in body_keys:
        k.key(f, ease, spine=V(spine[0], 0, b.yaw(spine[1])), hips=V(hips[0], 0, b.yaw(hips[1])),
              hips_at=V(0, -ahead * leg, -low * leg))
    up = rig.aim('r', V(0.15, -0.1, 1).normalized(), V(0, -1, 0))
    k.key(0, head=V(4, 0, b.yaw(-14)), **b.arm('r', b.wrist('r', 0.1, 0.1, 0.12), up))
    k.key(height, 'in', head=V(-8, 0, b.yaw(10)), **b.arm('r', b.wrist('r', 0.12, 0.2, 0.1), up))
    k.key(n, **b.still())
    k.key(n, **{'hand_l_world': 1.0})

    def pose(f):
        ch = k(f)
        yaw = ch.pop('lash_yaw')
        swing = [ch.pop(f'lash_{i}') for i in range(3)]
        return lashed(rig, ch, yaw, swing)

    return timed(rig, 'cast', Clip(n, pose, marks={'height': height}))


RAISED = 16  # the frame its victory holds from


def rearing(rig):
    """Its victory: a gathering crouch, then reared up, the sword thrust high, the whip hand raised, its
    wings lifted and its head thrown back, held from frame RAISED."""
    b = Body(rig, 'r')
    n = frames_for(0.8)
    leg = b.leg
    k = Keys(lag={'head': 1, 'wing_l': 1, 'wing_r': 1})
    k.key(0, **b.still())
    k.key(0, **{'hand_r_world': 1.0, 'hand_l_world': 1.0})
    k.key(3, hips_at=V(0, 0, -0.07 * leg), spine=V(8, 0, 0), head=V(6, 0, 0),
          **b.arm('r', b.wrist('r', -0.04, 0.02, -0.06), b.tip(-6), (0.1, 0.5, -0.85), world=1.0),
          **b.arm('l', b.wrist('l', -0.04, 0.04, -0.06), None, (0.1, 0.5, -0.85), world=1.0))

    k.key(6, 'in', **b.arm('r', b.near(-0.05, -0.3, 0.25), b.tip(-30), (0.1, 0.5, -0.85), world=1.0),
          **b.arm('l', b.near(-0.05, -0.3, 0.2, 'l'), None, (0.1, 0.5, -0.85), world=1.0),
          hips_at=V(0, 0, -0.03 * leg), spine=V(0, 0, 0), head=V(0, 0, 0))

    def up(theta):
        aim, _ = arc(theta)
        return rig.aim('r', aim, V(-1, 0, 0))

    k.key(10, 'out', **b.arm('r', b.near(0.06, 0.0, 0.8), up(-6), (0.1, 0.5, -0.85), world=1.0),
          **b.arm('l', b.near(0.12, 0.02, 0.72, 'l'), None, (0.1, 0.5, -0.85), world=1.0),
          hips_at=V(0, 0.01 * leg, 0.02 * leg), hips=V(-4, 0, 0), spine=V(-14, 0, 0), head=V(-18, 0, 0),
          wing_l=V(-8, 14, 6), wing_r=V(-8, -14, -6))
    k.key(RAISED, **b.arm('r', b.near(0.06, -0.02, 0.78), up(0), (0.1, 0.5, -0.85), world=1.0),
          **b.arm('l', b.near(0.1, 0.0, 0.7, 'l'), None, (0.1, 0.5, -0.85), world=1.0),
          hips_at=V(0, 0.005 * leg, 0.0), hips=V(-3, 0, 0), spine=V(-11, 0, 0), head=V(-14, 0, 0),
          wing_l=V(-6, 12, 5), wing_r=V(-6, -12, -5))
    return Clip(n, lambda f: k(min(f, RAISED)))


def whip_hangs(clips):
    """The clips with the whip hanging from the hand and trailing after it, each length after the one
    before (clips.swaying()), and the mane streaming after the head."""
    for name in WHIP_BONES:
        clips = swaying(clips, name, share=1.0, lag=2, drag=0.5)
    return clips


def tucked(clips, clip, hand, elbow, by):
    """The clips with `clip`'s `hand` turning its elbow in towards `elbow`, all the way by frame `by`:
    the library's falls swing a hand's elbow out to its side, as a Man's, and a Large figure's long arm
    would swing it out of its hex."""

    def tucking(rig, name, spec):
        made_clip = made(rig, name, spec)
        if name != clip:
            return made_clip
        pose = made_clip.pose
        rest = rig.rest[f'elbow_{hand}']

        def tucked_pose(f):
            ch = pose(f)
            u = EASES['smooth'](min(f / by, 1.0))
            ch[f'elbow_{hand}'] = rest.lerp(Vector(elbow).normalized(), u).normalized()
            return ch

        return made_clip.with_pose(tucked_pose)

    return {name: (lambda rig, name=name, spec=spec: tucking(rig, name, spec)) for name, spec in clips.items()}


# Slow and heavy, as Treebeard's and the Cave Troll's. It stands breathing slow, the sword up; strides
# long and low, the sword carried up and the whip swinging; flings fire from its sword and lashes its
# whip (above); sways, dazed, the sword let down; sinks to its knees as it falls; and rears up as it
# wins. The whip hangs and trails in every clip but its cast, where it is lashed, and the mane streams
# after the head in all of them. Kept in its room by fit().
HUNG = whip_hangs({
    'idle': ('ready', {'seconds': 2.6, 'breath': 0.8, 'sway': 0.7, 'crouch': 0.03}),
    'move': ('run', {'seconds': 0.6, 'heavy': 1.0, 'stride': 0.42, 'lift': 0.16, 'lean': 6.0}),
    'attack': slash,
    'stun': ('dazed', {'seconds': 1.5, 'low': 0.6}),
    'death': ('knees', {'slump': 0.8, 'back': 0.25}),
    'victory': rearing,
})
HUNG = tucked(HUNG, 'death', 'l', (0.2, 0.45, -0.85), 7)
CLIPS = fit(swaying({**HUNG, 'cast': lash}, 'mane', share=0.5, lag=2, drag=0.5), between=True)


def build():
    """Makes it in a fresh scene, every part bound to its bone and its joints marked, and returns the
    rig to finish() it with."""
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    body()
    harness()
    back_fire()
    wings()
    hunch(new_objects(before))
    head()
    mane()
    arms()
    return Rig(kind='large', clips=CLIPS, bones={
        'whip_1': ('hand_l', 'whip_root', 'whip_a'),
        'whip_2': ('whip_1', 'whip_a', 'whip_b'),
        'whip_3': ('whip_2', 'whip_b', 'whip_end'),
        'wing_l': ('spine', 'wing_l_root', 'wing_l_peak'),
        'wing_r': ('spine', 'wing_r_root', 'wing_r_peak'),
        'mane': ('head', 'mane_root', 'mane_tip'),
    })


def main():
    finish('balrog', budget=LARGE_BUDGET, rig=build())


if __name__ == '__main__':
    main()
