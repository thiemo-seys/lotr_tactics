"""Gimli as a hand-carved, hand-painted wooden game piece: the Carved style of the art study.

Every unit is one carved figure standing on a turned plinth painted in its team's colour, so the
board reads as a tabletop and the units as its pieces. Forms are compact and knife-cut. The chamfers
are part of each part's geometry (a step in a turned profile, the inset face of a slab) rather than
a bevel modifier over everything, so only the edges that catch the light cost triangles. Each part
prints its triangle count, to see where the budget goes.

    blender --background --factory-startup --python-exit-code 1 --python carved.py -- <out.glb>
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from common import finish, material, reset, team_material  # noqa: E402

# Paint and bare wood, as sRGB. Wood is left bare where a folk carver would leave it (face, hands,
# haft, the back of the shield); everything else is painted. Steel is a light grey: the game has no
# environment map, so real metal would look dark.
BEECH = 0xC89A63  # bare wood: face and hands
WALNUT = 0x7A5232  # bare wood: the haft
OAK = 0xB98A55  # bare wood: the boards of the shield, light so it shows from behind
BEARD = 0xA4582C  # auburn, browner than the red team
STEEL = 0xC3C9D0  # helmet, axe head, shield rim and boss
MAIL = 0x80878F  # a darker grey than the helmet
LEATHER = 0x4A3222  # belt, boots, bracers
CLOTH = 0x5A4C3E  # trousers
BRASS = 0xD6A640  # the buckle, and the gilt line round the plinth
INK = 0x1C1612  # painted eyes

PAINT = 0.58  # satin paint
BARE = 0.72  # oiled bare wood


class Paint:
    """The model's materials, named after what they are."""

    def __init__(self):
        self.team = team_material()
        # The shared team material is matt; this piece is painted in satin like the rest of it.
        self.team.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = PAINT
        self.skin = material('skin', BEECH, roughness=BARE)
        self.wood = material('wood', WALNUT, roughness=BARE)
        self.boards = material('boards', OAK, roughness=BARE)
        self.beard = material('beard', BEARD, roughness=PAINT)
        self.steel = material('steel', STEEL, roughness=0.45, metallic=0.1)
        self.mail = material('mail', MAIL, roughness=0.55, metallic=0.1)
        self.leather = material('leather', LEATHER, roughness=PAINT)
        self.cloth = material('cloth', CLOTH, roughness=0.7)
        self.brass = material('brass', BRASS, roughness=0.4, metallic=0.1)
        self.ink = material('eyes', INK, roughness=0.4)


class Carving:
    """One part: vertices, faces and a material per face, placed by `matrix` and built into a mesh."""

    def __init__(self, name: str, matrix: Matrix | None = None):
        self.name = name
        self.matrix = matrix if matrix is not None else Matrix.Identity(4)
        self.flip = self.matrix.to_3x3().determinant() < 0
        self.verts: list[Vector] = []
        self.faces: list[tuple[int, ...]] = []
        self.materials: list[bpy.types.Material] = []

    def vert(self, x: float, y: float, z: float) -> int:
        self.verts.append(self.matrix @ Vector((x, y, z)))
        return len(self.verts) - 1

    def face(self, indices, mat) -> None:
        # Drop repeated corners, so a ring turned down to a point makes triangles.
        loop = [i for n, i in enumerate(indices) if i != indices[n - 1]]
        if len(loop) >= 3:
            self.faces.append(tuple(reversed(loop)) if self.flip else tuple(loop))
            self.materials.append(mat)

    def build(self) -> bpy.types.Object:
        data = bpy.data.meshes.new(self.name)
        data.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        slots = list(dict.fromkeys(self.materials))
        for m in slots:
            data.materials.append(m)
        data.polygons.foreach_set('material_index', [slots.index(m) for m in self.materials])
        data.validate()
        obj = bpy.data.objects.new(self.name, data)
        bpy.context.scene.collection.objects.link(obj)
        print(f'PART {self.name}: {sum(len(f) - 2 for f in self.faces)} triangles')
        return obj


def place(x: float = 0, y: float = 0, z: float = 0, turn_z: float = 0, tilt_x: float = 0) -> Matrix:
    """A matrix that tilts about X, then turns about Z (degrees), then moves to (x, y, z)."""
    return (
        Matrix.Translation((x, y, z))
        @ Matrix.Rotation(math.radians(turn_z), 4, 'Z')
        @ Matrix.Rotation(math.radians(tilt_x), 4, 'X')
    )


