"""What the game's models share, in the Faceted style (docs/viewer-spec.md section 4, README.md).

A model script calls `reset()`, builds the model from parts with materials from `material()`, and
ends with `finish()`, which joins, checks and exports it to packages/client/public/models/. Run it
headless:

    blender --background --factory-startup --python-exit-code 1 --python units/<id>.py [-- <out.glb>]

Coordinates are Blender's: z up, and the model faces -Y, which is +Z in the game, so a character's
right hand is at -X. 1 Blender unit is 1 game unit, and the origin is the centre of the model's
base, on the ground.

Forms are built from hand-placed vertices: rings of points (`ellipse()`, `segment()`) joined into
bands of quads by `loft()`, and made into a mesh by `part()`, which winds every face to point
outwards. Gimli (units/gimli.py) is the reference for how they are used.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

# The client recolours the `team` material (docs/viewer-spec.md section 4). These are the team
# colours from packages/client/src/scene.ts: the near side is blue, the far side red.
TEAM_BLUE = 0x4A90D9
TEAM_RED = 0xD9534F

# The pawn the models replace is 1.35 tall, and a hex is drawn with a circumradius of 0.94.
PAWN_HEIGHT = 1.35
HEX_RADIUS = 0.94

# Triangle budgets (placeholders, docs/viewer-spec.md section 4).
UNIT_BUDGET = 800
MOUNTED_BUDGET = 1200
LARGE_BUDGET = 2000

# Metal looks dark in the game, which has no environment map, so steel is a light grey instead.
MAX_METALLIC = 0.15

MODELS = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'models'))

# Colours most models share (sRGB): earthy and a little desaturated, so the team colour is the one
# saturated part.
STEEL = 0xA9B2BA
MAIL = 0x7F8993
LEATHER = 0x6A4A32
BOOTS = 0x3A2C23
CLOTH = 0x574B3F
BRASS = 0xB8913F
WOOD = 0x8A6642
EYES = 0x1E1612


def output_path(name: str) -> str:
    """The .glb path given after `--` on the command line, or the model's place in public/models."""
    argv = sys.argv
    if '--' in argv and len(argv) > argv.index('--') + 1:
        return argv[argv.index('--') + 1]
    os.makedirs(MODELS, exist_ok=True)
    return os.path.join(MODELS, f'{name}.glb')


def reset() -> None:
    """An empty scene, 1 Blender unit to 1 game unit."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0


def linear(colour: int) -> tuple[float, float, float, float]:
    """An sRGB hex colour such as 0x4a90d9, as the linear RGBA Blender and glTF store."""

    def channel(c: int) -> float:
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (channel(colour >> 16 & 255), channel(colour >> 8 & 255), channel(colour & 255), 1.0)


def material(
    name: str,
    colour: int,
    roughness: float = 0.85,
    metallic: float = 0.0,
    emission: int | None = None,
    emission_strength: float = 1.0,
) -> bpy.types.Material:
    """A plain coloured material, or the existing one with this name.

    Keep `metallic` at MAX_METALLIC or below; `finish()` fails a model above it.
    """
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = linear(colour)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission is not None:
        bsdf.inputs['Emission Color'].default_value = linear(emission)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    mat.diffuse_color = linear(colour)
    return mat


def team_material() -> bpy.types.Material:
    """The material the client recolours for each team."""
    return material('team', TEAM_BLUE)


def primitive(kind: str, mat: bpy.types.Material, scale=(1, 1, 1), **kwargs) -> bpy.types.Object:
    """Adds a `bpy.ops.mesh.primitive_<kind>_add` mesh (cube, cylinder, cone, ico_sphere, ...) with
    one material, and returns it. Other arguments, such as `location`, `rotation`, `vertices` or
    `radius`, go to the operator. Keep segment counts low: 4 to 8 round a cylinder or cone, and
    subdivisions=1 for an ico sphere."""
    getattr(bpy.ops.mesh, f'primitive_{kind}_add')(**kwargs)
    obj = bpy.context.active_object
    obj.scale = scale
    obj.data.materials.append(mat)
    return obj


# Geometry --------------------------------------------------------------------------------------


def V(x, y, z):
    return Vector((x, y, z))


def newell(points):
    """A polygon's normal (not normalised), sound for slightly bent polygons."""
    n = Vector((0.0, 0.0, 0.0))
    for p, q in zip(points, points[1:] + points[:1]):
        n.x += (p.y - q.y) * (p.z + q.z)
        n.y += (p.z - q.z) * (p.x + q.x)
        n.z += (p.x - q.x) * (p.y + q.y)
    return n


