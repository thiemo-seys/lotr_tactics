"""The Mûmak of Harad: a Large PvE monster (packages/sim/src/data/monsters.ts), in the Faceted style
(docs/viewer-spec.md section 4).

After Sam's sight of one in Ithilien (The Two Towers, Of Herbs and Stewed Rabbit), not the films: a
great grey beast like a moving hill, its legs like trees, its ears spread like sails, its long snout
upraised like a serpent, its small eyes red and raging, its upturned hornlike tusks bound with bands
of gold, its trappings of scarlet and gold flapping in tatters about it, and a war-tower on its back.
It is huge, but stylised and chunky so that it stands inside its hex as every unit does: short in the
body, its legs pillars under it, its head carried straight before it and its trunk hanging close under
its face, about 2.2 to the peak of the tower's canopy.

Its livery, Harad crimson (packages/client/src/livery.json), is its trappings: a great cloth over its
back under the tower, its gold-bordered skirts hanging in dags down its flanks, a frontlet on its
brow and the canopy of the tower, so it shows from in front, from behind and from above against the
grey hide. Its gold fittings, the bands on its tusks, the bosses on its cloth and the frontlet and the
canopy's finial, use `trim`, which the client colours iron at 1★, the only star level a monster has;
the cloth's borders are a muted gold of their own (`gold`).

It is rigged as a Large beast (../rig.py, Rig(kind='large-beast')): `root` and a mount's bones, as the
warg is (../beasts.py), its body where a figure's hips would be, its neck, head and tail, and its legs,
three bones each, a thigh or upper leg, a lower leg and a foot; and bones of its own on its head: its
trunk, a chain of three (`mount_trunk_1` to `mount_trunk_3`), and its ears (`mount_ear_l` and
`mount_ear_r`). The tower and what it carries ride its body. The clip library's mounted styles move it
without a rider, with a beast's own attack and victory (../clips.py, Beasts): it stands breathing and
shifting its weight, ambles a heavy stride, gores with its tusks as it lunges (`maul` without a jaw),
reels, goes down on its belly and trumpets as it wins (`howl` without a jaw). Trample, its ability,
charges through the line ahead (a dash from the end of its 0.35 s wind-up), so its cast (`stampede`)
rears through the wind-up and crashes down, setting off, as it ends; `move` carries it on from there.
trunked() below swings its trunk and its ears in every clip: the trunk hangs from its face whatever its
head does, curls and swings with what it does, and is raised high as it trumpets.

    blender --background --factory-startup --python-exit-code 1 --python mumak.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so its left is +X.
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Quaternion

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from beasts import ring8, tufts  # noqa: E402
from clips import degrees_of, made, tweened, wave  # noqa: E402
from kit import (  # noqa: E402
    LARGE_BUDGET,
    V,
    bone,
    box,
    cone,
    finish,
    loft,
    material,
    nearest_on_line,
    nearest_on_polyline,
    part,
    path_rings,
    reset,
    team_material,
    trim_material,
    wind,
)
from mounts import jointed_leg, mount_rig  # noqa: E402
from rig import Rig, crowding, joint, turn_of  # noqa: E402


# Its colours (sRGB): a grey hide in two shades for its facets, ivory tusks, small red eyes.
HIDE = 0x7B7671
DARK_HIDE = 0x625D59
EAR = 0x8A7470  # the inside of its ears
IVORY = 0xE0D5B6
NAILS = 0xBDB39C
RED_EYE = 0x8E2A1E
GOLD = 0xA88A42  # the borders of its trappings: a muted gold, so the livery stays the saturated part
WOOD = 0x8A6642
TIMBER = 0x5B4331

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        hide=material('hide', HIDE, roughness=0.95),
        dark_hide=material('dark-hide', DARK_HIDE, roughness=0.95),
        ear=material('ear', EAR, roughness=0.9),
        ivory=material('ivory', IVORY, roughness=0.6),
        nails=material('nails', NAILS, roughness=0.7),
        eyes=material('mumak-eyes', RED_EYE, roughness=0.5),
        gold=material('gold', GOLD, roughness=0.6, metallic=0.1),
        wood=material('wood', WOOD, roughness=0.85),
        timber=material('timber', TIMBER, roughness=0.85),
        trim=trim_material(),
    )


def checker(n_faces, ring=8, dark=3):
    """A face's material for a faceted hide: every `dark`th facet round each band the darker shade."""
    return [1 if (f + f // ring) % dark == 0 else 0 for f in range(n_faces)]


# The body ---------------------------------------------------------------------------------------
#
# Short and deep, a barrel on pillar legs, from the breast to the rump: y, the top (the line of the
# back), the bottom (the chest and belly), the half-width, and how wide the top and bottom facets are.
BODY = [
    (-0.50, 1.08, 0.66, 0.27, 0.7, 0.6),  # the breast
    (-0.38, 1.25, 0.53, 0.38, 0.8, 0.6),  # the shoulders
    (-0.12, 1.28, 0.47, 0.43, 0.9, 0.7),  # the ribs
    (0.16, 1.26, 0.48, 0.43, 0.9, 0.7),  # the belly
    (0.40, 1.21, 0.55, 0.39, 0.8, 0.6),  # the haunches
    (0.56, 1.06, 0.68, 0.27, 0.7, 0.6),  # the rump
]
BREAST, RUMP = V(0, -0.56, 0.86), V(0, 0.62, 0.88)


def body_row(y):
    for a, b in zip(BODY, BODY[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return tuple(p + t * (q - p) for p, q in zip(a, b))
    raise ValueError(f'no body at y = {y}')


def axis_at(c):
    y = min(max(c.y, BODY[0][0]), BODY[-1][0])
    row = body_row(y)
    return V(0, y, (row[1] + row[2]) / 2)


def body():
    rings = [ring8(*row) for row in BODY]
    verts, faces, _ = loft(rings)
    face_mats = checker(len(faces))
    faces = wind(verts, faces, inside=axis_at)
    front, back, last = len(verts), len(verts) + 1, (len(rings) - 1) * 8
    verts += [BREAST, RUMP]
    faces += wind(verts, [(i, (i + 1) % 8, front) for i in range(8)], inside=V(0, BODY[0][0] + 0.02, 0.87))
    faces += wind(verts, [(last + i, last + (i + 1) % 8, back) for i in range(8)], inside=V(0, BODY[-1][0] - 0.02, 0.87))
    face_mats += [0, 1] * 4 + [1, 0] * 4
    part('mumak-body', verts, faces, [M['hide'], M['dark_hide']], face_mats)


# The neck and head --------------------------------------------------------------------------------
#
# The neck is short and thick, a collar between the shoulders and the head; the head a great domed
# skull, its brow high, narrowing to the face the trunk hangs from. Rows: y, top, bottom, half-width,
# and how wide the top and bottom facets are.
NECK = [(-0.36, 1.2, 0.64, 0.31, 0.8, 0.6), (-0.54, 1.28, 0.72, 0.29, 0.8, 0.6)]
HEAD = [
    (-0.47, 1.34, 0.74, 0.29, 0.8, 0.6),  # the back of the skull, inside the neck
    (-0.61, 1.47, 0.76, 0.31, 0.7, 0.6),  # the brow, domed
    (-0.71, 1.38, 0.8, 0.25, 0.7, 0.6),  # the face
    (-0.77, 1.2, 0.86, 0.15, 0.8, 0.7),  # where the trunk springs from
]
FACE = V(0, -0.79, 1.04)


def head_ring(row, grow=0.0):
    return ring8(*row, grow=grow)


def head_at(y, grow=0.0):
    """The head's ring at y, between the rows either side."""
    for a, b in zip(HEAD, HEAD[1:]):
        if b[0] <= y <= a[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return ring8(*(p + t * (q - p) for p, q in zip(a, b)), grow=grow)
    raise ValueError(f'no head at y = {y}')


def neck():
    rings = [ring8(*row) for row in NECK]
    verts, faces, _ = loft(rings)
    part('mumak-neck', verts, faces, [M['hide'], M['dark_hide']], checker(len(faces)),
         inside=nearest_on_line(V(0, -0.36, 0.92), V(0, -0.54, 1.0)))


def head():
    rings = [head_ring(row) for row in HEAD]
    verts, faces, _ = loft(rings)
    face_mats = checker(len(faces))
    axis = [V(0, row[0], (row[1] + row[2]) / 2) for row in HEAD]
    faces = wind(verts, faces, inside=nearest_on_polyline(axis))
    last = (len(rings) - 1) * 8
    verts.append(FACE)
    faces += wind(verts, [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)], inside=axis[-1])
    face_mats += [0] * 8
    part('mumak-head', verts, faces, [M['hide'], M['dark_hide']], face_mats)
    # Small red eyes, low on either side of the brow, laid on the upper side facet.
    for s in (-1, 1):
        a, b = head_at(-0.62, 0.006), head_at(-0.69, 0.006)
        i = 0 if s > 0 else 3  # the upper side facet's top corner, on the left or the right
        top, low = (a[i], b[i]), (a[7 if s > 0 else 4], b[7 if s > 0 else 4])
        p, q = top[0].lerp(low[0], 0.55), top[1].lerp(low[1], 0.5)
        r = top[0].lerp(low[0], 0.8).lerp(top[1].lerp(low[1], 0.8), 0.5)
        part(f'mumak-eye-{s}', [p, q, r], [(0, 1, 2)], M['eyes'], outward=V(s, -0.4, 0))


def frontlet():
    """A crimson frontlet over its brow and down its face, between its eyes, edged in gold, with a
    gold boss on it and a dag hanging over the root of its trunk."""
    rows = []
    for y in (-0.55, -0.63, -0.71, -0.765):
        ring = head_at(y, 0.012)
        rows.append([ring[0].lerp(ring[1], 0.35), ring[1], ring[2], ring[3].lerp(ring[2], 0.35)])
    # The top facets of the head's rings face up; the face's front ring is the trunk's root, so the
    # frontlet runs on down the face over the cap towards it.
    tip = FACE + V(0, -0.012, 0.03)
    verts, faces, _ = loft(rows, closed=False)
    face_mats = [1 if i in (0, 2) else 0 for i in [f % 3 for f in range(len(faces))]]
    last = (len(rows) - 1) * 4
    verts.append(tip)
    faces += [(last, last + 1, len(verts) - 1), (last + 1, last + 2, len(verts) - 1), (last + 2, last + 3, len(verts) - 1)]
    face_mats += [1, 0, 1]
    part('frontlet', verts, faces, [M['team'], M['gold']], face_mats, inside=V(0, -0.6, 1.05))
    boss = head_at(-0.68, 0.025)
    centre = (boss[1] + boss[2]) / 2
    cone('frontlet-boss', centre - V(0, -0.012, 0.01), centre + V(0, -0.05, 0.02), 0.035, M['trim'], n=5, back=None)


def ears():
    """Great ears like sails, spread out from the sides of its head: a sheet of hide behind and a
    paler sheet before it, on bones of their own so they flap."""
    for s, side in ((1, 'l'), (-1, 'r')):
        root_top, root_low = V(s * 0.25, -0.5, 1.34), V(s * 0.27, -0.55, 0.9)
        outline = [root_top, V(s * 0.39, -0.42, 1.42), V(s * 0.53, -0.33, 1.26), V(s * 0.57, -0.32, 1.0),
                   V(s * 0.5, -0.37, 0.76), V(s * 0.37, -0.45, 0.66), root_low]
        centre = V(s * 0.42, -0.41, 1.05)
        with bone(f'mount_ear_{side}'):
            for mat, shift in ((M['hide'], V(0, 0.006, 0)), (M['ear'], V(0, -0.006, 0))):
                verts = [p + shift for p in outline] + [centre + shift]
                faces = [(i, i + 1, len(outline)) for i in range(len(outline) - 1)]
                part(f'mumak-ear-{side}', verts, faces, mat, outward=V(0.3 * s, -1 if mat is M['ear'] else 1, 0))
        joint(f'mount_ear_{side}_root', root_top.lerp(root_low, 0.2))
        joint(f'mount_ear_{side}_tip', root_top.lerp(root_low, 0.2) + V(s * 0.25, 0.08, -0.05))


# The trunk hangs close under its face, curling forward a little at the tip, as a chain of three
# bones; the tube's rings each follow the bone of the length they are on, so it bends where they turn.
TRUNK = [V(0, -0.7, 1.03), V(0, -0.785, 0.97), V(0, -0.805, 0.84), V(0, -0.815, 0.7), V(0, -0.82, 0.57),
         V(0, -0.82, 0.44), V(0, -0.812, 0.33), V(0, -0.8, 0.23), V(0, -0.815, 0.16)]
TRUNK_RADII = [0.12, 0.112, 0.1, 0.09, 0.08, 0.072, 0.064, 0.058, 0.054]
TRUNK_TIP = V(0, -0.845, 0.115)
TRUNK_JOINTS = {'mount_trunk_root': V(0, -0.775, 0.98), 'mount_trunk_a': V(0, -0.815, 0.7),
                'mount_trunk_b': V(0, -0.82, 0.44), 'mount_trunk_tip': V(0, -0.83, 0.13)}


def trunk_bone(p):
    if p.z > TRUNK_JOINTS['mount_trunk_a'].z:
        return 'mount_trunk_1'
    return 'mount_trunk_2' if p.z > TRUNK_JOINTS['mount_trunk_b'].z else 'mount_trunk_3'


def trunk():
    rings = path_rings(TRUNK, TRUNK_RADII, 6, 0, V(1, 0, 0))
    # Wrinkled: every other ring a little fuller.
    for r, ring in enumerate(rings):
        if r % 2 and 0 < r < len(rings) - 1:
            for i, p in enumerate(ring):
                ring[i] = TRUNK[r] + (p - TRUNK[r]) * 1.08
    verts, faces, bands = loft(rings)
    face_mats = [1 if b % 2 else 0 for b in bands]
    faces = wind(verts, faces, inside=nearest_on_polyline(TRUNK))
    first = (len(rings) - 1) * 6
    verts.append(TRUNK_TIP)
    faces += wind(verts, [(first + i, first + (i + 1) % 6, len(verts) - 1) for i in range(6)], inside=TRUNK[-1])
    face_mats += [1] * 6
    with bone('mount_trunk_1', follows=trunk_bone):
        part('mumak-trunk', verts, faces, [M['hide'], M['dark_hide']], face_mats)
    for name, point in TRUNK_JOINTS.items():
        joint(name, point)


def tusks():
    """Great tusks upturned like horns from under its face, each bound with two bands of gold."""
    for s in (-1, 1):
        points = [V(s * 0.11, -0.64, 0.87), V(s * 0.145, -0.73, 0.77), V(s * 0.2, -0.8, 0.76),
                  V(s * 0.255, -0.83, 0.86), V(s * 0.29, -0.81, 0.98)]
        radii = [0.05, 0.047, 0.041, 0.033, 0.024]
        rings = path_rings(points, radii, 5, 0, V(1, 0, 0))
        verts, faces, _ = loft(rings)
        faces = wind(verts, faces, inside=nearest_on_polyline(points))
        first = (len(rings) - 1) * 5
        verts.append(V(s * 0.305, -0.775, 1.07))
        faces += wind(verts, [(first + i, first + (i + 1) % 5, len(verts) - 1) for i in range(5)], inside=points[-1])
        part(f'mumak-tusk-{s}', verts, faces, M['ivory'])
        for k, f in ((1, 0.2), (2, 0.55)):
            a, b = points[k], points[k + 1]
            c, d = a.lerp(b, f), a.lerp(b, f + 0.22)
            r = radii[k] + (radii[k + 1] - radii[k]) * (f + 0.1) + 0.008
            band = path_rings([c, d], [r, r], 5, 0, V(1, 0, 0))
            verts, faces, _ = loft(band)
            part(f'mumak-tusk-band-{s}-{k}', verts, faces, M['trim'], inside=nearest_on_line(c, d))


# The legs ----------------------------------------------------------------------------------------
#
# Pillars like trees, from inside the body to the ground: the top, the knee (forward, on the forelegs
# and the hind legs alike, as an elephant's), the ankle, the top of the foot and its round sole.
FORELEG = [V(0, -0.3, 0.86), V(0, -0.33, 0.48), V(0, -0.31, 0.19), V(0, -0.315, 0.08), V(0, -0.32, 0.0)]
HINDLEG = [V(0, 0.36, 0.88), V(0, 0.31, 0.5), V(0, 0.35, 0.19), V(0, 0.355, 0.08), V(0, 0.36, 0.0)]
FORE_RADII = [0.165, 0.135, 0.11, 0.13, 0.15]
HIND_RADII = [0.175, 0.135, 0.11, 0.13, 0.15]
LEGS = [('fore', FORELEG, FORE_RADII, 0.245), ('hind', HINDLEG, HIND_RADII, 0.25)]
BENDS = {'fore_l': V(0, -1, 0), 'fore_r': V(0, -1, 0), 'hind_l': V(0, -1, 0), 'hind_r': V(0, -1, 0)}


def legs():
    chains = {}
    for kind, joints, radii, x in LEGS:
        for s in (-1, 1):
            side = 'l' if s > 0 else 'r'
            leg = f'{kind}_{side}'
            points = [V(s * x, j.y, j.z) for j in joints]
            rings = path_rings(points, radii, 7, 0, V(1, 0, 0), level_end=True)
            chains[leg] = jointed_leg(f'mumak-{kind}-{side}', leg, points, rings, [M['hide'], M['dark_hide']],
                                      [0, 1, 0, 1])
            # Three broad toenails round the front of its sole.
            centre = points[-1]
            nails = []
            for a in (-35, 0, 35):
                way = V(math.sin(math.radians(a)), -math.cos(math.radians(a)), 0)
                at = centre + way * radii[-1] * 0.98 + V(0, 0, 0.005)
                across = way.cross(V(0, 0, 1)).normalized()
                nails.append(([at + 0.035 * across, at - 0.035 * across, at + V(0, 0, 0.055) + 0.012 * way],
                              at + 0.02 * way + V(0, 0, 0.02)))
            with bone(chains[leg][2]):
                tufts(f'mumak-nails-{leg}', nails, M['nails'])
    return chains


def tail():
    """A thin tail hanging from its rump, a dark tuft at its end."""
    points = [V(0, 0.55, 1.03), V(0, 0.63, 0.94), V(0, 0.68, 0.76), V(0, 0.69, 0.58)]
    rings = path_rings(points, [0.035, 0.03, 0.024, 0.02], 4, 45, V(1, 0, 0))
    verts, faces, _ = loft(rings)
    part('mumak-tail', verts, faces, M['hide'], inside=nearest_on_polyline(points))
    cone('mumak-tail-tuft', V(0, 0.69, 0.62), V(0, 0.695, 0.45), 0.04, M['dark_hide'], n=4, back=None)


# The trappings, in the livery -----------------------------------------------------------------------

CLOTH = 0.02  # how far the cloth stands off the hide


def caparison():
    """A great crimson cloth over its back from its shoulders to its haunches, its skirts hanging
    down its flanks bordered in gold and ending in tattered dags, with gold bosses on them."""
    rows = []
    drop = 0.13
    for y in (-0.4, -0.2, 0.02, 0.24, 0.42):
        ring = ring8(*body_row(y), grow=CLOTH)
        p7, p4 = ring[7], ring[4]
        out7, out4 = V(0.012, 0, 0), V(-0.012, 0, 0)
        rows.append([p7 - V(0, 0, drop) + out7, p7 - V(0, 0, 0.75 * drop) + out7, p7, ring[0], ring[1], ring[2],
                     ring[3], p4, p4 - V(0, 0, 0.75 * drop) + out4, p4 - V(0, 0, drop) + out4])
    verts, faces, _ = loft(rows, closed=False)
    width = len(rows[0])
    face_mats = [1 if f % (width - 1) in (0, width - 2) else 0 for f in range(len(faces))]
    # Tattered dags hang from the hem between each pair of rows on each side.
    for r in range(len(rows) - 1):
        for i in (0, width - 1):
            a, b = r * width + i, (r + 1) * width + i
            verts.append((verts[a] + verts[b]) / 2 - V(0, 0, 0.1 + 0.03 * (r % 2)))
            faces.append((a, b, len(verts) - 1))
            face_mats.append(0)
    part('caparison', verts, faces, [M['team'], M['gold']], face_mats, inside=lambda c: V(0, c.y, 0.88))
    # Gold bosses on the skirts, one between each pair of dags on either side.
    for y in (-0.3, 0.13, 0.33):
        for s in (-1, 1):
            ring = ring8(*body_row(y), grow=CLOTH)
            at = (ring[7] if s > 0 else ring[4]) - V(0, 0, 0.03) + V(s * 0.012, 0, 0)
            cone(f'caparison-boss-{s}-{y}', at, at + V(s * 0.045, 0, 0), 0.03, M['trim'], n=5, back=None)


def breast_band():
    """A crimson band round its breast below its neck, bordered in gold, holding the cloth on."""
    ring = [p + V(0, 0, 0) for p in ring8(*body_row(-0.47), grow=CLOTH)]
    lower = [p + V(0, 0.07, 0) for p in ring8(*body_row(-0.4), grow=CLOTH)]
    verts, faces, _ = loft([ring, lower])
    part('breast-band', verts, faces, M['team'], inside=V(0, -0.44, 0.87))


# The war-tower ------------------------------------------------------------------------------------
#
# A tower of planks on its back, over the cloth, with a rail round its top; on its corner posts a
# crimson canopy, its eaves hanging in dags, and a gold finial at its peak.
TOWER_Y, TOWER_X, TOWER_D = 0.06, 0.3, 0.29  # its middle and half-sizes across and along the back
TOWER_BASE, TOWER_TOP = 1.38, 1.7
POST_TOP, EAVE, PEAK = 1.99, 1.93, 2.2


def tower():
    def rect(z, grow=0.0):
        x, d = TOWER_X + grow, TOWER_D + grow
        return [V(x, TOWER_Y - d, z), V(-x, TOWER_Y - d, z), V(-x, TOWER_Y + d, z), V(x, TOWER_Y + d, z)]

    # The walls, flaring a little, in two courses of planks, and the floor at their top.
    rings = [rect(TOWER_BASE, -0.03), rect(1.46, -0.01), rect(TOWER_TOP)]
    verts, faces, bands = loft(rings)
    face_mats = [b for b in bands]
    verts_top = len(verts) - 4
    faces.append(tuple(range(verts_top, verts_top + 4)))
    face_mats.append(0)
    part('tower', verts, faces, [M['wood'], M['timber']], face_mats, inside=V(0, TOWER_Y, 1.45))
    # A rail round the top.
    rail = [rect(TOWER_TOP - 0.01, 0.012), rect(TOWER_TOP + 0.06, 0.012)]
    verts, faces, _ = loft(rail)
    part('tower-rail', verts, faces, M['timber'], inside=V(0, TOWER_Y, TOWER_TOP))
    # Corner posts up to the canopy.
    for corner in rect(TOWER_TOP):
        c = V(corner.x * 0.93, TOWER_Y + (corner.y - TOWER_Y) * 0.93, (TOWER_TOP + POST_TOP) / 2)
        box('tower-post', c, [V(0, 0, 1), V(1, 0, 0), V(0, 1, 0)], ((POST_TOP - TOWER_TOP) / 2, 0.025, 0.025),
            M['timber'])
    # The canopy: a low pyramid over the posts, its eaves hanging in dags, a finial at its peak.
    eave = rect(POST_TOP, 0.05)
    apex = V(0, TOWER_Y, PEAK - 0.06)
    verts = eave + [apex]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(3, 2, 1, 0)]
    part('canopy', verts, faces, M['team'], inside=V(0, TOWER_Y, POST_TOP + 0.02))
    skirt_top, skirt_low = rect(POST_TOP, 0.05), rect(EAVE, 0.055)
    verts, faces, _ = loft([skirt_top, skirt_low])
    face_mats = [0] * len(faces)
    for i in range(4):  # dags: two along each side
        a, b = skirt_low[i], skirt_low[(i + 1) % 4]
        for f in (0.25, 0.75):
            p, q = a.lerp(b, f - 0.2), a.lerp(b, f + 0.2)
            first = len(verts)
            verts += [p, q, a.lerp(b, f) - V(0, 0, 0.06)]
            faces.append((first, first + 1, first + 2))
            face_mats.append(1)
    part('canopy-eaves', verts, faces, [M['gold'], M['team']], face_mats, inside=V(0, TOWER_Y, POST_TOP))
    cone('canopy-finial', apex - V(0, 0, 0.01), V(0, TOWER_Y, PEAK), 0.035, M['trim'], n=5, back=None)


# Its bones besides its legs': the body turns about the middle of its barrel, the neck about its root
# in the shoulders, the head at the back of its skull, the tail at its dock; its ears and its trunk
# hang from its head.
MUMAK_BONES = {
    'mount_body': ('root', 'mount_middle', 'mount_breast'),
    'mount_neck': ('mount_body', 'mount_neck_root', 'mount_poll'),
    'mount_head': ('mount_neck', 'mount_poll', 'mount_nose'),
    'mount_ear_l': ('mount_head', 'mount_ear_l_root', 'mount_ear_l_tip'),
    'mount_ear_r': ('mount_head', 'mount_ear_r_root', 'mount_ear_r_tip'),
    'mount_trunk_1': ('mount_head', 'mount_trunk_root', 'mount_trunk_a'),
    'mount_trunk_2': ('mount_trunk_1', 'mount_trunk_a', 'mount_trunk_b'),
    'mount_trunk_3': ('mount_trunk_2', 'mount_trunk_b', 'mount_trunk_tip'),
    'mount_tail': ('mount_body', 'mount_dock', 'mount_tail_end'),
}
TRUNK_BONES = ('mount_trunk_1', 'mount_trunk_2', 'mount_trunk_3')


# The trunk and the ears in its clips ------------------------------------------------------------------
#
# The mounted styles move its body, legs, neck, head and tail; trunked() adds its trunk and its ears.
# The trunk's first length hangs from the face as built whatever the head does (its parent's tilt taken
# back, as clips.swaying() hangs a beard), trailing a frame behind; each clip then curls and swings it
# (CURLS: each length's pitch and tilt, in degrees, at a share of the way through the clip, negative
# pitch curling it forward and up). Where a length would go under the ground or out of its clip's room
# it curls less, length by length from the head. The ears flap forward and back (yaw), and spread as it
# trumpets.

def coiled(k, curls):
    """The trunk coiled a share k of the way to `curls`, each length's pitch: its tip first, then its
    middle, then its root, so it curls up from the tip rather than swinging out straight."""
    shares = (max(0.0, (k - 0.4) / 0.6), min(1.0, max(0.0, (k - 0.15) / 0.55)), min(1.0, k / 0.35))
    return [(c * EASE(sh), 0) for c, sh in zip(curls, shares)]


def EASE(u):
    return u * u * (3 - 2 * u)


def trunk_pose(clip, f, n, marks):
    """Each trunk length's (pitch, tilt) and each ear's spread, in degrees, at frame f of a clip n frames
    long with its marks (strike, height): the trunk's own motion in each clip."""
    u = f / n
    if clip == 'idle':  # swinging slowly from side to side, its tip curling and uncurling
        swing = 9 * wave(f, n, 1)
        curl = 6 + 6 * wave(f, n, 2, 0.2)
        ears = 10 * max(0.0, wave(f, n, 2, 0.1)) ** 2
        return [(2, swing), (-curl, 0.6 * swing), (-1.5 * curl, 0.4 * swing)], ears
    if clip == 'move':  # swinging with its stride, the ears laid back
        swing = 7 * wave(f, n, 1, 0.1)
        return [(6, swing), (-8, 0.5 * swing), (-10, 0.3 * swing)], -14 + 4 * wave(f, n, 2)
    if clip == 'stun':  # hanging limp, swaying
        swing = 6 * wave(f, n, 1, 0.2)
        return [(4, swing), (3, 0.6 * swing), (2, 0.3 * swing)], -6 + 3 * wave(f, n, 1)
    if clip == 'attack':  # coiled up out of the way as it gores, the tip first, uncoiling as it recovers
        s = marks['strike']
        k = min(1.0, f / max(1, s - 2)) if f <= s else max(0.0, 1 - (f - s) / max(1, n - s))
        return coiled(k, (-10, -40, -120)), 18 * k
    if clip == 'cast':  # coiled up high as it rears and trumpets, uncoiling as it crashes down to charge
        h = marks['height']
        if f <= h - 2:
            k = min(1.0, f / max(1, h - 4))
        else:
            k = max(0.0, 1 - (f - (h - 2)) / max(1, n - (h - 2)))
        return coiled(k, (-40, -80, -130)), 26 * min(1.0, 2 * k) - 4 * (1 - k)
    if clip == 'death':  # flung up as it is struck, then curled back limp under its chin
        k = min(1.0, f / 3)
        if f <= 3:
            return [(-20 * k, 0), (-20 * k, 0), (-10 * k, 0)], 10 * k
        k = (f - 3) / max(1, n - 3)
        return [(-20 + 50 * k, 0), (-20 + 50 * k, 0), (-10 + 50 * k, 0)], 10 - 20 * k
    if clip == 'victory':  # coiled up high to trumpet as its head goes up, and held
        k = min(1.0, max(0.0, (u - 0.2) / 0.45))
        return coiled(k * k * (3 - 2 * k), (-40, -80, -130)), 30 * k
    return [(0, 0)] * 3, 0.0


# How far each length's end must stay off the ground (its radius there and a little), and how far in
# from the edge of its clip's room it keeps.
TRUNK_CLEAR = {'mount_trunk_1': 0.1, 'mount_trunk_2': 0.082, 'mount_trunk_3': 0.07}
TRUNK_ROOM = 0.96
# Where a length must be turned to keep in, the way it is turned: up (negative pitch) in the clips that
# curl it up, back (positive) in the rest.
TURNS = {'attack': -1, 'cast': -1, 'victory': -1, 'idle': 1, 'move': 1, 'stun': 1, 'death': 1}
STEP = 30  # the most a length is turned further, to keep in, from one frame to the next, where it can be


def trunked(clips, lag=1, share=1.0):
    """A Rig's clips, `{clip: spec}` as Rig takes them or as tweened() gives them, with its trunk and
    ears moved in every frame (above). Back comes a function of the rig for each clip."""
    up = V(0, 0, 1)

    def moved(rig, clip, spec):
        made_clip = made(rig, clip, spec)
        pose, n, loop, marks = made_clip.pose, made_clip.frames, made_clip.loop, made_clip.marks
        ahead = clip in ('attack', 'cast')
        seen = {}

        def hung(f):
            """The turn the trunk's first length would hang at in frame f, in the model's frame."""
            if f not in seen:
                turn = rig.solve(pose(f))['mount_head'].turn
                tilt = up.rotation_difference(turn @ up)
                seen[f] = Quaternion().slerp(tilt, 1 - share) @ tilt.inverted() @ turn
            return seen[f]

        def crowded(p):
            return float(crowding(np.array([p[:]]), ahead)[0])

        def kept(ch, b, prev):
            """Bone b of the trunk turned about the model's own X, as little as it must be, so its end
            keeps in its room and off the ground, on this frame and on the way to it from the frame
            before, `prev` (how far it was turned then, where its head was and where it pointed, or
            None): by no more than STEP further than it was turned then, if it can, so it doesn't flip
            from one way to the other. Returns the same for this frame."""
            _, head_joint, tail_joint = rig.bones[b]
            rest_way = rig.joint(tail_joint) - rig.joint(head_joint)
            length = rest_way.length
            motions = rig.solve(ch)
            m, parent = motions[b], motions[rig.bones[b][0]]
            at = m.at
            way = (m.turn @ rest_way).normalized()
            limit = (TRUNK_ROOM * 0.94 - TRUNK_CLEAR[b]) / 0.94
            clear = TRUNK_CLEAR[b]

            def inside(start, d):
                return crowded(start + length * d) <= limit and start.z + length * d.z >= clear

            def fits(d):
                d = turn_of((d, 0, 0)) @ way
                if not inside(at, d):
                    return False
                if prev is None:
                    return True
                _, then_at, then_way = prev
                if then_way.angle(d) > 3.1:
                    return False
                return all(inside(then_at.lerp(at, u), then_way.slerp(d, u) if then_way.angle(d) > 1e-6 else d)
                           for u in (0.25, 0.5, 0.75))

            before = 0 if prev is None else prev[0]
            if fits(0):
                return 0, at, way
            feasible = [d for d in range(-180, 181) if fits(d)]
            if not feasible:
                return 0, at, way
            sign = -TURNS[clip]
            near = [d for d in feasible if abs(d - before) <= STEP]
            if near:
                d = min(near, key=lambda d: (d * sign > 0, abs(d)))  # its own way first
            else:
                d = min(feasible, key=lambda d: abs(d - before))
            new = turn_of((d, 0, 0)) @ way
            ch[b] = degrees_of(parent.turn.inverted() @ way.rotation_difference(new) @ m.turn)
            return d, at, new

        def trunk_at(f, prev):
            """Frame f's channels with the trunk and ears, the trunk kept as it was on the frame before
            (`prev`, each length's turn, which this updates)."""
            ch = dict(pose(f))
            turn = rig.solve(ch)['mount_head'].turn
            now = hung(f)
            then = hung((f - lag) % n if loop else max(f - lag, 0))
            hang = turn.inverted() @ now.slerp(-then if now.dot(then) < 0 else then, 0.5)
            curls, ears = trunk_pose(clip, f, n, marks)
            for i, (b, (pitch, tilt)) in enumerate(zip(TRUNK_BONES, curls)):
                own = turn_of((pitch, tilt, 0))
                ch[b] = degrees_of(hang @ own if i == 0 else own)
                prev[b] = kept(ch, b, prev.get(b))
            ch['mount_ear_l'] = V(0, 0, -ears)
            ch['mount_ear_r'] = V(0, 0, ears)
            return ch

        frames = {}

        def with_trunk(f):
            if f != int(f) or not 0 <= f <= n:
                return trunk_at(f, {})
            if not frames:
                prev = {}
                for _ in range(2 if loop else 1):  # a loop twice, so its first frame follows on from its last
                    for g in range(n + 1):
                        frames[g] = trunk_at(g, prev)
                if loop:
                    frames[n] = frames[0]
            return dict(frames[int(f)])

        return made_clip.with_pose(with_trunk)

    return {clip: (lambda rig, clip=clip, spec=spec: moved(rig, clip, spec)) for clip, spec in clips.items()}


# Its clips (../clips.py): the mounted styles' mount half and a beast's own, slow and heavy as befits
# its size. It stands breathing and shifting its weight; ambles a heavy stride, its feet coming down
# in pairs close together; gores, lunging with its head lowered and its tusks before it (`maul`
# without a jaw, its forefeet kept down); rears and crashes down to charge (`stampede`); reels when
# dazed; goes down on its belly; and trumpets as it wins, settling back with its head and trunk raised
# (`howl` without a jaw). tweened() keeps its feet out of the ground between frames; trunked() moves its
# trunk and its ears.
CLIPS = trunked(tweened({
    'idle': ('saddle', {'seconds': 2.8, 'breath': 1.4, 'sway': 1.0}),
    'move': ('gallop', {'seconds': 0.6, 'stride': 0.4, 'fold': 0.45, 'bob': 0.6, 'bound': 0.3, 'tail': 10.0}),
    'attack': ('maul', {'seconds': 0.6, 'reach': 0.8, 'leap': 0.0, 'heavy': 0.7}),
    'cast': ('stampede', {'seconds': 0.6, 'rear': 1.0, 'heavy': 0.8}),
    'stun': ('reel', {'seconds': 1.4, 'droop': 0.6}),
    'death': ('founder', {'seconds': 0.5}),
    'victory': ('howl', {'seconds': 1.0, 'sit': 0.35, 'heavy': 0.5}),
}))


# It is built low and raised once built (raise_up()): its legs stretched and all above them lifted
# RAISE, joints and all, so it stands tall under its tower.
RAISE = 0.18
HEAD_BACK = 0.05  # how far its neck, head, trunk and tusks are drawn back after they are built
LEG_TOP = 0.86  # the height up to which the legs stretch


def raised(p):
    return V(p.x, p.y, p.z * (1 + RAISE / LEG_TOP) if p.z < LEG_TOP else p.z + RAISE)


def raise_up(objects):
    for obj in objects:
        if obj.type == 'MESH':
            for v in obj.data.vertices:
                v.co = raised(v.co)


def build():
    """Makes it in a fresh scene, every part bound to its bone and its joints marked, and returns the
    rig to finish() it with."""
    reset()
    make_materials()
    with bone('mount_body'):
        body()
        caparison()
        breast_band()
    before = set(bpy.context.scene.objects)
    with bone('mount_neck'):
        neck()
    with bone('mount_head'):
        head()
        frontlet()
        tusks()
    ears()
    trunk()
    joint('mount_poll', V(0, -0.5, 1.06))
    joint('mount_nose', V(0, -0.8, 1.0))
    for obj in set(bpy.context.scene.objects) - before:  # the head drawn in, so it keeps in the hex
        for v in obj.data.vertices:
            v.co.y += HEAD_BACK
    chains = legs()
    with bone('mount_tail'):
        tail()
    for name, point in (('mount_middle', V(0, 0.02, 0.9)), ('mount_breast', BREAST), ('mount_neck_root', V(0, -0.36, 1.0)),
                        ('mount_dock', V(0, 0.55, 1.03)), ('mount_tail_end', V(0, 0.695, 0.45))):
        joint(name, point)
    raise_up(bpy.context.scene.objects)
    with bone('mount_body'):
        tower()
    return Rig(kind='large-beast', mount=mount_rig(chains, bones=MUMAK_BONES, bends=BENDS, free=TRUNK_BONES), clips=CLIPS)


def main():
    finish('mumak', budget=LARGE_BUDGET, rig=build())


if __name__ == '__main__':
    main()
