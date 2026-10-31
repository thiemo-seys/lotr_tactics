"""Haldir, the Elf: a march-warden of the Galadhrim and an Archer, in the Faceted style
(docs/viewer-spec.md section 4).

Of Legolas's family (legolas.py): 1.48 tall standing, slim, shoulders about 0.42 across, long legs and a
smooth face with pointed ears. From the books, the Elves of Lórien are clad in grey, in cloaks that
take the colour of the wood, and keep watch on the borders with their great bows. So Haldir is in grey
and silver, with long, pale silver-fair hair down his back. He looses a volley, his ability: the long
bow raised high and drawn to the corner of his jaw, aimed up over the field to his left, and he bends
away from the shot, his drawing elbow raised out to his right. Legolas half-draws level and to the
side; Haldir's raised bow and high elbow are his own outline, from in front and from behind. His
quiver hangs at his right hip. The team colour is his long cloak, its hood thrown back as a mantle
over his shoulders, and the sash at his waist.

    blender --background --factory-startup --python-exit-code 1 --python haldir.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    EYES,
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

# Haldir's own colours (sRGB); the eyes come from the kit.
SKIN = 0xE4C1A2  # fair, as Legolas
HAIR = 0xDDD5B8  # long and pale, silver-fair
TUNIC = 0x868D87  # the grey of Lórien, cool and a little green
LEGGINGS = 0x555B58  # a darker grey
BOOTS = 0x4B4741  # soft grey-brown leather
LEATHER = 0x51463B  # the quiver and the bracer
SILVER = 0xD3D7DA  # the clasp, the arrowheads and the quiver's rim
BOW = 0xC2A677  # the pale wood of a bow of the Galadhrim, and the arrows
FEATHER = 0xE0DCD0  # pale fletching, and the bowstring

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.75),
        tunic=material('tunic', TUNIC, roughness=0.9),
        leggings=material('leggings', LEGGINGS, roughness=0.9),
        boots=material('boots', BOOTS, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        silver=material('silver', SILVER, roughness=0.45, metallic=0.1),
        wood=material('wood', BOW, roughness=0.7),
        feather=material('feather', FEATHER, roughness=0.9),
        eyes=material('eyes', EYES, roughness=0.6),
    )


# Pose ------------------------------------------------------------------------------------------
#
# A volley: he stands side-on to the shot, his hips turned to his right and his chest further, and
# bends at the waist away from it, so the line of his shoulders tips up towards the sky. The arrow
# points AIM_YAW degrees to his left and AIM_UP degrees above level. Aimed straight ahead, the bow
# would be edge-on to the game's camera from in front and from behind; turned this far, and canted a
# little, it shows its curve from both.

HIPS_YAW = -25  # degrees his hips turn to his right
TORSO_YAW = -40  # and his chest
TILT = 18  # degrees his body above the waist bends to his right, away from the shot
WAIST = 0.8  # where it bends
HEAD_YAW = 40  # degrees his head turns to his left, along the arrow
HEAD_PITCH = 16  # degrees he looks up
HEAD_ROLL = 4  # degrees his head tips to his right
AIM_YAW = 50
AIM_UP = 38
CANT = 10  # degrees the bow's top tips towards his right


def rotation(axis, degrees):
    return Matrix.Rotation(math.radians(degrees), 3, axis)


def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def body(p):
    """A point of his body, built upright and facing -Y, carried into the pose: below the waist it
    turns with his hips; above it, it bends away from the shot and turns with his chest."""
    p = Vector(p)
    k = smooth((p.z - 0.78) / 0.22)
    pivot = V(0, 0, WAIST)
    q = pivot + rotation('Y', -TILT * k) @ (p - pivot)
    return rotation('Z', HIPS_YAW + (TORSO_YAW - HIPS_YAW) * k) @ q


def hips(p):
    return rotation('Z', HIPS_YAW) @ Vector(p)


NECK = V(0, 0.004, 1.13)  # the head turns about this point, carried by the body


def head_point(p):
    """A point of his head, built upright and facing -Y, turned and tipped up along the arrow."""
    p = Vector(p) - NECK
    p = rotation('Z', HEAD_YAW) @ (rotation('Y', -HEAD_ROLL) @ (rotation('X', -HEAD_PITCH) @ p))
    return body(NECK) + p


def carry(objects, place):
    """Moves every vertex of objects built in a part's own frame to where `place` puts it."""
    for obj in objects:
        for v in obj.data.vertices:
            v.co = place(v.co)


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o not in before]


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


