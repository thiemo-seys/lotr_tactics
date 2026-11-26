"""The Balrog of Moria, Durin's Bane: the late-game Large PvE monster (packages/sim/src/data/monsters.ts),
in the Faceted style (docs/viewer-spec.md section 4).

After the films' Balrog, as faithfully as the style allows: a massive, hunched, bestial demon, its broad
bull's skull carried low before its shoulders, with a deep brow, a heavy jaw hanging open on a mouth of
fire, and great thick horns sweeping out from the brow and curving forward, the silhouette people
remember. Its hide is charred and rocky, like cooling lava, in facets of `hide` and `crust` with here and
there a facet of `ember` glowing through, and molten cracks of `fire` across its chest, belly, back,
arms, thighs and tail. Fire bursts from the back of its head behind the horns, and from its shoulders and
the hump of its back, as broad tongues of flame (faceted faces in two emissive colours, `fire` and
`flame`, flat shaded, no textures). Bat wings of shadow are raised up and back behind it; it is huge
across the shoulders, with long, heavy arms and great clawed fists; it stands on digitigrade legs, the
knee forward and the hock back, on three-clawed feet; and a long, spiked tail curls round behind it to
its right. In its right hand a sword whose blade is a tongue of flame, its hilt black iron; in its left
a whip of six thongs of flame, hanging from an iron handle.

About 3.0 tall to the tips of its wings, 2.7 to the tips of its horns, built at full size as Treebeard
is (treebeard.py, the Large pattern) and reaching 0.89 from its centre.

Its livery, ember (packages/client/src/livery.json), is the scorched crust of its hide: great plates over
its shoulders, which show from the front and from above, a ridge of dorsal plates down its spine between
the wings, which shows from behind, and a girdle with a tattered hanging before and behind, dull and
matte against the black of it and the brightness of the fire. Its fittings, the sword's guard and
pommel, the whip's band and the girdle's buckle, use `trim`, which the client colours iron at 1★, the
only star level a monster has.

It is rigged as a Large figure (../rig.py, Rig(kind='large')) with the 16 bones and nine of its own: the
whip's three, `whip_1` to `whip_3`, from the handle out; its wings, `wing_l` and `wing_r`, on the spine;
the fire of its head, `mane`, on its head; and its tail's three, `tail_1` to `tail_3`, the first hanging
from the root and carried where the hips go (tailed()), as a robe is, so the hips can go down past it.
Its legs bend at the knee, where the thigh runs on inside the shin; its hock is the rig's ankle, so the
foot bone carries the shank and the paw; its body bends at the waist, where the upper body runs on inside
the lower; and its arms at the elbow.

Its attack is a ranged one in the sim (range 2, monsters.ts): a bolt of fire. It sweeps the sword up
and back beside its right shoulder, outside its horn, and slashes it down before it, flinging the bolt
from the blade's point at the foe as the shot leaves on frame 3 (its muzzle). Its cast, Whip of flame (a
cone of the three hexes ahead and the three beyond them, at the end of a 0.5 s wind-up), draws the whip
back behind it, swings it up outside its left horn and cracks it out across the cone in front on the
release, the thongs streaming ahead, then sweeps them down to the right. As it wins it rears up, sword
and whip raised and its wings lifted. The whip hangs and trails after the hand in every other clip
(clips.swaying()), the fire of its head streams after the head, and the tail and wings are kept out of
the ground and inside the hex in every frame (relieved()).

    blender --background --factory-startup --python-exit-code 1 --python balrog.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so its right hand is at -X.
"""

import math
import os
import random
import sys

import numpy as np
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from clips import (  # noqa: E402
    BLOW,
    EASES,
    ROOM,
    Body,
    Keys,
    arc,
    degrees_of,
    fit,
    frames_for,
    made,
    swaying,
    timed,
    wave,
)
from kit import (  # noqa: E402
    LARGE_BUDGET,
    V,
    bone,
    box,
    cone,
    finish,
    loft,
    material,
    nearest_on_polyline,
    part,
    path_rings,
    reset,
    team_material,
    trim_material,
    tube,
    wind,
)
from rig import Clip, Rig, hold, joint, measured, turn_of  # noqa: E402

# Its own colours (sRGB).
HIDE = 0x181414  # its hide, charred black...
CRUST = 0x2E2622  # ...in facets of cooled rock
WING = 0x1F1B1E  # its wings, shadow...
SMOKE = 0x2B262A  # ...in panels of smoke
HORN = 0x6A5A4C  # pale horn, so the horns show against the dark of the wings and the fire
CLAWS = 0x2A2220  # horn-dark claws, spikes and horn tips
EMBER = 0x6E1E08  # embers glowing dimly through its hide
FIRE = 0xF2641A  # its fire, and the molten cracks...
FLAME = 0xFFB238  # ...brightest at the tips of the flames
EYES = 0xFFE07A  # eyes of flame
IRON = 0x2E2B2B  # the sword's grip and the whip's handle, black iron

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        hide=material('hide', HIDE, roughness=0.92),
        crust=material('crust', CRUST, roughness=0.95),
        wing=material('wing', WING, roughness=0.95),
        smoke=material('smoke', SMOKE, roughness=0.95),
        horn=material('horn', HORN, roughness=0.7),
        claws=material('claws', CLAWS, roughness=0.7),
        # The glowing parts: a dark base colour, so the light falling on them doesn't wash them out,
        # and the colour itself as their emission, which the client keeps under a hit's flash.
        ember=material('ember', 0x3A1006, roughness=0.8, emission=EMBER, emission_strength=1.0),
        fire=material('fire', 0x5A2008, roughness=0.8, emission=FIRE, emission_strength=1.0),
        flame=material('flame', 0x6A4010, roughness=0.8, emission=FLAME, emission_strength=1.0),
        eyes=material('eyes', 0x6A5020, roughness=0.6, emission=EYES, emission_strength=1.0),
        iron=material('iron', IRON, roughness=0.6, metallic=0.1),
        trim=trim_material(),  # the sword's guard and pommel, the whip's band, the buckle
    )


def skin():
    return [M['hide'], M['crust'], M['ember']]


def lava(n, bands, seed, glow=0.06):
    """Material indexes for the faces of a lofted tube of n sides: hide and crust in a checker, so the
    facets read, and here and there a facet of ember glowing through, the same every build."""
    rnd = random.Random(seed)
    out = []
    for f in range(n * bands):
        i, b = f % n, f // n
        out.append(2 if rnd.random() < glow else (i + b) % 2)
    return out


def limb(name, points, radii, n, seed, glow=0.06, end=None, side=None):
    """A bent tube of hide along `points` (path_rings()), open at its ends unless `end` gives a point to
    draw it to; returns its rings and points, so cracks can be laid along it."""
    points = [Vector(p) for p in points]
    rings = path_rings(points, radii, n, 0.0, side)
    verts, faces, _ = loft(rings)
    face_mats = lava(n, len(rings) - 1, seed, glow)
    faces = wind(verts, faces, inside=nearest_on_polyline(points))
    if end is not None:
        first = (len(rings) - 1) * n
        verts.append(Vector(end))
        faces += wind(verts, [(first + i, first + (i + 1) % n, len(verts) - 1) for i in range(n)],
                      inside=points[-1] - 0.01 * (points[-1] - points[-2]).normalized())
        face_mats += [face_mats[-1]] * n
    part(name, verts, faces, skin(), face_mats)
    return rings, points


def crack(name, centres, normals, width=0.03):
    """A molten crack: a thin strip of fire along the surface through `centres`, lifted along `normals`."""
    verts = []
    for i, c in enumerate(centres):
        ahead = centres[min(i + 1, len(centres) - 1)] - centres[max(i - 1, 0)]
        across = ahead.cross(normals[i]).normalized()
        w = width * (0.5 if i in (0, len(centres) - 1) else 1.0)
        verts += [c - 0.5 * w * across, c + 0.5 * w * across]
    faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(centres) - 1)]
    part(name, verts, faces, M['fire'], outward=sum(normals, Vector()))


