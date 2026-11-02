"""Bilbo Baggins, the burglar of The Hobbit: Hobbit, Burglar, a 3-cost unit (docs/design.md section
5), in the Faceted style of Gimli, the reference model (gimli.py, docs/viewer-spec.md section 4), and
of Frodo's family (frodo.py): the same build, round face, curls and big bare feet.

From the books rather than the films: a well-to-do, rather portly hobbit, old now and white-haired
but spry, in a bottle-green waistcoat with bright brass buttons over a linen shirt and brown
breeches, and no shoes. Over them, the hood and cloak he borrowed from Dwalin for his adventure, too
big for him: a short cape over his shoulders, open down the front from a clasp at his throat, and
the hood thrown back, hanging down his back in a long point to a tassel. His head is cocked, one
bushy white brow raised over a lopsided grin. No Ring shows.

Hobbit proportions, as Frodo's: 0.86 to the top of his curls, the head a third of that, the roundest
belly of the hobbits and feet bigger than life, thatched with grey. The team colour is the borrowed
cloak: the cape over his shoulders, seen from the front, from behind and from above, its two fronts
framing his waistcoat, and the hood down his back.

His 3★ model, the book moment (docs/viewer-spec.md section 4, "Star levels"): Bilbo at his height,
the same old hobbit as bilbo.py, on the night he brings the Arkenstone of Thrain, the Heart of the
Mountain, to Bard and the Elvenking, and gives it up to make peace (The Hobbit, "A Thief in the
Night"): "It was as if a globe had been filled with moonlight and hung before them". He holds it out
before him on the open palm of his left hand, the hand that asks the riddle at 1★ and 2★, raised and
out to his left, so it shows beside his curls from behind and beside the cape from in front. It is a
globe of many facets, "a globe with a thousand facets" as Thorin remembers it, larger than his hand
can close over, and white with a pale light of its own: an off-white that glows, never blue. Under
his waistcoat, which he wears open, is the small coat of mail Thorin gave him, "wrought for some
elf-prince long ago" ("Not at Home"): the mithril coat Frodo wears at 3★ (frodo-3.py), seen here
Bilbo's own way, in rows of light and darker rings down the front between the waistcoat's open
fronts, on his upper arms below the cape, and in a jagged hem below the waistcoat all round, so it
shows from behind too. He still holds Sting out as on his 2★ model (bilbo-2.py). His fittings, the
bright buttons, now down his right front edge, the clasp at his throat, the hood's tassel and
Sting's cross-guard and pommel, use `trim`.

    blender --background --factory-startup --python-exit-code 1 --python bilbo-3.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys
from itertools import pairwise

import bpy
from mathutils import Matrix

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    EYES,
    BOOK_BUDGET,
    LEATHER,
    V,
    bent_tube,
    box,
    cone,
    ellipse,
    finish,
    icosphere,
    lean,
    loft,
    material,
    nearest_on_line,
    nearest_on_polyline,
    on_surface,
    part,
    reset,
    team_material,
    trim_material,
    tube,
)

# Bilbo's own colours (sRGB); the rest come from the kit.
SKIN = 0xE0AA86  # a hobbit's, warm
HAIR = 0xD5D2C9  # white with age, a little grey: his curls and his brows
GREY = 0xA8A499  # the thatch on the tops of his feet, greyer
SHIRT = 0xD8CDB2  # unbleached linen
WAISTCOAT = 0x45634A  # bottle green, darker and cooler than Merry's olive jerkin
BREECHES = 0x6E5A43  # brown wool
LINING = 0x394536  # the dark green of the borrowed hood, inside it
BLADE = 0xCED3D6  # Sting: plain bright steel
MITHRIL = 0xD2D3CF  # the coat, as on Frodo (frodo-3.py): light, neutral silver-grey, the bright rows
MAIL = 0x969893  # the rows between, in shadow, so the coat reads as mail
ARKENSTONE = 0xF3F1EA  # white, with a pale light of its own: never blue
MOUTH = 0x6A4434  # a dark line, not red

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.9),
        foot_hair=material('foot-hair', GREY, roughness=0.9),
        shirt=material('shirt', SHIRT, roughness=0.9),
        waistcoat=material('waistcoat', WAISTCOAT, roughness=0.85),
        breeches=material('breeches', BREECHES, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        lining=material('lining', LINING, roughness=0.9),
        steel=material('steel', BLADE, roughness=0.4, metallic=0.1),
        mithril=material('mithril', MITHRIL, roughness=0.25, metallic=0.15),
        mail=material('mail', MAIL, roughness=0.35, metallic=0.15),
        arkenstone=material('arkenstone', ARKENSTONE, roughness=0.15, emission=ARKENSTONE,
                            emission_strength=0.55),
        trim=trim_material(),  # fittings, recoloured by star
        eyes=material('eyes', EYES, roughness=0.6),
        mouth=material('mouth', MOUTH, roughness=0.8),
    )


LEAN = 8  # degrees the body above the hips leans forward
HIPS = V(0, 0, 0.265)  # the pivot of the lean
COCK = -7  # degrees the head is cocked over to his right (-X), away from the stone
NECK = V(0, -0.02, 0.6)  # the pivot of the cock of the head


def lerp(a, b, t):
    return a + (b - a) * t


# Feet and legs -----------------------------------------------------------------------------------

# Feet apart, the left foot forward and the sword side back, toes turned out; the knees a little bent.
R_ANKLE, R_YAW = V(-0.112, 0.07, 0.0), -22
L_ANKLE, L_YAW = V(0.105, -0.065, 0.0), 12

# The right foot from the sole up, in its own frame, as Frodo's: toes towards -y, the big toe's side
# (+x) inwards. Each ring runs round from the heel; the last is round the ankle.
FOOT = [
    [(0.0, 0.075, 0.0), (0.042, 0.05, 0.0), (0.052, -0.04, 0.0), (0.062, -0.12, 0.0), (0.046, -0.2, 0.0),
     (0.02, -0.182, 0.0), (-0.006, -0.192, 0.0), (-0.04, -0.172, 0.0), (-0.064, -0.11, 0.0),
     (-0.046, 0.045, 0.0)],  # the sole
    [(0.0, 0.07, 0.045), (0.04, 0.046, 0.045), (0.05, -0.04, 0.04), (0.058, -0.116, 0.036),
     (0.042, -0.19, 0.036), (0.02, -0.168, 0.026), (-0.006, -0.18, 0.03), (-0.036, -0.16, 0.026),
     (-0.058, -0.106, 0.034), (-0.044, 0.042, 0.042)],  # over the toes, the big toe the highest
    [(0.0, 0.034, 0.1), (0.028, 0.024, 0.1), (0.035, -0.008, 0.094), (0.03, -0.042, 0.084),
     (0.018, -0.062, 0.078), (0.005, -0.066, 0.076), (-0.008, -0.065, 0.076), (-0.02, -0.057, 0.078),
     (-0.031, -0.04, 0.084), (-0.031, 0.02, 0.098)],  # round the ankle, low over the instep
]
FOOT_SCALE = 1.12  # the footprint, bigger than life
# The thatch of hair over the instep: (index round the rings, fraction from the second ring to the
# third) of each point round its edge, jagged, and its middle, raised.
THATCH = [(4.0, 0.42), (4.8, 0.3), (5.5, 0.36), (6.2, 0.28), (7.0, 0.42), (6.8, 0.7), (7.1, 0.95),
          (5.5, 0.85), (3.9, 0.95), (4.2, 0.7)]
THATCH_MIDDLE = (5.5, 0.62)


def foot(name, ankle, yaw, inner):
    """A big bare foot, its big toe towards `inner` (+1 for the right foot, -1 for the left)."""
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)

    def place(p):
        return at + turn @ V(FOOT_SCALE * inner * p[0], FOOT_SCALE * p[1], p[2])

    rings = [[place(p) for p in ring] for ring in FOOT]
    verts, faces, _ = loft(rings)
    axis = [place((0, 0.03, 0.04)), place((0, -0.14, 0.018))]
    part(name, verts, faces, M['skin'], inside=nearest_on_polyline(axis))

    def on_top(u, v, lift):
        i = int(u)
        f = u - i
        low = rings[1][i].lerp(rings[1][i + 1], f)
        high = rings[2][i].lerp(rings[2][i + 1], f)
        return low.lerp(high, v) + V(0, 0, lift)

    edge = [on_top(u, v, 0.004) for u, v in THATCH]
    middle = on_top(*THATCH_MIDDLE, 0.026)
    verts = edge + [middle]
    faces = [(i, (i + 1) % len(edge), len(edge)) for i in range(len(edge))]
    part(name + '-hair', verts, faces, M['foot_hair'], inside=middle - V(0, 0, 0.05))


R_HIP, L_HIP = V(-0.08, 0.008, 0.265), V(0.08, 0.0, 0.265)
R_KNEE, L_KNEE = V(-0.115, 0.012, 0.172), V(0.11, -0.08, 0.174)
ANKLE_Z = 0.06  # where the shin ends, inside the foot


def leg(side, hip, knee, ankle):
    ankle = V(ankle.x, ankle.y, ANKLE_Z)
    shin = (ankle - knee).normalized()
    # Breeches to below the knee, ending in a cuff wider than the bare shin. The cuff is long enough
    # that its rings don't cross behind the bent knee.
    bent_tube(f'thigh-{side}', [hip, knee, knee + 0.035 * shin], [0.076, 0.063, 0.058], M['breeches'])
    tube(f'shin-{side}', knee, ankle, [(0, 0.044), (1, 0.034)], M['skin'])


def legs():
    leg('right', R_HIP, R_KNEE, R_ANKLE)
    leg('left', L_HIP, L_KNEE, L_ANKLE)
    foot('foot-right', R_ANKLE, R_YAW, 1)
    foot('foot-left', L_ANKLE, L_YAW, -1)


# Body --------------------------------------------------------------------------------------------

# Rings with a corner at the front, from the hem of the mail to the shoulders: z, half-width,
# half-depth and centre y. The belly is the roundest of the hobbits'. The coat of mail shows below
# the waistcoat, flared over the seat of his breeches, its hem jagged.
TORSO = [
    (0.205, 0.172, 0.15, 0.012),  # the hem of the mail, over his breeches (jagged below)
    (0.27, 0.165, 0.145, 0.002),  # the waistcoat's hem
    (0.335, 0.19, 0.178, -0.026),  # under the belly
    (0.4, 0.196, 0.19, -0.048),  # the round belly
    (0.468, 0.17, 0.142, -0.022),  # chest
    (0.52, 0.13, 0.1, 0.0),  # shoulders, closed above by his shirt, round the neck
]
HEM_JAG = 0.024  # every other point of the mail's hem hangs this much lower
# How far either side of the front (degrees) the waistcoat lies open over the mail, ring by ring: the
# belly pushes it widest apart low down.
OPENING = [20, 26, 24, 20, 14, 8]
EDGE = 0.006  # how far its edges stand out over the mail
TORSO_POINTS = 10  # round each ring, at ring_angles(): the opening's edges at 6 and 8, the front at 7
MAIL_ROWS = [0, 1, 0, 1, 0]  # each band's mail: bright mithril, or the darker rows between
BUTTONS = [0.318, 0.38, 0.442]  # heights of the bright buttons down his right front edge
BUTTON_SIZE = 0.024  # half the height of each button


def torso_ring(z):
    """The torso's half-width, half-depth and centre y at height z."""
    for (z0, *low), (z1, *high) in pairwise(TORSO):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return [lerp(a, b, t) for a, b in zip(low, high)]
    raise ValueError(z)


