"""Frodo Baggins, the Ring-bearer: Hobbit, Burglar, a 2-cost unit (docs/design.md section 5), in the
Faceted style of Gimli, the reference model (gimli.py, docs/viewer-spec.md section 4).

From the books rather than the films: a hobbit about three and a half feet tall, round in the face
and the belly, with curly brown hair and no beard, in breeches, a linen shirt and a waistcoat, and no
shoes, for his feet are big, leather-soled and thatched on top with curling brown hair. Over them
the elven cloak of Lórien, its hood thrown back, held at the throat by a clasp like a green leaf.
Sting, the elven blade that is a sword to a hobbit, is held ready, low and forward: plain bright
steel, with no glow.

Hobbit proportions: 0.88 to the top of his curls, the head a third of that, a round belly, short
sturdy legs and feet bigger than life, the clearest sign of a hobbit at game size. The team colour
is the cloak: the hood's cowl round his neck and shoulders, the hood thrown back down his back, its
dark hollow under his curls, and a short cape to above his knees. From behind, as the near side is
seen, his curls show above it, his sleeves and Sting beside it and his legs and feet below it.

    blender --background --factory-startup --python-exit-code 1 --python frodo.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys
from itertools import pairwise

import bpy
from mathutils import Matrix

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BRASS,
    EYES,
    LEATHER,
    V,
    bent_tube,
    box,
    cone,
    ellipse,
    finish,
    lean,
    loft,
    material,
    nearest_on_line,
    nearest_on_polyline,
    on_surface,
    part,
    reset,
    team_material,
    tube,
)

# Frodo's own colours (sRGB); the rest come from the kit.
SKIN = 0xE3B08C  # fair for a hobbit, warm
HAIR = 0x5C3A23  # curly brown, on his head and the tops of his feet
SHIRT = 0xD8CDB2  # unbleached linen
WAISTCOAT = 0x8E7743  # a hobbit's yellow, faded by the road
BREECHES = 0x5A5040  # brown wool
LEAF = 0x6D8A4F  # the clasp, a green leaf of Lórien
LINING = 0x434B3C  # the grey-green of an elven cloak, in the shadow inside the hood
BLADE = 0xCED3D6  # Sting: plain bright steel
MOUTH = 0x6A4434  # a dark line, not red

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.9),
        shirt=material('shirt', SHIRT, roughness=0.9),
        waistcoat=material('waistcoat', WAISTCOAT, roughness=0.85),
        breeches=material('breeches', BREECHES, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        leaf=material('leaf', LEAF, roughness=0.6),
        lining=material('lining', LINING, roughness=0.9),
        steel=material('steel', BLADE, roughness=0.4, metallic=0.1),
        brass=material('brass', BRASS, roughness=0.55, metallic=0.1),
        eyes=material('eyes', EYES, roughness=0.6),
        mouth=material('mouth', MOUTH, roughness=0.8),
    )


LEAN = 7  # degrees the body above the hips leans forward, into the fight
HIPS = V(0, 0, 0.27)  # the pivot of the lean


def lerp(a, b, t):
    return a + (b - a) * t


# Feet and legs -----------------------------------------------------------------------------------

# Feet apart, the sword-side (right) foot forward, toes turned out; the knees bent, ready to spring.
R_ANKLE, R_YAW = V(-0.105, -0.05, 0.0), -14
L_ANKLE, L_YAW = V(0.115, 0.075, 0.0), 18

# The right foot from the sole up, in its own frame: toes towards -y, the big toe's side (+x)
# inwards. Each ring runs round from the heel; the last is round the ankle, its front low over the
# instep. Big and flat and wide across the toes, bigger than life.
FOOT = [
    [(0.0, 0.075, 0.0), (0.042, 0.05, 0.0), (0.052, -0.04, 0.0), (0.062, -0.12, 0.0), (0.046, -0.2, 0.0),
     (0.02, -0.182, 0.0), (-0.006, -0.192, 0.0), (-0.04, -0.172, 0.0), (-0.064, -0.11, 0.0),
     (-0.046, 0.045, 0.0)],  # the sole
    [(0.0, 0.07, 0.045), (0.04, 0.046, 0.045), (0.05, -0.04, 0.04), (0.058, -0.116, 0.036),
     (0.042, -0.19, 0.036), (0.02, -0.168, 0.026), (-0.006, -0.18, 0.03), (-0.036, -0.16, 0.026),
     (-0.058, -0.106, 0.034), (-0.044, 0.042, 0.042)],  # over the toes, the big toe the highest
    [(0.0, 0.034, 0.1), (0.028, 0.024, 0.1), (0.035, -0.008, 0.094), (0.03, -0.042, 0.084),
     (0.018, -0.062, 0.078), (0.005, -0.066, 0.076), (-0.008, -0.065, 0.076), (-0.02, -0.057, 0.078),
     (-0.031, -0.04, 0.084), (-0.031, 0.02, 0.098)],  # round the ankle, low over the instep
]
FOOT_SCALE = 1.12  # the footprint, bigger than life
# The thatch of hair over the instep: (index round the rings, fraction from the second ring to the
# third) of each point round its edge, jagged, and its middle, raised.
THATCH = [(4.0, 0.42), (4.8, 0.3), (5.5, 0.36), (6.2, 0.28), (7.0, 0.42), (6.8, 0.7), (7.1, 0.95),
          (5.5, 0.85), (3.9, 0.95), (4.2, 0.7)]
THATCH_MIDDLE = (5.5, 0.62)


def foot(name, ankle, yaw, inner):
    """A big bare foot, its big toe towards `inner` (+1 for the right foot, -1 for the left)."""
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)

    def place(p):
        return at + turn @ V(FOOT_SCALE * inner * p[0], FOOT_SCALE * p[1], p[2])

    rings = [[place(p) for p in ring] for ring in FOOT]
    verts, faces, _ = loft(rings)
    axis = [place((0, 0.03, 0.04)), place((0, -0.14, 0.018))]
    part(name, verts, faces, M['skin'], inside=nearest_on_polyline(axis))

    # Thick curling hair on top, a jagged patch over the instep.
    def on_top(u, v, lift):
        i = int(u)
        f = u - i
        low = rings[1][i].lerp(rings[1][i + 1], f)
        high = rings[2][i].lerp(rings[2][i + 1], f)
        return low.lerp(high, v) + V(0, 0, lift)

    edge = [on_top(u, v, 0.004) for u, v in THATCH]
    middle = on_top(*THATCH_MIDDLE, 0.026)
    verts = edge + [middle]
    faces = [(i, (i + 1) % len(edge), len(edge)) for i in range(len(edge))]
    part(name + '-hair', verts, faces, M['hair'], inside=middle - V(0, 0, 0.05))


R_HIP, L_HIP = V(-0.078, 0.0, 0.27), V(0.078, 0.01, 0.27)
R_KNEE, L_KNEE = V(-0.1, -0.085, 0.19), V(0.108, 0.035, 0.18)
ANKLE_Z = 0.06  # where the shin ends, inside the foot


def leg(side, hip, knee, ankle):
    ankle = V(ankle.x, ankle.y, ANKLE_Z)
    shin = (ankle - knee).normalized()
    # Breeches to below the knee, ending in a cuff wider than the bare shin.
    bent_tube(f'thigh-{side}', [hip, knee, knee + 0.015 * shin], [0.074, 0.062, 0.06], M['breeches'])
    tube(f'shin-{side}', knee, ankle, [(0, 0.044), (1, 0.034)], M['skin'])


def legs():
    leg('right', R_HIP, R_KNEE, R_ANKLE)
    leg('left', L_HIP, L_KNEE, L_ANKLE)
    foot('foot-right', R_ANKLE, R_YAW, 1)
    foot('foot-left', L_ANKLE, L_YAW, -1)


# Body --------------------------------------------------------------------------------------------

# Octagons from the seat of his breeches to the shoulders: z, half-width, half-depth and centre y.
# The belly is the widest and stands out in front, over the belt.
TORSO = [
    (0.215, 0.128, 0.105, 0.015),  # the seat of his breeches
    (0.285, 0.152, 0.128, 0.004),  # the belt's lower edge
    (0.325, 0.163, 0.143, -0.01),  # the belt's upper edge, under the belly
    (0.405, 0.18, 0.168, -0.036),  # the round belly
    (0.475, 0.158, 0.132, -0.014),  # chest
    (0.53, 0.128, 0.098, 0.0),  # shoulders, open above under the cowl
]
TORSO_BANDS = [0, 1, 2, 2, 2]  # breeches, belt, waistcoat


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    mats = [M['breeches'], M['leather'], M['waistcoat']]
    part('torso', verts, faces, mats, face_mats, inside=lambda c: V(0, -0.01, c.z))
    tube('neck', V(0, 0.005, 0.55), V(0, -0.015, 0.64), [(0, 0.048), (1, 0.046)], M['skin'])


# Head --------------------------------------------------------------------------------------------

# Octagons with a corner at the front, from under the chin to the crown: z, half-width, half-depth
# and centre y. A round face with full cheeks, widest below the eyes.
HEAD = [
    (0.6, 0.05, 0.045, -0.052),  # under the chin
    (0.632, 0.098, 0.092, -0.03),  # the jaw and the mouth
    (0.69, 0.127, 0.113, -0.018),  # round cheeks, the widest
    (0.752, 0.124, 0.112, -0.012),  # the eyes and the temples
    (0.81, 0.108, 0.1, -0.008),  # the forehead, under the curls, open above
]


def head():
    rings = [ellipse(0, cy, z, rx, ry, 8, 0) for z, rx, ry, cy in HEAD]
    verts, faces, _ = loft(rings)
    faces.append(tuple(range(8)))  # under the chin
    part('head', verts, faces, M['skin'], inside=lambda c: V(0, -0.02, min(max(c.z, 0.65), 0.8)))

    # The faces either side of the front corner, from the jaw to the brow: (index round the octagon,
    # ring) corners of each, as triangles, for laying the eyes and the mouth on.
    def plane(a, b, low, high):
        p, q, r, s = rings[low][a], rings[low][b], rings[high][b], rings[high][a]
        return [(p, q, r), (p, r, s)]

    cheeks = plane(5, 6, 2, 3) + plane(6, 7, 2, 3)
    jaw = plane(5, 6, 1, 2) + plane(6, 7, 1, 2)

    # Big round eyes, a little wide apart, just proud of the face.
    for s in (-1, 1):
        x, z = s * 0.045, 0.729
        corners = [(x - 0.017, z), (x - 0.009, z + 0.015), (x + 0.009, z + 0.015), (x + 0.017, z),
                   (x + 0.009, z - 0.014), (x - 0.009, z - 0.014)]
        verts = [V(u, on_surface(cheeks, u, w) - 0.005, w) for u, w in corners]
        part(f'eye-{s}', verts, [(0, 1, 2, 3, 4, 5)], M['eyes'], outward=V(0, -1, 0))

    # A small smile under the nose, a thin chevron.
    corners = [(-0.034, 0.668), (0, 0.656), (0.034, 0.668), (0, 0.646)]
    verts = [V(x, on_surface(jaw, x, z) - 0.004, z) for x, z in corners]
    part('mouth', verts, [(0, 3, 1), (1, 3, 2)], M['mouth'], outward=V(0, -1, 0))

    # A short, round nose.
    top, tip, under = V(0, -0.127, 0.724), V(0, -0.15, 0.699), V(0, -0.133, 0.683)
    left, right = V(0.026, -0.121, 0.697), V(-0.026, -0.121, 0.697)
    verts = [top, left, under, right, tip]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.1, 0.7))

    # Brows, the hair's colour, under the fringe.
    for s in (-1, 1):
        verts = [V(s * 0.024, 0, 0.768), V(s * 0.07, 0, 0.771), V(s * 0.068, 0, 0.762), V(s * 0.026, 0, 0.76)]
        verts = [V(p.x, on_surface(cheeks + plane(5, 6, 3, 4) + plane(6, 7, 3, 4), p.x, p.z) - 0.006, p.z)
                 for p in verts]
        part(f'brow-{s}', verts, [(0, 1, 2, 3)], M['hair'], outward=V(0, -1, 0.2))

    # Ears a little pointed, through the curls at the sides.
    for s in (-1, 1):
        base = [V(s * 0.118, -0.018, 0.686), V(s * 0.12, 0.028, 0.698), V(s * 0.115, 0.014, 0.75),
                V(s * 0.118, -0.022, 0.735)]
        tip = V(s * 0.158, 0.026, 0.762)
        verts = base + [tip]
        faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
        part(f'ear-{s}', verts, faces, M['skin'], inside=V(s * 0.09, 0.0, 0.72))


def head_ring(z):
    """The head's half-width, half-depth and centre y at height z."""
    for (z0, *low), (z1, *high) in pairwise(HEAD):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return [lerp(a, b, t) for a, b in zip(low, high)]
    raise ValueError(z)