# The arrow, the bow and the hands on them.
AIM = V(
    math.sin(math.radians(AIM_YAW)) * math.cos(math.radians(AIM_UP)),
    -math.cos(math.radians(AIM_YAW)) * math.cos(math.radians(AIM_UP)),
    math.sin(math.radians(AIM_UP)),
)
_LEVEL_UP = (V(0, 0, 1) - AIM.z * AIM).normalized()
RIGHT_OF_AIM = AIM.cross(_LEVEL_UP)
BOW_UP = math.cos(math.radians(CANT)) * _LEVEL_UP + math.sin(math.radians(CANT)) * RIGHT_OF_AIM
NOCK = head_point(V(-0.065, -0.085, 1.19))  # drawn to the corner of his jaw
DRAW = 0.6  # from the nock to the grip: a full draw, as a great bow is drawn
REST = 0.04  # the arrow lies this far above the middle of the grip
GRIP = NOCK + DRAW * AIM - REST * BOW_UP


# Legs --------------------------------------------------------------------------------------------

HIP_Z = 0.73
THIGH, SHIN = 0.335, 0.33
# Feet wide apart along the line of the shot: the left forward and turned towards it, the right back
# and turned out, his weight on it.
LEGS = {  # hip joint (in the hips' frame), ankle, the foot's yaw
    'right': (V(-0.075, 0.0, HIP_Z), V(-0.15, 0.13, 0.085), -45),
    'left': (V(0.075, 0.0, HIP_Z), V(0.16, -0.12, 0.085), 25),
}

# The boot from the sole up, in the foot's own frame (toes towards -y): the height of each ring and the
# right half of it, side, heel and toe, mirrored by boot(). Long and narrow, to a pointed toe.
BOOT_RINGS = [
    (0.0, [(0.056, -0.01), (0.046, 0.072), (0.022, -0.162)]),  # the sole
    (0.055, [(0.056, 0.0), (0.048, 0.072), (0.02, -0.114)]),  # the instep slopes back from the toe
    (0.13, [(0.049, 0.006), (0.044, 0.056), (0.035, -0.038)]),  # round the ankle
]


