"""What the arenas share: the ground the board stands on and what stands round it (docs/viewer-spec.md
section 3, Arena; README.md, Arenas).

An arena script, in arenas/, calls kit.reset(), builds its floor and props from parts with the
helpers here and in kit.py, and ends with `finish_arena()`, which joins them, bakes ambient
occlusion into the vertex colours and exports the arena to packages/client/public/arenas/. Run it
headless:

    blender --background --factory-startup --python-exit-code 1 --python arenas/<id>.py [-- <out.glb>]

Coordinates are Blender's, as for the models: z up, 1 Blender unit to 1 game unit, and the board's
centre at the origin. Blender's -Y is the game's +Z, towards team A's back row and the camera that
looks from behind it; +Y is towards team B's. The board's hexes are the client's, and their tops
are at 0, so an arena's floor is a little lower (FLOOR_TOP).

An arena is static and drawn as one mesh per material. Its faces are flat-shaded by the client,
so it is exported without normals, its vertices shared between faces, and its only colour beyond
its materials is the baked occlusion, which darkens the corners, gaps and feet of things as the
scene's lights can't.
"""

import math
import os
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import MAX_METALLIC, V, ellipse, frame, part  # noqa: E402

ARENAS = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'arenas'))

# Triangle budget for an arena (placeholder, docs/viewer-spec.md section 3).
ARENA_BUDGET = 48000

# The board, as the client draws it (packages/client/src/layout.ts): 7 columns of pointy-top hexes,
# 8 rows, circumradius 1 apart, centred on the origin, drawn with a radius of 0.94.
BOARD_COLS = 7
BOARD_ROWS = 8
HEX_SPACING = 1.0
SQRT3 = 3**0.5
HALF_X = SQRT3 * (BOARD_COLS - 0.5) / 2
HALF_Y = 1.5 * (BOARD_ROWS - 1) / 2

# The tops of the floor's slabs. The board's hexes stand on a dais of mortar a little above it.
FLOOR_TOP = -0.12

# Where the arena leaves room (Blender coordinates, |x| and |y|): the court round the board and the
# bench, which nothing taller than a pebble or a tuft of grass stands in; the band round it, which
# only low things (up to about knee height) stand in, so the cameras over either team's back row
# see the board and the bench past them; and beyond, where anything can stand.
COURT = (8.6, 9.6)
LOW_BAND = (10.6, 11.2)


def hex_centres():
    """The centres of the board's hexes, in Blender coordinates."""
    for row in range(BOARD_ROWS):
        for col in range(BOARD_COLS):
            yield V(SQRT3 * (col + 0.5 * (row & 1)) - HALF_X, 1.5 * row - HALF_Y, 0)


def in_hex(point, centre, radius):
    """Whether a point, seen from above, is inside the pointy-top hex round `centre`."""
    dx, dy = abs(point.x - centre.x), abs(point.y - centre.y)
    # Pointy-top: corners at ±y, flat sides at ±x.
    if dx > radius * SQRT3 / 2 or dy > radius:
        return False
    return dy <= radius - dx / SQRT3


def zone(x, y):
    """Where a point is: 'court', 'low' or 'open' (COURT and LOW_BAND above)."""
    ax, ay = abs(x), abs(y)
    if ax < COURT[0] and ay < COURT[1]:
        return 'court'
    if ax < LOW_BAND[0] and ay < LOW_BAND[1]:
        return 'low'
    return 'open'


# Shapes ----------------------------------------------------------------------------------------


def drum(name, start, end, radius, mat, n=8, chamfer=0.06, phase=0.0, broken=None, seed=0, cap_start=True):
    """A faceted cylinder from `start` to `end`, its ends chamfered by `chamfer`: a column's drum, a
    shaft, a fallen piece. `broken`, a length, breaks the end at `end` off raggedly: each point of it
    is pulled back along the axis by up to that much, the same every build for the same `seed`.
    `cap_start=False` leaves the start open, where it stands on something."""
    start, end = Vector(start), Vector(end)
    axis = end - start
    length = axis.length
    a = axis.normalized()
    u, v = frame(a)
    jitter = random.Random(seed)
    c = min(chamfer, length / 4)
    stations = [(0.0, radius - c), (c, radius), (length - c, radius), (length, radius - c)]
    if broken is not None:
        stations = stations[:3] + [(length, radius)]
    rings = []
    for k, (t, r) in enumerate(stations):
        ring = []
        for i in range(n):
            angle = math.radians(phase) + math.tau * i / n
            along = t
            if broken is not None and k == len(stations) - 1:
                along = t - jitter.uniform(0.0, broken)
            ring.append(start + a * along + r * math.cos(angle) * u + r * math.sin(angle) * v)
        rings.append(ring)
    verts = [p for ring in rings for p in ring]
    faces = []
    for r in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            faces.append((r * n + i, r * n + j, (r + 1) * n + j, (r + 1) * n + i))
    last = (len(rings) - 1) * n
    if broken is not None:
        # A ragged break: a fan from a point in the middle, pulled back too.
        verts.append(end - a * jitter.uniform(0.2 * broken, 0.6 * broken))
        middle = len(verts) - 1
        faces += [(last + i, last + (i + 1) % n, middle) for i in range(n)]
    else:
        faces.append(tuple(range(last, last + n)))
    if cap_start:
        faces.append(tuple(range(n)))
    return part(name, verts, faces, mat, inside=lambda p: start + a * (p - start).dot(a))


