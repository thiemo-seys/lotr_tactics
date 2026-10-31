"""Meriadoc Brandybuck, Merry, of Buckland: Hobbit, Burglar, a 1-cost unit (docs/design.md section
5), in the Faceted style of Gimli, the reference model (gimli.py, docs/viewer-spec.md section 4), and
of Frodo's family (frodo.py).

From the books rather than the films: a sensible, bold hobbit of Buckland, with chestnut curls and
no beard, in breeches and a jerkin over a linen shirt, and no shoes, for his feet are big and
thatched on top with curling hair. His blade is the one from the Barrow-downs, made by the Men of
Westernesse: long and leaf-shaped, damasked with serpent-forms in red and gold, kept here to steel
with gold inlay and a gold hilt, so that nothing but the team colour is red. It is the blade that
wounds the Witch-king. He holds it low and forward in a knife-fighter's crouch, his feet wide, his
left foot forward and his left hand up before him as a guard.

Hobbit proportions, as Frodo's: 0.88 standing and lower in the crouch, the head a third of the
height, a round belly and feet bigger than life. Told apart from the other hobbits by his chestnut
hair, his green Buckland jerkin, the long leaf-shaped blade and the low, wide crouch. The team colour
is his short cloak, thrown back off his shoulders to free his arms, with its hood bunched on his
upper back under his curls, and his scarf, wound round his neck with its ends down his chest. From
behind, as the near side is seen, his curls show above the cloak, the long blade beside it and his
green jerkin, his legs and his feet below it.

    blender --background --factory-startup --python-exit-code 1 --python merry.py [-- <out.glb>]

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

# Merry's own colours (sRGB); the rest come from the kit.
SKIN = 0xE0AA85  # a hobbit's, warm
HAIR = 0x8A522E  # chestnut, warmer and lighter than Frodo's dark brown
SHIRT = 0xD8CDB2  # unbleached linen
JERKIN = 0x5B6A3E  # Buckland green, olive rather than bottle green
BREECHES = 0x6B5843  # brown wool
GOLD = 0xC49A45  # the barrow-blade's hilt and inlay
BLADE = 0xCED3D6  # bright steel, with no glow
MOUTH = 0x6A4434  # a dark line, not red

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.9),
        shirt=material('shirt', SHIRT, roughness=0.9),
        jerkin=material('jerkin', JERKIN, roughness=0.9),
        breeches=material('breeches', BREECHES, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        steel=material('steel', BLADE, roughness=0.4, metallic=0.1),
        gold=material('gold', GOLD, roughness=0.5, metallic=0.1),
        eyes=material('eyes', EYES, roughness=0.6),
        mouth=material('mouth', MOUTH, roughness=0.8),
    )


LEAN = 20  # degrees the body above the hips leans forward, into the crouch
HIPS = V(0, 0, 0.18)  # the pivot of the lean, lower than Frodo's: his knees are deeply bent
DROP = 0.035  # how far the upper body, built for hips at 0.215, comes down to them
NOD = 15  # degrees the head tips back against the lean, to keep his eyes on the enemy
NECK = V(0, -0.005, 0.55)  # the pivot of the nod, upright
SWING = 10  # degrees the cloak hangs back from the collar, as he leans


def lerp(a, b, t):
    return a + (b - a) * t


def tipped(point, pivot, degrees):
    """Where lean() carries a point."""
    tip = Matrix.Rotation(math.radians(degrees), 4, 'X')
    return (Matrix.Translation(pivot) @ tip @ Matrix.Translation(-pivot)) @ point


def leaned(point):
    """Where the drop and the lean carry a point of the upper body built upright."""
    return tipped(point - V(0, 0, DROP), HIPS, LEAN)


# Feet and legs -----------------------------------------------------------------------------------

# Feet wide, the left foot forward and the right back, toes turned out: a low, wide crouch.
L_ANKLE, L_YAW = V(0.175, -0.12, 0.0), 24
R_ANKLE, R_YAW = V(-0.19, 0.13, 0.0), -30

# The right foot from the sole up, in its own frame, as Frodo's: toes towards -y, the big toe's side
# (+x) inwards. Each ring runs round from the heel; the last is round the ankle.
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
    # A lid over the ankle ring, round the shin: in the crouch the shin comes in at a slant and
    # would leave the top of the foot open.
    top = len(verts) - len(FOOT[-1])
    faces.append(tuple(range(top, len(verts))))
    axis = [place((0, 0.03, 0.04)), place((0, -0.14, 0.018))]
    part(name, verts, faces, M['skin'], inside=nearest_on_polyline(axis))

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


L_HIP, R_HIP = V(0.08, -0.005, 0.18), V(-0.08, 0.01, 0.18)
THIGH, SHIN = 0.13, 0.15  # lengths, from the hip to the knee and the knee to the ankle
ANKLE_Z = 0.06  # where the shin ends, inside the foot


def knee(hip, ankle, out):
    """Where the knee bends to, with the leg's lengths, towards `out`."""
    d = ankle - hip
    length = d.length
    d = d.normalized()
    a = (THIGH**2 - SHIN**2 + length**2) / (2 * length)
    h = math.sqrt(max(THIGH**2 - a**2, 0.0))
    out = out - out.dot(d) * d
    return hip + a * d + h * out.normalized()


