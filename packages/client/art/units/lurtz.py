"""Lurtz, the Uruk-hai: an Archer of Isengard, in the Faceted style (docs/viewer-spec.md section 4).

One of the great Orcs that Saruman bred, as the books have the Uruk-hai: swart, slant-eyed, heavy and
straight-legged, nearly as tall as a Man and upright where the Orcs of Mordor stoop. Of Gorbag's kind
(gorbag.py), with the tusked, jutting jaw, the shelf of brow, the pointed ears and a black scalp-lock,
but about 1.38 to the top of his helm, broad and heavy, with skin of a dark grey-brown and pale yellow
eyes that show in it. He wears an iron helm with the S-rune of Isengard on its brow in white metal,
the lock drawn through its crown, a black leather jerkin and breeches, and is bare-armed to the
bracers: an archer, lighter-armed than Ugluk's shield-bearers. He draws a great bow of yew, like a
Man's, hard to his jaw, the stave bent round in a deep arc and a long arrow on the string, and a
quiver of them rides his back. The team colour is his short ragged cape, open at the front, and the
ragged flaps of his war-kilt before and behind; the White Hand is on the front flap, small and pale,
as Gorbag bears the Moon of Morgul on his, and again between his shoulder blades.

    blender --background --factory-startup --python-exit-code 1 --python lurtz.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys
from itertools import pairwise

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOTS,
    LEATHER,
    V,
    bent_tube,
    box,
    ellipse,
    finish,
    frame,
    loft,
    material,
    nearest_on_polyline,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    tube,
)

# Lurtz's own colours (sRGB); the rest come from the kit.
SKIN = 0x5E5347  # swart: a dark grey-brown, darker than the olive of the Orcs of Mordor
HAIR = 0x221D1A  # coarse and black
JERKIN = 0x2B2522  # black leather, the field of Isengard
IRON = 0x7A7F86  # his helm and bracers
YEW = 0x93683F  # the heartwood on the belly of his bow, and the arrows' shafts
SAPWOOD = 0xD3BF95  # the pale sapwood on its back
FEATHER = 0xB3AC9E  # grey fletching, and the bowstring
WHITE = 0xE4E0D6  # the White Hand and the S-rune
BONE = 0xD5CAA8  # his tusks
GLARE = 0xC4A857  # pale yellow eyes, which show in his dark face

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.95),
        jerkin=material('jerkin', JERKIN, roughness=0.85),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        iron=material('iron', IRON, roughness=0.55, metallic=0.1),
        wood=material('wood', YEW, roughness=0.7),
        sapwood=material('sapwood', SAPWOOD, roughness=0.7),
        feather=material('feather', FEATHER, roughness=0.9),
        white=material('white', WHITE, roughness=0.5),
        bone=material('bone', BONE, roughness=0.7),
        eyes=material('eyes', GLARE, roughness=0.5),
    )


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o not in before]


# The pose ----------------------------------------------------------------------------------------
#
# The body above the hips is built upright and square, then turned into the draw by posed(): his
# hips turn a little to his right and his chest further, bringing the bow shoulder forward, and he
# leans a little into the shot. The arrow points AIM_YAW degrees to his left, as Legolas's and
# Gorbag's do: a bow drawn straight ahead is edge-on to the game's camera and reads as a stick.

HIPS_YAW = -10  # degrees his hips turn to his right
TWIST = -22  # further degrees his chest turns to his right above them
TWIST_FROM, TWIST_SPAN = 0.62, 0.3  # the height the twist starts at and the height it comes in over
LEAN = 5  # degrees he leans forward into the shot, coming in with the twist
PIVOT = V(0, 0, 0.62)  # the hips


def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def yaw(degrees):
    return Matrix.Rotation(math.radians(degrees), 3, 'Z')


def posed(p):
    """Where a point of the body, built upright and square, is once he turns into the draw."""
    p = Vector(p)
    s = smooth((p.z - TWIST_FROM) / TWIST_SPAN)
    p = yaw(HIPS_YAW + TWIST * s) @ p
    return PIVOT + Matrix.Rotation(math.radians(LEAN * s), 3, 'X') @ (p - PIVOT)


def pose(objects):
    for obj in objects:
        for v in obj.data.vertices:
            v.co = posed(v.co)


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


# Legs: thick and straight, planted wide, the left foot towards the shot ---------------------------

HIP_Z = 0.62
THIGH, SHIN = 0.28, 0.27
LEGS = {  # the hip joint (in the hips' frame), the ankle and the foot's yaw
    'right': (V(-0.1, 0.01, HIP_Z), V(-0.18, 0.13, 0.1), -34),
    'left': (V(0.1, -0.01, HIP_Z), V(0.18, -0.1, 0.1), 22),
}

# Heavy boots from the sole up, in the foot's own frame (toes towards -y): the height of each ring and
# the right half of it, side, heel and toe, mirrored by boot().
BOOT_RINGS = [
    (0.0, [(0.092, -0.02), (0.08, 0.088), (0.062, -0.18)]),  # the sole
    (0.065, [(0.092, -0.01), (0.082, 0.084), (0.056, -0.138)]),  # the toe rises to a blunt point
    (0.16, [(0.08, 0.0), (0.072, 0.072), (0.064, -0.05)]),  # round the ankle
]


def boot(name, ankle, foot_yaw):
    turn = yaw(foot_yaw)
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in BOOT_RINGS]
    rings = [[at + turn @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    part(name, verts, faces, M['boots'], inside=at + V(0, 0, 0.07))


def legs():
    for side, (hip, ankle, foot_yaw) in LEGS.items():
        hip = posed(hip)
        ahead = yaw(foot_yaw) @ V(0, -1, 0)
        knee = bend(hip, ankle, THIGH, SHIN, (hip + ankle) / 2 + 0.3 * ahead)
        tube(f'thigh-{side}', hip + V(0, 0, 0.05), knee, [(0, 0.1), (1.05, 0.082)], M['leather'])
        tube(f'shin-{side}', knee, ankle, [(0, 0.08), (1.0, 0.07)], M['boots'])
        boot(f'boot-{side}', ankle, foot_yaw)


# Body, built upright and square, then posed -------------------------------------------------------

# A barrel of octagons: z, half-width, half-depth and centre y. The belt is the second band.
TORSO = [
    (0.47, 0.212, 0.168, 0.012),  # the jerkin's skirt, flared over the thighs
    (0.6, 0.194, 0.15, 0.008),  # the belt, lower edge
    (0.68, 0.2, 0.154, 0.0),  # the belt, upper edge
    (0.86, 0.268, 0.18, -0.005),  # a barrel chest
    (0.96, 0.258, 0.162, 0.01),  # shoulders
]
TORSO_BANDS = [0, 1, 0, 0]  # the jerkin, except the belt


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    part('torso', verts, faces, [M['jerkin'], M['leather']], [TORSO_BANDS[b] for b in bands],
         inside=lambda c: V(0, 0.005, c.z))
    axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
    box('buckle', V(0, -0.148, 0.64), axes, (0.014, 0.034, 0.034), M['iron'], 0.75)


# The White Hand of Saruman, in (u, v) with u across and v up, about a unit tall: an open right hand,
# fingers up, palm out and the thumb to the left as it is seen.
HAND_PALM = [(-0.17, -0.5), (0.17, -0.5), (0.25, -0.1), (0.24, 0.08), (-0.24, 0.1), (-0.26, -0.12)]
HAND_FINGERS = [  # the middle of each finger's base, its half-width, length and splay in degrees
    (-0.18, 0.052, 0.34, 10), (-0.06, 0.054, 0.42, 3), (0.06, 0.054, 0.4, -3), (0.18, 0.05, 0.3, -11),
]
HAND_THUMB = [(-0.25, -0.18), (-0.24, 0.02), (-0.4, 0.2), (-0.46, 0.1)]


def white_hand(name, plate, centre, size, facing):
    """The White Hand laid flat on the triangles `plate`, which face along y (`facing` is -1 for a
    face to the front and 1 for one to the back), its middle at `centre` (x, z)."""

    def at(u, v):
        x, z = centre[0] - facing * size * u, centre[1] + size * v
        return V(x, on_surface(plate, x, z) + facing * 0.005, z)

    verts = [at(u, v) for u, v in HAND_PALM]
    faces = [(0, 1, 2, 5), (5, 2, 3, 4)]
    for u, w, length, splay in HAND_FINGERS:
        a = math.radians(splay)
        along = (-math.sin(a), math.cos(a))
        base = len(verts)
        root = (u, 0.08)
        tip = (u + length * along[0], 0.08 + length * along[1])
        verts += [at(root[0] - w, root[1]), at(root[0] + w, root[1]),
                  at(tip[0] + 0.8 * w, tip[1]), at(tip[0] - 0.8 * w, tip[1])]
        faces.append((base, base + 1, base + 2, base + 3))
    base = len(verts)
    verts += [at(u, v) for u, v in HAND_THUMB]
    faces.append((base, base + 1, base + 2, base + 3))
    part(name, verts, faces, M['white'], outward=V(0, facing, 0))


# Team colour: a short ragged cape, open at the front, and the flaps of a war-kilt -----------------

CAPE_SPAN = 290.0, 610.0  # degrees from +X: from the front of his left shoulder round his back to his right


def arc(rx, ry, cy, heights, fold=0.0, n=9):
    """n points round the cape across CAPE_SPAN, at heights interpolated from (degrees from the
    middle of his back, z); every other one pushed out by `fold`, for the folds."""
    start, end = CAPE_SPAN
    points = []
    for i in range(n):
        a = start + (end - start) * i / (n - 1)
        d = abs(a - 450.0)
        z = heights[-1][1]
        for (d0, z0), (d1, z1) in pairwise(heights):
            if d0 <= d <= d1:
                z = z0 + (z1 - z0) * (d - d0) / (d1 - d0)
        f = 1 + (fold / ry if i % 2 else 0.0)
        r = math.radians(a)
        points.append(V(f * rx * math.cos(r), cy + f * ry * math.sin(r), z))
    return points


CAPE_RAGS = [0.07, 0.1, 0.12, 0.09, 0.13, 0.1, 0.11, 0.07]  # how far each rag hangs below the hem


def cape():
    rings = [
        arc(0.118, 0.108, 0.012, [(0, 1.035), (160, 0.995)]),  # the collar
        arc(0.282, 0.198, 0.008, [(0, 0.975), (90, 0.955), (160, 0.945)]),  # over the shoulders
        arc(0.3, 0.2, 0.012, [(0, 0.85), (90, 0.865), (160, 0.83)], fold=0.012),
        arc(0.302, 0.215, 0.022, [(0, 0.67), (55, 0.7), (95, 0.78), (160, 0.72)], fold=0.025),  # the hem
    ]
    verts, faces, _ = loft(rings, closed=False)
    hem = len(verts) - len(rings[-1])
    for i, drop in enumerate(CAPE_RAGS):
        mid = (verts[hem + i] + verts[hem + i + 1]) / 2
        out = V(mid.x, mid.y, 0).normalized()
        verts.append(mid + 0.012 * out - V(0, 0, drop))
        faces.append((hem + i, hem + i + 1, len(verts) - 1))
    part('cape', verts, faces, M['team'], inside=lambda c: V(0, 0.01, min(c.z, 0.95) - 0.1))

    # The White Hand between his shoulder blades, left of the quiver, for those who see his back.
    lo, hi = rings[2], rings[1]
    plate = [(lo[3], lo[4], hi[4]), (lo[3], hi[4], hi[3])]
    white_hand('white-hand-back', plate, (0.045, 0.915), 0.1, 1)


# Each flap: the y of the middle of its top, which way is out, the height of its hem under each of
# FLAP_COLUMNS, and how far the rag under each column hangs below the hem.
FLAP_COLUMNS = (-0.15, -0.06, 0.06, 0.15)
FLAPS = {
    'front': (-0.125, -1, (0.39, 0.36, 0.38, 0.35), (0.07, 0.1, 0.06)),
    'back': (0.13, 1, (0.36, 0.39, 0.35, 0.38), (0.08, 0.06, 0.09)),
}


def kilt():
    # Front and back flaps tucked under the belt, each a sheet of three columns, wrapping round his
    # hips at the top and hanging free below, with a ragged hem.
    for name, (top_y, sign, hems, rags) in FLAPS.items():
        top = [V(x, top_y - sign * 0.035 * (abs(x) > 0.1), 0.64) for x in FLAP_COLUMNS]
        mid = [V(0.98 * x, top_y + sign * 0.055, 0.48) for x in FLAP_COLUMNS]
        bottom = [V(0.92 * x, top_y + sign * 0.068, z) for x, z in zip(FLAP_COLUMNS, hems)]
        verts, faces, _ = loft([top, mid, bottom], closed=False)
        for k, drop in enumerate(rags):
            a, b = verts[8 + k], verts[9 + k]
            verts.append((a + b) / 2 + V(0, sign * 0.006, -drop))
            faces.append((8 + k, 9 + k, len(verts) - 1))
        part(f'kilt-{name}', verts, faces, M['team'], outward=V(0, sign, 0))
        if name == 'front':
            # The White Hand on it, as Gorbag bears the Moon of Morgul on his.
            plate = [(top[1], top[2], mid[2]), (top[1], mid[2], mid[1])]
            white_hand('white-hand', plate, (0.0, 0.54), 0.11, -1)


# The quiver rides his back, placed once he has turned: from the hem of his cape, left of his spine,
# to behind his right shoulder, resting on the cape where it rounds over his shoulder blades.
QUIVER_FOOT, QUIVER_TOP = V(-0.002, 0.313, 0.62), V(-0.152, 0.263, 1.08)


def quiver():
    foot, top = QUIVER_FOOT, QUIVER_TOP
    along = (top - foot).normalized()
    tube('quiver', foot, top, [(0, 0.048), (1, 0.06)], M['leather'], n=6)
    ring = segment(foot, top, [(0, 0.048)], 6)[0]
    part('quiver-foot', ring + [foot - 0.03 * along], [(i, (i + 1) % 6, 6) for i in range(6)], M['leather'],
         inside=foot)
    # The fletching bunched in the mouth, and four arrows standing out of it.
    ring = segment(foot, top, [(1, 0.06)], 6)[0]
    part('quiver-mouth', ring + [top + 0.03 * along], [(i, (i + 1) % 6, 6) for i in range(6)], M['feather'],
         inside=top)
    across, other = frame(along)
    for k, (du, dv, tilt) in enumerate([(0.03, 0.0, 0.15), (-0.026, 0.02, -0.12), (-0.006, -0.032, -0.03),
                                        (0.01, 0.032, 0.07)]):
        base = top + du * across + dv * other
        up = (along + tilt * across + 0.5 * tilt * other).normalized()
        fletching(f'fletching-{k}', base, up, 0.13, 0.024)


def fletching(name, base, up, length, width):
    """Two crossed vanes of feather from `base` along `up`."""
    a, b = frame(up)
    verts, faces = [], []
    for w in (a, b):
        n = len(verts)
        middle = base + 0.35 * length * up
        verts += [base, middle + width * w, base + length * up, middle - width * w]
        faces.append((n, n + 1, n + 2, n + 3))
    part(name, verts, faces, M['feather'])


# Head, in its own frame: facing -Y, then turned by HEAD_YAW ----------------------------------------

HEAD = V(0.0, -0.06, 1.015)  # the middle of the underside of his jaw
HEAD_SCALE = 1.1  # the head is drawn big, as Gimli's is, so it reads at game size
HEAD_YAW = 52  # degrees his head turns to his left, to look down the arrow

# The skull in rings from under the jaw to the temples: the height of each above HEAD, then the left
# half of it as (x, y): the side, the back corner, the back, the front corner and the front.
SKULL = [
    (0.0, (0.135, -0.035), (0.085, 0.05), 0.065, (0.12, -0.165), -0.2),  # under the jaw: broad and jutting
    (0.08, (0.152, -0.01), (0.108, 0.085), 0.11, (0.13, -0.16), -0.19),  # the mouth
    (0.165, (0.145, 0.0), (0.11, 0.1), 0.13, (0.118, -0.12), -0.155),  # cheekbones and eyes
    (0.24, (0.128, 0.012), (0.095, 0.1), 0.128, (0.09, -0.085), -0.105),  # the temples, under the helm
]

# The helm as octagons with a flat face to the front: z, half-width, half-depth and centre y.
HELM = [
    (0.16, 0.168, 0.165, -0.008),  # the rim, over the brow
    (0.215, 0.17, 0.167, -0.005),  # the top of the brow band
    (0.285, 0.14, 0.138, 0.004),  # the shoulder of the dome
    (0.315, 0.075, 0.075, 0.008),
]
HELM_TOP = (0, 0.008, 0.33)

# The S-rune of Isengard, three strokes down the front of the helm: (x, z) in the head's measure.
RUNE = [(0.02, 0.277), (-0.016, 0.258), (0.016, 0.242), (-0.02, 0.223)]


def h(x, y, z):
    """A point of the head, from HEAD in the head's own (unscaled) measure."""
    return HEAD + HEAD_SCALE * V(x, y, z)