def block(name, centre, size, mat, yaw=0.0, tilt=(0.0, 0.0), chamfer=0.05):
    """A squared stone with chamfered top edges: a slab, a wall's ashlar, a plinth. `size` is its
    full width, depth and height; it turns by `yaw` degrees about the upright and tips by `tilt`
    (degrees about x and y). Its bottom is left open, as it stands on something."""
    cx, cy, cz = centre
    w, d, h = (s / 2 for s in size)
    c = min(chamfer, w / 3, d / 3, h)
    rings = [
        [V(-w, -d, -h), V(w, -d, -h), V(w, d, -h), V(-w, d, -h)],
        [V(-w, -d, h - c), V(w, -d, h - c), V(w, d, h - c), V(-w, d, h - c)],
        [V(-w + c, -d + c, h), V(w - c, -d + c, h), V(w - c, d - c, h), V(-w + c, d - c, h)],
    ]
    turn = (
        _rotation('Z', yaw)
        @ _rotation('Y', tilt[1])
        @ _rotation('X', tilt[0])
    )
    verts = [V(cx, cy, cz) + turn @ p for ring in rings for p in ring]
    faces = []
    for r in range(2):
        for i in range(4):
            j = (i + 1) % 4
            faces.append((r * 4 + i, r * 4 + j, (r + 1) * 4 + j, (r + 1) * 4 + i))
    faces.append((8, 9, 10, 11))
    return part(name, verts, faces, mat, inside=V(cx, cy, cz))


def rock(name, centre, radii, mat, seed, yaw=None, squash=0.75):
    """A chunky, blocky rock: a box whose corners are pushed about and whose top is narrowed, so it
    reads as broken stone rather than a pebble. `radii` are half-sizes along x, y and z."""
    jitter = random.Random(seed)
    rx, ry, rz = radii
    yaw = jitter.uniform(0, 360) if yaw is None else yaw
    turn = _rotation('Z', yaw) @ _rotation('X', jitter.uniform(-12, 12)) @ _rotation('Y', jitter.uniform(-12, 12))
    verts = []
    for z, k in ((-rz, 1.0), (rz * 0.35, 1.0), (rz, squash)):
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            p = V(sx * rx * k * jitter.uniform(0.8, 1.15), sy * ry * k * jitter.uniform(0.8, 1.15), z * jitter.uniform(0.85, 1.1))
            verts.append(Vector(centre) + turn @ p)
    faces = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 9, 8), (5, 6, 10, 9), (6, 7, 11, 10), (7, 4, 8, 11), (8, 9, 10, 11), (3, 2, 1, 0)]
    # Each quad as two triangles, since the corners pushed about bend them.
    tris = []
    for f in faces:
        if len(f) == 4:
            tris += [(f[0], f[1], f[2]), (f[0], f[2], f[3])]
    return part(name, verts, tris, mat, inside=Vector(centre))


def tuft(name, centre, mat, seed, height=0.35, blades=5):
    """A tuft of grass: thin blades fanning out from a point, each a narrow three-sided spike."""
    jitter = random.Random(seed)
    objects = []
    base = Vector(centre)
    for b in range(blades):
        angle = math.tau * b / blades + jitter.uniform(-0.4, 0.4)
        lean = jitter.uniform(0.15, 0.45)
        h = height * jitter.uniform(0.6, 1.1)
        tip = base + V(math.cos(angle) * lean * h, math.sin(angle) * lean * h, h)
        root = base + V(math.cos(angle) * 0.03, math.sin(angle) * 0.03, 0)
        w = 0.045
        side = V(-math.sin(angle), math.cos(angle), 0)
        out = V(math.cos(angle), math.sin(angle), 0)
        verts = [root + side * w, root - side * w, root - out * w * 0.8, tip]
        faces = [(0, 1, 3), (1, 2, 3), (2, 0, 3)]
        objects.append(part(f'{name}.{b}', verts, faces, mat, inside=root + V(0, 0, h * 0.2)))
    return objects


def _rotation(axis, degrees):
    from mathutils import Matrix

    return Matrix.Rotation(math.radians(degrees), 3, axis)


def hex_prism(name, centre, radius, z0, z1, mat):
    """A pointy-top hex prism, as the board's hexes are (a corner towards ±y), open underneath."""
    bottom = ellipse(centre.x, centre.y, z0, radius, radius, 6, phase=90)
    top = ellipse(centre.x, centre.y, z1, radius, radius, 6, phase=90)
    faces = [(i, (i + 1) % 6, 6 + (i + 1) % 6, 6 + i) for i in range(6)] + [tuple(range(6, 12))]
    return part(name, bottom + top, faces, mat, inside=V(centre.x, centre.y, (z0 + z1) / 2))


