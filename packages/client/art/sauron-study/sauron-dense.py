"""Sauron, a dense-faceted study of his 1★ model (README.md in this folder).

The 1★ Sauron (../units/sauron.py) rebuilt at four densities, 3,000, 5,000, 10,000 and 40,000
triangles, for the board, in the direction of the films' armoured Dark Lord rather than the books': blackened plate with
worn edges, a tall helm under a crown of blades, great layered pauldrons with blades rising from
them, a long skirt of plates over his robe, clawed gauntlets and a heavy flanged mace. The shapes are
this script's own, not the films'. It is still Faceted (docs/viewer-spec.md section 4): flat shading,
colour from materials and no textures; the density goes into more and sharper facets. Every plate's
edge is a rim in a lighter `edge` material, so it catches the light like worn steel, and from 10,000
triangles up chamfered in it too.

It keeps the 1★ model's skeleton and clips: it builds the 1★ model to mark his joints, removes its
parts, and builds its own on the same bones in their place, leaned as the 1★ model is, so he has the
same bones and clip styles; the clips fit themselves to these parts as they do to the 1★'s
(../clips.py, fit()). His team colour is the cape, with the Lidless Eye on its back, and the tabard
down his front, as at 1★; his fittings (rivets, clasps, buckle, the mace's collar, socket and pommel)
are `trim`.

Everything here is placed by code, but it may be worked on by hand: --blend saves the scene as built,
its parts still apart and each bound to its bone, with the joint marks, before they are joined and
rigged. Edit it in Blender as you like: sculpt, remesh, add to a part. Each part keeps the name of its
bone in its custom property `bone`, so a part made anew needs one too. Then --from finishes that file
instead of building: it binds every vertex of each part to its `bone` again, so a remeshed part still
follows its bone as a solid piece, and joins, rigs, checks and exports it as a build does.

    blender --background --factory-startup --python-exit-code 1 --python sauron-dense.py -- \
        <out.glb> <3k|5k|10k|40k> [--blend=<file.blend>] [--from=<file.blend>]

The model is named `sauron` inside the file, so the rig times its clips from the sim's Sauron and the
client and board.mjs give it his livery: keep the file's name `sauron.glb`, in a folder per level.

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import random
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.normpath(os.path.join(HERE, '..'))
sys.path[:0] = [ART, os.path.join(ART, 'units')]
import kit  # noqa: E402
import rig  # noqa: E402
from clips import draped, fit, robed  # noqa: E402
from kit import (  # noqa: E402
    EYES, LEATHER, V, bent_tube, bone, finish, lean, loft, material, on_surface, part, segment,
)

sauron = importlib.import_module('sauron')  # the 1★ model, for his joints, his rig and his proportions

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
LEVEL = ARGS[1] if len(ARGS) > 1 else '40k'
BLEND = next((a.split('=', 1)[1] for a in ARGS if a.startswith('--blend=')), None)
SOURCE = next((a.split('=', 1)[1] for a in ARGS if a.startswith('--from=')), None)

# How much of everything there is at each level: points round each form, plates and blades, and how
# finely the cloth is cut, and whether plates' edges are chamfered as well as rimmed (`chamfer`, a
# share of each chamfer's width; 0 for none). One design, so the levels differ only in density. A
# `pauldron_rows` of 0 takes every other point of the dome's profile.
LEVELS = {
    '3k': dict(
        budget=3_000, round=8, limb=6, robe=12, foot=8, helm=12, helm_rows=0, crown=7, blade=1,
        skirt_columns=8, skirt_rows=(0.95, 0.67, 0.39, 0.07), skirt_cut=(2, 1), torso_rows=3,
        abdomen=1, gorget=1, pauldron_rows=0, pauldron_lames=2, lame_cut=(6, 1), pauldron_blades=2,
        belt_plates=6, rivets=False, cape=(13, 5), cape_folds=3, flanges=6, flange_points=1,
        spikes=False, finger_cut=2, fins=1, hammer=0.0, chamfer=0.0,
    ),
    '5k': dict(
        budget=5_000, round=12, limb=6, robe=20, foot=10, helm=16, helm_rows=0, crown=9, blade=2,
        skirt_columns=10, skirt_rows=(0.95, 0.67, 0.39, 0.07), skirt_cut=(2, 1), torso_rows=4,
        abdomen=2, gorget=2, pauldron_rows=1, pauldron_lames=3, lame_cut=(10, 1), pauldron_blades=3,
        belt_plates=8, rivets=False, cape=(17, 7), cape_folds=4, flanges=6, flange_points=1,
        spikes=False, finger_cut=2, fins=2, hammer=0.0, chamfer=0.0,
    ),
    '10k': dict(
        budget=10_000, round=12, limb=8, robe=24, foot=10, helm=20, helm_rows=1, crown=9, blade=2,
        skirt_columns=12, skirt_rows=(0.95, 0.67, 0.39, 0.07), skirt_cut=(2, 1), torso_rows=5,
        abdomen=2, gorget=2, pauldron_rows=1, pauldron_lames=3, lame_cut=(10, 1), pauldron_blades=3,
        belt_plates=8, rivets=False, cape=(25, 10), cape_folds=4, flanges=6, flange_points=1,
        spikes=False, finger_cut=2, fins=2, hammer=0.0, chamfer=1.0,
    ),
    '40k': dict(
        budget=40_000, round=24, limb=14, robe=48, foot=18, helm=40, helm_rows=3, crown=13, blade=5,
        skirt_columns=14, skirt_rows=(0.95, 0.81, 0.67, 0.53, 0.39, 0.23, 0.07), skirt_cut=(5, 4),
        torso_rows=14, abdomen=4, gorget=3, pauldron_rows=3, pauldron_lames=3, lame_cut=(26, 3),
        pauldron_blades=5, belt_plates=16, rivets=True, cape=(69, 38), cape_folds=7, flanges=8,
        flange_points=3, spikes=True, finger_cut=3, fins=4, hammer=0.0025, chamfer=1.0,
    ),
}
D = LEVELS[LEVEL]
JITTER = random.Random(1)  # the hammered unevenness of his plate, the same every build

# His colours (sRGB). The plate is blackened iron, dark but not black, so its facets still show,
# with its edges worn to a lighter steel; the ember of the Eye is a pale gold, never red or orange,
# which would read as the red team.
IRON = 0x404248
EDGE = 0x8A8F97
BLACK = 0x303135  # the Black Hand and the gauntlets
ROBE = 0x2E2927
EMBER = 0xE2B65A

M = {}  # materials by name


def make_materials():
    for m in list(bpy.data.materials):  # the 1★ model's, which share these names
        bpy.data.materials.remove(m)
    M.clear()
    M.update(
        team=kit.team_material(),
        iron=material('iron', IRON, roughness=0.45, metallic=0.12),
        edge=material('edge', EDGE, roughness=0.35, metallic=0.12),
        gauntlet=material('gauntlet', BLACK, roughness=0.45, metallic=0.12),
        robe=material('robe', ROBE, roughness=0.9),
        ember=material('ember', EMBER, roughness=0.6, emission=EMBER, emission_strength=0.6),
        eyes=material('eyes', EYES, roughness=0.6),
        leather=material('leather', LEATHER, roughness=0.85),
        trim=kit.trim_material(),
    )


# Helpers -----------------------------------------------------------------------------------------


def lerp_table(table, z):
    """A row of numbers at height z, linearly between the rows of `table` (each starting with its z,
    in rising order), held at the ends."""
    if z <= table[0][0]:
        return list(table[0][1:])
    for lo, hi in zip(table, table[1:]):
        if z <= hi[0]:
            u = (z - lo[0]) / (hi[0] - lo[0])
            return [a + (b - a) * u for a, b in zip(lo[1:], hi[1:])]
    return list(table[-1][1:])


def smooth(lo, hi, x):
    t = min(max((x - lo) / (hi - lo), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def bake(obj):
    """Applies a part's modifiers and binds every vertex of it to the bone it is made inside again,
    since a modifier's new vertices may not follow it."""
    if obj.modifiers:
        graph = bpy.context.evaluated_depsgraph_get()
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(graph))
        old = obj.data
        obj.modifiers.clear()
        obj.data = mesh
        bpy.data.meshes.remove(old)
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    kit._bind(obj)
    return obj