def wind(verts, faces, inside=None, outward=None):
    """Faces wound to point away from `inside` (a point, or a function of the face's centre giving
    one) or along `outward`, so normals are right however a face was listed."""
    verts = [Vector(v) for v in verts]
    wound = []
    for face in faces:
        points = [verts[i] for i in face]
        centre = sum(points, Vector()) / len(points)
        if outward is not None:
            away = Vector(outward)
        else:
            away = centre - (inside(centre) if callable(inside) else Vector(inside))
        wound.append(tuple(reversed(face)) if newell(points).dot(away) < 0 else tuple(face))
    return wound


def part(name, verts, faces, mats, face_mats=None, inside=None, outward=None):
    """A mesh object with one or more materials (`face_mats` indexes `mats` per face), its faces
    wound by `wind()` when given `inside` or `outward`."""
    mats = list(mats) if isinstance(mats, (list, tuple)) else [mats]
    if inside is not None or outward is not None:
        faces = wind(verts, faces, inside, outward)
    data = bpy.data.meshes.new(name)
    data.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    for m in mats:
        data.materials.append(m)
    for poly, index in zip(data.polygons, face_mats or [0] * len(faces)):
        poly.material_index = index
    if data.validate():
        raise RuntimeError(f'{name}: invalid geometry')
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def ellipse(cx, cy, z, rx, ry, n, phase=0.0, zs=None):
    """n points round an ellipse, counter-clockwise from above, the first at `phase` degrees from +X.
    `zs` gives each point its own height."""
    points = []
    for i in range(n):
        a = math.radians(phase) + math.tau * i / n
        points.append(V(cx + rx * math.cos(a), cy + ry * math.sin(a), zs[i] if zs else z))
    return points


def loft(rings, closed=True):
    """Quads joining consecutive rings of equal length: vertices, faces and each face's band."""
    n = len(rings[0])
    verts = [Vector(v) for ring in rings for v in ring]
    faces, bands = [], []
    for r in range(len(rings) - 1):
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            faces.append((r * n + i, r * n + j, (r + 1) * n + j, (r + 1) * n + i))
            bands.append(r)
    return verts, faces, bands


def on_surface(triangles, x, z):
    """The y of the first triangle under (x, z), seen along y: places a detail on a surface."""
    for a, b, c in triangles:
        det = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)
        u = ((x - a.x) * (c.z - a.z) - (c.x - a.x) * (z - a.z)) / det
        v = ((b.x - a.x) * (z - a.z) - (x - a.x) * (b.z - a.z)) / det
        if u >= 0 and v >= 0 and u + v <= 1:
            return a.y + u * (b.y - a.y) + v * (c.y - a.y)
    raise ValueError(f'nothing under ({x}, {z})')


def frame(axis):
    """Unit vectors u, v across `axis` such that (u, v, axis) is right-handed."""
    a = Vector(axis).normalized()
    helper = V(0, 0, 1) if abs(a.z) < 0.95 else V(0, 1, 0)
    u = a.cross(helper).normalized()
    return u, a.cross(u)


def segment(start, end, stations, n, phase=0.0, squash=1.0):
    """Rings of n points round the line from `start` to `end`; `stations` are (fraction, radius)."""
    start, end = Vector(start), Vector(end)
    u, v = frame(end - start)
    rings = []
    for t, r in stations:
        c = start.lerp(end, t)
        ring = []
        for i in range(n):
            a = math.radians(phase) + math.tau * i / n
            ring.append(c + r * math.cos(a) * u + r * squash * math.sin(a) * v)
        rings.append(ring)
    return rings


