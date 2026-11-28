"""A warg of the Moria warband: a PvE monster (packages/sim/src/data/monsters.ts), in the Faceted style
(docs/viewer-spec.md section 4).

One of the great evil wolves that run with the goblins of the Misty Mountains, riderless and wild: the
same warg Sharku rides (../beasts.py, warg()), but a pack animal on the hunt rather than a mount. It
is darker, a sooty grey-black with a dull buff underside, its back about 0.6 off the ground; it carries
its head low and straight before it, jaws open on bone fangs and yellow eyes glaring under the brow;
its hackles stand up in a ragged dark crest from its skull along its bare back to its rump, where
Sharku's warg has his saddle-cloth, and its bushy tail hangs low behind it, as a wolf's does when it
stalks. Up to four of them share a board (round 2-7), so they read as a pack but stay modest.

Its livery, Moria rust (packages/client/src/livery.json), is a ragged rag wound round its neck by its
goblin masters, studded with crude iron spikes in `trim` (which the client colours iron at 1★, the only
star level a monster has), with a dag hanging under its throat in front and two long tattered ends
knotted at its nape that trail back over its withers, so it shows from in front, from behind and from
above against the dark coat.

It is rigged as a beast (../rig.py, Rig(kind='beast')): `root` and the warg's own bones, `mount_body`
where a figure's hips would be, its neck, head and biting jaw, its tail and its legs, three bones each,
and none of a figure's; the clip library's mounted styles move it without their rider, with a bite and
a howl of a beast's own (../clips.py, Beasts). It has no ability, so it never casts and has six clips.

    blender --background --factory-startup --python-exit-code 1 --python warg.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so its left is +X.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from beasts import (  # noqa: E402
    NECK,
    body_row,
    loft,
    nearest_on_polyline,
    neck_centre,
    neck_ring,
    ring8,
    tufts,
    warg,
)
from clips import tweened  # noqa: E402
from kit import EYES, UNIT_BUDGET, V, finish, material, part, reset, team_material, trim_material  # noqa: E402
from rig import Rig  # noqa: E402

# The wild warg's colours (sRGB): darker than Sharku's grizzled grey-brown mount.
FUR = 0x564F48  # sooty grey-black
DARK_FUR = 0x24211E  # its hackles, the crest down its back and the tip of its tail
PALE_FUR = 0x8C8373  # its throat, jaw and belly, a dull buff
GLARE = 0xD8B23A  # its yellow eyes
BONE = 0xD8CDAE  # its fangs

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        eyes=material('eyes', EYES, roughness=0.6),  # the dark of its mouth
        bone=material('bone', BONE, roughness=0.7),
        fur=material('fur', FUR, roughness=0.95),
        dark_fur=material('dark-fur', DARK_FUR, roughness=0.95),
        pale_fur=material('pale-fur', PALE_FUR, roughness=0.95),
        glare=material('warg-eyes', GLARE, roughness=0.5),
        trim=trim_material(),  # the collar's iron spikes
    )


# Its head is carried low and straight before it, the neck bent down over the span Sharku's turns in.
LOWER = 14

# Its tail hangs low behind it, bushy, as a wolf's does when it stalks: (points, radii, tip).
TAIL = ([V(0, 0.42, 0.54), V(0, 0.53, 0.55), V(0.01, 0.62, 0.47), V(0.02, 0.67, 0.35)],
        [0.055, 0.09, 0.105, 0.09], V(0.025, 0.69, 0.2))


def neck_at(k, grow=1.0):
    """The ring round the neck `k` of the way along its rows (NECK), from inside the body to the back
    of the skull, pushed out `grow` times from its middle."""
    i = min(int(k), len(NECK) - 2)
    f = k - i
    a, b = neck_ring(*NECK[i]), neck_ring(*NECK[i + 1])
    centre = neck_centre(i).lerp(neck_centre(i + 1), f)
    return [centre + (p.lerp(q, f) - centre) * grow for p, q in zip(a, b)]


def war_collar():
    """A ragged rag in the team colour wound round the neck, broad, from behind the shoulders' ruff
    to behind the jaw, with a dag hanging under its throat; two long tattered ends knotted at the nape
    trailing back over the withers; and crude iron spikes studding it. Returns where on it a rein
    would be tied, high on its left, as warg()'s `neck` must."""
    back, front = neck_at(0.7, 1.22), neck_at(1.8, 1.2)
    verts, faces, _ = loft([back, front])
    # The neck's ring: 0 the crest, 1 and 2 down its left side, 3 the throat, 4 and 5 up its right.
    # A dag hangs from the throat, and a shorter one from either side of it.
    for i, drop in ((3, V(0, 0.02, -0.15)), (2, V(0.02, 0.03, -0.07)), (4, V(-0.02, 0.03, -0.07))):
        a, b = i, 6 + i
        verts.append((verts[a] + verts[b]) / 2 + drop)
        faces.append((a, b, len(verts) - 1))
    # The knot at the nape, and two ends trailing back from it over the withers, one either side of
    # the crest, each two lengths of rag and a tattered point.
    knot = back[0].lerp(front[0], 0.4) + V(0, 0, 0.015)
    for s, length in ((1, 0.32), (-1, 0.26)):
        root = [knot + V(s * 0.012, 0.0, 0.0), knot + V(s * 0.095, 0.02, -0.035)]
        mid = [p + V(s * 0.03, 0.5 * length, -0.035) for p in root]
        end = [p + V(s * 0.03, 0.5 * length, -0.045) for p in mid]
        first = len(verts)
        verts += root + mid + end + [(end[0] + end[1]) / 2 + V(s * 0.005, 0.06, -0.03)]
        faces += [(first, first + 1, first + 3, first + 2), (first + 2, first + 3, first + 5, first + 4),
                  (first + 4, first + 5, first + 6)]
    axis = [neck_centre(0).lerp(neck_centre(1), 0.7), neck_centre(1).lerp(neck_centre(2), 0.8)]
    part('collar', verts, faces, M['team'], inside=nearest_on_polyline(axis))
    # Iron spikes through the rag: one either side of the crest and one low on either side.
    spikes = []
    middle = [(p + q) / 2 for p, q in zip(back, front)]
    centre = (axis[0] + axis[1]) / 2
    for i in (1, 2, 4, 5):
        c = middle[i]
        out = (c - centre).normalized()
        along = (front[i] - back[i]).normalized()
        side = out.cross(along).normalized()
        base = [c + 0.025 * along, c - 0.02 * along + 0.022 * side, c - 0.02 * along - 0.022 * side]
        spikes.append((base, c + 0.075 * out))
    tufts('collar-spikes', spikes, M['trim'])
    return back[1].lerp(front[1], 0.5)


