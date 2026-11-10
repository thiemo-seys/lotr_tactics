"""Sauron, the Dark Lord: a Large Captain in the Faceted style (docs/viewer-spec.md section 4).

Built at full size, after Gimli (gimli.py), the reference: every form is a low-segment shape or a
hand-placed set of vertices, shaded flat so the facets catch the light. He stands about 2.1 to the
top of his crown, a tower of dark iron over a dark robe: a closed helm with a V of a slit lit like
an ember under an iron crown on a band of gold, broad stepped pauldrons, the Lidless Eye on his
breastplate and on his cape, the four-fingered Black Hand raised open at his shoulder and a great
flanged mace held upright in the other. The team colour is his great cape, which carries the Eye on
its back, and the long tabard down his front.

He is rigged (../rig.py) as a Large unit, robed to the ground as the Ringwraith is (ringwraith.py): the
breastplate on the spine, from inside the belt; the belt, the tassets and the robe on the hips, down
inside the robe below the knees; and the robe below the knees, with the foot of the tabard, on a bone
of its own, `robe`, which hangs plumb under him, twists after his knees as he strides and rests on the
ground as he sinks into it (../clips.py, robed()). His legs are hidden, but his sabatons step out under
the hem. His great cape hangs from his shoulders on a bone of its own, `cape`, and swings less than a
short one, never in under him nor out of his hex (draped()). He strikes overhand with the mace, sweeps
it round in a great level arc for his cast (Sweep), and holds it high as he wins.

His fittings use `trim`, which the client colours iron, silver or gold by star level
(docs/viewer-spec.md section 4, "Star levels"): the stepped edges and rivets of his pauldrons, the
two clasps that pin his cape to his back, the belt buckle, and the mace's collar, socket and pommel.
The crown's band stays gold, for it is a crown and not a fitting. The right pauldron has no rivet at
the front of its outer side, where the mace comes down past it as he smashes: there, it would keep the
blow from being drawn into his hex between frames. His 2★ model is sauron-2.py, which imports this
script and builds him with its haute-pieces standing up from his pauldrons (build()), and his 3★
model sauron-3.py.

    blender --background --factory-startup --python-exit-code 1 --python sauron.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BRASS,
    EYES,
    LARGE_BUDGET,
    LEATHER,
    V,
    bone,
    box,
    ellipse,
    finish,
    lean,
    loft,
    material,
    nearest_on_line,
    newell,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    trim_material,
    tube,
    wind,
)
from clips import draped, fit, robed  # noqa: E402
from rig import Rig, hold, joint  # noqa: E402

# Sauron's own colours (sRGB); the rest come from the kit. The iron is a dark grey rather than black,
# so its facets still show, and the ember of the Eye is a pale gold, never red or orange, which would
# read as the red team.
IRON = 0x5D6066
BLACK = 0x37383D  # the Black Hand
ROBE = 0x3A3330
EMBER = 0xE2B65A

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        iron=material('iron', IRON, roughness=0.55, metallic=0.12),
        gauntlet=material('gauntlet', BLACK, roughness=0.5, metallic=0.12),
        robe=material('robe', ROBE, roughness=0.9),
        gold=material('gold', BRASS, roughness=0.55, metallic=0.1),
        ember=material('ember', EMBER, roughness=0.6, emission=EMBER, emission_strength=0.6),
        eyes=material('eyes', EYES, roughness=0.6),
        leather=material('leather', LEATHER, roughness=0.85),
        # Fittings: the renderer recolours this iron, silver or gold by star level.
        trim=trim_material(),
    )


# Helpers -----------------------------------------------------------------------------------------


def surface(verts, faces, keep):
    """The faces whose centre passes `keep`, as triangles of points for on_surface()."""
    out = []
    for face in faces:
        points = [Vector(verts[i]) for i in face]
        centre = sum(points, Vector()) / len(points)
        if keep(centre):
            out += [(points[0], points[k], points[k + 1]) for k in range(1, len(points) - 1)]
    return out


def drape(triangles, points, lift):
    """(x, z) points laid on a surface seen along y, `lift` off it (negative is towards -Y)."""
    return [V(x, on_surface(triangles, x, z) + lift, z) for x, z in points]


def capped_tube(name, start, end, stations, mats, band_mats=None, n=6, phase=0.0):
    """A tube like the kit's, closed at its end by a flat cap: for a cuff wider than the hand."""
    rings = segment(start, end, stations, n, phase)
    verts, faces, bands = loft(rings)
    face_mats = [band_mats[b] for b in bands] if band_mats else [0] * len(faces)
    faces = wind(verts, faces, inside=nearest_on_line(start, end))
    last = (len(rings) - 1) * n
    faces += wind(verts, [tuple(range(last, last + n))], outward=Vector(end) - Vector(start))
    return part(name, verts, faces, mats, face_mats + face_mats[-1:])


