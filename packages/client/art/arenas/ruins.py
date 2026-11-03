"""The ruins: a court of old Gondor gone to grass, as at Osgiliath or Amon Hen, where the board is
laid on the paving among broken columns, tumbled drums and walls fallen to rubble
(docs/viewer-spec.md section 3, Arena).

Warm, worn sandstone in a narrow range of browns, so the units and their team colours are what
stand out. The court round the board and the bench is kept clear; low rubble and grass ring it,
and the tall ruins stand beyond, on all four sides, since the camera looks from behind either
team's back row.
"""

import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..')]
from arena import (  # noqa: E402
    FLOOR_TOP,
    block,
    drum,
    finish_arena,
    hex_centres,
    hex_frame,
    in_hex,
    rock,
    tuft,
    zone,
)
from kit import V, material, part, reset  # noqa: E402

# Colours (sRGB), warm and close together.
SLABS = (0xA98C69, 0x9F8262, 0xB09370, 0x957A5B)
DIRT = 0x5B4936
MORTAR = 0x43362B
COLUMN = 0xB79E7C
PLINTH = 0x9C8466
WALLS = (0xA48A69, 0x977E5F)
ROCKS = (0x8C7760, 0x7E6A55, 0x9A846B)
GRASS = (0x7D9440, 0x99A04A)
STATUE = 0xA99273

SLAB = 2.0  # the paving's grid
GAP = 0.07  # between slabs, where the dirt shows
FLOOR = (26, 22)  # how far the paving runs, |x| and |y|; dirt beyond, under the fog


class Layout:
    """Where things stand, so props don't sink into each other."""

    def __init__(self):
        self.taken = []

    def free(self, x, y, r):
        return all((x - ox) ** 2 + (y - oy) ** 2 >= (r + orad) ** 2 for ox, oy, orad in self.taken)

    def take(self, x, y, r):
        self.taken.append((x, y, r))


def build():
    reset()
    M = {
        'slabs': [material(f'slab{i}', c, roughness=0.95) for i, c in enumerate(SLABS)],
        'dirt': material('dirt', DIRT, roughness=1.0),
        'mortar': material('mortar', MORTAR, roughness=1.0),
        'column': material('column', COLUMN, roughness=0.9),
        'plinth': material('plinth', PLINTH, roughness=0.9),
        'walls': [material(f'wall{i}', c, roughness=0.95) for i, c in enumerate(WALLS)],
        'rocks': [material(f'rock{i}', c, roughness=0.95) for i, c in enumerate(ROCKS)],
        'grass': [material(f'grass{i}', c, roughness=1.0) for i, c in enumerate(GRASS)],
        'statue': material('statue', STATUE, roughness=0.9),
    }
    layout = Layout()
    ground(M)
    columns(M, layout)
    walls(M, layout)
    fallen(M, layout)
    statues(M, layout)
    rubble(M, layout)
    scatter(M, layout)


# The ground --------------------------------------------------------------------------------------


