"""The Eye's Nazgûl: the summon the Eye sends after the One Ring's bearer (packages/sim/src/data/units.ts,
SUMMONS; docs/sim-spec.md section 12.6), in the Faceted style (docs/viewer-spec.md section 4).

A Ringwraith on foot, built on the Ringwraith (ringwraith.py), hooded and faceless, cloaked and robed in
black to the ground, with the Nazgûl's ragged mantle and haggard grey claw. It is a hunter, as the Black
Riders were in the Shire, stooping and sniffing after the Ring: its body bends forward from the waist, so
its hood is thrust out low over its reaching claw (STOOP), and the two points of light in the dark of
its hood burn red, the Eye's own fire, where the Ringwraith's are pale. In its right hand, in place of
the Morgul-knife, it carries a long, pale blade, slim and glimmering with a cold light, held low and
pointing ahead at what it hunts.

It imports the Ringwraith's script, as the 2★ models import their 1★ (../README.md, Gear models), and
builds it with its blade (ringwraith.build(blade=...)), then stoops the whole of it, joints and all, and
gives its eyes their colour. It keeps the Ringwraith's rig: the hood is the head, and the robe to the
ground bends at the waist and below the knees, the robe below them on its own bone, `robe`, which
robed() hangs plumb under it. It has no ability, so it never casts and has six clips, without `cast`
(../rig.py, Timing.wanted()).

Its livery is the Nazgûl's (packages/client/src/livery.json): the mantle and the rim of the hood, as
the Ringwraith's. Its fittings, the clasp, the belt's buckle, the bosses and the blade's guard and
pommel, use `trim`, which the client colours iron at 1★, the only star level a summon has.

    blender --background --factory-startup --python-exit-code 1 --python eye-nazgul.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so its right hand is at -X.
"""

import importlib
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]  # the kit, and the Ringwraith's script beside this one
from kit import V, box, cone, finish, linear, loft, material, part, stoop  # noqa: E402
from clips import fit, robed  # noqa: E402
from rig import Rig  # noqa: E402

ringwraith = importlib.import_module('ringwraith')
M = ringwraith.M  # its materials, made as it builds

EMBER = 0xE0482C  # the red fire of its eyes
PALE = 0xD9E2E4  # the blade's cold, pale light

# The stoop: nothing below LOW moves, and above it the body bends forward and down, by the whole of
# FORWARD and DROP from HIGH up, so the hood is thrust out low.
STOOP = {'low': 0.75, 'high': 1.3, 'forward': 0.2, 'drop': 0.1}

# The blade, in the right fist, held low, pointing ahead and down and out to its right, so it shows from behind too.
BLADE_DIR = V(-0.38, -0.7, -0.6).normalized()
BLADE_LENGTH = 0.48
# Stations along the blade: fraction of its length, half-width and half-thickness; slim and straight.
BLADE_STATIONS = [(0.0, 0.022, 0.008), (0.6, 0.02, 0.007), (0.88, 0.014, 0.006)]
BLADE_ROLL = 50  # degrees the flat is turned from upright towards the sky, to catch the light


def pale_blade():
    """Builds the fist and the long pale blade in it, and returns its grip, its point and the way an edge
    faces, as the Ringwraith's knife() does."""
    # Its cold light, made here, once the build has reset the scene and made the Ringwraith's materials.
    M['pale'] = material('pale', PALE, roughness=0.3, metallic=0.1, emission=PALE, emission_strength=0.6)
    elbow, wrist = ringwraith.R_ELBOW, ringwraith.R_WRIST
    ahead = (wrist - elbow).normalized()
    fist = wrist + 0.05 * ahead
    d = BLADE_DIR
    up = (d - d.dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    box('fist', fist, [ahead, up, across], (0.048, 0.05, 0.052), M['skin'], 0.85)

    level = V(d.y, -d.x, 0).normalized()  # across the blade, level
    upright = level.cross(d).normalized()
    if upright.z < 0:
        upright = -upright
    roll = math.radians(BLADE_ROLL)
    width = math.cos(roll) * upright + math.sin(roll) * level
    side = d.cross(width).normalized()

    guard = fist + 0.07 * d
    rings = []
    for t, w, th in BLADE_STATIONS:
        c = guard + t * BLADE_LENGTH * d
        rings.append([c + w * width, c + th * side, c - w * width, c - th * side])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * 4
    point = guard + BLADE_LENGTH * d
    verts.append(point)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    part('blade', verts, faces, M['pale'], inside=lambda c: guard + (c - guard).dot(d) * d)

    # A plain bar of a guard, the grip and a pommel, the fittings in `trim`.
    box('guard', guard, [d, width, side], (0.012, 0.06, 0.014), M['trim'], 0.8)
    end = fist - 0.075 * d
    ringwraith.limb('grip', [end, guard], [0.017, 0.017], M['leather'], n=4, phase=45)
    cone('pommel', end, end - 0.04 * d, 0.026, M['trim'], n=4, phase=45, back=end + 0.016 * d)
    return fist, point, width


def burning_eyes():
    """The two points of light in its hood, red with the Eye's fire."""
    eyes = M['eyes']
    bsdf = eyes.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = linear(EMBER)
    bsdf.inputs['Emission Color'].default_value = linear(EMBER)


# Its clips (../clips.py): the Nazgûl's, as the Ringwraith's, but lower and quicker, a hunter's: it
# stands stooped, breathing slow, and runs low with its hood thrust ahead and its claw reaching; it stabs
# with the pale blade, drawn back wide of its robe and driven out ahead; it sinks down into its own robes
# as it dies; and it lifts the blade high as it wins. The robe below the knees hangs plumb, twists with
# the stride and rests on the ground (robed()). It has no ability, so it has no cast.
CLIPS = robed(fit({
    'idle': ('ready', {'breath': 0.8, 'sway': 0.6}),
    'move': ('run', {'heavy': 0.4, 'stride': 0.6, 'lift': 0.18, 'lean': 18.0, 'off': 'high'}),
    'attack': ('thrust', {'out': 20.0, 'wide': 0.3}),
    'stun': ('dazed', {}),
    'death': ('knees', {'dropped': True}),
    'victory': ('raise', {'out': 0.35}),
}, between=True))


def build():
    """Makes it in a fresh scene, on the Ringwraith with its pale blade, stooped, every part bound to its
    bone and the joints marked, and returns the rig to finish() it with."""
    ringwraith.build(blade=pale_blade)
    stoop(bpy.context.scene.objects, **STOOP)
    burning_eyes()
    return Rig(bones={'robe': ('root', 'robe_top', 'robe_foot')}, clips=CLIPS)


def main():
    finish('eye-nazgul', rig=build())


if __name__ == '__main__':
    main()