def cone(name, base, apex, r, n, mats, phase=0.0, squash=1.0):
    """A point: a ring of n round `base` drawn to `apex`, open at the base, which hides inside
    another part."""
    ring = segment(base, apex, [(0, r)], n, phase, squash)[0]
    verts = ring + [Vector(apex)]
    return part(name, verts, [(i, (i + 1) % n, n) for i in range(n)], mats, inside=base)


# Robe, tabard and feet ---------------------------------------------------------------------------

# Iron sabatons with pointed toes, showing under the robe, the left foot forward: the height of each
# ring and the right half of it, side, heel and toe, in the foot's own frame (toes towards -y).
R_FOOT, R_YAW = V(-0.17, -0.09, 0), -12
L_FOOT, L_YAW = V(0.17, -0.15, 0), 10
SABATON = [
    (0.0, [(0.085, -0.03), (0.066, 0.1), (0.032, -0.26)]),
    (0.085, [(0.088, -0.01), (0.072, 0.1), (0.036, -0.19)]),
    (0.18, [(0.08, 0.02), (0.066, 0.09), (0.05, -0.07)]),
]


# His legs are hidden under the robe: only their joints are marked, the hip, the knee a little forward
# of the line from it to the ankle, so it bends forward, and the ankle over the back of the sabaton.
HIP_Z, KNEE_Z, ANKLE_Z = 0.9, 0.5, 0.1


