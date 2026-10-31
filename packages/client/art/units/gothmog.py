"""Gothmog, the lieutenant of Minas Morgul: an Orc Captain, in the Faceted style (docs/viewer-spec.md
section 4).

Of Gorbag's people (gorbag.py), the Orcs of Morgul, with their sallow olive skin, big pointed ears,
heavy tusked jaw and black mane, but a warlord: bigger, and upright where they stoop, about 1.35 to
the top of his helm, with long arms, bowed legs and his head thrust forward on a bull neck. He is
armoured in black iron: a ridged cuirass over a skirt of plates, spiked pauldrons, greaves and spiked
knee-cops, and a round iron helm with a crest of spikes. He is a Captain: in his left hand the
war-banner of Morgul, planted beside him, and in his right a heavy cleaver raised to drive the Orcs
on. The team colour is the banner, which bears the sign of Morgul on both faces, a pale moon with a
death's face; the ragged mantle round his neck, under his pauldrons and down his back; and the ragged
tabard hanging from his belt.

    blender --background --factory-startup --python-exit-code 1 --python gothmog.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOTS,
    CLOTH,
    EYES,
    LEATHER,
    STEEL,
    V,
    box,
    cone,
    ellipse,
    finish,
    lean,
    loft,
    material,
    on_surface,
    part,
    reset,
    team_material,
    tube,
    turn,
    wind,
)

# Gothmog's own colours (sRGB); the rest come from the kit. His skin, hair and bone are his people's,
# as Gorbag has them.
SKIN = 0x7E7A5A  # sallow, olive-grey
HAIR = 0x25201C  # coarse and black
IRON = 0x56595F  # black iron, a dark grey so its facets still show
BONE = 0xD5CAA8  # his tusks, and the moon on his banner
POLE = 0x4F3B2A  # the banner's pole, dark with age and smoke

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.95),
        iron=material('iron', IRON, roughness=0.55, metallic=0.12),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        cloth=material('cloth', CLOTH, roughness=0.9),
        bone=material('bone', BONE, roughness=0.7),
        wood=material('wood', POLE, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
    )


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o not in before]


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


# The body above the hips is built upright and leans a little forward about them, into the fight.
PIVOT = V(0, 0.03, 0.5)
LEAN = 6


def leaned(p):
    """Where a point of the upright body is once he leans."""
    return PIVOT + Matrix.Rotation(math.radians(LEAN), 3, 'X') @ (Vector(p) - PIVOT)


# Legs: bowed, the knees out, the left foot forward by the banner and the right braced behind --------

R_HIP, R_KNEE, R_ANKLE, R_YAW = V(-0.11, 0.06, 0.5), V(-0.25, 0.03, 0.29), V(-0.215, 0.11, 0.1), -24
L_HIP, L_KNEE, L_ANKLE, L_YAW = V(0.11, 0.0, 0.5), V(0.25, -0.1, 0.3), V(0.2, -0.08, 0.1), 16

# Heavy boots from the sole up, in the foot's own frame (toes towards -y): the height of each ring and
# the right half of it, side, heel and toe, mirrored by boot().
BOOT_RINGS = [
    (0.0, [(0.095, -0.02), (0.08, 0.09), (0.062, -0.178)]),  # the sole
    (0.065, [(0.095, -0.01), (0.082, 0.085), (0.054, -0.136)]),  # the toe rises to a blunt point
    (0.16, [(0.08, 0.0), (0.072, 0.075), (0.06, -0.055)]),  # round the ankle
]


def boot(name, ankle, yaw):
    spin = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in BOOT_RINGS]
    rings = [[at + spin @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    part(name, verts, faces, M['boots'], inside=at + V(0, 0, 0.07))


def legs():
    for side, hip, knee, ankle, yaw in (('right', R_HIP, R_KNEE, R_ANKLE, R_YAW),
                                        ('left', L_HIP, L_KNEE, L_ANKLE, L_YAW)):
        tube(f'thigh-{side}', hip, knee, [(-0.1, 0.1), (1.1, 0.078)], M['cloth'])
        tube(f'greave-{side}', knee, ankle, [(-0.1, 0.072), (1.3, 0.062)], M['iron'])
        boot(f'boot-{side}', ankle, yaw)
        # An iron cop over the knee that ends in a spike, pointing out of the bend and forward.
        forward = knee - (hip + ankle) / 2
        forward = V(forward.x, forward.y - 0.1, 0).normalized()
        cone(f'knee-{side}', knee, knee + 0.14 * forward + V(0, 0, 0.02), 0.075, M['iron'], n=4, phase=45,
             back=None)


# Body --------------------------------------------------------------------------------------------

# A barrel of octagons with a ridge down the front, built upright: z, half-width, half-depth and
# centre y. A skirt of iron plates over the hips, the belt, the cuirass and a bull neck.
TORSO = [
    (0.37, 0.255, 0.205, 0.02),  # the skirt's hem, flared over the thighs
    (0.5, 0.205, 0.158, 0.02),  # hips
    (0.55, 0.208, 0.162, 0.02),  # belt, lower edge
    (0.62, 0.218, 0.168, 0.02),  # belt, upper edge
    (0.77, 0.278, 0.198, 0.02),  # chest
    (0.92, 0.282, 0.182, 0.04),  # shoulders
    (1.0, 0.13, 0.12, 0.01),  # neck
]
TORSO_BANDS = [0, 1, 2, 0, 0, 0]  # iron, except the breeches over the hips and the belt
SKIRT_DIP = 0.04  # every other point of the skirt's hem hangs lower, so it reads as plates


def torso():
    rings = []
    for k, (z, rx, ry, cy) in enumerate(TORSO):
        zs = [z - (SKIRT_DIP if i % 2 else 0) for i in range(8)] if k == 0 else None
        rings.append(ellipse(0, cy, z, rx, ry, 8, 0, zs))
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    faces.append(tuple(range(len(verts) - 8, len(verts))))  # the top of the neck
    face_mats.append(3)
    mats = [M['iron'], M['cloth'], M['leather'], M['skin']]
    part('torso', verts, faces, mats, face_mats, inside=lambda c: V(0, 0.02, min(max(c.z, 0.42), 0.95)))


SHOULDERS = {s: V(s * 0.29, 0.035, 0.9) for s in (-1, 1)}  # the middle of each pauldron, upright


def pauldron(s):
    # A shell of iron over the shoulder in rings of six, tipped out, with two spikes: one standing up
    # and out from its crown, and one out from its side.
    tip = Matrix.Rotation(math.radians(s * 28), 3, 'Y')
    c = SHOULDERS[s]

    def at(x, y, z):
        return c + tip @ V(x, y, z)

    rim = [at(0.19 * math.cos(a), 0.185 * math.sin(a), -0.075) for a in (math.tau * i / 6 for i in range(6))]
    dome = [at(0.162 * math.cos(a), 0.158 * math.sin(a), 0.04) for a in (math.tau * i / 6 for i in range(6))]
    verts, faces, _ = loft([rim, dome])
    verts.append(at(0, 0, 0.095))
    faces += [(6 + i, 6 + (i + 1) % 6, 12) for i in range(6)]
    part(f'pauldron-{s}', verts, faces, M['iron'], inside=at(0, 0, -0.08))
    cone(f'spike-up-{s}', at(0.03, 0, 0.07), at(0.11, 0.0, 0.27), 0.045, M['iron'], n=4, back=None)
    cone(f'spike-out-{s}', at(0.14, 0, 0.0), at(0.31, 0.0, 0.04), 0.04, M['iron'], n=4, back=None)


def mantle():
    # A short, ragged cape of the team colour round his neck and over his shoulders, under the
    # pauldrons: eight points from his left (+X), the collar rising behind his neck, the hem short over
    # his chest and long down his back, where it hangs in rags.
    collar_z = [1.0, 1.03, 1.05, 1.03, 1.0, 0.97, 0.955, 0.97]
    collar = ellipse(0, 0.01, 0, 0.152, 0.142, 8, 0, collar_z)
    dome = ellipse(0, 0.025, 0, 0.27, 0.205, 8, 0, [z - 0.065 for z in collar_z])
    hem_z = [0.8, 0.7, 0.64, 0.7, 0.8, 0.84, 0.82, 0.84]
    hem = ellipse(0, 0.02, 0, 0.3, 0.25, 8, 0, hem_z)
    verts, faces, _ = loft([hem, dome, collar])
    drops = [0.1, 0.16, 0.19, 0.13, 0.06, 0.08, 0.07, 0.06]
    for i in range(8):
        a, b = hem[i], hem[(i + 1) % 8]
        mid = (a + b) / 2
        out = V(mid.x, mid.y - 0.02, 0).normalized()
        verts.append(mid + 0.012 * out - V(0, 0, drops[i]))
        faces.append((i, (i + 1) % 8, len(verts) - 1))
    part('mantle', verts, faces, M['team'], inside=lambda c: V(0, 0.02, min(c.z, 0.9) - 0.12))


TABARD_Z = 0.565  # the height of the top of the tabard, tucked under the belt


def tabard():
    # A ragged tabard hanging from his belt in front to below his knees. Its top follows the ridge
    # down the front of the belt, and it falls straight down from there, keeping the fold.
    columns = (-0.135, -0.045, 0.045, 0.135)
    z, rx, ry, cy = TABARD_Z, 0.21, 0.163, 0.02  # the belt's octagon at that height
    slope = (1 - math.sqrt(0.5)) * ry / (math.sqrt(0.5) * rx)  # how its front faces run back to the sides
    top = [leaned(V(x, cy - ry - 0.012 + slope * abs(x), z)) for x in columns]
    rows = [top, [V(0.96 * p.x, p.y - 0.035, 0.38) for p in top]]
    hem = [0.2, 0.26, 0.18, 0.24]
    rows.append([V(0.9 * p.x, p.y - 0.035, z) for p, z in zip(top, hem)])
    verts, faces, _ = loft(rows, closed=False)
    part('tabard', verts, faces, M['team'], outward=V(0, -1, 0))


# Head ----------------------------------------------------------------------------------------------

HEAD = V(0, -0.11, 0.955)  # the middle of the underside of his jaw
HEAD_SCALE = 1.12  # the head is drawn big, as Gimli's is, so it reads at game size
HEAD_PITCH = 10  # degrees his head tips back, his chin up as he roars, so his face shows from above

# The skull in rings from under the jaw to the brow, as Gorbag's: the height of each above HEAD, then
# the left half of it from HEAD as (x, y): the side, the back corner, the back, the front corner and
# the front. The helm covers it from the brow up.
SKULL = [
    (0.0, (0.14, -0.03), (0.085, 0.055), 0.07, (0.122, -0.165), -0.21),  # under the jaw, jutting
    (0.075, (0.155, -0.005), (0.108, 0.09), 0.115, (0.132, -0.152), -0.188),  # the mouth
    (0.165, (0.142, 0.005), (0.11, 0.105), 0.135, (0.118, -0.115), -0.152),  # cheekbones and eyes
    (0.245, (0.118, 0.015), (0.092, 0.105), 0.13, (0.088, -0.08), -0.1),  # brow and temples
]


def h(x, y, z):
    """A point of the head, from HEAD in the head's own (unscaled) measure."""
    return HEAD + HEAD_SCALE * V(x, y, z)