def ring_crack(name, rings, points, path, width=0.03, lift=1.06):
    """A crack along a tube's surface: `path` is (ring, position round the ring) pairs, both fractional."""
    centres, normals = [], []
    for k, pos in path:
        k0 = int(k)
        k1 = min(k0 + 1, len(rings) - 1)

        def at(r):
            n = len(rings[r])
            i = int(pos) % n
            return rings[r][i].lerp(rings[r][(i + 1) % n], pos - int(pos))

        p = at(k0).lerp(at(k1), k - k0)
        axis = points[k0].lerp(points[k1], k - k0)
        centres.append(axis + (p - axis) * lift)
        normals.append((p - axis).normalized())
    crack(name, centres, normals, width)


def flame(name, base, way, length, radius, curl=None, n=3, phase=0.0):
    """A tongue of flame from `base` (hidden in what it rises from) along `way`, about `length` long: a
    faceted point of n sides, bent towards `curl` as it rises, its lower band `fire` and its tip `flame`.
    Each tongue is a little different, seeded by its name, so the fire flickers rather than standing in
    a crown."""
    base, way = Vector(base), Vector(way).normalized()
    jitter = random.Random(name)
    length *= jitter.uniform(0.8, 1.15)
    way = (way + V(jitter.uniform(-0.15, 0.15), jitter.uniform(-0.1, 0.1), 0)).normalized()
    curl = Vector(curl).normalized() if curl is not None else V(0, 0, 0)
    middle = base + 0.5 * length * way + 0.12 * length * curl
    tip = base + length * way + 0.35 * length * curl
    rings = path_rings([base, middle], [radius, 0.55 * radius], n, phase)
    verts = rings[0] + rings[1] + [tip]
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    faces += [(n + i, n + (i + 1) % n, 2 * n) for i in range(n)]
    face_mats = [0] * n + [1] * n
    faces = wind(verts, faces, inside=nearest_on_polyline([base, middle, tip]))
    return part(name, verts, faces, [M['fire'], M['flame']], face_mats)


# The body ---------------------------------------------------------------------------------------
#
# Rings of eight round it, built hunched: z, half-width, depth before and behind, and centre y. Narrow
# hips, a deep belly, a vast chest and shoulders with a hump of muscle behind them, the neck carried
# forward and low. It bends at the waist in two pieces: the lower body on the hips, from the fork of the
# legs to 1.5, and the upper body on the spine, from a ring inside it at 1.36 up to its neck.
BODY = [
    (0.98, 0.22, 0.17, 0.17, 0.06),  # the fork of the legs
    (1.18, 0.35, 0.26, 0.26, 0.06),  # hips
    (1.42, 0.33, 0.27, 0.24, 0.04),  # the belly
    (1.66, 0.44, 0.33, 0.28, 0.0),  # under the chest
    (1.88, 0.5, 0.36, 0.34, -0.03),  # the chest
    (2.04, 0.53, 0.3, 0.4, -0.04),  # the shoulders, humped behind
    (2.18, 0.34, 0.22, 0.33, -0.06),  # the hump
    (2.25, 0.18, 0.15, 0.17, -0.2),  # the neck, carried forward
]
SIDES = 8
WAIST_TOP, WAIST_INSIDE = 1.5, 1.36
PELVIS, WAIST, NECK = V(0, 0.06, 1.16), V(0, 0.04, 1.42), V(0, -0.16, 2.2)


def body_ring(z, rx, front, back, cy):
    points = []
    for i in range(SIDES):
        a = math.radians(22.5 + 45 * i)
        s = math.sin(a)
        points.append(V(rx * math.cos(a), cy + (back if s > 0 else front) * s, z))
    return points