# The curls: a mop round the head, from a hairline that is low at the nape, lifts over the ears and
# comes down in a fringe over the forehead: its height at angles from his left (+X) round the back.
HAIRLINE = [(0, 0.765), (45, 0.67), (90, 0.628), (135, 0.67), (180, 0.765), (225, 0.775), (270, 0.79),
            (315, 0.775), (360, 0.765)]
HAIR_POINTS = 16
CURL = 0.018  # how far each curl hangs below the hairline between them
MOP = V(0, -0.006, 0.728), (0.15, 0.144, 0.15)  # the ellipsoid the curls fill: centre and radii
BUMP = 0.2  # how far each other point of the mop stands out, staggered ring to ring, each a curl


def hairline(degrees):
    for (a0, z0), (a1, z1) in pairwise(HAIRLINE):
        if a0 <= degrees <= a1:
            return lerp(z0, z1, (degrees - a0) / (a1 - a0))
    raise ValueError(degrees)


def hair():
    centre, (rx, ry, rz) = MOP
    n = HAIR_POINTS
    rings = [[], [], [], []]
    high = set()  # the points that stand out
    for i in range(n):
        a = math.tau * i / n
        cos, sin = math.cos(a), math.sin(a)
        z = hairline(360 * i / n)
        curl = i % 2 == 1
        # The hairline itself, tucked into the skin, each curl hanging lower than the points between.
        z0 = z - CURL if curl else z + 0.006
        hx, hy, hc = head_ring(z0)
        rings[0].append(V(0.94 * hx * cos, hc + 0.94 * hy * sin, z0))
        # Three rings up the mop to the crown, by angle above the centre; the lowest one's curls hang
        # down over the hairline.
        low = math.asin((z + 0.028 - centre.z) / rz)
        for k, t in enumerate((0.0, 0.4, 0.75)):
            up = low + (math.pi / 2 - low) * t
            out = (i + k) % 2 == 1
            if out:
                high.add((k + 1) * n + i)
            r = math.cos(up) * (1 + BUMP * out)
            z = rz * math.sin(up) * (1 + 0.5 * BUMP * out) - (0.022 if out and k == 0 else 0.0)
            rings[k + 1].append(centre + V(rx * r * cos, ry * r * sin, z))
    verts, quads, _ = loft(rings)
    # Each quad is split between its two low corners, so every high point is a bump of its own.
    faces = []
    for a, b, c, d in quads:
        if a in high or c in high:
            faces += [(a, b, d), (b, c, d)]
        else:
            faces += [(a, b, c), (a, c, d)]
    crown = len(verts)
    verts.append(centre + V(0, 0, rz))
    last = 3 * n
    faces += [(last + i, last + (i + 1) % n, crown) for i in range(n)]
    part('hair', verts, faces, M['hair'], inside=centre)