def harden(obj, thick=0.0, chamfer=0.0, angle=40.0):
    """A sheet made a plate: `thick` deep, inwards from its faces, with only a rim round its edges
    (its back is hidden against what it lies on), and the edges sharper than `angle` chamfered
    `chamfer` wide, times the level's `chamfer`; the rim and the chamfers are the `edge` material, the
    part's second."""
    chamfer *= D['chamfer']
    if thick:
        s = obj.modifiers.new('solid', 'SOLIDIFY')
        s.thickness = thick
        s.offset = -1.0
        s.use_even_offset = True
        s.use_rim = True
        s.use_rim_only = True
        s.material_offset_rim = 1
    if chamfer:
        b = obj.modifiers.new('chamfer', 'BEVEL')
        b.width = chamfer
        b.segments = 1
        b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(angle)
        b.material = 1
        b.use_clamp_overlap = True
    return bake(obj)


def sheet(name, at, nu, nv, mats, inside=None, outward=None, closed=False, face_mat=None):
    """A grid of quads through the points `at(u, v)`, u and v from 0 to 1, closed round in u if
    `closed`, wound to face away from `inside` or along `outward`."""
    w = nu if closed else nu + 1
    verts = [at(i / nu, j / nv) for j in range(nv + 1) for i in range(w)]
    faces, mats_of = [], []
    for j in range(nv):
        for i in range(nu):
            i2 = (i + 1) % w if closed else i + 1
            faces.append((j * w + i, j * w + i2, (j + 1) * w + i2, (j + 1) * w + i))
            mats_of.append(face_mat(i, j) if face_mat else 0)
    return part(name, verts, faces, mats, mats_of, inside=inside, outward=outward)


def plate(name, at, nu, nv, inside, thick=0.014, chamfer=0.007, mat='iron', closed=False, angle=40.0):
    """A plate of armour through the points `at(u, v)`, its edges worn bright."""
    return harden(sheet(name, at, nu, nv, [M[mat], M['edge']], inside=inside, closed=closed), thick, chamfer,
                  angle)


def hammered(p, scale=1.0):
    """A point moved a little at random, so a plate's facets catch the light unevenly."""
    h = D['hammer'] * scale
    if not h:
        return p
    return p + V(JITTER.uniform(-h, h), JITTER.uniform(-h, h), JITTER.uniform(-h, h))


def blade(name, points, widths, thick, tip, side, mat='iron'):
    """A blade or spike: a diamond in section, `widths` across and `thick` deep, along the bent line
    through `points` to the point `tip`, open at its foot, which hides inside what it rises from."""
    radii = [(w / 2, thick / 2) for w in widths]
    return bent_tube(name, points, radii, [M[mat], M['edge']], n=4, side=side, end=tip)


def spike(name, base, apex, radius, mat='iron', n=4):
    return kit.cone(name, base, apex, radius, [M[mat]], n=n, phase=45, back=None)


def rivet(name, at, out, size=0.016):
    """A round-headed rivet of trim on a surface facing `out`."""
    out = Vector(out).normalized()
    return kit.cone(name, at - 0.004 * out, at + size * out, size, [M['trim']], n=6, back=None)


# Robe, skirt of plates, tabard and feet (not leaned) --------------------------------------------

ROBE_TABLE = [(z, rx, ry, cy, pleat) for z, rx, ry, cy, pleat in sauron.ROBE_RINGS]


def robe_at(z):
    rx, ry, cy, pleat = lerp_table(ROBE_TABLE, z)
    return rx, ry, cy, pleat


def robe_point(z, a, lift=0.0, pleated=False, index=0):
    rx, ry, cy, pleat = robe_at(z)
    k = 1.0 + (pleat / ry if pleated and index % 2 else 0.0)
    kx = k + lift / rx
    ky = k + lift / ry
    return V(kx * rx * math.cos(a), cy + ky * ry * math.sin(a), z)


def robe_cloth():
    """The dark robe under the skirt, pleated, its hem ragged: the robe below the knees on its own
    bone, `robe`, and above on the hips, reaching down inside it as at 1★."""
    n = D['robe']
    rag = random.Random(3)
    hem = [0.05 + (rag.uniform(0.0, 0.03) if D['hammer'] else 0.0) for _ in range(n)]

    def ring(z, i_hem=False):
        return [V(*robe_point(hem[i] if i_hem else z, math.tau * i / n, pleated=True, index=i)) for i in range(n)]

    below = [ring(0.05, True)] + [ring(z) for z in (0.16, 0.27, 0.38)[(0 if D['hammer'] else 2):]]
    above = [ring(z) for z in (0.27, 0.38, 0.6, 0.8, 1.0)]
    for name, bone_name, rings in (('robe-hem', 'robe', below), ('robe', 'hips', above)):
        verts, faces, _ = loft(rings)
        with bone(bone_name):
            part(name, verts, faces, M['robe'], inside=lambda c: V(0, 0.02, c.z))


FRONT_GAP = 26.0  # degrees either side of his front left open for the tabard