def whittle(k: int, seed: int) -> float:
    """A repeatable pseudo-random number in [-1, 1] for column k of a part."""
    x = math.sin(k * 12.9898 + seed * 78.233) * 43758.5453
    return 2 * (x - math.floor(x)) - 1


def turn(
    c: Carving, profile, mats, segments: int, phase: float = 0.0, scale=(1.0, 1.0),
    top=None, bottom=None, cut: float = 0.0, hidden=(),
):
    """Turns a profile of (radius, height) points, listed from the bottom up, about the part's Z axis,
    as on a lathe. mats[i] paints the band from profile[i] to profile[i + 1]; `top` and `bottom` paint
    caps. `phase` in degrees; with an even count, 180 / segments puts a flat face at the front.

    `cut` carves it by hand instead: each column of facets is moved round and in or out a little, the
    same all the way up, so the facets come out uneven as a knife leaves them but stay flat. `hidden`
    lists segments to leave out, where another part always covers them."""
    seed = sum(map(ord, c.name))  # each part is cut a little differently
    columns = []
    for k in range(segments):
        a = math.radians(phase) + 2 * math.pi * (k + 0.22 * cut * whittle(k, seed)) / segments
        columns.append((a, 1 + 0.035 * cut * whittle(k, seed + 1)))
    rings = []
    for r, z in profile:
        ring = [c.vert(r * s * math.cos(a) * scale[0], r * s * math.sin(a) * scale[1], z) for a, s in columns]
        rings.append([ring[0]] * segments if r == 0 else ring)
    for i, mat in enumerate(mats):
        lo, hi = rings[i], rings[i + 1]
        for k in (k for k in range(segments) if k not in hidden):
            k1 = (k + 1) % segments
            c.face((lo[k], lo[k1], hi[k1], hi[k]), mat)
    if top is not None:
        c.face(rings[-1], top)
    if bottom is not None:
        c.face(rings[0][::-1], bottom)


def outline_inset(outline, d: float) -> list[Vector]:
    """A counter-clockwise outline moved inward by d, each corner along its bisector."""
    out = []
    n = len(outline)
    for i in range(n):
        p0, p1, p2 = Vector(outline[i - 1]), Vector(outline[i]), Vector(outline[(i + 1) % n])
        n1 = Vector((-(p1 - p0).y, (p1 - p0).x)).normalized()
        n2 = Vector((-(p2 - p1).y, (p2 - p1).x)).normalized()
        bisector = (n1 + n2).normalized()
        out.append(p1 + bisector * (d / max(bisector.dot(n1), 0.35)))
    return out


def plank(c: Carving, outline, depth: float, chamfer: float, face_mat, both: bool = False):
    """A slab cut from a plank. The outline is (x, z) points, counter-clockwise seen from the front;
    the front face is at y = 0 facing -y, inset by `chamfer` so its edge is cut at 45 degrees, and the
    slab runs back to y = depth, open at the back where it goes into the body. `both` cuts the back
    the same way and closes it, for a blade seen from both sides."""
    inner = outline_inset(outline, chamfer)
    front = [c.vert(p.x, 0, p.y) for p in inner]
    rim = [c.vert(x, chamfer, z) for x, z in outline]
    back_y = depth - chamfer if both else depth
    # A blade cut from both sides to a sharp edge has no flat side between its chamfers.
    rear = rim if back_y <= chamfer else [c.vert(x, back_y, z) for x, z in outline]
    n = len(outline)
    c.face(front, face_mat)
    for i in range(n):
        j = (i + 1) % n
        c.face((front[i], rim[i], rim[j], front[j]), face_mat)
        if rear is not rim:
            c.face((rim[i], rear[i], rear[j], rim[j]), face_mat)
    if both:
        back = [c.vert(p.x, depth, p.y) for p in inner]
        for i in range(n):
            j = (i + 1) % n
            c.face((rear[i], back[i], back[j], rear[j]), face_mat)
        c.face(back[::-1], face_mat)


def tube(c: Carving, points, radii, mats, sides: int = 6):
    """A bent limb through `points`, with a ring of `sides` at each; mats[i] paints the stretch from
    points[i] to points[i + 1]. Its ends are left open: they go into the body and the fist."""
    points = [Vector(p) for p in points]
    rings = []
    for i, (p, r) in enumerate(zip(points, radii)):
        d = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        a = (Vector((1, 0, 0)) - d * d.x).normalized()
        b = d.cross(a)
        angles = (2 * math.pi * k / sides for k in range(sides))
        rings.append([c.vert(*(p + r * (math.cos(t) * a + math.sin(t) * b))) for t in angles])
    for i, mat in enumerate(mats):
        for k in range(sides):
            k1 = (k + 1) % sides
            c.face((rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]), mat)


