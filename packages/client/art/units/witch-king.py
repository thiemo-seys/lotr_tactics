"""The Witch-king of Angmar, Lord of the Nazgûl: Nazgûl, Rider and Sorcerer (docs/design.md section 5),
in the Faceted style of Gimli, the reference model (gimli.py, docs/viewer-spec.md section 4).

The Black Captain as the books show him at the gate of Minas Tirith and on the Pelennor: a great
black shape on a black horse, black-mantled, huge and threatening. A crown of steel he bore, but
between rim and robe nothing could be seen, only the darkness of the hood and a deadly gleam of
eyes. A hauberk shows where his cloak parts. His great mace he holds up in his right hand, ready to
bring it down, and in his left, held out before him, burns a cold, pale fire.

He is of the Ringwraith's family (ringwraith.py): the same peaked black hood round a faceless dark
with two pale eyes, a ragged mantle in the team colour, haggard grey hands. What tells him from the
Ringwraith and from Khamûl (khamul.py) is the tall crown of steel round his hood, the great flanged
mace raised beside it, the pale fire in his hand and the way he sits his horse: upright, as a king.

The horse is the shared one (../mounts.py), black, with the long caparison in the team colour down
its flanks and the breast strap, its left foreleg raised and its head turned to its right, away from
the fire. The team colour is the mantle, the rim of the hood and the horse's cloth, seen from in
front, from behind and from above; above it, the crown and the mace show from every side.

He is rigged as Éomer is (eomer.py, the reference rider), he and his horse one model on one
armature, and in the Ringwraith's way (ringwraith.py, the Nazgûl's reference): the hood and the
crown are his head, turning inside the mantle's collar, the mantle rides his spine, and his sleeves
bend at the elbow. His cloak and the hauberk in its opening bend at a ring inside the waist, at
rings they had, so the rig costs no triangles; his skirts ride his hips over the horse's back, his
boots his shins. His clips are the library's mounted ones: the horse stands still as he breathes
slow, gallops a stride a hex, tosses its head as he brings the mace down, goes down with him and
rears when they win;
his cast, Morgul mace, is a leap (leap): the horse sinks on its haunches and springs, and comes down
with a crash as he slams the mace down beside it.

His fittings use `trim`, which the client colours iron, silver or gold by star level
(docs/viewer-spec.md section 4, "Star levels"): the mace's pommel, a band on its haft and the socket
under its head, which show from every side; a lozenge clasp closing the mantle at his throat and the
buckle of the belt on his hauberk, from in front; the stirrup irons under his boots, from in front
and behind; and the horse's browband. The crown of steel stays steel: it is a crown, not a fitting.
His 2★ model is witch-king-2.py, which imports this script and builds him with its pauldrons on
(build()), and his 3★ model witch-king-3.py.

    blender --background --factory-startup --python-exit-code 1 --python witch-king.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from clips import fit  # noqa: E402
from kit import (  # noqa: E402
    BOOTS,
    MOUNTED_BUDGET,
    V,
    bent_tube,
    bone,
    box,
    cone,
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
)
from mounts import Surface, horse  # noqa: E402
from rig import Rig, hold, joint  # noqa: E402

# His own colours (sRGB), the Ringwraith's where they share them.
CLOAK = 0x2C2A2B  # black, lifted just enough that the facets show
VOID = 0x050505  # the darkness under the hood
GLEAM = 0xDCDECF  # the pale gleam of his eyes, and the cold fire in his hand
SKIN = 0x9A968A  # haggard, grey hands
HAUBERK = 0x5E6063  # his mail, dark iron
STEEL = 0xADB2B3  # the crown and the mace's head
IRON = 0x575557  # the mace's haft
COAT = 0x423F41  # the black horse, as dark as the coat can be and still show its facets
POINTS = 0x262426  # its mane, tail and legs, blacker still

M = {}  # materials by name, made once the scene is reset


def make_materials():
    # Made before the horse, so that its bridle takes this dark leather.
    M.update(
        team=team_material(),
        cloak=material('cloak', CLOAK, roughness=0.9),
        mail=material('mail', HAUBERK, roughness=0.6, metallic=0.1),
        void=material('void', VOID, roughness=1.0),
        gleam=material('gleam', GLEAM, roughness=0.6, emission=GLEAM, emission_strength=1.0),
        skin=material('skin', SKIN, roughness=0.85),
        steel=material('steel', STEEL, roughness=0.45, metallic=0.12),
        iron=material('iron', IRON, roughness=0.5, metallic=0.1),
        leather=material('leather', BOOTS, roughness=0.85),
        # Fittings: the renderer recolours this iron, silver or gold by star level.
        trim=trim_material(),
    )


# Pose --------------------------------------------------------------------------------------------

# He is built sitting upright; everything above the saddle then leans a little into the fight.
LEAN = 3
PIVOT = V(0, 0.06, 0.80)
LEANING = Matrix.Translation(PIVOT) @ Matrix.Rotation(math.radians(LEAN), 4, 'X') @ Matrix.Translation(-PIVOT)


def leaned(p):
    return LEANING @ Vector(p)


N_CLOAK = 13  # points round his cloak, mantle and skirts, from the left edge of the opening round
# the back to the right


def around(rx, ry, cy, opening, z, fold=0.0):
    """N_CLOAK points round from the left front edge of an opening `opening` degrees either side of
    the front, round the back, to the right edge; `z` is a height or a function of the sine of the
    angle (-1 in front, 1 behind). Every other point stands out by `fold`."""
    ring = []
    for i in range(N_CLOAK):
        a = math.radians(-90 + opening + (360 - 2 * opening) * i / (N_CLOAK - 1))
        k = 1 + (fold / ry if i % 2 else 0)
        ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z(math.sin(a)) if callable(z) else z))
    return ring


def ragged(name, edge, tips, mat, centre):
    """Rags hanging from a run of points `edge`, one from each edge between them, each given as
    (where along it the rag hangs, how far it flares out from `centre`, how far it falls)."""
    verts, faces = list(edge), []
    for k, (along, flare, drop) in enumerate(tips):
        p = edge[k].lerp(edge[k + 1], along)
        out = V(p.x - centre.x, p.y - centre.y, 0).normalized()
        verts.append(p + flare * out - V(0, 0, drop))
        faces.append((k, k + 1, len(verts) - 1))
    return part(name, verts, faces, mat, inside=lambda c: V(centre.x, centre.y, c.z + 0.05))


# The horse's cloth --------------------------------------------------------------------------------

# The caparison runs straight between its rows, and the broad croup bulges through it between the
# last two. Each point of it over the quarters is pushed out from the middle of the body until it
# clears the body there and a little before and behind.
CROUP_FROM = 0.1
CLOTH_CLEAR = 0.014


def clear_caparison(cloth, body):
    surface = Surface(body)
    for v in cloth.data.vertices:
        p = v.co.copy()
        if p.y < CROUP_FROM or p.z < 0.45:  # the hem and its rags hang free
            continue
        out = V(p.x, 0, p.z - 0.58)
        reach = 0.0
        for dy in (-0.1, -0.05, 0.0, 0.05, 0.1):
            centre = V(0, p.y + dy, 0.58)
            try:
                reach = max(reach, (surface.onto(centre, out) - centre).length)
            except ValueError:
                continue
        if out.length < reach + CLOTH_CLEAR:
            v.co = V(0, p.y, 0.58) + (reach + CLOTH_CLEAR) * out.normalized()


# Legs --------------------------------------------------------------------------------------------

# Long legs astride the horse, from just above the seat, the knees forward and out over the flanks,
# black boots straight down to the stirrups.
HIP, KNEE = V(0.115, 0.0, 0.06), V(0.30, -0.17, -0.08)  # from the seat


def legs(mount):
    """His boots below the skirts, on his shins and feet, and his thighs, for the skirts to clear:
    they are hidden under the skirts, so they are removed once the skirts are made."""
    thighs = []
    for s, ankle in zip((-1, 1), mount.stirrups):
        flip = V(s, 1, 1)
        side = 'l' if s > 0 else 'r'
        hip, knee = (mount.seat + p * flip for p in (HIP, KNEE))
        thighs.append(bent_tube(f'thigh-{s}', [hip, knee, ankle], [0.078, 0.064, 0.052], M['cloak'],
                                side=V(0, 1, 0)))
        with bone(f'shin_{side}'):
            tube(f'boot-{s}', knee, ankle, [(0, 0.062), (1, 0.052)], M['leather'], n=6)
        axes = [V(s * 0.25, -1, -0.1), V(1, 0, 0), V(0, 0, 1)]
        heel = ankle + V(0, -0.05, -0.03)
        with bone(f'foot_{side}'):
            box(f'foot-{s}', heel, axes, (0.085, 0.044, 0.042), M['leather'], 0.75)
        joint(f'hip_{side}', hip)
        joint(f'knee_{side}', knee)
        joint(f'ankle_{side}', ankle)
        joint(f'toe_{side}', heel + 0.085 * Vector(axes[0]).normalized())
    return thighs


# The stirrup irons: a flat loop round the ball of each foot, square to it, its tread under the sole
# and its eye over the instep, so that it shows from in front and from behind. Heights of the bottom
# of the tread and the top of the eye, half the tread's width and how thick the iron is.
STIRRUP_TREAD, STIRRUP_EYE = 0.342, 0.505
STIRRUP_HALF = 0.066
STIRRUP_BAR = 0.017


def stirrups(mount):
    for s, ankle in zip((-1, 1), mount.stirrups):
        along = V(s * 0.25, -1, -0.1).normalized()  # the foot, as legs() lays it
        across = V(1, s * 0.25, 0).normalized()
        ball = ankle + V(0, -0.05, -0.03) + 0.02 * along
        foot = V(ball.x, ball.y, 0)
        outer = [foot + V(0, 0, STIRRUP_EYE)]
        outer += [foot + k * STIRRUP_HALF * across + V(0, 0, STIRRUP_TREAD) for k in (-1, 1)]
        inner = [foot + V(0, 0, STIRRUP_EYE - 1.7 * STIRRUP_BAR)]
        inner += [foot + k * (STIRRUP_HALF - STIRRUP_BAR) * across + V(0, 0, STIRRUP_TREAD + STIRRUP_BAR)
                  for k in (-1, 1)]
        # Round the foot, so it keeps to the boot as his legs go with his hips.
        with bone(f'foot_{"l" if s > 0 else "r"}'):
            part(f'stirrup-{s}', outer + inner, [(0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)], M['trim'],
                 outward=along)


# Cloak and hauberk -------------------------------------------------------------------------------

# The black cloak from the saddle up, as he sits upright, parted from his lap to his chest where the
# hauberk shows: z, half-width, half-depth, centre y and half the opening (degrees). Broad in the
# chest, the greatest of the Nine. It ends there: the mantle covers it above, and the hood fills the
# mantle's collar.
CLOAK_RINGS = [
    (0.80, 0.215, 0.18, 0.07, 30),  # the hips, in the saddle
    (0.97, 0.175, 0.145, 0.06, 16),  # the waist
    (1.13, 0.215, 0.155, 0.045, 10),  # the chest
]
SHOULDER_Z, SHOULDER_Y = 1.27, 0.035  # the top of his shoulders, under the mantle
# The cloak and the hauberk bend at the waist: below it on his hips, and from a ring inside it up on
# his spine, so they cost no more triangles. The pelvis is at the lean's pivot.
WAIST_INSIDE = (0.935, 0.165, 0.138, 0.062, 18)
PELVIS, WAIST = PIVOT, V(0, 0.06, 0.955)
# The faces of the chest's band, counted from the left edge of the opening, that the mantle hides
# all round but beside the opening: they are left out, which leaves room in the budget for trim.
UNDER_MANTLE = range(1, N_CLOAK - 2)
# The belt on the hauberk, at the waist: the heights of its lower and upper edges.
BELT = (0.928, 0.97)


def cloak():
    def row(z, rx, ry, cy, opening):
        # The hauberk behind the opening, a little wider than it.
        spread = math.radians(opening + 8)
        return [V(0.94 * rx * math.cos(a), cy + 0.94 * ry * math.sin(a), z)
                for a in (-math.pi / 2 - spread, -math.pi / 2, -math.pi / 2 + spread)]

    def cloth(name, levels, hidden=()):
        rings = [around(rx, ry, cy, opening, z) for z, rx, ry, cy, opening in levels]
        verts, faces, _ = loft(rings, closed=False)
        faces = [f for k, f in enumerate(faces) if k % (N_CLOAK - 1) not in hidden]
        axis = [V(0, cy, z) for z, _, _, cy, _ in levels]
        part(name, verts, faces, M['cloak'], inside=nearest_on_polyline(axis))

    hips, waist, chest = CLOAK_RINGS
    lap = (0.775,) + hips[1:]
    t = (BELT[0] - hips[0]) / (waist[0] - hips[0])
    belt = tuple(p + t * (q - p) for p, q in zip(hips, waist))
    # Below the waist, on his hips: the cloak, and the hauberk with a belt of dark leather round it, its
    # buckle in the middle of the belt where the cloak parts, a plate standing out from it, its face
    # smaller than its foot so the edges read as a bevel.
    with bone('hips'):
        cloth('cloak', [hips, waist])
        rows = [row(*level) for level in (lap, hips, belt, waist)]
        verts, faces, bands = loft(rows, closed=False)
        part('hauberk-hips', verts, faces, [M['mail'], M['leather']], [1 if b == 2 else 0 for b in bands],
             inside=lambda c: V(0, 0.1, c.z))
        front = rows[2][1].lerp(rows[3][1], 0.5)
        plate('buckle', front, V(0, -1, 0), V(0, 0, 1), (0.028, 0.024), 0.01, M['trim'])
    # From a ring inside the waist up, on his spine: the cloak's chest, but for what the mantle hides,
    # and the hauberk.
    with bone('spine'):
        cloth('cloak-chest', [WAIST_INSIDE, chest], UNDER_MANTLE)
        verts, faces, _ = loft([row(*level) for level in (WAIST_INSIDE, chest)], closed=False)
        part('hauberk-spine', verts, faces, M['mail'], inside=lambda c: V(0, 0.1, c.z))
    joint('pelvis', PELVIS)
    joint('waist', WAIST)


def plate(name, centre, out, up, half, depth, mat, taper=0.7):
    """A small fitting standing `depth` out from a surface at `centre` along `out`: a plate of
    half-sizes `half` across and along `up`, its face smaller than its foot by `taper`, and no back."""
    out, up = Vector(out).normalized(), Vector(up).normalized()
    across = up.cross(out).normalized()
    up = out.cross(across)
    w, h = half
    foot = [centre + w * x * across + h * y * up for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    face = [centre + depth * out + taper * (p - centre) for p in foot]
    faces = [(4, 5, 6, 7)] + [(i, (i + 1) % 4, 4 + (i + 1) % 4, 4 + i) for i in range(4)]
    return part(name, foot + face, faces, mat, inside=centre - 0.01 * out)


# The skirts of the cloak over his thighs and the horse's back, from the front of his left knee
# round behind him to the front of his right: half-width, half-depth in front and behind, centre y,
# and the height at the sides, at the back and at the front edges. Each point is pushed out clear of
# the horse, its cloth and his legs. They end behind the saddle, so the caparison shows over the
# quarters.
SKIRT_OPENING = 50
SKIRT = [
    (0.42, 0.35, 0.25, 0.07, 0.55, 0.77, 0.6),  # the hem, above his boots and on the loins
    (0.40, 0.36, 0.21, 0.06, 0.70, 0.80, 0.73),  # over the knees and behind the saddle
]
SKIRT_TIPS = [
    (0.5, 0.03, 0.06), (0.4, 0.03, 0.05), (0.6, 0.03, 0.1), (0.45, 0.03, 0.06), (0.55, 0.03, 0.09),
    (0.4, 0.03, 0.05), (0.6, 0.03, 0.06), (0.45, 0.03, 0.09), (0.55, 0.03, 0.06), (0.4, 0.03, 0.1),
    (0.6, 0.03, 0.05), (0.5, 0.03, 0.06),
]
SKIRT_MARGIN = 0.03


def skirts(surface):
    def clear(p):
        inside = V(0, p.y, 0.56)
        try:
            hit = surface.onto(inside, p - inside, SKIRT_MARGIN)
        except ValueError:
            return p
        return hit if (hit - inside).length > (p - inside).length else p

    def level(rx, front_ry, back_ry, cy, side, back, front):
        edge = math.cos(math.radians(SKIRT_OPENING))  # -sin of the angle at the edges

        def z(s):
            return side + (back - side) * s * s if s > 0 else side + (front - side) * (-s / edge) ** 2

        ring = around(rx, 1.0, cy, SKIRT_OPENING, z)
        return [V(p.x, cy + (back_ry if p.y > cy else front_ry) * (p.y - cy), p.z) for p in ring]

    hips = [leaned(p) for p in around(*CLOAK_RINGS[0][1:], CLOAK_RINGS[0][0])]
    rings = [[clear(p) for p in level(*row)] for row in SKIRT] + [hips]
    verts, faces, _ = loft(rings, closed=False)
    with bone('hips'):
        part('skirts', verts, faces, M['cloak'], inside=lambda c: V(0, 0.06, c.z - 0.3))
        rags = ragged('skirt-rags', rings[0], SKIRT_TIPS, M['cloak'], V(0, 0.06, 0))
    for v in rags.data.vertices[N_CLOAK:]:
        v.co = clear(v.co)


# Hood --------------------------------------------------------------------------------------------

# The Ringwraith's hood, a little bigger so it reads over the horse, its dome a little fuller so the
# crown sits round it: built round the line from the middle of its opening back into it, x across,
# u up the face and b back. It tips forward a little, so the brow overhangs the dark.
HOOD_SCALE = 1.1
FACE = V(0, SHOULDER_Y - 0.15 * HOOD_SCALE, SHOULDER_Z + 0.085 * HOOD_SCALE)
HOOD_TIP = math.radians(4)
BACK = V(0, math.cos(HOOD_TIP), math.sin(HOOD_TIP))
UP = V(0, -math.sin(HOOD_TIP), math.cos(HOOD_TIP))

# Rings round that line from the opening back: (x, u) of the top, upper corner, shoulder, side, lower
# corner and bottom of the left half, mirrored for the right, and how far back the ring is. The rim
# of the opening is the band between the first two; the peak is the top of the third.
HOOD = [
    ([(0, 0.118), (0.05, 0.102), (0.084, 0.056), (0.096, -0.015), (0.072, -0.088), (0, -0.11)], 0.0),
    ([(0, 0.18), (0.088, 0.158), (0.138, 0.085), (0.152, -0.015), (0.12, -0.126), (0, -0.16)], 0.04),
    ([(0, 0.285), (0.11, 0.235), (0.168, 0.12), (0.183, -0.03), (0.157, -0.17), (0, -0.22)], 0.16),
    ([(0, 0.225), (0.07, 0.19), (0.125, 0.09), (0.158, -0.045), (0.137, -0.172), (0, -0.214)], 0.27),
]
HOOD_BACK = 0.335  # where the back of the hood closes, behind the head
VOID_DEPTH = 0.055  # how far back the darkness sits from the rim


NECK = V(0, SHOULDER_Y + 0.025, SHOULDER_Z - 0.05)  # where the hood turns, inside the mantle's collar


def hood_point(x, u, b):
    return FACE + HOOD_SCALE * (x * V(1, 0, 0) + u * UP + b * BACK)


def hood():
    with bone('head'):
        hood_parts()
        crown()
    joint('neck', NECK)
    joint('crown', hood_point(0, HOOD[2][0][0][1], HOOD[2][1]))  # the peak of the hood


def hood_parts():
    rings = []
    for half, b in HOOD:
        right = [(-x, u) for x, u in reversed(half[1:-1])]
        rings.append([hood_point(x, u, b) for x, u in half + right])
    n = len(rings[0])
    verts, faces, bands = loft(rings)
    face_mats = [0 if b == 0 else 1 for b in bands]
    end, last = len(verts), (len(rings) - 1) * n
    verts.append(hood_point(0, -0.03, HOOD_BACK))
    faces += [(last + i, last + (i + 1) % n, end) for i in range(n)]
    face_mats += [1] * n
    part('hood', verts, faces, [M['team'], M['cloak']], face_mats, inside=hood_point(0, 0.0, 0.15))

    # The darkness inside, a shallow funnel set back from the rim.
    verts = rings[0] + [hood_point(0, 0.0, VOID_DEPTH)]
    part('void', verts, [(i, (i + 1) % n, n) for i in range(n)], M['void'], outward=-BACK)

    # The deadly gleam of two eyes, slanting up and out, just in front of the dark.
    for s in (-1, 1):
        corners = [(s * 0.014, 0.022), (s * 0.062, 0.04), (s * 0.043, 0.002)]
        verts = [hood_point(x, u, VOID_DEPTH * (1 - math.hypot(x, u) / 0.1) - 0.006) for x, u in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['gleam'], outward=-BACK)


# The crown of steel round the hood, above the rim of the opening: a band of ten facets, level in the
# hood's frame, and on it tall tines, rising above the peak, between short ones.
CROWN_BAND = (0.17, 0.215)  # u of its lower and upper edges
CROWN_CENTRE = 0.158  # b of its middle
CROWN_RADII = (0.142, 0.14)  # half-width and half-depth of its lower edge, resting on the hood's sides
CROWN_FLARE = 1.05  # its upper edge, a little wider
TINES = (0.36, 0.29)  # u of the tall and the short tines' points
TINE_WIDTH = 0.64  # how much of an edge of the band a tine's foot spans
TINE_LEAN = 0.12  # how far out the points lean, as a fraction of the band's radius there
TINE_DEPTH = 0.022  # how thick a tine is at its foot


def crown():
    def ring(u, k):
        points = []
        for i in range(10):
            a = math.radians(-72 + 36 * i)  # an edge, not a corner, in front
            points.append(hood_point(k * CROWN_RADII[0] * math.cos(a), u,
                                     CROWN_CENTRE + k * CROWN_RADII[1] * math.sin(a)))
        return points

    lower, upper = ring(CROWN_BAND[0], 1.0), ring(CROWN_BAND[1], CROWN_FLARE)
    verts, faces, _ = loft([lower, upper])
    axis = nearest_on_line(hood_point(0, 0, CROWN_CENTRE), hood_point(0, 1, CROWN_CENTRE))
    part('crown', verts, faces, M['steel'], inside=axis)

    # A tine on the middle of each edge of the band, the one over the brow tall.
    for k in range(10):
        a = upper[k].lerp(upper[(k + 1) % 10], (1 - TINE_WIDTH) / 2)
        b = upper[k].lerp(upper[(k + 1) % 10], (1 + TINE_WIDTH) / 2)
        foot = (a + b) / 2
        out = foot - axis(foot)
        rise = (TINES[0] if k % 2 else TINES[1]) - CROWN_BAND[1]
        point = foot + HOOD_SCALE * rise * UP + TINE_LEAN * out
        inner = foot - TINE_DEPTH * out.normalized()
        verts = [a, b, inner, point]
        part(f'tine-{k}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['steel'], inside=sum(verts, Vector()) / 4)


# Team colour: a ragged mantle over the shoulders --------------------------------------------------

# The mantle from the collar down, open at the front: z at the front and at the back, half-width,
# half-depth, centre y, how deep its folds stand out and half the opening (degrees).
MANTLE = [
    (SHOULDER_Z - 0.08, SHOULDER_Z - 0.02, 0.178, 0.17, SHOULDER_Y + 0.005, 0.0, 22),  # the collar
    (SHOULDER_Z - 0.13, SHOULDER_Z - 0.105, 0.275, 0.215, SHOULDER_Y + 0.015, 0.008, 30),  # shoulders
    (SHOULDER_Z - 0.27, SHOULDER_Z - 0.3, 0.29, 0.232, SHOULDER_Y + 0.025, 0.03, 36),  # the hem
]
# Its hem in tatters, longest down the back: for each edge from the left front round to the right,
# where along it the rag hangs, how far it flares out and how far it falls below the hem.
MANTLE_TIPS = [
    (0.6, 0.015, 0.08), (0.35, 0.02, 0.12), (0.6, 0.025, 0.07), (0.4, 0.03, 0.14), (0.65, 0.03, 0.09),
    (0.35, 0.03, 0.13), (0.6, 0.03, 0.1), (0.4, 0.03, 0.14), (0.55, 0.03, 0.08), (0.35, 0.025, 0.13),
    (0.6, 0.02, 0.06), (0.4, 0.015, 0.12),
]


def mantle():
    with bone('spine'):
        mantle_parts()


def mantle_parts():
    rings = []
    for front, back, rx, ry, cy, fold, opening in MANTLE:
        rings.append(around(rx, ry, cy, opening, lambda s, f=front, b=back: f + (b - f) * (1 + s) / 2, fold))
    verts, faces, _ = loft(rings, closed=False)
    cy = MANTLE[-1][4]
    part('mantle', verts, faces, M['team'], inside=lambda c: V(0, cy, c.z))
    ragged('mantle-rags', rings[-1], MANTLE_TIPS, M['team'], V(0, cy, 0))
    # A lozenge clasp across the opening at his throat, under the hood, tipped up to the game's camera.
    cone('clasp', CLASP, CLASP + 0.014 * CLASP_OUT, 0.032, M['trim'], n=4, squash=1.3, back=None)


CLASP = V(0, SHOULDER_Y - 0.163, SHOULDER_Z - 0.075)  # the middle of its foot
CLASP_OUT = V(0, -1, 0.4).normalized()


# Arms --------------------------------------------------------------------------------------------

# The right arm holds the mace up: the elbow out at the shoulder's height, the forearm forward and
# up, the fist at the height of his hood. The left reaches forward, the fire in its open hand.
R_SHOULDER, R_ELBOW, R_WRIST = V(-0.17, 0.045, 1.13), V(-0.36, 0.06, 1.12), V(-0.40, -0.15, 1.30)
L_SHOULDER, L_ELBOW, L_WRIST = V(0.17, 0.045, 1.13), V(0.31, -0.02, 0.98), V(0.27, -0.27, 1.02)
# Each sleeve: radius at the shoulder, the elbow, along the forearm and at the open cuff.
SLEEVE = [0.062, 0.07, 0.088, 0.115]
ELBOW_OVERLAP = 0.03  # how far the upper sleeve runs on past the elbow, and the lower starts above it


def sleeve(side, shoulder, elbow, wrist, cuff_at, n=5):
    s = side[0]
    cuff = elbow.lerp(wrist, cuff_at)
    middle = elbow.lerp(wrist, cuff_at / 2)
    # The sleeve as it was built, but in two at the elbow, as the Ringwraith's: the upper sleeve
    # carried on past it along its band and the lower from above it, so the elbow can bend.
    rings = path_rings([shoulder, elbow, middle, cuff], SLEEVE, n, 90)
    upper = [rings[0], [p + ELBOW_OVERLAP / (elbow - shoulder).length * (p - q) for p, q in zip(rings[1], rings[0])]]
    lower = [[p + ELBOW_OVERLAP / (middle - elbow).length * (p - q) for p, q in zip(rings[1], rings[2])]] + rings[2:]
    with bone(f'upper_arm_{s}'):
        verts, faces, _ = loft(upper)
        part(f'sleeve-{side}', verts, faces, M['cloak'], inside=nearest_on_polyline([shoulder, elbow]))
    along = (wrist - elbow).normalized()
    with bone(f'forearm_{s}'):
        verts, faces, _ = loft(lower)
        part(f'cuff-sleeve-{side}', verts, faces, M['cloak'], inside=nearest_on_polyline([elbow, middle, cuff]))
        # Rags hang from the cuff, its last ring.
        ring = rings[-1]
        verts, faces = list(ring), []
        for i in range(n):
            mid = (ring[i] + ring[(i + 1) % n]) / 2
            verts.append(mid + 0.04 * along + V(0, 0, -0.06) + 0.02 * (mid - cuff).normalized())
            faces.append((i, (i + 1) % n, len(verts) - 1))
        part(f'cuff-{side}', verts, faces, M['cloak'], inside=lambda c: cuff + (c - cuff).dot(along) * along)
        # The thin wrist, from the dark of the sleeve.
        bent_tube(f'wrist-{side}', [elbow.lerp(wrist, cuff_at - 0.25), wrist], [0.03, 0.03], M['skin'], n=4,
                  phase=45)
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)


def fist(name, wrist, elbow, up):
    ahead = (wrist - elbow).normalized()
    up = (up - up.dot(ahead) * ahead).normalized()
    centre = wrist + 0.05 * ahead
    box(name, centre, [ahead, up, ahead.cross(up)], (0.05, 0.052, 0.054), M['skin'], 0.85)
    return centre


# The great mace, held up in the right hand -------------------------------------------------------

MACE = V(-0.08, 0.15, 1.0).normalized()  # up, leaning back a little over his shoulder
BUTT, HEAD_FOOT, HEAD_TOP = 0.17, 0.35, 0.6  # along the haft from the fist: its end, the head's foot and top
HEAD_RADIUS = 0.055  # the core of the head
FLANGE_REACH = 0.155  # how far out from the haft the flanges reach
FLANGE_LENGTH = 0.11  # half the length of a flange's root along the head
SPIKE = 0.09  # the spike on top
HAFT_BAND = (0.17, 0.205)  # along the haft from the fist: where the band of trim starts and ends


def mace():
    with bone('hand_r'):
        grip, spike = mace_parts()
    joint('fist_r', grip)
    # Held by the grip, from there to the spike on top, its front forward.
    hold('r', grip, spike, spike + 0.1 * (V(0, -1, 0) - V(0, -1, 0).dot(MACE) * MACE))


def mace_parts():
    wrist, elbow = leaned(R_WRIST), leaned(R_ELBOW)
    grip = fist('fist-right', wrist, elbow, MACE)
    butt, foot, top = grip - BUTT * MACE, grip + HEAD_FOOT * MACE, grip + HEAD_TOP * MACE
    tube('haft', butt, foot + 0.03 * MACE, [(0, 0.026), (1, 0.024)], M['iron'], n=6)
    cone('pommel', butt, butt - 0.055 * MACE, 0.038, M['trim'], n=4, back=butt + 0.025 * MACE)
    # A band of trim round the haft between his fist and the head.
    low, high = (grip + t * MACE for t in HAFT_BAND)
    tube('haft-band', low, high, [(0, 0.033), (1, 0.033)], M['trim'], n=6)

    # The head: a six-sided core, drawn to a point below, its socket on the haft in trim, and to the
    # spike on top.
    rings = segment(foot + 0.03 * MACE, top, [(0, HEAD_RADIUS), (1, HEAD_RADIUS)], 6, 0)
    verts, faces, _ = loft(rings)
    verts += [foot - 0.005 * MACE, top + SPIKE * MACE]
    faces += [(i, (i + 1) % 6, 12) for i in range(6)]
    faces += [(6 + i, 6 + (i + 1) % 6, 13) for i in range(6)]
    face_mats = [0] * 6 + [1] * 6 + [0] * 6
    part('mace-head', verts, faces, [M['steel'], M['trim']], face_mats, inside=foot.lerp(top, 0.5))

    # Six flanges, each a blade drawn out to a point from the core, between its corners.
    ring = rings[0]
    centre = foot.lerp(top, 0.5)
    for i in range(6):
        mid = (ring[i] + ring[(i + 1) % 6]) / 2
        out = (mid - (foot + 0.03 * MACE)).normalized()
        across = MACE.cross(out)
        base = centre + 0.8 * HEAD_RADIUS * out
        low, high = base - FLANGE_LENGTH * MACE, base + FLANGE_LENGTH * MACE
        left, right = base + 0.017 * across, base - 0.017 * across
        point = centre + FLANGE_REACH * out + 0.025 * MACE
        verts = [low, left, high, right, point]
        faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
        part(f'flange-{i}', verts, faces, M['steel'], inside=base)
    return grip, top + SPIKE * MACE


# The cold fire, in the left hand -----------------------------------------------------------------


def fire_hand():
    with bone('hand_l'):
        palm = fire_parts()
    joint('fist_l', palm)


def fire_parts():
    wrist, elbow = leaned(L_WRIST), leaned(L_ELBOW)
    ahead = (wrist - elbow).normalized()
    up = (V(0, 0, 1) - V(0, 0, 1).dot(ahead) * ahead).normalized()
    across = ahead.cross(up)  # towards -X for this hand
    palm = wrist + 0.05 * ahead
    box('palm', palm, [ahead, up, across], (0.05, 0.02, 0.048), M['skin'], 0.9)
    # Three long fingers and the thumb, hooked up round the fire like a claw.
    knuckles = palm + 0.045 * ahead
    for k, spread in enumerate((-0.03, 0.0, 0.03)):
        base = knuckles + spread * across
        bend = base + 0.05 * ahead + 0.012 * up + 0.35 * spread * across
        tip = bend - 0.012 * ahead + 0.055 * up + 0.2 * spread * across
        bent_tube(f'finger-{k}', [base, bend], [0.013, 0.011], M['skin'], n=3, phase=90, end=tip)
    base = palm - 0.04 * across + 0.01 * ahead
    bend = base + 0.035 * ahead - 0.035 * across + 0.01 * up
    bent_tube('thumb', [base, bend], [0.014, 0.012], M['skin'], n=3, phase=90, end=bend + 0.05 * up + 0.01 * across)

    # A cold flame over the palm: a bulb of five facets narrowing in a twist to a point drawn up and
    # back, as if it streamed in the wind of his riding, and a smaller tongue either side.
    low = palm + 0.012 * up + 0.01 * ahead  # its root in the palm

    def ring(height, radius, turn, shift):
        return [low + height * up + shift + radius * (math.cos(a) * ahead + math.sin(a) * across)
                for a in (math.radians(turn) + math.tau * i / 5 for i in range(5))]

    bulb, neck = ring(0.06, 0.056, 0, V(0, 0, 0)), ring(0.13, 0.03, 36, -0.015 * ahead)
    tip = low + 0.25 * up - 0.045 * ahead
    verts = bulb + neck + [low, tip]
    faces = [(i, (i + 1) % 5, 10) for i in range(5)] + [(5 + i, 5 + (i + 1) % 5, 11) for i in range(5)]
    faces += [(i, (i + 1) % 5, 5 + i) for i in range(5)] + [(5 + i, (i + 1) % 5, 5 + (i + 1) % 5) for i in range(5)]
    part('fire', verts, faces, M['gleam'], inside=nearest_on_polyline([low, low + 0.1 * up, tip]))
    for s in (-1, 1):
        root = low + 0.07 * up + s * 0.028 * across
        cone(f'tongue-{s}', root, root + 0.1 * up + s * 0.045 * across - 0.01 * ahead, 0.02, M['gleam'], n=3,
             back=None)
    return palm


def reins(mount):
    # From the bits back beside the neck to a knot on the withers, in front of his lap: he rides
    # with his hands full, the horse ruled by his will. The bit end follows the horse's head, the
    # knot its body and the middle its neck.
    for s, bit in zip((-1, 1), mount.bits):
        mid = mount.turned(V(s * 0.12, -0.5, 0.93))
        knot = V(s * 0.05, -0.21, 0.82)
        path = [bit, mid, knot]
        width = V(0, 0, 0.012)
        verts = [p + width for p in path] + [p - width for p in path]

        def end(p, bit=bit, knot=knot):
            return 'mount_head' if (p - bit).length < 0.02 else 'mount_body' if (p - knot).length < 0.02 else None

        with bone('mount_neck', follows=end):
            part(f'rein-{s}', verts, [(0, 1, 4, 3), (1, 2, 5, 4)], M['leather'], outward=V(s, 0, 0))


# His clips (../clips.py): the library's mounted ones, breathing slow and still as the Ringwraith
# stands, with the leap for his cast and the mace lowered to his thigh when he is stunned. His
# horse's head, turned to its right, curls further round to its right as it falls (a negative roll),
# rather than sweeping across the front. fit() draws the great mace in where it would reach out of
# the hex. The victory's rear takes 1.0 s rather than the style's 1.2, so the horse is down and
# standing by the time the fight's playback stops, 1 s after the end.
CLIPS = fit({
    'idle': ('saddle', {'breath': 0.8, 'sway': 0.6}),
    'move': ('gallop', {}),
    'attack': ('cut', {}),
    'cast': ('leap', {}),
    'stun': ('reel', {'low': 1.0}),
    'death': ('fall', {'roll': -1.0}),
    'victory': ('rear', {'out': 0.35, 'seconds': 1.0}),
}, between=True)


def build(pauldrons=None):
    """Makes him and his horse in a fresh scene, every part bound to its bone and the joints marked,
    and returns the rig to finish() them with. His 2★ model (witch-king-2.py) passes its pauldrons as
    `pauldrons`, a function that makes them over his mantle and sleeves, before he leans."""
    reset()
    make_materials()
    mount = horse(COAT, POINTS, tack='caparison', raised='left', turn=-30, rigged=True)
    body, caparison = bpy.data.objects['horse-body'], bpy.data.objects['horse-caparison']
    clear_caparison(caparison, body)
    thighs = legs(mount)
    covered = [body, caparison] + thighs
    stirrups(mount)
    fixed = set(bpy.context.scene.objects)
    cloak()
    hood()
    mantle()
    sleeve('right', R_SHOULDER, R_ELBOW, R_WRIST, 0.55)
    sleeve('left', L_SHOULDER, L_ELBOW, L_WRIST, 0.88)
    if pauldrons is not None:
        pauldrons()
    for obj in bpy.context.scene.objects:
        if obj not in fixed:
            obj.data.transform(LEANING)
    skirts(Surface(*covered))
    for thigh in thighs:
        bpy.data.objects.remove(thigh)
    mace()
    fire_hand()
    reins(mount)
    return Rig(kind='mounted', mount=mount.rig, clips=CLIPS)


def main():
    finish('witch-king', budget=MOUNTED_BUDGET, rig=build())


if __name__ == '__main__':
    main()