def ground(M):
    """Dirt under everything, the paving, under the board too, since its hexes are translucent, and
    the mortar the hexes are set in, which shows in the gaps between them."""
    big = 90
    z = FLOOR_TOP - 0.1
    part('dirt', [V(-big, -big, z), V(big, -big, z), V(big, big, z), V(-big, big, z)], [(0, 1, 2, 3)], M['dirt'], outward=V(0, 0, 1))

    for i, c in enumerate(hex_centres()):
        hex_frame(f'mortar.{i}', c, 0.9, 1.0, FLOOR_TOP - 0.08, FLOOR_TOP + 0.02, M['mortar'])

    jitter = random.Random(1)
    nx, ny = int(FLOOR[0] // SLAB), int(FLOOR[1] // SLAB)
    for i in range(-nx, nx):
        for j in range(-ny, ny):
            x0, y0 = i * SLAB, j * SLAB
            cx, cy = x0 + SLAB / 2, y0 + SLAB / 2
            where = zone(cx, cy)
            roll = jitter.random()
            if where != 'court' and roll < 0.06:
                continue  # a slab gone, the dirt showing
            shade = jitter.choice(M['slabs'])
            sink = jitter.uniform(-0.025, 0.012) + (0 if where == 'court' else jitter.uniform(-0.03, 0))
            tilt = (jitter.uniform(-0.7, 0.7), jitter.uniform(-0.7, 0.7)) if where != 'court' else (0, 0)
            if roll < 0.3:
                # Two half slabs, along x or along y.
                along_x = jitter.random() < 0.5
                for k in (-1, 1):
                    ox, oy = (k * SLAB / 4, 0) if along_x else (0, k * SLAB / 4)
                    size = (SLAB / 2 - GAP, SLAB - GAP, 0.16) if along_x else (SLAB - GAP, SLAB / 2 - GAP, 0.16)
                    block(
                        f'slab.{i}.{j}.{k}',
                        (cx + ox, cy + oy, FLOOR_TOP - 0.08 + sink + jitter.uniform(-0.012, 0.012)),
                        size,
                        jitter.choice(M['slabs']),
                        tilt=tilt,
                        chamfer=0.05,
                    )
            else:
                block(f'slab.{i}.{j}', (cx, cy, FLOOR_TOP - 0.08 + sink), (SLAB - GAP, SLAB - GAP, 0.16), shade, tilt=tilt, chamfer=0.06)


# Columns -----------------------------------------------------------------------------------------


def column(M, layout, name, x, y, height, seed, radius=0.55, whole=False, lean=0.0, lean_dir=0.0):
    """A column of drums on a two-step plinth: broken off at `height`, or `whole` with its capital.
    `lean` tips the shaft by that many degrees towards `lean_dir` (degrees from +x)."""
    jitter = random.Random(seed)
    layout.take(x, y, 1.15)
    base = FLOOR_TOP
    block(f'{name}.plinth', (x, y, base + 0.18), (1.7, 1.7, 0.36), M['plinth'], yaw=jitter.uniform(-3, 3), chamfer=0.07)
    block(f'{name}.step', (x, y, base + 0.36 + 0.11), (1.38, 1.38, 0.22), M['plinth'], yaw=jitter.uniform(-3, 3), chamfer=0.06)
    z = base + 0.58
    tip = V(math.cos(math.radians(lean_dir)), math.sin(math.radians(lean_dir)), 0) * math.sin(math.radians(lean))
    up = (V(0, 0, 1) * math.cos(math.radians(lean)) + tip).normalized()
    origin = V(x, y, z)
    shaft = height - 0.58 - (0.5 if whole else 0)
    drums = max(1, round(shaft / 0.95))
    length = shaft / drums
    phase = jitter.uniform(0, 45)
    for d in range(drums):
        start = origin + up * (d * length)
        offset = V(jitter.uniform(-0.03, 0.03), jitter.uniform(-0.03, 0.03), 0)
        last = d == drums - 1
        drum(
            f'{name}.drum{d}',
            start + offset,
            start + offset + up * (length - 0.015),
            radius * (1 - 0.03 * d / drums),
            M['column'],
            n=8,
            chamfer=0.05,
            phase=phase + jitter.uniform(-4, 4),
            broken=(0.5 if last and not whole else None),
            seed=seed * 31 + d,
            cap_start=False,
        )
    if whole:
        top = origin + up * shaft
        block(f'{name}.echinus', (top.x, top.y, top.z + 0.14), (1.2, 1.2, 0.28), M['column'], yaw=phase, chamfer=0.1)
        block(f'{name}.abacus', (top.x, top.y, top.z + 0.4), (1.5, 1.5, 0.24), M['plinth'], yaw=phase, chamfer=0.05)
    else:
        # The rest of it, fallen at its foot.
        fall = math.radians(jitter.uniform(0, 360))
        for k in range(jitter.randint(1, 2)):
            d = 1.35 + k * 0.9 + jitter.uniform(0, 0.3)
            fx, fy = x + math.cos(fall) * d, y + math.sin(fall) * d
            if zone(fx, fy) == 'court':
                continue
            lie_drum(M, f'{name}.down{k}', fx, fy, fall + math.radians(jitter.uniform(-40, 40)), radius, 0.85, seed * 7 + k)
        rubble_heap(M, f'{name}.heap', x, y, 1.6, 7, seed * 3, size=0.32)


def lie_drum(M, name, x, y, heading, radius, length, seed):
    """A drum lying on its side on the paving, its axis along `heading` (radians from +x)."""
    jitter = random.Random(seed)
    a = V(math.cos(heading), math.sin(heading), 0)
    centre = V(x, y, FLOOR_TOP + radius * 0.93)
    drum(name, centre - a * length / 2, centre + a * length / 2, radius, M['column'], n=8, chamfer=0.05, phase=jitter.uniform(0, 45), seed=seed)


def columns(M, layout):
    # Beyond team B's half (+y): what the camera behind team A looks at over the board.
    far = [(-11.5, 4.6, False, 0, 0), (-5.6, 2.1, False, 0, 0), (0.0, 5.8, True, 0, 0), (5.6, 3.5, False, 6, 20), (11.5, 5.1, False, 0, 0)]
    # Beyond team A's half (-y), for the camera behind team B.
    near = [(-11.5, 3.9, False, 0, 0), (-5.6, 5.4, True, 0, 0), (0.0, 1.7, False, 0, 0), (5.6, 4.7, False, 5, 200), (11.5, 2.9, False, 0, 0)]
    for k, (x, h, whole, lean, lean_dir) in enumerate(far):
        column(M, layout, f'far{k}', x, 13.2, h, 100 + k, whole=whole, lean=lean, lean_dir=lean_dir)
    for k, (x, h, whole, lean, lean_dir) in enumerate(near):
        column(M, layout, f'near{k}', x, -13.2, h, 200 + k, whole=whole, lean=lean, lean_dir=lean_dir)
    # Down both sides.
    left = [(-6.2, 2.7), (0.4, 5.2), (6.6, 3.8)]
    right = [(-6.6, 4.3), (-0.4, 1.9), (6.2, 5.3)]
    for k, (y, h) in enumerate(left):
        column(M, layout, f'left{k}', -12.8, y, h, 300 + k)
    for k, (y, h) in enumerate(right):
        column(M, layout, f'right{k}', 12.8, y, h, 400 + k)


# Walls -------------------------------------------------------------------------------------------


def wall(M, layout, name, start, end, heights, seed, depth=0.85):
    """A wall of squared blocks in courses from `start` to `end` (x, y), broken down to the number of
    courses `heights` gives along it (a list, from start to end), the top course gapped."""
    jitter = random.Random(seed)
    sx, sy = start
    ex, ey = end
    length = math.hypot(ex - sx, ey - sy)
    ux, uy = (ex - sx) / length, (ey - sy) / length
    yaw = math.degrees(math.atan2(uy, ux))
    course_h = 0.52
    for k in range(int(length) + 1):
        t = k / max(1, int(length))
        layout.take(sx + ux * length * t, sy + uy * length * t, 0.7)
    max_courses = max(heights)
    for c in range(max_courses):
        along = jitter.uniform(0, 0.6) if c % 2 else 0.0
        while along < length - 0.3:
            size = min(jitter.uniform(1.0, 1.7), length - along)
            mid = along + size / 2
            # Courses here, from the profile.
            f = mid / length * (len(heights) - 1)
            i = min(int(f), len(heights) - 2)
            here = heights[i] + (heights[i + 1] - heights[i]) * (f - i)
            here += jitter.uniform(-0.6, 0.4)
            if c < here and not (c == math.ceil(here) - 1 and c > 0 and jitter.random() < 0.25):
                cx, cy = sx + ux * mid, sy + uy * mid
                shove = jitter.uniform(-0.05, 0.05)
                block(
                    f'{name}.{c}.{along:.2f}',
                    (cx - uy * shove, cy + ux * shove, FLOOR_TOP + course_h * c + course_h / 2),
                    (size - 0.05, depth * jitter.uniform(0.93, 1.0), course_h - 0.03),
                    jitter.choice(M['walls']),
                    yaw=yaw + jitter.uniform(-2.5, 2.5),
                    chamfer=0.06,
                )
            along += size
    # Fallen blocks along its foot, both sides.
    for k in range(int(length / 2.5)):
        t = jitter.uniform(0.05, 0.95)
        side = jitter.choice((-1, 1)) * jitter.uniform(0.9, 1.8)
        bx, by = sx + ux * length * t - uy * side, sy + uy * length * t + ux * side
        if zone(bx, by) != 'open':
            continue
        block(
            f'{name}.fallen{k}',
            (bx, by, FLOOR_TOP + 0.2),
            (jitter.uniform(0.8, 1.3), depth * 0.9, 0.48),
            jitter.choice(M['walls']),
            yaw=yaw + jitter.uniform(-35, 35),
            tilt=(jitter.uniform(-8, 8), jitter.uniform(-8, 8)),
            chamfer=0.06,
        )


def walls(M, layout):
    wall(M, layout, 'farwall', (-19, 16.8), (19, 16.8), [2, 5, 7, 4, 1, 2, 6, 8, 5, 3], 11)
    wall(M, layout, 'nearwall', (-19, -16.8), (19, -16.8), [3, 7, 4, 2, 5, 8, 6, 2, 1, 4], 12)
    wall(M, layout, 'leftwall', (-18.2, -15), (-18.2, 15), [2, 4, 6, 3, 1, 3, 5, 3], 13)
    wall(M, layout, 'rightwall', (18.2, -15), (18.2, 15), [3, 6, 2, 1, 4, 6, 3, 2], 14)


# Fallen columns and statues ----------------------------------------------------------------------


def fallen_column(M, layout, name, x, y, heading, drums, seed, radius=0.55):
    """A column lying where it fell, its drums apart and askew."""
    jitter = random.Random(seed)
    h = math.radians(heading)
    a = V(math.cos(h), math.sin(h), 0)
    for d in range(drums):
        along = (d - (drums - 1) / 2) * (0.95 + jitter.uniform(0.0, 0.25))
        cx, cy = x + a.x * along, y + a.y * along
        layout.take(cx, cy, 0.7)
        lie_drum(M, f'{name}.{d}', cx, cy, h + math.radians(jitter.uniform(-14, 14)), radius, 0.88, seed * 13 + d)


def fallen(M, layout):
    fallen_column(M, layout, 'fallenleft', -15.2, -1.5, 84, 5, 21)
    fallen_column(M, layout, 'fallenright', 15.0, 1.8, 100, 4, 22)
    fallen_column(M, layout, 'fallenfar', 8.4, 14.9, 8, 4, 23)
    fallen_column(M, layout, 'fallennear', -8.6, -14.9, -6, 4, 24)


def statue(M, layout, name, x, y, facing, seed):
    """The plinth of a fallen king, his feet still on it and his legs broken off at the shin; the
    rest of him long gone."""
    jitter = random.Random(seed)
    layout.take(x, y, 2.4)
    base = FLOOR_TOP
    block(f'{name}.base', (x, y, base + 0.3), (3.6, 2.9, 0.6), M['plinth'], yaw=facing, chamfer=0.08)
    block(f'{name}.plinth', (x, y, base + 0.6 + 0.55), (3.0, 2.3, 1.1), M['statue'], yaw=facing, chamfer=0.1)
    top = base + 1.7
    f = math.radians(facing)
    across = V(math.cos(f), math.sin(f), 0)
    ahead = V(-math.sin(f), math.cos(f), 0)
    for side, height in ((-1, 1.9), (1, 1.1)):
        foot = V(x, y, 0) + across * (side * 0.62)
        toe = foot + ahead * 0.35
        block(f'{name}.foot{side}', (toe.x, toe.y, top + 0.22), (0.62, 1.15, 0.44), M['statue'], yaw=facing, chamfer=0.12)
        drum(
            f'{name}.shin{side}',
            V(foot.x, foot.y, top + 0.3),
            V(foot.x, foot.y, top + 0.3 + height),
            0.34,
            M['statue'],
            n=7,
            chamfer=0.04,
            phase=jitter.uniform(0, 50),
            broken=0.35,
            seed=seed * 5 + side,
            cap_start=False,
        )
    rubble_heap(M, f'{name}.heap', x, y, 3.0, 9, seed * 17, size=0.42)


def statues(M, layout):
    statue(M, layout, 'farstatue', -15.0, 13.0, 0, 31)
    statue(M, layout, 'nearstatue', 15.0, -13.0, 180, 32)


# Rubble, rocks and grass -------------------------------------------------------------------------


def rubble_heap(M, name, x, y, radius, count, seed, size=0.35):
    """Broken stone heaped round (x, y): blocky rocks, bigger and higher towards the middle."""
    jitter = random.Random(seed)
    for k in range(count):
        angle = jitter.uniform(0, math.tau)
        d = radius * math.sqrt(jitter.random())
        rx, ry = x + math.cos(angle) * d, y + math.sin(angle) * d
        if zone(rx, ry) == 'court':
            continue
        s = size * jitter.uniform(0.45, 1.0) * (1.15 - 0.4 * d / radius)
        if zone(rx, ry) == 'low':
            s = min(s, 0.3)
        rock(f'{name}.{k}', (rx, ry, FLOOR_TOP + s * 0.55), (s * jitter.uniform(0.9, 1.4), s, s * jitter.uniform(0.6, 0.9)), jitter.choice(M['rocks']), seed * 101 + k)


def rubble(M, layout):
    """Boulders and heaps of broken stone where the walls and columns leave room: the corners, and
    the band round the court, where only low things go."""
    jitter = random.Random(41)
    corners = [(-11.6, 10.8), (11.4, 10.6), (-11.2, -10.9), (11.8, -10.6), (-16.0, 7.5), (16.2, -7.0), (-16.4, -9.0), (16.0, 9.5)]
    for k, (x, y) in enumerate(corners):
        layout.take(x, y, 1.6)
        for b in range(3):
            bx, by = x + jitter.uniform(-1.1, 1.1), y + jitter.uniform(-1.1, 1.1)
            r = jitter.uniform(0.55, 1.05)
            # Nudged out of the low band, away from the court, so none of it reaches in.
            while zone(abs(bx) - 1.4 * r, abs(by) - 1.4 * r) != 'open':
                bx += math.copysign(0.25, bx)
                by += math.copysign(0.25, by)
            rock(f'boulder.{k}.{b}', (bx, by, FLOOR_TOP + r * 0.55), (r * 1.25, r, r * 0.8), jitter.choice(M['rocks']), 500 + k * 7 + b)
        rubble_heap(M, f'corner.{k}', x, y, 2.0, 8, 600 + k)
    # Low rubble in the band round the court.
    placed = 0
    tries = 0
    while placed < 26 and tries < 2000:
        tries += 1
        x, y = jitter.uniform(-11.0, 11.0), jitter.uniform(-11.4, 11.4)
        if zone(x, y) != 'low' or not layout.free(x, y, 0.8):
            continue
        layout.take(x, y, 0.8)
        rubble_heap(M, f'band.{placed}', x, y, 0.9, 5, 700 + placed, size=0.26)
        placed += 1


def scatter(M, layout):
    """Loose stones and tufts of grass over everything, a few in the court where they don't get in
    the way: off the board, and off the bench in front of team A."""
    jitter = random.Random(51)
    centres = list(hex_centres())

    def on_board_or_bench(x, y):
        p = V(x, y, 0)
        if any(in_hex(p, c, 1.15) for c in centres):
            return True
        return abs(x) < 8.0 and abs(y + 7.45) < 1.1

    stones = 0
    tries = 0
    while stones < 150 and tries < 5000:
        tries += 1
        x, y = jitter.uniform(-24, 24), jitter.uniform(-20, 20)
        where = zone(x, y)
        if on_board_or_bench(x, y) or not layout.free(x, y, 0.2):
            continue
        s = jitter.uniform(0.06, 0.13) if where == 'court' else jitter.uniform(0.08, 0.32 if where == 'low' else 0.5)
        rock(f'stone.{stones}', (x, y, FLOOR_TOP + s * 0.45), (s * 1.2, s, s * 0.7), jitter.choice(M['rocks']), 800 + stones)
        stones += 1
    tufts = 0
    tries = 0
    while tufts < 240 and tries < 5000:
        tries += 1
        x, y = jitter.uniform(-24, 24), jitter.uniform(-20, 20)
        # Grass grows in the gaps, and at the feet of things.
        x = round(x / 2.0) * 2.0 + jitter.uniform(-0.12, 0.12) if jitter.random() < 0.5 else x
        if on_board_or_bench(x, y):
            continue
        tuft(f'tuft.{tufts}', (x, y, FLOOR_TOP - 0.02), jitter.choice(M['grass']), 900 + tufts, height=jitter.uniform(0.3, 0.55) if zone(x, y) != 'court' else 0.24, blades=6)
        tufts += 1


def main():
    build()
    finish_arena('ruins')


if __name__ == '__main__':
    main()