def body_row(z):
    """The BODY row at height z, between the rows either side."""
    for a, b in zip(BODY, BODY[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return tuple(p + t * (q - p) for p, q in zip(a, b))
    raise ValueError(f'no body at z = {z}')


def on_body(z, angle, k=1.03):
    """A point on the body at height z, `angle` degrees round from its left (+X) towards its back (+Y),
    pushed out by k, and the outward normal there (level)."""
    _, rx, front, back, cy = body_row(z)
    a = math.radians(angle)
    s = math.sin(a)
    p = V(k * rx * math.cos(a), cy + k * (back if s > 0 else front) * s, z)
    return p, (p - V(0, cy, z)).normalized()


def body_crack(name, path):
    centres, normals = zip(*(on_body(z, a, 1.02) for z, a in path))
    crack(name, list(centres), list(normals), 0.04)


def body():
    lower = [body_ring(*row) for row in BODY[:3]] + [body_ring(*body_row(WAIST_TOP))]
    verts, faces, _ = loft(lower)
    face_mats = lava(SIDES, 3, 11, 0.05)
    verts.append(V(0, 0.06, 0.92))
    faces += [(i, (i + 1) % SIDES, len(verts) - 1) for i in range(SIDES)]  # closed between the legs
    face_mats += [0] * SIDES
    with bone('hips'):
        part('body-lower', verts, faces, skin(), face_mats, inside=lambda c: V(0, 0.04, min(max(c.z, 1.0), 2.1)))
        # The fire within showing through its belly.
        body_crack('belly-crack', [(1.46, 272), (1.38, 268), (1.28, 274)])
        body_crack('belly-crack-left', [(1.44, 274), (1.4, 290), (1.32, 300)])
    upper = [body_ring(*body_row(WAIST_INSIDE))] + [body_ring(*row) for row in BODY[3:]]
    verts, faces, _ = loft(upper)
    face_mats = lava(SIDES, len(upper) - 1, 12, 0.05)
    verts.append(V(0, -0.2, 2.27))
    last = (len(upper) - 1) * SIDES
    faces += [(last + i, last + (i + 1) % SIDES, len(verts) - 1) for i in range(SIDES)]
    face_mats += [1] * SIDES
    with bone('spine'):
        part('body-upper', verts, faces, skin(), face_mats, inside=lambda c: V(0, -0.02, min(max(c.z, 1.0), 2.1)))
        # Molten cracks from the breastbone out over its chest and down its belly, and down its back.
        for k, path in enumerate((
            [(1.98, 268), (1.86, 262), (1.74, 270), (1.6, 266), (1.5, 272)],  # down the middle
            [(1.86, 262), (1.9, 245), (1.84, 228), (1.92, 212)],  # out over the right breast
            [(1.74, 270), (1.78, 290), (1.7, 308), (1.76, 326)],  # out under the left
            [(1.6, 266), (1.56, 248), (1.5, 236)],
            [(1.95, 100), (1.8, 88), (1.62, 96), (1.52, 86)],  # down the back
        )):
            body_crack(f'chest-crack-{k}', path)
    joint('pelvis', PELVIS)
    joint('waist', WAIST)
    joint('neck', NECK)


def livery():
    """The livery, the scorched crust of its hide in matte ember: great plates over its shoulders and a
    ridge of dorsal plates down its spine, on the spine, and a girdle round its hips with a tattered
    hanging before and behind, on the hips, its buckle in trim."""
    with bone('spine'):
        for s in (-1, 1):
            c = V(s * 0.46, 0.0, 2.07)
            rings = []
            for z, r in ((-0.14, 0.2), (0.0, 0.2), (0.08, 0.13)):
                rings.append([c + V(r * math.cos(math.radians(30 + 60 * i)) * (1.15 if i in (0, 5) else 1.0),
                                    1.2 * r * math.sin(math.radians(30 + 60 * i)), z) for i in range(6)])
            verts, faces, _ = loft(rings)
            verts.append(c + V(0, 0.02, 0.11))
            faces += [(12 + i, 12 + (i + 1) % 6, len(verts) - 1) for i in range(6)]
            part(f'plate-{s}', verts, faces, M['team'], inside=c + V(0, 0, -0.05))
            for k, (dx, dy) in enumerate(((0.06, -0.1), (0.1, 0.06))):  # spikes of crust standing up from it
                b = c + V(s * dx, dy, 0.07)
                cone(f'plate-spike-{s}-{k}', b, b + V(s * 0.05, 0.03, 0.13), 0.04, M['claws'], n=3, back=None)
        for k, z in enumerate((2.0, 1.82, 1.64)):  # dorsal plates, each its point raised up and back
            p, _ = on_body(z, 90, 1.0)
            w = 0.13 - 0.015 * k
            verts = [p + V(-w, -0.02, 0.06), p + V(w, -0.02, 0.06), p + V(0.7 * w, 0.0, -0.08),
                     p + V(-0.7 * w, 0.0, -0.08), p + V(0, 0.07, -0.03), p + V(0, 0.14, 0.12)]
            faces = [(0, 3, 4), (1, 4, 2), (3, 2, 4), (0, 4, 5), (4, 1, 5), (0, 5, 1), (0, 1, 2, 3)]
            part(f'ridge-{k}', verts, faces, M['team'], inside=p + V(0, -0.02, 0.0))
    with bone('hips'):
        p, _ = on_body(1.46, 90, 1.0)  # the last dorsal plate, below the waist
        w = 0.085
        verts = [p + V(-w, -0.02, 0.06), p + V(w, -0.02, 0.06), p + V(0.7 * w, 0.0, -0.08),
                 p + V(-0.7 * w, 0.0, -0.08), p + V(0, 0.07, -0.03), p + V(0, 0.14, 0.12)]
        faces = [(0, 3, 4), (1, 4, 2), (3, 2, 4), (0, 4, 5), (4, 1, 5), (0, 5, 1), (0, 1, 2, 3)]
        part('ridge-3', verts, faces, M['team'], inside=p + V(0, -0.02, 0.0))
        band = []
        for z in (1.12, 1.28):
            _, rx, front, back, cy = body_row(z)
            band.append(body_ring(z, rx * 1.07, front * 1.07, back * 1.07, cy))
        verts, faces, _ = loft(band)
        part('girdle', verts, faces, M['team'], inside=lambda c: V(0, 0.05, c.z))
        for name, y, sign, drop, w in (('loin-front', -0.27, -1, 0.4, 0.2), ('loin-back', 0.33, 1, 0.5, 0.24)):
            top = 1.18
            verts = [V(-w, y, top), V(w, y, top),
                     V(-0.95 * w, y + sign * 0.06, top - 0.5 * drop), V(0.95 * w, y + sign * 0.06, top - 0.5 * drop),
                     V(-0.85 * w, y + sign * 0.08, top - drop), V(-0.4 * w, y + sign * 0.08, top - 0.82 * drop),
                     V(0.0, y + sign * 0.09, top - drop - 0.06), V(0.45 * w, y + sign * 0.08, top - 0.85 * drop),
                     V(0.85 * w, y + sign * 0.08, top - drop + 0.02)]
            faces = [(0, 1, 3, 2), (2, 3, 8, 7, 6, 5, 4)]
            part(name, verts, faces, M['team'], outward=V(0, sign, 0))
        box('buckle', V(0, -0.31, 1.2), [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)], (0.02, 0.06, 0.05), M['trim'])


def back_fire():
    """Fire rising from its shoulders and the hump of its back behind its head, streaming up and a little
    back, in broad tongues that join the fire of its head, on the spine."""
    with bone('spine'):
        for k, (base, way, length, r) in enumerate((
            ((0.0, 0.14, 2.2), (0, 0.25, 1), 0.56, 0.15),  # the great blaze behind its head
            ((0.2, 0.16, 2.16), (0.3, 0.25, 1), 0.5, 0.12),
            ((-0.2, 0.16, 2.16), (-0.3, 0.25, 1), 0.5, 0.12),
            ((0.4, 0.06, 2.12), (0.3, 0.25, 1), 0.34, 0.08),
            ((-0.4, 0.06, 2.12), (-0.3, 0.25, 1), 0.34, 0.08),
        )):
            flame(f'back-flame-{k}', V(*base), V(*way), length, r, curl=V(0, 0.5, 1), n=4 if r > 0.1 else 3,
                  phase=45 * (k % 2))


# Wings: bat wings of shadow, raised up and back from its shoulder blades, an arm up to a high wrist and
# four fingers from it, the membrane between them scalloped, in panels of shadow and smoke. Each is on a
# bone of its own from the spine, `wing_l` and `wing_r`, from its root to its wrist. They reach 0.89 from
# the centre, so they may lift and fold but never spread.
WING_ROOT = V(0.18, 0.34, 2.02)
WING_LOW = V(0.12, 0.36, 1.5)
WING_ELBOW = V(0.4, 0.6, 2.4)
WING_WRIST = V(0.62, 0.46, 2.76)
FINGERS = [V(0.78, 0.3, 3.0), V(0.84, 0.3, 2.4), V(0.7, 0.52, 1.8), V(0.42, 0.62, 1.42)]


def wings():
    for s, side in ((1, 'l'), (-1, 'r')):
        def m(p):
            return V(s * p.x, p.y, p.z)

        root, low, elbow, wrist = m(WING_ROOT), m(WING_LOW), m(WING_ELBOW), m(WING_WRIST)
        tips = [m(f) for f in FINGERS]
        with bone(f'wing_{side}'):
            rings = path_rings([root, elbow, wrist], [0.06, 0.05, 0.04], 4)
            verts, faces, _ = loft(rings)
            part(f'wing-arm-{side}', verts, wind(verts, faces, inside=nearest_on_polyline([root, elbow, wrist])),
                 M['hide'])
            cone(f'wing-claw-{side}', wrist, wrist + m(V(0.02, -0.06, 0.14)), 0.03, M['claws'], n=3, back=None)
            for k, t in enumerate(tips):
                cone(f'wing-finger-{side}-{k}', wrist, t, 0.03, M['hide'], n=3, back=None)
            # The membrane, fanned from the wrist, scalloped between the fingertips.
            rim = [tips[0]]
            for a, b in zip(tips, tips[1:]):
                rim += [wrist.lerp(a.lerp(b, 0.5), 0.72), b]
            rim += [low, elbow.lerp(low, 0.5), root, elbow]
            verts = [wrist] + rim
            faces = [(0, i, i + 1) for i in range(1, len(rim))]
            part(f'wing-{side}', verts, faces, [M['wing'], M['smoke']], [(i // 2) % 2 for i in range(len(faces))],
                 outward=V(0, 1, 0))
        joint(f'wing_{side}_root', root)
        joint(f'wing_{side}_peak', wrist)


# Legs: digitigrade, on clawed feet -----------------------------------------------------------------
#
# The thigh from the hip down and forward to the knee, the shin back down to the hock, high off the
# ground, and the shank down from it to the paw. The rig's ankle is the hock, so its foot bone carries the
# shank and the paw together, and the knee, forward of the line from hip to hock, bends forward.
LEG = [V(0.27, 0.06, 1.16), V(0.33, -0.2, 0.76), V(0.35, 0.16, 0.4), V(0.35, 0.02, 0.12)]  # hip, knee, hock, ankle


def legs():
    for s, side in ((1, 'left'), (-1, 'right')):
        c = side[0]
        dy = 0.04 if s < 0 else -0.02  # the left foot a little forward
        hip, knee, hock, ankle = (V(s * p.x, p.y + dy, p.z) for p in LEG)
        with bone(f'thigh_{c}'):
            past = knee + 0.07 * (hock - knee).normalized()
            rings, points = limb(f'thigh-{side}', [hip + V(0, 0, 0.06), hip.lerp(knee, 0.5), past],
                                 [0.2, (0.2, 0.22), 0.15], 6, 20 + s)
            ring_crack(f'thigh-crack-{side}', rings, points, [(0.2, 3.8), (0.9, 3.5), (1.5, 3.9), (1.9, 3.6)])
        with bone(f'shin_{c}'):
            above = knee + 0.05 * (hip - knee).normalized()
            limb(f'shin-{side}', [above, knee.lerp(hock, 0.5), hock + 0.04 * (hock - knee).normalized()],
                 [0.14, 0.13, 0.1], 6, 30 + s, 0.08)
        with bone(f'foot_{c}'):
            limb(f'shank-{side}', [hock - 0.03 * (hock - knee).normalized(), ankle], [0.1, 0.085], 6, 40 + s, 0.0)
            foot(side, ankle)
        joint(f'hip_{c}', hip)
        joint(f'knee_{c}', knee)
        joint(f'ankle_{c}', hock)


def foot(side, ankle):
    """A heavy clawed foot: a pad from the ankle to the ground, three great claws ahead and a spur behind."""
    at = V(ankle.x, ankle.y, 0)
    rows = [(0.0, -0.08, 0.13, 0.19), (0.07, -0.07, 0.13, 0.18), (0.15, 0.0, 0.09, 0.09)]
    rings = [[at + V(rx * math.cos(math.radians(30 + 60 * i)), cy + ry * math.sin(math.radians(30 + 60 * i)), z)
              for i in range(6)] for z, cy, rx, ry in rows]
    verts, faces, bands = loft(rings)
    face_mats = [0 if b == 0 else 1 for b in bands]
    verts.append(at + V(0, -0.08, 0))
    faces += [(i, (i + 1) % 6, len(verts) - 1) for i in range(6)]  # the sole
    face_mats += [0] * 6
    part(f'foot-{side}', verts, faces, [M['hide'], M['crust']], face_mats, inside=at + V(0, -0.04, 0.07))
    for k, x in enumerate((-0.08, 0.0, 0.08)):
        cone(f'toe-claw-{side}-{k}', at + V(x, -0.2, 0.06), at + V(1.35 * x, -0.36, 0.005), 0.04, M['claws'], n=3,
             back=None)
    cone(f'spur-{side}', at + V(0, 0.06, 0.08), at + V(0, 0.2, 0.01), 0.035, M['claws'], n=3, back=None)
    joint(f'toe_{side[0]}', at + V(0, -0.33, 0.04))


# The tail: long and heavy, down behind it and curling round to its right, its tip turned forward, clear
# of the ground; on a chain of three bones, tail_1 to tail_3, each point of it following the bone of the
# length it is on.
TAIL = [V(0.0, 0.26, 1.12), V(0.0, 0.5, 0.86), V(-0.03, 0.64, 0.56), V(-0.15, 0.72, 0.36),
        V(-0.38, 0.68, 0.28), V(-0.58, 0.5, 0.28), V(-0.68, 0.28, 0.32)]
TAIL_RADII = [0.13, 0.12, 0.1, 0.085, 0.07, 0.055, 0.045]
TAIL_TIP = V(-0.66, 0.08, 0.38)
TAIL_JOINTS = (('tail_root', 0), ('tail_a', 2), ('tail_b', 4), ('tail_end', 7))  # by index in TAIL + tip
TAIL_BONES = ('tail_1', 'tail_2', 'tail_3')


def tail_bone(p):
    """The bone of the length of the tail a point is nearest."""
    points = TAIL + [TAIL_TIP]
    nearest = min(range(len(points)), key=lambda i: (points[i] - p).length)
    return TAIL_BONES[0] if nearest < 2 else TAIL_BONES[1] if nearest < 4 else TAIL_BONES[2]


def tail():
    with bone('tail_1', follows=tail_bone):
        rings, points = limb('tail', TAIL, TAIL_RADII, 6, 50, 0.08, end=TAIL_TIP, side=V(0, 0, 1))
        ring_crack('tail-crack', rings, points, [(1, 1.5), (2, 1.3), (3, 1.6), (4, 1.4), (5, 1.5), (5.8, 1.5)])
        for k, t in enumerate((1.4, 2.4, 3.4, 4.4)):  # a ridge of spikes along the top of it
            i = int(t)
            c = points[i].lerp(points[i + 1], t - i)
            r = TAIL_RADII[i] + (TAIL_RADII[i + 1] - TAIL_RADII[i]) * (t - i)
            up = ((c - V(0, 0.2, c.z)).normalized() * 0.5 + V(0, 0, 0.6)).normalized()
            cone(f'tail-spike-{k}', c + 0.6 * r * up, c + (r + 0.1) * up, 0.035, M['claws'], n=3, back=None)
    points = TAIL + [TAIL_TIP]
    for name, i in TAIL_JOINTS:
        joint(name, points[i])


# The head ----------------------------------------------------------------------------------------

HEAD = V(0, -0.35, 1.96)  # the middle of the underside of its jaw, before its shoulders
HEAD_SCALE = 1.1

# The skull in rings from under the jaw up: the height above HEAD, then the left half as (x, y): the
# side, the back corner, the back, the front corner and the front. A heavy jaw, a broad bull's skull, a
# shelf of brow, a low crown.
SKULL = [
    (0.0, (0.13, 0.02), (0.09, 0.13), 0.15, (0.1, -0.17), -0.22),  # under the jaw
    (0.1, (0.17, 0.04), (0.12, 0.17), 0.19, (0.13, -0.2), -0.27),  # the mouth
    (0.2, (0.2, 0.05), (0.15, 0.19), 0.21, (0.12, -0.17), -0.25),  # cheeks and muzzle
    (0.28, (0.23, 0.03), (0.16, 0.19), 0.21, (0.17, -0.18), -0.23),  # the brow, a shelf
    (0.37, (0.17, 0.05), (0.11, 0.17), 0.18, (0.1, -0.07), -0.09),  # the crown
]
CROWN = (0, 0.06, 0.41)


def hp(x, y, z):
    return HEAD + HEAD_SCALE * V(x, y, z)


def head():
    with bone('head'):
        skull()
        horns()
    joint('crown', hp(*CROWN))


def skull():
    rings = []
    for z, side, corner, back, front_corner, front in SKULL:
        points = [side, corner, (0, back), (-corner[0], corner[1]), (-side[0], side[1]),
                  (-front_corner[0], front_corner[1]), (0, front), front_corner]
        rings.append([hp(x, y, z) for x, y in points])
    verts, faces, bands = loft(rings)
    face_mats = [(f % 8 + b) % 2 for f, b in enumerate(bands)]
    for f, b in enumerate(bands):  # the mouth: the front of the lowest band glows, a gaping jaw of fire
        if b == 0 and f % 8 in (5, 6):
            face_mats[f] = 2
        elif b == 0 and f % 8 in (4, 7):
            face_mats[f] = 3
    faces.append(tuple(range(8)))
    face_mats.append(0)
    verts.append(hp(*CROWN))
    last = (len(rings) - 1) * 8
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    face_mats += [1 if i % 2 else 0 for i in range(8)]
    part('skull', verts, faces, [M['hide'], M['crust'], M['fire'], M['ember']], face_mats, inside=hp(0, 0.0, 0.2))
    # The lower jaw, hanging open below the glowing mouth, and fangs at its corners.
    jaw = [hp(0.12, -0.12, 0.04), hp(-0.12, -0.12, 0.04), hp(-0.1, -0.24, -0.04), hp(0.1, -0.24, -0.04),
           hp(0.12, 0.0, 0.02), hp(-0.12, 0.0, 0.02), hp(0.0, -0.27, -0.07)]
    faces = [(0, 1, 2, 3), (2, 6, 3), (0, 3, 4), (1, 5, 2), (0, 4, 5, 1), (4, 3, 6), (5, 6, 2), (4, 6, 5)]
    part('jaw', jaw, faces, M['hide'], inside=hp(0, -0.1, 0.0))
    for s in (-1, 1):
        cone(f'fang-{s}', hp(s * 0.1, -0.2, 0.11), hp(s * 0.09, -0.235, 0.0), 0.025, M['horn'], n=3, back=None)
        # Eyes of flame, slanting slits deep under the brow, and nostrils that glow.
        verts = [hp(s * 0.035, -0.245, 0.235), hp(s * 0.15, -0.205, 0.27), hp(s * 0.13, -0.21, 0.215)]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))
        verts = [hp(s * 0.03, -0.265, 0.17), hp(s * 0.08, -0.25, 0.18), hp(s * 0.06, -0.255, 0.145)]
        part(f'nostril-{s}', verts, [(0, 1, 2)], M['ember'], outward=V(0, -1, 0))


# Great thick horns from the brow, sweeping out to the sides, then forward and up, like a bull's: pale
# horn, darkening at the tips.
HORN_PATH = [(0.15, -0.31, 2.3), (0.3, -0.3, 2.36), (0.43, -0.28, 2.45), (0.51, -0.35, 2.56),
        (0.5, -0.47, 2.66), (0.41, -0.55, 2.74)]
HORN_RADII = [0.11, 0.105, 0.088, 0.066, 0.044]


def horns():
    for s in (-1, 1):
        points = [V(s * x, y, z) for x, y, z in HORN_PATH]
        rings = path_rings(points[:-1], HORN_RADII, 5, 0, side=V(0, 0, 1))
        verts, faces, bands = loft(rings)
        face_mats = [1 if b >= 3 else 0 for b in bands]
        faces = wind(verts, faces, inside=nearest_on_polyline(points))
        verts.append(points[-1])
        first = (len(rings) - 1) * 5
        faces += wind(verts, [(first + i, first + (i + 1) % 5, len(verts) - 1) for i in range(5)], inside=points[-2])
        face_mats += [1] * 5
        part(f'horn-{s}', verts, faces, [M['horn'], M['claws']], face_mats)


def mane():
    """The fire of its head: broad tongues bursting from the back of its skull behind the horns,
    streaming up and a little back, on a bone of its own (`mane`) that streams after the head."""
    with bone('mane'):
        for k, (base, way, length, r) in enumerate((
            ((0.0, 0.08, 0.36), (0, 0.4, 1), 0.5, 0.12),
            ((0.11, 0.1, 0.32), (0.4, 0.4, 1), 0.4, 0.1),
            ((-0.11, 0.1, 0.32), (-0.4, 0.4, 1), 0.4, 0.1),
            ((0.06, 0.16, 0.24), (0.15, 0.45, 1), 0.46, 0.1),
            ((-0.06, 0.16, 0.24), (-0.15, 0.45, 1), 0.46, 0.1),
            ((0.17, 0.08, 0.22), (0.7, 0.35, 0.8), 0.3, 0.07),
            ((-0.17, 0.08, 0.22), (-0.7, 0.35, 0.8), 0.3, 0.07),
        )):
            flame(f'head-flame-{k}', hp(*base), V(*way), length, r, curl=V(0, 1, 0.3), n=4 if r > 0.09 else 3,
                  phase=45 * (k % 2))
    joint('mane_root', hp(0, 0.1, 0.3))
    joint('mane_tip', hp(0, 0.35, 0.8))


# Arms, the sword and the whip ---------------------------------------------------------------------

ARMS = {  # shoulder, elbow, wrist and the middle of the fist: long arms, the fists below the hips
    'right': (V(-0.5, -0.05, 2.0), V(-0.66, 0.12, 1.52), V(-0.68, -0.1, 1.1), V(-0.68, -0.17, 1.02)),
    'left': (V(0.5, -0.05, 2.0), V(0.66, 0.12, 1.52), V(0.66, -0.08, 1.08), V(0.65, -0.15, 0.99)),
}
SWORD = V(-0.02, -0.08, 1.0).normalized()  # held upright by its right side
SWORD_EDGE = V(-1, -0.2, 0)  # its flat to the front, so it shows its breadth
POMMEL_AT, GUARD_AT, TIP_AT = -0.14, 0.12, 1.02  # along the sword from the fist
HANDLE = V(0.05, -0.35, -0.94).normalized()  # the whip's handle, down and a little forward
HANDLE_END = 0.28
# The whip's chain, from the end of its handle: it hangs down and a little back from there.
WHIP = [V(0.0, 0.0, 0.0), V(0.01, 0.01, -0.24), V(0.03, 0.07, -0.44), V(0.05, 0.16, -0.6)]
THONGS = 6


def arm(side, along):
    """An arm from its shoulder to its fist, round what it holds, which runs along `along`; cracks of
    fire down the outside of it, and great claws curled over the fist."""
    shoulder, elbow, wrist, fist = ARMS[side]
    s = 1 if side == 'left' else -1
    c = side[0]
    with bone(f'upper_arm_{c}'):
        past = elbow + 0.05 * (wrist - elbow).normalized()
        rings, points = limb(f'upper-arm-{side}', [shoulder + V(0, 0, 0.04), shoulder.lerp(elbow, 0.45), past],
                             [0.16, 0.16, 0.12], 6, 60 + s)
        ring_crack(f'upper-arm-crack-{side}', rings, points,
                   [(0.4, 0.5 if s > 0 else 2.5), (1.0, 0.8 if s > 0 else 2.2), (1.7, 0.4 if s > 0 else 2.6)])
    with bone(f'forearm_{c}'):
        above = elbow + 0.05 * (shoulder - elbow).normalized()
        rings, points = limb(f'forearm-{side}', [above, elbow.lerp(wrist, 0.5), wrist], [0.12, 0.13, 0.1], 6,
                             70 + s, 0.08)
        ring_crack(f'forearm-crack-{side}', rings, points,
                   [(0.2, 4.5 if s > 0 else 0.5), (1.0, 4.2 if s > 0 else 0.8), (1.8, 4.6 if s > 0 else 0.4)])
    ahead = (fist - elbow).normalized()
    across = (along - along.dot(ahead) * ahead).normalized()
    out = ahead.cross(across)
    if out.y > 0:
        out = -out
    with bone(f'hand_{c}'):
        box(f'fist-{side}', fist, [ahead, across, ahead.cross(across)], (0.12, 0.115, 0.11), M['hide'], 0.85)
        for k, t in enumerate((-0.06, 0.0, 0.06)):
            b = fist + 0.09 * ahead + 1.2 * t * across + 0.08 * out
            cone(f'claw-{side}-{k}', b, b + 0.08 * out - 0.05 * ahead, 0.025, M['claws'], n=3, back=None)
    joint(f'shoulder_{c}', shoulder)
    joint(f'elbow_{c}', elbow)
    joint(f'wrist_{c}', wrist)
    joint(f'fist_{c}', fist + 0.04 * ahead)


def sword():
    """A blade like a stabbing tongue of fire, wavering as it narrows to its point, with three flames
    licking back off its edges, on a hilt of black iron, its guard and pommel in trim."""
    fist = ARMS['right'][3]
    along = SWORD
    edge = (SWORD_EDGE - SWORD_EDGE.dot(along) * along).normalized()
    flat = along.cross(edge)
    start, tip = fist + GUARD_AT * along, fist + TIP_AT * along
    rings = []
    for t, w in ((0.0, 0.065), (0.22, 0.105), (0.45, 0.075), (0.68, 0.09), (0.86, 0.055)):
        c = start.lerp(tip, t)
        rings.append([c + w * edge, c + 0.3 * w * flat, c - w * edge, c - 0.3 * w * flat])
    verts, faces, bands = loft(rings)
    face_mats = [b % 2 for b in bands]
    verts.append(tip)
    last = (len(rings) - 1) * 4
    faces += [(last + i, last + (i + 1) % 4, len(verts) - 1) for i in range(4)]
    face_mats += [1] * 4
    part('blade', verts, faces, [M['fire'], M['flame']], face_mats,
         inside=lambda c: start + along * (c - start).dot(along))
    for k, (t, w) in enumerate(((0.3, 1), (0.6, -1), (0.8, 1))):
        base = start.lerp(tip, t) + 0.05 * w * edge
        flame(f'blade-flame-{k}', base, w * edge + 1.2 * along, 0.2, 0.035, curl=-w * edge)
    tube('grip', fist + POMMEL_AT * along, start, [(0, 0.035), (1, 0.035)], M['iron'], n=5)
    box('guard', start, [along, edge, flat], (0.025, 0.15, 0.045), M['trim'], 0.8)
    cone('pommel', fist + (POMMEL_AT + 0.01) * along, fist + (POMMEL_AT - 0.06) * along, 0.05, M['trim'], n=5,
         back=None)
    return tip, edge


def whip():
    """The whip of many thongs: an iron handle in the left fist, and six thongs of flame from its end,
    brightest at their tips, on the whip's three bones, each thong's points following the bone of the
    length they are on, so the thongs bend where the bones turn."""
    fist = ARMS['left'][3]
    root = fist + HANDLE_END * HANDLE
    chain = [root + p for p in WHIP]
    tube('handle', fist - 0.1 * HANDLE, root + 0.02 * HANDLE, [(0, 0.035), (1, 0.03)], M['iron'], n=5)
    tube('handle-band', root - 0.03 * HANDLE, root + 0.02 * HANDLE, [(0, 0.045), (1, 0.045)], M['trim'], n=5)

    def follows(p):
        """The bone of the length of the whip a point of a thong is on."""
        heights = [c.z for c in chain]
        if p.z > heights[1] + 0.02:
            return 'whip_1'
        return 'whip_2' if p.z > heights[2] + 0.02 else 'whip_3'

    with bone('whip_1', follows=follows):
        for k in range(THONGS):
            a = math.radians(60 * k + 15)
            spread = V(math.cos(a), math.sin(a), 0)
            points = [chain[0], chain[1] + 0.03 * spread, chain[2] + 0.07 * spread, chain[3] + 0.12 * spread]
            rings = path_rings(points[:3], [0.03, 0.026, 0.022], 3, 60 * k)
            verts = rings[0] + rings[1] + rings[2] + [points[3]]
            faces = [(r * 3 + i, r * 3 + (i + 1) % 3, (r + 1) * 3 + (i + 1) % 3, (r + 1) * 3 + i)
                     for r in range(2) for i in range(3)]
            faces += [(6 + i, 6 + (i + 1) % 3, 9) for i in range(3)]
            face_mats = [0] * 3 + [1] * 3 + [1] * 3
            faces = wind(verts, faces, inside=nearest_on_polyline(points))
            part(f'thong-{k}', verts, faces, [M['fire'], M['flame']], face_mats)
    for name, p in zip(('whip_root', 'whip_a', 'whip_b', 'whip_end'), chain):
        joint(name, p)
    return root


def arms():
    with bone('hand_r'):
        tip, edge = sword()
    with bone('hand_l'):
        root = whip()
    arm('right', SWORD)
    arm('left', HANDLE)
    fist_r, fist_l = ARMS['right'][3], ARMS['left'][3]
    hold('r', fist_r, tip, tip + 0.1 * edge)
    hold('l', fist_l, root, root + 0.1 * V(0, -1, 0))


# Its clips ----------------------------------------------------------------------------------------
#
# Its attack, a bolt of fire flung from its sword (a shot, on frame 3 as keyed: its range is 2), and its
# cast, the whip lashed across the cone in front, are its own. Each is drawn where it goes, the hands'
# paths in the model's frame as the library's blows are, from the rig's measurements (clips.Body). Its
# horns reach out over its shoulders, so both weapons are raised outside them.

WHIP_BONES = ('whip_1', 'whip_2', 'whip_3')


def slash(rig):
    """Its attack: the sword raised before its right shoulder, outside the horn, and tipped back, the
    body turned to it and rearing, then over and slashed down before it, the body bowing in after it, so
    that on frame 3 the blade points down at the foe ahead, and the bolt of fire leaves from its point
    (its muzzle); a hold, and the sword brought back up to where it is held."""
    b = Body(rig, 'r')
    n = frames_for(0.6)
    leg = b.leg
    k = Keys(lag={'head': 1})
    k.key(0, **b.still())

    def blade(theta, at, yaw=0.0, elbow=(-0.35, 0.3, -0.9)):
        aim, face = arc(theta, b.yaw(yaw))
        return b.arm('r', b.near(*at), rig.aim('r', aim, face), elbow, world=1.0)

    # Its arms are long and its shoulders broad, so the sword is raised before its shoulder, the elbow
    # down, rather than drawn back over it, which would take the elbow out of its hex.
    up, down_in = (0.1, -0.2, -1.0), (-0.35, 0.3, -0.9)  # the elbow down as it rises, then down and in
    path = [
        (0, 'smooth', -20, (0.17, -0.3, 0.12), -6, up),  # raised before its shoulder, outside the horn
        (1, 'in', -35, (0.18, -0.26, 0.18), -4, up),  # tipped back, the body rearing
        (2, 'in', 100, (0.14, -0.18, 0.28), -2, (-0.2, -0.8, -0.5)),  # over, coming down
        (BLOW, 'in', 148, (-0.12, -0.62, -0.25), -4, down_in),  # slashed down at the foe: the bolt leaves
        (BLOW + 3, 'out', 154, (-0.1, -0.6, -0.28), -4, down_in),
        (BLOW + 7, 'smooth', 150, (-0.06, -0.55, -0.32), -4, down_in),
        (BLOW + 11, 'smooth', 120, (0.12, -0.25, -0.75), -2, down_in),  # let down by its hip
    ]
    for f, ease, theta, at, yaw, elbow in path:
        k.key(f, ease, **blade(theta, at, yaw, elbow))
    body_keys = [  # spine and hips as pitch and yaw to the sword's side, hips forward and down
        (0, 'smooth', (-8, 6), (-2, 3), (-0.02, 0.03)),
        (1, 'in', (-11, 5), (-3, 2), (-0.02, 0.03)),
        (2, 'in', (-2, 2), (0, 1), (0.0, 0.05)),
        (BLOW, 'in', (7, -8), (3, -4), (0.0, 0.09)),
        (BLOW + 3, 'out', (6, -8), (3, -4), (0.0, 0.085)),
        (BLOW + 7, 'smooth', (5, -6), (2, -3), (0.0, 0.07)),
        (BLOW + 11, 'smooth', (3, -2), (1, -1), (0.0, 0.03)),
    ]
    for f, ease, spine, hips, (ahead, low) in body_keys:
        k.key(f, ease, spine=V(spine[0], 0, b.yaw(spine[1])), hips=V(hips[0], 0, b.yaw(hips[1])),
              hips_at=V(0, -ahead * leg, -low * leg))
    # The head turns against the body, so it keeps looking ahead and its horns stay in the hex.
    k.key(0, head=V(4, 0, b.yaw(-8)), **b.arm('l', b.wrist('l', 0.04, -0.06, 0.04)))
    k.key(BLOW, 'in', head=V(-6, 0, b.yaw(3)), **b.arm('l', b.wrist('l', 0.08, 0.14, 0.02)))
    k.key(n, **b.still())
    k.key(n, **{'hand_r_world': 1.0})
    return timed(rig, 'attack', Clip(n, k, marks={'strike': BLOW}, muzzle=('hand_r', rig.joint('tip_r'))))


def lashed(rig, ch, yaw, swings, room=ROOM - 0.1, ahead=True):
    """Channels `ch` with the whip's bones turned so each length points `swings` degrees round from
    hanging down towards behind its heading (90 behind, 180 up, 270 ahead, 360 down again), the heading
    `yaw` degrees round from straight ahead to its left. A length that points ahead and down droops
    further, towards hanging, as far as it must to keep the whip in its room and out of the ground."""
    ch = dict(ch)
    heading = Matrix.Rotation(math.radians(yaw), 3, 'Z')

    def turns(swing):
        return [(heading @ Matrix.Rotation(math.radians(a), 3, 'X')).to_quaternion() for a in swing]

    def apply(swing):
        motions = rig.solve(ch)
        parent = motions['hand_l'].turn
        for name, turn in zip(WHIP_BONES, turns(swing)):
            ch[name] = degrees_of(parent.inverted() @ turn)
            parent = turn

    def fits():
        pose = rig.solve(ch)
        points = []
        for name in WHIP_BONES:
            m = pose[name]
            pts = rig.points(name)
            if len(pts):
                points.append((pts - np.array(m.head)) @ np.array(m.turn.to_matrix()).T + np.array(m.at))
        p = np.concatenate(points)
        return float(measured(p, ahead).max()) <= room and float(p[:, 2].min()) >= 0.005

    swing = list(swings)
    apply(swing)
    for _ in range(40):
        if fits():
            break
        swing = [a + 3 if 180 < a < 357 else a for a in swing]  # droop the lengths that point ahead
        apply(swing)
    return ch


def lash(rig):
    """Its cast, Whip of flame: the whip drawn back behind it, low, the body turned to it and rearing;
    swung up outside its left horn, the thongs trailing up behind the hand; then cracked out across the
    front on frame 4 as keyed (its height, the end of its wind-up once retimed), the arm thrown forward
    and down and the thongs streaming out at the foes ahead; swept on across to its right as the thongs
    fall to the ground; held, and drawn back to hang by its side. The sword is held up and out to its
    right all the while."""
    b = Body(rig, 'l')
    n = frames_for(0.8)
    height = 4
    leg = b.leg
    k = Keys(lag={'head': 1})
    k.key(0, **b.still())
    # (frame, ease, the whip hand by its shoulder, its elbow, the heading, and each length's swing)
    path = [
        (0, 'smooth', (0.04, 0.06, -0.3), (0.2, 0.4, -0.88), 20, (24, 16, 8)),
        (2, 'in', (0.18, 0.02, 0.5), (-0.35, 0.3, -0.9), 12, (150, 130, 110)),
        (3, 'in', (0.2, -0.3, 0.26), (-0.35, 0.3, -0.9), 8, (215, 200, 175)),
        (height, 'in', (-0.28, -0.5, 0.05), (0.2, 0.3, -0.9), 4, (258, 262, 266)),
        (height + 2, 'out', (-0.3, -0.48, -0.25), (0.2, 0.3, -0.9), -26, (285, 300, 318)),
        (height + 5, 'smooth', (-0.3, -0.45, -0.35), (0.2, 0.3, -0.9), -36, (318, 335, 350)),
        (height + 10, 'smooth', (-0.12, -0.2, -0.35), (0.2, 0.4, -0.85), -15, (350, 355, 358)),
        (n, 'smooth', None, None, 0, (360, 360, 360)),
    ]
    for f, ease, at, elbow, yaw, swing in path:
        if at is not None:
            k.key(f, ease, **b.arm('l', b.near(*at), None, elbow, world=1.0))
        k.key(f, ease, lash_yaw=float(yaw), **{f'lash_{i}': float(a) for i, a in enumerate(swing)})
    body_keys = [  # spine and hips as pitch and yaw to the whip's side, hips forward and down
        (0, 'smooth', (-8, 12), (-2, 5), (-0.02, 0.03)),
        (2, 'in', (-10, 10), (-3, 4), (-0.02, 0.03)),
        (3, 'in', (2, 2), (1, 1), (0.01, 0.05)),
        (height, 'in', (8, -10), (3, -5), (0.0, 0.09)),
        (height + 2, 'out', (8, -14), (3, -7), (0.0, 0.09)),
        (height + 5, 'smooth', (7, -16), (3, -7), (0.0, 0.085)),
        (height + 10, 'smooth', (3, -6), (1, -3), (0.0, 0.04)),
    ]
    for f, ease, spine, hips, (ahead, low) in body_keys:
        k.key(f, ease, spine=V(spine[0], 0, b.yaw(spine[1])), hips=V(hips[0], 0, b.yaw(hips[1])),
              hips_at=V(0, -ahead * leg, -low * leg))
    up = rig.aim('r', V(0.15, -0.1, 1).normalized(), V(-1, -0.2, 0))
    # The head turns against the body, so it keeps looking ahead and its horns stay in the hex.
    k.key(0, head=V(4, 0, b.yaw(-16)), **b.arm('r', b.wrist('r', 0.06, 0.1, 0.1), up))
    k.key(height, 'in', head=V(-8, 0, b.yaw(12)), **b.arm('r', b.wrist('r', 0.08, 0.16, 0.08), up))
    k.key(height + 5, 'smooth', head=V(-6, 0, b.yaw(20)))
    k.key(height + 10, 'smooth', head=V(-2, 0, b.yaw(8)))
    k.key(n, **b.still())
    k.key(n, **{'hand_l_world': 1.0})

    def pose(f):
        ch = k(f)
        yaw = ch.pop('lash_yaw')
        swing = [ch.pop(f'lash_{i}') for i in range(3)]
        return lashed(rig, ch, yaw, swing)

    return timed(rig, 'cast', Clip(n, pose, marks={'height': height}))


RAISED = 16  # the frame its victory holds from


def rearing(rig):
    """Its victory: a gathering crouch, then reared up, the sword thrust high, the whip hand raised, its
    wings lifted and its head thrown back, held from frame RAISED."""
    b = Body(rig, 'r')
    n = frames_for(0.8)
    leg = b.leg
    k = Keys(lag={'head': 1, 'wing_l': 1, 'wing_r': 1})
    k.key(0, **b.still())
    k.key(0, **{'hand_r_world': 1.0, 'hand_l_world': 1.0})
    k.key(3, hips_at=V(0, 0, -0.07 * leg), spine=V(8, 0, 0), head=V(6, 0, 0),
          **b.arm('r', b.wrist('r', -0.04, 0.02, -0.06), b.tip(-6), (-0.15, 0.6, -0.8), world=1.0),
          **b.arm('l', b.wrist('l', -0.04, 0.04, -0.06), None, (-0.15, 0.6, -0.8), world=1.0))

    k.key(6, 'in', **b.arm('r', b.near(0.12, -0.3, -0.1), b.tip(-4), (-0.2, -0.3, -0.95), world=1.0),
          **b.arm('l', b.near(0.12, -0.3, -0.2, 'l'), None, (0.1, 0.6, -0.8), world=1.0),
          hips_at=V(0, 0, -0.03 * leg), spine=V(0, 0, 0), head=V(0, 0, 0))
    k.key(8, **b.arm('r', b.near(0.14, -0.05, 0.45), b.tip(-4), (-0.5, 0.8, -0.1), world=1.0))

    def up(theta):
        aim, _ = arc(theta)
        return rig.aim('r', aim, V(-1, 0, 0))

    k.key(10, 'out', **b.arm('r', b.near(0.18, 0.28, 0.8), up(-6), (0.0, 0.8, -0.6), world=1.0),
          **b.arm('l', b.near(0.26, 0.0, -0.1, 'l'), None, (0.2, 0.6, -0.8), world=1.0),
          hips_at=V(0, 0.01 * leg, 0.02 * leg), hips=V(-4, 0, 0), spine=V(-10, 0, 0), head=V(-8, 0, 0),
          wing_l=V(-6, 6, 4), wing_r=V(-6, -6, -4))
    k.key(RAISED, **b.arm('r', b.near(0.18, 0.26, 0.78), up(0), (0.0, 0.8, -0.6), world=1.0),
          **b.arm('l', b.near(0.24, 0.0, -0.12, 'l'), None, (0.2, 0.6, -0.8), world=1.0),
          hips_at=V(0, 0.005 * leg, 0.0), hips=V(-3, 0, 0), spine=V(-8, 0, 0), head=V(-6, 0, 0),
          wing_l=V(-5, 5, 3), wing_r=V(-5, -5, -3))
    return Clip(n, lambda f: k(min(f, RAISED)))


def whip_hangs(clips):
    """The clips with the whip hanging from the hand and trailing after it, each length after the one
    before (clips.swaying())."""
    for name in WHIP_BONES:
        clips = swaying(clips, name, share=1.0, lag=2, drag=0.5)
    return clips


def tucked(clips, clip, hand, elbow, by):
    """The clips with `clip`'s `hand` turning its elbow in towards `elbow`, all the way by frame `by`:
    the library's falls swing a hand's elbow out to its side, as a Man's, and a Large figure's long arm
    would swing it out of its hex."""

    def tucking(rig, name, spec):
        made_clip = made(rig, name, spec)
        if name != clip:
            return made_clip
        pose = made_clip.pose
        rest = rig.rest[f'elbow_{hand}']

        def tucked_pose(f):
            ch = pose(f)
            u = EASES['smooth'](min(f / by, 1.0))
            ch[f'elbow_{hand}'] = rest.lerp(Vector(elbow).normalized(), u).normalized()
            return ch

        return made_clip.with_pose(tucked_pose)

    return {name: (lambda rig, name=name, spec=spec: tucking(rig, name, spec)) for name, spec in clips.items()}


LIFTED = 0.06  # how far above the ground tailed() keeps the tail, and steadied() the body


def tailed(clips):
    """The clips with the tail carried where the hips take it, as clips.robed() carries a robe: its first
    bone hangs from the root, so it is no part of the trunk and the hips can go down past it as the
    Balrog kneels (clips.grounded() would hold them up on it), and in every frame it goes where the hips
    take its root and turns as they turn. In the loops its last two lengths sway slowly from side to
    side, the end after the middle. Where the hips would take it under the ground, it rests on it."""

    def wrapped(rig, clip, spec):
        made_clip = made(rig, clip, spec)
        pose, n, loop = made_clip.pose, made_clip.frames, made_clip.loop
        top = rig.joint('tail_root')

        def with_tail(f):
            ch = pose(f)
            hips = rig.solve(ch)['hips']
            ch['tail_1'] = V(*ch.get('hips', (0, 0, 0)))
            ch['tail_1_at'] = hips(top) - top
            if loop:
                ch['tail_2'] = V(0, 0, 5 * wave(f, n, 1))
                ch['tail_3'] = V(0, 0, 7 * wave(f, n, 1, -0.15))
            low = rig.lowest(ch, list(TAIL_BONES))
            if low < LIFTED:  # it rests on the ground where the hips would take it under, its root up in the body
                ch['tail_1_at'] = ch['tail_1_at'] + V(0, 0, LIFTED - low)
            return ch

        return made_clip.with_pose(with_tail)

    return {clip: (lambda rig, clip=clip, spec=spec: wrapped(rig, clip, spec)) for clip, spec in clips.items()}


# How much of a style's turn of the head and the spine each clip keeps: a Man's head lolls and his body
# twists freely, but the Balrog's head is carried low and forward already, with horns that would swing
# out of its hex. And the turns some clips add, eased in over the clip: as it dies it throws its head
# back, so its horns go up rather than out ahead, the fire of its head streams back, and its wings droop
# forward over its shoulders, so it ends low.
SHARES = {
    'move': {'head': 0.5, 'spine': 0.6},
    'stun': {'head': 0.3, 'spine': 0.5},
    'death': {'head': 0.0, 'spine': 0.5},
}
ADDED = {'death': {'head': V(-36, 0, 0), 'mane': V(-50, 0, 0), 'wing_l': V(30, 0, 0), 'wing_r': V(30, 0, 0)}}
# And how much further the hips sink in some clips: its legs are long, and a death on its knees leaves its
# wings high, so it sinks further, its hocks folding under it.
SUNK = {'death': V(0, 0, -0.45)}


def steadied(clips, shares=SHARES, added=ADDED, sunk=SUNK):
    """The clips with each turn named in `shares` scaled by its share, and each in `added` turned
    further, all of it by the clip's last frame."""

    def wrapped(rig, clip, spec):
        made_clip = made(rig, clip, spec)
        if clip not in shares and clip not in added and clip not in sunk:
            return made_clip
        pose, n = made_clip.pose, made_clip.frames

        def steady(f):
            ch = pose(f)
            for name, share in shares.get(clip, {}).items():
                if name in ch:
                    ch[name] = degrees_of(Quaternion().slerp(turn_of(ch[name]), share))
            u = EASES['smooth'](min(f / n, 1.0))
            for name, turn in added.get(clip, {}).items():
                extra = Quaternion().slerp(turn_of(turn), u)
                ch[name] = degrees_of(extra @ turn_of(ch.get(name, (0, 0, 0))))
            if clip in sunk:  # as far as its body stays out of the ground
                ch['hips_at'] = Vector(ch.get('hips_at', (0, 0, 0))) + u * sunk[clip]
                low = rig.lowest(ch, rig.trunk)
                if low < LIFTED:
                    ch['hips_at'] = ch['hips_at'] + V(0, 0, LIFTED - low)
            return ch

        return made_clip.with_pose(steady)

    return {clip: (lambda rig, clip=clip, spec=spec: wrapped(rig, clip, spec)) for clip, spec in clips.items()}


# The ways a bone may turn to keep out of the ground and in its room (relieved()): about the model's own
# axes, either way round.
AXES = [V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0, 0, -1)]
RELIEF_STEP, RELIEF_MOST = 2.0, 90.0
MARGIN = 0.03  # how far inside its room and above the ground relieved() keeps them, for the frames between  # degrees


