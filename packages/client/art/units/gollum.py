"""Gollum, once Sméagol: Hobbit, Burglar, a 3-cost unit (docs/design.md section 5), in the Faceted
style of Gimli, the reference model (gimli.py, docs/viewer-spec.md section 4), and of Frodo's family
(frodo.py), which sets the Hobbits' look.

From the books rather than the films: a hobbit of the Stoor kind twisted by the Ring, small, thin and
slimy, with long thin arms and fingers, large flat feet, a few strands of lank hair, and big round
pale eyes like lamps, with a faint pale green light in them. He crouches low on bent legs like a
prowling thing of insect-kind, his left hand flat on the ground and his right lifted with its fingers
hooked, his head thrust out in front of his shoulders and tipped back to watch his prey, his mouth
open in a hiss over a few sharp teeth. He has no blade: his weapons are his teeth and his hands (My
precious, three bites). No Ring.

A hobbit, but the lowest of them: 0.64 to the top of his head as he crouches, against Frodo's 0.88,
his head as big as Frodo's on a thin body, and his feet bigger still, long, flat and splayed. His
skin is a muted pale grey-green. He has almost nothing on, so the team colour is his rags: a rag
knotted round his neck, over his shoulders and down his upper back, torn at the hem, with its knot
and two torn ends under his chin; and a ragged loincloth, a flap hanging in front and one behind.
From the front his eyes and face show above the knot; from behind and above, as the near side is
seen, the rag on his back and the loincloth, with his bald head and its strands, his elbows, his
knees and his big feet round them.

    blender --background --factory-startup --python-exit-code 1 --python gollum.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    EYES,
    V,
    bent_tube,
    box,
    cone,
    ellipse,
    finish,
    loft,
    lump,
    material,
    nearest_on_polyline,
    on_surface,
    part,
    reset,
    team_material,
    tube,
)

# Gollum's own colours (sRGB); the pupils are the kit's EYES.
SKIN = 0xA6AA8F  # a muted pale grey-green, of something long kept from the sun; a little shiny, slimy
HAIR = 0x35322A  # a few lank, dark, greasy strands
EYE = 0xE3EABD  # big pale eyes like lamps...
GLOW = 0xC9DA90  # ...with a faint pale green light, neither blue nor red
TEETH = 0xD8D0AE
MOUTH = 0x2A1E1A  # dark, not red

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.6),
        hair=material('hair', HAIR, roughness=0.5),
        eyes=material('eyes', EYE, roughness=0.5, emission=GLOW, emission_strength=0.8),
        pupils=material('pupils', EYES, roughness=0.5),
        mouth=material('mouth', MOUTH, roughness=0.8),
        teeth=material('teeth', TEETH, roughness=0.6),
    )


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o not in before]


def clamp01(t):
    return min(max(t, 0.0), 1.0)


# The crouch --------------------------------------------------------------------------------------
#
# The body is built upright and then bent by hunched(), as Grishnákh's is: it leans forward about the
# hips, and above the small of the back the spine curls on over, so that his shoulders hunch and his
# neck comes out of the front of them, nearly level. The legs and arms are then drawn to it from feet
# and hands placed on the ground.

PIVOT = V(0, 0.12, 0.2)  # the hips
LEAN = 32  # degrees the body above the hips leans forward
MID = V(0, 0.12, 0.3)  # the small of the back
CURL = 32  # further degrees the shoulders curl forward over it
CURL_SPAN = 0.16  # the height over which the curl comes in


def hunched(p):
    """Where a point of the upright body is once he crouches."""
    p = Vector(p)
    t = clamp01((p.z - MID.z) / CURL_SPAN)
    if t > 0:
        p = MID + Matrix.Rotation(math.radians(CURL * t), 3, 'X') @ (p - MID)
    return PIVOT + Matrix.Rotation(math.radians(LEAN), 3, 'X') @ (p - PIVOT)


def hunch(objects):
    for obj in objects:
        for v in obj.data.vertices:
            v.co = hunched(v.co)


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


# Body --------------------------------------------------------------------------------------------

# Octagons from his seat to the base of his neck, built upright: z, half-width, half-depth and centre
# y. Thin, with a narrow waist under bony ribs.
TORSO = [
    (0.13, 0.055, 0.05, 0.13),  # under the seat
    (0.185, 0.098, 0.082, 0.125),  # hips
    (0.26, 0.078, 0.066, 0.12),  # thin waist
    (0.335, 0.108, 0.088, 0.115),  # ribs
    (0.405, 0.118, 0.08, 0.12),  # shoulders
    (0.455, 0.055, 0.05, 0.125),  # the base of the neck
]
NECK = V(0, 0.125, 0.45)  # where the neck leaves the body, before the crouch


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, _ = loft(rings)
    faces.append(tuple(range(8)))
    part('torso', verts, faces, M['skin'], inside=lambda c: V(0, 0.12, min(max(c.z, 0.16), 0.44)))


# Team colour: a rag knotted round his neck and a ragged loincloth ----------------------------------


def kerchief():
    """The rag round his neck and over his shoulders, built upright with the body, so that the crouch
    lays it over his hunched shoulders and down his upper back."""
    # Eight points round from his left (+X), the third behind him and the seventh in front.
    n = 8
    neck = ellipse(0, 0.125, 0.49, 0.066, 0.06, n, 0)
    dome = ellipse(0, 0.12, 0.445, 0.126, 0.096, n, 0)
    shoulder = ellipse(0, 0.12, 0.4, 0.172, 0.108, n, 0)
    hem_z = [0.335, 0.33, 0.325, 0.33, 0.335, 0.37, 0.375, 0.37]
    hem = ellipse(0, 0.12, 0, 0.168, 0.108, n, 0, hem_z)
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    # The point of the rag down his back, torn in two.
    a, b = len(verts), len(verts) + 1
    verts += [V(0.03, 0.222, 0.25), V(-0.035, 0.22, 0.268)]
    mid = len(verts)
    verts.append(V(0.0, 0.218, 0.29))
    faces += [(1, 2, mid, a), (2, 3, b, mid)]
    # Rags hanging from the hem at his sides: the edge they hang from and how far.
    for i, drop in ((0, 0.05), (3, 0.06), (4, 0.045), (7, 0.04)):
        p, q = verts[i], verts[(i + 1) % n]
        middle = (p + q) / 2
        out = V(middle.x, middle.y - 0.12, 0).normalized()
        verts.append(middle + 0.012 * out - V(0, 0, drop))
        faces.append((i, (i + 1) % n, len(verts) - 1))
    part('kerchief', verts, faces, M['team'], inside=lambda c: V(0, 0.12, min(c.z, 0.42) - 0.05))


def knot():
    """The knot under his chin, a little to his left, and the rag's two torn ends hanging from it."""
    at = hunched(V(0.03, 0.07, 0.47)) + V(0, -0.01, -0.01)
    lump('knot', at, (0.032, 0.028, 0.026), M['team'], seed=3, rough=0.15)
    for k, (end, width) in enumerate(((V(-0.06, -0.012, -0.17), 0.04), (V(0.07, -0.004, -0.13), 0.034))):
        tip = at + end
        across = V(1, 0, 0)
        # Two corners at the top, then the torn end: a point, a notch torn up into it and a point.
        verts = [at - width * across, at + width * across, tip + 0.9 * width * across + V(0, 0, 0.012),
                 tip + V(0.1 * width, 0, 0.03), tip - 0.8 * width * across]
        faces = [(0, 1, 2, 3), (0, 3, 4)]
        part(f'knot-end-{k}', verts, faces, M['team'], outward=V(0, -1, 0))


