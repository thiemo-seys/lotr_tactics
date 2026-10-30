"""Gimli in the Storybook style, "ink and watercolour" (README.md).

A storybook illustration come to life: flat, matte watercolour colours, a bold ink line round every
shape, and elegant, exaggerated forms: a tall rounded helmet, a great sweeping beard tucked into the
belt, a barrel body tapering to small boots and a big crescent axe.

The ink line is an inverted hull: every part gets a copy pushed out along its normals, with its faces
reversed, in the backface-culled `outline` material, so only its far side draws, as a rim round the
shape. A rim only shows where a part's silhouette stands clear of what is behind it, so the parts are
rounded layers that sit on one another rather than shapes that meet in a crease.

    blender --background --factory-startup --python-exit-code 1 --python storybook.py -- <out.glb> [--flat]

--flat shades every face flat instead of smooth with sharp creases, to compare the two under toon
shading (smooth won). preview.py renders with Cycles, which has no backface culling and so would draw
the hull as a solid shell over the model; to preview, run preview.py through this script, which makes
the outline material clear wherever it faces the camera and changes nothing else:

    blender --background --factory-startup --python-exit-code 1 --python storybook.py -- --preview <model.glb> <out dir> [--quick]
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import finish, material, mesh, primitive, reset, team_material  # noqa: E402

# Six watercolour inks and the team colour, all matte. Steel and mail are two washes of one slate,
# leather and wood two of one sienna, so the palette stays small and harmonious.
INK = 0x2B211E  # sepia-black: the outline and the eyes
STEEL = 0xC6CED2  # pale slate: helmet, axe blade, shield rim
MAIL = 0x8C99A3  # deeper slate: the mail shirt
BEARD = 0xAD6230  # copper-rust: the chestnut beard and brows, kept clear of the red team
SKIN = 0xF0C7A1  # cream
LEATHER = 0x87583A  # sienna: belt, bracers, boots
WOOD = 0xB0804F  # light sienna: axe haft, back of the shield
BRASS = 0xD8A84E  # ochre: helmet band, buckle, shield boss
CLOTH = 0x5E6B55  # sage: trousers

# Ink line weights, as an illustrator draws them: bold round the figure's outside, finer for the
# lines inside it and for small parts.
BOLD = 0.02
LINE = 0.015
FINE = 0.009

MODEL_BUDGET = 800  # the model itself; the outline nearly doubles it, which finish() checks
SMOOTH = '--flat' not in sys.argv

# Every part that gets an ink line, with its weight.
INKED: list[tuple[bpy.types.Object, float]] = []


# --- Mesh helpers -----------------------------------------------------------------------------


def loft(rings, cap_start=True, cap_end=True, closed=False):
    """Vertices and faces joining rings of points in order; a ring of one point is a pole.
    `closed` joins the last ring back to the first, for a torus, and leaves the ends uncapped."""
    verts, faces, first = [], [], []
    for r in rings:
        first.append(len(verts))
        verts.extend(Vector(p) for p in r)
    pairs = list(range(len(rings) - 1)) + ([len(rings) - 1] if closed else [])
    for k in pairs:
        j = (k + 1) % len(rings)
        a, b, na, nb = first[k], first[j], len(rings[k]), len(rings[j])
        if na == 1:
            faces += [(a, b + (i + 1) % nb, b + i) for i in range(nb)]
        elif nb == 1:
            faces += [(a + i, a + (i + 1) % na, b) for i in range(na)]
        else:
            faces += [(a + i, a + (i + 1) % na, b + (i + 1) % nb, b + i) for i in range(na)]
    if not closed:
        if cap_start and len(rings[0]) > 2:
            faces.append(tuple(reversed(range(first[0], first[0] + len(rings[0])))))
        if cap_end and len(rings[-1]) > 2:
            faces.append(tuple(range(first[-1], first[-1] + len(rings[-1]))))
    return verts, faces


def ellipse(z, rx, ry, n, cy=0.0, phase=0.0):
    """n points round an ellipse at height z, from the front (-Y) towards the left (+X)."""
    return [
        Vector((rx * math.sin(a), cy - ry * math.cos(a), z))
        for a in (phase + 2 * math.pi * i / n for i in range(n))
    ]


def tube(points, radii, sides=6, phase=0.0, cap_start=True, cap_end=True):
    """A tube along a path; a radius of 0 ends it in a point."""
    pts = [Vector(p) for p in points]
    axis = (pts[-1] - pts[0]).normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.7 else Vector((0, -1, 0))
    rings = []
    for i, p in enumerate(pts):
        if radii[i] == 0:
            rings.append([p])
            continue
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        u = t.cross(ref).normalized()
        w = t.cross(u)
        angles = (phase + 2 * math.pi * k / sides for k in range(sides))
        rings.append([p + radii[i] * (math.cos(a) * u + math.sin(a) * w) for a in angles])
    return loft(rings, cap_start, cap_end)


def revolve(profile, n, phase=0.0, cap_start=True, cap_end=True):
    """Rings round the local Z axis from (radius, height) pairs; a radius of 0 is a pole."""
    rings = [
        [Vector((0, 0, h))]
        if r == 0
        else [Vector((r * math.sin(a), -r * math.cos(a), h)) for a in (phase + 2 * math.pi * i / n for i in range(n))]
        for r, h in profile
    ]
    return loft(rings, cap_start, cap_end)


def shade(obj, smooth=True, crease=50.0):
    """Smooth shading with sharp edges past `crease` degrees, so toon bands follow the forms."""
    if smooth and SMOOTH:
        obj.data.shade_smooth()
        obj.data.set_sharp_from_angle(angle=math.radians(crease))
    else:
        obj.data.shade_flat()


def shape(name, verts, faces, mats, face_mats=None, ink=LINE, smooth=True, crease=50.0):
    """A part from vertices and faces, normals outward, with materials per face and an ink line
    (`ink` is its weight, or None for none)."""
    obj = mesh(name, verts, faces, mats[0])
    for m in mats[1:]:
        obj.data.materials.append(m)
    if face_mats is not None:
        obj.data.polygons.foreach_set('material_index', face_mats)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    shade(obj, smooth, crease)
    if ink:
        INKED.append((obj, ink))
    return obj


def solid(name, kind, mat, ink=LINE, smooth=True, crease=50.0, **kwargs):
    """A primitive part with its transform baked in, so its ink line is even in world space."""
    obj = primitive(kind, mat, **kwargs)
    obj.name = name
    # matrix_basis follows location, rotation and scale at once; matrix_world waits for an update.
    obj.data.transform(obj.matrix_basis)
    obj.matrix_basis = Matrix.Identity(4)
    shade(obj, smooth, crease)
    if ink:
        INKED.append((obj, ink))
    return obj


def pillow(name, mat, centre, size, turn=(0, 0, 0), ink=FINE):
    """A small octahedron, smooth shaded into a soft lump: brows, a hand half hidden by the shield."""
    sx, sy, sz = size
    verts = [(sx, 0, 0), (-sx, 0, 0), (0, sy, 0), (0, -sy, 0), (0, 0, sz), (0, 0, -sz)]
    faces = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
    rotation = Matrix.Rotation(turn[2], 3, 'Z') @ Matrix.Rotation(turn[1], 3, 'Y') @ Matrix.Rotation(turn[0], 3, 'X')
    return shape(name, place(verts, rotation, centre), faces, [mat], ink=ink, crease=120)


def place(verts, rotation, offset):
    """Vertices turned by a rotation matrix and moved."""
    return [rotation @ Vector(v) + Vector(offset) for v in verts]


# --- Parts ------------------------------------------------------------------------------------


def helmet(m):
    # A tall, gently pointed cap, taller than a hemisphere, with a brass band flared out at its brim.
    profile = [(0.172, 0.944), (0.174, 0.986), (0.150, 0.992), (0.146, 1.065), (0.092, 1.148), (0, 1.195)]
    verts, faces = revolve(profile, 8)
    # The brim's two rings of faces come first, in brass; then the dome, its tip and the cap below.
    face_mats = [1] * 16 + [0] * (len(faces) - 16)
    shape('helmet', verts, faces, [m['steel'], m['brass']], face_mats, ink=BOLD, crease=60)


def face(m):
    # Only a band of face shows between the helmet and the beard.
    verts, faces = loft([ellipse(0.968, 0.132, 0.128, 8, cy=-0.02), ellipse(0.83, 0.142, 0.138, 8, cy=-0.02)], cap_start=False, cap_end=False)
    shape('face', verts, faces, [m['skin']], ink=None)
    # A big potato nose and bushy brows set in a frown, standing out past the helmet's band so they
    # show from above; the eyes are dots of ink beneath them.
    solid('nose', 'ico_sphere', m['skin'], ink=FINE, subdivisions=1, radius=1, scale=(0.06, 0.054, 0.054), location=(0, -0.186, 0.866))
    for side in (1, -1):
        pillow(f'brow{side}', m['beard'], (side * 0.07, -0.145, 0.934), (0.062, 0.034, 0.022), (0, -side * 0.3, side * 0.3))
        eye = [(-0.014, 0, 0), (0, 0, 0.02), (0.014, 0, 0), (0, 0, -0.02)]
        shape(f'eye{side}', place(eye, Matrix.Rotation(-side * 0.5, 3, 'Z'), (side * 0.078, -0.142, 0.898)), [(0, 1, 2, 3)], [m['eyes']], ink=None)


def beard(m):
    # Cross-sections from the cheeks down to the belt: each wraps round the front, with its back
    # sunk in the chest, and bulges out so the beard stands clear of the mail as its own layer.
    def section(z_front, z_side, w, y_front, y_side, w_back, y_back):
        pts = [Vector((w_back, y_back, z_side))]
        for a in (90, 50, 15, -15, -50, -90):
            c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
            pts.append(Vector((w * s, y_side - (y_side - y_front) * c, z_front + (z_side - z_front) * (1 - c))))
        pts.append(Vector((-w_back, y_back, z_side)))
        return pts

    rings = [
        [Vector((0, -0.06, 0.9))],  # a pole inside the head closes the top
        section(0.84, 0.955, 0.148, -0.178, -0.055, 0.11, 0.0),
        section(0.765, 0.865, 0.21, -0.255, -0.095, 0.13, -0.02),
        section(0.675, 0.715, 0.198, -0.312, -0.19, 0.14, -0.12),
        section(0.588, 0.598, 0.178, -0.318, -0.245, 0.10, -0.175),
        section(0.50, 0.50, 0.09, -0.292, -0.268, 0.05, -0.21),
    ]
    verts, faces = loft(rings)
    shape('beard', verts, faces, [m['beard']], ink=LINE)
    # The tucked ends peek out under the belt: two points of beard.
    for side in (1, -1):
        verts, faces = tube([(side * 0.032, -0.287, 0.475), (side * 0.048, -0.302, 0.395)], [0.026, 0], sides=4, phase=math.pi / 4)
        shape(f'tuft{side}', verts, faces, [m['beard']], ink=FINE)
    # A sweeping moustache whose tips curl out over the beard.
    path = [(0.158, -0.208, 0.812), (0.085, -0.228, 0.812), (0, -0.218, 0.838), (-0.085, -0.228, 0.812), (-0.158, -0.208, 0.812)]
    verts, faces = tube(path, [0, 0.024, 0.03, 0.024, 0], sides=4, phase=math.pi / 4)
    shape('moustache', verts, faces, [m['beard']], ink=FINE)


def body(m):
    # The mail shirt: a barrel chest over a skirt that flares at mid-thigh.
    rings = [ellipse(0.27, 0.30, 0.26, 8), ellipse(0.63, 0.285, 0.238, 8, cy=-0.01), ellipse(0.785, 0.24, 0.19, 8)]
    verts, faces = loft(rings, cap_end=False)
    shape('mail', verts, faces, [m['mail']], ink=BOLD)
    # The broad belt, bowed forward over the beard so the beard tucks in behind it.
    n, path = 8, []
    for i in range(n):
        a = math.pi / n + 2 * math.pi * i / n
        path.append(Vector((0.285 * math.sin(a), -0.245 * math.cos(a), 0.51)))
    path[0], path[-1] = Vector((0.12, -0.31, 0.51)), Vector((-0.12, -0.31, 0.51))
    rings = []
    for dr, dz in ((-0.02, 0.042), (0.02, 0.0), (-0.02, -0.042)):
        rings.append([p + dr * Vector((p.x, p.y, 0)).normalized() + Vector((0, 0, dz)) for p in path])
    verts, faces = loft(rings, closed=True)
    shape('belt', verts, faces, [m['leather']], ink=FINE, crease=70)
    solid('buckle', 'cube', m['brass'], ink=FINE, scale=(0.046, 0.012, 0.038), location=(0, -0.339, 0.51))


def legs(m):
    for side in (1, -1):
        verts, faces = tube([(side * 0.105, -0.005, 0.335), (side * 0.135, -0.02, 0.10)], [0.088, 0.072], cap_start=False, cap_end=False)
        shape(f'leg{side}', verts, faces, [m['cloth']], ink=LINE)
        # A small boot that tapers to a toe turned out and up a little.
        sole = [(0, -0.15, 0.03), (0.055, -0.075, 0), (0.052, 0.035, 0), (0, 0.062, 0), (-0.052, 0.035, 0), (-0.055, -0.075, 0)]
        cuff = [Vector((0.07 * math.sin(a), -0.005 - 0.07 * math.cos(a), 0.13)) for a in (2 * math.pi * i / 6 for i in range(6))]
        verts, faces = loft([[Vector(p) for p in sole], cuff], cap_end=False)
        turn = Matrix.Rotation(side * math.radians(10), 3, 'Z')
        shape(f'boot{side}', place(verts, turn, (side * 0.135, -0.02, 0)), faces, [m['leather']], ink=LINE)


def arms(m):
    # Right arm (-X) holds the axe at the hip; left arm (+X) holds the shield out in front.
    for side, elbow, wrist in (
        (-1, (-0.335, -0.04, 0.585), (-0.345, -0.128, 0.47)),
        (1, (0.338, -0.04, 0.59), (0.362, -0.19, 0.555)),
    ):
        shoulder = (side * 0.245, -0.01, 0.765)
        verts, faces = tube([shoulder, elbow], [0.074, 0.086], cap_start=False)
        shape(f'sleeve{side}', verts, faces, [m['mail']], ink=LINE)
        verts, faces = tube([elbow, wrist], [0.062, 0.055], cap_start=False, cap_end=False)
        shape(f'bracer{side}', verts, faces, [m['leather']], ink=LINE)
    solid('hand-1', 'ico_sphere', m['skin'], ink=LINE, subdivisions=1, radius=1, scale=(0.062, 0.066, 0.064), location=(-0.35, -0.152, 0.455))
    pillow('hand1', m['skin'], (0.37, -0.215, 0.56), (0.055, 0.05, 0.058), ink=LINE)


def cloak(m):
    # The hood, thrown back, lies round the shoulders as a mantle and bunches up behind the neck; in
    # front it tucks in under the beard.
    rings = []
    for r, z, lift, dip in ((0.125, 0.872, 0.06, 0.0), (0.218, 0.866, 0.06, 0.0), (0.335, 0.735, 0.0, 0.06)):
        ring = []
        for a in (2 * math.pi * i / 8 for i in range(8)):
            tuck = 1 - 0.32 * max(0.0, math.cos(a)) ** 2
            back = (1 - math.cos(a)) / 2
            height = z + lift * back - dip * back**4 - 0.03 * (1 - back)
            ring.append(Vector((tuck * r * math.sin(a), 0.015 - 0.9 * tuck * r * math.cos(a), height)))
        rings.append(ring)
    verts, faces = loft(rings, closed=True)
    shape('mantle', verts, faces, [m['team']], ink=LINE, crease=80)
    # Like the dwarves' hoods in The Hobbit, the hood ends in a long tail with a tassel: thrown back,
    # it lies on the cape below the mantle's point.
    def diamond(y, z, half_width, half_depth):
        return [Vector((half_width * math.sin(a), y - half_depth * math.cos(a), z)) for a in (math.pi * i / 2 for i in range(4))]

    verts, faces = loft([diamond(0.25, 0.80, 0.10, 0.04), diamond(0.29, 0.66, 0.065, 0.028), diamond(0.31, 0.55, 0.028, 0.018), [Vector((0, 0.322, 0.48))]])
    shape('hood', verts, faces, [m['team']], ink=FINE)
    verts, faces = tube([(0, 0.32, 0.50), (0, 0.326, 0.41)], [0.026, 0], sides=4, phase=math.pi / 4)
    shape('tassel', verts, faces, [m['brass']], ink=FINE)
    # The cape falls from under the mantle to the knees in soft folds, its hem curving down to the
    # back and flaring forward at the sides, so a corner of team colour shows from the front too.
    cols = 7
    rows = ((0.235, 0.215, 70, 0.80, 0.0), (0.36, 0.315, 78, 0.48, 0.01), (0.40, 0.37, 96, 0.155, 0.022))
    outer, inner = [], []
    for rx, ry, spread, z, fold in rows:
        for j in range(cols):
            t = -1 + 2 * j / (cols - 1)
            phi = math.radians(spread * t)
            ridge = fold if j % 2 == 0 else -fold
            zj = z if z > 0.2 else z + 0.1 * t * t
            for grid, k in ((outer, 1.0), (inner, 1.0 - 0.03 / ry)):
                grid.append(Vector(((k * rx + ridge) * math.sin(phi), (k * ry + ridge) * math.cos(phi), zj)))
    verts = outer + inner
    o = lambda r, c: r * cols + c  # noqa: E731
    i = lambda r, c: len(outer) + r * cols + c  # noqa: E731
    faces = []
    for r in range(len(rows) - 1):
        for c in range(cols - 1):
            faces.append((o(r, c), o(r + 1, c), o(r + 1, c + 1), o(r, c + 1)))
            faces.append((i(r, c), i(r, c + 1), i(r + 1, c + 1), i(r + 1, c)))
        for c in (0, cols - 1):
            faces.append((o(r, c), i(r, c), i(r + 1, c), o(r + 1, c)))
    for r in (0, len(rows) - 1):
        for c in range(cols - 1):
            faces.append((o(r, c), o(r, c + 1), i(r, c + 1), i(r, c)))
    shape('cape', verts, faces, [m['team']], ink=BOLD, crease=60)


def shield(m):
    # A round shield on the left arm, held forward, turned out and tipped up so its face shows from
    # the front and from above. Steel rim, team face, brass boss, wooden back.
    n = 12
    profile = [(0.235, -0.014), (0.235, 0.01), (0.198, 0.018), (0, 0.03)]
    verts, faces = revolve(profile, n, cap_end=False)
    # Faces: two steel bands round the rim, the team face, then the wooden back.
    face_mats = [0] * (2 * n) + [1] * n + [2]
    normal = Vector((0.629, -0.749, 0.208)).normalized()
    turn = Vector((0, 0, 1)).rotation_difference(normal).to_matrix()
    centre = Vector((0.40, -0.275, 0.56))
    shape('shield', place(verts, turn, centre), faces, [m['steel'], m['team'], m['wood']], face_mats, ink=BOLD, crease=60)
    verts, faces = revolve([(0.055, 0.026), (0, 0.066)], 8, cap_start=False)
    shape('boss', place(verts, turn, centre), faces, [m['brass']], ink=FINE)


def axe(m):
    # A broad, single-bladed war axe held upright in the right hand, tipped forward a little, its
    # crescent blade turned outward so its full curve shows from the front and the back.
    fist = Vector((-0.35, -0.152, 0.455))
    d = Vector((-0.07, -0.25, 0.966)).normalized()
    bottom, top = fist - 0.30 * d, fist + 0.46 * d
    verts, faces = tube([bottom, top], [0.022, 0.022])
    shape('haft', verts, faces, [m['wood']], ink=LINE)
    head = top - 0.07 * d
    u = (Vector((-1, 0, 0)) - Vector((-1, 0, 0)).dot(d) * d).normalized()
    w = u.cross(d)
    # The blade's outline in (out from the haft, up the haft): a crescent edge between two horns.
    blade = [
        (0.02, 0.045), (0.09, 0.055), (0.16, 0.09), (0.205, 0.19), (0.255, 0.14), (0.283, 0.06), (0.29, -0.03),
        (0.275, -0.12), (0.24, -0.19), (0.185, -0.25), (0.14, -0.12), (0.08, -0.06), (0.02, -0.045),
    ]
    front, back = [], []
    for s, v in blade:
        half = 0.016 * (1 - 0.72 * s / 0.285)  # thick at the haft, thin at the edge
        p = head + s * u + v * d
        front.append(p + half * w)
        back.append(p - half * w)
    k = len(blade)
    faces = [tuple(range(k)), tuple(reversed(range(k, 2 * k)))]
    faces += [(a, (a + 1) % k, k + (a + 1) % k, k + a) for a in range(k)]
    shape('blade', front + back, faces, [m['steel']], ink=LINE, crease=40)
    # The socket round the haft, with a short poll behind it.
    corners = [(su, sv, sw) for su in (-0.055, 0.03) for sv in (-0.045, 0.045) for sw in (-0.024, 0.024)]
    verts = [head + su * u + sv * d + sw * w for su, sv, sw in corners]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    shape('socket', verts, faces, [m['steel']], ink=FINE, crease=40)


def inked(parts):
    """The ink line: for each part, a hull pushed out along its normals with its faces reversed, in a
    backface-culled material, so only its far side shows, as a rim round the part."""
    ink = material('outline', INK, roughness=1.0, backface_culling=True)
    hulls = []
    for obj, weight in parts:
        data = obj.data.copy()
        bm = bmesh.new()
        bm.from_mesh(data)
        bm.normal_update()
        for v in bm.verts:
            v.co += v.normal * weight * min(v.calc_shell_factor(), 2.0)
            v.co.z = max(v.co.z, 0.0)  # the line stops at the ground, under the boots
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(data)
        bm.free()
        data.materials.clear()
        data.materials.append(ink)
        data.polygons.foreach_set('material_index', [0] * len(data.polygons))
        data.shade_smooth()
        if 'sharp_edge' in data.attributes:
            data.attributes.remove(data.attributes['sharp_edge'])
        hull = bpy.data.objects.new(f'{obj.name}-outline', data)
        bpy.context.scene.collection.objects.link(hull)
        hulls.append(hull)
    return hulls


def triangles(objs) -> int:
    total = 0
    for o in objs:
        o.data.calc_loop_triangles()
        total += len(o.data.loop_triangles)
    return total


@bpy.app.handlers.persistent
def cull_outline(*_):
    """Cycles has no backface culling, so the hull would hide the model in preview.py's renders:
    make the outline material transparent wherever it faces the camera, as three.js culls it."""
    mat = bpy.data.materials.get('outline')
    if mat is None or not mat.use_nodes or 'Backfacing' in mat.node_tree.nodes:
        return
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
    surface = out.inputs['Surface'].links[0].from_socket
    facing = nodes.new('ShaderNodeNewGeometry')
    facing.name = 'Backfacing'
    clear = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    links.new(facing.outputs['Backfacing'], mix.inputs['Fac'])
    links.new(surface, mix.inputs[1])
    links.new(clear.outputs['BSDF'], mix.inputs[2])
    links.new(mix.outputs['Shader'], out.inputs['Surface'])


def preview():
    """Runs preview.py unchanged, with the ink line drawn the way the game will draw it."""
    bpy.app.handlers.render_pre.append(cull_outline)
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'preview.py')
    with open(path) as source:
        exec(compile(source.read(), path, 'exec'), {'__name__': '__main__', '__file__': path})


def main():
    if '--preview' in sys.argv:
        preview()
        return
    reset()
    m = {
        'team': team_material(),
        'steel': material('steel', STEEL, roughness=1.0),
        'mail': material('mail', MAIL, roughness=1.0),
        'beard': material('beard', BEARD, roughness=1.0),
        'skin': material('skin', SKIN, roughness=1.0),
        'leather': material('leather', LEATHER, roughness=1.0),
        'wood': material('wood', WOOD, roughness=1.0),
        'brass': material('brass', BRASS, roughness=1.0),
        'cloth': material('cloth', CLOTH, roughness=1.0),
        'eyes': material('eyes', INK, roughness=1.0),
    }
    m['team'].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0  # matte like the rest
    for build in (helmet, face, beard, body, legs, arms, cloak, shield, axe):
        build(m)
    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in parts:
        print(f'PART {o.name}: {triangles([o])}')
    model = triangles(parts)
    hulls = inked(INKED)
    outline = triangles(hulls)
    print(f'STORYBOOK model {model} triangles (budget {MODEL_BUDGET}), outline {outline}, total {model + outline}')
    if model > MODEL_BUDGET:
        raise RuntimeError(f'the model has {model} triangles, over its budget of {MODEL_BUDGET}')
    finish('gimli-storybook', budget=2 * MODEL_BUDGET, flat=not SMOOTH)


main()