def head():
    rings = []
    for z, side, corner, back, front_corner, front in SKULL:
        ring = [side, corner, (0, back), (-corner[0], corner[1]), (-side[0], side[1]),
                (-front_corner[0], front_corner[1]), (0, front), front_corner]
        rings.append([h(x, y, z) for x, y in ring])
    verts, faces, bands = loft(rings)
    # Olive skin, with a mane of coarse black hair round the back under the helm.
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
        """A point of the head at (x, z) laid `lift` proud of the surface `tris`."""
        p = h(x, 0, z)
        return V(p.x, on_surface(tris, p.x, p.z) - lift, p.z)

    # Slanted eyes under the brow.
    for s in (-1, 1):
        corners = [on(face, x, z, 0.006) for x, z in ((s * 0.03, 0.125), (s * 0.1, 0.15), (s * 0.07, 0.112))]
        part(f'eye-{s}', corners, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A heavy shelf of brow, dipping in the middle in a scowl, under the rim of the helm.
    sections = [
        [h(-0.122, -0.05, 0.205), h(-0.122, -0.13, 0.185), h(-0.122, -0.07, 0.158)],
        [h(0, -0.13, 0.2), h(0, -0.205, 0.165), h(0, -0.155, 0.138)],
        [h(0.122, -0.05, 0.205), h(0.122, -0.13, 0.185), h(0.122, -0.07, 0.158)],
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brow', verts, faces, M['skin'], inside=h(0, -0.09, 0.17))

    # A flat, broad nose.
    verts = [h(0, -0.156, 0.136), h(0, -0.222, 0.092), h(0.048, -0.166, 0.084), h(-0.048, -0.166, 0.084),
             h(0, -0.18, 0.074)]
    faces = [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)]
    part('nose', verts, faces, M['skin'], inside=h(0, -0.14, 0.1))

    # A wide mouth open in a roar, turned down at the corners: the top edge, from his left corner to
    # his right, then the bottom edge back. It has points on the ridge down the middle of the jaw, so
    # it lies on the jaw's faces rather than cutting under the ridge.
    outline = [(0.105, 0.046), (0.05, 0.068), (0, 0.072), (-0.05, 0.068), (-0.105, 0.046), (-0.05, 0.022),
               (0, 0.018), (0.05, 0.022)]
    verts = [on(jaw, x, z, 0.005) for x, z in outline]
    faces = [(0, 1, 7), (1, 2, 6, 7), (2, 3, 5, 6), (3, 4, 5)]
    part('mouth', verts, faces, M['eyes'], outward=V(0, -1, 0))

    # Tusks from the lower jaw at the corners of his mouth, up past the lip.
    for s in (-1, 1):
        x = s * 0.085
        base = on(jaw, x, 0.03, 0.0)
        y = (base.y - HEAD.y) / HEAD_SCALE
        verts = [h(x - 0.03, y + 0.01, 0.012), h(x + 0.03, y + 0.01, 0.012), h(x, y + 0.045, 0.008),
                 h(x + s * 0.03, y - 0.05, 0.165)]
        part(f'tusk-{s}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['bone'], inside=h(x, y + 0.01, 0.05))

    # Big pointed ears from under the helm, swept back and up.
    for s in (-1, 1):
        verts = [h(s * 0.13, -0.04, 0.09), h(s * 0.124, 0.075, 0.115), h(s * 0.12, 0.02, 0.2),
                 h(s * 0.37, 0.12, 0.3)]
        part(f'ear-{s}', verts, [(0, 2, 3), (2, 1, 3), (1, 0, 3)], M['skin'], inside=h(s * 0.1, 0.02, 0.15))


# The helm: a round cap of black iron in rings of eight, a ridge down its middle, over the skull from
# the brow up. Each ring: the height above HEAD, its half-width, half-depth and centre y.
HELM = [
    (0.185, 0.168, 0.168, 0.01),  # the rim, over the brow
    (0.235, 0.17, 0.17, 0.01),  # the top of the brow-band
    (0.315, 0.128, 0.135, 0.015),  # the crown
]
HELM_TOP = (0, 0.02, 0.36)
CREST = [  # spikes along the ridge, from front to back: where each stands and its tip
    ((0, -0.08, 0.32), (0, -0.06, 0.43)),
    ((0, 0.02, 0.335), (0, 0.07, 0.53)),
    ((0, 0.11, 0.32), (0, 0.2, 0.43)),
]


def helm():
    rings = [[h(p.x, p.y, z) for p in ellipse(0, cy, 0, rx, ry, 8, 0)] for z, rx, ry, cy in HELM]
    verts, faces, _ = loft(rings)
    apex = len(verts)
    verts.append(h(*HELM_TOP))
    last = (len(HELM) - 1) * 8
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    part('helm', verts, faces, M['iron'], inside=h(0, 0.01, 0.2))
    for k, (base, tip) in enumerate(CREST):
        cone(f'crest-{k}', h(*base), h(*tip), 0.03 * HEAD_SCALE, M['iron'], n=4, back=None)


# Arms ----------------------------------------------------------------------------------------------

UPPER_ARM, FOREARM = 0.28, 0.29  # long arms, as orcs have


def arm(side, shoulder, fist, pole, grip):
    """An arm from the shoulder to a fist at `fist` closed round a grip along `grip`, the elbow bent
    towards `pole`: bare, with an iron vambrace on the forearm."""
    reach = (fist - shoulder).normalized()
    elbow = bend(shoulder, fist - 0.05 * reach, UPPER_ARM, FOREARM, pole)
    wrist = fist - 0.05 * (fist - elbow).normalized()
    tube(f'upper-arm-{side}', shoulder, elbow, [(-0.1, 0.08), (1.08, 0.066)], M['skin'])
    tube(f'forearm-{side}', elbow, wrist, [(-0.12, 0.064), (0.35, 0.076), (1.0, 0.068)],
         [M['skin'], M['iron']], [0, 1])
    ahead = (fist - elbow).normalized()
    up = (Vector(grip) - Vector(grip).dot(ahead) * ahead).normalized()
    box(f'fist-{side}', fist, [ahead, up, ahead.cross(up)], (0.052, 0.058, 0.056), M['skin'], 0.85)
    # A spiked iron cop on the point of the elbow, out of the bend.
    point = ((elbow - shoulder).normalized() + (elbow - wrist).normalized()).normalized()
    cone(f'elbow-{side}', elbow - 0.02 * point, elbow + 0.12 * point, 0.06, M['iron'], n=4, back=None)
    return elbow


# The cleaver, raised in his right hand ------------------------------------------------------------

R_FIST = V(-0.47, -0.08, 1.22)
HAFT = V(-0.18, 0.06, 1.0).normalized()  # up, leaning out from his head and a little back
EDGE_TURN = 20  # degrees the edge turns forward from straight out, so the blade shows from the side too

# The blade in its own plane: u from the back of the blade towards the edge (out, away from his head)
# and v along the haft from the fist. The back is thick, the edge bevelled to nothing, and the blade
# broadens to a clipped point.
SPINE = [(-0.03, 0.07), (-0.03, 0.47)]  # the back, from the heel to the top
BEVEL = [(0.075, 0.07), (0.125, 0.51)]  # where the edge's bevel starts
EDGE = [(0.125, 0.05), (0.2, 0.555)]  # the cutting edge, from the heel to the point
SPINE_T, BEVEL_T = 0.018, 0.012  # half-thickness of the back and at the bevel


def cleaver():
    along = HAFT
    out = V(-math.cos(math.radians(EDGE_TURN)), -math.sin(math.radians(EDGE_TURN)), 0)
    out = (out - out.dot(along) * along).normalized()
    flat = along.cross(out)  # square to the blade's faces

    def at(u, v, w=0.0):
        return R_FIST + u * out + v * along + w * flat

    verts = []
    for (su, sv), (bu, bv) in zip(SPINE, BEVEL):
        verts += [at(su, sv, SPINE_T), at(su, sv, -SPINE_T), at(bu, bv, BEVEL_T), at(bu, bv, -BEVEL_T)]
    verts += [at(*EDGE[0]), at(*EDGE[1])]
    # 0-3: the heel's spine (front, back) and bevel (front, back); 4-7 the same at the top; 8, 9 the
    # edge at the heel and the point.
    cheeks = [(0, 2, 6, 4), (1, 3, 7, 5)]
    edges = [(2, 8, 9, 6), (3, 8, 9, 7)]
    walls = [(0, 4, 5, 1), (4, 6, 9, 7, 5), (0, 2, 8, 3, 1)]
    centre = at(0.05, 0.3)
    faces = wind(verts, cheeks + edges + walls, inside=centre)
    face_mats = [0, 0, 0, 0, 1, 0, 1]  # a pale blade on a back of black iron
    part('cleaver', verts, faces, [M['steel'], M['iron']], face_mats)
    # A spike from the back near the top, and the haft through his fist to an iron pommel.
    cone('cleaver-spike', at(-0.01, 0.37), at(-0.12, 0.45), 0.03, M['iron'], n=4)
    tube('haft', at(0, -0.12), at(0, 0.09), [(0, 0.024), (1, 0.024)], M['leather'], n=6)
    cone('pommel', at(0, -0.12), at(0, -0.17), 0.036, M['iron'], n=4)
    shoulder = leaned(V(-0.255, 0.03, 0.86))
    arm('right', shoulder, R_FIST, shoulder + V(-0.35, 0.08, -0.05), along)


# The war-banner of Morgul, planted in his left hand --------------------------------------------------

POLE_FOOT = V(0.5, -0.12, 0.0)
POLE_TOP = 1.9
BAR = 1.82  # the cross-bar the banner hangs from
FLAG = [-0.2, -0.1, 0.0, 0.1, 0.2]  # the banner's columns, across from the pole
FLAG_FOLD = [0.03, 0.0, 0.0, 0.0, 0.03]  # its sides curl back
FLAG_ROWS = [1.805, 1.55]  # its rows, down from the bar
FLAG_HEM = [1.33, 1.38, 1.31, 1.38, 1.34]  # the hem at each column
FLAG_RAGS = [1.24, 1.27, 1.26, 1.23]  # rags hanging lower between them
FLAG_Y = POLE_FOOT.y - 0.03  # it hangs in front of the pole
MOON = (1.62, 0.106)  # the height of the moon's middle, and its radius
BANNER_TURN = 20  # degrees the banner turns on its pole, its outer edge back, so it shows from the side too
L_FIST = V(POLE_FOOT.x, POLE_FOOT.y, 0.86)


def banner():
    tube('pole', POLE_FOOT, POLE_FOOT + V(0, 0, POLE_TOP), [(0, 0.024), (1, 0.02)], M['wood'], n=6)
    top = POLE_FOOT + V(0, 0, POLE_TOP)
    cone('pole-spike', top - V(0, 0, 0.02), top + V(0, 0, 0.13), 0.034, M['iron'], n=4, phase=45)
    before = set(bpy.context.scene.objects)
    bar = [POLE_FOOT + V(-0.225, -0.012, BAR), POLE_FOOT + V(0.225, -0.012, BAR)]
    tube('bar', bar[0], bar[1], [(0, 0.016), (1, 0.016)], M['iron'], n=4, phase=45)
    for k, (end, out) in enumerate(((bar[0], V(-1, 0, 0.35)), (bar[1], V(1, 0, 0.35)))):
        cone(f'bar-spike-{k}', end, end + 0.08 * out.normalized(), 0.022, M['iron'], n=4, phase=45)

    # The banner, hanging from the bar in front of the pole, its hem torn into rags.
    x0 = POLE_FOOT.x
    rows = [[V(x0 + u, FLAG_Y + f, z) for u, f in zip(FLAG, FLAG_FOLD)] for z in FLAG_ROWS]
    rows.append([V(x0 + u, FLAG_Y + f, z) for u, f, z in zip(FLAG, FLAG_FOLD, FLAG_HEM)])
    verts, faces, _ = loft(rows, closed=False)
    for i, z in enumerate(FLAG_RAGS):
        verts.append(V(x0 + (FLAG[i] + FLAG[i + 1]) / 2, FLAG_Y + (FLAG_FOLD[i] + FLAG_FOLD[i + 1]) / 2, z))
        faces.append((10 + i, 10 + i + 1, len(verts) - 1))
    part('banner', verts, faces, M['team'], outward=V(0, -1, 0))

    # The sign of Morgul on both faces: a pale moon with a death's face.
    mz, r = MOON
    for name, sign in (('front', -1), ('back', 1)):
        y = FLAG_Y + sign * 0.004

        def at(u, v, lift=0.0, y=y, sign=sign):
            return V(x0 + u, y + sign * lift, mz + v)

        disc = [at(r * math.cos(a), r * math.sin(a)) for a in (math.tau * (i + 0.5) / 10 for i in range(10))]
        part(f'moon-{name}', disc + [at(0, 0)], [(i, (i + 1) % 10, 10) for i in range(10)], M['bone'],
             outward=V(0, sign, 0))
        # The death's face: great hollow eyes, the hole of the nose and a grin of teeth.
        dark = []
        for s in (-1, 1):
            dark.append([(s * 0.012, 0.03), (s * 0.04, 0.05), (s * 0.068, 0.028), (s * 0.052, -0.004),
                         (s * 0.02, -0.004)])
        dark.append([(0, -0.012), (0.016, -0.04), (-0.016, -0.04)])
        dark.append([(-0.05, -0.05), (0.05, -0.05), (0.036, -0.072), (-0.036, -0.072)])
        for k, outline in enumerate(dark):
            verts = [at(u, v, 0.003) for u, v in outline]
            faces = [(0, i, i + 1) for i in range(1, len(verts) - 1)]
            part(f'moon-face-{name}-{k}', verts, faces, M['eyes'], outward=V(0, sign, 0))
    turn(new_objects(before), POLE_FOOT, BANNER_TURN)

    shoulder = leaned(V(0.255, 0.03, 0.86))
    arm('left', shoulder, L_FIST, shoulder + V(0.12, 0.12, -0.4), V(0, 0, 1))


def main():
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    for s in (-1, 1):
        pauldron(s)
    mantle()
    lean(new_objects(before), PIVOT, LEAN)
    tabard()
    before = set(bpy.context.scene.objects)
    head()
    helm()
    lean(new_objects(before), h(0, 0.04, 0.04), -HEAD_PITCH)
    cleaver()
    banner()
    finish('gothmog')


main()
