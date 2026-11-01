"""Peregrin Took, Pippin: Hobbit, Archer, a 1-cost unit (docs/design.md section 5), in the Faceted
style of Gimli, the reference model (gimli.py, docs/viewer-spec.md section 4), and of Frodo's family
(frodo.py): the same build, round face, curls and big bare feet.

From the books rather than the films: the youngest of the four hobbits, quick and curious, slimmer
than the others, with light curls the colour of straw and no beard, in breeches and a dark jerkin
over a linen shirt, and no shoes, for his feet are big and thatched on top with curling hair. Hobbits
are good shots with a stone, and he has no bow: his ranged weapon is a stone cocked in his right hand
beside his head, ready to throw, with a bulging pouch of more at his right hip. He stands as a
thrower winds up, his left foot forward and his throwing shoulder turned back, grinning.

Hobbit proportions, as Frodo's but slimmer: about 0.86 to the top of his curls, the head a third of
that, a small belly, and feet bigger than life. Told apart from the other hobbits by his straw
curls, the throwing arm raised beside his head, the cloak worn on one side and the dark jerkin. The
team colour is his short elven cloak, clasped at the throat with a green leaf and flung back off his
throwing shoulder, so that it wraps his left side, his left arm under it: seen from the front as its
collar and the panel across his chest, from above on his shoulders and from behind across his back to
his seat. From behind, as the near side is seen, his straw curls show above it, the raised arm and
its stone beside them, the pouch at his hip and his legs and feet below it.

    blender --background --factory-startup --python-exit-code 1 --python pippin.py [-- <out.glb>]

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
    V,
    bent_tube,
    box,
    ellipse,
    finish,
    lean,
    loft,
    lump,
    material,
    nearest_on_polyline,
    on_surface,
    part,
    reset,
    team_material,
    tube,
)

# Pippin's own colours (sRGB); the rest come from the kit.
SKIN = 0xE6B48F  # fair and young
HAIR = 0xD4B776  # straw, on his head and the tops of his feet
SHIRT = 0xD8CDB2  # unbleached linen
JERKIN = 0x5C4331  # dark brown wool
BREECHES = 0x7A6C55  # fawn
STONE = 0x9C978C  # warm grey river stones
LEATHER = 0x8E6B48  # tan: his belt and the pouch, lighter than the jerkin
LEAF = 0x6D8A4F  # the clasp, a green leaf of Lórien
MOUTH = 0x6A4434  # a dark line, not red
BROWS = 0x8A6438  # darker than his curls, so they show on his fair face

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
        stone=material('stone', STONE, roughness=0.8),
        leaf=material('leaf', LEAF, roughness=0.6),
        eyes=material('eyes', EYES, roughness=0.6),
        mouth=material('mouth', MOUTH, roughness=0.8),
        brows=material('brows', BROWS, roughness=0.9),
    )


LEAN = 3  # degrees the body above the hips leans forward
HIPS = V(0, 0, 0.28)  # the pivot of the lean
TWIST = -16  # degrees the shoulders turn to his right, the throwing shoulder back
TWIST_LOW, TWIST_HIGH = 0.3, 0.52  # the twist grows from the hips to the shoulders


def lerp(a, b, t):
    return a + (b - a) * t


def twisted(point, low=TWIST_LOW, high=TWIST_HIGH, degrees=TWIST):
    """Where twist() carries a point: turned about the upright axis, by nothing below `low`, by the
    whole of `degrees` above `high` and smoothly more in between; to his left (+X) for positive."""
    t = min(max((point.z - low) / (high - low), 0.0), 1.0)
    a = math.radians(degrees) * t * t * (3 - 2 * t)
    c, s = math.cos(a), math.sin(a)
    return V(point.x * c - point.y * s, point.x * s + point.y * c, point.z)


def twist(objects, low=TWIST_LOW, high=TWIST_HIGH, degrees=TWIST):
    """Twists objects built square about the upright axis through the origin, more the higher they
    are, as a thrower winds up: unlike turn() it bends, so parts that meet still meet."""
    for obj in objects:
        for v in obj.data.vertices:
            v.co = twisted(v.co, low, high, degrees)


# Feet and legs -----------------------------------------------------------------------------------

# A thrower's stance: the left foot forward, the right foot back and turned out, the knees bent.
R_ANKLE, R_YAW = V(-0.125, 0.085, 0.0), -28
L_ANKLE, L_YAW = V(0.105, -0.095, 0.0), 12

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
FOOT_SCALE = 1.08  # the footprint, bigger than life
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

    def on_top(u, v, lift):
        i = int(u)
        f = u - i
        low = rings[1][i].lerp(rings[1][i + 1], f)
        high = rings[2][i].lerp(rings[2][i + 1], f)
        return low.lerp(high, v) + V(0, 0, lift)

    edge = [on_top(u, v, 0.004) for u, v in THATCH]
    middle = on_top(*THATCH_MIDDLE, 0.026)
    faces = [(i, (i + 1) % len(edge), len(edge)) for i in range(len(edge))]
    part(name + '-hair', edge + [middle], faces, M['hair'], inside=middle - V(0, 0, 0.05))


R_HIP, L_HIP = V(-0.072, 0.01, 0.28), V(0.072, 0.0, 0.28)
R_KNEE, L_KNEE = V(-0.108, 0.058, 0.185), V(0.1, -0.085, 0.19)
ANKLE_Z = 0.06  # where the shin ends, inside the foot


def leg(side, hip, knee, ankle):
    ankle = V(ankle.x, ankle.y, ANKLE_Z)
    shin = (ankle - knee).normalized()
    # Breeches to below the knee, ending in a cuff wider than the bare shin.
    bent_tube(f'thigh-{side}', [hip, knee, knee + 0.015 * shin], [0.068, 0.058, 0.056], M['breeches'])
    tube(f'shin-{side}', knee, ankle, [(0, 0.041), (1, 0.032)], M['skin'])


def legs():
    leg('right', R_HIP, R_KNEE, R_ANKLE)
    leg('left', L_HIP, L_KNEE, L_ANKLE)
    foot('foot-right', R_ANKLE, R_YAW, 1)
    foot('foot-left', L_ANKLE, L_YAW, -1)


# Body --------------------------------------------------------------------------------------------

# Octagons from the seat of his breeches to the shoulders: z, half-width, half-depth and centre y.
# Slimmer than Frodo, with a smaller belly.
TORSO = [
    (0.22, 0.118, 0.098, 0.012),  # the seat of his breeches
    (0.29, 0.136, 0.116, 0.004),  # the belt's lower edge
    (0.33, 0.143, 0.126, -0.006),  # the belt's upper edge
    (0.4, 0.152, 0.14, -0.022),  # the belly, a little round
    (0.47, 0.144, 0.118, -0.01),  # chest
    (0.525, 0.118, 0.09, 0.0),  # shoulders, open above under the collar
]
TORSO_BANDS = [0, 1, 2, 2, 2]  # breeches, belt, jerkin


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    mats = [M['breeches'], M['leather'], M['jerkin']]
    part('torso', verts, faces, mats, face_mats, inside=lambda c: V(0, -0.01, c.z))
    tube('neck', V(0, 0.005, 0.54), V(0, -0.012, 0.625), [(0, 0.044), (1, 0.043)], M['skin'])


# Head --------------------------------------------------------------------------------------------

# Octagons with a corner at the front, from under the chin to the crown: z, half-width, half-depth
# and centre y. A round young face with full cheeks, widest below the eyes.
HEAD = [
    (0.585, 0.047, 0.043, -0.05),  # under the chin
    (0.617, 0.095, 0.089, -0.03),  # the jaw and the mouth
    (0.675, 0.124, 0.11, -0.018),  # round cheeks, the widest
    (0.737, 0.121, 0.109, -0.012),  # the eyes and the temples
    (0.795, 0.105, 0.097, -0.008),  # the forehead, under the curls, open above
]
EYE_Z = 0.713


def head():
    rings = [ellipse(0, cy, z, rx, ry, 8, 0) for z, rx, ry, cy in HEAD]
    verts, faces, _ = loft(rings)
    faces.append(tuple(range(8)))  # under the chin
    part('head', verts, faces, M['skin'], inside=lambda c: V(0, -0.02, min(max(c.z, 0.635), 0.785)))

    def plane(a, b, low, high):
        p, q, r, s = rings[low][a], rings[low][b], rings[high][b], rings[high][a]
        return [(p, q, r), (p, r, s)]

    cheeks = plane(5, 6, 2, 3) + plane(6, 7, 2, 3)
    jaw = plane(5, 6, 1, 2) + plane(6, 7, 1, 2)
    brow = cheeks + plane(5, 6, 3, 4) + plane(6, 7, 3, 4)

    # Big round eyes, a little wide apart, just proud of the face.
    for s in (-1, 1):
        x, z = s * 0.045, EYE_Z
        corners = [(x - 0.017, z), (x - 0.009, z + 0.015), (x + 0.009, z + 0.015), (x + 0.017, z),
                   (x + 0.009, z - 0.014), (x - 0.009, z - 0.014)]
        verts = [V(u, on_surface(cheeks, u, w) - 0.005, w) for u, w in corners]
        part(f'eye-{s}', verts, [(0, 1, 2, 3, 4, 5)], M['eyes'], outward=V(0, -1, 0))

    # A wide, cheeky grin.
    corners = [(-0.042, 0.656), (0, 0.638), (0.042, 0.656), (0, 0.627)]
    verts = [V(x, on_surface(jaw, x, z) - 0.004, z) for x, z in corners]
    part('mouth', verts, [(0, 3, 1), (1, 3, 2)], M['mouth'], outward=V(0, -1, 0))

    # A short, round nose.
    top, tip, under = V(0, -0.127, 0.709), V(0, -0.15, 0.684), V(0, -0.133, 0.668)
    left, right = V(0.026, -0.121, 0.682), V(-0.026, -0.121, 0.682)
    verts = [top, left, under, right, tip]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.1, 0.685))

    # Brows raised high at the inner ends, curious.
    for s in (-1, 1):
        verts = [V(s * 0.02, 0, 0.761), V(s * 0.07, 0, 0.754), V(s * 0.069, 0, 0.745), V(s * 0.022, 0, 0.752)]
        verts = [V(p.x, on_surface(brow, p.x, p.z) - 0.006, p.z) for p in verts]
        part(f'brow-{s}', verts, [(0, 1, 2, 3)], M['brows'], outward=V(0, -1, 0.2))

    # Ears a little pointed, through the curls at the sides.
    for s in (-1, 1):
        base = [V(s * 0.118, -0.018, 0.671), V(s * 0.12, 0.028, 0.683), V(s * 0.115, 0.014, 0.735),
                V(s * 0.118, -0.022, 0.72)]
        tip = V(s * 0.16, 0.028, 0.75)
        faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
        part(f'ear-{s}', base + [tip], faces, M['skin'], inside=V(s * 0.09, 0.0, 0.705))


def head_ring(z):
    """The head's half-width, half-depth and centre y at height z."""
    for (z0, *low), (z1, *high) in pairwise(HEAD):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return [lerp(a, b, t) for a, b in zip(low, high)]
    raise ValueError(z)