def nearest_on_line(a, b):
    """A function giving the point on the line through a and b nearest to a point."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    return lambda p: a + d * (p - a).dot(d)


def tube(name, start, end, stations, mats, band_mats=None, n=6, phase=0.0, squash=1.0):
    """A faceted tube along a straight line, open at both ends (they hide inside other parts)."""
    verts, faces, bands = loft(segment(start, end, stations, n, phase, squash))
    face_mats = [band_mats[b] for b in bands] if band_mats else None
    return part(name, verts, faces, mats, face_mats, inside=nearest_on_line(start, end))


def box(name, centre, axes, half, mat, taper=1.0):
    """A box round `centre` with half-sizes `half` along three unit `axes`; the face towards
    +axes[0] is scaled by `taper`, which reads as knuckles or a bevel."""
    a, b, c = (Vector(x).normalized() for x in axes)
    verts = []
    for sa in (-1, 1):
        k = taper if sa > 0 else 1.0
        for sb, sc in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            verts.append(Vector(centre) + sa * half[0] * a + k * (sb * half[1] * b + sc * half[2] * c))
    faces = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return part(name, verts, faces, mat, inside=centre)


def lean(objects, pivot, degrees):
    """Tips objects forward (towards -Y) about a horizontal axis through `pivot`."""
    tip = Matrix.Rotation(math.radians(degrees), 4, 'X')
    turn = Matrix.Translation(pivot) @ tip @ Matrix.Translation(-pivot)
    for obj in objects:
        obj.data.transform(turn)


# Export ----------------------------------------------------------------------------------------


def finish(name: str, budget: int = UNIT_BUDGET) -> bpy.types.Object:
    """Joins every mesh into one object called `name`, checks it and exports it as a .glb.

    Applies modifiers and transforms and shades every face flat. Fails over the triangle `budget`,
    without a `team` material, with an image texture or with a material more metallic than
    MAX_METALLIC; warns when the model doesn't stand on the origin or reaches outside its hex.
    Prints a summary line starting with MODEL.
    """
    out = output_path(name)
    scene = bpy.context.scene
    layer = bpy.context.view_layer
    kinds = {'MESH', 'CURVE', 'SURFACE', 'META', 'FONT'}
    parts = [o for o in scene.objects if o.type in kinds]
    if not parts:
        raise RuntimeError('nothing to export')
    for o in scene.objects:
        o.select_set(o in parts)
    layer.objects.active = parts[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.make_single_user(type='SELECTED_OBJECTS', object=True, obdata=True)
    bpy.ops.object.convert(target='MESH')  # applies modifiers
    bpy.ops.object.join()
    model = layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in [o for o in scene.objects if o is not model]:
        bpy.data.objects.remove(o)
    model.name = name
    model.data.name = name
    model.data.polygons.foreach_set('use_smooth', [False] * len(model.data.polygons))
    bpy.ops.object.material_slot_remove_unused()

    materials = [m for m in model.data.materials if m is not None]
    names = [m.name for m in materials]
    if 'team' not in names:
        raise RuntimeError(f'{name} has no material named "team"')
    for m in materials:
        if m.use_nodes and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes):
            raise RuntimeError(f'{name}: material "{m.name}" uses an image texture')
        bsdf = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
        if bsdf is not None and bsdf.inputs['Metallic'].default_value > MAX_METALLIC + 1e-6:
            raise RuntimeError(f'{name}: material "{m.name}" is more metallic than {MAX_METALLIC}')

    model.data.calc_loop_triangles()
    triangles = len(model.data.loop_triangles)
    xs, ys, zs = zip(*(v.co for v in model.data.vertices))
    height = max(zs)
    radius = max((x * x + y * y) ** 0.5 for x, y in zip(xs, ys))
    print(
        f'MODEL {name}: {triangles} triangles (budget {budget}), height {height:.2f}, '
        f'radius {radius:.2f}, base {min(zs):.3f}, materials {", ".join(names)}'
    )
    if abs(min(zs)) > 0.01:
        print(f'WARNING {name}: the lowest point is at {min(zs):.3f}, not on the ground at 0')
    if radius > HEX_RADIUS:
        print(f'WARNING {name}: reaches {radius:.2f} from the centre, outside its hex ({HEX_RADIUS})')
    if triangles > budget:
        raise RuntimeError(f'{name} has {triangles} triangles, over the budget of {budget}')

    for o in scene.objects:
        o.select_set(o is model)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_materials='EXPORT',
        export_vertex_color='NONE',
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )
    print(f'EXPORTED {out}')
    return model