def head_point(x, y, z):
    """Where a point of the head, in its own measure, is once the head turns."""
    return HEAD + yaw(HEAD_YAW) @ (HEAD_SCALE * V(x, y, z))


def head():
    before = set(bpy.context.scene.objects)
    rings = []
    for z, side, corner, back, front_corner, front in SKULL:
        ring = [side, corner, (0, back), (-corner[0], corner[1]), (-side[0], side[1]),
                (-front_corner[0], front_corner[1]), (0, front), front_corner]
        rings.append([h(x, y, z) for x, y in ring])
    verts, faces, _ = loft(rings)
    faces.append(tuple(range(8)))  # under the jaw
    part('skull', verts, faces, M['skin'], inside=h(0, -0.03, 0.12))

    def front(band):
        tris = []
        for i in (4, 5, 6, 7):
            a, b = rings[band][i], rings[band][(i + 1) % 8]
            c, d = rings[band + 1][(i + 1) % 8], rings[band + 1][i]
            tris += [(a, b, c), (a, c, d)]
        return tris

    face, jaw = front(1), front(0)

    def on(tris, x, z, lift):
        """A point of the head at (x, z) laid `lift` proud of the surface `tris`."""
        p = h(x, 0, z)
        return V(p.x, on_surface(tris, p.x, p.z) - lift, p.z)

    # Slanted eyes under the brow, pale so they show in his dark face.
    for s in (-1, 1):
        corners = [on(face, x, z, 0.006) for x, z in ((s * 0.03, 0.125), (s * 0.1, 0.152), (s * 0.07, 0.112))]
        part(f'eye-{s}', corners, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A heavy shelf of brow, dipping in the middle in a scowl.
    sections = [
        [h(-0.122, -0.06, 0.2), h(-0.122, -0.132, 0.18), h(-0.122, -0.08, 0.155)],
        [h(0, -0.135, 0.19), h(0, -0.207, 0.16), h(0, -0.16, 0.138)],
        [h(0.122, -0.06, 0.2), h(0.122, -0.132, 0.18), h(0.122, -0.08, 0.155)],
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brow', verts, faces, M['skin'], inside=h(0, -0.09, 0.17))

    # A flat, broad nose.
    verts = [h(0, -0.158, 0.135), h(0, -0.222, 0.092), h(0.048, -0.17, 0.084), h(-0.048, -0.17, 0.084),
             h(0, -0.182, 0.074)]
    faces = [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)]
    part('nose', verts, faces, M['skin'], inside=h(0, -0.14, 0.1))

    # A wide mouth, turned down at the corners.
    outline = [(0.1, 0.04), (0.04, 0.064), (-0.04, 0.064), (-0.1, 0.04), (-0.04, 0.048), (0.04, 0.048)]
    verts = [on(jaw, x, z, 0.005) for x, z in outline]
    part('mouth', verts, [(0, 1, 5), (1, 2, 4, 5), (2, 3, 4)], M['jerkin'], outward=V(0, -1, 0))

    # Tusks from the lower jaw, up past the lip.
    for s in (-1, 1):
        x = s * 0.088
        base = on(jaw, x, 0.03, 0.0)
        y = (base.y - HEAD.y) / HEAD_SCALE
        verts = [h(x - 0.03, y + 0.008, 0.016), h(x + 0.03, y + 0.008, 0.016), h(x, y + 0.042, 0.012),
                 h(x + s * 0.03, y - 0.05, 0.16)]
        part(f'tusk-{s}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['bone'], inside=h(x, y + 0.01, 0.05))

    # Pointed ears, out from under the helm and swept back.
    for s in (-1, 1):
        verts = [h(s * 0.142, -0.035, 0.1), h(s * 0.138, 0.06, 0.12), h(s * 0.132, 0.01, 0.17),
                 h(s * 0.28, 0.1, 0.2)]
        part(f'ear-{s}', verts, [(0, 2, 3), (2, 1, 3), (1, 0, 3)], M['skin'], inside=h(s * 0.1, 0.02, 0.13))

    helm()

    # Built square to his body, then turned on his neck to look down the arrow.
    turn = Matrix.Translation(HEAD) @ yaw(HEAD_YAW).to_4x4() @ Matrix.Translation(-HEAD)
    for obj in new_objects(before):
        obj.data.transform(turn)


def helm():
    rings = [[h(p.x, p.y, p.z) for p in ellipse(0, cy, z, rx, ry, 8, 22.5)] for z, rx, ry, cy in HELM]
    verts, faces, _ = loft(rings)
    last = len(verts) - 8
    verts.append(h(*HELM_TOP))
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    part('helm', verts, faces, M['iron'], inside=h(0, 0, 0.2))

    # A black scalp-lock through the crown of the helm, as Gorbag wears his, lying back over it in
    # a flat tail to below the rim.
    path = [h(0, 0.0, 0.335), h(0, 0.075, 0.347), h(0, 0.16, 0.292), h(0, 0.183, 0.19)]
    radii = [(0.03, 0.024), (0.048, 0.03), (0.054, 0.028), (0.046, 0.024)]
    bent_tube('scalp-lock', path, radii, M['hair'], n=4, side=V(1, 0, 0), end=h(0, 0.18, 0.07))

    # The S-rune in white metal on the flat front of the dome, three strokes laid just proud of it.
    lo, hi = rings[1], rings[2]
    plate = [(lo[5], lo[6], hi[6]), (lo[5], hi[6], hi[5])]

    def at(x, z):
        p = h(x, 0, z)
        return V(p.x, on_surface(plate, p.x, p.z) - 0.003, p.z)

    verts, faces = [], []
    for (x0, z0), (x1, z1) in pairwise(RUNE):
        dx, dz = x1 - x0, z1 - z0
        k = 0.0065 / math.hypot(dx, dz)
        nx, nz = -dz * k, dx * k  # half the stroke's width, square to it
        n = len(verts)
        verts += [at(x0 + nx, z0 + nz), at(x1 + nx, z1 + nz), at(x1 - nx, z1 - nz), at(x0 - nx, z0 - nz)]
        faces.append((n, n + 1, n + 2, n + 3))
    part('rune', verts, faces, M['white'], outward=V(0, -1, 0))


def neck():
    tube('neck', posed(V(0, 0.0, 0.88)), HEAD + V(0, 0.03, 0.1), [(0, 0.09), (1, 0.085)], M['skin'])


# The bow, the arrow and the arms -------------------------------------------------------------------

AIM_YAW = 66  # degrees to his left of straight ahead that the arrow points
ELEVATION = 3  # degrees the arrow points up
CANT = 14  # degrees the top of the bow tips to his right
NOCK = head_point(-0.19, -0.03, -0.01)  # drawn to under the corner of his jaw, below his right ear
DRAW = 0.7  # from the nock forward to the bow
REST = 0.035  # from the middle of the grip up the bow to where the arrow crosses it
BOW_RADIUS = 0.8  # drawn, the stave bends round an arc of this radius

# The stave from the lower tip to the upper: (degrees round the arc from the grip, half-thickness,
# half-width). The tips are points; the band between the middle two rings is the leather grip.
STAVE = [(-44, 0, 0), (-35, 0.02, 0.018), (-23, 0.027, 0.023), (-9, 0.034, 0.028),
         (9, 0.034, 0.028), (23, 0.027, 0.023), (35, 0.02, 0.018), (44, 0, 0)]


def bow_axes():
    """The arrow's direction, the way up the bow and the direction across the bow's plane."""
    y, e, c = (math.radians(a) for a in (AIM_YAW, ELEVATION, CANT))
    aim = V(math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e))
    right = aim.cross(V(0, 0, 1)).normalized()  # to his right of the arrow
    upright = right.cross(aim)
    up = math.cos(c) * upright + math.sin(c) * right
    return aim, up, aim.cross(up)


def grip():
    aim, up, _ = bow_axes()
    return NOCK + DRAW * aim - REST * up


def on_stave(degrees):
    """The point of the stave's middle line that many degrees round the arc from the grip, and the
    direction out of the arc there (the bow's back)."""
    aim, up, _ = bow_axes()
    a = math.radians(degrees)
    out = math.sin(a) * up + math.cos(a) * aim
    return grip() - BOW_RADIUS * aim + BOW_RADIUS * out, out


def bow():
    aim, up, side = bow_axes()
    rings = []
    for degrees, t, w in STAVE[1:-1]:
        p, out = on_stave(degrees)
        rings.append([p + 0.7 * t * out, p + w * side, p - t * out, p - w * side])
    verts, faces, bands = loft(rings)
    grip_band = len(rings) // 2 - 1
    # Pale sapwood on the back, the faces either side of the first point of each ring; the darker
    # heartwood on the belly; leather round the grip.
    face_mats = [2 if b == grip_band else (1 if k % 4 in (0, 3) else 0) for k, b in enumerate(bands)]
    for (degrees, _, _), first in ((STAVE[0], 0), (STAVE[-1], 4 * (len(rings) - 1))):
        verts.append(on_stave(degrees)[0])
        faces += [(first + i, first + (i + 1) % 4, len(verts) - 1) for i in range(4)]
        face_mats += [1, 0, 0, 1]
    path = [on_stave(d)[0] for d, _, _ in STAVE]
    part('bow', verts, faces, [M['wood'], M['sapwood'], M['leather']], face_mats,
         inside=nearest_on_polyline(path))

    # The string, from near each tip back to the nock.
    for name, degrees in (('upper', 42), ('lower', -42)):
        p, out = on_stave(degrees)
        tube(f'string-{name}', p - 0.012 * out, NOCK, [(0, 0.006), (1, 0.006)], M['feather'], n=3)

    # The arrow, drawn to the head: a long shaft, a broad iron head past the bow, grey fletching.
    head = NOCK + (DRAW + 0.035) * aim
    tube('arrow', NOCK - 0.015 * aim, head, [(0, 0.01), (1, 0.01)], M['wood'], n=3)
    ring = [head + 0.03 * side, head + 0.011 * up, head - 0.03 * side, head - 0.011 * up]
    verts = ring + [head + 0.1 * aim, head - 0.02 * aim]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('arrowhead', verts, faces, M['iron'], inside=head + 0.02 * aim)
    for k, across in enumerate((up, side)):
        a, b = NOCK + 0.02 * aim, NOCK + 0.13 * aim
        verts = [a, b, b + 0.03 * across - 0.012 * aim, a + 0.034 * across, b - 0.03 * across - 0.012 * aim,
                 a - 0.034 * across]
        part(f'vane-{k}', verts, [(0, 1, 2, 3), (0, 5, 4, 1)], M['feather'])


UPPER_ARM, FOREARM = 0.25, 0.245
SHOULDER = V(0.24, 0.0, 0.93)  # his left shoulder joint, upright and square; the right mirrors it


def arm(side, shoulder, fist, pole, fist_up, bracer):
    """A bare arm from the shoulder to a fist at `fist`, its elbow bent towards `pole`, with a bracer."""
    reach = (fist - shoulder).normalized()
    elbow = bend(shoulder, fist - 0.055 * reach, UPPER_ARM, FOREARM, pole)
    wrist = fist - 0.055 * (fist - elbow).normalized()
    tube(f'upper-arm-{side}', shoulder, elbow, [(-0.12, 0.084), (1.08, 0.068)], M['skin'])
    tube(f'forearm-{side}', elbow, wrist, [(-0.1, 0.064), (0.35, 0.075), (1.0, 0.067)],
         [M['skin'], M[bracer]], [0, 1])
    ahead = (fist - elbow).normalized()
    up = (fist_up - fist_up.dot(ahead) * ahead).normalized()
    box(f'fist-{side}', fist, [ahead, up, ahead.cross(up)], (0.05, 0.058, 0.054), M['skin'], 0.85)


def arms():
    aim, up, _ = bow_axes()
    right_of_aim = aim.cross(V(0, 0, 1)).normalized()
    left, right = posed(SHOULDER), posed(V(-SHOULDER.x, SHOULDER.y, SHOULDER.z))
    # The bow arm held out nearly straight, the elbow turned down and out of the string's way.
    arm('left', left, grip(), (left + grip()) / 2 + V(0.12, 0.08, -0.3), up, 'leather')
    # The drawing hand hooked on the string at his jaw, the elbow drawn back high behind the arrow.
    fist = NOCK - 0.03 * aim + 0.03 * right_of_aim - 0.01 * up
    arm('right', right, fist, NOCK - 0.4 * aim + V(0, 0, 0.15), up, 'iron')


def main():
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    cape()
    kilt()
    pose(new_objects(before))
    quiver()
    neck()
    head()
    bow()
    arms()
    finish('lurtz', budget=800)


main()