# --- The piece, from the plinth up. The figure faces -y, so its right hand is at -x. ---

PLINTH_TOP = 0.13
HAFT = Vector((-0.37, -0.09))  # where the right fist holds the axe upright
FIST = 0.56  # how high the fist is


def plinth(p: Paint):
    """A turned base: a bead at the foot, a gilt step, a drum and a chamfered top, in team paint.
    It is the strongest team cue from every side, so it stays round and fairly fine."""
    c = Carving('plinth')
    profile = [(0.45, 0.0), (0.47, 0.032), (0.445, 0.055), (0.392, 0.066), (0.382, 0.11), (0.352, PLINTH_TOP)]
    turn(c, profile, [p.team, p.team, p.brass, p.team, p.team], 14, top=p.team)
    c.build()


def legs(p: Paint):
    """Short trouser legs in heavy boots, feet apart and toes turned out a little."""
    # The sole, counter-clockwise from above, with a blunt toe at -y.
    sole = [(0.066, -0.1), (0.066, 0.07), (-0.066, 0.07), (-0.066, -0.1), (-0.035, -0.152), (0.035, -0.152)]
    for side in (-1, 1):
        boot = Carving('boot', place(0.12 * side, -0.03, PLINTH_TOP, turn_z=-12 * side))
        # Straight up, then the top edge cut back at a slant.
        rings = [
            [boot.vert(v.x, v.y, z) for v in outline_inset(sole, shrink)]
            for z, shrink in ((0.0, 0.0), (0.07, 0.0), (0.1, 0.022))
        ]
        for i in range(2):
            for k in range(len(sole)):
                k1 = (k + 1) % len(sole)
                boot.face((rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]), p.leather)
        boot.face(rings[-1], p.leather)
        boot.build()
        leg = Carving('leg', place(0.105 * side, 0.005, 0))
        turn(leg, [(0.085, 0.2), (0.085, 0.36)], [p.cloth], 4, phase=45)
        leg.build()


def torso(p: Paint):
    """A barrel of mail from mid-thigh up under the mantle: broad, deep and squat."""
    c = Carving('torso')
    profile = [(0.27, 0.31), (0.245, 0.4), (0.27, 0.6)]
    # The three faces across the back are always under the cape.
    turn(c, profile, [p.mail] * 2, 8, phase=22.5, scale=(1.0, 0.8), cut=1, hidden=(0, 1, 2))
    c.build()


def belt(p: Paint):
    """A broad belt, carried forward over the beard so the beard is tucked in behind it."""
    c = Carving('belt')
    # Counter-clockwise from above: snug round the barrel behind, flat across the beard in front.
    ring = [
        (0.259, 0.086), (0.107, 0.207), (-0.107, 0.207), (-0.259, 0.086),
        (-0.262, -0.15), (-0.17, -0.318), (0.17, -0.318), (0.262, -0.15),
    ]
    inner = [(x * 0.82, y * 0.8) for x, y in ring]
    lo = [c.vert(x, y, 0.47) for x, y in ring]
    hi = [c.vert(x, y, 0.545) for x, y in ring]
    top = [c.vert(x, y, 0.545) for x, y in inner]
    for k in range(3, 8):  # the first three sides are under the cape
        k1 = (k + 1) % 8
        c.face((lo[k], lo[k1], hi[k1], hi[k]), p.leather)
        c.face((hi[k], hi[k1], top[k1], top[k]), p.leather)
    c.build()
    # The buckle, a brass plate with its edge cut back.
    buckle = Carving('buckle', place(0, -0.345, 0))
    plank(buckle, [(-0.055, 0.465), (0.055, 0.465), (0.055, 0.55), (-0.055, 0.55)], 0.03, 0.014, p.brass)
    buckle.build()


