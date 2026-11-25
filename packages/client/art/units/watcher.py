"""The Watcher in the Water: a Large PvE monster (packages/sim/src/data/monsters.ts), in the Faceted style
(docs/viewer-spec.md section 4).

After the book (The Fellowship of the Ring, A Journey in the Dark), not the films: out of the dark
water before the West-gate of Moria come long sinuous arms, pale green and luminous and wet, with
fingers at their ends; of the thing itself nothing is seen but the arms and a stirring of the water.
So it is a dark pool on its hex, a still disc of black water ringed by a low rim of weedy stone, a
glistening dark mass half-risen in the middle of it with two pale eyes, and six tentacles rising out
of the mass, arched and curling, pale green and faintly glowing, each ending in three crooked
fingers: about 2.0 tall, and inside its hex. The pool is part of the model, so it goes where the
Watcher goes.

Its livery, murky water green (packages/client/src/livery.json), is the pool's rim, a ring of weedy
stone round the water that shows from in front, from behind and from above, darker and duller than the
pale green of the arms, so the two read apart. It has no fittings to show a star level, and a monster
is always 1★, so its rim's stones are `trim`, which the client colours iron.

It is rigged as a creature of its own shape (../rig.py, Rig(kind='large-creature')): `root`, with the
pool on it; `body`, its mass; and its tentacles, each a chain of four bones from the body out,
`tentacle_<n>_<k>`, every ring of each arm following the bone of the length it is on, so the arms
bend where their bones turn. None of a figure's bones and none of a mount's: its clips are its own,
written here. It idles in a slow writhing, each arm a wave running up it; it moves in a gliding
ripple, its arms streaming back; its attack (its range of 2 makes it a ranged attack in the sim, a
bolt) flings its foremost arm forward, the shot leaving its fingers on frame 3 (its muzzle); its cast,
Tentacles (damage and stun round its target at the end of a 0.5 s wind-up), rears every arm up high
and slams them down before it at the release; dazed, its arms droop and sway; dying, they flail and
collapse into the pool as its mass slumps; and as it wins it raises them all, writhing.

    blender --background --factory-startup --python-exit-code 1 --python watcher.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so its left is +X.
"""

import math
import os
import sys

import numpy as np
from mathutils import Quaternion, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from beasts import tufts  # noqa: E402
from clips import EASES, degrees_of, wave  # noqa: E402
from kit import (  # noqa: E402
    LARGE_BUDGET,
    V,
    bone,
    finish,
    loft,
    lump,
    material,
    nearest_on_polyline,
    part,
    path_rings,
    reset,
    team_material,
    trim_material,
    wind,
)
from rig import FPS, Clip, Rig, crowding, joint, turn_of  # noqa: E402

# Its colours (sRGB).
WATER = 0x101b18  # the black water of the pool
SLIME = 0x26332c  # its mass, dark and wet
ARM = 0xA9CC98  # its arms, pale green
ARM_GLOW = 0x5E8A58  # the faint light in them
UNDER = 0x86AC7C  # the paler facets under them
FINGERS = 0xC7DDB4
EYE = 0xD6E8B0
EYE_GLOW = 0x8FB070

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        water=material('water', WATER, roughness=0.12),
        slime=material('slime', SLIME, roughness=0.3),
        arm=material('arm', ARM, roughness=0.35, emission=ARM_GLOW, emission_strength=0.35),
        under=material('arm-under', UNDER, roughness=0.35, emission=ARM_GLOW, emission_strength=0.25),
        fingers=material('fingers', FINGERS, roughness=0.4, emission=ARM_GLOW, emission_strength=0.3),
        eyes=material('watcher-eyes', EYE, roughness=0.4, emission=EYE_GLOW, emission_strength=0.8),
        trim=trim_material(),
    )


# The pool ----------------------------------------------------------------------------------------

POOL = 0.74  # the water's radius
RIM_IN, RIM_TOP, RIM_OUT = 0.71, 0.81, 0.9  # the rim's inner edge, its ridge and its outer edge
SURFACE = 0.012  # the water's height
SIDES = 12


