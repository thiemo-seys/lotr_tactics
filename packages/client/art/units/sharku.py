"""Sharku, an Orc wolf-rider: a Rider on a warg, in the Faceted style (docs/viewer-spec.md section 4).

Built like Gimli (gimli.py), the reference, and of Gorbag's family (gorbag.py), which sets the Orcs'
look: the same sallow olive skin, big pointed ears, heavy tusked jaw and crude iron and leather.
What sets him apart from the other Orcs, who all go on foot, is his mount, one of the great evil
wolves the Orcs ride in packs, built by warg() (../beasts.py, which the riderless warg of the Moria
warband, warg.py, shares) as its own mount rather than the shared horse.
The warg is big, rangy and shaggy, grizzled grey-brown, low and long, its back about 0.6 off the
ground and nose to tail inside the hex: a heavy head thrust out and turned to its left, so that it
shows past him, with its jaws open on bone fangs, pale eyes and its ears pinned back; its hackles up
in a dark crest from its skull to its withers, a ruff round its neck, a shaggy underline and a bushy,
dark-tipped tail carried out stiff behind; its forelegs braced and its hind legs gathered under it,
ready to spring. On it Sharku crouches forward and out to his right under a pointed iron cap, a
rein in his left fist and a broad curved blade raised in his right. The team colour is his ragged
cloak, the warg's ragged saddle-cloth and the rag knotted round its throat, seen from in front, from
behind and from above; the cap, his ears and the blade show above it, and the warg's tail and
quarters below it.

He and the warg are rigged as one (../rig.py, ../clips.py), as Éomer and his horse are (eomer.py, the
reference rider): the warg has bones of its own (mount_..., with a jaw that bites) and his hips hang
from its body. His clips are the library's mounted ones: the warg stands breathing, lopes low with
its back rocking, a bound a hex, tosses its head as he cuts down with his blade, bites for his cast
(Warg bite), hangs its head and sways when stunned, goes down with him and rears when they win. To bend,
the warg's legs are each three parts and his jerkin two, split at rings they already had, so they
cost no triangles, and the warg's fangs and fur are split between the bones they follow.

His fittings, the cap's brow band, the blade's guard and pommel, the bands at the top of his bracers
and the ring his rein is tied to at the warg's throat, use `trim`, which the client colours iron,
silver or gold by star level (docs/viewer-spec.md section 4, "Star levels"). His 2★ model is
sharku-2.py, which imports this script and builds him and the warg with its round black shield
strapped to his rein arm (build()), and his 3★ model sharku-3.py.

    blender --background --factory-startup --python-exit-code 1 --python sharku.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from clips import tweened  # noqa: E402
from kit import (  # noqa: E402
    BOOTS,
    CLOTH,
    EYES,
    LEATHER,
    MOUNTED_BUDGET,
    STEEL,
    V,
    bone,
    box,
    cone,
    ellipse,
    finish,
    loft,
    material,
    nearest_on_polyline,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    trim_material,
    tube,
    wind,
)
from beasts import neck_centre, new_objects, turned, warg  # noqa: E402
from rig import Rig, hold, joint  # noqa: E402

# Sharku's own colours (sRGB); the rest come from the kit.
SKIN = 0x7E7A5A  # sallow, olive-grey, as Gorbag's
HAIR = 0x25201C  # coarse and black
IRON = 0x5D6166  # crude, blackened iron
BONE = 0xD5CAA8  # his tusks and the warg's fangs
FUR = 0x766F63  # the warg's coat, grizzled grey-brown
DARK_FUR = 0x3A3531  # its hackles, the line of its back and the tip of its tail
PALE_FUR = 0xA69D8A  # its throat, jaw and belly
GLARE = 0xC4AA62  # its pale amber eyes

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.95),
        iron=material('iron', IRON, roughness=0.6, metallic=0.1),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        cloth=material('cloth', CLOTH, roughness=0.9),
        bone=material('bone', BONE, roughness=0.7),
        eyes=material('eyes', EYES, roughness=0.6),
        fur=material('fur', FUR, roughness=0.95),
        dark_fur=material('dark-fur', DARK_FUR, roughness=0.95),
        pale_fur=material('pale-fur', PALE_FUR, roughness=0.95),
        glare=material('warg-eyes', GLARE, roughness=0.5),
        trim=trim_material(),  # fittings, recoloured by star
    )


# Helpers -----------------------------------------------------------------------------------------


def bend(root, end, upper, lower, pole):
    """The middle joint of a limb from root to end, its bones upper and lower long, bent towards pole."""
    root, end, pole = Vector(root), Vector(end), Vector(pole)
    axis = end - root
    reach = min(axis.length, upper + lower - 1e-3)
    axis.normalize()
    along = (upper * upper - lower * lower + reach * reach) / (2 * reach)
    out = math.sqrt(max(upper * upper - along * along, 0.0))
    side = pole - root
    side = (side - side.dot(axis) * axis).normalized()
    return root + along * axis + out * side


# The rider -----------------------------------------------------------------------------------------
#
# Built upright astride the warg and then bent by hunched(): he leans forward about his hips, and
# above the small of his back his spine curls further, so his shoulders round over the warg's neck
# and his head comes out of the front of them.

PIVOT = V(0, 0.05, 0.68)  # his hips
LEAN = 26  # degrees the body above the hips leans forward
MID = V(0, 0.06, 0.84)  # the small of his back
CURL = 20  # further degrees his shoulders curl forward over it
CURL_SPAN = 0.2  # the height over which the curl comes in
ROLL = -12  # degrees he leans out to his right, his blade side, clear of the warg's head


def hunched(p):
    """Where a point of the upright body is once he leans and curls forward and out to his right."""
    p = Vector(p)
    t = min(max((p.z - MID.z) / CURL_SPAN, 0.0), 1.0)
    if t > 0:
        p = MID + Matrix.Rotation(math.radians(CURL * t), 3, 'X') @ (p - MID)
    p = PIVOT + Matrix.Rotation(math.radians(LEAN), 3, 'X') @ (p - PIVOT)
    return PIVOT + Matrix.Rotation(math.radians(ROLL), 3, 'Y') @ (p - PIVOT)


def hunch(objects):
    for obj in objects:
        for v in obj.data.vertices:
            v.co = hunched(v.co)


# A barrel of octagons, built upright: z, half-width, half-depth and centre y. He sits on the cloth,
# whose top is at about 0.63 under him.
# It is in two pieces, which bend at the belt: the breeches and the belt on his hips, and the jerkin
# on his spine, from a ring inside the belt (WAIST) up to his neck.
TORSO = [
    (0.63, 0.14, 0.115, 0.05),  # in the saddle, round the hips
    (0.71, 0.15, 0.12, 0.05),  # belt, lower edge
    (0.77, 0.155, 0.125, 0.05),  # belt, upper edge
]
CHEST = [
    (0.735, 0.14, 0.11, 0.05),  # inside the belt
    (0.90, 0.2, 0.145, 0.05),  # chest
    (1.02, 0.21, 0.14, 0.07),  # shoulders
    (1.10, 0.11, 0.10, 0.04),  # neck
]
TORSO_BANDS = [0, 1]  # breeches, belt
PELVIS_Y = 0.05


def torso():
    mats = [M['cloth'], M['boots'], M['leather'], M['skin']]

    def inside(c):
        return V(0, 0.05, min(max(c.z, 0.66), 1.06))

    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    with bone('hips'):
        part('breeches', verts, wind(verts, faces, inside=inside), mats, [TORSO_BANDS[b] for b in bands])
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in CHEST]
    verts, faces, bands = loft(rings)
    faces = wind(verts, faces, inside=inside)
    top = tuple(range(len(verts) - 8, len(verts)))  # the top of the neck
    faces += wind(verts, [top], outward=V(0, 0, 1))
    with bone('spine'):
        part('jerkin', verts, faces, mats, [2] * len(bands) + [3])
    joint('pelvis', PIVOT)
    joint('waist', V(0, PELVIS_Y, 0.76))
    joint('neck', V(0, 0.04, 1.08))


def cloak():
    with bone('spine'):
        rags()


def rags():
    # A ragged cloak round his neck and over his shoulders, as Gorbag's cowl: eight points from his
    # left (+X), the collar rising behind his neck and dipping in front; rags hang from the hem,
    # longest down his back, where they stream out behind him.
    collar_z = [1.12, 1.16, 1.18, 1.16, 1.12, 1.07, 1.05, 1.07]
    collar = ellipse(0, 0.04, 0, 0.135, 0.125, 8, 0, collar_z)
    dome = ellipse(0, 0.06, 0, 0.225, 0.175, 8, 0, [z - 0.06 for z in collar_z])
    shoulder_z = [1.02, 1.0, 0.98, 1.0, 1.02, 1.01, 1.0, 1.01]
    shoulder = ellipse(0, 0.07, 0, 0.25, 0.19, 8, 0, shoulder_z)
    hem_drop = [0.05, 0.08, 0.09, 0.08, 0.05, 0.07, 0.09, 0.07]
    hem = ellipse(0, 0.07, 0, 0.245, 0.195, 8, 0, [z - d for z, d in zip(shoulder_z, hem_drop)])
    verts, faces, _ = loft([hem, shoulder, dome, collar])
    drops = [0.1, 0.15, 0.17, 0.15, 0.1, 0.17, 0.2, 0.16]
    for i in range(8):
        a, b = hem[i], hem[(i + 1) % 8]
        mid = (a + b) / 2
        out = V(mid.x, mid.y - 0.07, 0).normalized()
        verts.append(mid + 0.02 * out - V(0, 0, drops[i]))
        faces.append((i, (i + 1) % 8, len(verts) - 1))
    part('cloak', verts, faces, M['team'], inside=lambda c: V(0, 0.06, min(c.z, 1.0) - 0.1))


# Head: Gorbag's, under a pointed iron cap ------------------------------------------------------------

HEAD_SCALE = 1.1  # the head is drawn big, as Gimli's is, so it reads at game size

# The skull in rings from under the jaw to the temples: the height of each above the head's origin,
# then the left half of it as (x, y): the side, the back corner, the back, the front corner and the
# front. As Gorbag's.
SKULL = [
    (0.0, (0.132, -0.03), (0.08, 0.055), 0.07, (0.116, -0.158), -0.2),  # under the jaw, jutting
    (0.075, (0.15, -0.005), (0.105, 0.09), 0.115, (0.128, -0.15), -0.182),  # the mouth
    (0.165, (0.142, 0.005), (0.11, 0.105), 0.135, (0.118, -0.115), -0.152),  # cheekbones and eyes
    (0.245, (0.118, 0.015), (0.092, 0.105), 0.13, (0.088, -0.08), -0.1),  # brow and temples
]


def head_origin():
    """The middle of the underside of his jaw, out in front of his hunched neck."""
    return hunched(V(0, 0.0, 1.1)) + V(0, -0.07, -0.05)


def head():
    with bone('head'):
        face()
    joint('crown', head_origin() + HEAD_SCALE * V(0, 0.03, 0.42))


def face():
    origin = head_origin()

    def h(x, y, z):
        return origin + HEAD_SCALE * V(x, y, z)

    rings = []
    for z, side, corner, back, front_corner, front in SKULL:
        ring = [side, corner, (0, back), (-corner[0], corner[1]), (-side[0], side[1]),
                (-front_corner[0], front_corner[1]), (0, front), front_corner]
        rings.append([h(x, y, z) for x, y in ring])
    verts, faces, bands = loft(rings)
    # Olive skin, with a mane of coarse black hair round the back under the cap.
    face_mats = [1 if b > 0 and i % 8 < 4 else 0 for i, b in enumerate(bands)]
    faces.append(tuple(range(8)))  # under the jaw
    face_mats.append(0)
    part('skull', verts, faces, [M['skin'], M['hair']], face_mats, inside=h(0, -0.03, 0.14))

    def front(band):
        tris = []
        for i in (4, 5, 6, 7):
            a, b = rings[band][i], rings[band][(i + 1) % 8]
            c, d = rings[band + 1][(i + 1) % 8], rings[band + 1][i]
            tris += [(a, b, c), (a, c, d)]
        return tris

    face, jaw = front(1), front(0)

    def on(tris, x, z, lift):
        p = h(x, 0, z)
        return V(p.x, on_surface(tris, p.x, p.z) - lift, p.z)

    # Slanted eyes under the brow.
    for s in (-1, 1):
        corners = [on(face, x, z, 0.006) for x, z in ((s * 0.03, 0.127), (s * 0.1, 0.152), (s * 0.07, 0.116))]
        part(f'eye-{s}', corners, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A heavy shelf of brow under the rim of the cap, dipping in the middle in a scowl.
    sections = [
        [h(-0.118, -0.05, 0.2), h(-0.118, -0.125, 0.183), h(-0.118, -0.07, 0.158)],
        [h(0, -0.13, 0.195), h(0, -0.2, 0.165), h(0, -0.155, 0.14)],
        [h(0.118, -0.05, 0.2), h(0.118, -0.125, 0.183), h(0.118, -0.07, 0.158)],
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brow', verts, faces, M['skin'], inside=h(0, -0.09, 0.17))

    # A flat, broad nose.
    verts = [h(0, -0.156, 0.138), h(0, -0.218, 0.095), h(0.046, -0.165, 0.086), h(-0.046, -0.165, 0.086),
             h(0, -0.178, 0.076)]
    part('nose', verts, [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)], M['skin'], inside=h(0, -0.14, 0.1))

    # A wide mouth, open in a snarl.
    outline = [(0.096, 0.045), (0.04, 0.068), (-0.04, 0.068), (-0.096, 0.045), (-0.04, 0.03), (0.04, 0.03)]
    verts = [on(jaw, x, z, 0.005) for x, z in outline]
    part('mouth', verts, [(0, 1, 5), (1, 2, 4, 5), (2, 3, 4)], M['eyes'], outward=V(0, -1, 0))

    # Tusks from the lower jaw, up past the lip.
    for s in (-1, 1):
        x = s * 0.085
        base = on(jaw, x, 0.03, 0.0)
        y = (base.y - origin.y) / HEAD_SCALE
        verts = [h(x - 0.028, y + 0.008, 0.018), h(x + 0.028, y + 0.008, 0.018), h(x, y + 0.04, 0.014),
                 h(x + s * 0.035, y - 0.05, 0.16)]
        part(f'tusk-{s}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['bone'], inside=h(x, y + 0.01, 0.05))

    # Big pointed ears out under the cap, swept back by the wind of his riding.
    for s in (-1, 1):
        verts = [h(s * 0.128, -0.035, 0.11), h(s * 0.122, 0.07, 0.13), h(s * 0.115, 0.02, 0.2),
                 h(s * 0.32, 0.17, 0.26)]
        part(f'ear-{s}', verts, [(0, 2, 3), (2, 1, 3), (1, 0, 3)], M['skin'], inside=h(s * 0.1, 0.02, 0.15))

    # A pointed cap of crude iron: a metal band round his brow and eight facets up to a point.
    profile = [(0.175, 0.165), (0.225, 0.165), (0.23, 0.15), (0.3, 0.115)]
    rings = [[h(p.x, p.y + 0.015, z) for p in ellipse(0, 0, 0, r, r, 8, 22.5)] for z, r in profile]
    verts, faces, bands = loft(rings)
    face_mats = [1 if b == 0 else 0 for b in bands]
    verts.append(h(0, 0.03, 0.42))
    last = (len(profile) - 1) * 8
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    face_mats += [0] * 8
    part('cap', verts, faces, [M['iron'], M['trim']], face_mats, inside=h(0, 0.015, 0.25))


# Arms ------------------------------------------------------------------------------------------------

UPPER_ARM, FOREARM = 0.27, 0.28  # long arms, as orcs have


def arm(side, shoulder, fist, pole, fist_up):
    """An arm from the shoulder to a fist at `fist`, its elbow bent towards `pole`."""
    s = side[0]
    reach = (fist - shoulder).normalized()
    elbow = bend(shoulder, fist - 0.05 * reach, UPPER_ARM, FOREARM, pole)
    wrist = fist - 0.05 * (fist - elbow).normalized()
    with bone(f'upper_arm_{s}'):
        tube(f'upper-arm-{side}', shoulder, elbow, [(-0.1, 0.07), (1.08, 0.058)], M['skin'])
    with bone(f'forearm_{s}'):
        tube(f'forearm-{side}', elbow, wrist, [(-0.12, 0.056), (0.4, 0.064), (1.0, 0.058)],
             [M['skin'], M['iron']], [0, 1])
        # A metal band round the top of the iron bracer.
        tube(f'bracer-band-{side}', elbow, wrist, [(0.4, 0.071), (0.52, 0.07)], M['trim'])
    ahead = (fist - elbow).normalized()
    up = (Vector(fist_up) - Vector(fist_up).dot(ahead) * ahead).normalized()
    with bone(f'hand_{s}'):
        box(f'fist-{side}', fist, [ahead, up, ahead.cross(up)], (0.046, 0.05, 0.05), M['skin'], 0.85)
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)
    joint(f'fist_{s}', fist)


# The blade, raised in his right fist: broad, single-edged and curved back towards a clipped point.
BLADE_FIST = V(-0.4, -0.2, 1.15)
BLADE_UP = V(-0.2, 0.05, 1.0).normalized()  # up the blade from the fist, leaning out to his right
BLADE_EDGE = V(-1.0, -0.3, 0.0)  # the way the edge faces: out to his right and a little forward


def blade():
    with bone('hand_r'):
        point, edge = blade_parts()
    # Held by the grip, its point up the blade and its edge out to his right.
    hold('r', BLADE_FIST, point, point + 0.1 * edge)


def blade_parts():
    along = BLADE_UP
    edge = (BLADE_EDGE - BLADE_EDGE.dot(along) * along).normalized()
    flat = along.cross(edge)
    # Stations up the blade: how far from the fist, how far the middle bows back, its width and the
    # thickness of its back.
    stations = [(0.07, 0.0, 0.052, 0.012), (0.2, -0.012, 0.064, 0.011), (0.33, -0.035, 0.08, 0.01),
                (0.45, -0.07, 0.094, 0.008)]
    rings = []
    for d, bow, width, thick in stations:
        c = BLADE_FIST + d * along + bow * edge
        rings.append([c + 0.5 * width * edge, c - 0.5 * width * edge + thick * flat,
                      c - 0.5 * width * edge - thick * flat])
    verts, faces, _ = loft(rings)
    point = BLADE_FIST + 0.57 * along - 0.13 * edge
    verts.append(point)
    last = (len(rings) - 1) * 3
    faces += [(last + i, last + (i + 1) % 3, len(verts) - 1) for i in range(3)]
    faces.append((0, 1, 2))
    axis = [BLADE_FIST + d * along + bow * edge for d, bow, _, _ in stations] + [point]
    part('blade', verts, faces, M['steel'], inside=nearest_on_polyline(axis))
    # A metal guard across the foot of the blade, and a pommel under his fist.
    box('guard', BLADE_FIST + 0.06 * along, [along, edge, flat], (0.012, 0.055, 0.022), M['trim'])
    cone('pommel', BLADE_FIST - 0.05 * along, BLADE_FIST - 0.1 * along, 0.03, M['trim'], n=4)
    return point, edge


REIN_FIST = V(0.1, -0.33, 0.76)  # his left fist, low over the warg's withers


def arms(mount):
    left, right = hunched(V(0.2, 0.07, 0.99)), hunched(V(-0.2, 0.07, 0.99))
    # The blade arm raised, the elbow out to his right and down.
    arm('right', right, BLADE_FIST, right + V(-0.3, 0.1, -0.15), BLADE_UP)
    # The rein hand low over the warg's withers, the elbow out to his left.
    arm('left', left, REIN_FIST, left + V(0.3, 0.1, -0.2), V(0, -0.3, 1))
    # The rein, a leather strap from his fist over the ruff to the rag round the warg's throat: the
    # end in his fist follows it, the rest the warg's neck.
    width = V(0, 0, 0.013)
    held = REIN_FIST + V(0, -0.04, 0)
    path = [held, (REIN_FIST + mount.knot) / 2 + V(0, 0, 0.03), mount.knot]
    verts = [p + width for p in path] + [p - width for p in path]
    with bone('mount_neck', follows=lambda p: 'hand_l' if (p - held).length < 0.02 else None):
        part('rein', verts, [(0, 1, 4, 3), (1, 2, 5, 4)], M['leather'], outward=V(1, 0, 0))
    rein_ring(mount.knot)


def rein_ring(knot):
    """The metal ring the rein is tied to, lying flat on the rag round the warg's throat."""
    out = (knot - turned(neck_centre(1).lerp(neck_centre(2), 0.5))).normalized()
    at = knot + 0.008 * out
    outer, inner = (segment(at - 0.01 * out, at + 0.01 * out, [(0.5, r)], 6, 30)[0] for r in (0.036, 0.021))
    faces = [(i, (i + 1) % 6, 6 + (i + 1) % 6, 6 + i) for i in range(6)]
    with bone('mount_neck'):  # with the rag round the throat, and the rein's end on it
        part('rein-ring', outer + inner, faces, M['trim'], outward=out)