def sabaton(side, at, yaw):
    s = side[0]
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    outlines = [(z, [side_, heel, (-heel[0], heel[1]), (-side_[0], side_[1]), (-toe[0], toe[1]), toe])
                for z, (side_, heel, toe) in SABATON]
    rings = [[at + turn @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    with bone(f'foot_{s}'):
        part(f'sabaton-{side}', verts, faces, M['iron'], inside=at + V(0, 0, 0.06))
    ankle = at + turn @ V(0, 0.03, ANKLE_Z)
    hip = V(0.12 if s == 'l' else -0.12, 0.0, HIP_Z)
    joint(f'hip_{s}', hip)
    joint(f'knee_{s}', hip.lerp(ankle, (HIP_Z - KNEE_Z) / (HIP_Z - ANKLE_Z)) + V(0, -0.04, 0))
    joint(f'ankle_{s}', ankle)
    joint(f'toe_{s}', at + turn @ V(0, -0.2, 0.02))


# The robe from the hem to the waist, twelve facets round with a pleat at every other point: z,
# half-width, half-depth, centre y and the depth of the pleats.
ROBE_RINGS = [
    (0.05, 0.455, 0.395, 0.03, 0.035),  # the hem, a little off the ground, so the sabatons show
    (0.38, 0.385, 0.325, 0.025, 0.025),  # the knees
    (0.76, 0.305, 0.25, 0.012, 0.012),
    (1.0, 0.238, 0.18, 0.0, 0.0),
]
ROBE_FRONT = []  # the front of the robe as triangles, for the tabard
# It is in two pieces: the robe below the knees on a bone of its own, which hangs plumb under him
# (../clips.py, robed()), from the middle of the knees' ring to the middle of the hem; and the robe above
# on his hips, reaching down inside it to a ring a little inside it (KNEES_INSIDE), so no gap opens as he
# sinks into it.
KNEES_INSIDE = (0.27, 0.38, 0.32, 0.026, 0.02)
ROBE_TOP, ROBE_FOOT = V(0, 0.025, 0.38), V(0, 0.03, 0.05)
TABARD_SPLIT = 0.38  # the tabard's foot, below it, is on the robe's bone too


def robe_ring(z, rx, ry, cy, pleat):
    ring = []
    for i in range(12):
        a = math.radians(30 * i)
        k = 1 + (pleat / ry if i % 2 else 0)
        ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
    return ring


def robe():
    rings = [robe_ring(*level) for level in ROBE_RINGS]
    verts, faces, _ = loft(rings)
    ROBE_FRONT[:] = surface(verts, faces, lambda c: c.y < -0.1)
    for name, bone_name, pieces in (('robe-hem', 'robe', rings[:2]),
                                    ('robe', 'hips', [robe_ring(*KNEES_INSIDE)] + rings[1:])):
        verts, faces, _ = loft(pieces)
        with bone(bone_name):
            part(name, verts, faces, M['robe'], inside=lambda c: V(0, 0.02, c.z))
    joint('robe_top', ROBE_TOP)
    joint('robe_foot', ROBE_FOOT)


def tabard():
    # A long panel of the team colour down his front, from under the belt to a point above the hem:
    # each row is z at the edges and in the middle, and the half-width. It is in two pieces, which meet
    # at the robe's knees: the panel on the hips, and its foot on the robe's bone.
    for name, bone_name, rows in (
        ('tabard', 'hips', [(0.99, 0.99, 0.11), (0.64, 0.64, 0.125), (0.36, 0.36, 0.138)]),
        ('tabard-foot', 'robe', [(TABARD_SPLIT, TABARD_SPLIT, 0.137), (0.17, 0.08, 0.15)]),
    ):
        verts = []
        for edge, middle, w in rows:
            verts += drape(ROBE_FRONT, [(-w, edge), (0, middle), (w, edge)], -0.014)
        faces = [(3 * r + c, 3 * r + c + 1, 3 * r + c + 4, 3 * r + c + 3)
                 for r in range(len(rows) - 1) for c in range(2)]
        with bone(bone_name):
            part(name, verts, faces, M['team'], outward=V(0, -1, 0))


# Torso -------------------------------------------------------------------------------------------

# The breastplate as a barrel of ten facets with a flat panel in front for the Eye: z, half-width,
# half-depth and centre y. The belt is the band between the first two rings.
TORSO = [
    (0.93, 0.252, 0.2, 0.0),  # belt, lower edge
    (1.06, 0.258, 0.205, 0.0),  # belt, upper edge
    (0.98, 0.225, 0.18, 0.0),  # the breastplate's lower edge, deep inside the belt
    (1.24, 0.31, 0.225, -0.005),  # ribs
    (1.40, 0.352, 0.245, 0.0),  # chest
    (1.52, 0.33, 0.215, 0.015),  # shoulders
    (1.60, 0.15, 0.135, 0.02),  # neck
]
# He bends at the waist, inside the belt: the belt on the hips, and the breastplate on the spine, from a
# ring deep inside the belt.
PELVIS, WAIST = V(0, 0.0, 0.92), V(0, 0.04, 1.03)


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 10, 0) for z, rx, ry, cy in TORSO]
    verts, faces, _ = loft(rings[:2])
    with bone('hips'):
        part('belt', verts, faces, M['leather'], inside=lambda c: V(0, 0, c.z))
        # A plate where the belt closes, over the top of the tabard.
        axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
        box('buckle', V(0, -0.205, 0.995), axes, (0.02, 0.06, 0.06), M['trim'], 0.8)
    verts, faces, _ = loft(rings[2:])
    with bone('spine'):
        part('breastplate', verts, faces, M['iron'], inside=lambda c: V(0, 0, c.z))
        chest = surface(verts, faces, lambda c: c.y < -0.15 and 1.1 < c.z < 1.5)
        eye('eye-chest', chest, 0.0, 1.33, 0.2, 0.11, -0.008)
    joint('pelvis', PELVIS)
    joint('waist', WAIST)


# The Lidless Eye, "yellow as a cat's" with "the black slit of its pupil" (The Mirror of Galadriel):
# an almond round a slit, in normalised units across and up.
EYE_OUTLINE = [
    (1, 0), (0.55, 0.62), (0, 0.85), (-0.55, 0.62), (-1, 0), (-0.55, -0.62), (0, -0.85), (0.55, -0.62),
]
PUPIL = [(0, 0.78), (0.17, 0), (0, -0.78), (-0.17, 0)]


