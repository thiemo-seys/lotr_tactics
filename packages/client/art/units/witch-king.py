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

    blender --background --factory-startup --python-exit-code 1 --python witch-king.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOTS,
    MOUNTED_BUDGET,
    V,
    bent_tube,
    box,
    cone,
    finish,
    loft,
    material,
    nearest_on_line,
    nearest_on_polyline,
    part,
    reset,
    segment,
    team_material,
    tube,
)
from mounts import Surface, horse  # noqa: E402

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
TARNISH = 0x7D6C4F  # the old brass of the horse's browband

M = {}  # materials by name, made once the scene is reset


def make_materials():
    # Made before the horse, so that its bridle takes this dark leather and its browband old brass.
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
        brass=material('brass', TARNISH, roughness=0.6, metallic=0.1),
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
    """His boots below the skirts, and his thighs, for the skirts to clear: they are hidden under
    the skirts, so they are removed once the skirts are made."""
    thighs = []
    for s, ankle in zip((-1, 1), mount.stirrups):
        flip = V(s, 1, 1)
        hip, knee = (mount.seat + p * flip for p in (HIP, KNEE))
        thighs.append(bent_tube(f'thigh-{s}', [hip, knee, ankle], [0.078, 0.064, 0.052], M['cloak'],
                                side=V(0, 1, 0)))
        tube(f'boot-{s}', knee, ankle, [(0, 0.062), (1, 0.052)], M['leather'], n=6)
        axes = [V(s * 0.25, -1, -0.1), V(1, 0, 0), V(0, 0, 1)]
        box(f'foot-{s}', ankle + V(0, -0.05, -0.03), axes, (0.085, 0.044, 0.042), M['leather'], 0.75)
    return thighs


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


def cloak():
    rings = [around(rx, ry, cy, opening, z) for z, rx, ry, cy, opening in CLOAK_RINGS]
    verts, faces, _ = loft(rings, closed=False)
    axis = [V(0, cy, z) for z, _, _, cy, _ in CLOAK_RINGS]
    part('cloak', verts, faces, M['cloak'], inside=nearest_on_polyline(axis))

    # The hauberk behind the opening, a little wider than it, from his lap to his chest.
    rows = []
    for z, rx, ry, cy, opening in [(0.775,) + CLOAK_RINGS[0][1:]] + CLOAK_RINGS[:3]:
        spread = math.radians(opening + 8)
        rows.append([V(0.94 * rx * math.cos(a), cy + 0.94 * ry * math.sin(a), z)
                     for a in (-math.pi / 2 - spread, -math.pi / 2, -math.pi / 2 + spread)])
    verts, faces, _ = loft(rows, closed=False)
    part('hauberk', verts, faces, M['mail'], inside=lambda c: V(0, 0.1, c.z))


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


def hood_point(x, u, b):
    return FACE + HOOD_SCALE * (x * V(1, 0, 0) + u * UP + b * BACK)


def hood():
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
    rings = []
    for front, back, rx, ry, cy, fold, opening in MANTLE:
        rings.append(around(rx, ry, cy, opening, lambda s, f=front, b=back: f + (b - f) * (1 + s) / 2, fold))
    verts, faces, _ = loft(rings, closed=False)
    cy = MANTLE[-1][4]
    part('mantle', verts, faces, M['team'], inside=lambda c: V(0, cy, c.z))
    ragged('mantle-rags', rings[-1], MANTLE_TIPS, M['team'], V(0, cy, 0))


# Arms --------------------------------------------------------------------------------------------

# The right arm holds the mace up: the elbow out at the shoulder's height, the forearm forward and
# up, the fist at the height of his hood. The left reaches forward, the fire in its open hand.
R_SHOULDER, R_ELBOW, R_WRIST = V(-0.17, 0.045, 1.13), V(-0.36, 0.06, 1.12), V(-0.40, -0.15, 1.30)
L_SHOULDER, L_ELBOW, L_WRIST = V(0.17, 0.045, 1.13), V(0.31, -0.02, 0.98), V(0.27, -0.27, 1.02)
# Each sleeve: radius at the shoulder, the elbow, along the forearm and at the open cuff.
SLEEVE = [0.062, 0.07, 0.088, 0.115]