# Legs astride the warg: thighs forward and down over its flanks, knees gripping, feet tucked back.
HIP, KNEE, ANKLE = V(0.1, 0.05, 0.68), V(0.285, -0.12, 0.52), V(0.26, 0.05, 0.36)


def legs():
    for s in (-1, 1):
        flip = V(s, 1, 1)
        side = 'l' if s > 0 else 'r'
        hip, knee, ankle = (Vector(p * flip) for p in (HIP, KNEE, ANKLE))
        with bone(f'thigh_{side}'):
            tube(f'thigh-{s}', hip, knee, [(-0.1, 0.08), (1.1, 0.064)], M['cloth'])
        with bone(f'shin_{side}'):
            tube(f'shin-{s}', knee, ankle, [(-0.1, 0.058), (1.15, 0.05)], M['skin'])
            # A crude iron cop over the knee, which hides the joint.
            out = V(s * 0.6, -1, 0.1).normalized()
            base = segment(knee, knee + out, [(0, 0.06)], 4, 45)[0]
            part(f'knee-{s}', base + [knee + 0.085 * out], [(i, (i + 1) % 4, 4) for i in range(4)], M['iron'],
                 inside=knee)
        axes = [V(s * 0.1, -1, -0.35), V(1, 0, 0), V(0, 0, 1)]
        heel = ankle + V(0, -0.05, -0.03)
        with bone(f'foot_{side}'):
            box(f'foot-{s}', heel, axes, (0.085, 0.045, 0.042), M['boots'], 0.75)
        joint(f'hip_{side}', hip)
        joint(f'knee_{side}', knee)
        joint(f'ankle_{side}', ankle)
        joint(f'toe_{side}', heel + 0.085 * Vector(axes[0]).normalized())