def opening(z):
    """How far either side of the front the waistcoat lies open at height z (degrees)."""
    for (z0, *_), (z1, *_), a0, a1 in zip(TORSO, TORSO[1:], OPENING, OPENING[1:]):
        if z0 <= z <= z1:
            return lerp(a0, a1, (z - z0) / (z1 - z0))
    raise ValueError(z)


def ring_angles(gap):
    """The angles of a ring's points from his left (+X), with the opening `gap` either side of the front."""
    return [0, 45, 90, 135, 180, 225, 270 - gap, 270, 270 + gap, 315]


def on_torso(z, degrees, lift=0.0):
    """The point of the torso at height z and `degrees` round from his left (+X), lifted off it."""
    rx, ry, cy = torso_ring(z)
    a = math.radians(degrees)
    return V((rx + lift) * math.cos(a), cy + (ry + lift) * math.sin(a), z)


def clear(p, gap):
    """p, moved forward or back until it is at least `gap` outside the torso."""
    if not TORSO[0][0] <= p.z <= TORSO[-1][0]:
        return p
    rx, ry, cy = torso_ring(p.z)
    ax, ay = rx + gap, ry + gap
    if abs(p.x) >= ax:
        return p
    reach = ay * math.sqrt(1 - (p.x / ax) ** 2)
    return p if abs(p.y - cy) >= reach else V(p.x, cy + math.copysign(reach, p.y - cy), p.z)