# The loincloth's band round his hips, built upright: z, half-width and half-depth of its lower and
# upper edges, wide enough to clear his hips everywhere.
LOIN_LOW = (0.145, 0.11, 0.098)
LOIN_HIGH = (0.215, 0.104, 0.092)


def flap(name, top, drops, rags, out):
    """A ragged flap of cloth hanging straight down from the points `top`, each by its `drops`, with a
    rag hanging further between each two by `rags`, its hem pushed `out`."""
    n = len(top)
    bottom = [p + out - V(0, 0, d) for p, d in zip(top, drops)]
    verts = list(top) + bottom
    faces = [(i, i + 1, n + i + 1, n + i) for i in range(n - 1)]
    for i, rag in enumerate(rags):
        verts.append((bottom[i] + bottom[i + 1]) / 2 - V(0, 0, rag))
        faces.append((n + i, n + i + 1, len(verts) - 1))
    part(name, verts, faces, M['team'], outward=out)


def loincloth():
    """The band, which crouches with his hips, and its two flaps, which hang straight down from it."""
    n = 8
    z0, rx0, ry0 = LOIN_LOW
    z1, rx1, ry1 = LOIN_HIGH
    low = ellipse(0, 0.125, z0, rx0, ry0, n, 0)
    high = ellipse(0, 0.125, z1, rx1, ry1, n, 0)
    verts, faces, _ = loft([low, high])
    belt = part('loincloth', verts, faces, M['team'], inside=lambda c: V(0, 0.125, c.z))
    hunch([belt])
    low = [hunched(p) for p in low]
    # A flap in front, down between his knees nearly to the ground, and one behind.
    front = [low[5], low[6], low[7]]
    flap('loincloth-front', front, [p.z - 0.05 for p in front], [0.03, 0.025], V(0, -0.02, 0))
    back = [low[3], low[2], low[1]]
    flap('loincloth-back', back, [0.06, 0.075, 0.065], [0.03, 0.025], V(0, 0.025, 0))


