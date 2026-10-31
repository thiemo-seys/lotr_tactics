"""Khamûl the Easterling, second of the Nine: Nazgûl, Rider (docs/design.md section 5), in the Faceted
style of Gimli, the reference model (gimli.py, docs/viewer-spec.md section 4).

The Black Rider who hunts the hobbits through the Shire, as the books first show him: a tall figure on
a great black horse, wrapped in a great black cloak and hood so that only his boots in the high
stirrups show below it, and no face to be seen. He is of the Ringwraith's family (ringwraith.py): the
same peaked black hood round a faceless dark with the faint gleam of two eyes, the long grey robe
where the cloak parts, haggard grey hands and a ragged mantle in the team colour. He leans forward in
the saddle, hunting, his hood thrust ahead, a long sword of pale steel raised in his right hand,
ready to ride down whatever he finds, the reins gathered in his left.

The horse is the shared one (../mounts.py), black, with a caparison in the team colour hanging down
its flanks and the breast strap, one foreleg raised to charge and its head turned well to its left,
so that from behind it shows beside his hood rather than over it. The team colour is the mantle, the
rim of the hood and the horse's cloth, seen from in front, from behind and from above. From behind,
the black hood rises over the mantle, and the black cloak falls over the saddle onto the cloth over
the horse's quarters, so he reads as a Nazgûl rider whichever way he faces.

    blender --background --factory-startup --python-exit-code 1 --python khamul.py [-- <out.glb>]

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
    LEATHER,
    MOUNTED_BUDGET,
    V,
    bent_tube,
    box,
    cone,
    finish,
    loft,
    material,
    nearest_on_polyline,
    part,
    reset,
    team_material,
)
from mounts import Surface, horse  # noqa: E402

# Khamûl's own colours (sRGB), the Ringwraith's where they share them.
CLOAK = 0x2C2A2B  # black, lifted just enough that the facets show
ROBE = 0x56534E  # the long grey robe under the black
VOID = 0x050505  # the darkness under the hood
GLEAM = 0xDCDECF  # the faint, pale gleam of the eyes
SKIN = 0x9A968A  # haggard, grey hands
BLADE = 0xC8CDC9  # the sword's cold, pale steel
IRON = 0x494643  # its pommel
COAT = 0x454346  # the great black horse, as dark as the coat can be and still show its facets
POINTS = 0x2A282A  # its mane, tail and legs, blacker still
TARNISH = 0x8A7650  # the old brass of the horse's browband

M = {}  # materials by name, made once the scene is reset


def make_materials():
    # Made before the horse, so its browband takes this old brass.
    M.update(
        team=team_material(),
        cloak=material('cloak', CLOAK, roughness=0.9),
        robe=material('robe', ROBE, roughness=0.9),
        void=material('void', VOID, roughness=1.0),
        gleam=material('gleam', GLEAM, roughness=0.6, emission=GLEAM, emission_strength=1.0),
        skin=material('skin', SKIN, roughness=0.85),
        blade=material('blade', BLADE, roughness=0.35, metallic=0.1, emission=BLADE, emission_strength=0.2),
        iron=material('iron', IRON, roughness=0.5, metallic=0.1),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        brass=material('brass', TARNISH, roughness=0.6, metallic=0.1),
    )


# Pose --------------------------------------------------------------------------------------------

# He is built sitting upright, then everything above the saddle leans forward, hunting.
LEAN = 8
PIVOT = V(0, 0.06, 0.80)
LEANING = Matrix.Translation(PIVOT) @ Matrix.Rotation(math.radians(LEAN), 4, 'X') @ Matrix.Translation(-PIVOT)


def leaned(p):
    return LEANING @ Vector(p)


# The horse's caparison runs straight between its rows, and the broad croup bulges through it
# between the last two. Each point of the cloth over the quarters is pushed out from the middle of
# the body until it clears the body there and a little before and behind it.
CROUP_FROM = 0.1  # y from which the cloth is cleared
CLOTH_CLEAR = 0.014


def clear_cloth(cloth, body):
    surface = Surface(body)
    for v in cloth.data.vertices:
        p = v.co.copy()
        if p.y < CROUP_FROM or p.z < 0.45:  # the hem and its rags hang free
            continue
        out = V(p.x, 0, p.z - 0.58)
        reach = 0.0
        for dy in (-0.08, -0.04, 0.0, 0.04, 0.08):
            centre = V(0, p.y + dy, 0.58)
            try:
                reach = max(reach, (surface.onto(centre, out) - centre).length)
            except ValueError:
                continue
        if out.length < reach + CLOTH_CLEAR:
            v.co = V(0, p.y, 0.58) + (reach + CLOTH_CLEAR) * out.normalized()


# Legs: robed thighs astride the horse, tall boots hanging in high stirrups.
HIP, KNEE, ANKLE = V(0.115, 0.04, 0.83), V(0.30, -0.15, 0.70), V(0.31, -0.10, 0.46)


def legs():
    objects = []
    for s in (-1, 1):
        flip = V(s, 1, 1)
        hip, knee, ankle = (p * flip for p in (HIP, KNEE, ANKLE))
        objects.append(bent_tube(f'leg-{s}', [hip, knee, ankle], [0.075, 0.062, 0.05], [M['robe'], M['boots']],
                                 [0, 1], side=V(0, 1, 0)))
        axes = [V(s * 0.25, -1, -0.1), V(1, 0, 0), V(0, 0, 1)]
        box(f'foot-{s}', ankle + V(0, -0.05, -0.03), axes, (0.08, 0.042, 0.04), M['boots'], 0.75)
    return objects


# Cloak and robe ----------------------------------------------------------------------------------

N_CLOAK = 13  # points round a ring, from the left edge of the opening round the back to the right

# The black cloak from the saddle up, as he sits upright, parted from his lap to his chest where the
# grey robe shows: z, half-width, half-depth, centre y and half the opening (degrees).
CLOAK_RINGS = [
    (0.80, 0.21, 0.175, 0.07, 30),  # the hips, in the saddle
    (0.97, 0.168, 0.14, 0.06, 18),  # the gaunt waist
    (1.13, 0.195, 0.148, 0.045, 12),  # chest
    (1.265, 0.18, 0.122, 0.035, 0),  # shoulders, under the mantle
]
SHOULDER_Z, SHOULDER_Y = CLOAK_RINGS[-1][0], CLOAK_RINGS[-1][3]


def ring_round(rx, ry, cy, opening, zs):
    """N_CLOAK points round from the left edge of the opening, round the back, to the right edge;
    `zs` is a height or a function of the angle's sine."""
    ring = []
    for i in range(N_CLOAK):
        a = math.radians(-90 + opening + (360 - 2 * opening) * i / (N_CLOAK - 1))
        z = zs(math.sin(a)) if callable(zs) else zs
        ring.append(V(rx * math.cos(a), cy + ry * math.sin(a), z))
    return ring