def leg(side, hip, ankle, out):
    ankle = V(ankle.x, ankle.y, ANKLE_Z)
    k = knee(hip, ankle, out)
    shin = (ankle - k).normalized()
    # Breeches to below the knee, ending in a cuff wider than the bare shin.
    bent_tube(f'thigh-{side}', [hip, k, k + 0.015 * shin], [0.074, 0.062, 0.06], M['breeches'])
    tube(f'shin-{side}', k, ankle, [(0, 0.044), (1, 0.034)], M['skin'])


def legs():
    leg('left', L_HIP, L_ANKLE, V(0.5, -1, 0))
    leg('right', R_HIP, R_ANKLE, V(-0.7, -1, 0))
    foot('foot-left', L_ANKLE, L_YAW, -1)
    foot('foot-right', R_ANKLE, R_YAW, 1)


# Body --------------------------------------------------------------------------------------------

# Octagons from the seat to the shoulders: z, half-width, half-depth and centre y. The jerkin's
# skirt flares over his hips below the belt, and the belly is the widest, standing out in front.
TORSO = [
    (0.15, 0.13, 0.11, 0.02),  # the seat
    (0.205, 0.168, 0.142, 0.004),  # the jerkin's skirt, flared over his hips
    (0.25, 0.155, 0.132, -0.002),  # the belt's lower edge
    (0.29, 0.166, 0.146, -0.012),  # the belt's upper edge, under the belly
    (0.365, 0.182, 0.168, -0.036),  # the round belly
    (0.43, 0.16, 0.134, -0.014),  # chest
    (0.485, 0.13, 0.1, 0.0),  # shoulders, open above under the scarf
]
TORSO_BANDS = [0, 0, 1, 0, 0, 0]  # jerkin, belt


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    part('torso', verts, faces, [M['jerkin'], M['leather']], face_mats,
         inside=lambda c: V(0, -0.01, c.z))
    tube('neck', V(0, 0.005, 0.47), V(0, -0.015, 0.58), [(0, 0.048), (1, 0.046)], M['skin'])
    # The belt buckle, its face smaller than its back so the edges read as a bevel.
    axes = [V(0, -1, -0.15), V(1, 0, 0), V(0, -0.15, 1)]
    box('buckle', V(0, -0.152, 0.27), axes, (0.012, 0.03, 0.022), M['gold'], 0.75)


# Head --------------------------------------------------------------------------------------------

# Octagons with a corner at the front, from under the chin to the crown: z, half-width, half-depth
# and centre y. Frodo's round face, a little broader in the jaw.
HEAD = [
    (0.552, 0.052, 0.046, -0.054),  # under the chin
    (0.585, 0.103, 0.094, -0.031),  # the jaw and the mouth
    (0.643, 0.128, 0.114, -0.018),  # round cheeks, the widest
    (0.705, 0.125, 0.112, -0.012),  # the eyes and the temples
    (0.763, 0.108, 0.1, -0.008),  # the forehead, under the curls, open above
]