# Head --------------------------------------------------------------------------------------------

HEAD_SCALE = 1.08  # drawn big, as Gimli's is, so that his face and eyes read at game size
HEAD_SOCKET = V(0, 0.05, 0.07)  # where the neck goes into the head, in the head's own frame
HEAD_TILT = -15  # degrees the head is tipped back, to look ahead and up from his crouch
NECK_LENGTH = 0.085  # from the shoulders to the socket

# Rings from under the chin to the crown: z, then the left half as (x, y): the side, the back corner,
# the back, the front corner and the front. A big round skull over a thin face and a small chin.
SKULL = [
    (0.0, (0.032, -0.045), (0.024, -0.005), 0.005, (0.026, -0.078), -0.088),  # under the chin
    (0.05, (0.068, -0.02), (0.058, 0.045), 0.06, (0.055, -0.088), -0.102),  # the mouth
    (0.1, (0.098, -0.005), (0.083, 0.075), 0.092, (0.082, -0.088), -0.1),  # hollow cheeks
    (0.155, (0.118, 0.01), (0.096, 0.098), 0.118, (0.092, -0.08), -0.094),  # the eyes, the widest
    (0.21, (0.113, 0.02), (0.092, 0.106), 0.126, (0.08, -0.062), -0.078),  # brow
    (0.255, (0.078, 0.03), (0.063, 0.092), 0.108, (0.052, -0.022), -0.036),  # crown
]
APEX = V(0, 0.04, 0.282)


def skull_rings():
    rings = []
    for z, side, corner, back, front_corner, front in SKULL:
        ring = [side, corner, (0, back), (-corner[0], corner[1]), (-side[0], side[1]),
                (-front_corner[0], front_corner[1]), (0, front), front_corner]
        rings.append([V(x, y, z) for x, y in ring])
    return rings


def on_skull(x, y, z, lift):
    """The point of the skull's surface at height z in the direction of (x, y) from its middle, `lift`
    out from it."""
    rings = skull_rings() + [[APEX] * 8]
    heights = [ring[0].z for ring in rings]
    k = max(i for i, h in enumerate(heights[:-1]) if h <= z) if z >= heights[0] else 0
    t = clamp01((z - heights[k]) / (heights[k + 1] - heights[k]))
    ring = [a.lerp(b, t) for a, b in zip(rings[k], rings[k + 1])]
    centre = V(0, 0.01, z)
    d = V(x, y - centre.y, 0).normalized()
    best = None
    for a, b in zip(ring, ring[1:] + ring[:1]):
        # Where the ray from the centre along d crosses the edge a-b, in the plane.
        e = b - a
        den = d.x * e.y - d.y * e.x
        if abs(den) < 1e-9:
            continue
        w = a - centre
        s = (w.x * e.y - w.y * e.x) / den
        u = (w.x * d.y - w.y * d.x) / den
        if s > 0 and -1e-6 <= u <= 1 + 1e-6 and (best is None or s < best):
            best = s
    best = best or 0.0
    return centre + (best + lift) * d


