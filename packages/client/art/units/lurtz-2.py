"""Lurtz, the Uruk-hai: an Archer of Isengard, his 2★ model, with his gear (docs/viewer-spec.md
section 4, "Star levels").

The 1★ Lurtz (lurtz.py) plus one piece, the sword of the Uruk-hai. The great Orcs Aragorn finds dead
at Parth Galen "were armed with short broad-bladed swords, not with the curved scimitars usual with
Orcs" (The Two Towers, III 1). His hangs bare at his left hip through a ring on a strap from his
belt: a straight, broad blade of plain steel, its flat turned square to his back, so it shows beside
his leg from in front and from behind, with a heavy cross-guard and pommel of `trim`. The rest of the
trim is as on the 1★: the helm's brow band, the ring of his scalp-lock, the buckle, the quiver's
bands, the bracers' bands and the ferrules of the bow's grip.

It is rigged as the 1★ is: this script imports lurtz.py, builds him with the sword hung from his
belt, bound to his hips with the belt (lurtz.build()), and finishes him with the 1★'s rig, so he has
the same bones and clips and moves as he does at 1★ (../README.md, Gear models). Main's 2★ model also
shortened the arrow's point, so that, standing still, he reached less far and the client grew him
more for his stars; rigged, his reach is his clips', which the arrow is part of, so it is the 1★'s.

    blender --background --factory-startup --python-exit-code 1 --python lurtz-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import (  # noqa: E402
    GEAR_BUDGET,
    STEEL,
    V,
    bone,
    box,
    cone,
    finish,
    loft,
    material,
    nearest_on_line,
    part,
    tube,
)

lurtz = importlib.import_module('lurtz')  # the 1★ model, which this one is with its gear
M = lurtz.M  # its materials, made as it builds
HIPS_YAW, yaw = lurtz.HIPS_YAW, lurtz.yaw


# The gear for 2 stars: the sword of the Uruk-hai ---------------------------------------------------

# It hangs bare at his left hip through a ring on a strap from his belt, below the cape's rags, built
# square to his body and then turned with his hips: the middle of the cross-guard, the way the blade
# points from it and the way its flat faces, square to his back, so the cameras in front and behind
# both see it.
# The blade is 0.33 long, 7 cm shorter than main's 0.4. Rigged, the sword rides his hips, which drop
# 0.2 as he goes down on his knees in his death: main's blade then went 4.9 cm into the ground (frame
# 13), and grounded() (../clips.py) would have stopped his hips there and changed how he falls. This
# one clears the ground by 1.5 cm in every frame, and is still the "short broad-bladed" sword of the
# books.
SWORD_GUARD = V(0.3, 0.0, 0.53)
SWORD_DOWN = V(0.12, 0.22, -1.0)  # down, back and a little out from his hip
SWORD_FACE = V(0.3, 1.0, 0.0)
BLADE_LENGTH = 0.33
# Stations along the blade: fraction of its length, half-width and half-thickness at the ridge.
# Straight and broad, a little broader towards the point.
BLADE = [(0.0, 0.046, 0.012), (0.7, 0.056, 0.011), (0.86, 0.047, 0.009)]
BELT_RING = V(0.22, -0.01, 0.6)  # where the ring hangs from the belt, over his hip


def sword():
    """The sword, as main drew it, called inside the 1★'s build after his arms. It hangs from his
    belt, so it rides his hips with it."""
    M['steel'] = material('steel', STEEL, roughness=0.4, metallic=0.1)
    before = set(bpy.context.scene.objects)
    down = SWORD_DOWN.normalized()
    face = (SWORD_FACE - SWORD_FACE.dot(down) * down).normalized()
    width = down.cross(face).normalized()
    guard = SWORD_GUARD
    with bone('hips'):
        rings = []
        for t, w, th in BLADE:
            c = guard + t * BLADE_LENGTH * down
            rings.append([c + w * width, c + th * face, c - w * width, c - th * face])
        verts, faces, _ = loft(rings)
        tip, last = len(verts), (len(rings) - 1) * 4
        verts.append(guard + BLADE_LENGTH * down)
        faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
        part('blade', verts, faces, M['steel'], inside=nearest_on_line(guard, guard + down))

        # A heavy cross-guard, a short leather grip rising from it and a pommel.
        box('guard', guard, [down, width, face], (0.015, 0.078, 0.024), M['trim'], 0.85)
        end = guard - 0.1 * down
        tube('grip', end, guard, [(0, 0.017), (1, 0.017)], M['leather'], n=4, phase=45)
        cone('pommel', end, end - 0.034 * down, 0.03, M['trim'], n=4, phase=45, back=end + 0.012 * down)

        # The strap from the belt to the ring the blade is thrust through, under the guard.
        below = guard + 0.04 * down
        tube('frog', BELT_RING, below, [(0, 0.016), (1, 0.016)], M['leather'], n=4, phase=45)

    for obj in lurtz.new_objects(before):
        obj.data.transform(yaw(HIPS_YAW).to_4x4())


def main():
    rig = lurtz.build(sword=sword)  # the 1★ Lurtz, with the sword at his hip
    finish('lurtz-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