def beard(p: Paint):
    """The beard: a slab carved into four locks, from the cheeks down into the belt."""
    c = Carving('beard')
    # Rows from the cheeks down: (height, half-width, how far forward the locks stand).
    rows = [(0.865, 0.15, -0.168), (0.7, 0.178, -0.296), (0.5, 0.152, -0.298)]
    # Across the beard: (position, how far back), with a lock's crest at 0 and a groove between
    # locks, so flat shading catches each lock on one side and leaves the other in shade.
    across = [
        (-1.0, 0.035), (-0.75, 0.0), (-0.5, 0.03), (-0.25, 0.0), (0.0, 0.032),
        (0.25, 0.0), (0.5, 0.03), (0.75, 0.0), (1.0, 0.035),
    ]
    grid = [[c.vert(u * w, front + back, z) for u, back in across] for z, w, front in rows]
    behind = [-0.13, -0.17, -0.18]
    left = [c.vert(-w, y, z) for (z, w, _), y in zip(rows, behind)]
    right = [c.vert(w, y, z) for (z, w, _), y in zip(rows, behind)]
    for i in range(len(rows) - 1):
        for j in range(len(across) - 1):
            c.face((grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1], grid[i][j]), p.beard)
        c.face((left[i + 1], grid[i + 1][0], grid[i][0], left[i]), p.beard)
        c.face((grid[i + 1][-1], right[i + 1], right[i], grid[i][-1]), p.beard)
    c.build()


def head(p: Paint):
    """A block of a head: bare wood face, a big blunt wedge of a nose, painted eyes, a moustache."""
    c = Carving('head')
    # Eight faces round the head, a flat one at the front: cheeks in bare wood, hair round the rest.
    faces = [p.beard, p.beard, p.beard, p.beard, p.beard, p.skin, p.skin, p.skin]
    angles = [math.radians(22.5 + 45 * k) for k in range(8)]
    rings = [[c.vert(0.185 * math.cos(a), -0.01 + 0.152 * math.sin(a), z) for a in angles] for z in (0.78, 0.975)]
    for k in range(8):
        k1 = (k + 1) % 8
        c.face((rings[0][k], rings[0][k1], rings[1][k1], rings[1][k]), faces[k])
    front = -0.01 - 0.152 * math.cos(math.radians(22.5))
    # The nose: a wedge from under the brow to a broad, blunt tip out over the moustache.
    tl, tr = c.vert(-0.026, front, 0.945), c.vert(0.026, front, 0.945)
    bl, br = c.vert(-0.052, front, 0.845), c.vert(0.052, front, 0.845)
    nl, nr = c.vert(-0.02, front - 0.098, 0.862), c.vert(0.02, front - 0.098, 0.862)
    c.face((tl, nl, nr, tr), p.skin)
    c.face((tr, nr, br), p.skin)
    c.face((br, nr, nl, bl), p.skin)
    c.face((bl, nl, tl), p.skin)
    # Eyes painted on deep under the brim, which hides them from above like a heavy brow.
    for x in (-0.054, 0.054):
        corners = ((-0.015, 0.893), (0.015, 0.893), (0.015, 0.925), (-0.015, 0.925))
        c.face([c.vert(x + dx, front - 0.004, z) for dx, z in corners], p.ink)
    c.build()
    # The moustache, carved as one sweep under the nose and laid over the top of the beard.
    moustache = Carving('moustache', place(0, -0.248, 0))
    sweep = [
        (0.0, 0.808), (0.17, 0.758), (0.125, 0.834), (0.042, 0.852),
        (-0.042, 0.852), (-0.125, 0.834), (-0.17, 0.758),
    ]
    plank(moustache, sweep, 0.075, 0.02, p.beard)
    moustache.build()


def helmet(p: Paint):
    """A rounded steel cap on a rim band that juts out over the eyes like a heavy brow."""
    c = Carving('helmet', place(0, -0.01, 0))
    profile = [(0.205, 0.94), (0.21, 1.0), (0.183, 1.012), (0.17, 1.08), (0.108, 1.16), (0.0, 1.2)]
    turn(c, profile, [p.steel] * 5, 8, phase=22.5, scale=(1.0, 0.95), cut=1)
    c.build()


def mantle(p: Paint):
    """The hood, thrown back: a thick roll over the shoulders, and its cowl lying on the cape. With
    the cape, the shield's face and the plinth, it shows the team from the front, back and above."""
    c = Carving('mantle')
    profile = [(0.302, 0.575), (0.325, 0.65), (0.215, 0.825), (0.13, 0.86)]
    turn(c, profile, [p.team] * 3, 8, phase=22.5, scale=(1.0, 0.86), cut=1)
    c.build()
    # The cowl seen from behind, counter-clockwise: square at the neck, pointed down the back.
    cowl = Carving('cowl', place(0, 0.278, 0, turn_z=180))
    plank(cowl, [(0.0, 0.565), (0.15, 0.73), (0.13, 0.9), (-0.13, 0.9), (-0.15, 0.73)], 0.15, 0.028, p.team)
    cowl.build()