def skirt():
    """A long skirt of plates hanging from his belt to above the ground, in columns round him with
    the front left open for the tabard, each column of plates overlapping downwards like a tasset's
    lames. The rows above the knees are on the hips, those below on the robe's bone, so they part as
    the robe below the knees does."""
    columns = D['skirt_columns']
    rows = D['skirt_rows']
    nu, nv = D['skirt_cut']
    start = math.radians(-90 + FRONT_GAP)
    span = math.radians(360 - 2 * FRONT_GAP)
    for c in range(columns):
        a0 = start + span * c / columns - math.radians(2.5)
        a1 = start + span * (c + 1) / columns + math.radians(2.5)
        side_lift = 0.006 if c % 2 else 0.0  # every other column overlaps its neighbours
        for r in range(len(rows) - 1):
            top, bottom = rows[r], rows[r + 1] - 0.04
            lift = 0.04 + side_lift + 0.004 * (len(rows) - r)
            flare = 0.022

            def at(u, v, a0=a0, a1=a1, top=top, bottom=bottom, lift=lift):
                a = a0 + (a1 - a0) * u
                z = top + (bottom - top) * v
                ridge = 0.012 * (1 - abs(2 * u - 1))  # each plate rises to a ridge down its middle
                p = robe_point(z, a, lift + flare * v + ridge)
                return hammered(p) if 0 < u < 1 and 0 < v < 1 else p

            bone_name = 'robe' if top <= 0.4 else 'hips'
            with bone(bone_name):
                plate(f'skirt-{c}-{r}', at, nu, nv, inside=lambda p: V(0, 0.02, p.z), thick=0.014, chamfer=0.007)
                if D['rivets']:  # one at the top of every plate
                    a = (a0 + a1) / 2
                    p = robe_point(top - 0.04, a, lift + flare * 0.15 + 0.012)
                    rivet(f'skirt-rivet-{c}-{r}', p, V(math.cos(a), math.sin(a), 0), 0.012)


def tabard():
    """A long panel of the team colour down his front, between the plates, its hem cut ragged: on
    the hips above the robe's knees and on the robe's bone below them, as at 1★."""
    across = 2 * D['finger_cut'] + 1  # points across
    split = sauron.TABARD_SPLIT

    def row(z, w, hem=False):
        out = []
        for k in range(across):
            u = k / (across - 1) * 2 - 1  # -1 to 1, his right to his left
            x = u * w
            zz = z
            if hem:
                zz = z + 0.06 * abs(u) + (0.035 if k % 2 else 0.0)  # pointed at the middle, dagged
            rx, ry, cy, pleat = robe_at(zz)
            y = cy - ry * math.sqrt(max(0.0, 1 - (x / rx) ** 2)) - pleat - 0.012
            fold = 0.006 * math.cos(math.pi * u * (across - 1) / 2)  # soft folds down it
            out.append(V(x, y - fold, zz))
        return out

    pieces = (
        ('tabard', 'hips', [row(0.99, 0.13), row(0.8, 0.135), row(0.6, 0.142), row(split, 0.15)]),
        ('tabard-foot', 'robe', [row(split, 0.15), row(0.24, 0.155), row(0.09, 0.16, hem=True)]),
    )
    for name, bone_name, rows in pieces:
        verts, faces, _ = loft(rows, closed=False)
        with bone(bone_name):
            part(name, verts, faces, M['team'], outward=V(0, -1, 0))


def sabaton(side, at, yaw):
    """An iron shoe with a long pointed toe, turned up a little, a ridge down it and a spur at the
    heel, showing under the robe."""
    s = side[0]
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    n = D['foot']
    # Each level: z, half-width, how far back the heel goes, how far the toe reaches, its lift.
    levels = [(0.0, 0.082, 0.1, 0.27, 0.025), (0.06, 0.088, 0.105, 0.22, 0.03), (0.13, 0.08, 0.095, 0.09, 0.0),
              (0.2, 0.07, 0.075, 0.05, 0.0)]
    rings = []
    for z, w, heel, toe, lift in levels:
        ring = []
        for i in range(n):
            a = math.tau * i / n
            c, sn = math.cos(a), math.sin(a)
            if sn >= 0:  # the back half, round the heel
                x, y, zz = w * c, heel * sn, z
            else:  # the front half, drawn to a point at the toe
                t = -sn
                x, y, zz = w * c * (1 - 0.75 * t ** 2), -toe * t, z + lift * t ** 3
            if i == n * 3 // 4:  # the ridge down the toe
                zz += 0.012
            ring.append(at + turn @ V(x, y, zz))
        rings.append(ring)
    verts, faces, _ = loft(rings)
    top = len(verts)
    verts.append(at + turn @ V(0, 0.0, 0.21))
    last = (len(levels) - 1) * n
    faces += [(last + i, last + (i + 1) % n, top) for i in range(n)]
    sole = tuple(range(n))
    faces.append(sole)
    with bone(f'foot_{s}'):
        harden(part(f'sabaton-{side}', verts, faces, [M['iron'], M['edge']], inside=at + turn @ V(0, -0.02, 0.07)),
               chamfer=0.006, angle=38)
        spike(f'sabaton-spur-{side}', at + turn @ V(0, 0.08, 0.09), at + turn @ V(0, 0.17, 0.07), 0.018)
        if D['rivets']:
            for k, (y, z) in enumerate(((-0.1, 0.105), (-0.04, 0.125))):
                p = at + turn @ V(0, y, z + 0.005)
                rivet(f'sabaton-rivet-{side}-{k}', p, turn @ V(0, -0.3, 1), 0.012)


# Belt and torso (leaned with him) ----------------------------------------------------------------

# The body under the plate: z, half-width, half-depth and centre y, from the 1★ model's, the waist
# drawn in a little.
TORSO_TABLE = [
    (0.98, 0.225, 0.18, 0.0),
    (1.1, 0.25, 0.188, 0.0),
    (1.24, 0.305, 0.222, -0.005),
    (1.4, 0.352, 0.245, 0.0),
    (1.52, 0.33, 0.215, 0.015),
    (1.6, 0.15, 0.135, 0.02),
]
KEEL_TABLE = [(0.98, 0.012), (1.24, 0.02), (1.38, 0.035), (1.52, 0.012), (1.6, 0.0)]


def torso_point(z, a, extra=0.0, keel=True):
    rx, ry, cy = lerp_table(TORSO_TABLE, z)
    front = max(0.0, 1 - abs(math.degrees(a) + 90) / 32) if keel else 0.0
    k = lerp_table(KEEL_TABLE, z)[0] * front
    return V((rx + extra) * math.cos(a), cy + (ry + extra) * math.sin(a) - k, z)


def belt():
    n = D['round'] * 2
    with bone('hips'):
        rings = [kit.ellipse(0, 0, z, rx, ry, n, -90) for z, rx, ry in ((0.92, 0.262, 0.21), (1.07, 0.27, 0.216))]
        verts, faces, _ = loft(rings)
        part('belt', verts, faces, M['leather'], inside=lambda c: V(0, 0, c.z))
        # Plates riveted round it, and the buckle in front, over the tabard.
        count = D['belt_plates']
        for k in range(count):
            mid = -90 + 360 * (k + 0.5) / count
            if abs(((mid + 90) + 180) % 360 - 180) < 22:
                continue  # the buckle is there

            def at(u, v, mid=mid):
                a = math.radians(mid + (u - 0.5) * 360 / count * 0.7)
                z = 0.935 + 0.12 * v
                return V(0.283 * math.cos(a), 0.229 * math.sin(a), z)

            plate(f'belt-plate-{k}', at, 2, 1, inside=lambda c: V(0, 0, c.z), thick=0.01, chamfer=0.004)
            if D['rivets']:
                a = math.radians(mid)
                rivet(f'belt-rivet-{k}', V(0.286 * math.cos(a), 0.232 * math.sin(a), 0.995),
                      V(math.cos(a), math.sin(a), 0), 0.011)

        def buckle(u, v):
            x = (u - 0.5) * 0.15
            return V(x, -0.236 - 0.012 * (1 - abs(2 * u - 1)), 0.925 + 0.14 * v)

        plate('belt-buckle', buckle, 2, 2, inside=V(0, 0, 1.0), thick=0.012, chamfer=0.005, mat='trim')


