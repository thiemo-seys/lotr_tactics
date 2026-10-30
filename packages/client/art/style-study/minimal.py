"""Gimli in the Minimal style: abstract and faceless (README.md).

A board-game piece of a dozen bold solids: a dome helmet resting on a wedge of beard, a stout mail
body on two block boots, a hood, cape and shield face in the team colour, and a half-disc axe. No
face and no small detail: the silhouette and a few colour blocks carry the character.

    blender --background --factory-startup --python-exit-code 1 --python minimal.py -- <out.glb>
"""

import math
import os
import sys

from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import finish, material, mesh, reset, team_material  # noqa: E402

# Soft, slightly desaturated colours, so the team colour is always the boldest block.
STONE = 0xA9AEB2  # steel and mail: a light grey, which three.js lights better than metal
RUST = 0xA2552F  # the beard: auburn, warmer and more orange than the red team
LEATHER = 0x7D5E46  # boots, belt, gloves and the haft: light enough not to sink into the board
BRASS = 0xCFAE72  # the buckle

# Every round part is an octagon with a flat face to the front (-Y), so the parts line up.
SIDES = 8
FLAT = math.pi / SIDES

# Heights that several parts share.
HEM = 0.15  # the bottom of the mail shirt; the boots show below it
WAIST = 0.42  # the middle of the belt, where the beard is tucked in
SHOULDER = 0.62  # where the hood's hem lies on the body
CHIN = 0.85  # where the helmet sits on the beard and the hood
HEAD = (0.0, -0.03)  # the head sits a little forward, a Dwarf leaning into the fight


def body_radius(z):
    """The body is a barrel that widens from the hem to broad shoulders."""
    return 0.29 + (z - HEM) * (0.37 - 0.29) / (SHOULDER - HEM)


# Geometry helpers ---------------------------------------------------------------------------------


def transform(verts, matrix):
    return [tuple(matrix @ Vector(v)) for v in verts]


def ring(radius, z, sides=SIDES, spin=FLAT, centre=(0.0, 0.0)):
    """A regular polygon at height z, counter-clockwise seen from above."""
    step = math.tau / sides
    return [
        (centre[0] + radius * math.cos(spin + k * step), centre[1] + radius * math.sin(spin + k * step), z)
        for k in range(sides)
    ]


def loft(sections, cap_start=True, cap_end=True):
    """Joins rings of points into a tube. Every ring runs counter-clockwise seen from the end the
    rings stack towards, and has the same length, or one point for a pole. Returns vertices, faces
    and, for each face, which gap between rings it spans (a cap counts with its neighbouring gap)."""
    verts, faces, gaps, starts = [], [], [], []
    for section in sections:
        starts.append(len(verts))
        verts.extend(section)
    for i in range(len(sections) - 1):
        a, b = starts[i], starts[i + 1]
        if len(sections[i]) == 1:
            n = len(sections[i + 1])
            faces += [(a, b + (k + 1) % n, b + k) for k in range(n)]
        elif len(sections[i + 1]) == 1:
            n = len(sections[i])
            faces += [(a + k, a + (k + 1) % n, b) for k in range(n)]
        else:
            n = len(sections[i])
            faces += [(a + k, a + (k + 1) % n, b + (k + 1) % n, b + k) for k in range(n)]
        gaps += [i] * n
    if cap_start and len(sections[0]) > 2:
        faces.append(tuple(reversed(range(starts[0], starts[0] + len(sections[0])))))
        gaps.append(0)
    if cap_end and len(sections[-1]) > 2:
        faces.append(tuple(range(starts[-1], starts[-1] + len(sections[-1]))))
        gaps.append(len(sections) - 2)
    return verts, faces, gaps


def solid(name, verts, faces, mats, face_mats=None):
    """A mesh object; `face_mats` gives each face an index into `mats`."""
    obj = mesh(name, verts, faces, mats[0])
    for mat in mats[1:]:
        obj.data.materials.append(mat)
    if face_mats is not None:
        obj.data.polygons.foreach_set('material_index', face_mats)
    return obj


def lathe(name, profile, mats, gap_mats=None, sides=SIDES, spin=FLAT, centre=(0.0, 0.0),
          cap_start=True, cap_end=True, matrix=None):
    """A solid of revolution from (radius, height) points, bottom to top; radius 0 is a pole.
    `gap_mats` picks a material for each band between profile points."""
    sections = [ring(r, z, sides, spin, centre) if r > 0 else [(centre[0], centre[1], z)] for r, z in profile]
    verts, faces, gaps = loft(sections, cap_start, cap_end)
    if matrix is not None:
        verts = transform(verts, matrix)
    mats = mats if isinstance(mats, list) else [mats]
    return solid(name, verts, faces, mats, [gap_mats[g] for g in gaps] if gap_mats else None)


