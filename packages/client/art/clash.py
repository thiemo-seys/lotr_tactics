"""Checks a rigged model's clips for what its hands carry passing through its head or its chest.

    blender --background --factory-startup --python packages/client/art/clash.py -- <model.glb> \
        <chest material>[,<material>...] [--clips=attack,cast] [--leave=brim,...] \
        [--carried=bone,...] [--targets=bone,...]

(The clips may also come third, without `--clips=`, as the check used before it was in the kit.)

What it tests, in every frame of every clip, at the clips' 30 frames a second and on the half frames
between, and in the rest pose:

- What the hands carry: the parts on `hand_l` and `hand_r` and on every bone below them, such as an
  archer's `string` and `arrow`, Pippin's `stone`, Radagast's `bird` or Treebeard's `boulder`, and on
  the bones `--carried` names and those below them (a shield strapped to `forearm_l`). Points are
  sampled every centimetre along the edges between their vertices, posed as the skin poses them, so
  an edge from one bone to another, such as a bowstring's, is tested where it is drawn.
- What they mustn't go into: the head, every part on `head`; and the chest, the largest island (by
  the volume of its hull) of the parts on `spine` in the chest material, so a quiver, a pauldron or a
  strap in the same material is left out. Give two or more materials, such as `sable,silver`, for a
  chest whose emblem or band is a material of its own. `--leave` leaves materials out of every target,
  such as a hat's brim, which stands out from the head. `--targets` tests the parts on more bones,
  such as a `beard` or a `cape`.

A point clashes when it is more than 4 mm (`MARGIN`) inside the target's convex hull and as far under
its real surface, by the nearest face and that face's normal; its depth is the lesser of the two.
For each frame with a clash it prints the deepest point of each carried bone in each target, with the
materials of the edge it is on and of the face it is under:

    CLASH attack frame 2.5: hand_r (iron/skin) 27 mm into the head (skin), from (-0.21, -0.08, 0.93)
    to (-0.05, -0.11, 1.02)

`from` is where the point is on what is carried, and `to` where it is in the target, both on the
model as built, in Blender's frame (+X its left, -Y its front, +Z up). A line for each clip then
sums up each bone and target: the frames and the deepest. `CLASH rest` lines are the rest pose, the
model as built, so a clash there is in every frame that hardly moves the hand. It ends with a count
and exits 0: a clash is for a person to judge.

Its limits. Check what it reports against a render (`preview.py --clips --frames --size`) before
changing anything:

- Convex hulls overstate. The hull of a wide part, such as a pauldron, a hood or a cape, takes in
  the space between it and the body. The surface test only rules a point out where the nearest face
  turns its front to it, and the inside of a hood, or the space behind a cape or under a pauldron's
  rim, is behind a face. A hand at the cheek inside a hood, or tucked under a pauldron, is reported
  though nothing shows.
- A mouthpiece at the lips, a cup at the mouth or a hand drawn to the cheek is in the head by design.
- A real clash can be hidden: a fist in a big beard, the butt of a haft inside the body behind the
  hand that holds it, a knuckle in the tip of an ear. Whether it shows is for the render to say.
- It samples edges, not faces, so a flat blade's middle can pass through a thin part unseen; and it
  doesn't look for the carried parts in the arms, the legs, the other hand or a mount.
"""

import sys
from collections import defaultdict

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

MARGIN = 0.004  # deeper than this counts: faceted parts touching at rest are a hair either side
STEP = 0.01  # spacing of the samples along each edge


def options():
    """The model, the chest's materials and the named options, from after Blender's `--`."""
    plain, named = [], {'clips': [], 'leave': [], 'carried': [], 'targets': []}
    for arg in sys.argv[sys.argv.index('--') + 1:]:
        if arg.startswith('--'):
            key, _, value = arg[2:].partition('=')
            if key not in named:
                raise SystemExit(f'clash.py: no option --{key}')
            named[key] = [x for x in value.split(',') if x]
        else:
            plain.append(arg)
    if len(plain) == 3:  # the old form: the clips after the chest
        named['clips'] = plain.pop().split(',')
    if len(plain) != 2:
        raise SystemExit('clash.py: give the model and the chest material (README.md, Checking clashes)')
    return plain[0], plain[1].split(','), named


PATH, CHEST, OPTS = options()
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30  # the clips' rate, so their frames import on whole frames
bpy.ops.import_scene.gltf(filepath=PATH)
arm = next(o for o in scene.objects if o.type == 'ARMATURE')
mesh = next(o for o in scene.objects if o.type == 'MESH')
me = mesh.data
bones = arm.data.bones