def torso():
    n = TORSO_POINTS
    rings = []
    for k, ((z, rx, ry, cy), gap) in enumerate(zip(TORSO, OPENING)):
        ring = []
        for i, d in enumerate(ring_angles(gap)):
            lift = EDGE if k > 0 and i in (6, 8) else 0.0
            low = HEM_JAG if k == 0 and i % 2 else 0.0
            a = math.radians(d)
            ring.append(V((rx + lift) * math.cos(a), cy + (ry + lift) * math.sin(a), z - low))
        rings.append(ring)
    verts, faces, bands = loft(rings)
    mithril, mail, waistcoat, shirt = range(4)
    face_mats = []
    for f, b in enumerate(bands):
        if b == 0 or f % n in (6, 7):
            face_mats.append(mail if MAIL_ROWS[b] else mithril)
        else:
            face_mats.append(waistcoat)
    # The waistcoat's two points, at the foot of its open fronts, over the mail.
    hem = rings[1]
    for edge, inner in ((6, 5), (8, 9)):
        p = hem[edge].lerp(hem[inner], 0.25)
        out = V(p.x, p.y - TORSO[1][3], 0).normalized()
        verts.append(p + 0.014 * out - V(0, 0, 0.055))
        faces.append((n + inner, n + edge, len(verts) - 1))
        face_mats.append(waistcoat)
    faces.append(tuple(range(5 * n, 6 * n)))  # the shirt at his throat, round the neck
    face_mats.append(shirt)
    mats = [M['mithril'], M['mail'], M['waistcoat'], M['shirt']]
    part('torso', verts, faces, mats, face_mats, inside=lambda c: V(0, -0.01, min(c.z, 0.5)))

    # Bright buttons down his right front edge, now the waistcoat is open, each a little pyramid.
    for k, z in enumerate(BUTTONS):
        d = 270 - opening(z) - 7
        c = on_torso(z, d, 0.004)
        ridge = (on_torso(z + 0.01, d) - on_torso(z - 0.01, d)).normalized()
        a = math.radians(d)
        rx, ry, _ = torso_ring(z)
        along = V(-rx * math.sin(a), ry * math.cos(a), 0).normalized()  # round the torso
        out = ridge.cross(along).normalized()
        if out.dot(V(math.cos(a), math.sin(a), 0)) < 0:
            out = -out
        size = BUTTON_SIZE
        across = [sx * size * along - 0.4 * size * out for sx in (1, -1)]  # sunk to the surface
        verts = [c + size * ridge, c + across[0], c - size * ridge, c + across[1], c + 0.015 * out]
        faces = [(i, (i + 1) % 4, 4) for i in range(4)]
        part(f'button-{k}', verts, faces, M['trim'], inside=c - 0.01 * out)

    tube('neck', V(0, 0.009, 0.5), V(0, -0.015, 0.63), [(0, 0.05), (1, 0.047)], M['skin'])