def crest():
    """Its hackles up all down its bare back: a ragged crest of dark tufts along the spine from the
    withers to the rump, each leaning back."""
    spikes = []
    # Each tuft: where along the back, how tall, how far it leans back and to which side.
    for y, height, back, aside in ((-0.3, 0.085, 0.1, 0.012), (-0.17, 0.065, 0.11, -0.015), (-0.04, 0.075, 0.12, 0.01),
                                   (0.09, 0.05, 0.11, -0.01), (0.22, 0.06, 0.1, 0.012), (0.35, 0.04, 0.09, 0.0)):
        ring = ring8(*body_row(y))
        top = (ring[1] + ring[2]) / 2  # the middle of the top facet, along the line of the back
        base = [top + V(0.045, 0.03, -0.005), top + V(-0.045, 0.03, -0.005), top + V(0, -0.05, -0.005)]
        spikes.append((base, top + V(aside, back, height)))
    tufts('warg-crest', spikes, M['dark_fur'])


# Its clips (../clips.py): the mounted styles' mount half and a beast's own. It stands panting, weight
# shifting, and runs a warg's bounding lope (`bound` 1, as Sharku's), its hanging tail streaming out
# behind; it bites with a spring (`maul`), reels when dazed, goes down on its belly and howls when the
# pack wins, in 1.0 s, so it is howling by the time the fight's playback stops. They are tweened(), so
# its feet keep out of the ground between frames.
CLIPS = tweened({
    'idle': ('saddle', {'seconds': 2.0, 'breath': 1.2, 'sway': 0.8, 'pant': 5.0}),
    'move': ('gallop', {'bound': 1.0, 'tail': 24.0}),
    'attack': ('maul', {}),
    'stun': ('reel', {}),
    'death': ('fall', {}),
    'victory': ('howl', {}),
})


def build():
    """Makes it in a fresh scene, every part bound to its bone and its joints marked, and returns the
    rig to finish() it with."""
    reset()
    make_materials()
    beast = warg(M, turn=0, lower=LOWER, neck=war_collar, tail=TAIL, back=crest)
    return Rig(kind='beast', mount=beast.rig, clips=CLIPS)


def main():
    finish('warg', budget=UNIT_BUDGET, rig=build())


if __name__ == '__main__':
    main()
