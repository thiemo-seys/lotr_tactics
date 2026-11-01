"""Háma, captain of the King's guard: his 3★ model, the book moment (docs/viewer-spec.md section 4, "Star
levels").

The same Háma as hama.py, at his height in the books: captain of the King's guard, riding with
Théoden to Helm's Deep, where he fell before the Gate of the Hornburg and was laid in a grave of his
own beneath its shadow (The Two Towers, III 7 and 8). He is on foot, as on the 1★, with the round
shield forward on his left arm and the ash spear planted by his right foot, so he is still read as
a Guardian, and he keeps the shoulder-guards of his 2★ model (hama-2.py).

What marks him out is what the books give the guards of Meduseld and the leaders of the Mark:
- the long bright corslet of the guards at the doors (III 6), burnished pale and reaching to his
  shins;
- a captain's crest: his own brush of horse-hair along the helm, white now, as the leader of the
  Riders in III 2 wears a white horse-tail on his helm, and a long white tail springing from it,
  arching up over the crown and falling down his back over his golden hair. The brush keeps it his:
  Éomer's plume rises from the top of a plain helm;
- a long cloak in the team colour, to the calves, over the mantle;
- the sun on his shield, with the shield's rim bound in `trim` like its boss.

His fittings, the helm's band, the shield's rim and boss, the belt buckle, the spear's socket, the
brooches and the shoulder-guards' edges, use `trim`, which the client colours gold at 3★.

    blender --background --factory-startup --python-exit-code 1 --python hama-3.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand, on the spear, is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOTS,
    BRASS,
    BOOK_BUDGET,
    EYES,
    LEATHER,
    STEEL,
    WOOD,
    V,
    bent_tube,
    box,
    cone,
    ellipse,
    finish,
    frame,
    loft,
    material,
    nearest_on_polyline,
    newell,
    on_surface,
    part,
    reset,
    team_material,
    trim_material,
    tube,
    wind,
)

# Háma's own colours (sRGB); the rest come from the kit.
SKIN = 0xD9A383
HAIR = 0xCDAA66  # wheat-gold: deeper than Éomer's flaxen and Éowyn's pale gold
CREST = 0xE4DFD2  # the captain's crest of white horse-hair
CORSLET = 0xBAC2C9  # the long corslet, burnished pale
TUNIC = 0x5A6B44  # the green of Rohan, muted, as Éomer's

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        mail=material('mail', CORSLET, roughness=0.45, metallic=0.15),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.9),
        crest=material('crest', CREST, roughness=0.95),
        tunic=material('tunic', TUNIC, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        gilt=material('gilt', BRASS, roughness=0.55, metallic=0.1),  # the sun blazoned on his shield
        wood=material('wood', WOOD, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
        # Fittings: the renderer recolours this iron, silver or gold by star level.
        trim=trim_material(),
    )


def flat(name, points, faces, mat, normal, lift=0.0):
    """A flat detail laid on a surface, lifted off it by `lift` along `normal` and wound to face it."""
    normal = Vector(normal).normalized()
    verts = [Vector(p) + lift * normal for p in points]
    return part(name, verts, faces, mat, outward=normal)


# The body above the hips leans forward a little, into the fight; the legs and the planted spear
# stay where they are.
LEAN = 3
PIVOT = V(0, 0, 0.40)
LEANING = Matrix.Translation(PIVOT) @ Matrix.Rotation(math.radians(LEAN), 4, 'X') @ Matrix.Translation(-PIVOT)


# Legs --------------------------------------------------------------------------------------------

# Feet planted wide, the shield-side (left) foot forward, toes turned out.
R_HIP, R_ANKLE, R_YAW = V(-0.1, 0.02, 0.62), V(-0.17, 0.07, 0.11), -14
L_HIP, L_ANKLE, L_YAW = V(0.1, -0.01, 0.62), V(0.165, -0.085, 0.11), 12

# A high riding boot. The foot from the sole up, in its own frame (toes towards -y): the height of
# each ring and the right half of it, side, heel and toe, mirrored counter-clockwise by leg().
FOOT = [
    (0.0, [(0.078, -0.016), (0.066, 0.086), (0.06, -0.174)]),  # the sole
    (0.075, [(0.078, -0.008), (0.068, 0.088), (0.06, -0.132)]),  # the instep slopes back from the toe
    (0.18, [(0.072, 0.004), (0.064, 0.072), (0.058, -0.056)]),  # round the ankle
]
SHAFT = [(0.30, 0.077)]  # then up the shin: the height and the radius of the boot's top
CUFF = (0.265, 0.33, 1.2)  # the turned-down cuff: from and to (z), and how much wider than the boot


def leg(side, hip, ankle, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    up = hip - ankle

    def axis(z):
        return ankle + up * ((z - ankle.z) / up.z) if z > ankle.z else V(at.x, at.y, z)

    def hexagon(z, r):
        angles = (math.radians(60 * i) for i in range(6))
        return [axis(z) + turn @ V(r * math.cos(a), r * math.sin(a), 0) for a in angles]

    rings = []
    for z, (s, heel, toe) in FOOT:
        outline = [s, heel, (-heel[0], heel[1]), (-s[0], s[1]), (-toe[0], toe[1]), toe]
        rings.append([at + turn @ V(x, y, z) for x, y in outline])
    rings += [hexagon(z, r) for z, r in SHAFT]
    verts, faces, _ = loft(rings)
    part(f'boot-{side}', verts, faces, M['boots'], inside=lambda c: axis(c.z))
    low, high, k = CUFF
    verts, faces, _ = loft([hexagon(z, SHAFT[-1][1] * k) for z in (low, high)])
    part(f'cuff-{side}', verts, faces, M['leather'], inside=lambda c: axis(c.z))
    # The leg in the green of Rohan, from the hip into the boot; the coat hides all but the knee.
    tube(f'leg-{side}', hip, axis(0.3), [(0, 0.1), (1, 0.075)], M['tunic'])


def legs():
    leg('right', R_HIP, R_ANKLE, R_YAW)
    leg('left', L_HIP, L_ANKLE, L_YAW)


# Body --------------------------------------------------------------------------------------------

# The long corslet as a barrel of octagons from the hem at his shins to the neck: z, half-width,
# half-depth and centre y. The belt is the band between the third and fourth rings. Above the chest
# the coat is hidden under the mantle, so it runs straight to the neck.
COAT = [
    (0.30, 0.272, 0.24, 0.012),  # the hem, flared round the shins
    (0.665, 0.208, 0.156, 0.0),  # hips
    (0.705, 0.2, 0.15, -0.004),  # belt, lower edge
    (0.765, 0.206, 0.154, -0.004),  # belt, upper edge
    (0.885, 0.248, 0.17, -0.008),  # chest, inside the mantle's hem
    (1.0, 0.08, 0.074, 0.01),  # neck
]
COAT_BANDS = [0, 0, 1, 0, 0]  # mail, except the belt
BUCKLE = V(0, -0.152, 0.735)  # on the flat front of the belt


def coat():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in COAT]
    verts, faces, bands = loft(rings)
    face_mats = [COAT_BANDS[b] for b in bands]
    # The green tunic's dagged hem hangs below the mail in a point under each side, flared out.
    hem = rings[0]
    for i in range(8):
        a, b = hem[i], hem[(i + 1) % 8]
        mid = (a + b) / 2
        out = V(mid.x, mid.y - COAT[0][3], 0).normalized()
        verts.append(V(mid.x, mid.y, mid.z - 0.075) + 0.02 * out)
        faces.append((i, (i + 1) % 8, len(verts) - 1))
        face_mats.append(2)
    part('coat', verts, faces, [M['mail'], M['leather'], M['tunic']], face_mats, inside=lambda c: V(0, 0, c.z))
    # The belt buckle, its face smaller than its back so the edges read as a bevel.
    box('buckle', BUCKLE, [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)], (0.014, 0.036, 0.032), M['trim'], 0.75)


# Head --------------------------------------------------------------------------------------------

# The head as rings of eight from the neck up to under the helm's brim. Each ring is z, then the
# left half, mirrored to the right: the side, the back corner, the back's y, the front corner and
# the front's y.
HEAD = [
    (1.0, (0.084, 0.014), (0.06, 0.068), 0.082, (0.058, -0.05), -0.062),  # the neck, in the collar
    (1.065, (0.106, 0.006), (0.078, 0.082), 0.098, (0.076, -0.092), -0.118),  # under the jaw; the chin
    (1.135, (0.122, 0.0), (0.094, 0.094), 0.112, (0.09, -0.106), -0.132),  # the mouth
    (1.205, (0.13, 0.004), (0.104, 0.102), 0.122, (0.098, -0.108), -0.132),  # cheekbones and eyes
    (1.262, (0.128, 0.008), (0.102, 0.104), 0.124, (0.094, -0.106), -0.126),  # the brow, under the brim
]
# Faces 4 to 7 of each band, round the ring, are his right cheek, the two halves of his face and his
# left cheek: skin. The rest are the hair at the back of his head.
SKIN_FACES = {4, 5, 6, 7}


def head_ring(z, side, back_corner, back_y, front_corner, front_y):
    (sx, sy), (bx, by), (fx, fy) = side, back_corner, front_corner
    return [V(sx, sy, z), V(bx, by, z), V(0, back_y, z), V(-bx, by, z), V(-sx, sy, z), V(-fx, fy, z),
            V(0, front_y, z), V(fx, fy, z)]


def head():
    rings = [head_ring(*r) for r in HEAD]
    verts, faces, _ = loft(rings)
    face_mats = [0 if i % 8 in SKIN_FACES else 1 for i in range(len(faces))]
    part('head', verts, faces, [M['skin'], M['hair']], face_mats, inside=V(0, 0.0, 1.15))

    # The planes of his face either side of the middle, for laying details on.
    face = []
    for r in range(1, 4):
        lo, hi = rings[r], rings[r + 1]
        for a, b in ((5, 6), (6, 7)):
            face += [(lo[a], lo[b], hi[b]), (lo[a], hi[b], hi[a])]

    # Eyes in the shade of the brim, laid just proud of the face.
    for s in (-1, 1):
        corners = [(s * 0.022, 1.205), (s * 0.076, 1.209), (s * 0.05, 1.188)]
        verts = [V(x, on_surface(face, x, z) - 0.004, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A straight, strong nose from under the brow to its tip.
    top, tip = V(0, -0.126, 1.222), V(0, -0.17, 1.146)
    left, right, under = V(-0.028, -0.122, 1.146), V(0.028, -0.122, 1.146), V(0, -0.132, 1.134)
    verts = [top, tip, left, right, under]
    part('nose', verts, [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)], M['skin'], inside=V(0, -0.09, 1.18))

    # Stern brows: a bar under the brim, lower in the middle.
    sections = [
        [V(x, y, 1.236 + dz), V(x, y - 0.022, 1.222 + dz), V(x, y + 0.004, 1.206 + dz)]
        for x, y, dz in ((-0.098, -0.1, 0.004), (0, -0.13, -0.006), (0.098, -0.1, 0.004))
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brows', verts, faces, M['hair'], inside=V(0, -0.08, 1.22))


def beard():
    # A short full beard along the jaw, to a blunt point under the chin. Each row runs from his
    # right side across the front to his left: along the cheekbones and over the lip, then its end.
    half = [
        [(-0.13, -0.02, 1.175), (-0.114, -0.088, 1.148), (-0.07, -0.124, 1.122), (0.0, -0.14, 1.112)],
        [(-0.11, -0.03, 1.07), (-0.094, -0.108, 1.032), (-0.054, -0.152, 1.0), (0.0, -0.164, 0.974)],
    ]
    rows = []
    for level in half:
        right = [V(*p) for p in level]
        rows.append(right + [V(-p.x, p.y, p.z) for p in reversed(right[:-1])])
    verts, faces, _ = loft(rows, closed=False)
    part('beard', verts, faces, M['hair'], inside=lambda c: V(0, -0.02, c.z + 0.03))


# A tall helm of eight facets, round-shouldered, on a band: z and radius from the brim up.
HELM = [(1.232, 0.152), (1.282, 0.152), (1.36, 0.132), (1.41, 0.084)]
HELM_TOP = V(0, 0, 1.434)


def helm():
    rings = [ellipse(0, 0, z, r, r, 8, 0) for z, r in HELM]
    verts, faces, bands = loft(rings)
    face_mats = [0 if b < 1 else 1 for b in bands]
    last = (len(HELM) - 1) * 8
    verts.append(HELM_TOP)
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    face_mats += [1] * 8
    part('helm', verts, faces, [M['trim'], M['steel']], face_mats, inside=V(0, 0, 1.26))

    # Cheek-guards hanging from the brim beside his face.
    for s in (-1, 1):
        verts = [V(s * 0.15, -0.075, 1.235), V(s * 0.15, 0.06, 1.235), V(s * 0.138, 0.04, 1.122),
                 V(s * 0.134, -0.06, 1.122)]
        part(f'cheek-guard-{s}', verts, [(0, 1, 2, 3)], M['steel'], outward=V(s, 0, 0))


# The brush of horse-hair along the helm's crest: stations from the brow over the crown to the
# nape, each a point on the helm's ridge, how high the brush stands there, how wide it splays at its
# edge and how much the middle of the edge stands proud.
CREST_STATIONS = [
    (V(0, -0.132, 1.36), 0.028, 0.03, 0.008),
    (V(0, -0.084, 1.41), 0.062, 0.05, 0.012),
    (V(0, 0.0, 1.436), 0.078, 0.058, 0.014),
    (V(0, 0.084, 1.41), 0.076, 0.056, 0.014),
    (V(0, 0.134, 1.325), 0.058, 0.046, 0.012),
]


# The captain's tail, from inside the brush over the crown: up and back over it, then down his back
# clear of his hair, as points on its middle line with their half-width and half-depth.
TAIL = [V(0, 0.03, 1.49), V(0, 0.12, 1.555), V(0, 0.215, 1.53), V(0, 0.285, 1.425), V(0, 0.305, 1.26),
        V(0, 0.3, 1.1)]
TAIL_RADII = [(0.022, 0.016), (0.034, 0.022), (0.044, 0.026), (0.05, 0.028), (0.05, 0.026), (0.044, 0.022)]
TAIL_TIP = V(0, 0.292, 0.955)


def crest():
    # A stiff brush of white horse-hair standing along the helm from the brow over the top to the
    # nape, like a horse's cropped mane: narrow at its root, splayed at its edge and ridged along
    # it, low over the brow and tallest over the crown. A long tail springs from it.
    centre = V(0, 0, 1.3)
    rings, inner = [], []
    for p, h, splay, ridge in CREST_STATIONS:
        out = (p - centre).normalized()
        b, t = p - 0.008 * out, p + h * out
        rings.append([b + V(0.02, 0, 0), t + V(splay, 0, 0), t + ridge * out, t - V(splay, 0, 0), b - V(0.02, 0, 0)])
        inner.append(p - 0.03 * out)
    verts, faces, _ = loft(rings, closed=False)
    faces = wind(verts, faces, inside=nearest_on_polyline(inner))
    first, last = CREST_STATIONS[0][0], CREST_STATIONS[-1][0]
    end = (len(rings) - 1) * 5
    faces += wind(verts, [(0, 1, 2), (0, 2, 3), (0, 3, 4)], outward=first - CREST_STATIONS[1][0])
    faces += wind(verts, [(end, end + 1, end + 2), (end, end + 2, end + 3), (end, end + 3, end + 4)],
                  outward=last - CREST_STATIONS[-2][0])
    part('crest', verts, faces, M['crest'])
    bent_tube('tail', TAIL, TAIL_RADII, M['crest'], n=4, phase=0, side=V(1, 0, 0), end=TAIL_TIP)


def hair():
    # Fair hair from under the helm down his back to his shoulder-blades, narrowing over the mantle
    # to locks on the cape. Each row runs from his left side round the back to his right.
    halves = [  # his left side, the back corner and the middle of the back; mirrored to his right
        [(0.146, 0.0, 1.24), (0.103, 0.103, 1.24), (0, 0.146, 1.24)],  # under the helm's brim
        [(0.15, 0.06, 1.08), (0.115, 0.165, 1.07), (0, 0.205, 1.06)],  # the nape
        [(0.112, 0.226, 0.96), (0.07, 0.25, 0.942), (0, 0.258, 0.932)],  # over the mantle
    ]
    rows = [[V(*p) for p in half] + [V(-x, y, z) for x, y, z in reversed(half[:-1])] for half in halves]
    verts, faces, _ = loft(rows, closed=False)
    # A lock hanging from the ends between each pair of points.
    start = (len(rows) - 1) * 5
    for i in range(4):
        mid = (verts[start + i] + verts[start + i + 1]) / 2
        verts.append(mid + V(0, 0.01, -0.075))
        faces.append((start + i, start + i + 1, len(verts) - 1))
    part('hair', verts, faces, M['hair'], inside=lambda c: V(0, 0.0, c.z))

    # His golden hair braided on his shoulders: a braid from under each cheek-guard down over the
    # front of his mantle.
    for s in (-1, 1):
        points = [V(s * 0.13, -0.03, 1.15), V(s * 0.165, -0.12, 1.02), V(s * 0.176, -0.212, 0.9)]
        bent_tube(f'braid-{s}', points, [0.027, 0.032, 0.029], M['hair'], n=3, phase=90 * s, start='cap',
                  end=V(s * 0.176, -0.228, 0.83))


# Team colour: his short cloak, a mantle over the shoulders and a cape down his back ---------------


def mantle():
    # Eight points round the neck and the shoulders, starting at his left shoulder (+X); the front
    # dips under the beard and the back rises behind his neck.
    neck_z = [1.035, 1.045, 1.055, 1.045, 1.035, 1.015, 1.005, 1.015]
    neck = ellipse(0, 0.012, 0, 0.112, 0.1, 8, 0, neck_z)
    dome = ellipse(0, 0.01, 0, 0.25, 0.178, 8, 0, [z - 0.048 for z in neck_z])
    shoulder_z = [0.94, 0.95, 0.96, 0.95, 0.94, 0.935, 0.93, 0.935]
    shoulder = ellipse(0, 0.008, 0, 0.32, 0.218, 8, 0, shoulder_z)
    hem = ellipse(0, 0.008, 0, 0.31, 0.208, 8, 0, [z - 0.075 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('mantle', verts, faces, M['team'], inside=V(0, 0.01, 0.88))

    # A round brooch on top of each shoulder, pinning the cape to the mantle: a low six-sided boss
    # on the slope between the dome and the shoulder, facing up and out, so it shows from in front,
    # from behind and from above.
    for s, i in ((1, 0), (-1, 4)):
        top, edge = dome[i], shoulder[i]
        normal = V(s * (top.z - edge.z), 0, abs(edge.x - top.x)).normalized()
        at = top.lerp(edge, 0.45)
        cone(f'brooch-{s}', at - 0.004 * normal, at + 0.016 * normal, 0.03, M['trim'], n=6, back=None)


def cape():
    # A captain's long cloak, down his back to the calves, clear of the corslet's flare. Each level:
    # z at the middle and at the edges, half-width, half-depth, centre y, how far short of the sides
    # it stops (degrees) and how deep the folds are.
    levels = [
        (0.935, 0.935, 0.282, 0.19, 0.02, 26, 0.0),
        (0.70, 0.73, 0.296, 0.228, 0.026, 16, 0.03),
        (0.40, 0.45, 0.312, 0.272, 0.036, 10, 0.045),
    ]
    rings = []
    for middle, edge, rx, ry, cy, spread, fold in levels:
        ring = []
        for i in range(9):
            a = math.radians(spread + (180 - 2 * spread) * i / 8)
            k = 1 + (fold / ry if i % 2 else 0)
            z = edge + (middle - edge) * math.sin(a) ** 2
            ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    part('cape', verts, faces, M['team'], inside=lambda c: V(0, 0.0, c.z))


# Arms --------------------------------------------------------------------------------------------

# The right forearm rises from a low elbow to the spear, gripped at the height of his chest; the
# left comes forward to the grip behind the shield's boss.
R_SHOULDER, R_ELBOW = V(-0.225, 0.01, 0.905), V(-0.335, 0.05, 0.72)
R_FIST = V(-0.392, -0.1, 0.95)
L_SHOULDER, L_ELBOW = V(0.225, 0.01, 0.905), V(0.315, 0.0, 0.715)


def arm(side, shoulder, elbow, fist, grip, cuff=True):
    """A mail sleeve, the green tunic's cuff and a leather bracer, and a fist closed round a grip
    running along `grip`."""
    wrist = fist + (elbow - fist).normalized() * 0.046
    tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.086), (1.1, 0.07)], M['mail'])
    if cuff:
        forearm = [(-0.15, 0.064), (0.35, 0.072), (1.0, 0.062)]
        tube(f'forearm-{side}', elbow, wrist, forearm, [M['tunic'], M['leather']], [0, 1])
    else:
        tube(f'forearm-{side}', elbow, wrist, [(-0.15, 0.068), (1.0, 0.062)], M['leather'])
    along = Vector(grip).normalized()
    ahead = wrist - elbow
    ahead = (ahead - ahead.dot(along) * along).normalized()
    box(f'fist-{side}', fist, [ahead, along, ahead.cross(along)], (0.052, 0.058, 0.056), M['skin'], 0.88)


# The shield, on his left arm ---------------------------------------------------------------------

SHIELD_CENTRE = V(0.235, -0.3, 0.78)
SHIELD_TURN = Matrix.Rotation(math.radians(16), 3, 'Z') @ Matrix.Rotation(math.radians(-8), 3, 'X')
SHIELD_SIDES = 12
# The profile turned round the shield's axis, from its outer edge over the rim, down the
# team-coloured face to the boss: radius and y (forward is -y). The wooden boards close the
# back at the outer edge.
SHIELD_PROFILE = [
    (0.288, 0.012),  # the outer edge, round the wooden boards
    (0.264, -0.032),  # the inner edge of the rim, where the face starts
    (0.08, -0.044),  # the foot of the boss
    (0.058, -0.092),  # the shoulder of the boss
]
SHIELD_BANDS = [1, 0, 1]  # the rim and the boss in trim, the team face between
SUN_RAYS = 8


def shield():
    # Built facing -Y round the origin, then turned and set on his arm. The face is dished between
    # the rim and the boss, so no one point is inside every face: the profile is wound as a whole.
    n = SHIELD_SIDES

    def ring(r, y):
        angles = (math.tau * (i + 0.5) / n for i in range(n))
        return [V(r * math.cos(a), y, r * math.sin(a)) for a in angles]

    rings = [ring(r, y) for r, y in SHIELD_PROFILE]
    verts, faces, bands = loft(rings)
    face_mats = [SHIELD_BANDS[b] for b in bands]
    apex, last = len(verts), (len(SHIELD_PROFILE) - 1) * n
    verts.append(V(0, -0.108, 0))
    faces += [(last + i, last + (i + 1) % n, apex) for i in range(n)]
    face_mats += [1] * n
    faces.append(tuple(reversed(range(n))))  # the boards, wound to match the rim
    face_mats.append(2)
    if newell([verts[i] for i in faces[-2]]).y > 0:  # the boss's tip must face forward
        faces = [tuple(reversed(f)) for f in faces]
    placed = [SHIELD_CENTRE + SHIELD_TURN @ v for v in verts]
    part('shield', placed, faces, [M['team'], M['trim'], M['wood']], face_mats)

    # The sun blazoned on its face: long and short rays round the boss, laid on the face's planes.
    plane = []
    for i in range(n):
        j = (i + 1) % n
        a, b, c, d = rings[1][i], rings[1][j], rings[2][j], rings[2][i]
        plane += [(a, b, c), (a, c, d)]

    def on_face(r, degrees):
        a = math.radians(degrees)
        x, z = r * math.cos(a), r * math.sin(a)
        # on_surface() looks along y for (x, z); the face is turned to -y.
        return V(x, on_surface(plane, x, z) - 0.005, z)

    verts, faces = [], []
    for k in range(2 * SUN_RAYS):
        a = 90 + 180 * k / SUN_RAYS
        long = k % 2 == 0
        spread, reach = (10, 0.225) if long else (6, 0.165)
        verts += [on_face(0.082, a - spread), on_face(reach, a), on_face(0.082, a + spread)]
        faces.append((3 * k, 3 * k + 1, 3 * k + 2))
    placed = [SHIELD_CENTRE + SHIELD_TURN @ v for v in verts]
    flat('sun', placed, faces, M['gilt'], SHIELD_TURN @ V(0, -1, 0))

    # His left arm comes forward to the grip behind the boss.
    fist = SHIELD_CENTRE + SHIELD_TURN @ V(0, 0.055, 0)
    arm('left', L_SHOULDER, L_ELBOW, fist, SHIELD_TURN @ V(0, 0, 1), cuff=False)


# The spear, planted beside his right foot --------------------------------------------------------

SPEAR_BUTT = V(-0.40, -0.035, 0.0)
SPEAR_LENGTH = 1.6  # the shaft from the butt to the head's socket


def spear(fist):
    along = (fist - SPEAR_BUTT).normalized()
    top = SPEAR_BUTT + SPEAR_LENGTH * along
    tube('shaft', SPEAR_BUTT + 0.06 * along, top, [(0, 0.02), (1, 0.018)], M['wood'])
    # A steel shoe on the butt, standing on the ground.
    cone('shoe', SPEAR_BUTT + 0.075 * along, SPEAR_BUTT, 0.025, M['steel'], n=4, phase=45)
    # A long leaf-shaped head on a socket.
    u, v = frame(along)
    stations = [(0.0, 0.024, 0.024), (0.055, 0.022, 0.022), (0.115, 0.056, 0.022), (0.22, 0.036, 0.016)]
    rings = []
    for t, wide, thick in stations:
        c = top + t * along
        rings.append([c + wide * u, c + thick * v, c - wide * u, c - thick * v])
    verts, faces, bands = loft(rings)
    point, last = top + 0.33 * along, (len(rings) - 1) * 4
    verts.append(point)
    faces += [(last + i, last + (i + 1) % 4, len(verts) - 1) for i in range(4)]
    face_mats = [0 if b == 0 else 1 for b in bands] + [1] * 4
    part('spearhead', verts, faces, [M['trim'], M['steel']], face_mats,
         inside=nearest_on_polyline([top, point]))
    arm('right', LEANING @ R_SHOULDER, LEANING @ R_ELBOW, fist, along)


# The gear for 2 stars: the shoulder-guards of the King's guard --------------------------------------

# Each guard down the upper arm from the shoulder, as (fraction to the elbow, radius): it starts
# under the mantle, flares out past it over the point of the shoulder and ends in a rolled edge.
SPAULDER = [(0.0, 0.1), (0.13, 0.17), (0.4, 0.158), (0.47, 0.145)]
SPAULDER_BANDS = [0, 0, 1]  # steel, and the edge in trim


def spaulders():
    for side, shoulder, elbow in (('right', R_SHOULDER, R_ELBOW), ('left', L_SHOULDER, L_ELBOW)):
        tube(f'spaulder-{side}', shoulder, elbow, SPAULDER, [M['steel'], M['trim']], SPAULDER_BANDS, n=8,
             phase=22.5)


def main():
    reset()
    make_materials()
    legs()
    fixed = set(bpy.context.scene.objects)
    coat()
    head()
    beard()
    helm()
    crest()
    hair()
    mantle()
    cape()
    shield()
    spaulders()
    for obj in bpy.context.scene.objects:
        if obj not in fixed:
            obj.data.transform(LEANING)
    # The spear stands on the ground through his fist where the lean has carried it, and the right
    # arm is made with it.
    spear(LEANING @ R_FIST)
    finish('hama-3', budget=BOOK_BUDGET)


main()