def cape(p: Paint):
    """A short cape down the back to the knees, carved in three folds."""
    c = Carving('cape')
    # Rows from the shoulders down: (height, radius, how deep the folds are).
    rows = [(0.7, 0.275, 0.0), (0.5, 0.31, 0.022), (0.27, 0.34, 0.04)]
    columns = 7
    angles = [math.radians(25 + 130 * j / (columns - 1)) for j in range(columns)]
    folds = [0, 1, -1, 1, -1, 1, 0]

    def point(r, a, z):
        return c.vert(r * math.cos(a), 0.82 * r * math.sin(a), z)

    outer = [[point(r + f * deep, a, z) for a, f in zip(angles, folds)] for z, r, deep in rows]
    # Only the side edges get a thickness: the hem faces the ground and the top is under the mantle.
    inner = [[point(r - 0.035, a, z) for a in (angles[0], angles[-1])] for z, r, _ in rows]
    for i in range(len(rows) - 1):
        for j in range(columns - 1):
            c.face((outer[i + 1][j], outer[i + 1][j + 1], outer[i][j + 1], outer[i][j]), p.team)
        c.face((outer[i][0], inner[i][0], inner[i + 1][0], outer[i + 1][0]), p.team)
        c.face((outer[i][-1], outer[i + 1][-1], inner[i + 1][1], inner[i][1]), p.team)
    c.build()


def arms(p: Paint):
    """Arms carved close to the body: mail sleeves to the elbow, leather bracers, a big fist. The
    left forearm is behind the shield."""
    radii = [0.078, 0.07, 0.074]
    right = Carving('right-arm')
    wrist = (HAFT.x + 0.03, HAFT.y + 0.035, FIST)
    tube(right, [(-0.245, 0.0, 0.67), (-0.31, 0.04, 0.5), wrist], radii, [p.mail, p.leather])
    right.build()
    left = Carving('left-arm')
    tube(left, [(0.245, 0.0, 0.67), (0.3, 0.04, 0.5), (0.35, -0.07, 0.47)], radii, [p.mail, p.leather])
    left.build()
    # A big fist round the haft, its top edge cut back where the light catches it.
    fist = Carving('fist', place(HAFT.x, HAFT.y, FIST))
    knuckles = [(0.08, -0.055), (0.08, 0.045), (0.066, 0.066)]
    turn(fist, knuckles, [p.skin] * 2, 6, phase=30, top=p.skin, bottom=p.skin)
    fist.build()


def axe(p: Paint):
    """A broad, single-bladed war axe with a crescent edge, carved thick, its edge turned outward so
    it shows in silhouette from the front and the back."""
    haft = Carving('haft', place(HAFT.x, HAFT.y, 0))
    turn(haft, [(0.031, 0.3), (0.031, 0.98)], [p.wood], 6, phase=30, top=p.wood)
    haft.build()
    # The head in the plane of the haft, 0.88 high. Its outline runs outward from the haft along +x,
    # counter-clockwise seen from the front, from a short poll to the edge; turning it round puts the
    # edge at -x.
    head = Carving('axe-head', place(HAFT.x, HAFT.y + 0.03, 0.88, turn_z=180))
    blade = [
        (-0.068, 0.046), (-0.068, -0.046), (0.06, -0.05), (0.2, -0.17), (0.255, -0.088),
        (0.27, 0.0), (0.255, 0.088), (0.2, 0.17), (0.06, 0.05),
    ]
    plank(head, blade, 0.056, 0.028, p.steel, both=True)
    head.build()


def shield(p: Paint):
    """A round shield on the left arm, turned toward the front and tipped back so its face shows
    from above: team face, steel rim and boss, bare boards behind."""
    c = Carving('shield', place(0.405, -0.13, 0.47, turn_z=40, tilt_x=80))
    profile = [(0.25, -0.02), (0.218, 0.048), (0.19, 0.03), (0.06, 0.045), (0.0, 0.085)]
    turn(c, profile, [p.steel, p.steel, p.team, p.steel], 12, bottom=p.boards)
    c.build()


def main():
    reset()
    paint = Paint()
    plinth(paint)
    legs(paint)
    torso(paint)
    belt(paint)
    beard(paint)
    head(paint)
    helmet(paint)
    mantle(paint)
    cape(paint)
    arms(paint)
    axe(paint)
    shield(paint)
    finish('gimli-carved', budget=800)


main()