def cloak():
    rings = [ring_round(rx, ry, cy, opening, z) for z, rx, ry, cy, opening in CLOAK_RINGS]
    verts, faces, _ = loft(rings, closed=False)
    axis = [V(0, cy, z) for z, _, _, cy, _ in CLOAK_RINGS]
    part('cloak', verts, faces, M['cloak'], inside=nearest_on_polyline(axis))

    # The grey robe behind the opening, a little wider than it, from his chest down over his lap.
    rows = []
    for z, rx, ry, cy, opening in [(0.775,) + CLOAK_RINGS[0][1:]] + CLOAK_RINGS[:3]:
        spread = opening + 8
        rows.append([V(0.93 * rx * math.cos(a), cy + 0.93 * ry * math.sin(a), z)
                     for a in (math.radians(-90 - spread), math.radians(-90), math.radians(-90 + spread))])
    verts, faces, _ = loft(rows, closed=False)
    part('robe', verts, faces, M['robe'], inside=lambda c: V(0, 0.1, c.z))


# The skirts of the cloak, over his thighs and the horse's back, from the front of his left knee
# round behind him to the front of his right: half-width, half-depth in front and behind, centre y,
# and the height at the sides, at the back and at the front edges. Each point is then pushed out
# clear of the horse, its cloth and his legs. They end just behind the saddle, so the horse's cloth
# shows over its quarters.
SKIRT_OPENING = 50
SKIRT = [
    (0.40, 0.36, 0.21, 0.06, 0.71, 0.80, 0.73),  # over the knees and behind the saddle
    (0.42, 0.36, 0.25, 0.07, 0.56, 0.78, 0.60),  # the hem, above his boots and on the loins
]
# The ragged hem: for each of its 12 edges, where along it the rag hangs, how far it flares and
# how far it falls.
SKIRT_TIPS = [
    (0.5, 0.03, 0.05), (0.4, 0.03, 0.05), (0.6, 0.03, 0.1), (0.45, 0.03, 0.06), (0.55, 0.03, 0.08),
    (0.4, 0.03, 0.05), (0.6, 0.03, 0.05), (0.45, 0.03, 0.08), (0.55, 0.03, 0.06), (0.4, 0.03, 0.1),
    (0.6, 0.03, 0.05), (0.5, 0.03, 0.05),
]
SKIRT_MARGIN = 0.03  # how far the skirts stand clear of what they cover


