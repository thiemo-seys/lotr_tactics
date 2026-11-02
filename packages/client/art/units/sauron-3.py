"""Sauron, the Dark Lord: a Large Captain in the Faceted style (docs/viewer-spec.md section 4).

Built at full size, after Gimli (gimli.py), the reference: every form is a low-segment shape or a
hand-placed set of vertices, shaded flat so the facets catch the light. He stands about 2.1 to the
top of his crown, a tower of dark iron over a dark robe: a closed helm with a V of a slit lit like
an ember under an iron crown on a band of gold, broad stepped pauldrons, the Lidless Eye on his
breastplate and on his cape, the four-fingered Black Hand raised open at his shoulder and a great
flanged mace held upright in the other. The team colour is his great cape, which carries the Eye on
its back, and the long tabard down his front.

His 3★ model, the book moment (docs/viewer-spec.md section 4, "Star levels"): Sauron at the height
of his power in war, as he came forth at the end of the siege of Barad-dûr and fought Gil-galad and
Elendil on the slopes of Orodruin (The Fellowship of the Ring, II 2, "The Council of Elrond"; The
Silmarillion, "Of the Rings of Power and the Third Age"). The same Dark Lord as sauron.py, the
Lidless Eye on his breast and his cape, the four-fingered Black Hand raised open, but in heavier and
blacker plate: broader pauldrons, the haute-pieces of his 2★ model about his neck, plate on his upper
arms and longer tassets. His helm rises taller under an iron crown of cruel pinnacles, after the crown
of his own Dark Tower ("the cruel pinnacles and iron crown of the topmost tower of Barad-dûr", The
Return of the King, VI 3), and the great mace is raised high beside his helm to strike. His cape, the
team colour, is vast: it falls to the ground and trails behind him. The slit of his helm keeps the
pale gold of the Eye; there is no fire, and nothing on the hand. His fittings use `trim` as on the 1★
model, and the haute-pieces' edges too.

    blender --background --factory-startup --python-exit-code 1 --python sauron-3.py [-- <out.glb>]

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
    LARGE_BOOK_BUDGET,
    LEATHER,
    V,
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

# Sauron's own colours (sRGB); the rest come from the kit. His plate is blacker than on his 1★ model,
# but still a dark grey rather than black, so its facets show, and the ember of the Eye and of the
# slit of his helm is a pale gold, never red or orange, which would read as the red team.
IRON = 0x4C4E54
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


def sabaton(name, at, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in SABATON]
    rings = [[at + turn @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    part(name, verts, faces, M['iron'], inside=at + V(0, 0, 0.06))


# The robe from the hem to the waist, twelve facets round with a pleat at every other point: z,
# half-width, half-depth, centre y and the depth of the pleats.
ROBE_RINGS = [
    (0.0, 0.46, 0.4, 0.03, 0.035),
    (0.38, 0.385, 0.325, 0.025, 0.025),
    (0.76, 0.305, 0.25, 0.012, 0.012),
    (1.0, 0.238, 0.18, 0.0, 0.0),
]
ROBE_FRONT = []  # the front of the robe as triangles, for the tabard


def robe():
    rings = []
    for z, rx, ry, cy, pleat in ROBE_RINGS:
        ring = []
        for i in range(12):
            a = math.radians(30 * i)
            k = 1 + (pleat / ry if i % 2 else 0)
            ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings)
    part('robe', verts, faces, M['robe'], inside=lambda c: V(0, 0.02, c.z))
    ROBE_FRONT[:] = surface(verts, faces, lambda c: c.y < -0.1)


def tabard():
    # A long panel of the team colour down his front, from under the belt to a point above the hem:
    # each row is z at the edges and in the middle, and the half-width.
    rows = [(0.99, 0.99, 0.11), (0.64, 0.64, 0.125), (0.32, 0.32, 0.14), (0.15, 0.05, 0.15)]
    verts = []
    for edge, middle, w in rows:
        verts += drape(ROBE_FRONT, [(-w, edge), (0, middle), (w, edge)], -0.014)
    faces = [(3 * r + c, 3 * r + c + 1, 3 * r + c + 4, 3 * r + c + 3)
             for r in range(len(rows) - 1) for c in range(2)]
    part('tabard', verts, faces, M['team'], outward=V(0, -1, 0))


# Torso -------------------------------------------------------------------------------------------

# The breastplate as a barrel of ten facets with a flat panel in front for the Eye: z, half-width,
# half-depth and centre y. The belt is the band between the first two rings.
TORSO = [
    (0.93, 0.252, 0.2, 0.0),  # belt, lower edge
    (1.06, 0.258, 0.205, 0.0),  # belt, upper edge
    (1.08, 0.25, 0.192, 0.0),  # the breastplate's lower edge, inside the belt
    (1.24, 0.31, 0.225, -0.005),  # ribs
    (1.40, 0.352, 0.245, 0.0),  # chest
    (1.52, 0.33, 0.215, 0.015),  # shoulders
    (1.60, 0.15, 0.135, 0.02),  # neck
]
TORSO_BANDS = [0, 1, 1, 1, 1, 1]  # the leather belt, then iron


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 10, 0) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    part('torso', verts, faces, [M['leather'], M['iron']], [TORSO_BANDS[b] for b in bands],
         inside=lambda c: V(0, 0, c.z))
    chest = surface(verts, faces, lambda c: c.y < -0.15 and 1.1 < c.z < 1.5)
    eye('eye-chest', chest, 0.0, 1.33, 0.2, 0.11, -0.008)
    # A plate where the belt closes, over the top of the tabard.
    axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
    box('buckle', V(0, -0.205, 0.995), axes, (0.02, 0.06, 0.06), M['trim'], 0.8)


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
    # Three lames of iron over each hip, from the belt, leaving the tabard clear in front: angles
    # round the body (0 is his left, -90 his front), then z, half-width and half-depth of each ring.
    lames = [(0.99, 0.24, 0.19), (0.88, 0.312, 0.256), (0.895, 0.3, 0.246), (0.72, 0.345, 0.29),
             (0.735, 0.336, 0.283), (0.55, 0.385, 0.325)]
    for side, start, end in (('left', -72, 25), ('right', 155, 252)):
        angles = [math.radians(start + (end - start) * k / 4) for k in range(5)]
        rings = [[V(rx * math.cos(a), ry * math.sin(a), z) for a in angles] for z, rx, ry in lames]
        verts, faces, _ = loft(rings, closed=False)
        part(f'tasset-{side}', verts, faces, M['iron'], inside=lambda c: V(0, 0, c.z))


# Arms --------------------------------------------------------------------------------------------

# The right arm is raised, the elbow out at his side and the fist before his shoulder at the height
# of his helm, holding the mace up high to bring it down.
R_SHOULDER, R_ELBOW = V(-0.39, 0.03, 1.45), V(-0.62, 0.0, 1.62)
R_WRIST = V(-0.47, -0.22, 1.72)
R_FIST = R_WRIST + 0.075 * (R_WRIST - R_ELBOW).normalized()
# The left arm as on his 1★ model, the Black Hand drawn in a little so that he can grow to his hex.
L_SHOULDER, L_ELBOW = V(0.39, 0.03, 1.45), V(0.6, 0.0, 1.17)
L_WRIST = V(0.65, -0.24, 1.4)


def arm(side, shoulder, elbow, wrist):
    # A sleeve of the robe, then a vambrace of iron flaring into the gauntlet's cuff at the wrist.
    tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.11), (1.1, 0.095)], M['robe'])
    stations = [(-0.15, 0.085), (0.72, 0.095), (0.75, 0.115), (1.0, 0.105)]
    capped_tube(f'vambrace-{side}', elbow, wrist, stations, [M['iron'], M['gauntlet']], [0, 1, 1])
    # A pointed couter on the elbow.
    out = (elbow - shoulder).normalized().cross(wrist - elbow).normalized()
    back = (elbow - wrist).normalized()
    cone(f'couter-{side}', elbow, elbow + 0.11 * (back + 0.3 * out).normalized(), 0.075, 4, M['iron'])


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
    (1.96, 0.163, 0.166, 0.01, 0.0, 0.0, 0.0),  # under the crown
    (2.04, 0.134, 0.137, 0.012, 0.0, 0.0, 0.0),  # rising within it, taller than the 1★ helm
    (2.11, 0.088, 0.091, 0.014, 0.0, 0.0, 0.0),
]
HELM_TOP = 2.17
SLIT_BAND = 3


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


# The crown's pinnacles, from the one over his brow round to his left: how tall each stands.
PINNACLES = [0.36, 0.17, 0.27, 0.17, 0.27, 0.2, 0.27, 0.17, 0.27, 0.17]


def crown():
    # A band of gold flaring up from the helm, a flat face over the brow, with pinnacles of iron on
    # it, tall and short in turn and the tallest over the brow, leaning out like a crown of towers.
    band = [ellipse(0, 0.01, z, r, r * 1.02, 10, -72) for z, r in ((1.885, 0.178), (1.985, 0.2))]
    verts, faces, _ = loft(band)
    part('crown-band', verts, faces, M['gold'], inside=lambda c: V(0, 0.01, c.z))
    apothem = 0.2 * math.cos(math.radians(18))
    for i in range(10):
        a = math.radians(-90 + 36 * i)
        out = V(math.cos(a), math.sin(a), 0)
        side = V(-math.sin(a), math.cos(a), 0)
        height = PINNACLES[i]
        foot = V(0, 0.01, 1.95) + apothem * out
        w, inner, outer = 0.045, 0.034, 0.006
        corners = [foot + outer * out - w * side, foot + outer * out + w * side,
                   foot - inner * out + w * side, foot - inner * out - w * side]
        tip = foot + 0.22 * height * out + V(0, 0, height)
        verts = corners + [tip]
        part(f'tine-{i}', verts, [(k, (k + 1) % 4, 4) for k in range(4)], M['iron'],
             inside=foot - 0.012 * out)


# Pauldrons ---------------------------------------------------------------------------------------

# A dome over each shoulder in three stepped lames: distance along the dome's axis, and radius. The
# steps between the lames, their edges, are trim.
PAULDRON = [(-0.09, 0.27), (0.005, 0.266), (0.022, 0.236), (0.087, 0.225), (0.104, 0.188), (0.16, 0.145)]
PAULDRON_BANDS = [0, 1, 0, 1, 0]  # iron lames, trim edges
PAULDRON_TOP = 0.215
PAULDRON_TILT = {-1: V(-0.75, 0.04, 1), 1: V(0.42, 0, 1)}  # the right one over his raised arm
RIVETS = (0, 1, 2, 3, 7)  # the lowest lame's faces that get a rivet: its outer side, front to back


def pauldron(side, s):
    centre = V(s * 0.39, 0.02, 1.43)
    axis = PAULDRON_TILT[s].normalized()
    rings = segment(centre, centre + axis, PAULDRON, 8, 22.5, 0.88)
    verts, faces, bands = loft(rings)
    face_mats = [PAULDRON_BANDS[b] for b in bands]
    apex, last = len(verts), (len(PAULDRON) - 1) * 8
    verts.append(centre + PAULDRON_TOP * axis)
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    face_mats += [0] * 8
    part(f'pauldron-{side}', verts, faces, [M['iron'], M['trim']], face_mats, inside=centre)
    # A rivet in the middle of each outer face of the lowest lame.
    for k in RIVETS:
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
    (1.15, 1.1, 0.45, 0.31, 0.045, 0, 0.04, 0.0),
    (0.7, 0.66, 0.53, 0.4, 0.06, -8, 0.06, 0.0),
    (0.3, 0.3, 0.57, 0.46, 0.08, -11, 0.07, 0.0),
    (0.04, 0.04, 0.58, 0.5, 0.1, -13, 0.07, 0.0),  # it reaches the ground
]
# The train on the ground behind him, every other point reaching further: half-width, half-depth,
# centre y, how far round it wraps (degrees short of the sides), how far the points reach and z.
TRAIN = (0.6, 0.5, 0.13, -14, 0.035, 0.012)
CAPE_POINTS = 15
CLASP = (0.2, 1.36)  # where the clasps pin the cape to his back: x out from his spine, and z


def cape():
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
    rx, ry, cy, spread, reach, z = TRAIN
    ring = []
    for i in range(CAPE_POINTS):
        a = math.radians(spread + (180 - 2 * spread) * i / (CAPE_POINTS - 1))
        k = 1 + (reach / ry if i % 2 else 0)
        ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
    rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    # Wound away from a point below each face on his axis, so the train on the ground faces up.
    part('cape', verts, faces, M['team'], inside=lambda c: V(0, 0, c.z - 0.3))
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

HAFT = V(-0.02, -0.15, 0.99).normalized()  # raised high, leaning out and forward a little
HEAD = 0.55  # how far up the haft from his fist the head's centre is
# Each flange's outline from its foot round its edge: along the haft from the head's centre, and out.
FLANGE = [(-0.16, 0.05), (-0.07, 0.2), (0.11, 0.2), (0.17, 0.05)]


def mace():
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


# Plate on his upper arms: two lames down from under each pauldron, as (fraction of the way to the
# elbow, radius).
REREBRACE = [(0.3, 0.125), (0.42, 0.15), (0.66, 0.142)]
REREBRACE_LOWER = [(0.6, 0.13), (0.72, 0.145), (0.94, 0.135)]


def rerebraces():
    for side, shoulder, elbow in (('right', R_SHOULDER, R_ELBOW), ('left', L_SHOULDER, L_ELBOW)):
        tube(f'rerebrace-{side}', shoulder, elbow, REREBRACE, M['iron'], n=8, phase=22.5)
        tube(f'rerebrace-lame-{side}', shoulder, elbow, REREBRACE_LOWER, M['iron'], n=8, phase=22.5)


# Haute-pieces, as on his 2★ model --------------------------------------------------------------

# Each is a plate curved round the side of his neck, its foot sunk in the pauldron and the cape: it
# runs from HAUTE_ARC[0] to HAUTE_ARC[1] degrees round the neck (0 is straight out to his side, and
# negative towards his front), and its top arches from HAUTE_TOP[0] at the middle to HAUTE_TOP[1] at
# the ends. Its cross-section, out from the neck's axis: up the inner face, over the rolled top edge,
# which is trim, and down the outer face, as (radius, height above or below the top).
NECK = V(0, 0.02, 0)
HAUTE_ARC = (-50, 50)
HAUTE_STEPS = 6
HAUTE_FOOT = 1.45
HAUTE_TOP = (1.82, 1.73)
HAUTE_SECTION = [(0.25, None), (0.25, 0.0), (0.285, 0.014), (0.278, -0.032), (0.272, None)]
HAUTE_BANDS = [0, 1, 1, 0]  # the inner face, the top edge's two faces, the outer face


def haute_pieces():
    n = len(HAUTE_SECTION)
    for side, s in (('right', -1), ('left', 1)):
        verts, sections = [], []
        for k in range(HAUTE_STEPS + 1):
            t = k / HAUTE_STEPS
            a = math.radians(HAUTE_ARC[0] + (HAUTE_ARC[1] - HAUTE_ARC[0]) * t)
            out = V(s * math.cos(a), math.sin(a), 0)
            top = HAUTE_TOP[0] + (HAUTE_TOP[1] - HAUTE_TOP[0]) * abs(2 * t - 1) ** 1.5
            sections.append(out)
            for r, dz in HAUTE_SECTION:
                verts.append(NECK + r * out + V(0, 0, HAUTE_FOOT if dz is None else top + dz))
        faces, face_mats = [], []
        for k in range(HAUTE_STEPS):
            # Wound away from the plate's middle, a little below its top.
            middle = NECK + 0.265 * (sections[k] + sections[k + 1]).normalized()
            for j in range(n - 1):
                quad = (k * n + j, (k + 1) * n + j, (k + 1) * n + j + 1, k * n + j + 1)
                centre = sum((verts[i] for i in quad), Vector()) / 4
                faces += wind(verts, [quad], inside=V(middle.x, middle.y, centre.z - 0.02))
                face_mats.append(HAUTE_BANDS[j])
        # Its two ends, closed square to the arc.
        for k, ahead in ((0, -1), (HAUTE_STEPS, 1)):
            tangent = V(0, 0, 1).cross(sections[k]) * s * ahead
            faces += wind(verts, [tuple(range(k * n, k * n + n))], outward=tangent)
            face_mats.append(0)
        part(f'haute-{side}', verts, faces, [M['iron'], M['trim']], face_mats)


def main():
    reset()
    make_materials()
    sabaton('sabaton-right', R_FOOT, R_YAW)
    sabaton('sabaton-left', L_FOOT, L_YAW)
    robe()
    tabard()
    lower = set(bpy.context.scene.objects)
    torso()
    tassets()
    arm('right', R_SHOULDER, R_ELBOW, R_WRIST)
    arm('left', L_SHOULDER, L_ELBOW, L_WRIST)
    black_hand()
    helm()
    crown()
    pauldron('right', -1)
    pauldron('left', 1)
    cape()
    mace()
    haute_pieces()
    rerebraces()
    lean([o for o in bpy.context.scene.objects if o not in lower], V(0, 0, 1.0), 3)
    finish('sauron-3', budget=LARGE_BOOK_BUDGET)


main()