group = {g.index: g.name for g in mesh.vertex_groups}
owner = []
for v in me.vertices:
    gs = [g for g in v.groups if g.weight > 0.5]
    owner.append(group[gs[0].group] if gs else None)
material = [me.materials[p.material_index].name for p in me.polygons]
mat_of = defaultdict(set)
for p in me.polygons:
    for i in p.vertices:
        mat_of[i].add(material[p.index])
to_armature = arm.matrix_world.inverted() @ mesh.matrix_world
REST = np.array([tuple(to_armature @ v.co) for v in me.vertices])


def where(i):
    """A vertex as built, in the model's frame."""
    return tuple(arm.matrix_world @ Vector(REST[i]))


class Target:
    """A part the carried parts mustn't go into: its bone, convex hull and surface."""

    def __init__(self, name, bone, faces):
        self.name, self.bone = name, bone
        ids = sorted({i for f in faces for i in me.polygons[f].vertices})
        points = REST[ids]
        bm = bmesh.new()
        for p in points:
            bm.verts.new(p)
        bmesh.ops.convex_hull(bm, input=bm.verts)
        bm.normal_update()
        normals, offsets = [], []
        middle = Vector(points.mean(axis=0))
        for f in bm.faces:
            n = f.normal.normalized()
            if n.length < 0.5:
                continue
            d = n.dot(f.verts[0].co)
            if d - n.dot(middle) < 0:  # turned in: turn it out
                n, d = -n, -d
            normals.append(tuple(n))
            offsets.append(d)
        self.volume = bm.calc_volume()
        bm.free()
        self.normals, self.offsets = np.array(normals), np.array(offsets)
        self.faces = faces
        self.tree = BVHTree.FromPolygons([tuple(p) for p in REST], [tuple(me.polygons[f].vertices) for f in faces])

    def hull(self, q):
        """How deep each point is inside the hull: its least distance to a face, below 0 outside."""
        return np.min(self.offsets[None, :] - q @ self.normals.T, axis=1)

    def under(self, q):
        """How deep a point is under the surface, by the nearest face and its normal, and that face."""
        loc, normal, index, dist = self.tree.find_nearest(Vector(q))
        if loc is None:
            return -1.0, None
        return (dist if (Vector(q) - loc).dot(normal) < 0 else -dist), self.faces[index]


def islands(faces):
    """The faces split into the pieces they make, joined where vertices meet."""
    parent = {}

    def find(i):
        while parent.setdefault(i, i) != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    at = {}
    for f in faces:
        vs = me.polygons[f].vertices
        for i in vs:
            key = tuple(np.round(REST[i], 5))
            parent.setdefault(i, i)
            if key in at:
                parent[find(i)] = find(at[key])
            else:
                at[key] = i
        for i in vs[1:]:
            a, b = find(vs[0]), find(i)
            if a != b:
                parent[a] = b
    pieces = defaultdict(list)
    for f in faces:
        pieces[find(me.polygons[f].vertices[0])].append(f)
    return list(pieces.values())


def on(bone, keep=lambda m: True):
    """The faces whose every vertex follows the bone, in materials kept and not left out."""
    return [p.index for p in me.polygons if all(owner[i] == bone for i in p.vertices)
            and keep(material[p.index]) and material[p.index] not in OPTS['leave']]


TARGETS = []
head = on('head')
if head:
    TARGETS.append(Target('head', 'head', head))
pieces = islands(on('spine', lambda m: m in CHEST))
if not pieces:
    raise SystemExit(f'clash.py: nothing on the spine in {",".join(CHEST)}')
chests = sorted((Target('chest', 'spine', faces) for faces in pieces), key=lambda t: -t.volume)
TARGETS.append(chests[0])
print(f'CHEST {",".join(CHEST)}: the largest of {len(chests)} islands on the spine, '
      f'{len(chests[0].faces)} faces, {chests[0].volume * 1000:.1f} litres')
for bone in OPTS['targets']:
    faces = on(bone)
    if faces:
        TARGETS.append(Target(bone, bone, faces))
    else:
        print(f'TARGET {bone}: no parts, not tested')

# What the hands carry: the bones below them and those named, and samples along their edges.
carried = set()
for name in ('hand_l', 'hand_r', *OPTS['carried']):
    if name in bones:
        carried.update([name] + [b.name for b in bones[name].children_recursive])
