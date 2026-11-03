"""Gollum, once Sméagol: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star levels").

The 1★ Gollum (gollum.py) plus one piece, the leash of The Two Towers, IV 1, "The Taming of Sméagol".
Sam's rope of Lórien, grey and silken, is bound round his left ankle, and its long end trails behind
him over the ground and lies in a loose coil at his left, where it shows from behind and, past his
knee, from in front. It is the elven rope that burned and froze him as he wailed, so it is pale and
clean against his slimy skin: a light grey, never blue. The thick rope and its spiral coil are drawn
bigger than life, so they read at game size.

Everything else is as at 1★: the team colour on the rag round his shoulders and the loincloth, and
`trim` on his scraps of goblin metal: the toggle in the rag's knot, the buckle on his cord and the
clip in his hair.

It is rigged as the 1★ is: this script imports gollum.py, builds him with the rope round his left
ankle (gollum.build()), and finishes him with the 1★'s rig, so he has the same bones and clips and
moves as he does at 1★ (../README.md, Gear models). The turns round his ankle are bound to his left
shin, and so is the end of the rope that leaves them; the rest of it lies on the ground, bound to the
root, which never moves, so as his leg moves the rope between them stretches and slackens, and the
coil stays where it lies.

    blender --background --factory-startup --python-exit-code 1 --python gollum-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, bent_tube, bone, finish, material, tube  # noqa: E402

gollum = importlib.import_module('gollum')  # the 1★ model, which this one is with its gear
M = gollum.M  # its materials, made as it builds

ROPE = 0xB4B0A2  # the elven rope: a light, silky grey, a little warm, never blue


# The gear for 2 stars: the elven rope, tied round his ankle as a leash ----------------------------

# Where it is bound round his shin above the ankle: from and to (distance up the shin), and radius.
BAND = 0.022, 0.07, 0.05
# The rope from the turns down to the ground behind his heel, and out over it to his left: points
# after the one where it leaves the turns (found from the shin).
TRAIL = [V(0.27, 0.27, 0.03), V(0.38, 0.312, 0.0)]
# Then it lies in a loose coil at his left, beside him so it shows from in front as well as from
# behind: a flat spiral round its middle, turning inwards from the outer radius to the inner over
# the sweep (degrees), from the first angle, with this many points. Nine, where main drew ten: the
# rigged 1★ is 8 triangles more than the one main built on (his limbs bend in two pieces), and with
# ten the gear model came to 908, over its budget of 900.
COIL = V(0.5, 0.2, 0.0), (0.118, 0.045), 90, 470, 9
ROPE_R = 0.016, 0.022  # the rope's half-thickness, up and across: drawn thick, so it reads
ROPE_LIE = 0.012  # the height of its middle where it lies on the ground
HELD = 0.05  # how near the point where it leaves the turns the rope's vertices ride the shin


def leash(knee, ankle):
    """The rope round his left ankle, and its end trailing behind him into a loose coil: called as the
    1★'s legs are made, given the left knee and ankle."""
    M['rope'] = material('rope', ROPE, roughness=0.65)
    up = (knee - ankle).normalized()
    low, high, r = BAND
    with bone('shin_l'):  # bound round the shin, it moves with it
        tube('rope-turns', ankle + low * up, ankle + high * up, [(0, r), (1, r)], M['rope'], n=6)
    # It leaves the turns at their back, on the outside of his leg.
    out = V(0.7, 0.7, 0)
    out = (out - out.dot(up) * up).normalized()
    start = ankle + 0.5 * (low + high) * up + (r - 0.01) * out
    centre, (outer, inner), first, sweep, n = COIL
    coil = []
    for i in range(n):
        t = i / (n - 1)
        a = math.radians(first - sweep * t)  # clockwise from above, the way the trail comes in
        radius = outer + (inner - outer) * t
        coil.append(centre + V(radius * math.cos(a), radius * math.sin(a), 0))
    points = [start] + TRAIL + coil
    points = [V(p.x, p.y, max(p.z, ROPE_LIE)) for p in points]

    # Where it leaves the turns it rides the shin; everything else lies on the ground, on the root.
    def lying(p):
        return None if (p - start).length < HELD else 'root'

    with bone('shin_l', follows=lying):
        bent_tube('rope', points, [ROPE_R] * len(points), M['rope'], n=4, phase=45, side=V(0, 0, 1),
                  end='cap')


def main():
    rig = gollum.build(leash=leash)  # the 1★ Gollum, with the rope round his left ankle
    finish('gollum-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
