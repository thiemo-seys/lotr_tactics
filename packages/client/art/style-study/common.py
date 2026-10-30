"""Shared helpers for the art style study: one unit built in five styles (README.md).

A style script calls `reset()`, builds the model from meshes with materials from `material()`, and
ends with `finish()`, which joins, checks and exports it. Run it headless:

    blender --background --factory-startup --python-exit-code 1 --python <style>.py -- <out.glb>

Conventions (from the low-poly-artist agent): 1 Blender unit is 1 game unit; the origin is the
centre of the model's base, on the ground; the model faces -Y, which is +Z in the game; the part
that shows the team uses a material named `team`; no textures; one object in the export.
"""

import sys

import bpy

# The client recolours the `team` material (docs/viewer-spec.md section 4). These are the team
# colours from packages/client/src/scene.ts: the near side is blue, the far side red.
TEAM_BLUE = 0x4A90D9
TEAM_RED = 0xD9534F

# The pawn the models replace is 1.35 tall, and a hex is drawn with a circumradius of 0.94.
PAWN_HEIGHT = 1.35
HEX_RADIUS = 0.94


def output_path() -> str:
    """The .glb path given after `--` on the command line."""
    argv = sys.argv
    if '--' not in argv or len(argv) <= argv.index('--') + 1:
        raise RuntimeError('usage: blender ... --python <style>.py -- <out.glb>')
    return argv[argv.index('--') + 1]


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
    backface_culling: bool = False,
) -> bpy.types.Material:
    """A plain coloured material, or the existing one with this name.

    Keep `metallic` low (0.2 at most): the game has no environment map, so metal looks dark in
    three.js. Show steel with a light grey instead. `backface_culling` exports the material as
    single-sided, which an inverted-hull outline needs.
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
    mat.use_backface_culling = backface_culling
    return mat


def team_material() -> bpy.types.Material:
    """The material the client recolours for each team."""
    return material('team', TEAM_BLUE)


def primitive(kind: str, mat: bpy.types.Material, scale=(1, 1, 1), **kwargs) -> bpy.types.Object:
    """Adds a `bpy.ops.mesh.primitive_<kind>_add` mesh (cube, cylinder, cone, uv_sphere,
    ico_sphere, torus, ...) with one material, and returns it. Other arguments, such as
    `location`, `rotation`, `vertices` or `radius`, go to the operator."""
    getattr(bpy.ops.mesh, f'primitive_{kind}_add')(**kwargs)
    obj = bpy.context.active_object
    obj.scale = scale
    obj.data.materials.append(mat)
    return obj


def mesh(name: str, verts, faces, mat: bpy.types.Material) -> bpy.types.Object:
    """A mesh object from vertices and faces (lists of vertex indices), with one material."""
    data = bpy.data.meshes.new(name)
    data.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    data.validate()
    data.materials.append(mat)
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def finish(name: str, budget: int = 800, flat: bool = True) -> bpy.types.Object:
    """Joins every mesh into one object called `name`, checks it and exports it as a .glb.

    Applies modifiers and transforms and shades every face flat, unless `flat` is False, which
    keeps the script's own smooth and sharp settings. Fails over the triangle `budget`, without a
    `team` material, or with an image texture; warns when the model doesn't stand on the origin or
    reaches outside its hex. Prints a summary line starting with MODEL.
    """
    out = output_path()
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
    if flat:
        model.data.polygons.foreach_set('use_smooth', [False] * len(model.data.polygons))
    bpy.ops.object.material_slot_remove_unused()

    materials = [m for m in model.data.materials if m is not None]
    names = [m.name for m in materials]
    if 'team' not in names:
        raise RuntimeError(f'{name} has no material named "team"')
    for m in materials:
        if m.use_nodes and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes):
            raise RuntimeError(f'{name}: material "{m.name}" uses an image texture')

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