def pool():
    """The dark water, a disc on the ground, and the rim of weedy stone round it in the livery, a low
    ridge with a few stones set in it."""
    ring = [V(POOL * math.cos(math.tau * (i + 0.5) / SIDES), POOL * math.sin(math.tau * (i + 0.5) / SIDES), SURFACE)
            for i in range(SIDES)]
    verts = ring + [V(0, 0, SURFACE)]
    faces = [(i, (i + 1) % SIDES, SIDES) for i in range(SIDES)]
    part('pool', verts, faces, M['water'], outward=V(0, 0, 1))
    rows = []
    for radius, z, k in ((RIM_IN, SURFACE - 0.004, 0.0), (RIM_TOP - 0.03, 0.06, 0.5), (RIM_TOP + 0.03, 0.055, 0.5),
                         (RIM_OUT, 0.002, 1.0)):
        rows.append([V(radius * (1 + 0.03 * k * math.sin(3.1 * i)) * math.cos(math.tau * i / SIDES),
                       radius * (1 + 0.03 * k * math.sin(3.1 * i)) * math.sin(math.tau * i / SIDES), z)
                     for i in range(SIDES)])
    verts, faces, _ = loft(rows)
    part('rim', verts, faces, M['team'], outward=V(0, 0, 1))
    # A few stones set in the rim.
    for i, (a, size) in enumerate(((20, 0.06), (95, 0.05), (160, 0.065), (230, 0.055), (300, 0.06))):
        r = RIM_TOP + 0.01 * (i % 2)
        c = V(r * math.cos(math.radians(a)), r * math.sin(math.radians(a)), 0.05)
        lump(f'rim-stone-{i}', c, (size, size * 0.8, size * 0.55), M['trim'], seed=i + 3, rough=0.2, angles=(0, 0, a))


# The mass -----------------------------------------------------------------------------------------

MASS = V(0, 0.02, 0.16)  # the middle of its mass, half-risen from the water
MASS_RADII = (0.42, 0.4, 0.36)