def head():
    rings = [ellipse(0, cy, z, rx, ry, 8, 0) for z, rx, ry, cy in HEAD]
    verts, faces, _ = loft(rings)
    faces.append(tuple(range(8)))  # under the chin
    made = [part('head', verts, faces, M['skin'],
                 inside=lambda c: V(0, -0.02, min(max(c.z, 0.6), 0.75)))]

    def plane(a, b, low, high):
        p, q, r, s = rings[low][a], rings[low][b], rings[high][b], rings[high][a]
        return [(p, q, r), (p, r, s)]

    cheeks = plane(5, 6, 2, 3) + plane(6, 7, 2, 3)
    jaw = plane(5, 6, 1, 2) + plane(6, 7, 1, 2)
    brow = cheeks + plane(5, 6, 3, 4) + plane(6, 7, 3, 4)

    # Big round eyes, a little wide apart, just proud of the face.
    for s in (-1, 1):
        x, z = s * 0.045, 0.684
        corners = [(x - 0.017, z), (x - 0.009, z + 0.015), (x + 0.009, z + 0.015), (x + 0.017, z),
                   (x + 0.009, z - 0.014), (x - 0.009, z - 0.014)]
        verts = [V(u, on_surface(cheeks, u, w) - 0.005, w) for u, w in corners]
        made.append(part(f'eye-{s}', verts, [(0, 1, 2, 3, 4, 5)], M['eyes'], outward=V(0, -1, 0)))

    # A set mouth, a little crooked: bold, not smiling.
    corners = [(-0.034, 0.623), (0.0, 0.618), (0.036, 0.627), (0.0, 0.61)]
    verts = [V(x, on_surface(jaw, x, z) - 0.004, z) for x, z in corners]
    made.append(part('mouth', verts, [(0, 3, 1), (1, 3, 2)], M['mouth'], outward=V(0, -1, 0)))

    # A short, round nose.
    top, tip, under = V(0, -0.127, 0.679), V(0, -0.152, 0.654), V(0, -0.133, 0.638)
    left, right = V(0.027, -0.121, 0.652), V(-0.027, -0.121, 0.652)
    verts = [top, left, under, right, tip]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
    made.append(part('nose', verts, faces, M['skin'], inside=V(0, -0.1, 0.655)))

    # Brows the hair's colour, low at the inner ends: he is set on the fight.
    for s in (-1, 1):
        outline = [V(s * 0.022, 0, 0.713), V(s * 0.072, 0, 0.73), V(s * 0.07, 0, 0.72),
                   V(s * 0.024, 0, 0.703)]
        verts = [V(p.x, on_surface(brow, p.x, p.z) - 0.006, p.z) for p in outline]
        made.append(part(f'brow-{s}', verts, [(0, 1, 2, 3)], M['hair'], outward=V(0, -1, 0.2)))

    # Ears a little pointed, through the curls at the sides.
    for s in (-1, 1):
        base = [V(s * 0.118, -0.018, 0.641), V(s * 0.12, 0.028, 0.653), V(s * 0.115, 0.014, 0.705),
                V(s * 0.118, -0.022, 0.69)]
        tip = V(s * 0.158, 0.026, 0.717)
        verts = base + [tip]
        faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
        made.append(part(f'ear-{s}', verts, faces, M['skin'], inside=V(s * 0.09, 0.0, 0.675)))
    return made


def head_ring(z):
    """The head's half-width, half-depth and centre y at height z."""
    for (z0, *low), (z1, *high) in pairwise(HEAD):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return [lerp(a, b, t) for a, b in zip(low, high)]
    raise ValueError(z)


# The curls: a thick mop of chestnut, fuller than Frodo's, from a hairline low at the nape, over the
# ears and in a fringe over his brow: its height at angles from his left (+X) round the back.
HAIRLINE = [(0, 0.712), (45, 0.615), (90, 0.572), (135, 0.615), (180, 0.712), (225, 0.735), (270, 0.752),
            (315, 0.735), (360, 0.712)]
HAIR_POINTS = 16
CURL = 0.02  # how far each curl hangs below the hairline between them
MOP = V(0, -0.01, 0.684), (0.166, 0.16, 0.156)  # the ellipsoid the curls fill: centre and radii
BUMP = 0.23  # how far each other point of the mop stands out, staggered ring to ring, each a curl


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
    return part('hair', verts, faces, M['hair'], inside=centre)


# Team colour: the scarf, the short cloak and its hood ----------------------------------------------