def cuirass():
    """The breastplate, with a keel down its front, from the chest to the neck, and lames over the
    belly below it, each flaring a little at its foot over the one below; on his spine."""
    n = D['round'] * 2
    rows = D['torso_rows']
    lo, hi = 1.22, 1.6

    def at(u, v):
        z = lo + (hi - lo) * v
        a = math.radians(-90) + math.tau * u
        flare = 0.018 * (1 - smooth(0.0, 0.08, v))  # the lower edge stands out over the belly
        return torso_point(z, a, 0.004 + flare)

    with bone('spine'):
        plate('cuirass', at, n, rows, inside=lambda c: V(0, 0, c.z), closed=True, thick=0.016, chamfer=0.007, angle=36)

        def plackart(u, v):  # a plate over the belly, rising to a point under the keel
            a = math.radians(-90 + (u - 0.5) * 150)
            top = 1.3 + 0.09 * (1 - abs(2 * u - 1)) ** 1.5
            z = 1.19 + (top - 1.19) * v
            return torso_point(z, a, 0.03 + 0.008 * (1 - v))

        plate('plackart', plackart, n // 2, max(1, rows // 4), inside=lambda c: V(0, 0, c.z), thick=0.014,
              chamfer=0.007, angle=36)
        bands = D['abdomen']
        edges = [0.99 + (1.25 - 0.99) * k / bands for k in range(bands + 1)]
        for k in range(bands):
            bottom, top = edges[k], edges[k + 1] + 0.02

            def lame(u, v, bottom=bottom, top=top):
                z = bottom + (top - bottom) * v
                a = math.radians(-90) + math.tau * u
                return torso_point(z, a, 0.004 + 0.016 * (1 - v))

            plate(f'abdomen-{k}', lame, n, 1, inside=lambda c: V(0, 0, c.z), closed=True, thick=0.012, chamfer=0.006,
                  angle=30)
        # The gorget, rings of plate stepping in round his neck.
        g = D['gorget']
        for k in range(g):
            z0 = 1.5 + 0.045 * k
            r0, r1 = 0.25 - 0.03 * k, 0.21 - 0.03 * k

            def ring(u, v, z0=z0, r0=r0, r1=r1):
                a = math.radians(-90) + math.tau * u
                r = r0 + (r1 - r0) * v
                return V(r * math.cos(a), 0.02 + 0.82 * r * math.sin(a), z0 + 0.075 * v)

            plate(f'gorget-{k}', ring, n, 1, inside=lambda c: V(0, 0.02, c.z), closed=True, thick=0.012, chamfer=0.006,
                  angle=30)


# Pauldrons ---------------------------------------------------------------------------------------


def pauldron(side, s):
    """A great pauldron over each shoulder: a fluted dome, lames stepping down and out over the
    upper arm, and blades rising from it, up and back. The right one has none in front, where the
    mace comes down past his shoulder as he smashes."""
    c = V(s * 0.38, 0.02, 1.43)
    axis = V(s * 0.42, 0, 1).normalized()
    out = (V(s, 0, 0) - V(s, 0, 0).dot(axis) * axis).normalized()
    front = V(0, -1, 0)

    def at(t, r, th, centre=c):
        a = math.radians(th)
        return centre + t * axis + r * (math.cos(a) * out + math.sin(a) * front)

    n = D['round'] * 2
    # The dome's profile: along the axis, and out from it; then drawn to a point at its top.
    profile = [(-0.02, 0.25), (0.05, 0.246), (0.11, 0.218), (0.16, 0.168), (0.2, 0.1), (0.222, 0.04)]
    apex = 0.245
    rows = D['pauldron_rows']  # rows between each of the profile's, or 0 for every other point of it
    stations = []
    if rows == 0:
        stations = profile[:-1:2] + profile[-1:]
    for (t0, r0), (t1, r1) in zip(profile, profile[1:]) if rows else ():
        stations += [(t0 + (t1 - t0) * j / rows, r0 + (r1 - r0) * j / rows) for j in range(rows)]
    if rows:
        stations.append(profile[-1])

    def comb(th):  # a ridge from front to back over the top
        return 0.03 * max(0.0, 1 - abs(abs(((th + 180) % 360) - 180) - 90) / (360 / n * 1.01))

    def dome(u, v):
        th = 360 * u
        t, r = stations[round(v * (len(stations) - 1))]
        return at(t, r + comb(th) * min(1.0, r / 0.15), th)

    def radius_at(t):
        return lerp_table(profile, t)[0]

    with bone('spine'):
        # The dome and the point it is drawn to are one piece, so its only rim is round its foot.
        rings = [[dome(i / n, j / (len(stations) - 1)) for i in range(n)] for j in range(len(stations))]
        verts, faces, _ = loft(rings)
        last = (len(stations) - 1) * n
        verts.append(at(apex, 0.0, 0))
        faces += [(last + i, last + (i + 1) % n, len(verts) - 1) for i in range(n)]
        harden(part(f'pauldron-{side}', verts, faces, [M['iron'], M['edge']], inside=c), 0.016, 0.007, angle=35)
        lames = D['pauldron_lames']
        nu, nv = D['lame_cut']
        for k in range(lames):
            centre = c + 0.03 * (k + 1) * out
            t_top = 0.0 - 0.09 * k
            t_bottom = t_top - 0.12
            r_top, r_bottom = 0.248 + 0.016 * k, 0.29 + 0.016 * k

            # The right one's stop short in front, where the mace comes down past his shoulder as he smashes.
            first, last = -150, (150 if s > 0 else 70)

            def lame(u, v, centre=centre, t_top=t_top, t_bottom=t_bottom, r_top=r_top, r_bottom=r_bottom, first=first,
                     last=last):
                th = first + (last - first) * u
                point = 0.045 * max(0.0, math.cos(math.radians(th))) ** 2  # the foot drawn to a point outside
                return at(t_top + (t_bottom - point - t_top) * v, r_top + (r_bottom - r_top) * v, th, centre)

            def inside(p, centre=centre):  # the lame's own axis
                return centre + (p - centre).dot(axis) * axis

            plate(f'pauldron-lame-{side}-{k}', lame, nu, nv, inside=inside, thick=0.016, chamfer=0.008)
            if D['rivets']:
                for th in (-100, -30, 40):
                    if s < 0 and th > 20:
                        continue  # where the mace comes down past him
                    p = lame((th - first) / (last - first), 0.45)
                    a = math.radians(th)
                    rivet(f'pauldron-rivet-{side}-{k}-{th}', p, math.cos(a) * out + math.sin(a) * front, 0.013)
        # Blades rising from the dome in a fan from his side round behind: where round it (0 out, 90 in
        # front, -90 behind), how long, and how far they lean out.
        blades = {2: [(-30, 0.36, 0.33), (-95, 0.27, 0.25)],
                  3: [(-25, 0.36, 0.35), (-70, 0.3, 0.28), (-115, 0.22, 0.22)],
                  5: [(10, 0.26, 0.45), (-25, 0.38, 0.35), (-60, 0.34, 0.3), (-95, 0.28, 0.25), (-130, 0.2, 0.2)],
                  }[D['pauldron_blades']]
        for k, (th, length, lean_out) in enumerate(blades):
            if s < 0 and th > -20:
                continue
            a = math.radians(th)
            radial = math.cos(a) * out + math.sin(a) * front
            foot = at(0.12, 0.85 * radius_at(0.12), th)
            up = (V(0, 0, 1) + lean_out * radial).normalized()
            bend = (V(0, 0, 1) + (lean_out + 0.3) * radial).normalized()
            seg = D['blade']
            points = [foot - 0.03 * up]
            for j in range(1, seg + 1):
                f = j / (seg + 1)
                points.append(points[-1] + (length / (seg + 1)) * up.lerp(bend, f).normalized())
            tip = points[-1] + (length / (seg + 1)) * bend
            widths = [0.05 * (1 - 0.75 * j / (seg + 1)) for j in range(len(points))]
            blade(f'pauldron-blade-{side}-{k}', points, widths, 0.018, tip, side=radial.cross(up))