# The curls, as Frodo's: a mop round the head from a hairline low at the nape, lifted over the ears,
# and down in a fringe over the forehead: its height at angles from his left (+X) round the back.
HAIRLINE = [(0, 0.75), (45, 0.655), (90, 0.613), (135, 0.655), (180, 0.75), (225, 0.76), (270, 0.772),
            (315, 0.76), (360, 0.75)]
HAIR_POINTS = 16
CURL = 0.018  # how far each curl hangs below the hairline between them
MOP = V(0, -0.006, 0.713), (0.148, 0.142, 0.147)  # the ellipsoid the curls fill: centre and radii
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
        z0 = z - CURL if curl else z + 0.006
        hx, hy, hc = head_ring(z0)
        rings[0].append(V(0.94 * hx * cos, hc + 0.94 * hy * sin, z0))
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


# Team colour: the short elven cloak, flung back off his throwing shoulder ----------------------------

# Rings from the collar to the hem, each an open arc from the cloak's front edge, which crosses his
# chest on his left, round the back to its edge on his right, thrown back off his shoulder. Each
# level: z at the back, at the sides and in front; half-width, half-depth and centre y; the angles of
# its left and right ends (degrees from +X round the back); and how deep the folds are.
CLOAK = [
    ((0.625, 0.605, 0.585), 0.086, 0.08, 0.004, -84, 262, 0.0),  # the collar, round his neck
    ((0.55, 0.535, 0.53), 0.196, 0.152, 0.004, -74, 205, 0.0),  # over the shoulders
    ((0.43, 0.44, 0.43), 0.215, 0.182, -0.012, -66, 165, 0.02),  # round his belly
    ((0.31, 0.335, 0.34), 0.226, 0.186, -0.008, -60, 128, 0.036),  # the hem, at his seat
]
CLOAK_POINTS = 13