def mass():
    """Its body: a glistening dark mass half-risen from the water, its underside cut off at the
    water, with two pale eyes on its front."""
    blob = lump('mass', MASS, MASS_RADII, M['slime'], seed=7, rough=0.12, subdivisions=1)
    for v in blob.data.vertices:
        v.co.z = max(v.co.z, SURFACE + 0.004)
    for s in (-1, 1):
        c = V(s * 0.13, -0.355, 0.33)
        verts = [c + V(s * 0.045, -0.012, 0.012), c + V(-s * 0.04, 0.005, 0.02), c + V(0, -0.004, -0.03)]
        part(f'watcher-eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(s * 0.3, -1, 0.2))
    joint('body_base', V(0, 0.02, SURFACE))
    joint('body_top', V(0, 0.02, 0.5))


# The arms -----------------------------------------------------------------------------------------
#
# Six arms rise from the mass, each arched up and out and curling over at its end: their angles round
# it from straight ahead (towards its left), heights, how far out they reach and which way their S
# bends. The first is the foremost, which its attack flings forward.
ARMS = [
    (0, 1.35, 0.5, 1.0, 1),  # 1: ahead, low, its end hooked out at the foe
    (52, 1.7, 0.46, 0.6, -1),  # 2: ahead on its left
    (128, 2.0, 0.42, -0.5, 1),  # 3: behind on its left, its end curled in
    (180, 1.85, 0.46, 0.8, -1),  # 4: behind
    (232, 2.05, 0.42, -0.4, 1),  # 5: behind on its right
    (308, 1.6, 0.48, 0.7, -1),  # 6: ahead on its right
]
LENGTHS = 4  # bones an arm
POINTS = 11  # rings along an arm
JOINTS = (0, 3, 5, 8, 10)  # the rings its bones' joints are at, the last its end
BASE = (0.14, 0.24)  # where an arm starts inside the mass: out from the middle, and up


def radius_at(t):
    """An arm's radius `t` of the way along it: thick where it leaves the mass, tapering to its end."""
    return 0.072 * (1 - t) ** 0.85 + 0.016


def radial(a):
    """The way out from the middle at `a` degrees round from straight ahead, towards its left."""
    return V(math.sin(math.radians(a)), -math.cos(math.radians(a)), 0)


def across(a):
    """Square to radial(a), level: the way an arm bends to its side."""
    return V(math.cos(math.radians(a)), math.sin(math.radians(a)), 0)


def arm_points(n):
    """Arm n's line: up out of the mass, bowing out and back in as it rises, with an S to its side,
    and its end hooked over, out and down (or curled in, for a negative hook), as a question mark."""
    a, height, reach, hook, s = ARMS[n - 1]
    out, side = radial(a), across(a)
    points = []
    for i in range(POINTS):
        t = i / (POINTS - 1)
        r = BASE[0] + reach * math.sin(math.pi * 0.9 * t)
        z = BASE[1] + (height - BASE[1]) * t ** 0.92
        if t > 0.7:
            u = (t - 0.7) / 0.3
            r += hook * 0.2 * math.sin(u * math.pi / 2)
            z -= abs(hook) * 0.16 * u * u
        wiggle = 0.09 * s * math.sin(math.tau * t * 0.85)
        points.append(out * r + side * wiggle + V(0, 0, z))
    return points


def tip_of(n):
    points = arm_points(n)
    return points[-1] + 0.05 * (points[-1] - points[-2]).normalized()


def arm(n):
    """Arm n: a tapering tube, its facets pale above and paler below, each ring following the bone of
    the length it is on, drawn to a point, with three crooked fingers spread from its end."""
    points = arm_points(n)
    rings = path_rings(points, [radius_at(i / (POINTS - 1)) for i in range(POINTS)], 5, 90 * n, None)
    verts, faces, _ = loft(rings)
    face_mats = [1 if (f % 5) in (2, 3) else 0 for f in range(len(faces))]
    faces = wind(verts, faces, inside=nearest_on_polyline(points))
    last = (len(rings) - 1) * 5
    tip = tip_of(n)
    verts.append(tip)
    faces += wind(verts, [(last + i, last + (i + 1) % 5, len(verts) - 1) for i in range(5)], inside=points[-1])
    face_mats += [0] * 5
    owner = {}
    for i, ring in enumerate(rings):
        k = min(LENGTHS, 1 + sum(1 for j in JOINTS[1:-1] if i >= j))
        for p in ring:
            owner[tuple(round(c, 6) for c in p)] = k
    owner[tuple(round(c, 6) for c in tip)] = LENGTHS

    def follows(p):
        return f'tentacle_{n}_{owner.get(tuple(round(c, 6) for c in p), LENGTHS)}'

    with bone(f'tentacle_{n}_1', follows=follows):
        part(f'arm-{n}', verts, faces, [M['arm'], M['under']], face_mats)
    # Three crooked fingers spread from its end.
    end, way = points[-1], (points[-1] - points[-2]).normalized()
    a = way.orthogonal().normalized()
    b = way.cross(a)
    fingers = []
    for k in range(3):
        t = math.tau * k / 3
        spread = math.cos(t) * a + math.sin(t) * b
        base_c = end + 0.01 * way
        base = [base_c + 0.018 * spread + 0.012 * way, base_c + 0.018 * spread.cross(way), base_c - 0.018 * spread.cross(way)]
        fingers.append((base, end + 0.1 * way + 0.07 * spread))
    with bone(f'tentacle_{n}_{LENGTHS}'):
        tufts(f'arm-fingers-{n}', fingers, M['fingers'])
    for k, j in enumerate(JOINTS):
        joint(f'tentacle_{n}_{k}', points[j] if j < len(points) - 1 else tip)


def bones():
    out = {'body': ('root', 'body_base', 'body_top')}
    for n in range(1, len(ARMS) + 1):
        for k in range(1, LENGTHS + 1):
            parent = 'body' if k == 1 else f'tentacle_{n}_{k - 1}'
            out[f'tentacle_{n}_{k}'] = (parent, f'tentacle_{n}_{k - 1}', f'tentacle_{n}_{k}')
    return out


# Its clips ---------------------------------------------------------------------------------------
#
# Each arm bends in its own plane, out from the middle or in (`out`, degrees, positive out and down),
# and to its side (`side`), at each of its lengths; the body bobs (`body_at`) and turns. A pose is a
# dict of each arm's bends, [(out, side)] for its four lengths, the body's turn (pitch, tilt, yaw) and
# where it moves to. Where a length would take its arm under the ground or out of its clip's room
# (rig.crowding()), it bends less, length by length from the body (kept()).

def arm_turn(n, out, side):
    a = ARMS[n - 1][0]
    return Quaternion(across(a), math.radians(out)) @ Quaternion(-radial(a), math.radians(side))


def forward_turn(degrees):
    """A bend towards straight ahead (-Y), whatever way an arm stands: its top tipped forward."""
    return Quaternion(V(1, 0, 0), math.radians(degrees))


def channels(bends, body=(0, 0, 0), at=(0, 0, 0), ahead=None):
    """A frame's channels: each arm's bends (out, side) for its lengths, and for arms named in `ahead`
    a bend towards straight ahead added at each length (degrees), the body's turn and where it moves."""
    ch = {'body': V(*body), 'body_at': V(*at)}
    for n, lengths in bends.items():
        for k, (out, side) in enumerate(lengths, 1):
            q = arm_turn(n, out, side)
            if ahead and n in ahead:
                q = forward_turn(ahead[n][k - 1]) @ q
            ch[f'tentacle_{n}_{k}'] = degrees_of(q)
    return ch


def lowest_and_room(rig, ch, chain, wedge):
    """How low the parts on some bones reach, and how far into their room (rig.crowding())."""
    motions = rig.solve(ch)
    co = []
    for b in chain:
        p = rig.points(b)
        m = motions[b]
        co.append((p - np.array(m.head)) @ np.array(m.turn.to_matrix()).T + np.array(m.at))
    co = np.concatenate(co)
    return float(co[:, 2].min()), float(crowding(co, wedge).max())


GROUND = 0.008  # how far off the ground an arm keeps
ROOM = 0.965  # how much of its room an arm may reach to


def kept(rig, pose, wedge=False):
    """A pose function with each arm's lengths bent less where the arm beyond them would go under the
    ground or out of the clip's room, from the body out: each as little less as keeps the rest of the
    arm in, as it is bent, or if none does, straight on from the length before."""

    def fits(ch, chain):
        low, crowd = lowest_and_room(rig, ch, chain, wedge)
        return low >= GROUND and crowd <= ROOM

    def fitted(f):
        ch = pose(f)
        low = rig.lowest(ch, ['body'])
        if low < GROUND / 4:  # its mass lifted out of the ground where it tips
            ch['body_at'] = Vector(ch['body_at']) + V(0, 0, GROUND / 4 - low)
        for n in range(1, len(ARMS) + 1):
            chain = [f'tentacle_{n}_{k}' for k in range(1, LENGTHS + 1)]
            for k, b in enumerate(chain):
                if fits(ch, chain[k:]):
                    continue
                own = turn_of(ch[b])
                lo, hi = 0.0, 1.0
                for _ in range(10):
                    mid = (lo + hi) / 2
                    ch[b] = degrees_of(Quaternion().slerp(own, mid))
                    if fits(ch, chain[k:]):
                        lo = mid
                    else:
                        hi = mid
                ch[b] = degrees_of(Quaternion().slerp(own, lo))
        return ch

    return fitted


def writhe(f, n_frames, cycles, amp, phase_of, run=0.12):
    """Each arm's bends at frame f of a loop n_frames long: a wave running up each arm, `cycles` times
    a loop, `amp` degrees out and to its side at each length (a list of four), each arm from its own
    phase."""
    bends = {}
    for n in range(1, len(ARMS) + 1):
        p = phase_of(n)
        bends[n] = [(amp[k] * wave(f, n_frames, cycles, p - run * k), 0.8 * amp[k] * wave(f, n_frames, cycles, p + 0.27 - run * k))
                    for k in range(LENGTHS)]
    return bends


def phase(n):
    return [0.0, 0.37, 0.71, 0.18, 0.55, 0.86][n - 1]


def idle(rig):
    """A slow writhing: a wave running up each arm, out and back and to and fro, each arm in its own
    time; its mass rising and sinking a little as it breathes. 2.4 s."""
    n = round(2.4 * FPS)

    def pose(f):
        bends = writhe(f, n, 2, [3, 6, 8, 10], phase)
        return channels(bends, body=(1.5 * wave(f, n, 1, 0.2), 2 * wave(f, n, 1), 0),
                        at=(0, 0, 0.012 + 0.012 * wave(f, n, 2)))

    return Clip(n, kept(rig, pose), loop=True)


def move(rig):
    """A gliding ripple, one a hex step: its arms streaming back as it glides, a quicker wave running up
    them, its mass bobbing twice. 0.6 s."""
    n = round(0.6 * FPS)

    def pose(f):
        bends = writhe(f, n, 1, [4, 6, 8, 9], phase, run=0.18)
        ahead = {k: [-6, -6, -5, -4] for k in range(1, len(ARMS) + 1)}  # tipped back (negative, ahead)
        return channels(bends, body=(-3 + 1.5 * wave(f, n, 2), 0, 0), at=(0, 0.01, 0.014 + 0.012 * wave(f, n, 2, 0.25)),
                        ahead=ahead)

    return Clip(n, kept(rig, pose), loop=True)


def rest_bends():
    return {n: [(0, 0)] * LENGTHS for n in range(1, len(ARMS) + 1)}


def keyed(keys, n, wedge=False, rig=None):
    """A one-shot pose function from keys: [(frame, ease, bends, ahead, body, at)], each moving into it
    from the key before with its ease, its bends and its turns ahead mixed length by length."""

    def at_frame(f):
        if f <= keys[0][0]:
            k0 = k1 = keys[0]
            u = 0.0
        else:
            k0, k1 = keys[-1], keys[-1]
            u = 0.0
            for a, b in zip(keys, keys[1:]):
                if f <= b[0]:
                    k0, k1 = a, b
                    u = EASES[b[1]]((f - a[0]) / (b[0] - a[0]))
                    break
        bends, ahead = {}, {}
        for arm_n in range(1, len(ARMS) + 1):
            bends[arm_n] = [tuple(p + (q - p) * u for p, q in zip(x, y)) for x, y in zip(k0[2][arm_n], k1[2][arm_n])]
            ahead[arm_n] = [p + (q - p) * u for p, q in zip(k0[3].get(arm_n, [0] * LENGTHS), k1[3].get(arm_n, [0] * LENGTHS))]
        body = tuple(p + (q - p) * u for p, q in zip(k0[4], k1[4]))
        at = tuple(p + (q - p) * u for p, q in zip(k0[5], k1[5]))
        return channels(bends, body=body, at=at, ahead=ahead)

    return kept(rig, at_frame, wedge) if rig is not None else at_frame


def uniform(bend):
    return {n: [bend] * LENGTHS for n in range(1, len(ARMS) + 1)}


def attack(rig):
    """Its foremost arm drawn back up and over, then flung forward on frame 3, the bolt leaving its
    fingers as it points at the foe; whipping on down, then drawn back up to where it stood, the other
    arms recoiling. 0.6 s."""
    n = round(0.6 * FPS)
    rest = rest_bends()
    drawn = dict(rest)
    drawn[1] = [(-14, 0), (-22, 0), (-24, 0), (-20, 0)]  # in and up, the tip curled back over
    flung = dict(rest)
    flung[1] = [(18, 0), (28, 0), (24, 0), (14, 0)]
    follow = dict(rest)
    follow[1] = [(24, 0), (32, 0), (20, 0), (4, 0)]
    recoil = {k: [(-4, 0)] * LENGTHS for k in range(2, len(ARMS) + 1)}
    for k, v in recoil.items():
        flung[k] = v
        follow[k] = v
    keys = [
        (0, 'smooth', drawn, {}, (-2, 0, 0), (0, 0.01, 0.012)),
        (2, 'smooth', drawn, {}, (-3, 0, 0), (0, 0.015, 0.016)),
        (3, 'in', flung, {}, (4, 0, 0), (0, -0.02, 0.012)),
        (5, 'out', follow, {}, (5, 0, 0), (0, -0.025, 0.01)),
        (10, 'smooth', {**rest, 1: [(6, 0), (8, 0), (4, 0), (0, 0)]}, {}, (1, 0, 0), (0, 0, 0.012)),
        (n, 'smooth', rest, {}, (0, 0, 0), (0, 0, 0.012)),
    ]
    return Clip(n, keyed(keys, n, wedge=True, rig=rig), marks={'strike': 3},
                muzzle=(f'tentacle_1_{LENGTHS}', tip_of(1)))


def raised(spread=10.0, lift=30.0, twist=0.0):
    """Every arm raised high and spread: leaning out from the body `spread` degrees, its end lifted
    `lift` degrees out of its hook so it points up, and turned `twist` degrees to its side, every
    other arm the other way, as it writhes."""
    out = {}
    for k in range(1, len(ARMS) + 1):
        hook = 1 if ARMS[k - 1][3] > 0 else -1
        w = twist * (1 if k % 2 else -1)
        out[k] = [(spread, 0.5 * w), (-8, -w), (-hook * lift / 3, w), (-hook * lift, 0)]
    return out


def cast(rig):
    """Tentacles: every arm reared up high and spread, leaning back and writhing, through its wind-up; then slammed
    down before it at the release, the end of its wind-up, the front arms reaching out over the
    ground ahead and the back arms arching over its mass; held, then drawn back up. 0.9 s."""
    h = rig.timing.release
    n = round(0.9 * FPS)
    rest = rest_bends()
    reared = raised(8, 24, 6)
    writhing = raised(10, 30, -8)
    back = {k: [-5, -5, -4, -3] for k in range(1, len(ARMS) + 1)}  # leaning back as it rears
    # Slammed down ahead: a bend forward at every length, more for the front arms, which reach further.
    front = {1: [26, 30, 26, 18], 2: [24, 28, 24, 16], 6: [24, 28, 24, 16],
             3: [34, 36, 30, 20], 5: [34, 36, 30, 20], 4: [40, 40, 32, 22]}
    keys = [
        (0, 'smooth', rest, {}, (0, 0, 0), (0, 0, 0.012)),
        (h - 6, 'smooth', reared, back, (-4, 0, 0), (0, 0.02, 0.03)),
        (h - 2, 'smooth', writhing, back, (-6, 0, 0), (0, 0.03, 0.035)),
        (h, 'in', rest, front, (6, 0, 0), (0, -0.02, 0.012)),
        (h + 4, 'out', rest, {k: [v * 1.05 for v in vs] for k, vs in front.items()}, (5, 0, 0), (0, -0.02, 0.012)),
        (n, 'smooth', rest, {}, (0, 0, 0), (0, 0, 0.012)),
    ]
    return Clip(n, keyed(keys, n, wedge=True, rig=rig), marks={'height': h})


def stun(rig):
    """Dazed: its arms sagging, their ends hung over its mass, swaying slowly, its mass sagging. 1.2 s."""
    n = round(1.2 * FPS)

    def pose(f):
        bends = writhe(f, n, 1, [3, 4, 5, 6], phase, run=0.1)
        droop = {k: [(o + d, s) for (o, s), d in zip(v, (6, -18, -28, -30))] for k, v in bends.items()}
        return channels(droop, body=(2 * wave(f, n, 1), 2 * wave(f, n, 1, 0.25), 0), at=(0, 0, 0.004))

    return Clip(n, kept(rig, pose), loop=True)


def death(rig):
    """Struck, its arms flail up, then collapse out and down into the pool, curling as they fall, and
    its mass slumps forward into the water. Ends low. 0.5 s."""
    n = round(0.5 * FPS)
    rest = rest_bends()
    flail = {k: [(-6, 6 * (1 if k % 2 else -1)), (-10, -8 * (1 if k % 2 else -1)), (-12, 8), (-8, 0)] for k in range(1, len(ARMS) + 1)}
    fallen = {k: [(12, 6), (-50, -8), (-60, 10), (-50, 0)] for k in range(1, len(ARMS) + 1)}
    keys = [
        (0, 'smooth', rest, {}, (0, 0, 0), (0, 0, 0.012)),
        (3, 'out', flail, {}, (-4, 0, 0), (0, 0, 0.03)),
        (9, 'in', {k: [(o * 0.6, s) for o, s in v] for k, v in fallen.items()}, {}, (5, 2, 0), (0, 0, 0.03)),
        (n, 'out', fallen, {}, (8, 3, 0), (0, 0, 0.035)),
    ]
    return Clip(n, keyed(keys, n, rig=rig))


def victory(rig):
    """It raises every arm high and spread, their ends lifted out of their hooks, writhing as they
    rise, its mass lifting, and holds them up. 0.8 s."""
    n = round(0.8 * FPS)
    rest = rest_bends()
    keys = [
        (0, 'smooth', rest, {}, (0, 0, 0), (0, 0, 0.012)),
        (8, 'smooth', raised(6, 18, 10), {}, (-2, 0, 0), (0, 0, 0.04)),
        (16, 'smooth', raised(10, 30, -10), {}, (-3, 0, 0), (0, 0, 0.06)),
        (n, 'smooth', raised(10, 32, 6), {}, (-3, 0, 0), (0, 0, 0.06)),
    ]
    return Clip(n, keyed(keys, n, rig=rig))


CLIPS = {'idle': idle, 'move': move, 'attack': attack, 'cast': cast, 'stun': stun, 'death': death, 'victory': victory}


def build():
    """Makes it in a fresh scene, every part bound to its bone and its joints marked, and returns the
    rig to finish() it with."""
    reset()
    make_materials()
    with bone('root'):
        pool()
    with bone('body'):
        mass()
    for n in range(1, len(ARMS) + 1):
        arm(n)
    return Rig(kind='large-creature', bones=bones(), clips=CLIPS)


def main():
    finish('watcher', budget=LARGE_BUDGET, rig=build())


if __name__ == '__main__':
    main()