def relieved(clips, chains, room=ROOM):
    """The clips with each bone of `chains` (lists of bones, each hanging from the one before) turned,
    in every frame where it must be, by as little as it takes about one of AXES at its head, to keep
    what is on it and on the bones after it out of the ground and in the clip's room: the wings, which
    the body carries forward as it bows, folded in, and the tail lifted where the hips take it down."""

    def wrapped(rig, clip, spec):
        made_clip = made(rig, clip, spec)
        pose = made_clip.pose
        ahead = clip in ('attack', 'cast')

        def placed(ch, bones):
            motions = rig.solve(ch)
            out = []
            for name in bones:
                pts = rig.points(name)
                if len(pts):
                    m = motions[name]
                    out.append((pts - np.array(m.head)) @ np.array(m.turn.to_matrix()).T + np.array(m.at))
            return np.concatenate(out)

        def badness(ch, bones):
            p = placed(ch, bones)
            return max(0.0, float(measured(p, ahead).max()) - room + MARGIN) + max(0.0, MARGIN - float(p[:, 2].min()))

        def with_relief(f):
            ch = pose(f)
            for chain in chains:
                for i, name in enumerate(chain):
                    bones = chain[i:]
                    if badness(ch, bones) <= 0:
                        continue
                    motions = rig.solve(ch)
                    parent = motions[rig.bones[name][0]].turn
                    world = parent @ turn_of(ch.get(name, (0, 0, 0)))
                    best = (badness(ch, bones), 0.0, ch[name] if name in ch else V(0, 0, 0))
                    for axis in AXES:
                        a = RELIEF_STEP
                        while a <= RELIEF_MOST:
                            turned = parent.inverted() @ Quaternion(axis, math.radians(a)) @ world
                            trial = dict(ch)
                            trial[name] = degrees_of(turned)
                            bad = badness(trial, bones)
                            if (bad, a) < best[:2]:
                                best = (bad, a, trial[name])
                            if bad <= 0:
                                break
                            a += RELIEF_STEP
                    if best[1] > 0:
                        ch[name] = best[2]
            return ch

        return made_clip.with_pose(with_relief)

    return {clip: (lambda rig, clip=clip, spec=spec: wrapped(rig, clip, spec)) for clip, spec in clips.items()}