def skirt_ring(rx, front_ry, back_ry, cy, side, back, front):
    edge = -math.sin(math.radians(-90 + SKIRT_OPENING))
    ring = []
    for i in range(N_CLOAK):
        a = math.radians(-90 + SKIRT_OPENING + (360 - 2 * SKIRT_OPENING) * i / (N_CLOAK - 1))
        s = math.sin(a)
        z = side + (back - side) * s * s if s > 0 else side + (front - side) * (-s / edge) ** 2
        ring.append(V(rx * math.cos(a), cy + (back_ry if s > 0 else front_ry) * s, z))
    return ring


def skirts(surface):
    def clear(p):
        inside = V(0, p.y, 0.56)
        try:
            hit = surface.onto(inside, p - inside, SKIRT_MARGIN)
        except ValueError:
            return p
        return hit if (hit - inside).length > (p - inside).length else p

    hips = [leaned(p) for p in ring_round(*CLOAK_RINGS[0][1:], CLOAK_RINGS[0][0])]
    rings = [[clear(p) for p in skirt_ring(*level)] for level in reversed(SKIRT)]
    rings.append(hips)
    verts, faces, _ = loft(rings, closed=False)
    hem = rings[0]
    for k, (along, flare, drop) in enumerate(SKIRT_TIPS):
        p = hem[k].lerp(hem[k + 1], along)
        out = V(p.x, p.y - 0.06, 0).normalized()
        verts.append(clear(p + flare * out - V(0, 0, drop)))
        faces.append((k, k + 1, len(verts) - 1))
    part('skirts', verts, faces, M['cloak'], inside=lambda c: V(0, 0.06, c.z - 0.3))


# Hood --------------------------------------------------------------------------------------------

# The Ringwraith's hood (ringwraith.py), a little bigger so it reads over the horse: built round the
# line from the middle of its opening back into it, x across, u up the face and b back.
HOOD_SCALE = 1.1
FACE = V(0, SHOULDER_Y - 0.15 * HOOD_SCALE, SHOULDER_Z + 0.085 * HOOD_SCALE)
HOOD_TIP = math.radians(4)
BACK = V(0, math.cos(HOOD_TIP), math.sin(HOOD_TIP))
UP = V(0, -math.sin(HOOD_TIP), math.cos(HOOD_TIP))

# Rings round that line from the opening back: (x, u) of the top, upper corner, shoulder, side, lower
# corner and bottom of the left half, mirrored for the right, and how far back the ring is. The rim
# of the opening is the band between the first two; the peak is the top of the third.
HOOD = [
    ([(0, 0.118), (0.046, 0.1), (0.08, 0.054), (0.094, -0.015), (0.07, -0.086), (0, -0.108)], 0.0),
    ([(0, 0.176), (0.08, 0.15), (0.13, 0.078), (0.148, -0.015), (0.118, -0.124), (0, -0.158)], 0.04),
    ([(0, 0.3), (0.085, 0.205), (0.156, 0.1), (0.18, -0.03), (0.155, -0.168), (0, -0.218)], 0.16),
    ([(0, 0.22), (0.066, 0.17), (0.126, 0.08), (0.156, -0.045), (0.136, -0.17), (0, -0.212)], 0.27),
]
HOOD_BACK = 0.335  # where the back of the hood closes, behind the head
VOID_DEPTH = 0.055  # how far back the darkness sits from the rim


def hood_point(x, u, b):
    return FACE + HOOD_SCALE * (x * V(1, 0, 0) + u * UP + b * BACK)