def eye(name, triangles, x, z, width, height, lift):
    """The Eye laid on a surface seen along y, `lift` off it, the pupil a little prouder."""
    hw, hh = width / 2, height / 2
    sign = 1 if lift > 0 else -1
    rim = drape(triangles, [(x + hw * u, z + hh * w) for u, w in EYE_OUTLINE], lift)
    centre = drape(triangles, [(x, z)], lift)[0]
    pupil = drape(triangles, [(x + hw * u, z + hh * w) for u, w in PUPIL], lift + sign * 0.004)
    verts = rim + [centre] + pupil
    faces = [(i, (i + 1) % 8, 8) for i in range(8)] + [(9, 10, 11, 12)]
    part(name, verts, faces, [M['ember'], M['eyes']], [0] * 8 + [1], outward=V(0, sign, 0))


def tassets():
    # Two lames of iron over each hip, from the belt, leaving the tabard clear in front: angles round
    # the body (0 is his left, -90 his front), then z, half-width and half-depth of each ring.
    lames = [(0.99, 0.24, 0.19), (0.88, 0.312, 0.256), (0.895, 0.3, 0.246), (0.72, 0.345, 0.29)]
    for side, start, end in (('left', -72, 25), ('right', 155, 252)):
        angles = [math.radians(start + (end - start) * k / 4) for k in range(5)]
        rings = [[V(rx * math.cos(a), ry * math.sin(a), z) for a in angles] for z, rx, ry in lames]
        verts, faces, _ = loft(rings, closed=False)
        with bone('hips'):
            part(f'tasset-{side}', verts, faces, M['iron'], inside=lambda c: V(0, 0, c.z))


# Arms --------------------------------------------------------------------------------------------

R_SHOULDER, R_ELBOW = V(-0.39, 0.03, 1.45), V(-0.5, 0.06, 1.17)
R_WRIST, R_FIST = V(-0.52, -0.2, 1.1), V(-0.525, -0.275, 1.11)
L_SHOULDER, L_ELBOW = V(0.39, 0.03, 1.45), V(0.6, 0.0, 1.17)
L_WRIST = V(0.7, -0.27, 1.38)


def arm(side, shoulder, elbow, wrist, fist):
    # A sleeve of the robe, then a vambrace of iron flaring into the gauntlet's cuff at the wrist, which
    # starts inside the sleeve, so the arm bends at the elbow without a gap.
    s = side[0]
    with bone(f'upper_arm_{s}'):
        tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.11), (1.1, 0.095)], M['robe'])
    with bone(f'forearm_{s}'):
        stations = [(-0.15, 0.085), (0.72, 0.095), (0.75, 0.115), (1.0, 0.105)]
        capped_tube(f'vambrace-{side}', elbow, wrist, stations, [M['iron'], M['gauntlet']], [0, 1, 1])
        # A pointed couter on the elbow.
        out = (elbow - shoulder).normalized().cross(wrist - elbow).normalized()
        back = (elbow - wrist).normalized()
        cone(f'couter-{side}', elbow, elbow + 0.11 * (back + 0.3 * out).normalized(), 0.075, 4, M['iron'])
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)
    joint(f'fist_{s}', fist)


def black_hand():
    # The left hand raised open at his shoulder, palm out towards the foe: a thumb and three fingers
    # fanned and hooked into claws, for Isildur cut the fourth from it with the Ring.
    ahead = (L_WRIST - L_ELBOW).normalized()  # along the forearm
    up = (V(0, 0, 1) - V(0, 0, 1).dot(ahead) * ahead).normalized()
    fingers = (ahead + 1.6 * up).normalized()  # the hand bends back at the wrist, fingers up
    palm_out = V(0, -1, 0)
    palm_out = (palm_out - palm_out.dot(fingers) * fingers).normalized()  # the way the palm faces
    inward = palm_out.cross(fingers)  # across the palm towards the thumb and his middle (-x)
    palm = L_WRIST + 0.075 * fingers
    arm('left', L_SHOULDER, L_ELBOW, L_WRIST, palm + 0.08 * fingers)
    with bone('hand_l'):
        hand_parts(palm, fingers, palm_out, inward)