def slab(name, outline, depth, mat, matrix):
    """A flat solid: an (x, z) outline, counter-clockwise seen from the front, `depth` thick."""
    front = [(x, -depth / 2, z) for x, z in outline]
    back = [(x, depth / 2, z) for x, z in outline]
    verts, faces, _ = loft([back, front])
    return solid(name, transform(verts, matrix), faces, [mat])


def beam(name, start, end, radius, mat, sides=4):
    """A prism from `start` to `end`, open at the start: a haft's butt faces the ground."""
    start, end = Vector(start), Vector(end)
    axis = end - start
    turn = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    return lathe(name, [(radius, 0.0), (radius, axis.length)], mat, sides=sides, spin=math.pi / 4,
                 cap_start=False, matrix=Matrix.Translation(start) @ turn)


def frame(origin, up, out):
    """A matrix whose local +Z runs along `up` and local +X towards `out`."""
    z = Vector(up).normalized()
    x = (Vector(out) - Vector(out).dot(z) * z).normalized()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(origin)
    return m


# Parts --------------------------------------------------------------------------------------------


def boots(leather):
    # Feet apart and the shield foot a half step forward: a braced guard.
    for name, x, y in (('boot.right', -0.13, 0.03), ('boot.left', 0.13, -0.04)):
        w, toe, heel, h = 0.17, -0.17, 0.09, HEM + 0.02
        base = [(-w / 2, toe, 0), (w / 2, toe, 0), (w / 2, heel, 0), (-w / 2, heel, 0)]
        top = [(-w / 2, toe + 0.1, h), (w / 2, toe + 0.1, h), (w / 2, heel, h), (-w / 2, heel, h)]
        verts, faces, _ = loft([base, top], cap_start=False)  # nobody sees the soles
        solid(name, transform(verts, Matrix.Translation((x, y, 0))), faces, [leather])


def body(steel):
    # The hood and the cape cover its top and back; what shows is mail.
    lathe('body', [(body_radius(HEM), HEM), (body_radius(SHOULDER + 0.02), SHOULDER + 0.02)], steel,
          cap_start=False, cap_end=False)


def belt(leather, brass):
    low, high = WAIST - 0.045, WAIST + 0.045
    # No caps: from above, the inside of the band looks the same as a lid would.
    lathe('belt', [(body_radius(low) + 0.018, low), (body_radius(high) + 0.018, high)], leather,
          cap_start=False, cap_end=False)
    front = (body_radius(WAIST) + 0.018) * math.cos(FLAT)
    buckle = [(-0.05, 0), (0.05, 0), (0.05, 0.075), (-0.05, 0.075)]
    slab('buckle', buckle, 0.03, brass, Matrix.Translation((0, -front - 0.01, WAIST - 0.0375)))


def beard(rust):
    # One wedge that grows from under the helmet rim, juts out over the chest and narrows to a blunt
    # point tucked under the belt. It stays in front of the hood, which shows on both sides of it. A
    # ridge down the middle splits its front into two planes that catch the light differently.
    def section(z, half_width, front, ridge, back):
        return [(-half_width, back, z), (-half_width, front, z), (0, ridge, z), (half_width, front, z), (half_width, back, z)]

    verts, faces, _ = loft([
        section(WAIST, 0.045, -0.29, -0.31, -0.2),
        section(0.66, 0.19, -0.42, -0.48, -0.2),
        section(CHIN + 0.01, 0.15, -0.185, -0.235, 0.0),
    ], cap_start=False, cap_end=False)  # its ends are inside the belt and the helmet
    solid('beard', verts, faces, [rust])


def hood(team):
    # The hood thrown back lies on the shoulders as a mantle, which rings the helmet seen from above.
    # At the back its hem hangs in a wide V, the point of the hood: a chevron on the back that
    # answers the beard's on the front. The hem has a point in the middle of each side of the
    # octagon, so the V can reach its tip at the centre of the back.
    hem_z = SHOULDER - 0.01
    tip_z, tip_reach = 0.42, 0.37  # the V's point, and how far out to the sides it starts

    def hem_point(angle, on_face):
        r = body_radius(hem_z) + 0.05
        x, y = math.cos(angle), math.sin(angle)
        z = hem_z
        if y > 0:  # the back half
            along = min(1.0, abs(x) * r / tip_reach)  # 0 at the point, 1 where the V starts
            z = tip_z + (hem_z - tip_z) * along
            # Follow the barrel in, staying outside the cape, and stand the point out from the back:
            # its faces fold, so the game's light picks out the V even without shadows.
            r = body_radius(z) + 0.05 + 0.06 * (1 - along)
        r *= math.cos(FLAT) if on_face else 1.0
        return (r * x, r * y, z)

    corners = [FLAT + k * math.tau / SIDES for k in range(SIDES)]
    hem = [p for a in corners for p in (hem_point(a, False), hem_point(a + FLAT, True))]
    # Broad and square: a Dwarf's shoulders, not a sloping vase. Flatter at the front, where the
    # beard lies over them.
    shoulder = [(x, y * (0.88 if y < 0 else 1.0), z) for x, y, z in ring(0.385, 0.735)]
    neck = ring(0.2, CHIN)
    # Each side of the octagon: three triangles from the hem's two corners and middle up to the
    # shoulder, then a quad from the shoulder up to the neck.
    s, n = len(hem), len(hem) + SIDES
    faces = []
    for k in range(SIDES):
        corner, middle, following = 2 * k, 2 * k + 1, (2 * k + 2) % len(hem)
        left, right = s + k, s + (k + 1) % SIDES
        faces += [(corner, middle, left), (middle, right, left), (middle, following, right)]
        faces.append((left, right, n + (k + 1) % SIDES, n + k))
    solid('hood', hem + shoulder + neck, faces, [team])