heads, tails, shares, labels, whats = [], [], [], [], []
for e in me.edges:
    a, b = e.vertices
    if owner[a] not in carried or owner[b] not in carried:
        continue
    n = max(1, int((Vector(REST[b]) - Vector(REST[a])).length / STEP))
    what = '/'.join(sorted(mat_of[a] & mat_of[b])) or '/'.join(sorted(mat_of[a] | mat_of[b]))
    for k in range(n + 1):
        heads.append(a)
        tails.append(b)
        shares.append(k / n)
        labels.append(owner[a] if k / n < 0.5 else owner[b])
        whats.append(what)
heads, tails = np.array(heads, dtype=int), np.array(tails, dtype=int)
shares = np.array(shares, dtype=float)[:, None]
built = REST[heads] + (REST[tails] - REST[heads]) * shares  # each sample as built
labels = np.array(labels)
by_bone = defaultdict(list)
for i in sorted({*heads, *tails}):
    by_bone[owner[i]].append(i)
print(f'CARRIED {", ".join(sorted(by_bone))}: {len(shares)} points')


def skins():
    """Each bone's skin matrix in the pose the scene is at: from the model as built to as posed."""
    return {pb.name: np.array(pb.matrix @ bones[pb.name].matrix_local.inverted()) for pb in arm.pose.bones}


def clashes(skin):
    """The deepest clash of each carried bone in each target: (bone, target, depth, what, into, points)."""
    posed = np.zeros_like(REST)
    for bone, ids in by_bone.items():
        m = skin[bone]
        posed[ids] = REST[ids] @ m[:3, :3].T + m[:3, 3]
    points = posed[heads] + (posed[tails] - posed[heads]) * shares
    found = []
    for t in TARGETS:
        back = np.linalg.inv(skin[t.bone])
        q = points @ back[:3, :3].T + back[:3, 3]
        hull = t.hull(q)
        deepest = {}
        for i in np.nonzero(hull > MARGIN)[0]:
            under, face = t.under(q[i])
            d = min(hull[i], under)
            if d > MARGIN and d > deepest.get(labels[i], (0.0,))[0]:
                deepest[labels[i]] = (d, whats[i], material[face], (built[i], q[i]))
        for bone, (d, what, into, at) in sorted(deepest.items()):
            found.append((bone, t.name, d, what, into, at))
    return found


def line(when, bone, target, d, what, into, at):
    a, b = (tuple(arm.matrix_world @ Vector(p)) for p in at)
    return (f'CLASH {when}: {bone} ({what}) {d * 1000:.0f} mm into the {target} ({into}), '
            f'from ({a[0]:.2f}, {a[1]:.2f}, {a[2]:.2f}) to ({b[0]:.2f}, {b[1]:.2f}, {b[2]:.2f})')


def spans(frames):
    """Frames as runs: 0 to 4.5, 9."""
    runs, start, last = [], frames[0], frames[0]
    for f in frames[1:]:
        if f - last > 0.5:
            runs.append((start, last))
            start = f
        last = f
    runs.append((start, last))
    return ', '.join(f'{a:g}' if a == b else f'{a:g} to {b:g}' for a, b in runs)


data = arm.animation_data
for track in data.nla_tracks:
    track.mute = True
rest = clashes({b.name: np.identity(4) for b in bones})
for bone, target, d, what, into, at in rest:
    print(line('rest', bone, target, d, what, into, at))
total, frames_hit = 0, 0
for action in sorted(bpy.data.actions, key=lambda a: a.name):
    if OPTS['clips'] and action.name not in OPTS['clips']:
        continue
    data.action = action
    data.action_slot = action.slots[0]
    last = round(action.frame_range[1])
    summary = defaultdict(list)
    for f in [x / 2 for x in range(2 * last + 1)]:  # every frame and the half frames between
        scene.frame_set(int(f), subframe=f - int(f))
        found = clashes(skins())
        frames_hit += bool(found)
        for bone, target, d, what, into, at in found:
            print(line(f'{action.name} frame {f:g}', bone, target, d, what, into, at))
            summary[(bone, target)].append((f, d))
            total += 1
    for (bone, target), hits in sorted(summary.items()):
        f, d = max(hits, key=lambda h: h[1])
        print(f'CLIP {action.name}: {bone} into the {target} on frames {spans([h[0] for h in hits])}, '
              f'deepest {d * 1000:.0f} mm on frame {f:g}')
print(f'CHECKED {PATH}: {total} clashes on {frames_hit} frames and half frames')