def head():
    """The head in its own frame, upright and facing -Y, its origin under the chin."""
    rings = skull_rings()
    verts, faces, _ = loft(rings)
    apex = len(verts)
    verts.append(APEX)
    last = (len(rings) - 1) * 8
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    faces.append(tuple(range(8)))
    part('skull', verts, faces, M['skin'], inside=V(0, 0.01, 0.14))

    def front(band):
        tris = []
        for i in (4, 5, 6, 7):
            a, b = rings[band][i], rings[band][(i + 1) % 8]
            c, d = rings[band + 1][(i + 1) % 8], rings[band + 1][i]
            tris += [(a, b, c), (a, c, d)]
        return tris

    face = front(2) + front(3)
    jaw = front(1)

    def on(tris, x, z, lift):
        return V(x, on_surface(tris, x, z) - lift, z)

    # The eyes: big, round and pale, each a low hexagonal dome with a small dark pupil.
    for s in (-1, 1):
        cx, cz, rx, rz = s * 0.047, 0.152, 0.04, 0.043
        rim = [on(face, cx + rx * math.cos(a), cz + rz * math.sin(a), 0.003)
               for a in (math.tau * i / 6 for i in range(6))]
        middle = on(face, cx, cz, 0.013)
        verts = rim + [middle]
        dome = [(i, (i + 1) % 6, 6) for i in range(6)]
        part(f'eye-{s}', verts, dome, M['eyes'], inside=middle + V(0, 0.05, 0))
        pupil = [middle + V(0.008, -0.002, 0), middle + V(0, -0.002, 0.012), middle + V(-0.008, -0.002, 0),
                 middle + V(0, -0.002, -0.012)]
        part(f'pupil-{s}', pupil, [(0, 1, 2, 3)], M['pupils'], outward=V(0, -1, 0))

    # A wide mouth, open in a hiss, and a few teeth.
    outline = [(-0.058, 0.072), (-0.02, 0.082), (0.02, 0.082), (0.058, 0.072), (0.02, 0.057), (-0.02, 0.057)]
    verts = [on(jaw, x, z, 0.004) for x, z in outline]
    part('mouth', verts, [(0, 1, 5), (1, 2, 4, 5), (2, 3, 4)], M['mouth'], outward=V(0, -1, 0))
    for k, (x, z, down) in enumerate(((-0.026, 0.08, -0.016), (0.022, 0.08, -0.016), (0.006, 0.058, 0.013))):
        verts = [on(jaw, x - 0.007, z, 0.007), on(jaw, x + 0.007, z, 0.007), on(jaw, x, z + down, 0.007)]
        part(f'tooth-{k}', verts, [(0, 1, 2)], M['teeth'], outward=V(0, -1, 0))

    # A small flat nose between the eyes.
    top, tip, under = V(0, -0.099, 0.125), V(0, -0.118, 0.1), V(0, -0.103, 0.09)
    left, right = V(0.016, -0.097, 0.097), V(-0.016, -0.097, 0.097)
    verts = [top, left, under, right, tip]
    part('nose', verts, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], M['skin'], inside=V(0, -0.08, 0.1))

    # Ears a little pointed, like a hobbit's, swept back.
    for s in (-1, 1):
        base = [V(s * 0.112, -0.01, 0.135), V(s * 0.114, 0.05, 0.14), V(s * 0.11, 0.035, 0.19),
                V(s * 0.112, -0.005, 0.175)]
        tip = V(s * 0.168, 0.07, 0.195)
        verts = base + [tip]
        part(f'ear-{s}', verts, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], M['skin'],
             inside=V(s * 0.09, 0.02, 0.16))

    hair()


# A few lank strands from round the crown, which is bald: points over the skull, each (x, y, z) giving
# the direction from its middle and the height, then the free end, in the head's frame. One falls over
# his forehead, so that hair shows from the front too.
STRANDS = [
    ([(0.2, 1.0, 0.262), (0.3, 1.0, 0.2), (0.35, 1.0, 0.12)], (0.045, 0.125, 0.05)),
    ([(-0.5, 1.0, 0.255), (-0.75, 1.0, 0.19), (-0.8, 1.0, 0.1)], (-0.1, 0.09, 0.025)),
    ([(0.8, 0.4, 0.25), (1.0, 0.45, 0.19), (1.0, 0.4, 0.105)], (0.125, 0.065, 0.035)),
    ([(-0.7, -0.2, 0.255), (-1.0, -0.5, 0.215), (-1.0, -0.6, 0.15)], (-0.12, -0.05, 0.08)),
    ([(0.35, -0.5, 0.265), (0.7, -0.85, 0.238), (1.0, -0.8, 0.2)], (0.122, -0.055, 0.13)),
]


def hair():
    for k, (path, end) in enumerate(STRANDS):
        # Each grows out of the skull, so its open root is hidden inside it.
        points = [on_skull(x, y, z, -0.012 if i == 0 else 0.006) for i, (x, y, z) in enumerate(path)]
        bent_tube(f'strand-{k}', points, [(0.014, 0.006)] * len(points), M['hair'], n=3, end=V(*end))