def hood():
    rings = []
    for half, b in HOOD:
        left = [(x, u) for x, u in half]
        right = [(-x, u) for x, u in reversed(half[1:-1])]
        rings.append([hood_point(x, u, b) for x, u in left + right])
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

    # Two faint points of light, slanting up and out, just in front of the dark.
    for s in (-1, 1):
        corners = [(s * 0.016, 0.02), (s * 0.056, 0.034), (s * 0.04, 0.006)]
        verts = [hood_point(x, u, VOID_DEPTH * (1 - math.hypot(x, u) / 0.1) - 0.006) for x, u in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['gleam'], outward=-BACK)


# Team colour: a ragged mantle over the shoulders --------------------------------------------------

# The mantle from the collar down, open at the front: z at the front and at the back, half-width,
# half-depth, centre y, how deep its folds stand out and half the opening (degrees).
MANTLE = [
    (SHOULDER_Z - 0.08, SHOULDER_Z - 0.02, 0.172, 0.166, SHOULDER_Y + 0.005, 0.0, 22),  # the collar
    (SHOULDER_Z - 0.13, SHOULDER_Z - 0.105, 0.258, 0.21, SHOULDER_Y + 0.015, 0.008, 30),  # the shoulders
    (SHOULDER_Z - 0.27, SHOULDER_Z - 0.3, 0.275, 0.226, SHOULDER_Y + 0.025, 0.03, 36),  # the hem
]
# Its hem in tatters, longest down the back: for each edge from the left front round to the right,
# where along it the rag hangs, how far it flares out and how far it falls below the hem.
MANTLE_TIPS = [
    (0.6, 0.015, 0.08), (0.35, 0.02, 0.12), (0.6, 0.025, 0.07), (0.4, 0.03, 0.14), (0.65, 0.03, 0.09),
    (0.35, 0.03, 0.13), (0.6, 0.03, 0.1), (0.4, 0.03, 0.14), (0.55, 0.03, 0.08), (0.35, 0.025, 0.13),
    (0.6, 0.02, 0.06), (0.4, 0.015, 0.12),
]


def mantle_ring(front, back, rx, ry, cy, fold, opening):
    ring = []
    for i in range(N_CLOAK):
        a = math.radians(-90 + opening + (360 - 2 * opening) * i / (N_CLOAK - 1))
        z = front + (back - front) * (1 + math.sin(a)) / 2
        k = 1 + (fold / ry if i % 2 else 0)
        ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
    return ring


def mantle():
    rings = [mantle_ring(*level) for level in MANTLE]
    verts, faces, _ = loft(rings, closed=False)
    cy = MANTLE[-1][4]
    part('mantle', verts, faces, M['team'], inside=lambda c: V(0, cy, c.z))
    hem = rings[-1]
    verts, faces = list(hem), []
    for k, (along, flare, drop) in enumerate(MANTLE_TIPS):
        p = hem[k].lerp(hem[k + 1], along)
        out = V(p.x, p.y - cy, 0).normalized()
        verts.append(p + flare * out - V(0, 0, drop))
        faces.append((k, k + 1, len(verts) - 1))
    part('mantle-hem', verts, faces, M['team'], inside=lambda c: V(0, cy, c.z))


# Arms --------------------------------------------------------------------------------------------

# The right arm holds the sword up and out; the left gathers the reins over the withers.
R_SHOULDER, R_ELBOW, R_WRIST = V(-0.17, 0.045, 1.115), V(-0.33, 0.03, 1.0), V(-0.37, -0.17, 1.09)
L_SHOULDER, L_ELBOW, L_WRIST = V(0.17, 0.045, 1.115), V(0.29, 0.0, 0.96), V(0.18, -0.18, 0.91)
# Each sleeve: radius at the shoulder, the elbow, along the forearm and at the open cuff.
SLEEVE = [0.06, 0.068, 0.088, 0.115]
CUFF = 0.88  # how far from the elbow to the wrist the cuff ends


def sleeve(side, shoulder, elbow, wrist):
    cuff = elbow.lerp(wrist, CUFF)
    middle = elbow.lerp(wrist, 0.45)
    tube = bent_tube(f'sleeve-{side}', [shoulder, elbow, middle, cuff], SLEEVE, M['cloak'], phase=30)
    # Rags hang from the cuff, its last ring.
    along = (wrist - elbow).normalized()
    ring = [tube.data.vertices[i].co.copy() for i in range(len(tube.data.vertices) - 6, len(tube.data.vertices))]
    verts, faces = list(ring), []
    for i in range(6):
        a, b = ring[i], ring[(i + 1) % 6]
        mid = (a + b) / 2
        verts.append(mid + 0.05 * along + V(0, 0, -0.05) + 0.02 * (mid - cuff).normalized())
        faces.append((i, (i + 1) % 6, len(verts) - 1))
    part(f'cuff-{side}', verts, faces, M['cloak'], inside=lambda c: cuff + (c - cuff).dot(along) * along)
    # The thin wrist, from the dark of the sleeve.
    bent_tube(f'wrist-{side}', [elbow.lerp(wrist, 0.6), wrist], [0.03, 0.03], M['skin'], n=4, phase=45)


