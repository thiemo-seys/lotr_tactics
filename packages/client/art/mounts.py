"""The horse mounted units ride, in the Faceted style (docs/viewer-spec.md section 4, README.md).

Éomer's horse (units/eomer.py), built from parameters so that each Rider can have his own: a
compact, deep-chested horse with a long head, a crest of mane and a sweeping tail, nose to tail
inside the hex. `horse()` builds it after `reset()` and returns a `Horse`: where the rider sits,
where his feet hang and where the reins start. Éomer's script is the example of seating a rider.

The horse makes its `coat`, `horsehair` and `blaze` materials from its colours. Its bridle is
`leather` with a `brass` browband, its eyes `eyes` and its tack `team`, in the kit's colours unless
the rider's script made those materials first. It is 550 to 580 triangles, with its markings and
tack, which leaves the rider about 620 of MOUNTED_BUDGET.

Coordinates are Blender's, as in kit.py: z up, and the horse faces -Y, so its left is +X.
"""

import math
from dataclasses import dataclass
from itertools import pairwise

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from kit import (
    BRASS,
    EYES,
    LEATHER,
    V,
    bent_tube,
    loft,
    material,
    nearest_on_polyline,
    part,
    team_material,
)

M = {}  # the horse's materials by name, made by horse()


def make_materials(coat, points, blaze):
    M.clear()
    M.update(
        team=team_material(),
        coat=material('coat', coat, roughness=0.85),
        horsehair=material('horsehair', points, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        brass=material('brass', BRASS, roughness=0.55, metallic=0.1),
        eyes=material('eyes', EYES, roughness=0.6),
    )
    if blaze is not None:
        M['blaze'] = material('blaze', blaze, roughness=0.9)


class Surface:
    """The outside of some parts, to lay details on."""

    def __init__(self, *objects):
        verts, faces = [], []
        for obj in objects:
            base = len(verts)
            verts += [obj.matrix_world @ v.co for v in obj.data.vertices]
            faces += [[base + i for i in p.vertices] for p in obj.data.polygons]
        self.tree = BVHTree.FromPolygons(verts, faces)

    def onto(self, inside, direction, margin=0.0):
        """Where the ray from far out along `direction` back towards `inside` first meets the
        surface, moved `margin` further out: the outermost point of the surface that way."""
        d = Vector(direction).normalized()
        hit = self.tree.ray_cast(Vector(inside) + 3.0 * d, -d)[0]
        if hit is None:
            raise ValueError(f'nothing under {tuple(inside)} towards {tuple(d)}')
        return hit + margin * d


# Body --------------------------------------------------------------------------------------------

C8 = math.cos(math.pi / 8)

# The body as eight-sided rings across it, from the breast to the buttocks: y, the top (the line of
# the back), the bottom (the belly), the half-width, and how wide the top and bottom facets are.
BODY = [
    (-0.44, 0.73, 0.48, 0.165, 0.75, 0.8),  # the breast
    (-0.34, 0.81, 0.40, 0.215, 0.55, 0.85),  # the shoulders, the withers a ridge
    (-0.15, 0.79, 0.35, 0.245, 0.85, 1.0),  # the girth, the deepest
    (0.06, 0.75, 0.36, 0.255, 1.0, 1.0),  # the barrel, where he sits
    (0.25, 0.76, 0.41, 0.255, 1.0, 0.9),  # the loins and flank
    (0.39, 0.77, 0.44, 0.255, 0.95, 0.8),  # the croup and broad quarters
    (0.475, 0.73, 0.50, 0.185, 0.7, 0.7),  # the buttocks
]
BREAST, BUTTOCKS = V(0, -0.49, 0.61), V(0, 0.52, 0.615)


def body_row(y):
    """The BODY row at y, between the rows either side."""
    for a, b in pairwise(BODY):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return tuple(p + t * (q - p) for p, q in zip(a, b))
    raise ValueError(f'no body at y = {y}')


def body_ring(y, top, bottom, half, k_top=1.0, k_bottom=1.0, grow=0.0):
    """Eight points round the body at y, the first on its left (+X) side just above the middle;
    flat on top and underneath."""
    cz = (top + bottom) / 2
    rz = (top - bottom) / 2 / C8 + grow
    rx = half / C8 + grow
    ring = []
    for i in range(8):
        a = math.radians(22.5 + 45 * i)
        s = math.sin(a)
        k = k_top if s > 0.7 else k_bottom if s < -0.7 else 1.0
        ring.append(V(k * rx * math.cos(a), y, cz + rz * s))
    return ring


def horse_body():
    rings = [body_ring(*row) for row in BODY]
    verts, faces, _ = loft(rings)
    front, back, last = len(verts), len(verts) + 1, (len(rings) - 1) * 8
    verts += [BREAST, BUTTOCKS]
    faces += [(i, (i + 1) % 8, front) for i in range(8)]
    faces += [(last + i, last + (i + 1) % 8, back) for i in range(8)]
    return part('horse-body', verts, faces, M['coat'], inside=lambda c: V(0, min(max(c.y, -0.42), 0.44), 0.61))


# The neck: the crest (y, z), the throat (y, z) and the half-width, from inside the body up into the
# head. It rises steeply, so the head is carried high.
NECK = [
    ((-0.18, 0.81), (-0.43, 0.53), 0.15),
    ((-0.37, 1.0), (-0.57, 0.72), 0.12),
    ((-0.50, 1.12), (-0.66, 0.88), 0.10),
    ((-0.57, 1.18), (-0.71, 0.98), 0.09),
]


def neck_ring(crest, throat, half):
    """Six points round the neck: the crest, down its left side to the throat and up its right."""
    c, t = V(0, *crest), V(0, *throat)
    upper, lower = c.lerp(t, 0.3), c.lerp(t, 0.72)
    side = V(1, 0, 0)
    return [c, upper + 0.9 * half * side, lower + 0.8 * half * side, t, lower - 0.8 * half * side,
            upper - 0.9 * half * side]


def neck():
    rings = [neck_ring(*row) for row in NECK]
    verts, faces, _ = loft(rings)
    axis = [(V(0, *c) + V(0, *t)) / 2 for c, t, _ in NECK]
    return part('horse-neck', verts, faces, M['coat'], inside=nearest_on_polyline(axis))


# Head --------------------------------------------------------------------------------------------

# The head hangs from the poll, its long face sloping down and forward to the muzzle. Sections along
# it: the fraction of the way, the depth above the line (to the face) and below it (to the jaw), and
# the half-width at the brow and at the cheeks.
HEAD_START, HEAD_END = V(0, -0.62, 1.10), V(0, -0.875, 0.81)
HEAD = [
    (0.0, 0.085, 0.11, 0.085, 0.08),
    (0.3, 0.08, 0.125, 0.092, 0.085),  # the brow, and the round jowl under it
    (0.72, 0.062, 0.07, 0.066, 0.062),
    (1.0, 0.058, 0.06, 0.068, 0.064),  # the muzzle
]
DOWN_FACE = (HEAD_END - HEAD_START).normalized()
UP_FACE = DOWN_FACE.cross(V(1, 0, 0))  # forward and up, out of the face


def head_row(t):
    """The HEAD row at t, between the rows either side."""
    for a, b in pairwise(HEAD):
        if a[0] <= t <= b[0]:
            f = (t - a[0]) / (b[0] - a[0])
            return tuple(p + f * (q - p) for p, q in zip(a, b))
    raise ValueError(f'no head at t = {t}')


def head_ring(t, above, below, brow, cheek, grow=0.0):
    """Six points round the head at t: the ridge of the face, down its left side to the jaw and up
    its right; `grow` moves them all out, for a strap or a marking laid on it."""
    p = HEAD_START.lerp(HEAD_END, t)
    above, below, brow, cheek = above + grow, below + grow, brow + grow, cheek + grow
    side = V(1, 0, 0)
    upper, lower = p + 0.35 * above * UP_FACE, p - 0.45 * below * UP_FACE
    return [p + above * UP_FACE, upper + brow * side, lower + cheek * side, p - below * UP_FACE,
            lower - cheek * side, upper - brow * side]


def horse_head(blaze):
    rings = [head_ring(*row) for row in HEAD]
    verts, faces, _ = loft(rings)
    tip = HEAD_END + 0.035 * DOWN_FACE - 0.012 * UP_FACE
    verts.append(tip)
    last = (len(rings) - 1) * 6
    faces += [(last + i, last + (i + 1) % 6, len(verts) - 1) for i in range(6)]
    head = part('horse-head', verts, faces, M['coat'], inside=nearest_on_polyline([HEAD_START, tip]))

    # Ears pricked forward on the poll.
    poll = V(0, *NECK[-1][0])
    for s in (-1, 1):
        root = poll + V(s * 0.05, -0.02, -0.01)
        base = [root + V(0, -0.034, 0), root + V(s * 0.026, 0.024, 0), root + V(-s * 0.024, 0.024, 0)]
        point = root + V(s * 0.024, -0.035, 0.14)
        part(f'horse-ear-{s}', base + [point], [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['coat'],
             inside=root + V(0, 0, 0.02))

    # Dark eyes on the sides of the head, under the brow.
    for s, i in ((1, 1), (-1, 5)):
        ring = head_ring(*head_row(0.24), grow=0.004)
        centre = ring[i] - 0.012 * UP_FACE
        verts = [centre + 0.024 * DOWN_FACE, centre - 0.02 * DOWN_FACE + 0.008 * UP_FACE,
                 centre - 0.014 * DOWN_FACE - 0.014 * UP_FACE]
        part(f'horse-eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(s, 0, 0))

    # A white blaze down the long face, from a star on the brow to a snip on the nose: the top ridge
    # of the face and part of the facets either side of it.
    if blaze:
        rows = []
        for t, f in ((0.2, 0.4), (0.55, 0.17), (0.97, 0.3)):
            ring = head_ring(*head_row(t), grow=0.005)
            rows.append([ring[0].lerp(ring[5], f), ring[0], ring[0].lerp(ring[1], f)])
        verts, faces, _ = loft(rows, closed=False)
        part('horse-blaze', verts, faces, M['blaze'], inside=nearest_on_polyline([HEAD_START, HEAD_END]))

    # The bridle: a noseband, cheek-pieces up to the poll and a brass browband.
    band = [head_ring(*head_row(t), grow=0.007) for t in (0.66, 0.76)]
    verts, faces, _ = loft(band)
    part('horse-noseband', verts, faces, M['leather'], inside=nearest_on_polyline([HEAD_START, HEAD_END]))
    for s, (i, j) in ((1, (1, 2)), (-1, (5, 4))):
        strap = []
        for t in (0.7, 0.35, 0.06):
            ring = head_ring(*head_row(t), grow=0.006)
            mid = ring[i].lerp(ring[j], 0.4)
            strap.append([mid + V(0, 0, 0.018), mid - V(0, 0, 0.018)])
        verts, faces, _ = loft(strap, closed=False)
        part(f'horse-cheekpiece-{s}', verts, faces, M['leather'], outward=V(s, 0, 0))
    ring = head_ring(*head_row(0.08), grow=0.009)
    lower = [ring[1].lerp(ring[2], 0.3), ring[1], ring[0], ring[5], ring[5].lerp(ring[4], 0.3)]
    upper = [p - 0.028 * DOWN_FACE for p in lower]
    verts, faces, _ = loft([lower, upper], closed=False)
    part('horse-browband', verts, faces, M['brass'], inside=nearest_on_polyline([HEAD_START, HEAD_END]))
    return head


# The head turns to one side, Éomer's a little to its left so that it shows past him from behind.
# The neck bends between TURN_FROM and TURN_TO (y); in front of that the head turns whole.
TURN_FROM, TURN_TO = -0.32, -0.62


def turned(p, turn):
    """A point of the neck or head, turned with them `turn` degrees to the horse's left."""
    f = min(max((TURN_FROM - p.y) / (TURN_FROM - TURN_TO), 0.0), 1.0)
    a = math.radians(turn) * f
    x, y = p.x, p.y - TURN_FROM
    return V(x * math.cos(a) - y * math.sin(a), TURN_FROM + x * math.sin(a) + y * math.cos(a), p.z)


def turn_head(objects, turn):
    for obj in objects:
        for v in obj.data.vertices:
            v.co = turned(v.co, turn)


# The mane: a crest along the top of the neck from the poll to the withers, falling to the right.
def mane():
    crest = [V(0, *c) for c, _, _ in reversed(NECK)] + [V(0, -0.14, 0.80)]
    crest[0] = crest[0] + V(0, -0.02, -0.01)
    heights = [0.08, 0.135, 0.11, 0.13, 0.07]
    sections = []
    for k, (c, h) in enumerate(zip(crest, heights)):
        before = crest[max(k - 1, 0)]
        after = crest[min(k + 1, len(crest) - 1)]
        along = (after - before).normalized()
        up = V(1, 0, 0).cross(along)  # square to the crest, upwards
        if up.z < 0:
            up = -up
        sections.append([c + V(0.04, 0, 0) - 0.015 * up, c - 0.06 * V(1, 0, 0) - 0.04 * up,
                         c - 0.035 * V(1, 0, 0) + h * up])
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (len(verts) - 3, len(verts) - 2, len(verts) - 1)]
    inside = nearest_on_polyline(crest)
    part('horse-mane', verts, faces, M['horsehair'], inside=lambda c: inside(c) + V(-0.01, 0, 0.0))

    # The forelock, between the ears and down the brow.
    poll = crest[0]
    brow = HEAD_START.lerp(HEAD_END, 0.35) + 0.075 * UP_FACE
    verts = [poll + V(0.03, 0.01, 0.0), poll + V(-0.03, 0.01, 0.0), poll + V(0, 0, 0.04), brow + 0.012 * UP_FACE]
    part('horse-forelock', verts, [(0, 2, 3), (2, 1, 3), (0, 1, 3)], M['horsehair'],
         inside=(poll + brow) / 2 - 0.03 * UP_FACE)


# Legs and tail -----------------------------------------------------------------------------------

# Legs: from inside the body to the ground, the joints (elbow or stifle, knee or hock, fetlock,
# coronet, ground) and the radius at each. A raised foreleg is lifted, the hoof tucked under.
FORE = [V(0, -0.30, 0.49), V(0, -0.305, 0.25), V(0, -0.31, 0.095), V(0, -0.33, 0.045), V(0, -0.34, 0.0)]
FORE_RAISED = [V(0, -0.28, 0.47), V(0, -0.47, 0.36), V(0, -0.425, 0.215), V(0, -0.39, 0.18),
               V(0, -0.355, 0.165)]
HIND = [V(0, 0.30, 0.55), V(0, 0.41, 0.25), V(0, 0.385, 0.095), V(0, 0.36, 0.045), V(0, 0.35, 0.0)]
FORE_RADII = [(0.085, 0.095), (0.054, 0.058), (0.05, 0.052), (0.044, 0.046), (0.058, 0.064)]
HIND_RADII = [(0.10, 0.125), (0.054, 0.066), (0.05, 0.052), (0.044, 0.046), (0.058, 0.064)]
LEG_BANDS = [0, 1, 1, 1]  # the coat, then dark from the knee down


def legs(raised):
    mats = [M['coat'], M['horsehair']]
    for s in (-1, 1):
        x = V(s * 0.13, 0, 0)
        hind = [j + V(s * 0.14, 0.03 if s > 0 else 0, 0) for j in HIND]
        bent_tube(f'horse-hind-{s}', hind, HIND_RADII, mats, LEG_BANDS, phase=30, side=V(1, 0, 0),
                  level_end=True)
        if raised == ('left' if s > 0 else 'right'):
            bent_tube(f'horse-fore-{s}', [j + x for j in FORE_RAISED], FORE_RADII, mats, LEG_BANDS,
                      phase=30, side=V(1, 0, 0), end='cap')
        else:
            bent_tube(f'horse-fore-{s}', [j + x for j in FORE], FORE_RADII, mats, LEG_BANDS, phase=30,
                      side=V(1, 0, 0), level_end=True)


def tail():
    # Carried high, arching out from the croup before it sweeps down.
    joints = [V(0, 0.46, 0.72), V(0, 0.56, 0.755), V(0.01, 0.655, 0.67), V(0.02, 0.705, 0.5), V(0.03, 0.715, 0.32)]
    radii = [(0.04, 0.035), (0.06, 0.045), (0.08, 0.05), (0.085, 0.05), (0.07, 0.042)]
    bent_tube('horse-tail', joints, radii, M['horsehair'], n=5, phase=90, side=V(1, 0, 0),
              end=V(0.025, 0.69, 0.16))


def dorsal_stripe():
    # A dun's dark stripe along the spine, from under the cloth to the root of the tail.
    rows = []
    for y in (0.24, 0.39, 0.47):
        ring = body_ring(*body_row(y), grow=0.004)
        rows.append([ring[1].lerp(ring[2], 0.3), ring[2].lerp(ring[1], 0.3)])
    verts, faces, _ = loft(rows, closed=False)
    part('horse-stripe', verts, faces, M['horsehair'], outward=V(0, 0, 1))


# Tack, in the team colour ------------------------------------------------------------------------

CLOTH = 0.016  # how far the cloth stands off the coat


def saddle_cloth():
    """The team's saddle-cloth over the back under him, hanging down the flanks to points behind."""
    rows = []
    for y, drop in ((-0.2, 0.055), (0.04, 0.075), (0.28, 0.11)):
        ring = body_ring(*body_row(y), grow=CLOTH)
        across = [ring[i] for i in (7, 0, 1, 2, 3, 4)]
        left, right = across[0], across[-1]
        rows.append([left - V(0, 0, drop)] + across + [right - V(0, 0, drop)])
    rows[-1][0] += V(0.0, 0.05, -0.03)
    rows[-1][-1] += V(0.0, 0.05, -0.03)
    verts, faces, _ = loft(rows, closed=False)
    # A dag hanging from the hem between each pair of rows, on each side.
    width = len(rows[0])
    for r in range(len(rows) - 1):
        for i in (0, width - 1):
            a, b = r * width + i, (r + 1) * width + i
            verts.append((verts[a] + verts[b]) / 2 - V(0, 0, 0.07))
            faces.append((a, b, len(verts) - 1))
    part('horse-cloth', verts, faces, M['team'], inside=lambda c: V(0, c.y, 0.58))


# The caparison from the withers to the croup: y, and how low the hem hangs there.
CAPARISON = [(-0.22, 0.34), (-0.02, 0.3), (0.2, 0.3), (0.43, 0.34)]
FLARE = 0.025  # how far the hem stands out from the widest part of the body
DAGS = [0.08, 0.055, 0.09]  # how far the dag between each pair of rows hangs below the hem


def caparison():
    """A long cloth in the team colour over the back and down the flanks to a ragged hem below the
    belly, from the withers to the croup, its corners swept forward over the shoulders and back over
    the quarters."""
    rows = []
    for y, hem in CAPARISON:
        ring = body_ring(*body_row(y), grow=CLOTH)
        across = [ring[i] for i in (7, 0, 1, 2, 3, 4)]
        left, right = across[0], across[-1]
        rows.append([V(left.x + FLARE, y, hem)] + across + [V(right.x - FLARE, y, hem)])
    for i in (0, -1):
        rows[0][i] += V(0, -0.07, 0)
        rows[-1][i] += V(0, 0.04, 0)
    verts, faces, _ = loft(rows, closed=False)
    width = len(rows[0])
    for r in range(len(rows) - 1):
        for i in (0, width - 1):
            a, b = r * width + i, (r + 1) * width + i
            verts.append((verts[a] + verts[b]) / 2 - V(0, 0, DAGS[r]))
            faces.append((a, b, len(verts) - 1))
    part('horse-caparison', verts, faces, M['team'], inside=lambda c: V(0, c.y, 0.58))


def breast_strap(surface):
    """A broad strap in the team colour round the breast, under the throat, from the front of the
    cloth on one side to the other."""
    # It runs round from the left side to the right, low under the throat and higher at the sides.
    # Each point stands a little outside the furthest the chest reaches across the strap's width
    # and halfway to its neighbours, so no corner of the body pokes through between them.
    centre, steps, half = V(0, -0.3, 0), 12, 0.032
    upper, lower = [], []
    for k in range(steps + 1):
        a = math.radians(10 - 200 * k / steps)
        z = 0.605 + 0.095 * math.cos(a) ** 2
        reach = 0.0
        for da in (-100 / steps, 0, 100 / steps):
            out = V(math.cos(a + math.radians(da)), math.sin(a + math.radians(da)), 0)
            for dz in (-half, 0, half):
                hit = surface.onto(centre + V(0, 0, z + dz), out)
                reach = max(reach, (hit - centre - V(0, 0, hit.z)).length)
        out = V(math.cos(a), math.sin(a), 0)
        upper.append(centre + (reach + 0.016) * out + V(0, 0, z + half))
        lower.append(centre + (reach + 0.016) * out + V(0, 0, z - half))
    verts, faces, _ = loft([lower, upper], closed=False)
    part('horse-strap', verts, faces, M['team'], inside=V(0, -0.3, 0.6))


# Rider -------------------------------------------------------------------------------------------

# He sits on the cloth over the barrel, behind the withers; his ankles hang either side below the
# belly line, a little ahead of his seat, where Éomer's are.
SEAT_Y = 0.04
STIRRUPS = (V(-0.31, -0.025, 0.43), V(0.31, -0.025, 0.43))  # right, left


@dataclass
class Horse:
    """Where the rider of a horse() goes, in the model's frame. Éomer (units/eomer.py) sits with his
    hips just above the seat, his knees forward and out over the flanks and his ankles at the
    stirrups; his reins run from his hand to the bits by way of points beside the neck, turned()."""

    seat: Vector  # the top of the cloth in the middle of the back, where he sits
    stirrups: tuple[Vector, Vector]  # where his ankles hang, right (-X) and left (+X)
    bits: tuple[Vector, Vector]  # the corners of the mouth, where the reins start, right and left
    turn: float  # degrees the head is turned to the horse's left

    @property
    def saddle_height(self) -> float:
        """How high he sits: the top of the cloth."""
        return self.seat.z

    def turned(self, point) -> Vector:
        """A point by the neck or head, placed as if the horse looked straight ahead, turned with
        them: where the reins pass the neck."""
        return turned(Vector(point), self.turn)


TACK = ('saddle-cloth', 'caparison')
RAISED = ('left', 'right', None)  # which foreleg is lifted


def horse(coat, points, blaze=None, stripe=False, tack='saddle-cloth', raised='left', turn=20):
    """Builds a horse and returns where its rider goes.

    `coat` and `points` are sRGB colours: the body, and the mane, tail and lower legs. Its markings
    are a white or other `blaze` down the face (its colour, or None) and a dun's dark `stripe` down
    the back. `tack` is 'saddle-cloth', Éomer's, or 'caparison', a longer cloth hanging low down the
    flanks, as for the Nazgûl's black horses; both come with the breast strap. `raised` is the
    foreleg lifted, ready to charge, 'left' or 'right', or None for all four hooves down. `turn` is
    how many degrees the head turns to the horse's left, so it shows past the rider from behind;
    negative turns it to the right.
    """
    if tack not in TACK or raised not in RAISED:
        raise ValueError(f'tack is one of {TACK} and raised one of {RAISED}: not {tack!r}, {raised!r}')
    make_materials(coat, points, blaze)
    body = horse_body()
    before = set(bpy.context.scene.objects)
    throat = neck()
    horse_head(blaze is not None)
    mane()
    turn_head(set(bpy.context.scene.objects) - before, turn)
    legs(raised)
    tail()
    if stripe:
        dorsal_stripe()
    if tack == 'caparison':
        caparison()
    else:
        saddle_cloth()
    breast_strap(Surface(body, throat))

    top = body_ring(*body_row(SEAT_Y), grow=CLOTH)
    bits = tuple(turned(head_ring(0.86, 0.0, 0.04, 0.0, 0.062)[i], turn) for i in (4, 2))
    return Horse(seat=(top[1] + top[2]) / 2, stirrups=STIRRUPS, bits=bits, turn=turn)