def head_frame(at):
    """The matrix that carries the head from its own frame to `at`, its socket, tipped back."""
    return (Matrix.Translation(at) @ Matrix.Rotation(math.radians(HEAD_TILT), 4, 'X')
            @ Matrix.Scale(HEAD_SCALE, 4) @ Matrix.Translation(-HEAD_SOCKET))


# Limbs -------------------------------------------------------------------------------------------

UPPER_ARM, FOREARM = 0.22, 0.23  # long, thin arms
THIGH, SHIN = 0.24, 0.25


def hand(name, wrist, ahead, up, inner, fingers):
    """A long thin hand: a flat palm from `wrist` along `ahead`, its back towards `up`, and fingers
    given in its own frame as (knuckle, middle, tip, radius), each point (along, inwards, up)."""
    ahead = Vector(ahead).normalized()
    up = Vector(up)
    up = (up - up.dot(ahead) * ahead).normalized()
    across = up.cross(ahead) * inner

    def at(a, s, u):
        return wrist + a * ahead + s * across + u * up

    box(f'{name}-palm', at(0.04, 0, 0), [ahead, across, up], (0.048, 0.04, 0.016), M['skin'], 0.9)
    for k, (knuckle, middle, tip, r) in enumerate(fingers):
        bent_tube(f'{name}-finger-{k}', [at(*knuckle), at(*middle)], [r, 0.85 * r], M['skin'], n=4,
                  end=at(*tip))


FLAT = [  # fingers splayed on the ground: (along, inwards, up)
    ((0.03, 0.032, 0.0), (0.062, 0.066, 0.008), (0.094, 0.08, -0.014), 0.016),  # thumb
    ((0.078, 0.022, 0.0), (0.125, 0.034, 0.02), (0.165, 0.04, -0.014), 0.015),
    ((0.084, 0.0, 0.0), (0.135, 0.0, 0.022), (0.18, -0.004, -0.014), 0.015),
    ((0.078, -0.024, 0.0), (0.12, -0.044, 0.018), (0.158, -0.06, -0.014), 0.014),
]
CLAW = [  # fingers hooked like claws
    ((0.03, 0.032, 0.0), (0.062, 0.06, -0.01), (0.078, 0.066, -0.05), 0.016),  # thumb
    ((0.078, 0.022, 0.0), (0.12, 0.034, 0.006), (0.14, 0.04, -0.05), 0.015),
    ((0.084, 0.0, 0.0), (0.128, 0.0, 0.006), (0.15, -0.004, -0.053), 0.015),
    ((0.078, -0.024, 0.0), (0.116, -0.04, 0.004), (0.135, -0.05, -0.047), 0.014),
]

# Each wrist and the way its hand points: the left hand flat on the ground, the right lifted to grab.
L_WRIST, L_AHEAD = V(0.2, -0.235, 0.05), V(-0.1, -1, -0.2)
R_WRIST, R_AHEAD = V(-0.2, -0.31, 0.15), V(0.1, -1, -0.5)


def arms():
    """Each arm from the hunched shoulder to its hand, the elbow bent out and back like a spider's."""
    for side, sign, wrist, ahead, up, fingers, pole in (
        ('left', 1, L_WRIST, L_AHEAD, V(0, 0, 1), FLAT, V(0.7, 0.3, 0.12)),
        ('right', -1, R_WRIST, R_AHEAD, V(0, 0.5, 1), CLAW, V(-0.6, 0.35, 0.2)),
    ):
        shoulder = hunched(V(sign * 0.1, 0.12, 0.405))
        elbow = bend(shoulder, wrist, UPPER_ARM, FOREARM, shoulder + pole)
        bent_tube(f'arm-{side}', [shoulder, elbow, wrist + 0.02 * ahead.normalized()], [0.048, 0.038, 0.031],
                  M['skin'], n=6)
        hand(f'hand-{side}', wrist, ahead, up, -sign, fingers)