# Slow and heavy, as Treebeard's and the Cave Troll's. It stands breathing slow, the sword up; strides
# long and low, the sword carried up and the whip swinging; flings fire from its sword and lashes its
# whip (above); sways, dazed, the sword let down; sinks to its knees as it falls; and rears up as it
# wins. The whip hangs and trails in every clip but its cast, where it is lashed; the fire of its head
# streams after the head and the wings take back some of the body's bow; the tail goes where the hips
# take it; and the wings and the tail are kept in their room and out of the ground. Kept in its room by
# fit().
HUNG = whip_hangs({
    'idle': ('ready', {'seconds': 2.2, 'breath': 0.8, 'sway': 0.7, 'crouch': 0.03}),
    'move': ('run', {'seconds': 0.6, 'heavy': 1.0, 'stride': 0.42, 'lift': 0.16, 'lean': 6.0}),
    'attack': slash,
    'stun': ('dazed', {'seconds': 1.3, 'low': 0.6}),
    'death': ('knees', {'slump': 0.8, 'back': 0.35}),
    'victory': rearing,
})
HUNG = tucked(tucked(HUNG, 'death', 'l', (0.2, 0.45, -0.85), 7), 'death', 'r', (-0.2, 0.45, -0.85), 7)
SWAYED = swaying({**HUNG, 'cast': lash}, 'mane', share=0.5, lag=2, drag=0.5)
for _wing in ('wing_l', 'wing_r'):
    SWAYED = {**swaying(SWAYED, _wing, share=0.5, lag=1, drag=0.7),
              'death': swaying({'death': SWAYED['death']}, _wing, share=0.0, lag=1, drag=0.7)['death']}