# Head --------------------------------------------------------------------------------------------

# Octagons with a corner at the front, from under the chin to the crown: z, half-width, half-depth
# and centre y. A round face, and a high forehead where his hair has gone back.
HEAD = [
    (0.59, 0.05, 0.045, -0.05),  # under the chin
    (0.622, 0.1, 0.094, -0.03),  # the jaw and the mouth
    (0.68, 0.129, 0.115, -0.018),  # round cheeks, the widest
    (0.742, 0.126, 0.114, -0.012),  # the eyes and the temples
    (0.8, 0.111, 0.103, -0.008),  # the forehead
    (0.83, 0.074, 0.072, -0.004),  # the top of a high forehead, under the curls
]


def head():
    rings = [ellipse(0, cy, z, rx, ry, 8, 0) for z, rx, ry, cy in HEAD]
    verts, faces, _ = loft(rings)
    faces.append(tuple(range(8)))  # under the chin
    faces.append(tuple(range(40, 48)))  # the crown, under the curls
    part('head', verts, faces, M['skin'], inside=lambda c: V(0, -0.02, min(max(c.z, 0.65), 0.79)))

    def plane(a, b, low, high):
        p, q, r, s = rings[low][a], rings[low][b], rings[high][b], rings[high][a]
        return [(p, q, r), (p, r, s)]

    cheeks = plane(5, 6, 2, 3) + plane(6, 7, 2, 3)
    jaw = plane(5, 6, 1, 2) + plane(6, 7, 1, 2)
    brow = plane(5, 6, 3, 4) + plane(6, 7, 3, 4)

    # Narrow, twinkling eyes, a little wide apart.
    for s in (-1, 1):
        x, z = s * 0.046, 0.72
        corners = [(x - 0.018, z), (x - 0.009, z + 0.011), (x + 0.009, z + 0.011), (x + 0.018, z),
                   (x + 0.009, z - 0.01), (x - 0.009, z - 0.01)]
        verts = [V(u, on_surface(cheeks, u, w) - 0.005, w) for u, w in corners]
        part(f'eye-{s}', verts, [(0, 1, 2, 3, 4, 5)], M['eyes'], outward=V(0, -1, 0))

    # A lopsided grin, the corner under his raised hand higher.
    corners = [(-0.034, 0.662), (0, 0.652), (0.04, 0.67), (0, 0.643)]
    verts = [V(x, on_surface(jaw, x, z) - 0.004, z) for x, z in corners]
    part('mouth', verts, [(0, 3, 1), (1, 3, 2)], M['mouth'], outward=V(0, -1, 0))

    # A round nose, bigger than Frodo's.
    top, tip, under = V(0, -0.128, 0.716), V(0, -0.16, 0.688), V(0, -0.137, 0.671)
    left, right = V(0.031, -0.122, 0.688), V(-0.031, -0.122, 0.688)
    verts = [top, left, under, right, tip]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.1, 0.69))

    # Bushy white brows jutting over the eyes, each a ridge from the nose out to a tuft; the left one,
    # under his raised hand, is raised, quizzical.
    for s in (-1, 1):
        lift = 0.009 if s > 0 else 0.0
        inner, outer = (s * 0.02, 0.757 + lift), (s * 0.082, 0.757 + lift)
        foot_in = V(inner[0], on_surface(brow + cheeks, *inner) + 0.004, inner[1])
        foot_out = V(outer[0], on_surface(brow + cheeks, *outer) + 0.004, outer[1])
        up = V(0, 0, 0.014)
        ridge_in = foot_in + V(0, -0.016, 0.006)
        ridge_out = foot_out + V(s * 0.012, -0.014, 0.012)
        verts = [foot_in - up * 0.3, foot_out - up * 0.3, foot_out + up, foot_in + up, ridge_in, ridge_out]
        faces = [(0, 1, 5, 4), (4, 5, 2, 3), (0, 4, 3), (1, 2, 5)]
        part(f'brow-{s}', verts, faces, M['hair'], inside=(foot_in + foot_out) / 2 + V(0, 0.02, 0))

    # Ears a little pointed, through the curls at the sides.
    for s in (-1, 1):
        base = [V(s * 0.119, -0.018, 0.676), V(s * 0.121, 0.028, 0.688), V(s * 0.116, 0.014, 0.74),
                V(s * 0.119, -0.022, 0.725)]
        tip = V(s * 0.16, 0.026, 0.752)
        verts = base + [tip]
        faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
        part(f'ear-{s}', verts, faces, M['skin'], inside=V(s * 0.09, 0.0, 0.71))