# His clips (../clips.py), the library's mounted ones, the warg's run a low, bounding lope and his cast
# the warg's bite. As his cut comes over the top the blade is turned in across his front and further
# down (across, early), so it passes level pointing ahead rather than out past his hex between frames.
# The victory's rear takes 1.0 s rather than the style's 1.2, so the warg is down and standing by the
# time the fight's playback stops, 1 s after the end.
CLIPS = tweened({
    'idle': ('saddle', {}),
    'move': ('gallop', {'bound': 1.0, 'lean': 4.0, 'carry': 0.0, 'tail': -14.0}),
    'attack': ('cut', {'across': 40.0, 'early': 15.0}),
    'cast': ('bite', {}),
    'stun': ('reel', {}),
    'death': ('fall', {}),
    'victory': ('rear', {'rear': 0.6, 'seconds': 1.0}),
})


def build(shield=None):
    """Makes him and the warg in a fresh scene, every part bound to its bone and the joints marked,
    and returns the rig to finish() them with. His 2★ model (sharku-2.py) passes its shield as
    `shield`, a function that makes it on his rein arm, after his arms."""
    reset()
    make_materials()
    mount = warg(M)
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    cloak()
    hunch(new_objects(before))
    head()
    blade()
    arms(mount)
    if shield is not None:
        shield()
    return Rig(kind='mounted', mount=mount.rig, clips=CLIPS)


def main():
    finish('sharku', budget=MOUNTED_BUDGET, rig=build())


if __name__ == '__main__':
    main()