def hand_parts(palm, fingers, palm_out, inward):
    box('palm', palm, [fingers, palm_out, inward], (0.08, 0.036, 0.078), M['gauntlet'], 0.92)
    for k, spread in enumerate((-10, 6, 22)):  # from the thumb's side outwards
        a = math.radians(spread)
        fan = math.cos(a) * fingers - math.sin(a) * inward
        base = palm + 0.06 * fingers + (0.054 - 0.054 * k) * inward
        mid = base + 0.13 * (fan + 0.12 * palm_out).normalized()
        tip = mid + 0.1 * (fan + 1.1 * palm_out).normalized()
        tube(f'finger-{k}', base, mid, [(0, 0.029), (1, 0.026)], M['gauntlet'], n=4, phase=45)
        cone(f'claw-{k}', mid - 0.016 * (tip - mid).normalized(), tip, 0.03, 4, M['gauntlet'], 45)
    # The thumb, out from the inner edge of the palm and hooked forward.
    base = palm - 0.03 * fingers + 0.07 * inward
    mid = base + 0.1 * (inward + 0.8 * fingers).normalized()
    tip = mid + 0.09 * (fingers + 0.3 * inward + 1.0 * palm_out).normalized()
    tube('thumb', base, mid, [(0, 0.031), (1, 0.027)], M['gauntlet'], n=4, phase=45)
    cone('thumb-claw', mid - 0.016 * (tip - mid).normalized(), tip, 0.03, 4, M['gauntlet'], 45)


# Head --------------------------------------------------------------------------------------------

# The helm: ten facets round with a prow down the front, and a V of a slit lit like an ember under
# the brow, its face tipped up towards the game's camera. Each ring: z, half-width, half-depth,
# centre y, how far the front juts, how far the slit's points are set in and how far the V dips.
SLIT = {0: 1.0, 1: 0.32, 9: 0.32, 2: 0.0, 8: 0.0}  # the slit's points and how far each dips
HELM = [
    (1.57, 0.14, 0.14, 0.02, 0.0, 0.0, 0.0),  # inside the neck of the breastplate
    (1.625, 0.176, 0.181, 0.005, 0.058, 0.0, 0.0),  # the jaw, flared to a point at the chin
    (1.75, 0.186, 0.192, 0.0, 0.04, 0.0, 0.034),  # the cheeks
    (1.772, 0.184, 0.19, 0.0, 0.04, 0.024, 0.036),  # the slit, lower edge, set deep
    (1.806, 0.184, 0.19, 0.0, 0.04, 0.005, 0.036),  # the slit, upper edge: it faces up a little
    (1.82, 0.19, 0.194, 0.0, 0.05, 0.0, 0.036),  # the brow, over the slit
    (1.89, 0.176, 0.181, 0.005, 0.025, 0.0, 0.0),
    (1.95, 0.151, 0.153, 0.01, 0.0, 0.0, 0.0),  # under the crown
]
HELM_TOP = 1.995
SLIT_BAND = 3


NECK = V(0, 0.02, 1.59)  # where the head turns, inside the neck of the breastplate


def head():
    with bone('head'):
        helm()
        crown()
    joint('neck', NECK)
    joint('crown', V(0, 0.01, HELM_TOP))


def helm():
    rings = []
    for z, rx, ry, cy, prow, inset, dip in HELM:
        ring = []
        for i in range(10):
            a = math.radians(-90 + 36 * i)
            p = V(rx * math.cos(a), cy + ry * math.sin(a), z - dip * SLIT.get(i, 0))
            if i == 0:
                p.y -= prow
            if i in SLIT and inset:
                flat = V(p.x, p.y - cy, 0)
                p -= inset * flat.normalized()
            ring.append(p)
        rings.append(ring)
    verts, faces, bands = loft(rings)
    face_mats = []
    for f, b in zip(faces, bands):
        lit = b == SLIT_BAND and f[0] % 10 in SLIT and f[1] % 10 in SLIT
        face_mats.append(1 if lit else 0)
    apex, last = len(verts), (len(HELM) - 1) * 10
    verts.append(V(0, 0.01, HELM_TOP))
    faces += [(last + i, last + (i + 1) % 10, apex) for i in range(10)]
    face_mats += [0] * 10
    part('helm', verts, faces, [M['iron'], M['ember']], face_mats, inside=lambda c: V(0, 0.01, c.z))