def head_ring(z):
    """The head's half-width, half-depth and centre y at height z."""
    for (z0, *low), (z1, *high) in pairwise(HEAD):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return [lerp(a, b, t) for a, b in zip(low, high)]
    raise ValueError(z)


# The curls, white: a mop round the head from a hairline that is low at the nape, lifts over the
# ears and has gone back from his forehead: its height at angles from his left (+X) round the back.
HAIRLINE = [(0, 0.758), (45, 0.665), (90, 0.622), (135, 0.665), (180, 0.758), (225, 0.79), (270, 0.812),
            (315, 0.79), (360, 0.758)]
HAIR_POINTS = 16
CURL = 0.018  # how far each curl hangs below the hairline between them
MOP = V(0, -0.004, 0.722), (0.156, 0.148, 0.134)  # the ellipsoid the curls fill: centre and radii
BUMP = 0.2  # how far each other point of the mop stands out, staggered ring to ring, each a curl


def hairline(degrees):
    for (a0, z0), (a1, z1) in pairwise(HAIRLINE):
        if a0 <= degrees <= a1:
            return lerp(z0, z1, (degrees - a0) / (a1 - a0))
    raise ValueError(degrees)


def hair():
    centre, (rx, ry, rz) = MOP
    n = HAIR_POINTS
    rings = [[], [], [], []]
    high = set()  # the points that stand out
    for i in range(n):
        a = math.tau * i / n
        cos, sin = math.cos(a), math.sin(a)
        z = hairline(360 * i / n)
        curl = i % 2 == 1
        z0 = z - CURL if curl else z + 0.006
        hx, hy, hc = head_ring(z0)
        rings[0].append(V(0.94 * hx * cos, hc + 0.94 * hy * sin, z0))
        low = math.asin(min((z + 0.028 - centre.z) / rz, 0.95))
        for k, t in enumerate((0.0, 0.4, 0.75)):
            up = low + (math.pi / 2 - low) * t
            out = (i + k) % 2 == 1
            if out:
                high.add((k + 1) * n + i)
            r = math.cos(up) * (1 + BUMP * out)
            z = rz * math.sin(up) * (1 + 0.5 * BUMP * out) - (0.022 if out and k == 0 else 0.0)
            rings[k + 1].append(centre + V(rx * r * cos, ry * r * sin, z))
    verts, quads, _ = loft(rings)
    faces = []
    for a, b, c, d in quads:
        if a in high or c in high:
            faces += [(a, b, d), (b, c, d)]
        else:
            faces += [(a, b, c), (a, c, d)]
    crown = len(verts)
    verts.append(centre + V(0, 0, rz))
    last = 3 * n
    faces += [(last + i, last + (i + 1) % n, crown) for i in range(n)]
    part('hair', verts, faces, M['hair'], inside=centre)