# Arms and hands ----------------------------------------------------------------------------------

R_SHOULDER, R_ELBOW, R_WRIST, R_FIST = sauron.R_SHOULDER, sauron.R_ELBOW, sauron.R_WRIST, sauron.R_FIST
L_SHOULDER, L_ELBOW, L_WRIST = sauron.L_SHOULDER, sauron.L_ELBOW, sauron.L_WRIST


def around(start, end, stations, n, ridge_dir=None, ridge=0.0):
    """Rings round the line from start to end, (fraction, radius), with a ridge pushed out along
    `ridge_dir` on the point of each ring nearest it."""
    rings = segment(start, end, stations, n)
    if ridge_dir is not None:
        for ring, (t, r) in zip(rings, stations):
            centre = Vector(start).lerp(Vector(end), t)
            best = max(range(n), key=lambda i: (ring[i] - centre).dot(ridge_dir))
            ring[best] = ring[best] + ridge * (ring[best] - centre).normalized()
    return rings


def arm(side, shoulder, elbow, wrist):
    """A sleeve of the robe under the pauldron, a plate on the upper arm, a pointed couter at the
    elbow and a vambrace with blades along its back, flaring into the gauntlet's cuff."""
    s = side[0]
    n = D['limb']
    outer = V(-1 if s == 'r' else 1, 0, 0.5)  # the back of his arm, out and up
    with bone(f'upper_arm_{s}'):
        kit.tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.115), (1.08, 0.1)], M['robe'], n=n)
        rings = around(shoulder, elbow, [(0.3, 0.112), (0.65, 0.108), (0.98, 0.105)], n, outer, 0.012)
        verts, faces, _ = loft(rings)
        rerebrace = part(f'rerebrace-{side}', verts, faces, [M['iron'], M['edge']],
                         inside=kit.nearest_on_line(shoulder, elbow))
        harden(rerebrace, 0.012, 0.006, angle=30)
    with bone(f'forearm_{s}'):
        stations = [(-0.12, 0.09), (0.3, 0.092), (0.62, 0.096), (0.74, 0.118), (1.0, 0.11)]
        rings = around(elbow, wrist, stations, n, outer, 0.016)
        verts, faces, _ = loft(rings)
        last = (len(stations) - 1) * n
        verts.append(Vector(wrist) + 0.01 * (Vector(wrist) - Vector(elbow)).normalized())
        faces += [(last + i, last + (i + 1) % n, len(verts) - 1) for i in range(n)]
        mats_of = [0] * (3 * n) + [1] * n + [1] * n  # the cuff is the gauntlet's
        vambrace = part(f'vambrace-{side}', verts, faces, [M['iron'], M['gauntlet'], M['edge']], mats_of,
                        inside=kit.nearest_on_line(elbow, wrist))
        # The edge material is this part's third: chamfer it into that slot.
        if D['chamfer']:
            b = vambrace.modifiers.new('chamfer', 'BEVEL')
            b.width, b.segments, b.limit_method, b.angle_limit = 0.006 * D['chamfer'], 1, 'ANGLE', math.radians(30)
            b.material = 2
        bake(vambrace)
        # A pointed couter on the elbow.
        ahead = (Vector(wrist) - Vector(elbow)).normalized()
        up_arm = (Vector(elbow) - Vector(shoulder)).normalized()
        back = (-ahead + 0.25 * up_arm).normalized()
        cop = segment(elbow, elbow + back, [(-0.07, 0.085), (0.0, 0.1), (0.06, 0.07)], n)
        verts, faces, _ = loft(cop)
        verts.append(elbow + 0.09 * back)
        faces += [(2 * n + i, 2 * n + (i + 1) % n, len(verts) - 1) for i in range(n)]
        harden(part(f'couter-{side}', verts, faces, [M['iron'], M['edge']], inside=elbow), chamfer=0.006, angle=35)
        spike(f'couter-spike-{side}', elbow + 0.04 * back, elbow + 0.17 * back + 0.05 * outer.normalized(), 0.045, n=6)
        # Blades along the back of the vambrace, raking back towards the elbow.
        side_dir = (outer - outer.dot(ahead) * ahead).normalized()
        for k in range(D['fins']):
            t = 0.2 + 0.5 * k / max(1, D['fins'] - 1)
            foot = Vector(elbow).lerp(Vector(wrist), t) + 0.07 * side_dir
            rake = (side_dir - 0.9 * ahead).normalized()
            length = 0.075 - 0.01 * k
            points = [foot, foot + 0.4 * length * rake]
            blade(f'vambrace-fin-{side}-{k}', points, [0.05, 0.03], 0.012, foot + length * rake, side=ahead)