def scarf():
    # Wound thick round his neck, over the shoulders and snug under the chin.
    rings = [
        ellipse(0, 0.0, 0.462, 0.145, 0.118, 8, 22.5),
        ellipse(0, -0.008, 0.505, 0.122, 0.108, 8, 22.5),
        ellipse(0, -0.014, 0.548, 0.058, 0.055, 8, 22.5),
    ]
    verts, faces, _ = loft(rings)
    part('scarf', verts, faces, M['team'], inside=lambda c: V(0, -0.006, c.z))
    # Its ends, out of the wraps at his throat: the long one down over his chest and belly on his
    # left, widening, and a short one on his right.
    ends = [
        ([V(0.045, -0.1, 0.5), V(0.062, -0.16, 0.44), V(0.072, -0.215, 0.37), V(0.078, -0.226, 0.295)],
         [(0.034, 0.011), (0.036, 0.011), (0.039, 0.011), (0.042, 0.01)]),
        ([V(-0.02, -0.11, 0.5), V(-0.035, -0.165, 0.445), V(-0.04, -0.19, 0.4)],
         [(0.03, 0.01), (0.032, 0.01), (0.034, 0.009)]),
    ]
    for k, (path, radii) in enumerate(ends):
        bent_tube(f'scarf-end-{k}', path, radii, M['team'], n=4, phase=45, side=V(1, 0, 0), end='cap')


# The cloak, thrown back off his shoulders to free his arms: from the collar round the back of his
# neck to the small of his back, behind his arms, in five folds. Each level: z in the middle and at
# the edges, half-width, half-depth, centre y, how far short of the sides it stops (degrees) and how
# deep the folds are.
CLOAK = [
    (0.505, 0.46, 0.15, 0.13, 0.025, 12, 0.0),
    (0.415, 0.4, 0.205, 0.168, 0.04, 5, 0.015),
    (0.315, 0.345, 0.218, 0.178, 0.05, 8, 0.028),
]
CLOAK_POINTS = 11
COLLAR = V(0, 0.155, 0.505)  # the back of the collar, which the cloak hangs from


def cloak():
    rings = []
    for middle, edge, rx, ry, cy, spread, fold in CLOAK:
        ring = []
        for i in range(CLOAK_POINTS):
            a = math.radians(spread + (180 - 2 * spread) * i / (CLOAK_POINTS - 1))
            k = 1 + (fold / ry if i % 2 else 0)
            z = edge + (middle - edge) * math.sin(a) ** 2
            ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    made = [part('cloak', verts, faces, M['team'], inside=lambda c: V(0, 0, c.z))]

    # The hood thrown back, bunched on his upper back under the collar and ending in a point.
    a, g, b = V(-0.1, 0.13, 0.5), V(0, 0.172, 0.516), V(0.1, 0.13, 0.5)
    c, e, d = V(-0.125, 0.163, 0.435), V(0, 0.232, 0.448), V(0.125, 0.163, 0.435)
    f = V(0, 0.272, 0.335)
    verts = [a, g, b, c, e, d, f]
    faces = [(0, 1, 4, 3), (1, 2, 5, 4), (3, 4, 6), (4, 5, 6)]
    made.append(part('hood', verts, faces, M['team'], inside=V(0, 0.12, 0.42)))
    return made


# Arms, built where the lean has carried his shoulders ------------------------------------------------

SHOULDER = 0.135, 0.45  # half the width between the shoulders, and their height, upright
# Where the elbows and wrists are, after the lean. The right hand holds the blade low and forward,
# out by his hip; the left is up before him, a guard.
R_ELBOW, R_WRIST = V(-0.235, -0.08, 0.285), V(-0.24, -0.21, 0.23)
L_ELBOW, L_WRIST = V(0.225, -0.15, 0.3), V(0.175, -0.275, 0.38)


