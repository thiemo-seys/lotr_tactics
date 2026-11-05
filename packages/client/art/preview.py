"""Renders a model for review with Cycles on the CPU (README.md).

    blender --background --factory-startup --python-exit-code 1 --python preview.py -- <model.glb> <out dir> \
        [--quick] [--fit] [--culled] [--clips[=idle,attack,...]] [--frames=0,3,8] [--size=480]

Writes one PNG per view and sheet.png, a 4 x 2 grid of them:

    hero    hero-right    game-back    game-front
    front   left          back         right

`hero` is three-quarters on the model's left and `hero-right` on its right; `game-back` and
`game-front` look down at the game camera's 45 degrees, from behind (how the near side is seen) and
in front (the far side); the bottom row turns the model round. The `team` material is drawn in the
unit's livery (livery.py, from packages/client/src/livery.json), as the client draws it on both
sides; the unit is the file's name without `.glb` and a star level's `-2` or `-3`, and a file named
after no unit gets the default livery. Every model is framed the same, so sizes compare, unless --fit frames the
model alone for a closer look at a small one. --quick renders only hero.png, smaller and with fewer
samples. Single-sided materials draw as three.js draws them. --culled draws every material
single-sided, as three.js would if the client culled back faces, so a face wound inside out, which
the double-sided export hides, shows as a hole (and the model casts no shadow).

A rigged model is drawn in its rest pose. With --clips it renders its clips instead, all of them or
those named: <clip>.png for each, a contact sheet of the clip's frames, numbered, in three rows
seen as the game's camera sees them, from 45 degrees up: from the front (as the far side is seen),
from its right and from behind (as the near side is seen). Short clips show every
frame, longer ones a dozen spread over them, with every frame of the first 0.2 s of an attack or a
cast, where the blow lands. --frames picks the frames instead, and --size sets the size of each
frame in pixels (224 by default), for a closer look.
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from livery import livery  # noqa: E402

args = sys.argv[sys.argv.index('--') + 1 :]
quick = '--quick' in args
fit = '--fit' in args
culled = '--culled' in args
clips = next((a for a in args if a.split('=')[0] == '--clips'), None)


def option(name):
    return next((a.split('=', 1)[1] for a in args if a.startswith(f'--{name}=')), None)


picked = option('frames')
model_path, out_dir = [a for a in args if not a.startswith('--')][:2]
os.makedirs(out_dir, exist_ok=True)

LIVERY = livery(model_path)
TILE = 0x31465F  # team A's half of the board, from scene.ts
GROUND = 0x12161C  # the game's background
BACKDROP = 0x2A3039
SIZE = int(option('size') or (224 if clips else 384 if quick else 512))
FPS = 30  # the clips' frames are the sim's ticks


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
scene.render.fps = FPS
scene.render.fps_base = 1.0
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 12 if clips else 16 if quick else 32
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
# A rigged model: its armature, in the rest pose, without the shapes the importer draws bones with.
armature = next((o for o in scene.objects if o.type == 'ARMATURE'), None)
if armature is not None:
    for shape in {b.custom_shape for b in armature.pose.bones if b.custom_shape is not None}:
        bpy.data.objects.remove(shape)
    data = armature.animation_data
    if data is not None:
        for track in data.nla_tracks:
            track.mute = True
        data.action = None
    for b in armature.pose.bones:
        b.matrix_basis.identity()
if clips and armature is None:
    raise RuntimeError('--clips needs a rigged model')
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


# The glTF importer marks materials exported as single-sided with backface culling; --culled makes
# every material single-sided.
for mat in bpy.data.materials:
    if (mat.use_backface_culling or culled) and mat.use_nodes:
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

# Every model is framed the same, a box a little taller than the pawn and as wide as the hex, unless
# --fit frames the model alone.
low = Vector((math.inf,) * 3 if fit else (-0.94, -0.94, 0))
high = Vector((-math.inf,) * 3 if fit else (0.94, 0.94, 1.5))
for o in meshes:
    for corner in o.bound_box:
        p = o.matrix_world @ Vector(corner)
        low = Vector(map(min, low, p))
        high = Vector(map(max, high, p))
target = Vector((0, 0, (low.z + high.z) / 2 - 0.05))
reach = max(high.z - low.z, high.x - low.x, high.y - low.y) / 2 + 0.12
if clips:  # closer, on the hex
    target.z -= 0.15
    reach *= 0.8
distance = reach / math.tan(camera.data.angle / 2)


def shoot(name, turn, elevation):
    """Renders the model turned by `turn` degrees, from `elevation` degrees above, in its livery."""
    pivot.rotation_euler = (0, 0, math.radians(turn))
    team.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = linear(LIVERY)
    up = math.radians(elevation)
    camera.location = target + distance * Vector((0, -math.cos(up), math.sin(up)))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    path = os.path.join(out_dir, f'{name}.png')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def pixels(path):
    image = bpy.data.images.load(path)
    array = np.array(image.pixels[:], dtype=np.float32).reshape(SIZE, SIZE, 4)
    bpy.data.images.remove(image)
    return array


def save_sheet(paths, columns, name):
    """A grid of renders, `columns` wide, saved as <name>.png in the output directory."""
    rows = -(-len(paths) // columns)
    # Image rows run from the bottom, so the top row of the sheet is the upper end of the array.
    sheet = np.ones((rows * SIZE, columns * SIZE, 4), dtype=np.float32)
    for i, path in enumerate(paths):
        if path is None:
            continue
        row, col = divmod(i, columns)
        sheet[(rows - 1 - row) * SIZE : (rows - row) * SIZE, col * SIZE : (col + 1) * SIZE] = pixels(path)
    image = bpy.data.images.new(name, columns * SIZE, rows * SIZE)
    image.pixels.foreach_set(sheet.ravel())
    image.filepath_raw = os.path.join(out_dir, f'{name}.png')
    image.file_format = 'PNG'
    image.save()
    print(f'SHEET {image.filepath_raw}')


# The model faces -Y, towards the camera; turning it by -90 degrees shows its left side.
VIEWS = [
    ('hero', -35, 12),
    ('hero-right', 35, 12),
    ('game-back', 180, 45),
    ('game-front', 0, 45),
    ('front', 0, 5),
    ('left', -90, 5),
    ('back', 180, 5),
    ('right', 90, 5),
]
# A clip's rows: from the front, its right and behind, at the game camera's 45 degrees.
CLIP_VIEWS = [('front', 0, 45), ('right', 90, 45), ('back', 180, 45)]
ONE_SHOT_DETAIL = 7  # every frame of an attack or cast up to 0.2 s, where it strikes


def clip_frames(name, last):
    """The frames a clip's sheet shows: all of a short clip, else a dozen spread over it."""
    if last <= 12:
        return list(range(last + 1))
    step = -(-last // 11)
    frames = set(range(0, last + 1, step)) | {last}
    if name in ('attack', 'cast'):
        frames |= set(range(ONE_SHOT_DETAIL))
    return sorted(frames)


def stamp(text):
    render = scene.render
    render.use_stamp = bool(text)
    for field in ('date', 'time', 'render_time', 'frame', 'frame_range', 'memory', 'hostname', 'camera',
                  'lens', 'scene', 'marker', 'filename', 'sequencer_strip'):
        setattr(render, f'use_stamp_{field}', False)
    render.use_stamp_note = bool(text)
    render.stamp_note_text = text
    render.stamp_font_size = 15


if clips:
    names = clips.split('=')[1].split(',') if '=' in clips else sorted(a.name for a in bpy.data.actions)
    data = armature.animation_data
    for name in names:
        action = bpy.data.actions[name]
        data.action = action
        data.action_slot = action.slots[0]
        last = round(action.frame_range[1])
        frames = [int(f) for f in picked.split(',') if int(f) <= last] if picked else clip_frames(name, last)
        paths = []
        for view, turn, elevation in CLIP_VIEWS:
            for f in frames:
                scene.frame_set(f)
                stamp(f'{name} {f}  {f / FPS:.2f} s')
                paths.append(shoot(f'{name}-{view}-{f:02d}', turn, elevation))
        save_sheet(paths, len(frames), name)
    stamp('')
else:
    paths = [shoot(*view) for view in (VIEWS[:1] if quick else VIEWS)]
    if not quick:
        save_sheet(paths, 4, 'sheet')