# Feet: long, flat and big, bigger than any other hobbit's, with long splayed toes. The right foot
# in its own frame, toes towards -y, the big toe's side (+x) inwards; rings from the heel round.
FOOT = [
    [(0.0, 0.1, 0.0), (0.034, 0.08, 0.0), (0.048, -0.02, 0.0), (0.058, -0.11, 0.0), (0.05, -0.16, 0.0),
     (0.015, -0.172, 0.0), (-0.02, -0.168, 0.0), (-0.05, -0.15, 0.0), (-0.062, -0.08, 0.0),
     (-0.04, 0.072, 0.0)],
    [(0.0, 0.093, 0.035), (0.033, 0.074, 0.034), (0.046, -0.02, 0.034), (0.054, -0.105, 0.03),
     (0.044, -0.152, 0.026), (0.014, -0.162, 0.026), (-0.018, -0.158, 0.026), (-0.045, -0.142, 0.026),
     (-0.057, -0.078, 0.03), (-0.038, 0.066, 0.034)],
    [(0.0, 0.07, 0.08), (0.024, 0.062, 0.08), (0.032, 0.04, 0.08), (0.03, 0.01, 0.076),
     (0.018, -0.008, 0.072), (0.0, -0.014, 0.072), (-0.018, -0.008, 0.072), (-0.03, 0.01, 0.076),
     (-0.032, 0.04, 0.08), (-0.024, 0.062, 0.08)],
]
TOES = [  # base, tip and radius of each toe, from the big toe out
    ((0.04, -0.15, 0.018), (0.055, -0.245, 0.006), 0.021),
    ((0.012, -0.16, 0.017), (0.016, -0.255, 0.005), 0.018),
    ((-0.018, -0.155, 0.016), (-0.026, -0.24, 0.005), 0.017),
    ((-0.044, -0.14, 0.015), (-0.062, -0.215, 0.005), 0.016),
]
FOOT_SCALE = 1.15
ANKLE = (0.0, 0.035, 0.07)  # where the shin goes in, in the foot's frame

R_FOOT, R_YAW = V(-0.2, 0.15, 0), -25
L_FOOT, L_YAW = V(0.2, 0.13, 0), 25


def foot(name, at, yaw, inner):
    """A big bare foot at `at`, turned by `yaw`, its big toe towards `inner` (+1 for the right foot,
    -1 for the left); returns where the shin goes into it."""
    spin = Matrix.Rotation(math.radians(yaw), 3, 'Z')

    def place(p):
        return at + spin @ (FOOT_SCALE * V(inner * p[0], p[1], p[2]))

    rings = [[place(p) for p in ring] for ring in FOOT]
    verts, faces, _ = loft(rings)
    axis = [place((0, 0.05, 0.045)), place((0, -0.12, 0.016))]
    part(name, verts, faces, M['skin'], inside=nearest_on_polyline(axis))
    for k, (base, tip, r) in enumerate(TOES):
        # Flattened, lying on the ground; their roots are inside the foot.
        cone(f'{name}-toe-{k}', place(base), place(tip), FOOT_SCALE * r, M['skin'], n=4, squash=0.6,
             back=None)
    return place(ANKLE)


def legs():
    """Each leg from the hip to its foot, the knee bent high, out and forward: a frog's crouch."""
    for side, sign, at, yaw in (('right', -1, R_FOOT, R_YAW), ('left', 1, L_FOOT, L_YAW)):
        ankle = foot(f'foot-{side}', at, yaw, -sign)
        hip = hunched(V(sign * 0.065, 0.125, 0.2))
        pole = hip + V(sign * 0.5, -0.4, 0.4)
        knee = bend(hip, ankle, THIGH, SHIN, pole)
        bent_tube(f'leg-{side}', [hip, knee, ankle], [0.062, 0.044, 0.036], M['skin'], n=6)


SHIFT = V(0, 0.07, 0)  # the whole figure, moved so that his footprint is centred on the origin


def main():
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    kerchief()
    hunch(new_objects(before))
    loincloth()
    knot()
    # The head on the end of his neck, thrust out in front of his shoulders.
    root = hunched(NECK)
    along = (hunched(NECK + V(0, 0, 0.02)) - root).normalized()
    socket = root + NECK_LENGTH * (along + V(0, 0, 0.6)).normalized()
    before = set(bpy.context.scene.objects)
    head()
    frame = head_frame(socket)
    for obj in new_objects(before):
        obj.data.transform(frame)
    tube('neck', root, socket + 0.02 * (socket - root).normalized(), [(0, 0.05), (1, 0.046)], M['skin'])
    arms()
    # Centred on his footprint, from his heels to his fingertips.
    for obj in bpy.context.scene.objects:
        obj.data.transform(Matrix.Translation(SHIFT))
    finish('gollum')


main()