def fist(name, wrist, elbow, up):
    ahead = (wrist - elbow).normalized()
    up = (up - up.dot(ahead) * ahead).normalized()
    centre = wrist + 0.05 * ahead
    box(name, centre, [ahead, up, ahead.cross(up)], (0.048, 0.05, 0.052), M['skin'], 0.85)
    return centre


# The sword, raised in the right hand ------------------------------------------------------------

SWORD = V(-0.5, -0.15, 0.85).normalized()  # up, out to his right and a little forward
BLADE_LENGTH = 0.66
# Stations along the blade: fraction of its length, half-width and half-thickness.
BLADE_STATIONS = [(0.0, 0.034, 0.012), (0.6, 0.03, 0.011), (0.88, 0.021, 0.009)]


def sword():
    wrist, elbow = leaned(R_WRIST), leaned(R_ELBOW)
    grip = fist('fist-right', wrist, elbow, SWORD)
    # The flat of the blade faces forward and back, where the game's camera sees it.
    width = SWORD.cross(V(0, 1, 0)).normalized()
    side = SWORD.cross(width).normalized()
    guard = grip + 0.075 * SWORD
    rings = []
    for t, w, th in BLADE_STATIONS:
        c = guard + t * BLADE_LENGTH * SWORD
        rings.append([c + w * width, c + th * side, c - w * width, c - th * side])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * 4
    verts.append(guard + BLADE_LENGTH * SWORD)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    part('blade', verts, faces, M['blade'], inside=lambda c: guard + (c - guard).dot(SWORD) * SWORD)

    # A long cross-guard of the same pale steel, so the hilt shows as a cross against the black
    # sleeve, its ends swept down towards the hand; the grip and an iron pommel.
    for s in (-1, 1):
        cone(f'quillon-{s}', guard, guard + s * 0.095 * width - 0.035 * SWORD, 0.017, M['blade'], n=4,
             phase=45, back=None)
    end = grip - 0.1 * SWORD
    bent_tube('grip', [end, guard], [0.018, 0.018], M['leather'], n=4, phase=45)
    cone('pommel', end, end - 0.045 * SWORD, 0.028, M['iron'], n=4, phase=45, back=end + 0.015 * SWORD)


def reins(mount):
    # From the bits to his left hand, by way of points beside the neck.
    hand = leaned(L_WRIST) + 0.05 * (leaned(L_WRIST) - leaned(L_ELBOW)).normalized()
    for s, bit in zip((-1, 1), mount.bits):
        mid = mount.turned(V(s * 0.125, -0.52, 0.92))
        path = [bit, mid, hand + V(-s * 0.012, 0.0, -0.01)]
        width = V(0, 0, 0.012)
        verts = [p + width for p in path] + [p - width for p in path]
        part(f'rein-{s}', verts, [(0, 1, 4, 3), (1, 2, 5, 4)], M['leather'], outward=V(s, 0, 0))


def main():
    reset()
    make_materials()
    mount = horse(COAT, POINTS, tack='caparison', raised='right', turn=40)
    body, caparison = bpy.data.objects['horse-body'], bpy.data.objects['horse-caparison']
    clear_cloth(caparison, body)
    covered = [body, caparison] + legs()
    fixed = set(bpy.context.scene.objects)
    cloak()
    hood()
    mantle()
    sleeve('right', R_SHOULDER, R_ELBOW, R_WRIST)
    sleeve('left', L_SHOULDER, L_ELBOW, L_WRIST)
    fist('fist-left', L_WRIST, L_ELBOW, V(0, 0, 1))
    for obj in bpy.context.scene.objects:
        if obj not in fixed:
            obj.data.transform(LEANING)
    skirts(Surface(*covered))
    sword()
    reins(mount)
    finish('khamul', budget=MOUNTED_BUDGET)


main()