def boot(name, ankle, foot_yaw):
    facing = rotation('Z', foot_yaw)
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in BOOT_RINGS]
    rings = [[at + facing @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    part(name, verts, faces, M['boots'], inside=at + V(0, 0, 0.07))


def legs():
    for side, (hip, ankle, foot_yaw) in LEGS.items():
        hip = hips(hip)
        ahead = rotation('Z', foot_yaw) @ V(0, -1, 0)
        knee = bend(hip, ankle, THIGH, SHIN, (hip + ankle) / 2 + 0.3 * ahead)
        tube(f'thigh-{side}', hip + V(0, 0, 0.05), knee, [(0, 0.082), (1, 0.062)], M['leggings'])
        # Leggings to below the knee, then the tall soft boot.
        shin = [(-0.06, 0.062), (0.4, 0.055), (1.0, 0.046)]
        tube(f'shin-{side}', knee, ankle, shin, [M['leggings'], M['boots']], [0, 1])
        boot(f'boot-{side}', ankle, foot_yaw)


# Body, built upright and carried into the pose by body() ------------------------------------------

# The long grey tunic as a column of octagons: z, half-width, half-depth and centre y. The sash is the
# band between the third and fourth rings.
TORSO = [
    (0.52, 0.19, 0.15, 0.012),  # the hem, flared over the thighs
    (0.72, 0.14, 0.1, 0.0),  # hips
    (0.785, 0.128, 0.093, 0.0),  # sash, lower edge
    (0.845, 0.124, 0.09, 0.0),  # sash, upper edge: the narrow waist
    (0.975, 0.162, 0.108, -0.006),  # chest
    (1.07, 0.172, 0.097, 0.004),  # shoulders
    (1.135, 0.062, 0.056, 0.008),  # neck
]
TORSO_BANDS = [0, 0, 1, 0, 0, 0]  # tunic, except the sash
OCTAGON = [math.radians(22.5 + 45 * i) for i in range(8)]


def torso():
    rings = [[V(rx * math.cos(a), cy + ry * math.sin(a), z) for a in OCTAGON] for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    part('torso', verts, faces, [M['tunic'], M['team']], [TORSO_BANDS[b] for b in bands],
         inside=lambda c: V(0, 0, c.z))


def torso_point(degrees, z, out=0.0):
    """The point on the torso's surface at `degrees` from +X and height z, pushed out by `out`."""
    for (z0, rx0, ry0, cy0), (z1, rx1, ry1, cy1) in zip(TORSO, TORSO[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            rx, ry, cy = rx0 + t * (rx1 - rx0), ry0 + t * (ry1 - ry0), cy0 + t * (cy1 - cy0)
            a = math.radians(degrees)
            normal = V(math.cos(a) / rx, math.sin(a) / ry, 0).normalized()
            return V(rx * math.cos(a), cy + ry * math.sin(a), z) + out * normal
    raise ValueError(f'no torso at {z}')


def sash():
    # The sash's knot at his front left and its two ends hanging down the skirt of his tunic.
    knot = torso_point(300, 0.815, 0.014)
    box('sash-knot', knot, [V(0.5, -0.86, 0), V(0.86, 0.5, 0), V(0, 0, 1)], (0.022, 0.034, 0.03), M['team'], 0.8)
    for k, (a0, a1, low) in enumerate(((292, 300, 0.56), (306, 318, 0.6))):
        rows = []
        for z, a, w in ((0.8, a0, 0.024), (0.68, (a0 + a1) / 2, 0.028), (low, a1, 0.032)):
            centre = torso_point(a, z, 0.018)
            normal = V(math.cos(math.radians(a)), math.sin(math.radians(a)), 0)
            across = normal.cross(V(0, 0, 1)).normalized()
            rows.append([centre + w * across, centre - w * across])
        verts, faces, _ = loft(rows, closed=False)
        part(f'sash-end-{k}', verts, faces, M['team'], inside=lambda c: V(0, 0, c.z))


# Team colour: the hood thrown back as a mantle, and the long cloak -------------------------------


def mantle():
    # Eight points round the neck and the shoulders, starting at his left shoulder (+X); the front
    # dips to the clasp at his throat and the back rises where the hood gathers.
    neck_z = [1.135, 1.15, 1.16, 1.15, 1.135, 1.115, 1.1, 1.115]
    neck = ellipse(0, 0.01, 0, 0.08, 0.074, 8, 0, neck_z)
    dome = ellipse(0, 0.008, 0, 0.19, 0.13, 8, 0, [z - 0.04 for z in neck_z])
    shoulder_z = [1.05, 1.06, 1.07, 1.06, 1.05, 1.045, 1.04, 1.045]
    shoulder = ellipse(0, 0.006, 0, 0.245, 0.158, 8, 0, shoulder_z)
    hem = ellipse(0, 0.006, 0, 0.238, 0.152, 8, 0, [z - 0.07 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('mantle', verts, faces, M['team'], inside=V(0, 0.01, 0.95))

    # The hood itself, bunched on his upper back under his hair.
    a, g, b = V(-0.11, 0.1, 1.135), V(0, 0.125, 1.15), V(0.11, 0.1, 1.135)
    c, e, d = V(-0.15, 0.2, 1.01), V(0, 0.235, 1.04), V(0.15, 0.2, 1.01)
    f = V(0, 0.215, 0.87)
    verts = [a, g, b, c, e, d, f]
    faces = [(0, 1, 4, 3), (1, 2, 5, 4), (3, 4, 6), (4, 5, 6)]
    part('hood', verts, faces, M['team'], inside=V(0, 0.1, 1.0))

    # A silver leaf clasps it at his throat.
    centre = V(0, -0.082, 1.1)
    verts = [centre + V(0, -0.012, 0.0), centre + V(-0.026, -0.004, 0.014), centre + V(0, -0.002, 0.042),
             centre + V(0.026, -0.004, 0.014), centre + V(0, -0.004, -0.03)]
    faces = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 1)]
    part('clasp', verts, faces, M['silver'], outward=V(0, -1, 0))


# The cloak, from under the mantle to his calves, open at the front. Each level: z at the middle of his
# back and at the edges, half-width, half-depth, centre y, the span it covers (degrees from +X round his
# back) and how deep its folds are.
CLOAK = [
    (1.035, 1.0, 0.212, 0.132, 0.008, (300, 600), 0.0),
    (0.80, 0.80, 0.232, 0.168, 0.03, (318, 582), 0.014),
    (0.56, 0.60, 0.258, 0.2, 0.048, (330, 548), 0.028),
    (0.30, 0.42, 0.28, 0.228, 0.065, (338, 540), 0.042),
]


def cloak():
    rings = []
    for middle, edge, rx, ry, cy, (start, end), fold in CLOAK:
        ring = []
        for i in range(11):
            a = start + (end - start) * i / 10
            d = abs(a - 450) / max(450 - start, end - 450)  # 0 at the middle of his back, 1 at the edges
            z = middle + (edge - middle) * d * d
            k = 1 + (fold / ry if i % 2 else 0.0)
            r = math.radians(a)
            ring.append(V(k * rx * math.cos(r), cy + k * ry * math.sin(r), z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    part('cloak', verts, faces, M['team'], inside=lambda c: V(0, 0, c.z))


# The quiver hangs at his right hip, in front of the cloak, tipped back.
QUIVER_TOP, QUIVER_FOOT = V(-0.235, -0.06, 0.86), V(-0.265, 0.05, 0.45)


def quiver():
    top, foot = QUIVER_TOP, QUIVER_FOOT
    along = (top - foot).normalized()
    tube('quiver', foot, top, [(0, 0.044), (1, 0.054)], M['leather'], n=6)
    ring = segment(foot, top, [(0, 0.044)], 6)[0]
    verts = ring + [foot - 0.03 * along]
    part('quiver-foot', verts, [(i, (i + 1) % 6, 6) for i in range(6)], M['leather'], inside=foot)
    # A silver rim round the mouth, which is dark with the shafts of the arrows.
    rim = segment(top - 0.04 * along, top + 0.008 * along, [(0, 0.06), (1, 0.06)], 6)
    verts, faces, _ = loft(rim)
    faces.append(tuple(range(6, 12)))
    part('quiver-rim', verts, faces, [M['silver'], M['leather']], [0] * 6 + [1], inside=top - 0.02 * along)
    across, other = frame(along)
    for k, (du, dv, lean) in enumerate([(0.026, 0.0, 0.14), (-0.022, 0.018, -0.12), (-0.006, -0.028, -0.02),
                                        (0.01, 0.03, 0.06)]):
        base = top + du * across + dv * other - 0.01 * along
        up = (along + lean * across + 0.5 * lean * other).normalized()
        fletching(f'fletching-{k}', base, up, 0.12, 0.022)


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


# Head, built upright facing -Y and carried by head_point() ----------------------------------------

# Hair over the crown, the sides and the back: rings of eight points (x, y, z) from his left (+X) round
# the back to his right and the front, set back where the face is. Fuller than Legolas's, and falling
# lower at the back, where the long hair goes on down his back.
HAIR_RINGS = [
    [(0.09, 0.03, 1.13), (0.08, 0.1, 1.1), (0.0, 0.124, 1.09), (-0.08, 0.1, 1.1),
     (-0.09, 0.03, 1.13), (-0.064, -0.035, 1.19), (0.0, -0.03, 1.19), (0.064, -0.035, 1.19)],  # the nape
    [(0.124, 0.0, 1.34), (0.1, 0.096, 1.34), (0.0, 0.132, 1.34), (-0.1, 0.096, 1.34),
     (-0.124, 0.0, 1.34), (-0.098, -0.078, 1.34), (0.0, -0.074, 1.34), (0.098, -0.078, 1.34)],  # the temples
    [(0.104, 0.006, 1.425), (0.08, 0.08, 1.425), (0.0, 0.108, 1.425), (-0.08, 0.08, 1.425),
     (-0.104, 0.006, 1.425), (-0.082, -0.086, 1.43), (0.0, -0.116, 1.438), (0.082, -0.086, 1.43)],  # hairline
    [(0.064, 0.008, 1.47), (0.047, 0.05, 1.47), (0.0, 0.068, 1.47), (-0.047, 0.05, 1.47),
     (-0.064, 0.008, 1.47), (-0.047, -0.05, 1.472), (0.0, -0.066, 1.474), (0.047, -0.05, 1.472)],
]
CROWN = V(0, 0.004, 1.484)

# The face: the right half's corners (x < 0), mirrored, and the points down the middle.
BROW, CHEEKBONE = V(-0.09, -0.1, 1.376), V(-0.098, -0.084, 1.285)
JAW, CHEEK = V(-0.074, -0.034, 1.2), V(-0.044, -0.108, 1.222)
FOREHEAD, NOSE_ROOT, MOUTH, CHIN, UNDER_CHIN = (
    V(0, -0.113, 1.432), V(0, -0.132, 1.35), V(0, -0.128, 1.222), V(0, -0.118, 1.168), V(0, -0.055, 1.15))


def mirror(p):
    return V(-p.x, p.y, p.z)


def head():
    verts, faces, _ = loft([[V(*p) for p in ring] for ring in HAIR_RINGS])
    last = len(verts) - 8
    verts.append(CROWN)
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    part('hair', verts, faces, M['hair'], inside=V(0, 0.0, 1.3))

    # A narrow face of planes: forehead, eye sockets, high cheekbones, a pointed chin.
    verts = [FOREHEAD, NOSE_ROOT, MOUTH, CHIN, UNDER_CHIN]
    faces = []
    for s in (BROW, CHEEKBONE, JAW, CHEEK), tuple(mirror(p) for p in (BROW, CHEEKBONE, JAW, CHEEK)):
        b, c, j, k = range(len(verts), len(verts) + 4)
        verts += list(s)
        faces += [(0, b, 1), (1, b, c), (1, c, k), (1, k, 2), (c, j, k), (k, j, 3), (k, 3, 2), (j, 4, 3)]
    part('face', verts, faces, M['skin'], inside=V(0, 0.0, 1.3))
    sockets = {s: [(NOSE_ROOT, p(BROW), p(CHEEKBONE))] for s, p in ((-1, lambda q: q), (1, mirror))}

    # Almond eyes, a little tilted, laid just proud of the plane under the brow.
    for s in (-1, 1):
        corners = [(s * 0.022, 1.337), (s * 0.078, 1.35), (s * 0.05, 1.322)]
        verts = [V(x, on_surface(sockets[s], x, z) - 0.006, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A straight, narrow nose.
    top, tip, under = V(0, -0.135, 1.345), V(0, -0.162, 1.272), V(0, -0.13, 1.262)
    left, right = V(0.022, -0.126, 1.274), V(-0.022, -0.126, 1.274)
    verts = [top, tip, under, left, right]
    faces = [(0, 3, 1), (0, 1, 4), (3, 2, 1), (1, 2, 4)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.1, 1.3))

    # Level brows, the pale gold of his hair.
    for s in (-1, 1):
        verts = [V(s * 0.018, -0.139, 1.366), V(s * 0.09, -0.111, 1.384), V(s * 0.087, -0.103, 1.372),
                 V(s * 0.02, -0.132, 1.355)]
        part(f'brow-{s}', verts, [(0, 1, 2, 3)], M['hair'], outward=V(0, -1, 0.3))

    # Pointed ears through the hair, swept up and back.
    for s in (-1, 1):
        base = [V(s * 0.124, -0.03, 1.275), V(s * 0.126, 0.035, 1.3), V(s * 0.126, -0.012, 1.355)]
        tip = V(s * 0.176, 0.056, 1.43)
        verts = base + [tip]
        part(f'ear-{s}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['skin'], inside=V(0, 0.01, 1.32))


def neck():
    tube('neck', body(V(0, 0.008, 1.06)), head_point(V(0, -0.004, 1.24)), [(0, 0.05), (1, 0.046)], M['skin'])


def hair_tail():
    # Long straight hair from the back of his head down over the hood and the cloak to the small of
    # his back. The top turns with his head, the rest lies on his back, so it twists between them.
    top = [head_point(V(0.116 * math.cos(math.radians(a)), 0.006 + 0.124 * math.sin(math.radians(a)), 1.3))
           for a in (5, 50, 90, 130, 175)]
    rows = [
        [(0.12, 0.13, 1.13), (0.06, 0.165, 1.14), (0.0, 0.175, 1.14), (-0.06, 0.165, 1.14), (-0.12, 0.13, 1.13)],
        [(0.1, 0.25, 0.98), (0.05, 0.27, 0.99), (0.0, 0.275, 0.99), (-0.05, 0.27, 0.99), (-0.1, 0.25, 0.98)],
        [(0.075, 0.232, 0.8), (0.036, 0.245, 0.79), (0.0, 0.25, 0.785), (-0.036, 0.245, 0.79),
         (-0.075, 0.232, 0.8)],
    ]
    rings = [top] + [[body(V(*p)) for p in row] for row in rows]
    verts, faces, _ = loft(rings, closed=False)
    verts.append(body(V(0, 0.24, 0.7)))
    last = len(verts) - 6
    faces += [(last + i, last + i + 1, len(verts) - 1) for i in range(4)]
    spine = [head_point(V(0, 0.0, 1.3)), body(V(0, 0.12, 1.1)), body(V(0, 0.2, 0.95)), body(V(0, 0.18, 0.75))]
    part('hair-tail', verts, faces, M['hair'], inside=nearest_on_polyline(spine))


# Arms, the bow and the arrow, placed in the pose ----------------------------------------------------

SHOULDER = V(0.165, 0.0, 1.075)  # his left shoulder joint, upright; the right mirrors it
UPPER_ARM, FOREARM = 0.27, 0.26

# The stave from the bottom tip to the top: (along the stave, back towards him, half-thickness). Fully
# drawn, its limbs bend well back towards him.
STAVE = [
    (-0.66, 0.29, 0.0),
    (-0.58, 0.245, 0.022),
    (-0.4, 0.135, 0.028),
    (-0.1, 0.014, 0.032),
    (0.1, 0.014, 0.032),
    (0.4, 0.135, 0.028),
    (0.58, 0.245, 0.022),
    (0.66, 0.29, 0.0),
]
STAVE_BANDS = [0, 0, 0, 1, 0, 0, 0]  # wood, the grip wrapped in leather


def bow():
    side = AIM.cross(BOW_UP).normalized()  # across the bow's plane
    centres = [GRIP + u * BOW_UP - w * AIM for u, w, _ in STAVE]
    rings = []
    for k, (u, w, t) in enumerate(STAVE):
        if t == 0:
            continue
        ahead = (centres[k + 1] - centres[k - 1]).normalized()
        back = side.cross(ahead)  # in the bow's plane, across the stave
        c = centres[k]
        rings.append([c + t * back, c + 0.9 * t * side, c - t * back, c - 0.9 * t * side])
    verts, faces, bands = loft(rings)
    face_mats = [STAVE_BANDS[b + 1] for b in bands]
    for tip, ring_start in ((centres[0], 0), (centres[-1], 4 * (len(rings) - 1))):
        verts.append(tip)
        faces += [(ring_start + i, ring_start + (i + 1) % 4, len(verts) - 1) for i in range(4)]
        face_mats += [0] * 4
    part('bow', verts, faces, [M['wood'], M['leather']], face_mats, inside=nearest_on_polyline(centres))

    # The string, from tip to tip by way of the arrow's nock.
    top, bottom = centres[-1] - 0.025 * BOW_UP, centres[0] + 0.025 * BOW_UP
    for name, a, b in (('string-top', NOCK, top), ('string-bottom', NOCK, bottom)):
        tube(name, a, b, [(0, 0.006), (1, 0.006)], M['feather'], n=3)

    # The arrow: a shaft from the nock past the grip and a leaf-shaped silver head.
    point = GRIP + REST * BOW_UP + 0.13 * AIM
    tube('arrow', NOCK - 0.015 * AIM, point, [(0, 0.009), (1, 0.009)], M['wood'], n=3)
    ring = [point + 0.026 * side, point + 0.01 * BOW_UP, point - 0.026 * side, point - 0.01 * BOW_UP]
    tip = point + 0.08 * AIM
    verts = ring + [tip]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(3, 2, 1, 0)]
    part('arrowhead', verts, faces, M['silver'], inside=point + 0.02 * AIM)


def bow_arm(shoulder, elbow, wrist):
    """The sleeve of his tunic and a leather bracer on the forearm, nearly straight at the elbow."""
    tube('upper-arm-left', shoulder, elbow, [(-0.12, 0.062), (1.08, 0.05)], M['tunic'])
    stations = [(-0.08, 0.052), (0.38, 0.053), (1.0, 0.045)]
    tube('forearm-left', elbow, wrist, stations, [M['tunic'], M['leather']], [0, 1])


def arms():
    left_shoulder = body(SHOULDER)
    right_shoulder = body(V(-SHOULDER.x, SHOULDER.y, SHOULDER.z))

    # The bow arm, raised high and nearly straight, the elbow turned down and out.
    fist = GRIP
    reach = (fist - left_shoulder).normalized()
    wrist = fist - 0.05 * reach
    elbow = bend(left_shoulder, wrist, UPPER_ARM, FOREARM, (left_shoulder + wrist) / 2 + V(0.1, 0.1, -0.3))
    bow_arm(left_shoulder, elbow, wrist)
    up = (BOW_UP - BOW_UP.dot(reach) * reach).normalized()
    box('fist-left', fist, [reach, up, reach.cross(up)], (0.045, 0.05, 0.04), M['skin'], 0.85)

    # The drawing arm, the fingers hooked round the string at the corner of his jaw and the elbow
    # drawn out to his right and raised, level with his shoulder along the line of the arrow. Bending
    # away from the shot brings his shoulder up behind the arrow, so the arm folds out to the side
    # rather than pointing at the camera in front of him. The elbow closes in a point, so the folded
    # arm doesn't end in the open ends of two tubes.
    fist = NOCK - 0.012 * AIM - 0.012 * BOW_UP
    wrist = fist - 0.055 * AIM + V(-0.02, 0.02, -0.01)
    pole = right_shoulder + V(-0.3, 0.0, 0.1)
    elbow = bend(right_shoulder, wrist, UPPER_ARM, FOREARM, pole)
    upper = (elbow - right_shoulder).normalized()
    start = right_shoulder - 0.03 * upper
    bent_tube('upper-arm-right', [start, elbow], [0.062, 0.052], M['tunic'], end=elbow + 0.04 * upper)
    tube('forearm-right', elbow, wrist, [(0.06, 0.05), (0.38, 0.053), (1.0, 0.045)], M['tunic'])
    ahead = (fist - wrist).normalized()
    up = (V(0, 0, 1) - ahead.z * ahead).normalized()
    box('fist-right', fist, [ahead, up, ahead.cross(up)], (0.042, 0.045, 0.04), M['skin'], 0.85)


def main():
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    sash()
    mantle()
    cloak()
    carry(new_objects(before), body)
    before = set(bpy.context.scene.objects)
    quiver()
    carry(new_objects(before), hips)
    before = set(bpy.context.scene.objects)
    head()
    carry(new_objects(before), head_point)
    neck()
    hair_tail()
    arms()
    bow()
    finish('haldir')


main()