# Arms --------------------------------------------------------------------------------------------

# The right arm thrusts Sting out in front of him from beside his hip, as at 2★; the left is held out
# before him and to his left, raised, the Arkenstone on its palm.
R_SHOULDER, R_ELBOW, R_WRIST = V(-0.14, 0.0, 0.49), V(-0.235, -0.02, 0.39), V(-0.275, -0.14, 0.33)
L_SHOULDER, L_ELBOW, L_WRIST = V(0.14, 0.0, 0.49), V(0.25, -0.05, 0.45), V(0.3, -0.18, 0.57)


def sleeve(side, shoulder, elbow, wrist):
    """The coat's short sleeve of mail over the upper arm, in two rows, and the linen below it."""
    mid = shoulder.lerp(elbow, 0.5)
    bent_tube(f'sleeve-{side}', [shoulder, mid, elbow, wrist], [0.056, 0.056, 0.052, 0.041],
              [M['mithril'], M['mail'], M['shirt']], [0, 1, 2])


def arm(side, shoulder, elbow, wrist, up):
    """A sleeve and a big fist; `up` is where its thumb points. Returns the fist's centre and its
    axes: ahead, up and across."""
    sleeve(side, shoulder, elbow, wrist)
    ahead = (wrist - elbow).normalized()
    up = (up - up.dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    fist = wrist + 0.03 * ahead
    box(f'fist-{side}', fist, [ahead, up, across], (0.038, 0.04, 0.042), M['skin'], 0.86)
    return fist, ahead, up, across


# The Arkenstone of Thrain, on his open left hand: a globe of many facets, larger than his hand can
# close over, white with a pale light of its own. The hand is bent back at the wrist to lie level,
# palm up, fingers forward and out, the thumb curled up against the stone's side.
HAND_AHEAD = V(0.3, -0.95, 0.0).normalized()  # the way his fingers point
GEM_RADIUS = 0.072
GEM_SINK = 0.018  # how far the stone sits down into his cupped palm


def arkenstone():
    sleeve('left', L_SHOULDER, L_ELBOW, L_WRIST)
    up = V(0, 0, 1)
    ahead = (HAND_AHEAD - HAND_AHEAD.dot(up) * up).normalized()
    across = up.cross(ahead)  # towards the thumb, his left (+X) as the palm faces up
    palm = L_WRIST + 0.032 * ahead + 0.008 * up
    box('hand-left', palm, [ahead, across, up], (0.042, 0.04, 0.018), M['skin'], 0.85)
    box('thumb', palm + 0.008 * ahead + 0.042 * across + 0.022 * up, [up, ahead, across],
        (0.024, 0.012, 0.012), M['skin'], 0.8)

    centre = palm + (0.018 + GEM_RADIUS - GEM_SINK) * up
    unit, faces = icosphere(1)
    verts = [centre + GEM_RADIUS * p for p in unit]
    part('arkenstone', verts, faces, M['arkenstone'], inside=centre)


# Sting, in his right hand ------------------------------------------------------------------------

# Sting, as on his 2★ model (bilbo-2.py): the elven knife from the trolls' lair that is a short
# sword to a hobbit, the same blade as Frodo's (frodo.py), thrust forward, out to his right and a
# little up, its flat to the sky. Plain bright steel, with no glow.
STING = V(-0.7, -0.62, 0.35).normalized()
STING_LENGTH = 0.33  # from the guard to the point
STING_ROLL = 70  # degrees the flat is turned from upright towards level, to face the sky
# Stations along the blade: fraction of its length, half-width and half-thickness at the ridge.
STING_STATIONS = [(0.0, 0.026, 0.009), (0.55, 0.022, 0.008), (0.86, 0.013, 0.006)]


def sting():
    fist, *_ = arm('right', R_SHOULDER, R_ELBOW, R_WRIST, STING)
    level = V(STING.y, -STING.x, 0).normalized()
    upright = level.cross(STING).normalized()
    if upright.z < 0:
        upright = -upright
    roll = math.radians(STING_ROLL)
    width = math.cos(roll) * upright + math.sin(roll) * level
    flat = STING.cross(width).normalized()

    guard = fist + 0.055 * STING
    rings = []
    for t, w, th in STING_STATIONS:
        c = guard + t * STING_LENGTH * STING
        rings.append([c + w * width, c + th * flat, c - w * width, c - th * flat])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * 4
    verts.append(guard + STING_LENGTH * STING)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    part('blade', verts, faces, M['steel'], inside=nearest_on_line(guard, guard + STING))

    # A plain cross-guard, a leather grip and a pommel.
    box('guard', guard, [STING, width, flat], (0.011, 0.058, 0.016), M['trim'], 0.8)
    end = fist - 0.06 * STING
    tube('grip', end, guard, [(0, 0.015), (1, 0.015)], M['leather'], n=4, phase=45)
    cone('pommel', end, end - 0.032 * STING, 0.024, M['trim'], n=4, phase=45, back=end + 0.012 * STING)


# Team colour: the borrowed hood and cloak ---------------------------------------------------------

# The cloak is a short cape over his shoulders, open down the front from the clasp at his throat, so
# its two fronts frame his waistcoat and its buttons. Each ring runs from the left front edge round
# his left (+X), the back and his right to the right front edge: half-width, half-depth, centre y,
# how far round from the middle of the front each edge is (degrees), and its height at the sides,
# the back and the front edges. The lower two rings hug his chest and belly, and his back, so his
# waistcoat shows below the cape.
CAPE_RINGS = [  # rx, ry, cy, gap, side z, back z, front z
    (0.216, 0.128, 0.016, 28, 0.463, 0.458, 0.43),  # the hem
    (0.226, 0.135, 0.016, 22, 0.505, 0.5, 0.47),  # over the shoulders
    (0.17, 0.138, 0.014, 12, 0.565, 0.585, 0.53),  # round the top of the shoulders
    (0.09, 0.084, 0.012, 6, 0.6, 0.62, 0.565),  # round the neck
]
CAPE_GAPS = [0.012, 0.028, 0.0, 0.0]  # how far each ring stands outside the torso


def cape_ring(rx, ry, cy, gap, side, back, front, clearance):
    """Nine points round the cape from its left front edge to its right, `clearance` outside him."""
    ring = []
    for i in range(9):
        a = math.radians(270 + gap + (360 - 2 * gap) * i / 8)
        sin = math.sin(a)
        z = side + (back - side) * max(sin, 0) + (front - side) * max(-sin, 0)
        ring.append(clear(V(rx * math.cos(a), cy + ry * sin, z), clearance))
    return ring


def cape():
    rings = [cape_ring(*ring, clearance) for ring, clearance in zip(CAPE_RINGS, CAPE_GAPS)]
    verts, faces, _ = loft(rings, closed=False)
    part('cape', verts, faces, M['team'], inside=V(0, 0.015, 0.45))

    # The clasp at his throat, a round brooch joining the two fronts.
    neck, dome = rings[3], rings[2]
    top = (neck[0] + neck[8]) / 2
    low = (dome[0] + dome[8]) / 2
    c = top.lerp(low, 0.3) + V(0, -0.006, 0)
    down = (top - low).normalized()
    out = V(1, 0, 0).cross(down).normalized()
    ring = [c + 0.024 * (math.cos(a) * V(1, 0, 0) + math.sin(a) * down)
            for a in (math.tau * i / 6 for i in range(6))]
    verts = ring + [c + 0.013 * out]
    part('clasp', verts, [(i, (i + 1) % 6, 6) for i in range(6)], M['trim'], inside=c - 0.01 * out)


# The hood, thrown back: Dwalin's, too big for him. Its opening lies flat under his curls, the lining
# a sliver inside, and below it the hood hangs in a long point down his back, over the waistcoat, to a
# tassel. The rim and the bag from the nape round to his left (+X), the back and his right.
HOOD_RIM = [V(0, 0.112, 0.616), V(0.072, 0.122, 0.606), V(0.114, 0.146, 0.588), V(0.084, 0.162, 0.574),
            V(0, 0.168, 0.57), V(-0.084, 0.162, 0.574), V(-0.114, 0.146, 0.588), V(-0.072, 0.122, 0.606)]
HOOD_HOLLOW = V(0, 0.132, 0.586)  # the bottom of the hollow inside, just clear of the cape
HOOD_BAG = [V(0, 0.14, 0.52), V(0.1, 0.155, 0.515), V(0.142, 0.178, 0.495), V(0.104, 0.206, 0.47),
            V(0, 0.222, 0.462), V(-0.104, 0.206, 0.47), V(-0.142, 0.178, 0.495), V(-0.1, 0.155, 0.515)]
HOOD_POINT = V(0, 0.176, 0.29)
TASSEL = V(0, 0.172, 0.235)


def hood():
    n = len(HOOD_RIM)
    verts, faces, _ = loft([HOOD_RIM, HOOD_BAG])
    verts.append(HOOD_POINT)
    faces += [(n + i, n + (i + 1) % n, 2 * n) for i in range(n)]
    middle = [V(0, 0.15, 0.58), V(0, 0.19, 0.48), V(0, 0.17, 0.3)]  # down the inside of the hood
    part('hood', verts, faces, M['team'], inside=nearest_on_polyline(middle))
    verts = HOOD_RIM + [HOOD_HOLLOW]
    part('hood-lining', verts, [(i, (i + 1) % n, n) for i in range(n)], M['lining'], outward=V(0, 0.6, 0.8))
    cone('tassel', HOOD_POINT + V(0, 0, 0.012), TASSEL, 0.022, M['trim'], n=4,
         back=HOOD_POINT + V(0, 0, 0.03))


def cock(objects, pivot, degrees):
    """Tips objects sideways about the forward axis through `pivot`, to his left (+X) for positive
    degrees: the head cocked."""
    tip = Matrix.Rotation(math.radians(degrees), 4, 'Y')
    turning = Matrix.Translation(pivot) @ tip @ Matrix.Translation(-pivot)
    for obj in objects:
        obj.data.transform(turning)


def main():
    reset()
    make_materials()
    legs()
    lower = set(bpy.context.scene.objects)
    torso()
    body = set(bpy.context.scene.objects)
    head()
    hair()
    cock([o for o in bpy.context.scene.objects if o not in body], NECK, COCK)
    cape()
    hood()
    arkenstone()
    sting()
    lean([o for o in bpy.context.scene.objects if o not in lower], HIPS, LEAN)
    finish('bilbo-3', budget=BOOK_BUDGET)


main()