def arm(side, shoulder, elbow, wrist, up):
    """A full linen sleeve gathered at the wrist, and a big fist; `up` is where its thumb points."""
    bent_tube(f'sleeve-{side}', [shoulder, elbow, wrist], [0.05, 0.048, 0.04], M['shirt'])
    ahead = (wrist - elbow).normalized()
    up = (up - up.dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    box(f'fist-{side}', wrist + 0.03 * ahead, [ahead, up, across], (0.038, 0.04, 0.042), M['skin'], 0.86)
    return wrist + 0.03 * ahead


# The barrow-blade, in his right hand -------------------------------------------------------------

BLADE_DIR = V(-0.66, -0.66, 0.36).normalized()  # forward and out to his right, a little up
BLADE_LENGTH = 0.5  # from the guard to the point, longer than Sting
BLADE_ROLL = 65  # degrees the flat is turned from upright towards level, to face the sky
# The leaf, at stations along the blade: fraction of its length, half-width and half-thickness at
# the ridge. Narrow at the hilt, widest past the middle, drawn to a long point.
BLADE_STATIONS = [(0.0, 0.019, 0.008), (0.28, 0.03, 0.009), (0.58, 0.044, 0.01), (0.82, 0.031, 0.008)]
INLAY = (0.04, 0.26, 0.5), 0.012  # the gold damask on the ridge: start, widest, end; half-width


def station(t):
    """The blade's half-width and half-thickness at the fraction t of its length."""
    for (t0, w0, h0), (t1, w1, h1) in pairwise(BLADE_STATIONS):
        if t0 <= t <= t1:
            f = (t - t0) / (t1 - t0)
            return lerp(w0, w1, f), lerp(h0, h1, f)
    raise ValueError(t)


def blade():
    x, z = SHOULDER
    shoulder = leaned(V(-x, 0.0, z))
    fist = arm('right', shoulder, R_ELBOW, R_WRIST, BLADE_DIR)
    level = V(BLADE_DIR.y, -BLADE_DIR.x, 0).normalized()
    upright = level.cross(BLADE_DIR).normalized()
    if upright.z < 0:
        upright = -upright
    roll = math.radians(BLADE_ROLL)
    width = math.cos(roll) * upright + math.sin(roll) * level
    flat = BLADE_DIR.cross(width).normalized()
    if flat.z < 0:
        flat = -flat

    guard = fist + 0.055 * BLADE_DIR
    rings = []
    for t, w, th in BLADE_STATIONS:
        c = guard + t * BLADE_LENGTH * BLADE_DIR
        rings.append([c + w * width, c + th * flat, c - w * width, c - th * flat])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * 4
    verts.append(guard + BLADE_LENGTH * BLADE_DIR)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    part('blade', verts, faces, M['steel'], inside=nearest_on_line(guard, guard + BLADE_DIR))

    # The gold damask down the ridge on both faces, a long diamond laid just proud of the steel.
    (t0, t1, t2), half = INLAY

    def on_blade(t, across, side):
        # A point on the face `side` (+1 the sky's, -1 the ground's), `across` of the way from the
        # ridge to an edge, just proud of the steel.
        w, th = station(t)
        c = guard + t * BLADE_LENGTH * BLADE_DIR
        return c + across * w * width + side * ((1 - abs(across)) * th + 0.0025) * flat

    for side in (1, -1):
        across = half / station(t1)[0]
        verts = [on_blade(t0, 0, side), on_blade(t1, across, side), on_blade(t2, 0, side),
                 on_blade(t1, -across, side)]
        faces = [(0, 1, 2), (0, 2, 3)]
        part(f'inlay-{side}', verts, faces, M['gold'], outward=side * flat)

    # A gold cross-guard, a leather grip and a gold pommel.
    box('guard', guard, [BLADE_DIR, width, flat], (0.012, 0.06, 0.017), M['gold'], 0.8)
    end = fist - 0.06 * BLADE_DIR
    tube('grip', end, guard, [(0, 0.015), (1, 0.015)], M['leather'], n=4, phase=45)
    cone('pommel', end, end - 0.034 * BLADE_DIR, 0.025, M['gold'], n=4, phase=45,
         back=end + 0.012 * BLADE_DIR)


def guard_arm():
    x, z = SHOULDER
    arm('left', leaned(V(x, 0.0, z)), L_ELBOW, L_WRIST, V(0, 0, 1))


def main():
    reset()
    make_materials()
    legs()
    lower = set(bpy.context.scene.objects)
    torso()
    lean(head() + [hair()], NECK, -NOD)
    scarf()
    hung = cloak()
    upper = [o for o in bpy.context.scene.objects if o not in lower]
    for o in upper:
        o.data.transform(Matrix.Translation(V(0, 0, -DROP)))
    lean(upper, HIPS, LEAN)
    lean(hung, leaned(COLLAR), -SWING)
    blade()
    guard_arm()
    finish('merry')


main()