def cape(team):
    # The back half of the body, one layer out, from under the hood to the knees, flaring a little as
    # it falls. It follows the barrel instead of hanging free, so from behind he stays one clean
    # shape, with his boots showing below. A single sheet: the material is double-sided, and nothing
    # ever sees its inside.
    knee, top = 0.17, SHOULDER + 0.01
    angles = [0.0] + [FLAT + k * math.tau / SIDES for k in range(4)] + [math.pi]

    def edge(z):
        r = body_radius(z) + 0.025 + 0.04 * (top - z) / (top - knee)
        # Its ends lie on the flat sides (0 and 180 degrees), not out at a corner.
        return [(r * (math.cos(FLAT) if a in (0.0, math.pi) else 1.0) * math.cos(a),
                 r * (math.cos(FLAT) if a in (0.0, math.pi) else 1.0) * math.sin(a), z) for a in angles]

    n = len(angles)
    faces = [(k, k + 1, n + k + 1, n + k) for k in range(n - 1)]
    solid('cape', edge(knee) + edge(top), faces, [team])


def helmet(steel):
    # The lid stays: without it you would see down past the dome to the beard.
    lathe('helmet.rim', [(0.235, CHIN), (0.235, CHIN + 0.07)], steel, centre=HEAD, cap_start=False)
    r = 0.212
    base = CHIN + 0.065
    lathe('helmet.dome', [(r, base), (r * 0.71, base + r * 0.71), (0, base + r)], steel, centre=HEAD, cap_start=False)


def shield(team, steel):
    # On the left arm, which it hides: held forward and tipped up to the camera. It turns out only a
    # little, since units face each other along hex directions, often 30 degrees off the camera.
    radius, centre = 0.26, (0.43, -0.12, 0.44)
    profile = [(radius, 0.0), (radius, 0.045), (radius - 0.045, 0.05), (0.075, 0.07), (0, 0.125)]
    gap_mats = [1, 1, 0, 1]  # edge, rim and boss in steel; the face between rim and boss in team
    matrix = Matrix.Translation(centre) @ Matrix.Rotation(math.radians(20), 4, 'Z') @ Matrix.Rotation(math.radians(78), 4, 'X')
    lathe('shield', profile, [team, steel], gap_mats, matrix=matrix)


def axe(leather, steel):
    # Raised a little in the right fist (-X), the head beside the helmet. No arm: the fist says
    # enough. The head is a half disc set a little out from the haft and tapering into it, so it reads
    # as an axe from any side and never as a flag on a pole. It faces front and back, where the
    # game's camera sees it whole.
    hand = Vector((-0.39, -0.17, 0.47))
    up = Vector((-0.1, -0.15, 1.0)).normalized()
    beam('haft', hand - 0.22 * up, hand + 0.64 * up, 0.03, leather)
    arc = [(0.06 + 0.17 * math.cos(a), 0.23 * math.sin(a)) for a in (math.radians(d) for d in (-90, -45, 0, 45, 90))]
    head = [(0.0, -0.07)] + arc + [(0.0, 0.07)]
    slab('blade', head, 0.035, steel, frame(hand + 0.48 * up, up, (-1, 0, 0)))
    fist = [(-0.07, -0.07), (0.07, -0.07), (0.07, 0.07), (-0.07, 0.07)]
    slab('fist', fist, 0.14, leather, frame(hand, up, (-1, 0, 0)))


def main():
    reset()
    team = team_material()
    steel = material('steel', STONE, roughness=0.6, metallic=0.1)
    rust = material('beard', RUST, roughness=0.95)
    leather = material('leather', LEATHER, roughness=0.9)
    brass = material('brass', BRASS, roughness=0.5, metallic=0.1)

    boots(leather)
    body(steel)
    belt(leather, brass)
    beard(rust)
    hood(team)
    cape(team)
    helmet(steel)
    shield(team, steel)
    axe(leather, steel)
    finish('gimli-minimal', budget=350)


main()