def sleeve(side, shoulder, elbow, wrist, cuff_at, n=5):
    cuff = elbow.lerp(wrist, cuff_at)
    middle = elbow.lerp(wrist, cuff_at / 2)
    pipe = bent_tube(f'sleeve-{side}', [shoulder, elbow, middle, cuff], SLEEVE, M['cloak'], n=n, phase=90)
    # Rags hang from the cuff, its last ring.
    along = (wrist - elbow).normalized()
    ring = [v.co.copy() for v in pipe.data.vertices[-n:]]
    verts, faces = list(ring), []
    for i in range(n):
        mid = (ring[i] + ring[(i + 1) % n]) / 2
        verts.append(mid + 0.04 * along + V(0, 0, -0.06) + 0.02 * (mid - cuff).normalized())
        faces.append((i, (i + 1) % n, len(verts) - 1))
    part(f'cuff-{side}', verts, faces, M['cloak'], inside=lambda c: cuff + (c - cuff).dot(along) * along)
    # The thin wrist, from the dark of the sleeve.
    bent_tube(f'wrist-{side}', [elbow.lerp(wrist, cuff_at - 0.25), wrist], [0.03, 0.03], M['skin'], n=4, phase=45)


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


def mace():
    wrist, elbow = leaned(R_WRIST), leaned(R_ELBOW)
    grip = fist('fist-right', wrist, elbow, MACE)
    butt, foot, top = grip - BUTT * MACE, grip + HEAD_FOOT * MACE, grip + HEAD_TOP * MACE
    tube('haft', butt, foot + 0.03 * MACE, [(0, 0.026), (1, 0.024)], M['iron'], n=6)
    cone('pommel', butt, butt - 0.055 * MACE, 0.038, M['iron'], n=4, back=butt + 0.025 * MACE)

    # The head: a six-sided core, drawn to a point below and to the spike on top.
    rings = segment(foot + 0.03 * MACE, top, [(0, HEAD_RADIUS), (1, HEAD_RADIUS)], 6, 0)
    verts, faces, _ = loft(rings)
    verts += [foot - 0.005 * MACE, top + SPIKE * MACE]
    faces += [(i, (i + 1) % 6, 12) for i in range(6)]
    faces += [(6 + i, 6 + (i + 1) % 6, 13) for i in range(6)]
    part('mace-head', verts, faces, M['steel'], inside=foot.lerp(top, 0.5))

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


# The cold fire, in the left hand -----------------------------------------------------------------


def fire_hand():
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


def reins(mount):
    # From the bits back beside the neck to a knot on the withers, in front of his lap: he rides
    # with his hands full, the horse ruled by his will.
    for s, bit in zip((-1, 1), mount.bits):
        mid = mount.turned(V(s * 0.12, -0.5, 0.93))
        path = [bit, mid, V(s * 0.05, -0.21, 0.82)]
        width = V(0, 0, 0.012)
        verts = [p + width for p in path] + [p - width for p in path]
        part(f'rein-{s}', verts, [(0, 1, 4, 3), (1, 2, 5, 4)], M['leather'], outward=V(s, 0, 0))


def main():
    reset()
    make_materials()
    mount = horse(COAT, POINTS, tack='caparison', raised='left', turn=-30)
    body, caparison = bpy.data.objects['horse-body'], bpy.data.objects['horse-caparison']
    clear_caparison(caparison, body)
    thighs = legs(mount)
    covered = [body, caparison] + thighs
    fixed = set(bpy.context.scene.objects)
    cloak()
    hood()
    crown()
    mantle()
    sleeve('right', R_SHOULDER, R_ELBOW, R_WRIST, 0.55)
    sleeve('left', L_SHOULDER, L_ELBOW, L_WRIST, 0.88)
    for obj in bpy.context.scene.objects:
        if obj not in fixed:
            obj.data.transform(LEANING)
    skirts(Surface(*covered))
    for thigh in thighs:
        bpy.data.objects.remove(thigh)
    mace()
    fire_hand()
    reins(mount)
    finish('witch-king', budget=MOUNTED_BUDGET)


main()