def cloak():
    rings = []
    for (back, side, front), rx, ry, cy, start, end, fold in CLOAK:
        ring = []
        for i in range(CLOAK_POINTS):
            a = math.radians(lerp(start, end, i / (CLOAK_POINTS - 1)))
            k = 1 + (fold / ry if i % 2 else 0)
            s = math.sin(a)
            z = side + (back - side) * max(s, 0) + (front - side) * max(-s, 0)
            ring.append(V(k * rx * math.cos(a), cy + k * ry * s, z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    part('cloak', verts, faces, M['team'], inside=lambda c: V(0, 0.0, c.z))

    # The clasp at his throat, a leaf, its two halves folded along the midrib.
    y = -0.088
    verts = [V(0, y, 0.6), V(0.022, y, 0.577), V(0, y, 0.553), V(-0.022, y, 0.577), V(0, y - 0.008, 0.577)]
    part('clasp', verts, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], M['leaf'], inside=V(0, 0, 0.575))


# Arms --------------------------------------------------------------------------------------------

# The right arm, built where it ends up after the twist: cocked back beside his head with the stone,
# the elbow high and out. The left is under the cloak, which wraps his left side.
R_SHOULDER, R_ELBOW, R_WRIST = twisted(V(-0.125, 0.005, 0.5)), V(-0.245, 0.045, 0.6), V(-0.27, 0.05, 0.745)


def throwing_arm():
    bent_tube('sleeve-right', [R_SHOULDER, R_ELBOW, R_WRIST], [0.05, 0.047, 0.04], M['shirt'])
    ahead = (R_WRIST - R_ELBOW).normalized()
    back = V(0, 1, 0)
    up = (back - back.dot(ahead) * ahead).normalized()  # the palm faces back, away from the target
    across = ahead.cross(up)
    fist = R_WRIST + 0.03 * ahead
    box('fist-right', fist, [ahead, up, across], (0.038, 0.04, 0.042), M['skin'], 0.86)
    # The stone, bigger than life so it reads, held in his fingers on top of the fist.
    lump('stone', fist + 0.06 * ahead + 0.016 * up, (0.062, 0.058, 0.054), M['stone'], seed=3, rough=0.12)


# The pouch of stones -----------------------------------------------------------------------------

POUCH = V(-0.165, -0.05, 0.31)  # the middle of its mouth, hung from his belt at his right hip


def pouch():
    # A bulging leather bag of hexagons, from its frilled mouth, gathered at the neck by its
    # drawstring, round to a blunt bottom.
    profile = [(0.0, 0.05), (-0.016, 0.034), (-0.042, 0.064), (-0.078, 0.07), (-0.108, 0.04)]  # z, radius
    rings = [ellipse(POUCH.x, POUCH.y, POUCH.z + dz, r, r * 0.85, 6, 0) for dz, r in profile]
    verts, faces, _ = loft(rings)
    faces.append(tuple(range(24, 30)))
    part('pouch', verts, faces, M['leather'], inside=lambda c: V(POUCH.x, POUCH.y, max(c.z, POUCH.z - 0.1)))
    # Stones heaped in its mouth.
    lump('pebble-1', POUCH + V(-0.014, -0.008, 0.014), 0.035, M['stone'], seed=7, rough=0.15)
    lump('pebble-2', POUCH + V(0.026, 0.012, 0.008), 0.03, M['stone'], seed=11, rough=0.15)


def main():
    reset()
    make_materials()
    legs()
    lower = set(bpy.context.scene.objects)
    torso()
    cloak()
    twist([o for o in bpy.context.scene.objects if o not in lower])
    head()
    hair()
    throwing_arm()
    pouch()
    lean([o for o in bpy.context.scene.objects if o not in lower], HIPS, LEAN)
    finish('pippin')


main()