def crown():
    # A band of gold flaring up from the helm, a flat face over the brow, with tines of iron on it,
    # tall and short in turn and the tallest over the brow.
    band = [ellipse(0, 0.01, z, r, r * 1.02, 10, -72) for z, r in ((1.885, 0.178), (1.965, 0.194))]
    verts, faces, _ = loft(band)
    part('crown-band', verts, faces, M['gold'], inside=lambda c: V(0, 0.01, c.z))
    apothem = 0.194 * math.cos(math.radians(18))
    for i in range(10):
        a = math.radians(-90 + 36 * i)
        out = V(math.cos(a), math.sin(a), 0)
        side = V(-math.sin(a), math.cos(a), 0)
        height = 0.21 if i == 0 else 0.14 if i % 2 == 0 else 0.085
        foot = V(0, 0.01, 1.935) + apothem * out
        w, inner, outer = 0.04, 0.03, 0.006
        corners = [foot + outer * out - w * side, foot + outer * out + w * side,
                   foot - inner * out + w * side, foot - inner * out - w * side]
        tip = foot + 0.03 * out + V(0, 0, height)
        verts = corners + [tip]
        part(f'tine-{i}', verts, [(k, (k + 1) % 4, 4) for k in range(4)], M['iron'],
             inside=foot - 0.012 * out)


# Pauldrons ---------------------------------------------------------------------------------------

# A dome over each shoulder in three stepped lames: distance along the dome's axis, and radius. The
# steps between the lames, their edges, are trim.
PAULDRON = [(-0.07, 0.24), (0.015, 0.236), (0.03, 0.208), (0.085, 0.198), (0.1, 0.165), (0.145, 0.128)]
PAULDRON_BANDS = [0, 1, 0, 1, 0]  # iron lames, trim edges
PAULDRON_TOP = 0.19
RIVETS = (0, 1, 2, 3, 7)  # the lowest lame's faces that get a rivet: its outer side, front to back
# But not the front of the right one's outer side (its face 2), where the mace comes down past his
# shoulder as he smashes: a rivet there, on his spine, keeps fit() from drawing the blow into his hex
# between frames.
MACE_PASS = 2


def pauldron(side, s):
    centre = V(s * 0.38, 0.02, 1.43)
    axis = V(s * 0.42, 0, 1).normalized()
    rings = segment(centre, centre + axis, PAULDRON, 8, 22.5, 0.88)
    verts, faces, bands = loft(rings)
    face_mats = [PAULDRON_BANDS[b] for b in bands]
    apex, last = len(verts), (len(PAULDRON) - 1) * 8
    verts.append(centre + PAULDRON_TOP * axis)
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    face_mats += [0] * 8
    with bone('spine'):
        part(f'pauldron-{side}', verts, faces, [M['iron'], M['trim']], face_mats, inside=centre)
        # A rivet in the middle of each outer face of the lowest lame.
        for k in RIVETS:
            if s < 0 and k == MACE_PASS:
                continue
            corners = [verts[i] for i in faces[k]]
            middle = sum(corners, Vector()) / 4
            out = newell(corners).normalized()
            if out.dot(middle - centre) < 0:
                out = -out
            cone(f'rivet-{side}-{k}', middle - 0.004 * out, middle + 0.016 * out, 0.02, 4, M['trim'], 45)


# Cape --------------------------------------------------------------------------------------------

# From round his neck over the shoulders and down his back to above the hem of his robe. It hangs
# flat across the middle of his back, where the Eye is, and in folds where it wraps his sides; every
# other point of the hem hangs lower, so the hem is dagged. Each level: z in the middle and at the
# edges, half-width, half-depth, centre y, how far short of the sides it stops (degrees; negative
# wraps forward), the depth of the folds and how much lower every other point hangs.
CAPE = [
    (1.6, 1.57, 0.2, 0.17, 0.03, 25, 0.0, 0.0),
    (1.5, 1.46, 0.37, 0.235, 0.03, 4, 0.0, 0.0),
    (1.15, 1.1, 0.42, 0.3, 0.04, 2, 0.04, 0.0),
    (0.7, 0.66, 0.48, 0.37, 0.05, -4, 0.07, 0.0),
    (0.26, 0.38, 0.53, 0.43, 0.06, -6, 0.09, 0.08),
]
CAPE_POINTS = 15
CLASP = (0.2, 1.36)  # where the clasps pin the cape to his back: x out from his spine, and z
# The cape hangs from the back of the neck on a bone of its own, down to the middle of its hem.
CAPE_TOP, CAPE_HEM = V(0, 0.17, 1.58), V(0, 0.48, 0.3)


