"""Renders a model for review with Cycles on the CPU (README.md).

    blender --background --factory-startup --python-exit-code 1 --python preview.py -- <model.glb> <out dir> [--quick]

Writes one PNG per view and sheet.png, a 4 x 2 grid of them:

    hero (blue)   hero (red)   game-back (blue)   game-front (red)
    front         left         back               right

`hero` is three-quarters on the model's left; `game-back` and `game-front` look down at the game
camera's 45 degrees, from behind (how the near side is seen) and in front (the far side); the bottom
row turns the model round. Every style is framed the same, so sizes compare. --quick renders only
hero.png, smaller and with fewer samples. Single-sided materials, such as an inverted-hull outline,
draw as three.js draws them.
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1 :]
quick = '--quick' in args
model_path, out_dir = [a for a in args if not a.startswith('--')][:2]
os.makedirs(out_dir, exist_ok=True)

TEAM = {'blue': 0x4A90D9, 'red': 0xD9534F}
TILE = 0x31465F  # team A's half of the board, from scene.ts
GROUND = 0x12161C  # the game's background
BACKDROP = 0x2A3039
SIZE = 384 if quick else 512


def linear(colour):
    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (channel(colour >> 16 & 255), channel(colour >> 8 & 255), channel(colour & 255), 1.0)


def flat_material(name, colour, roughness=0.9):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = linear(colour)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16 if quick else 32
scene.cycles.use_adaptive_sampling = True
scene.cycles.use_denoising = True
scene.cycles.denoiser = 'OPENIMAGEDENOISE'
scene.cycles.max_bounces = 4
# No tone mapping, like the game's renderer, so colours match three.js.
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'

world = bpy.data.worlds.new('backdrop')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = linear(BACKDROP)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.6

# The model on a hex tile, on the dark ground between tiles.
bpy.ops.import_scene.gltf(filepath=model_path)
meshes = [o for o in scene.objects if o.type == 'MESH']
pivot = bpy.data.objects.new('pivot', None)
scene.collection.objects.link(pivot)
for o in scene.objects:
    if o.parent is None and o is not pivot:
        o.parent = pivot
team = next((m for m in bpy.data.materials if m.name == 'team'), None)
if team is None:
    raise RuntimeError('the model has no "team" material')


def single_sided(mat):
    """Draws a single-sided material the way three.js does: seen by the camera on its front faces
    only, and invisible to light. Cycles has no backface culling, and an inverted-hull outline
    would otherwise cage the model in shadow."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
    surface = out.inputs['Surface'].links[0].from_socket
    geometry = nodes.new('ShaderNodeNewGeometry')
    path = nodes.new('ShaderNodeLightPath')
    front = nodes.new('ShaderNodeMath')
    front.operation = 'SUBTRACT'
    front.inputs[0].default_value = 1.0
    links.new(geometry.outputs['Backfacing'], front.inputs[1])
    seen = nodes.new('ShaderNodeMath')
    seen.operation = 'MULTIPLY'
    links.new(path.outputs['Is Camera Ray'], seen.inputs[0])
    links.new(front.outputs['Value'], seen.inputs[1])
    hidden = nodes.new('ShaderNodeMath')
    hidden.operation = 'SUBTRACT'
    hidden.inputs[0].default_value = 1.0
    links.new(seen.outputs['Value'], hidden.inputs[1])
    mix = nodes.new('ShaderNodeMixShader')
    links.new(hidden.outputs['Value'], mix.inputs['Fac'])
    links.new(surface, mix.inputs[1])
    links.new(nodes.new('ShaderNodeBsdfTransparent').outputs['BSDF'], mix.inputs[2])
    links.new(mix.outputs['Shader'], out.inputs['Surface'])


# The glTF importer marks materials exported as single-sided with backface culling.
for mat in bpy.data.materials:
    if mat.use_backface_culling and mat.use_nodes:
        single_sided(mat)

bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.94, depth=0.12, location=(0, 0, -0.06), rotation=(0, 0, math.pi / 2))
bpy.context.active_object.data.materials.append(flat_material('tile', TILE))
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.12))
bpy.context.active_object.data.materials.append(flat_material('ground', GROUND, 1.0))


def sun(name, direction, strength, shadow=True):
    data = bpy.data.lights.new(name, 'SUN')
    data.energy = strength
    data.angle = math.radians(8)
    data.use_shadow = shadow
    light = bpy.data.objects.new(name, data)
    light.rotation_euler = Vector(direction).normalized().to_track_quat('Z', 'Y').to_euler()
    scene.collection.objects.link(light)


# The key light comes from where the game's sun is (5, 12, 8 in three.js), relative to the camera.
sun('key', (5, -8, 12), 2.6)
sun('rim', (-3, 8, 6), 1.6)
sun('fill', (-6, -4, 2), 0.5, shadow=False)

camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
camera.data.lens = 70
scene.collection.objects.link(camera)
scene.camera = camera

# Every model is framed the same: a box a little taller than the pawn, as wide as the hex.
low = Vector((-0.94, -0.94, 0))
high = Vector((0.94, 0.94, 1.5))
for o in meshes:
    for corner in o.bound_box:
        p = o.matrix_world @ Vector(corner)
        low = Vector(map(min, low, p))
        high = Vector(map(max, high, p))
target = Vector((0, 0, (low.z + high.z) / 2 - 0.05))
reach = max(high.z - low.z, high.x - low.x, high.y - low.y) / 2 + 0.12
distance = reach / math.tan(camera.data.angle / 2)


def shoot(name, turn, elevation, colour):
    """Renders the model turned by `turn` degrees, from `elevation` degrees above, in a team colour."""
    pivot.rotation_euler = (0, 0, math.radians(turn))
    team.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = linear(TEAM[colour])
    up = math.radians(elevation)
    camera.location = target + distance * Vector((0, -math.cos(up), math.sin(up)))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    path = os.path.join(out_dir, f'{name}.png')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


# The model faces -Y, towards the camera; turning it by -90 degrees shows its left side.
VIEWS = [
    ('hero', -35, 12, 'blue'),
    ('hero-red', -35, 12, 'red'),
    ('game-back', 180, 45, 'blue'),
    ('game-front', 0, 45, 'red'),
    ('front', 0, 5, 'blue'),
    ('left', -90, 5, 'blue'),
    ('back', 180, 5, 'blue'),
    ('right', 90, 5, 'blue'),
]
paths = [shoot(*view) for view in (VIEWS[:1] if quick else VIEWS)]

if not quick:

    def pixels(path):
        image = bpy.data.images.load(path)
        array = np.array(image.pixels[:], dtype=np.float32).reshape(SIZE, SIZE, 4)
        bpy.data.images.remove(image)
        return array

    # Image rows run from the bottom, so the top row of the sheet is the upper half of the array.
    sheet = np.ones((2 * SIZE, 4 * SIZE, 4), dtype=np.float32)
    for i, path in enumerate(paths):
        row, col = divmod(i, 4)
        sheet[(1 - row) * SIZE : (2 - row) * SIZE, col * SIZE : (col + 1) * SIZE] = pixels(path)
    image = bpy.data.images.new('sheet', 4 * SIZE, 2 * SIZE)
    image.pixels.foreach_set(sheet.ravel())
    image.filepath_raw = os.path.join(out_dir, 'sheet.png')
    image.file_format = 'PNG'
    image.save()
    print(f'SHEET {image.filepath_raw}')