SWAYED = steadied(SWAYED)
CLIPS = fit(relieved(tailed(SWAYED), [['wing_l'], ['wing_r'], list(TAIL_BONES)]), between=True)


def build():
    """Makes it in a fresh scene, every part bound to its bone and its joints marked, and returns the
    rig to finish() it with."""
    reset()
    make_materials()
    legs()
    body()
    livery()
    back_fire()
    wings()
    tail()
    head()
    mane()
    arms()
    return Rig(kind='large', clips=CLIPS, bones={
        'whip_1': ('hand_l', 'whip_root', 'whip_a'),
        'whip_2': ('whip_1', 'whip_a', 'whip_b'),
        'whip_3': ('whip_2', 'whip_b', 'whip_end'),
        'wing_l': ('spine', 'wing_l_root', 'wing_l_peak'),
        'wing_r': ('spine', 'wing_r_root', 'wing_r_peak'),
        'mane': ('head', 'mane_root', 'mane_tip'),
        'tail_1': ('root', 'tail_root', 'tail_a'),
        'tail_2': ('tail_1', 'tail_a', 'tail_b'),
        'tail_3': ('tail_2', 'tail_b', 'tail_end'),
    })


def main():
    finish('balrog', budget=LARGE_BUDGET, rig=build())


if __name__ == '__main__':
    main()