def cape():
    with bone('cape'):
        cape_parts()
    joint('cape_top', CAPE_TOP)
    joint('cape_hem', CAPE_HEM)


def cape_parts():
    rings = []
    for middle, edge, rx, ry, cy, spread, fold, dag in CAPE:
        ring = []
        for i in range(CAPE_POINTS):
            a = math.radians(spread + (180 - 2 * spread) * i / (CAPE_POINTS - 1))
            ridge = i % 2
            k = 1 + (fold / ry if ridge and abs(i - CAPE_POINTS // 2) > 2 else 0)
            z = edge + (middle - edge) * math.sin(a) ** 2 - (dag if ridge else 0)
            ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    part('cape', verts, faces, M['team'], inside=lambda c: V(0, 0, c.z))
    back = surface(verts, faces, lambda c: c.y > 0.2 and 0.6 < c.z < 1.4 and abs(c.x) < 0.3)
    eye('eye-cape', back, 0.0, 1.02, 0.3, 0.16, 0.012)
    # Two clasps pin it to his back, below the pauldrons: a round boss of trim on each shoulder blade.
    yoke = surface(verts, faces, lambda c: c.y > 0.15 and c.z > 1.2)
    for s in (-1, 1):
        x, z = s * CLASP[0], CLASP[1]
        seat = V(x, on_surface(yoke, x, z), z)
        out = V(0, 1, 0.35).normalized()
        segments = segment(seat, seat + out, [(-0.012, 0.045), (0.012, 0.045), (0.022, 0.03)], 6, 30)
        ring_verts, ring_faces, _ = loft(segments)
        top = len(ring_verts)
        ring_verts.append(seat + 0.03 * out)
        ring_faces += [(12 + i, 12 + (i + 1) % 6, top) for i in range(6)]
        part(f'clasp-{s}', ring_verts, ring_faces, M['trim'], inside=seat - 0.01 * out)


# Mace, in his right hand -------------------------------------------------------------------------

HAFT = V(-0.1, -0.1, 1.0).normalized()  # upright, leaning out and forward a little
HEAD = 0.6  # how far up the haft from his fist the head's centre is
# Each flange's outline from its foot round its edge: along the haft from the head's centre, and out.
FLANGE = [(-0.16, 0.05), (-0.07, 0.2), (0.11, 0.2), (0.17, 0.05)]


def mace():
    d = HAFT
    grip = R_FIST
    ahead = (R_WRIST - R_ELBOW).normalized()
    arm('right', R_SHOULDER, R_ELBOW, R_WRIST, R_FIST + 0.07 * ahead)
    with bone('hand_r'):
        mace_parts()
    # Held from the fist up the haft to the spike on its head, facing the front.
    tip = grip + 0.96 * d
    hold('r', grip, tip, tip + V(0, -0.1, 0))


def mace_parts():
    d = HAFT
    grip = R_FIST
    tube('haft', grip - 0.17 * d, grip + HEAD * d, [(0, 0.036), (1, 0.036)], M['iron'])
    cone('pommel', grip - 0.16 * d, grip - 0.26 * d, 0.056, 6, M['trim'], 30)
    tube('collar', grip + 0.33 * d, grip + 0.4 * d, [(0, 0.054), (1, 0.054)], M['trim'], phase=30)

    head = grip + HEAD * d
    # The head's core, a hexagonal bulb with a spike on top, on a socket of trim.
    rings = segment(head, head + d, [(-0.18, 0.058), (-0.12, 0.1), (0.12, 0.1), (0.18, 0.062)], 6, 30)
    verts, faces, bands = loft(rings)
    face_mats = [1 if b == 0 else 0 for b in bands]
    top, bottom = len(verts), len(verts) + 1
    verts += [head + 0.36 * d, head - 0.21 * d]
    faces += [(18 + i, 18 + (i + 1) % 6, top) for i in range(6)]
    faces += [(i, (i + 1) % 6, bottom) for i in range(6)]
    face_mats += [0] * 6 + [1] * 6
    part('mace-core', verts, faces, [M['iron'], M['trim']], face_mats, inside=head)

    # Six flanges, between the core's corners.
    u = d.cross(V(0, 0, 1)).normalized()
    v = d.cross(u)
    for k in range(6):
        a = math.radians(60 * k)
        out = math.cos(a) * u + math.sin(a) * v
        across = d.cross(out)
        verts = []
        for along, r in FLANGE:
            p = head + along * d + r * out
            verts += [p + 0.012 * across, p - 0.012 * across]
        faces = wind(verts, [(0, 2, 4, 6)], outward=across)
        faces += wind(verts, [(1, 3, 5, 7)], outward=-across)
        # The edges round the outside; the foot is buried in the core.
        faces += wind(verts, [(0, 2, 3, 1), (2, 4, 5, 3), (4, 6, 7, 5)], inside=head + 0.06 * out)
        part(f'flange-{k}', verts, faces, M['iron'])

    # The fist round the haft, the thumb over it.
    ahead = (R_WRIST - R_ELBOW).normalized()
    up = (d - d.dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    box('fist', R_FIST, [ahead, up, across], (0.072, 0.078, 0.08), M['gauntlet'], 0.86)
    centre = R_FIST + 0.015 * ahead + 0.04 * up - 0.075 * across
    box('thumb-right', centre, [ahead, up, across], (0.06, 0.03, 0.026), M['gauntlet'], 0.7)


# His clips (../clips.py): slow and heavy. He stands breathing slow, the mace upright and the Black
# Hand raised; strides heavily, the hand held up; strikes overhand with the mace, over the top and
# dropped steep past his right side before the fist drives it down before him (drop), so it doesn't
# sweep level out of his hex to his right between frames, his body still turned to his right as it
# drops so it uncoils into the blow (coil), and lifts it back across his front, where the room an
# attack has ahead of his hex lets the mace pass level (docs/viewer-spec.md section 4, Size; when it
# had to keep to the hex, it was lifted a frame later: slow); sweeps it round in a great level arc
# for his cast (Sweep); sways, dazed, the mace sagging; sinks to his knees into his robe as he falls,
# the mace laid before him and the hand dropping by his knee; and holds the mace high as he wins.
# fit() keeps the mace in each clip's room between frames too (between). The robe below his knees
# hangs plumb under him (robed()), and his cape swings less than a short one would, never in under him
# nor out of his hex (draped()).
CLIPS = robed(draped(fit({
    'idle': ('ready', {'seconds': 2.8, 'breath': 0.8, 'sway': 0.6, 'crouch': 0.02}),
    'move': ('run', {'heavy': 0.6, 'stride': 0.4, 'lift': 0.2, 'lean': 8.0, 'off': 'high'}),
    'attack': ('smash', {'drop': 1.0, 'coil': 8.0}),
    'cast': ('reap', {'turn': 55.0, 'begin': 1.0}),
    'stun': ('dazed', {'seconds': 1.4, 'low': 0.3, 'off_low': 0.7}),
    'death': ('knees', {'dropped': True, 'behind': 0.0, 'slump': 0.8, 'back': 0.15}),
    'victory': ('raise', {'out': 0.3, 'lean': 10.0}),
}, between=True)))
RIG = Rig(kind='large', bones={'robe': ('root', 'robe_top', 'robe_foot'), 'cape': ('spine', 'cape_top', 'cape_hem')},
          clips=CLIPS)


def build(haute=None):
    """Makes him in a fresh scene, every part bound to its bone and his joints marked, and returns
    the rig to finish() him with. His 2★ model (sauron-2.py) passes its haute-pieces as `haute`, a
    function that makes them standing up from his pauldrons, before he leans."""
    reset()
    make_materials()
    sabaton('right', R_FOOT, R_YAW)
    sabaton('left', L_FOOT, L_YAW)
    robe()
    tabard()
    lower = set(bpy.context.scene.objects)
    torso()
    tassets()
    black_hand()
    head()
    pauldron('right', -1)
    pauldron('left', 1)
    cape()
    mace()
    if haute is not None:
        haute()
    lean([o for o in bpy.context.scene.objects if o not in lower], V(0, 0, 1.0), 3)
    return RIG


def main():
    finish('sauron', budget=LARGE_BUDGET, rig=build())


if __name__ == '__main__':
    main()
