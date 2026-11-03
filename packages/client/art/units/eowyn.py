"""Éowyn, shieldmaiden of Rohan: a Guardian on foot, in the Faceted style (docs/viewer-spec.md section 4).

Built like Gimli (gimli.py), the reference, and in the family of her brother Éomer (eomer.py): every
form a low-segment shape or a hand-placed set of vertices, shaded flat, in the muted green, gold and
earth of Rohan. From the books, not the films: tall and slender, fair, her long hair like a river of
gold, standing as she stood before the Lord of the Nazgûl when the helm of her secrecy had fallen
from her, a sword in her hand and her shield raised.

A woman of Rohan, 1.40 to the crown, a little less than a Man and slimmer: narrow shoulders, a
narrow belted waist, a mail shirt over a green kirtle that flares to the knee, and high riding
boots. Bare-headed, so her pale-gold hair is the first thing seen of her from every side: parted
over a smooth face, framing it in two locks to her breast, and falling down her back over her cloak
to the waist. A Guardian: a round shield held forward on her left arm, a sword raised in her right,
ready to strike.

The team colour is the shield's face and her short cloak, a mantle over the shoulders and a cape
down her back to the hips, seen from the front, from behind and from above. Her hair lies over the
cape, so from behind she is gold as much as the team's colour.

She is rigged as Rohan on foot (../rig.py, ../clips.py), in the family of Éomer, Rohan's reference
rider (eomer.py), and moving as a Man does, with Aragorn's idle and run (aragorn.py). Her boots bend
at the ring round the ankle and her mail at the belt, both split at rings they already had; her
thighs, which the kirtle hid, are added as hose, so a stride or a kneel shows legs rather than empty
boots (24 triangles). Her hair, her locks and her short cloak ride her spine, so her head turns
within her hair. She chops with her sword and her cast (Shieldmaiden) is a parry and a riposte:
the shield up before her face, then the sword driven past it and up at the enemy (riposte).

Her fittings, the shield's boss and rim, the sword's cross-guard and pommel, the belt buckle and the
two round brooches that pin her cloak on her shoulders, use `trim`, which the client colours iron,
silver or gold by star level (docs/viewer-spec.md section 4, "Star levels"); from behind, the
brooches, the sword's fittings and the shield's rim show it. Her golden hair stays her own colour.
Her 2★ model is eowyn-2.py, which imports this script and builds her in its corslet (build()), and
her 3★ model eowyn-3.py.

    blender --background --factory-startup --python-exit-code 1 --python eowyn.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so her right hand, with the sword, is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOTS,
    EYES,
    LEATHER,
    MAIL,
    STEEL,
    WOOD,
    V,
    bone,
    box,
    cone,
    ellipse,
    finish,
    frame,
    lean,
    loft,
    material,
    newell,
    on_surface,
    part,
    reset,
    team_material,
    trim_material,
    tube,
)
from clips import fit  # noqa: E402
from rig import Rig, hold, joint  # noqa: E402

# Éowyn's own colours (sRGB); the rest come from the kit.
SKIN = 0xE4B999  # fair
HAIR = 0xDCB767  # pale gold: brighter than Galadriel's deep gold, warmer than Éomer's flaxen
BROWS = 0x9C7642  # a darker gold, so the brows show on her fair skin
LIPS = 0xA46D5C  # a muted rose-brown, not red
TUNIC = 0x5A6B44  # the green of Rohan, muted, as Éomer's

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        mail=material('mail', MAIL, roughness=0.8, metallic=0.05),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.75),
        brows=material('brows', BROWS, roughness=0.8),
        lips=material('lips', LIPS, roughness=0.8),
        eyes=material('eyes', EYES, roughness=0.6),
        tunic=material('tunic', TUNIC, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        wood=material('wood', WOOD, roughness=0.85),
        # Fittings: the renderer recolours this iron, silver or gold by star level.
        trim=trim_material(),
    )


# Helpers -----------------------------------------------------------------------------------------


def triangles(verts, faces, keep=lambda centre: True):
    """The faces as triangles, for on_surface(), keeping those whose centre passes `keep`."""
    found = []
    for face in faces:
        points = [verts[i] for i in face]
        if keep(sum(points, Vector()) / len(points)):
            found += [(points[0], points[k], points[k + 1]) for k in range(1, len(points) - 1)]
    return found


# Legs --------------------------------------------------------------------------------------------

# Feet apart, the shield-side (left) foot forward, toes turned out a little.
R_HIP, R_ANKLE, R_YAW = V(-0.08, 0.02, 0.64), V(-0.125, 0.085, 0.10), -14
L_HIP, L_ANKLE, L_YAW = V(0.08, -0.01, 0.64), V(0.12, -0.095, 0.10), 10

# A high riding boot. The foot from the sole up, in its own frame (toes towards -y): the height of
# each ring and the right half of it, side, heel and toe, mirrored counter-clockwise by leg().
FOOT = [
    (0.0, [(0.06, -0.012), (0.05, 0.07), (0.045, -0.148)]),  # the sole
    (0.06, [(0.06, -0.006), (0.052, 0.07), (0.045, -0.114)]),  # the instep slopes back from the toe
    (0.15, [(0.055, 0.004), (0.048, 0.056), (0.043, -0.046)]),  # round the ankle
]
# Then up the shin to the knee, round the leg: the height and the radius of each ring.
SHAFT = [(0.26, 0.054), (0.40, 0.064)]
KNEE_AHEAD = 0.012  # the knee, at the top of the boot, a little forward so the leg bends forward
# Her thigh, in the green of her hose, from the hip down into the top of the boot: its radius at each
# end, narrow enough below to stay inside the boot however the knee bends.
THIGH = (0.072, 0.05)
THIGH_INTO_BOOT = 0.045  # how far down into the boot it reaches


def leg(side, hip, ankle, yaw):
    s = side[0]
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    up = hip - ankle

    def axis(z):
        return ankle + up * ((z - ankle.z) / up.z) if z > ankle.z else V(at.x, at.y, z)

    rings = []
    for z, (side_, heel, toe) in FOOT:
        outline = [side_, heel, (-heel[0], heel[1]), (-side_[0], side_[1]), (-toe[0], toe[1]), toe]
        rings.append([at + turn @ V(x, y, z) for x, y in outline])
    for z, r in SHAFT:
        c = axis(z)
        rings.append([c + turn @ V(r * math.cos(a), r * math.sin(a), 0)
                      for a in (math.radians(60 * i) for i in range(6))])
    # The boot as it was built, in two at the ring round the ankle: the foot, which rolls, and the
    # shaft up the shin to the knee.
    for bone_name, name, first, last in ((f'foot_{s}', 'foot', 0, 3), (f'shin_{s}', 'boot', 2, 5)):
        verts, faces, _ = loft(rings[first:last])
        with bone(bone_name):
            part(f'{name}-{side}', verts, faces, M['boots'], inside=lambda c: axis(c.z))
    # Her thigh is hidden under the kirtle, whose hem comes down over the tops of the boots, until it
    # swings forward in a stride or a kneel.
    knee = axis(SHAFT[-1][0]) + KNEE_AHEAD * (turn @ V(0, -1, 0))
    with bone(f'thigh_{s}'):
        tube(f'thigh-{side}', hip, knee, [(0.0, THIGH[0]), (1 + THIGH_INTO_BOOT / (knee - hip).length, THIGH[1])],
             M['tunic'])
    joint(f'hip_{s}', hip)
    joint(f'knee_{s}', knee)
    joint(f'ankle_{s}', ankle)
    joint(f'toe_{s}', at + turn @ V(0, -0.13, 0.03))


def legs():
    leg('right', R_HIP, R_ANKLE, R_YAW)
    leg('left', L_HIP, L_ANKLE, L_YAW)


# Kirtle and mail ---------------------------------------------------------------------------------

# The green kirtle below the mail, flaring to the knee in six folds: z, half-width, half-depth,
# centre y and the depth of the folds. The top ring is hidden under the mail.
KIRTLE = [
    (0.37, 0.235, 0.215, 0.012, 0.028),  # the hem, over the tops of her boots
    (0.49, 0.196, 0.17, 0.006, 0.016),
    (0.64, 0.15, 0.12, 0.0, 0.0),
]


def kirtle(made=None):
    # Her green kirtle, or what her 2★ model wears in its place (`made`), on her hips; the pelvis is
    # where it was either way, so the rig is the same.
    with bone('hips'):
        (made or kirtle_part)()
    joint('pelvis', PELVIS)


def kirtle_part():
    rings = []
    for z, rx, ry, cy, fold in KIRTLE:
        ring = []
        for i in range(12):
            a = math.tau * i / 12
            k = fold if i % 2 else 0.0
            ring.append(V((rx + k) * math.cos(a), cy + (ry + k) * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings)
    part('kirtle', verts, faces, M['tunic'], inside=lambda c: V(0, 0.005, c.z))


# The mail shirt as a barrel of octagons: z, half-width, half-depth, centre y and how far the front
# two points push forward, for her breast. The belt is the band between the third and fourth rings.
TORSO = [
    (0.575, 0.2, 0.17, 0.004, 0.0),  # the hem, flared over the kirtle
    (0.665, 0.17, 0.136, 0.0, 0.0),  # hips
    (0.745, 0.136, 0.104, -0.004, 0.0),  # belt, lower edge
    (0.795, 0.134, 0.102, -0.004, 0.0),  # belt, upper edge: the waist
    (0.895, 0.16, 0.11, 0.0, 0.022),  # the breast
    (0.97, 0.17, 0.104, 0.008, 0.0),  # shoulders
    (1.005, 0.056, 0.052, 0.012, 0.0),  # neck
]
TORSO_BANDS = [0, 0, 1, 0, 0, 0]  # mail, except the belt
# It is in two pieces, which bend at the belt: the skirt and the belt on her hips, and the chest on her
# spine from a ring inside the belt up to her neck, in as many bands as it had.
INSIDE_BELT = (0.76, 0.124, 0.094, -0.004, 0.0)
PELVIS, WAIST = V(0, 0.0, 0.64), V(0, -0.004, 0.77)


def torso_ring(z, rx, ry, cy, forward):
    ring = []
    for i in range(8):
        a = math.radians(22.5 + 45 * i)
        push = forward if math.sin(a) < -0.5 else 0.0
        ring.append(V(rx * math.cos(a), cy + ry * math.sin(a) - push, z))
    return ring


def torso():
    rings = [torso_ring(*level) for level in TORSO]
    verts, faces, bands = loft(rings[:4])
    face_mats = [TORSO_BANDS[b] for b in bands]
    with bone('hips'):
        part('skirt', verts, faces, [M['mail'], M['leather']], face_mats, inside=lambda c: V(0, 0, c.z))
        axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
        box('buckle', V(0, -0.108, 0.77), axes, (0.012, 0.028, 0.026), M['trim'], 0.75)
    verts, faces, _ = loft([torso_ring(*INSIDE_BELT)] + rings[4:])
    with bone('spine'):
        part('chest', verts, faces, M['mail'], inside=lambda c: V(0, 0, c.z))
    joint('waist', WAIST)


# Head --------------------------------------------------------------------------------------------

# The head as rings of eight from the neck up, each from her left side (+X) round the back to her
# right and the front: z, then the left half, mirrored to the right, as (x, y, dz) points, each dz
# above or below z: the side, the back corner, the back, the front corner and the front. The jaw rises
# from a small chin to the ears, under it the throat is in shadow, and the hairline rises to the
# parting in the middle. Above the brow the rings carry the volume of her hair.
HEAD = [
    (0.995, (0.05, 0.008, 0), (0.037, 0.042, 0), (0, 0.052, 0), (0.034, -0.03, 0), (0, -0.038, 0)),  # the neck
    (1.058, (0.05, 0.004, 0), (0.038, 0.046, 0), (0, 0.056, 0), (0.034, -0.032, 0), (0, -0.04, 0)),  # the throat
    (1.09, (0.088, 0.004, 0.028), (0.068, 0.07, 0.034), (0, 0.084, 0.034), (0.042, -0.09, 0.0),
     (0, -0.104, -0.008)),  # the jaw, from the chin up to the ears
    (1.15, (0.106, 0.0, 0), (0.086, 0.084, 0), (0, 0.1, 0), (0.074, -0.094, 0), (0, -0.118, 0)),  # the mouth
    (1.225, (0.118, 0.002, 0), (0.096, 0.094, 0), (0, 0.114, 0), (0.086, -0.1, 0), (0, -0.12, 0)),  # the eyes
    (1.29, (0.126, 0.006, 0), (0.104, 0.104, 0), (0, 0.124, 0), (0.086, -0.102, 0), (0, -0.12, 0)),  # the brow
    (1.33, (0.132, 0.01, 0), (0.108, 0.108, 0), (0, 0.13, 0), (0.08, -0.1, -0.012), (0, -0.112, 0.014)),  # hairline
    (1.385, (0.104, 0.014, -0.012), (0.086, 0.094, -0.004), (0, 0.108, 0), (0.066, -0.078, -0.004),
     (0, -0.084, 0)),  # the top, falling away to the sides from the parting
]
# The parting runs over the crown from the front of her head to the back, a low ridge.
PARTING = [V(0, -0.036, 1.414), V(0, 0.066, 1.404)]
# Which faces of each band are skin, by their place round the ring: 4 to 7 are her right side, the
# right and left of her face and her left side; the rest are hair.
SKIN_FACES = [{4, 5, 6, 7}] * 4 + [{5, 6}, {5, 6}, set()]


def head_ring(z, side, back_corner, back, front_corner, front):
    (sx, sy, sz), (bx, by, bz), (_, cy, cz), (fx, fy, fz), (_, ny, nz) = side, back_corner, back, front_corner, front
    return [V(sx, sy, z + sz), V(bx, by, z + bz), V(0, cy, z + cz), V(-bx, by, z + bz), V(-sx, sy, z + sz),
            V(-fx, fy, z + fz), V(0, ny, z + nz), V(fx, fy, z + fz)]


def head():
    rings = [head_ring(*r) for r in HEAD]
    verts, faces, bands = loft(rings)
    face_mats = [0 if i % 8 in SKIN_FACES[b] else 1 for i, b in zip(range(len(faces)), bands)]
    # Over the top, the hair falls away either side of the parting: front (a) and back (b).
    t, a, b = (len(rings) - 1) * 8, len(verts), len(verts) + 1
    verts += PARTING
    top = [(t + 6, t + 7, a), (t + 7, t, b, a), (t, t + 1, b), (t + 1, t + 2, b),
           (t + 6, t + 5, a), (t + 5, t + 4, b, a), (t + 4, t + 3, b), (t + 3, t + 2, b)]
    faces += top
    face_mats += [1] * len(top)
    part('head', verts, faces, [M['skin'], M['hair']], face_mats, inside=V(0, 0.0, 1.2))

    # The planes either side of the middle of her face, for laying details on.
    face = []
    for r in range(2, 6):
        lo, hi = rings[r], rings[r + 1]
        for a, b in ((5, 6), (6, 7)):
            face += [(lo[a], lo[b], hi[b]), (lo[a], hi[b], hi[a])]

    # Wide almond eyes, level and steady: inner corner, top, outer corner and bottom.
    for s in (-1, 1):
        corners = [(s * 0.022, 1.24), (s * 0.048, 1.255), (s * 0.08, 1.249), (s * 0.052, 1.233)]
        verts = [V(x, on_surface(face, x, z) - 0.005, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2, 3)], M['eyes'], outward=V(0, -1, 0))

    # Fine straight brows, a little lower at the inner ends: she is grave, not gentle.
    for s in (-1, 1):
        points = [(s * 0.02, 1.27), (s * 0.052, 1.284), (s * 0.082, 1.279), (s * 0.081, 1.27),
                  (s * 0.052, 1.274), (s * 0.022, 1.261)]
        verts = [V(x, on_surface(face, x, z) - 0.006, z) for x, z in points]
        part(f'brow-{s}', verts, [(0, 1, 4, 5), (1, 2, 3, 4)], M['brows'], outward=V(0, -1, 0))

    # A small mouth.
    points = [(-0.026, 1.146), (0, 1.151), (0.026, 1.146), (0, 1.138)]
    verts = [V(x, on_surface(face, x, z) - 0.004, z) for x, z in points]
    part('mouth', verts, [(0, 1, 2, 3)], M['lips'], outward=V(0, -1, 0))

    # A small straight nose.
    top, tip, under = V(0, -0.122, 1.265), V(0, -0.143, 1.196), V(0, -0.117, 1.186)
    left, right = V(0.019, -0.113, 1.198), V(-0.019, -0.113, 1.198)
    verts = [top, tip, under, left, right]
    part('nose', verts, [(0, 3, 1), (0, 1, 4), (3, 2, 1), (1, 2, 4)], M['skin'], inside=V(0, -0.09, 1.22))
    return rings


def side_locks():
    # A lock either side of her face, from under the hair at her temple down past the cheek and over
    # the front of her shoulder to her breast: rows of its inner edge, its ridge and its outer edge,
    # ending in a point.
    for s in (-1, 1):
        rows = [
            [V(s * 0.077, -0.09, 1.34), V(s * 0.098, -0.046, 1.345), V(s * 0.12, 0.0, 1.345)],
            [V(s * 0.1, -0.09, 1.2), V(s * 0.134, -0.08, 1.2), V(s * 0.142, -0.008, 1.2)],
            [V(s * 0.094, -0.106, 1.06), V(s * 0.134, -0.116, 1.06), V(s * 0.158, -0.05, 1.06)],
            [V(s * 0.098, -0.126, 0.95), V(s * 0.134, -0.144, 0.95), V(s * 0.17, -0.096, 0.95)],
        ]
        verts, faces, _ = loft(rows, closed=False)
        verts.append(V(s * 0.124, -0.144, 0.86))
        faces += [(9, 10, 12), (10, 11, 12)]
        part(f'lock-{s}', verts, faces, M['hair'], inside=lambda c: V(0, 0.0, c.z))


# Team colour: a mantle over the shoulders and a short cape down her back -------------------------


def mantle():
    # Eight points round the neck and the shoulders, starting at her left shoulder (+X); the front
    # dips at her throat and the back rises where her hair falls over it.
    neck_z = [1.03, 1.045, 1.06, 1.045, 1.03, 1.012, 1.0, 1.012]
    neck = ellipse(0, 0.012, 0, 0.068, 0.064, 8, 0, neck_z)
    dome = ellipse(0, 0.01, 0, 0.17, 0.13, 8, 0, [z - 0.045 for z in neck_z])
    shoulder_z = [0.935, 0.945, 0.955, 0.945, 0.935, 0.935, 0.935, 0.935]
    shoulder = ellipse(0, 0.008, 0, 0.245, 0.162, 8, 0, shoulder_z)
    hem = ellipse(0, 0.008, 0, 0.238, 0.157, 8, 0, [z - 0.05 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('mantle', verts, faces, M['team'], inside=V(0, 0.01, 0.9))
    brooches()
    return triangles(verts, faces, lambda c: c.y > 0.03)


def brooches():
    # A round brooch on top of each shoulder, pinning the cloak there: a low six-sided boss where
    # the sleeve meets the mantle, facing up and a little out, beside her hair, so it shows from in
    # front, from behind and from above.
    for side, shoulder, elbow in (('right', R_SHOULDER, R_ELBOW), ('left', L_SHOULDER, L_ELBOW)):
        top, normal = shoulder_top(shoulder, elbow)
        cone(f'brooch-{side}', top - 0.004 * normal, top + 0.016 * normal, 0.028, M['trim'], n=6, back=None)


def shoulder_top(shoulder, elbow):
    """The top of a sleeve where it leaves the shoulder, and the way up and out from it."""
    _, v = frame(elbow - shoulder)
    up = -v if v.z < 0 else v
    return shoulder + 0.05 * up, (up + V(0, 0, 1)).normalized()


# The cape, from under the mantle to her hips. Each level: z at the middle and at the edges,
# half-width, half-depth, centre y, how far short of the sides it stops (degrees) and how deep the
# folds are.
CAPE = [
    (0.93, 0.93, 0.218, 0.152, 0.012, 30, 0.0),
    (0.76, 0.78, 0.222, 0.168, 0.02, 26, 0.018),
    (0.57, 0.62, 0.232, 0.19, 0.032, 18, 0.034),
]


def cape():
    rings = []
    for middle, edge, rx, ry, cy, spread, fold in CAPE:
        ring = []
        for i in range(9):
            a = math.radians(spread + (180 - 2 * spread) * i / 8)
            k = 1 + (fold / ry if i % 2 else 0)
            z = edge + (middle - edge) * math.sin(a) ** 2
            ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    part('cape', verts, faces, M['team'], inside=lambda c: V(0, 0.0, c.z))
    return triangles(verts, faces)


def hair_fall(back, head_rings):
    # Her long hair from the back of her head down over the mantle and the cape to her waist, in
    # three locks: rows across her back from her left to her right, edge, ridge, valley, ridge,
    # valley, ridge, edge, the lower ones laid on the cloak, each lock ending in a point.
    across = (1, 0.66, 0.33, 0, -0.33, -0.66, -1)
    lift = (0.008, 0.03, 0.014, 0.032, 0.014, 0.03, 0.008)  # how far each stands off the cloak

    def on_cloak(x, z, out):
        return V(x, on_surface(back, x, z) + out, z)

    # From the widest ring of her hair, round the back of her head from side to side.
    ring = head_rings[6]
    top = [ring[0], ring[1], (ring[1] + ring[2]) / 2, ring[2], (ring[2] + ring[3]) / 2, ring[3], ring[4]]
    top = [p + 0.004 * V(p.x, p.y, 0).normalized() for p in top]
    nape = [V(0.125 * f, 0.135 + o, 1.1) for f, o in zip(across, lift)]
    rows = [top, nape]
    for z, half in ((0.95, 0.118), (0.82, 0.088)):
        rows.append([on_cloak(f * half, z, out) for f, out in zip(across, lift)])
    verts, faces, _ = loft(rows, closed=False)
    n = len(verts)
    q = list(range(n - 7, n))  # the last row
    for f, z in ((0.66, 0.74), (0.0, 0.7), (-0.66, 0.74)):
        verts.append(on_cloak(f * 0.088, z, 0.02))
    faces += [(q[0], q[1], n), (q[1], q[2], n), (q[2], q[3], n + 1), (q[3], q[4], n + 1),
              (q[4], q[5], n + 2), (q[5], q[6], n + 2)]
    part('hair-fall', verts, faces, M['hair'], inside=lambda c: V(0, 0.0, c.z))


# Arms: mail sleeves to the elbow, the green of her kirtle below, leather bracers, fists ----------

R_SHOULDER, L_SHOULDER = V(-0.16, 0.005, 0.962), V(0.16, 0.005, 0.962)
# The sword arm raised out to her side, the fist at the height of her head.
R_ELBOW, R_WRIST, R_FIST = V(-0.37, 0.035, 0.88), V(-0.4, -0.045, 1.09), V(-0.405, -0.058, 1.128)
# The shield arm bent, the forearm forward through the straps to the grip.
L_ELBOW = V(0.28, 0.04, 0.82)


def arm(side, shoulder, elbow, wrist, fist, grip):
    """A mail sleeve, a bracer and a fist closed round a grip running along `grip`. The sleeve runs on
    past the elbow and the bracer starts above it, so the elbow bends without a gap."""
    s = side[0]
    with bone(f'upper_arm_{s}'):
        tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.058), (1.1, 0.048)], M['mail'])
    with bone(f'forearm_{s}'):
        forearm = [(-0.15, 0.045), (0.4, 0.05), (1.0, 0.045)]
        tube(f'forearm-{side}', elbow, wrist, forearm, [M['tunic'], M['leather']], [0, 1])
    along = Vector(grip).normalized()
    ahead = wrist - elbow
    ahead = (ahead - ahead.dot(along) * along).normalized()
    with bone(f'hand_{s}'):
        box(f'fist-{side}', fist, [ahead, along, ahead.cross(along)], (0.042, 0.046, 0.044), M['skin'], 0.88)
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)
    joint(f'fist_{s}', fist)


# Sword, raised in her right hand -----------------------------------------------------------------

SWORD = V(-0.32, -0.06, 1.0).normalized()  # up and out to her side, a little forward


def sword():
    with bone('hand_r'):
        point, edge = blade()
    # Held by the grip in her fist, from it to the point, an edge out to her right.
    hold('r', R_FIST, point, point + 0.1 * edge)
    arm('right', R_SHOULDER, R_ELBOW, R_WRIST, R_FIST, SWORD)


def blade():
    """Builds the sword in her fist and returns its point and the way an edge faces."""
    along = SWORD
    across = along.cross(V(0, 1, 0)).normalized()  # the edges, out to the sides
    thick = across.cross(along)  # the flats face forward and back
    guard = R_FIST + 0.062 * along

    def section(c, w, t):
        return [c + w * across, c + t * thick, c - w * across, c - t * thick]

    # The blade: a flattened diamond in section, narrowing a little to its point.
    rings = [section(guard, 0.041, 0.012), section(guard + 0.46 * along, 0.034, 0.01)]
    verts, faces, _ = loft(rings)
    verts.append(guard + 0.58 * along)
    faces += [(4 + i, 4 + (i + 1) % 4, 8) for i in range(4)]
    part('blade', verts, faces, M['steel'], inside=guard + 0.25 * along)
    # A cross-guard over her fist and a pommel under it.
    box('guard', guard, [along, across, thick], (0.016, 0.085, 0.02), M['trim'], 0.8)
    pommel = R_FIST - 0.062 * along
    cone('pommel', pommel + 0.012 * along, pommel - 0.03 * along, 0.024, M['trim'], n=4, back=pommel + 0.03 * along)
    return guard + 0.58 * along, across


# Shield, on her left arm -------------------------------------------------------------------------

SHIELD_CENTRE = V(0.27, -0.21, 0.815)
SHIELD_TURN = Matrix.Rotation(math.radians(34), 3, 'Z') @ Matrix.Rotation(math.radians(-12), 3, 'X')


def shield():
    with bone('hand_l'):
        board()
    # Held by the grip behind the boss, up to the top of its rim, its face to the front.
    top = SHIELD_CENTRE + SHIELD_TURN @ V(0, 0, 0.245)
    fist = SHIELD_CENTRE + SHIELD_TURN @ V(0, 0.05, 0)
    hold('l', fist, top, top + SHIELD_TURN @ V(0, -0.1, 0))
    # The left arm comes from behind to the grip behind the boss.
    wrist = fist + (L_ELBOW - fist).normalized() * 0.04
    arm('left', L_SHOULDER, L_ELBOW, wrist, fist, SHIELD_TURN @ V(0, 0, 1))


def board():
    # Built facing -Y round the origin, as one profile turned round the axis: from the rim's outer
    # edge over its crest, down the team-coloured face to the boss; the rim and boss are trim. The
    # rim is a ridge, so no one point is inside every face: the profile is wound as a whole instead.
    n = 12
    profile = [  # radius, y
        (0.245, 0.0),  # outer edge
        (0.237, -0.03),  # crest of the rim
        (0.214, -0.02),  # inner edge of the rim, where the face starts
        (0.072, -0.042),  # foot of the boss
    ]
    band_mats = [1, 1, 0]  # the rim in trim, then the team-coloured face

    def ring(r, y):
        angles = (math.tau * (i + 0.5) / n for i in range(n))
        return [V(r * math.cos(a), y, r * math.sin(a)) for a in angles]

    verts, faces, bands = loft([ring(r, y) for r, y in profile])
    face_mats = [band_mats[b] for b in bands]
    apex, last = len(verts), (len(profile) - 1) * n
    verts.append(V(0, -0.092, 0))
    faces += [(last + i, last + (i + 1) % n, apex) for i in range(n)]
    face_mats += [1] * n  # the boss
    faces.append(tuple(reversed(range(n))))  # the boards behind, wound to match the rim
    face_mats.append(2)
    if newell([verts[i] for i in faces[-2]]).y > 0:  # the boss's tip must face forward
        faces = [tuple(reversed(f)) for f in faces]
    verts = [SHIELD_CENTRE + SHIELD_TURN @ v for v in verts]
    part('shield', verts, faces, [M['team'], M['trim'], M['wood']], face_mats)


LEAN = 4  # degrees her body above the hips leans forward, into the fight
NECK = V(0, 0.012, 1.02)  # where her head turns, in the mantle's collar
CROWN = V(0, 0.015, 1.414)  # the top of her head, on the parting

# Her clips (../clips.py): Rohan on foot, as a Man moves, with Aragorn's idle and run (aragorn.py), the
# shield held up as she runs as Beregond's is (beregond.py). She chops with her sword, from high over
# her shoulder, wide of her hair, down and out to her right so the blow shows past her from behind,
# her elbow leading the blade forward and down on the frame before it lands, the blade already
# turned further down there (elbow, early), and lifting it back a frame later (slow), so the sword
# doesn't swing out of her hex between frames; her cast (Shieldmaiden) is a parry and a riposte:
# the shield up before her face, then the sword driven past it and up at the enemy. Stunned, the
# raised sword droops to her hip; she dies on her knees with her shield still before her, and wins
# with the sword held high.
CLIPS = fit({
    'idle': ('ready', {}),
    'move': ('run', {'heavy': 0.3, 'lean': 10.0, 'off': 'high'}),
    'attack': ('chop', {'wide': 0.2, 'steep': 10.0, 'out': 25.0, 'elbow': 0.75, 'early': 15.0, 'slow': 1}),
    'cast': ('riposte', {}),
    'stun': ('dazed', {'low': 1.0}),
    'death': ('knees', {'slump': 0.8}),
    'victory': ('raise', {'out': 0.3}),
}, between=True)


def build(corslet=None):
    """Makes her in a fresh scene, every part bound to its bone and the joints marked, and returns the
    rig to finish() her with. Her 2★ model (eowyn-2.py) passes its corslet as `corslet`, a function
    that makes its long skirt in place of the kirtle, on her hips, before she leans."""
    reset()
    make_materials()
    legs()
    kirtle(corslet)
    lower = set(bpy.context.scene.objects)
    torso()
    with bone('head'):
        head_rings = head()
    joint('neck', NECK)
    joint('crown', CROWN)
    # Her hair and her short cloak ride her spine, so her head turns within her hair.
    with bone('spine'):
        side_locks()
        back = mantle()
        back += cape()
        hair_fall(back, head_rings)
    sword()
    shield()
    lean([o for o in bpy.context.scene.objects if o not in lower], V(0, 0, 0.62), LEAN)
    return Rig(clips=CLIPS)


def main():
    finish('eowyn', rig=build())


if __name__ == '__main__':
    main()