def black_hand():
    """The left hand raised open at his shoulder, palm out towards the foe: a plated thumb and three
    fingers, jointed and hooked into long claws, for Isildur cut the fourth from it with the Ring."""
    ahead = (L_WRIST - L_ELBOW).normalized()
    up = (V(0, 0, 1) - V(0, 0, 1).dot(ahead) * ahead).normalized()
    fingers = (ahead + 1.6 * up).normalized()
    palm_out = V(0, -1, 0)
    palm_out = (palm_out - palm_out.dot(fingers) * fingers).normalized()
    inward = palm_out.cross(fingers)
    palm = L_WRIST + 0.075 * fingers
    arm('left', L_SHOULDER, L_ELBOW, L_WRIST)
    cut = D['finger_cut']
    with bone('hand_l'):
        kit.box('palm', palm, [fingers, palm_out, inward], (0.08, 0.036, 0.078), M['gauntlet'], 0.92)
        kit.box('hand-plate', palm - 0.03 * palm_out + 0.01 * fingers, [fingers, palm_out, inward], (0.07, 0.012, 0.07),
                [M['iron']], 0.85)
        for k, spread in enumerate((-10, 6, 22)):
            a = math.radians(spread)
            fan = math.cos(a) * fingers - math.sin(a) * inward
            base = palm + 0.06 * fingers + (0.054 - 0.054 * k) * inward
            lengths, hooks = ([0.12, 0.085], [0.12, 1.1]) if cut == 2 else ([0.075, 0.06, 0.055], [0.05, 0.45, 1.0])
            points = [base]
            for length, hook in zip(lengths[:-1], hooks[:-1]):
                points.append(points[-1] + length * (fan + hook * palm_out).normalized())
            end = points[-1] + lengths[-1] * (fan + hooks[-1] * palm_out).normalized()
            radii = [0.03 - 0.003 * j for j in range(len(points))]
            bent_tube(f'finger-{k}', points + [end], radii + [0.022], [M['gauntlet']], n=6 if cut == 3 else 4,
                      phase=30 if cut == 3 else 45)
            claw = (fan + 1.6 * palm_out).normalized()
            reach = 0.07 if cut == 2 else 0.085
            spike(f'claw-{k}', end - 0.012 * claw, end + reach * claw, 0.022, mat='gauntlet', n=4)
            if cut == 3:  # a plate on the back of each joint
                for j, p in enumerate(points[1:]):
                    kit.box(f'knuckle-{k}-{j}', p - 0.026 * palm_out, [fan, palm_out, inward], (0.018, 0.008, 0.024),
                            [M['iron']], 0.7)
        base = palm - 0.03 * fingers + 0.07 * inward
        mid = base + 0.1 * (inward + 0.8 * fingers).normalized()
        tip = mid + 0.09 * (fingers + 0.3 * inward + 1.0 * palm_out).normalized()
        bent_tube('thumb', [base, mid, tip], [0.031, 0.027, 0.022], [M['gauntlet']], n=6 if cut == 3 else 4)
        claw = (tip - mid).normalized()
        spike('thumb-claw', tip - 0.012 * claw, tip + 0.075 * claw, 0.022, mat='gauntlet')


# Mace, in his right hand -------------------------------------------------------------------------

HAFT, HEAD = sauron.HAFT, sauron.HEAD


