"""The Witch-king of Angmar at the broken Gate of Minas Tirith: his 3★ model, the book moment
(docs/viewer-spec.md section 4, "Star levels").

From The Return of the King, V 4, "The Siege of Gondor". Grond has broken the Gate, and the Lord of
the Nazgûl rides in under the arch on his black horse, a great black shape grown to a vast menace of
despair. Gandalf bars the way, and the Black Rider "flung back his hood, and behold! he had a kingly
crown; and yet upon no head visible was it set." Then he "lifted high his sword and flames ran down
the blade."

It is the same rider as witch-king.py, on the same black horse with the caparison in the team
colour, its left foreleg raised: the ragged mantle, the black cloak and skirts, the hauberk, the
haggard grey hands and the cold, pale fire still burning in his left. But the hood lies flung back
on his shoulders, a black fold with its rim in the team colour, and where his head should be there
is only darkness: a dark flame rising from the collar of the mantle, narrower than a head and drawn
up and back to a point, with the deadly gleam of two eyes in it. Round its tip the crown of steel
hangs on nothing, with clear space between its band and the dark. The book has red fires shining
between the crown and the mantled shoulders; here that space shows only the dark. In place of the
mace he holds up a long sword, out to his right, and pale flames run along both its edges, white
and pale gold, never red. It is raised no higher than the mace was, so the model is no taller.

The team colour is the mantle, the rim of the fallen hood and the horse's cloth, seen from in
front, from behind and from above. His fittings, the sword's cross-guard and pommel, the clasp at
his throat, the buckle of his belt, the stirrup irons and the horse's browband, use `trim`, which
the client colours gold at 3★. The crown of steel stays steel.

    blender --background --factory-startup --python-exit-code 1 --python witch-king-3.py [-- <out.glb>]

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
    MOUNTED_BOOK_BUDGET,
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
    team_material,
    trim_material,
    tube,
)
from mounts import Surface, horse  # noqa: E402

# His own colours (sRGB), the Ringwraith's where they share them.
CLOAK = 0x2C2A2B  # black, lifted just enough that the facets show
VOID = 0x050505  # the darkness where his head should be
GLEAM = 0xDCDECF  # the pale gleam of his eyes, and the cold fire in his hand
SKIN = 0x9A968A  # haggard, grey hands
HAUBERK = 0x5E6063  # his mail, dark iron
STEEL = 0xADB2B3  # the crown
BLADE = 0xC9CDCB  # the long sword's pale steel
FLAME = 0xF2E8C9  # the flames running on its blade: a pale gold, near white
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
        blade=material('blade', BLADE, roughness=0.35, metallic=0.1, emission=BLADE, emission_strength=0.3),
        flame=material('flame', FLAME, roughness=0.6, emission=FLAME, emission_strength=1.2),
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
        part(f'stirrup-{s}', outer + inner, [(0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)], M['trim'],
             outward=along)


# Cloak and hauberk -------------------------------------------------------------------------------

# The black cloak from the saddle up, as he sits upright, parted from his lap to his chest where the
# hauberk shows: z, half-width, half-depth, centre y and half the opening (degrees). Broad in the
# chest, the greatest of the Nine. It ends there: the mantle covers it above, and the darkness fills
# the mantle's collar.
CLOAK_RINGS = [
    (0.80, 0.215, 0.18, 0.07, 30),  # the hips, in the saddle
    (0.97, 0.175, 0.145, 0.06, 16),  # the waist
    (1.13, 0.215, 0.155, 0.045, 10),  # the chest
]
SHOULDER_Z, SHOULDER_Y = 1.27, 0.035  # the top of his shoulders, under the mantle
# The faces of the chest's band, counted from the left edge of the opening, that the mantle hides
# all round but beside the opening: they are left out, which leaves room in the budget for trim.
UNDER_MANTLE = range(1, N_CLOAK - 2)
# The belt on the hauberk, at the waist: the heights of its lower and upper edges.
BELT = (0.928, 0.97)


def cloak():
    rings = [around(rx, ry, cy, opening, z) for z, rx, ry, cy, opening in CLOAK_RINGS]
    verts, faces, bands = loft(rings, closed=False)
    chest = len(rings) - 2
    faces = [f for k, (f, b) in enumerate(zip(faces, bands))
             if b != chest or k % (N_CLOAK - 1) not in UNDER_MANTLE]
    axis = [V(0, cy, z) for z, _, _, cy, _ in CLOAK_RINGS]
    part('cloak', verts, faces, M['cloak'], inside=nearest_on_polyline(axis))

    # The hauberk behind the opening, a little wider than it, from his lap to his chest, with a belt
    # of dark leather round the waist.
    hips, waist = CLOAK_RINGS[0], CLOAK_RINGS[1]
    t = (BELT[0] - hips[0]) / (waist[0] - hips[0])
    belt = tuple(p + t * (q - p) for p, q in zip(hips, waist))
    rows = []
    for z, rx, ry, cy, opening in [(0.775,) + hips[1:], hips, belt] + CLOAK_RINGS[1:3]:
        spread = math.radians(opening + 8)
        rows.append([V(0.94 * rx * math.cos(a), cy + 0.94 * ry * math.sin(a), z)
                     for a in (-math.pi / 2 - spread, -math.pi / 2, -math.pi / 2 + spread)])
    verts, faces, bands = loft(rows, closed=False)
    part('hauberk', verts, faces, [M['mail'], M['leather']], [1 if b == 2 else 0 for b in bands],
         inside=lambda c: V(0, 0.1, c.z))

    # Its buckle, in the middle of the belt where the cloak parts: a plate standing out from it, its
    # face smaller than its foot so the edges read as a bevel.
    front = rows[2][1].lerp(rows[3][1], 0.5)
    plate('buckle', front, V(0, -1, 0), V(0, 0, 1), (0.028, 0.024), 0.01, M['trim'])


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
    part('skirts', verts, faces, M['cloak'], inside=lambda c: V(0, 0.06, c.z - 0.3))
    rags = ragged('skirt-rags', rings[0], SKIRT_TIPS, M['cloak'], V(0, 0.06, 0))
    for v in rags.data.vertices[N_CLOAK:]:
        v.co = clear(v.co)


# The frame of the hood -----------------------------------------------------------------------------

# At 1★ (witch-king.py) the hood is built round the line from the middle of its opening back into it,
# x across, u up the face and b back, tipped forward a little; the crown sits round it. Here the hood
# is flung back, and the crown floats where it sat, over the darkness that rises where the head would
# be.
HOOD_SCALE = 1.1
FACE = V(0, SHOULDER_Y - 0.15 * HOOD_SCALE, SHOULDER_Z + 0.085 * HOOD_SCALE)
HOOD_TIP = math.radians(4)
BACK = V(0, math.cos(HOOD_TIP), math.sin(HOOD_TIP))
UP = V(0, -math.sin(HOOD_TIP), math.cos(HOOD_TIP))


def hood_point(x, u, b):
    return FACE + HOOD_SCALE * (x * V(1, 0, 0) + u * UP + b * BACK)


# The crown of steel, just where it sits round the hood at 1★, now on no head: a band of ten facets,
# level in the hood's frame, and on it tall tines between short ones.
CROWN_BAND = (0.17, 0.215)  # u of its lower and upper edges
CROWN_CENTRE = 0.158  # b of its middle
CROWN_RADII = (0.142, 0.14)  # half-width and half-depth of its lower edge
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


# The darkness under the crown -------------------------------------------------------------------

# Where his head should be, only darkness: a dark flame rising from the collar of the mantle,
# narrower than a head, drawn up and back to a point just under the crown, so that the crown hangs
# over it on nothing, with clear space between. Rings of DARK_N points round the crown's axis, each
# (u, half-width, half-depth) in the hood's frame, a flat face to the front; then its tip.
DARK_N = 8
DARKNESS = [
    (-0.17, 0.138, 0.132),  # down in the collar, filling it
    (-0.085, 0.088, 0.086),  # narrowing above the shoulders
    (0.0, 0.084, 0.082),  # where the eyes gleam
    (0.075, 0.052, 0.052),
]
DARK_TIP = (0.0, 0.15, CROWN_CENTRE + 0.045)  # (x, u, b): up to just under the band, and back
# The deadly gleam of two eyes in it, slanting up and out: (x, u) of each corner of the left one,
# mirrored for the right, laid just proud of the dark.
EYES = [(0.012, 0.024), (0.058, 0.044), (0.04, 0.003)]
EYE_PROUD = 0.005


def darkness():
    rings = []
    for u, rx, rb in DARKNESS:
        angles = [math.radians(22.5 + 360 * i / DARK_N) for i in range(DARK_N)]
        rings.append([hood_point(rx * math.cos(a), u, CROWN_CENTRE + rb * math.sin(a)) for a in angles])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * DARK_N
    verts.append(hood_point(*DARK_TIP))
    faces += [(last + i, last + (i + 1) % DARK_N, tip) for i in range(DARK_N)]
    axis = [hood_point(0, u, CROWN_CENTRE) for u, _, _ in DARKNESS] + [hood_point(*DARK_TIP)]
    dark = part('darkness', verts, faces, M['void'], inside=nearest_on_polyline(axis))

    surface = Surface(dark)
    for s in (-1, 1):
        verts = [surface.onto(hood_point(s * x, u, CROWN_CENTRE), -BACK, EYE_PROUD) for x, u in EYES]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['gleam'], outward=-BACK)


# The hood, flung back: a black fold lying on the mantle behind his neck, from its rim in the team
# colour along the back of the collar down to its peak between his shoulders. Each row runs from his
# left round the back to his right: half-width, half-depth, centre y, z at its ends and at the back,
# and its angles, in degrees from his left (+X) round the back.
FALLEN = [
    (0.168, 0.162, 0.04, 1.27, 1.295, (25, 57, 90, 123, 155)),  # the rim, folded over the collar
    (0.212, 0.204, 0.04, 1.235, 1.27, (25, 57, 90, 123, 155)),  # the top of the fold
    (0.24, 0.242, 0.045, 1.135, 1.165, (48, 69, 90, 111, 132)),  # lying on his back
]
FALLEN_PEAK = V(0, 0.29, 1.03)  # the hood's peak, hanging down his back
FALLEN_CLEAR = 0.012  # how far it stands clear of the mantle


def fallen_hood(surface):
    def clear(p):
        # Out from the middle of him at p's height, until it clears the mantle there and a little to
        # either side, above and below, so that no fold of the mantle pokes through between points.
        inside = V(0, 0.05, p.z)
        out = V(p.x, p.y - 0.05, 0)
        reach = 0.0
        for turn in (-14, -7, 0, 7, 14):
            a = math.radians(turn)
            way = V(out.x * math.cos(a) - out.y * math.sin(a), out.x * math.sin(a) + out.y * math.cos(a), 0)
            for dz in (-0.035, 0.0, 0.035):
                try:
                    hit = surface.onto(inside + V(0, 0, dz), way)
                except ValueError:
                    continue
                reach = max(reach, (hit - inside - V(0, 0, dz)).length)
        needed = reach + FALLEN_CLEAR
        return inside + needed * out.normalized() if out.length < needed else p

    rows = []
    for rx, ry, cy, ends, back, angles in FALLEN:
        row = []
        for a in (math.radians(d) for d in angles):
            s = math.sin(a)  # 1 at the back
            row.append(V(rx * math.cos(a), cy + ry * s, ends + (back - ends) * s * s))
        rows.append([clear(p) for p in row])
    verts, faces, bands = loft(rows, closed=False)
    peak, last = len(verts), (len(rows) - 1) * len(rows[0])
    verts.append(clear(FALLEN_PEAK))
    faces += [(last + i, last + i + 1, peak) for i in range(len(rows[0]) - 1)]
    face_mats = [0 if b == 0 else 1 for b in bands] + [1] * (len(rows[0]) - 1)
    part('fallen-hood', verts, faces, [M['team'], M['cloak']], face_mats, inside=lambda c: V(0, 0.05, c.z))


# Team colour: a ragged mantle over the shoulders --------------------------------------------------

# The mantle from the collar down, open at the front: z at the front and at the back, half-width,
# half-depth, centre y, how deep its folds stand out and half the opening (degrees).
# "The mantled shoulders vast and dark": broader than at 1★ over the shoulders and at the hem, by
# VAST, round the same collar. Its rings are the collar, the shoulders and the hem.
VAST = 1.1
MANTLE = [
    (SHOULDER_Z - 0.08, SHOULDER_Z - 0.02, 0.178, 0.17, SHOULDER_Y + 0.005, 0.0, 22),  # the collar
    (SHOULDER_Z - 0.13, SHOULDER_Z - 0.105, VAST * 0.275, VAST * 0.215, SHOULDER_Y + 0.015, 0.008, 30),
    (SHOULDER_Z - 0.27, SHOULDER_Z - 0.3, VAST * 0.29, VAST * 0.232, SHOULDER_Y + 0.025, 0.03, 36),
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
    # A lozenge clasp across the opening at his throat, tipped up to the game's camera.
    cone('clasp', CLASP, CLASP + 0.014 * CLASP_OUT, 0.032, M['trim'], n=4, squash=1.3, back=None)


CLASP = V(0, SHOULDER_Y - 0.163, SHOULDER_Z - 0.075)  # the middle of its foot
CLASP_OUT = V(0, -1, 0.4).normalized()


# Arms --------------------------------------------------------------------------------------------

# The right arm lifts the sword high: the elbow out and a little above the shoulder, the forearm up
# and forward, the fist beside the darkness. The left reaches forward, the fire in its open hand.
R_SHOULDER, R_ELBOW, R_WRIST = V(-0.17, 0.045, 1.13), V(-0.37, 0.07, 1.19), V(-0.41, -0.10, 1.34)
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


# The sword, lifted high in the right hand, flames running down the blade ----------------------------

SWORD = V(-0.42, 0.06, 0.905).normalized()  # up and out to his right, leaning back a little
GUARD = 0.075  # from the middle of his fist to the cross-guard
BLADE_LENGTH = 0.62
# Stations along the blade: fraction of its length, half-width and half-thickness; then its point.
BLADE_STATIONS = [(0.0, 0.036, 0.012), (0.62, 0.031, 0.011), (0.88, 0.021, 0.009)]
# Tongues of pale flame along both edges, from the guard nearly to the point, each rising up the
# blade from its foot on the edge: the edge (1 the one towards his head, -1 the outer), where along
# the blade its foot starts and ends, and how far out it reaches. They take turns either side.
FLAMES = [
    (-1, 0.02, 0.2, 0.052), (1, 0.08, 0.28, 0.05), (-1, 0.25, 0.44, 0.05), (1, 0.36, 0.55, 0.047),
    (-1, 0.5, 0.68, 0.044), (1, 0.62, 0.79, 0.04), (-1, 0.74, 0.88, 0.034), (1, 0.84, 0.94, 0.028),
]
FLAME_RISE = 0.09  # how far past its foot a tongue's point rises up the blade
FLAME_TWIST = 0.012  # how far its belly and point turn out of the blade's plane, front and back in turn


def sword():
    wrist, elbow = leaned(R_WRIST), leaned(R_ELBOW)
    grip = fist('fist-right', wrist, elbow, SWORD)
    # The flat of the blade faces forward and back, where the game's camera sees it; `width` points
    # from the outer edge to the edge towards his head.
    width = V(0, 1, 0).cross(SWORD).normalized()
    side = SWORD.cross(width)
    guard = grip + GUARD * SWORD

    def half(t):
        for (t0, w0, _), (t1, w1, _) in zip(BLADE_STATIONS, BLADE_STATIONS[1:]):
            if t <= t1:
                return w0 + (w1 - w0) * (t - t0) / (t1 - t0)
        t0, w0, _ = BLADE_STATIONS[-1]
        return w0 * (1 - t) / (1 - t0)

    def edge(t, s):
        return guard + t * BLADE_LENGTH * SWORD + s * half(t) * width

    rings = []
    for t, w, th in BLADE_STATIONS:
        c = guard + t * BLADE_LENGTH * SWORD
        rings.append([c + w * width, c + th * side, c - w * width, c - th * side])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * 4
    verts.append(guard + BLADE_LENGTH * SWORD)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    part('blade', verts, faces, M['blade'], inside=nearest_on_line(guard, guard + SWORD))

    # The flames: each a tongue from its foot on the edge, bellying out and rising to a point up the
    # blade, laid on the flat and turned a little out of it.
    for k, (s, t0, t1, reach) in enumerate(FLAMES):
        out = s * width
        twist = (1 if k % 2 else -1) * FLAME_TWIST * side
        rise = FLAME_RISE / BLADE_LENGTH
        verts = [
            edge(t0, s),
            edge(t0 + 0.25 * (t1 - t0), s) + 0.75 * reach * out + twist,
            edge(min(t1 + rise, 1.0), s) + 0.4 * reach * out + 1.5 * twist,
            edge(t1, s),
        ]
        normal = (verts[1] - verts[0]).cross(verts[3] - verts[0])
        facing = normal if normal.dot(side) > 0 else -normal
        part(f'flame-{k}', verts, [(0, 1, 2, 3)], M['flame'], outward=facing)

    # The cross-guard over his fist and a pommel below it, in trim, and the grip between.
    box('guard', guard, [SWORD, width, side], (0.016, 0.105, 0.022), M['trim'], 0.8)
    end = grip - 0.095 * SWORD
    bent_tube('grip', [end, guard], [0.018, 0.018], M['leather'], n=4, phase=45)
    cone('pommel', end, end - 0.045 * SWORD, 0.03, M['trim'], n=4, phase=45, back=end + 0.015 * SWORD)


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
    stirrups(mount)
    fixed = set(bpy.context.scene.objects)
    cloak()
    crown()
    darkness()
    mantle()
    fallen_hood(Surface(bpy.data.objects['mantle']))
    sleeve('right', R_SHOULDER, R_ELBOW, R_WRIST, 0.55)
    sleeve('left', L_SHOULDER, L_ELBOW, L_WRIST, 0.88)
    for obj in bpy.context.scene.objects:
        if obj not in fixed:
            obj.data.transform(LEANING)
    skirts(Surface(*covered))
    for thigh in thighs:
        bpy.data.objects.remove(thigh)
    sword()
    fire_hand()
    reins(mount)
    finish('witch-king-3', budget=MOUNTED_BOOK_BUDGET)


main()