# Arms --------------------------------------------------------------------------------------------

# The right arm holds Sting low and forward; the left is out to the side, for balance.
R_SHOULDER, R_ELBOW, R_WRIST = V(-0.138, 0.0, 0.495), V(-0.212, -0.035, 0.39), V(-0.205, -0.17, 0.33)
L_SHOULDER, L_ELBOW, L_WRIST = V(0.138, 0.0, 0.495), V(0.235, -0.012, 0.4), V(0.3, -0.115, 0.415)


def arm(side, shoulder, elbow, wrist, up):
    """A full linen sleeve gathered at the wrist, and a big fist; `up` is where its thumb points."""
    bent_tube(f'sleeve-{side}', [shoulder, elbow, wrist], [0.05, 0.048, 0.04], M['shirt'])
    ahead = (wrist - elbow).normalized()
    up = (up - up.dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    box(f'fist-{side}', wrist + 0.03 * ahead, [ahead, up, across], (0.038, 0.04, 0.042), M['skin'], 0.86)
    return wrist + 0.03 * ahead


# Sting, in his right hand ------------------------------------------------------------------------

STING = V(-0.45, -0.84, 0.3).normalized()  # forward, out to his right and a little up
STING_LENGTH = 0.33  # from the guard to the point
STING_ROLL = 65  # degrees the flat is turned from upright towards level, to face the sky
# Stations along the blade: fraction of its length, half-width and half-thickness at the ridge.
STING_STATIONS = [(0.0, 0.026, 0.009), (0.55, 0.022, 0.008), (0.86, 0.013, 0.006)]


def sting():
    fist = arm('right', R_SHOULDER, R_ELBOW, R_WRIST, STING)
    level = V(STING.y, -STING.x, 0).normalized()
    upright = level.cross(STING).normalized()
    if upright.z < 0:
        upright = -upright
    roll = math.radians(STING_ROLL)
    width = math.cos(roll) * upright + math.sin(roll) * level
    flat = STING.cross(width).normalized()

    guard = fist + 0.055 * STING
    rings = []
    for t, w, th in STING_STATIONS:
        c = guard + t * STING_LENGTH * STING
        rings.append([c + w * width, c + th * flat, c - w * width, c - th * flat])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * 4
    verts.append(guard + STING_LENGTH * STING)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    part('blade', verts, faces, M['steel'], inside=nearest_on_line(guard, guard + STING))

    # A plain cross-guard, a leather grip and a pommel.
    box('guard', guard, [STING, width, flat], (0.011, 0.058, 0.016), M['brass'], 0.8)
    end = fist - 0.06 * STING
    tube('grip', end, guard, [(0, 0.015), (1, 0.015)], M['leather'], n=4, phase=45)
    cone('pommel', end, end - 0.032 * STING, 0.024, M['brass'], n=4, phase=45, back=end + 0.012 * STING)


# Team colour: the elven cloak, its hood thrown back -------------------------------------------------


def cowl():
    # The hood's cowl round his neck and over his shoulders, eight points round from his left (+X);
    # it rises behind the neck and dips in front to the clasp.
    neck_z = [0.6, 0.612, 0.62, 0.612, 0.6, 0.585, 0.572, 0.585]
    neck = ellipse(0, 0.012, 0, 0.088, 0.082, 8, 0, neck_z)
    dome = ellipse(0, 0.014, 0, 0.165, 0.135, 8, 0, [z - 0.035 for z in neck_z])
    shoulder_z = [0.515, 0.535, 0.545, 0.535, 0.515, 0.5, 0.495, 0.5]
    shoulder = ellipse(0, 0.016, 0, 0.22, 0.168, 8, 0, shoulder_z)
    hem = ellipse(0, 0.016, 0, 0.21, 0.16, 8, 0, [z - 0.04 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('cowl', verts, faces, M['team'], inside=V(0, 0.015, 0.45))

    # The clasp at his throat, a leaf, its two halves folded along the midrib.
    y = -0.09
    verts = [V(0, y, 0.585), V(0.022, y, 0.562), V(0, y, 0.538), V(-0.022, y, 0.562), V(0, y - 0.008, 0.562)]
    part('clasp', verts, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], M['leaf'], inside=V(0, 0, 0.56))


# The hood, thrown back: its opening lies on his upper back under his curls, the lining showing
# inside, and below it the hood hangs in a bag to a point. The rim from the nape round to his left
# (+X), the bottom and his right.
HOOD_RIM = [V(0, 0.132, 0.6), V(0.064, 0.144, 0.592), V(0.104, 0.186, 0.566), V(0.08, 0.228, 0.542),
            V(0, 0.246, 0.532), V(-0.08, 0.228, 0.542), V(-0.104, 0.186, 0.566), V(-0.064, 0.144, 0.592)]
HOOD_HOLLOW = V(0, 0.192, 0.548)  # the bottom of the hollow inside, just clear of the cowl
HOOD_FLARE = 1.45, 0.03, -0.09  # the bag below the opening: how much wider, further back and lower
HOOD_POINT = V(0, 0.236, 0.33)


def hood():
    n = len(HOOD_RIM)
    wide, back, down = HOOD_FLARE
    bag = [V(wide * p.x, p.y + back, p.z + down) for p in HOOD_RIM]
    verts, faces, _ = loft([HOOD_RIM, bag])
    verts.append(HOOD_POINT)
    faces += [(n + i, n + (i + 1) % n, 2 * n) for i in range(n)]
    part('hood', verts, faces, M['team'], inside=V(0, 0.15, 0.47))
    verts = HOOD_RIM + [HOOD_HOLLOW]
    part('hood-lining', verts, [(i, (i + 1) % n, n) for i in range(n)], M['lining'], outward=V(0, 0.5, 0.87))


# The cape from under the cowl to above his knees, behind his arms, in five folds, the hem lowest in
# the middle of his back; short, so his legs show below it from behind and above. Each level: z in
# the middle and at the edges, half-width, half-depth, centre y, how far short of the sides it stops
# (degrees) and how deep the folds are.
CAPE = [
    (0.53, 0.51, 0.2, 0.15, 0.02, -8, 0.0),
    (0.41, 0.42, 0.206, 0.168, 0.022, 4, 0.015),
    (0.275, 0.3, 0.214, 0.172, 0.026, 10, 0.026),
]
CAPE_POINTS = 11


def cape():
    rings = []
    for middle, edge, rx, ry, cy, spread, fold in CAPE:
        ring = []
        for i in range(CAPE_POINTS):
            a = math.radians(spread + (180 - 2 * spread) * i / (CAPE_POINTS - 1))
            k = 1 + (fold / ry if i % 2 else 0)
            z = edge + (middle - edge) * math.sin(a) ** 2
            ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    part('cape', verts, faces, M['team'], inside=lambda c: V(0, 0, c.z))


def main():
    reset()
    make_materials()
    legs()
    lower = set(bpy.context.scene.objects)
    torso()
    head()
    hair()
    cowl()
    hood()
    cape()
    arm('left', L_SHOULDER, L_ELBOW, L_WRIST, V(0, 0, 1))
    sting()
    lean([o for o in bpy.context.scene.objects if o not in lower], HIPS, LEAN)
    finish('frodo')


main()