def mace():
    d = HAFT
    grip = R_FIST
    arm('right', R_SHOULDER, R_ELBOW, R_WRIST)
    n = D['limb']
    with bone('hand_r'):
        kit.tube('haft', grip - 0.17 * d, grip + HEAD * d, [(0, 0.036), (1, 0.036)], [M['iron']], n=n)
        for k in range(4 if D['spikes'] else 2):  # the grip, bound in leather
            t = -0.14 + 0.075 * k
            kit.tube(f'haft-wrap-{k}', grip + t * d, grip + (t + 0.05) * d, [(0, 0.041), (1, 0.041)], [M['leather']],
                     n=n)
        kit.cone('pommel', grip - 0.15 * d, grip - 0.3 * d, 0.058, [M['trim']], n=n // 2 * 2, phase=30,
                 back=grip - 0.13 * d)
        kit.tube('collar', grip + 0.33 * d, grip + 0.4 * d, [(0, 0.054), (0.5, 0.06), (1, 0.054)], [M['trim']], n=n)
        head = grip + HEAD * d
        flanges = D['flanges']
        core = segment(head, head + d, [(-0.21, 0.062), (-0.16, 0.064), (-0.12, 0.1), (0.12, 0.1), (0.18, 0.062)],
                       flanges, 180 / flanges)
        verts, faces, bands = loft(core)
        mats_of = [1 if b < 2 else 0 for b in bands]
        top, bottom = len(verts), len(verts) + 1
        verts += [head + 0.2 * d, head - 0.25 * d]
        last = 4 * flanges
        faces += [(last + i, last + (i + 1) % flanges, top) for i in range(flanges)]
        faces += [(i, (i + 1) % flanges, bottom) for i in range(flanges)]
        mats_of += [0] * flanges + [1] * flanges
        part('mace-core', verts, faces, [M['iron'], M['trim']], mats_of, inside=head)
        spike('mace-spike', head + 0.15 * d, head + 0.38 * d, 0.05, n=n // 2 * 2)
        # The flanges, each a curved blade, its edges worn bright.
        outline = {1: [(-0.17, 0.055), (-0.07, 0.2), (0.11, 0.2), (0.175, 0.055)],
                   3: [(-0.17, 0.055), (-0.12, 0.15), (-0.06, 0.205), (0.0, 0.215), (0.06, 0.212), (0.12, 0.18),
                       (0.145, 0.205), (0.18, 0.06)]}[D['flange_points']]
        u = d.cross(V(0, 0, 1)).normalized()
        v = d.cross(u)
        for k in range(flanges):
            a = math.tau * k / flanges
            out = math.cos(a) * u + math.sin(a) * v
            across = d.cross(out)
            verts = []
            for along, r in outline:
                p = head + along * d + r * out
                verts += [p + 0.012 * across, p - 0.012 * across]
            m = len(outline)
            front = tuple(2 * i for i in range(m))
            back = tuple(2 * i + 1 for i in reversed(range(m)))
            faces = kit.wind(verts, [front], outward=across) + kit.wind(verts, [back], outward=-across)
            faces += kit.wind(verts, [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(m - 1)],
                              inside=head + 0.06 * out)
            harden(part(f'flange-{k}', verts, faces, [M['iron'], M['edge']]), chamfer=0.006, angle=40)
            if D['spikes']:  # a short spike between each pair of flanges
                b = math.tau * (k + 0.5) / flanges
                o2 = math.cos(b) * u + math.sin(b) * v
                spike(f'mace-stud-{k}', head + 0.09 * o2, head + 0.16 * o2, 0.02)
        fist()


def fist():
    """The right gauntlet round the haft: the back of the hand plated, and the fingers wrapped round
    the haft in jointed plates, the thumb over them."""
    d = HAFT
    ahead = (R_WRIST - R_ELBOW).normalized()
    up = (d - d.dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    kit.box('fist', R_FIST, [ahead, up, across], (0.072, 0.078, 0.08), [M['gauntlet']], 0.86)
    centre = R_FIST + 0.015 * ahead + 0.04 * up - 0.075 * across
    kit.box('thumb-right', centre, [ahead, up, across], (0.06, 0.03, 0.026), [M['gauntlet']], 0.7)
    kit.box('fist-plate', R_FIST - 0.012 * ahead + 0.084 * across, [across, ahead, up], (0.012, 0.06, 0.07),
            [M['iron']], 0.8)
    for k in range(4):  # the knuckles, each a plate with a short spike
        along = -0.055 + 0.037 * k
        p = R_FIST + 0.072 * ahead + along * up + 0.055 * across
        kit.box(f'knuckle-r-{k}', p, [ahead, up, across], (0.014, 0.016, 0.03), [M['iron']], 0.75)
        if D['spikes']:
            spike(f'knuckle-spike-{k}', p + 0.01 * ahead, p + 0.05 * ahead + 0.02 * across, 0.012)


# Head --------------------------------------------------------------------------------------------

# The helm, tall and narrow, with a keel down its face to a point at the chin and a V of a slit lit
# like an ember under the brow, its face tipped up towards the game's camera. Each row: z,
# half-width, half-depth, centre y, how far the keel juts and how far the V dips at the middle.
HELM = [
    (1.57, 0.14, 0.14, 0.02, 0.0, 0.0),
    (1.6, 0.18, 0.184, 0.006, 0.085, 0.0),  # the cheek guards, flaring out, to a point at the chin
    (1.66, 0.172, 0.178, 0.0, 0.074, 0.0),
    (1.72, 0.166, 0.176, 0.0, 0.064, 0.0),
    (1.752, 0.168, 0.178, 0.0, 0.06, 0.036),  # the slit, lower edge
    (1.788, 0.17, 0.18, 0.0, 0.06, 0.036),  # the slit, upper edge
    (1.822, 0.178, 0.186, 0.0, 0.07, 0.036),  # the brow
    (1.9, 0.162, 0.17, 0.005, 0.042, 0.0),
    (1.96, 0.134, 0.14, 0.01, 0.016, 0.0),
    (2.0, 0.094, 0.1, 0.01, 0.0, 0.0),
]
SLIT_LOW, SLIT_HIGH = 4, 5
SLIT_HALF = 46.0  # degrees either side of the front the slit runs
KEEL_HALF = 58.0  # how far round the face the keel's wedge spreads
HELM_TOP = 2.045


def helm():
    n = D['helm']
    extra = D['helm_rows']  # rows between each of HELM's, for density
    rows, slit = [], []
    for k, (lo, hi) in enumerate(zip(HELM, HELM[1:])):
        steps = 1 if k + 1 in (SLIT_LOW, SLIT_HIGH, SLIT_HIGH + 1) else extra + 1
        for j in range(steps):
            u = j / steps
            rows.append([a + (b - a) * u for a, b in zip(lo, hi)])
            slit.append(k if j == 0 else -1)  # which of HELM's rows it is, or none
    rows.append(list(HELM[-1]))
    slit.append(len(HELM) - 1)
    low_row = slit.index(SLIT_LOW)
    high_row = slit.index(SLIT_HIGH)
    rings = []
    for r, (z, rx, ry, cy, keel, dip) in enumerate(rows):
        ring = []
        for i in range(n):
            a = math.radians(-90 + 360 * i / n)
            off = abs(((math.degrees(a) + 90) + 180) % 360 - 180)  # degrees from the front
            v = max(0.0, 1 - off / SLIT_HALF)
            p = V(rx * math.cos(a), cy + ry * math.sin(a), z - dip * v ** 1.2)
            p.y -= keel * max(0.0, 1 - off / KEEL_HALF)
            if v > 0 and r == low_row:
                p -= 0.024 * V(p.x, p.y - cy, 0).normalized()
            if v > 0 and r == high_row:
                p -= 0.006 * V(p.x, p.y - cy, 0).normalized()
            ring.append(p)
        rings.append(ring)
    verts, faces, bands = loft(rings)
    mats_of = []
    for f, b in zip(faces, bands):
        lit = b == low_row and all(abs((((-90 + 360 * (vi % n) / n) + 90) + 180) % 360 - 180) < SLIT_HALF - 1
                                   for vi in f)
        mats_of.append(1 if lit else 0)
    apex, last = len(verts), (len(rows) - 1) * n
    verts.append(V(0, 0.01, HELM_TOP))
    faces += [(last + i, last + (i + 1) % n, apex) for i in range(n)]
    mats_of += [0] * n
    obj = part('helm', verts, faces, [M['iron'], M['ember'], M['edge']], mats_of, inside=lambda c: V(0, 0.01, c.z))
    if D['chamfer']:
        b = obj.modifiers.new('chamfer', 'BEVEL')
        b.width, b.segments, b.limit_method, b.angle_limit = 0.005 * D['chamfer'], 1, 'ANGLE', math.radians(42)
        b.material = 2
        b.use_clamp_overlap = True
    bake(obj)


def crown():
    """A band of iron round the top of the helm and a crown of blades rising from it, flaring out:
    the tallest over his brow and at his temples, shorter behind, tall and short in turn."""
    n = D['helm']

    def band(u, v):
        a = math.radians(-90) + math.tau * u
        r = 0.18 + 0.022 * v
        return V(r * math.cos(a), 0.01 + 1.02 * r * math.sin(a), 1.875 + 0.085 * v)

    plate('crown-band', band, n, 1, inside=lambda c: V(0, 0.01, c.z), closed=True, thick=0.014, chamfer=0.006)
    count = D['crown']
    seg = D['blade']
    for i in range(count):
        deg = -90 + 360 * i / count
        a = math.radians(deg)
        off = abs(((deg + 90) + 180) % 360 - 180) / 180  # 0 in front, 1 behind
        height = (0.4 - 0.2 * off) * (0.62 if i % 2 else 1.0)
        out = V(math.cos(a), math.sin(a), 0)
        foot = V(0, 0.01, 1.885) + 0.172 * out  # inside the band
        up = (V(0, 0, 1) + 0.2 * out).normalized()
        bend = (V(0, 0, 1) + 0.42 * out).normalized()
        points = [foot]
        for j in range(1, seg + 1):
            points.append(points[-1] + (height / (seg + 1)) * up.lerp(bend, j / (seg + 1)).normalized())
        tip = points[-1] + (height / (seg + 1)) * bend
        widths = [0.052 * (1 - 0.7 * j / (seg + 1)) for j in range(len(points))]
        blade(f'crown-blade-{i}', points, widths, 0.016, tip, side=V(-math.sin(a), math.cos(a), 0))


def head():
    with bone('head'):
        helm()
        crown()


# Cape --------------------------------------------------------------------------------------------


def cape():
    """His great cape, of the team colour, from round his neck over his shoulders and down his back,
    in folds where it wraps his sides, its hem torn; the Lidless Eye on its back and two clasps of
    trim pinning it below the pauldrons, as at 1★. On its own bone, `cape`, as at 1★."""
    points, rows = D['cape']
    levels = sauron.CAPE  # z in the middle and at the edges, half-width, half-depth, centre y, ...
    torn = random.Random(7)
    hem = [torn.uniform(0, 1) for _ in range(points)]

    def level(t):
        k = min(int(t), len(levels) - 2)
        u = t - k
        return [a + (b - a) * u for a, b in zip(levels[k], levels[k + 1])]

    rings = []
    for r in range(rows + 1):
        middle, edge, rx, ry, cy, spread, fold, dag = level((len(levels) - 1) * r / rows)
        ring = []
        for i in range(points):
            u = i / (points - 1)
            a = math.radians(spread + (180 - 2 * spread) * u)
            off = abs(2 * u - 1)  # 0 at the middle of his back, 1 at the edges
            folds = fold * (0.5 - 0.5 * math.cos(math.tau * D['cape_folds'] * u)) * smooth(0.25, 0.55, off)
            k = 1 + folds / ry
            z = edge + (middle - edge) * math.sin(a) ** 2
            if r == rows:  # the hem, torn
                z += 0.02 - (0.05 + 0.06 * hem[i]) * (1 if i % 2 else 0.4)
            ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    with bone('cape'):
        part('cape', verts, faces, M['team'], inside=lambda c: V(0, 0, c.z))
        back = sauron.surface(verts, faces, lambda c: c.y > 0.2 and 0.6 < c.z < 1.4 and abs(c.x) < 0.3)
        eye('eye-cape', back, 0.0, 1.02, 0.3, 0.16, 0.012)
        yoke = sauron.surface(verts, faces, lambda c: c.y > 0.15 and c.z > 1.2)
        for s in (-1, 1):
            x, z = s * sauron.CLASP[0], sauron.CLASP[1]
            seat = V(x, on_surface(yoke, x, z), z)
            out = V(0, 1, 0.35).normalized()
            kit.cone(f'clasp-{s}', seat - 0.01 * out, seat + 0.035 * out, 0.045, [M['trim']], n=8, back=None)


def eye(name, triangles, x, z, width, height, lift):
    """The Lidless Eye laid on a surface seen along y, `lift` off it, the pupil a little prouder."""
    hw, hh = width / 2, height / 2
    sign = 1 if lift > 0 else -1
    rim = sauron.drape(triangles, [(x + hw * u, z + hh * w) for u, w in sauron.EYE_OUTLINE], lift)
    centre = sauron.drape(triangles, [(x, z)], lift)[0]
    pupil = sauron.drape(triangles, [(x + hw * u, z + hh * w) for u, w in sauron.PUPIL], lift + sign * 0.004)
    verts = rim + [centre] + pupil
    faces = [(i, (i + 1) % 8, 8) for i in range(8)] + [(9, 10, 11, 12)]
    part(name, verts, faces, [M['ember'], M['eyes']], [0] * 8 + [1], outward=V(0, sign, 0))


# Rig ---------------------------------------------------------------------------------------------

# The 1★ model's clips (../units/sauron.py), but for his death: his crown of blades is taller than the
# 1★'s crown, and would reach out of the hex as he slumps, so he slumps a little less (`slump`) and his
# hips settle a little further back as his knees go (`back`), which ../clips.py's knees() has for a
# tall Large body; further back pushes his cape out of the hex, or into the ground.
CLIPS = robed(draped(fit({
    'idle': ('ready', {'seconds': 2.8, 'breath': 0.8, 'sway': 0.6, 'crouch': 0.02}),
    'move': ('run', {'heavy': 0.6, 'stride': 0.4, 'lift': 0.2, 'lean': 8.0, 'off': 'high'}),
    'attack': ('smash', {'drop': 1.0, 'coil': 8.0, 'slow': 1}),
    'cast': ('reap', {'turn': 55.0, 'begin': 1.0}),
    'stun': ('dazed', {'seconds': 1.4, 'low': 0.3, 'off_low': 0.7}),
    'death': ('knees', {'dropped': True, 'behind': 0.0, 'slump': 0.7, 'back': 0.25}),
    'victory': ('raise', {'out': 0.3, 'lean': 10.0}),
}, between=True)))
RIG = rig.Rig(kind='large', clips=CLIPS,
              bones={'robe': ('root', 'robe_top', 'robe_foot'), 'cape': ('spine', 'cape_top', 'cape_hem')})


# Building ----------------------------------------------------------------------------------------


def joints():
    """Builds the 1★ model, for its joints, and removes its parts, leaving the marks."""
    sauron.build()
    for o in list(bpy.context.scene.objects):
        if not o.get('joint'):
            data = o.data
            bpy.data.objects.remove(o)
            if data is not None and data.users == 0:
                bpy.data.meshes.remove(data)
    return RIG


def label():
    """Writes the bone each part is bound to into its custom property `bone`, for --from."""
    for o in bpy.context.scene.objects:
        if o.type == 'MESH' and not o.get('joint'):
            names = {g.name for g in o.vertex_groups}
            if len(names) != 1:
                raise RuntimeError(f'{o.name} is bound to {len(names)} bones, not one')
            o['bone'] = names.pop()


def rebind():
    """Binds every vertex of each part in a scene worked on by hand to the bone its `bone` names."""
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or o.get('joint'):
            continue
        name = o.get('bone')
        if name not in RIG.bones:
            raise RuntimeError(f'{o.name}: give it a custom property "bone" naming one of the rig\'s bones '
                               f'({", ".join(RIG.bones)}), not {name!r}')
        for g in list(o.vertex_groups):
            o.vertex_groups.remove(g)
        o.vertex_groups.new(name=name).add(range(len(o.data.vertices)), 1.0, 'REPLACE')


def report():
    """Prints how many triangles each kind of part has."""
    counts, reach = {}, {}
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or o.get('joint'):
            continue
        o.data.calc_loop_triangles()
        key = o.name.split('-')[0]
        counts[key] = counts.get(key, 0) + len(o.data.loop_triangles)
        far = max((v.co.x ** 2 + v.co.y ** 2) ** 0.5 for v in o.data.vertices)
        reach[key] = max(reach.get(key, 0.0), far)
    total = sum(counts.values())
    parts = ', '.join(f'{k} {v}' for k, v in sorted(counts.items(), key=lambda kv: -kv[1]))
    print(f'PARTS {LEVEL}: {total} triangles: {parts}')
    print('REACH ' + ', '.join(f'{k} {v:.3f}' for k, v in sorted(reach.items(), key=lambda kv: -kv[1])[:6]))


def build():
    the_rig = joints()
    make_materials()
    marks = set(bpy.context.scene.objects)
    sabaton('right', sauron.R_FOOT, sauron.R_YAW)
    sabaton('left', sauron.L_FOOT, sauron.L_YAW)
    robe_cloth()
    skirt()
    tabard()
    lower = set(bpy.context.scene.objects)
    belt()
    cuirass()
    black_hand()
    head()
    pauldron('right', -1)
    pauldron('left', 1)
    cape()
    mace()
    # He leans as the 1★ model does, but for his legs, robe and skirt; his joints are leaned already.
    lean([o for o in bpy.context.scene.objects if o not in lower and o not in marks], V(0, 0, 1.0), 3)
    return the_rig


def main():
    if SOURCE:
        bpy.ops.wm.open_mainfile(filepath=os.path.abspath(SOURCE))
        rebind()
        the_rig = RIG
    else:
        the_rig = build()
        label()
    report()
    if BLEND:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))
        print(f'SAVED {BLEND}')
    for o in bpy.context.scene.objects:  # the `bone` labels are for the .blend, not the model
        if 'bone' in o:
            del o['bone']
    rig.MAX_BYTES['large'] = 50_000_000  # a study: its size is one of the things it measures
    finish('sauron', budget=D['budget'], rig=the_rig)


if __name__ == '__main__':
    main()