def hex_frame(name, centre, inner, outer, z0, z1, mat):
    """A pointy-top hex frame, as the board's hexes are (a corner towards ±y): its top between
    `inner` and `outer` from the centre, its outer side down to `z0`, its inner side down to `z0`
    too, open underneath."""

    def ring(radius, z):
        return ellipse(centre.x, centre.y, z, radius, radius, 6, phase=90)

    verts = ring(outer, z0) + ring(outer, z1) + ring(inner, z1) + ring(inner, z0)
    faces = []
    for band in range(3):
        for i in range(6):
            j = (i + 1) % 6
            faces.append((band * 6 + i, band * 6 + j, (band + 1) * 6 + j, (band + 1) * 6 + i))
    mid = (inner + outer) / 2

    def inside(p):
        # The middle of the frame's wall nearest the face.
        d = Vector((p.x - centre.x, p.y - centre.y, 0))
        return Vector((centre.x, centre.y, (z0 + z1) / 2)) + (d.normalized() * mid if d.length > 0 else d)

    return part(name, verts, faces, mat, inside=inside)


# Export ----------------------------------------------------------------------------------------


def output_path(name: str) -> str:
    """The .glb path given after `--` on the command line, or the arena's place in public/arenas."""
    argv = sys.argv
    if '--' in argv and len(argv) > argv.index('--') + 1:
        return argv[argv.index('--') + 1]
    os.makedirs(ARENAS, exist_ok=True)
    return os.path.join(ARENAS, f'{name}.glb')


def finish_arena(name: str, budget: int = ARENA_BUDGET, ao_distance=1.6, ao_floor=0.32, samples=48) -> bpy.types.Object:
    """Joins every mesh into one object called `name`, checks it, bakes ambient occlusion into its
    vertex colours and exports it as a .glb, without normals (the client shades it flat).

    The occlusion is reached within `ao_distance`, and the darkest it makes anything is `ao_floor`
    of its colour. Fails over the triangle `budget`, with an image texture or with a material more
    metallic than MAX_METALLIC. Prints a summary line starting with MODEL."""
    out = output_path(name)
    scene = bpy.context.scene
    layer = bpy.context.view_layer
    parts = [o for o in scene.objects if o.type == 'MESH']
    if not parts:
        raise RuntimeError('nothing to export')
    for o in scene.objects:
        o.select_set(o in parts)
    layer.objects.active = parts[0]
    bpy.ops.object.join()
    arena = layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    arena.name = name
    arena.data.name = name
    arena.data.polygons.foreach_set('use_smooth', [False] * len(arena.data.polygons))
    bpy.ops.object.material_slot_remove_unused()

    materials = [m for m in arena.data.materials if m is not None]
    for m in materials:
        if m.use_nodes and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes):
            raise RuntimeError(f'{name}: material "{m.name}" uses an image texture')
        bsdf = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
        if bsdf is not None and bsdf.inputs['Metallic'].default_value > MAX_METALLIC + 1e-6:
            raise RuntimeError(f'{name}: material "{m.name}" is more metallic than {MAX_METALLIC}')

    arena.data.calc_loop_triangles()
    triangles = len(arena.data.loop_triangles)
    xs, ys, zs = zip(*(v.co for v in arena.data.vertices))
    print(
        f'MODEL {name}: {triangles} triangles (budget {budget}), {len(arena.data.vertices)} vertices, '
        f'x {min(xs):.1f} to {max(xs):.1f}, y {min(ys):.1f} to {max(ys):.1f}, height {max(zs):.2f}, '
        f'materials {", ".join(m.name for m in materials)}'
    )
    if triangles > budget:
        raise RuntimeError(f'{name} has {triangles} triangles, over the budget of {budget}')

    bake_occlusion(arena, ao_distance, ao_floor, samples)

    for o in scene.objects:
        o.select_set(o is arena)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=False,
        export_materials='EXPORT',
        export_vertex_color='ACTIVE',
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )
    print(f'EXPORTED {out}')
    return arena


def bake_occlusion(arena, distance, floor, samples):
    """Bakes ambient occlusion into a colour attribute on the arena's vertices, with Cycles, and
    lifts it so nothing goes darker than `floor` of its colour."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    world = bpy.data.worlds.new('arena') if scene.world is None else scene.world
    scene.world = world
    world.light_settings.distance = distance
    scene.render.bake.target = 'VERTEX_COLORS'
    attribute = arena.data.color_attributes.new('occlusion', 'BYTE_COLOR', 'POINT')
    arena.data.color_attributes.active_color = attribute
    arena.data.attributes.active_color = attribute
    bpy.context.view_layer.objects.active = arena
    arena.select_set(True)
    bpy.ops.object.bake(type='AO')
    values = [0.0] * (len(attribute.data) * 4)
    attribute.data.foreach_get('color', values)
    for i in range(0, len(values), 4):
        # The bake's grey, as linear light, lifted to the floor.
        ao = values[i]
        lifted = floor + (1 - floor) * ao
        values[i] = values[i + 1] = values[i + 2] = lifted
        values[i + 3] = 1.0
    attribute.data.foreach_set('color', values)
