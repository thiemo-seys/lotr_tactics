"""Gimli as a chibi collectible vinyl toy, for the art style study (README.md).

Super-deformed: the helmet, face and beard make well over half his height, on a stubby barrel of a
body with an oversized axe and shield. Forms are round and smooth-shaded, with crisp edges only
where a moulded toy would have them (the blade's edge, the shield's rim and boss, the belt).
Colours are bright and clean with a slight sheen, like painted vinyl, and the team colour is the
boldest block: the hood thrown back over his shoulders, the cape and the shield's face.

    blender --background --factory-startup --python-exit-code 1 --python chibi.py -- <out.glb>

Most parts are generated rather than taken from Blender's primitives, so that each one spends its
few triangles where the silhouette needs them and leaves out faces nobody can see. Rounded forms
come from the shapes themselves rather than bevel modifiers, which would cost more than the
budget allows.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import finish, material, reset, team_material  # noqa: E402

# Painted vinyl: bright, clean colours with a slight sheen (roughness 0.35 to 0.5, no metal, since
# the game has no environment map to reflect).
STEEL = 0xBCC9D9  # helmet, blade, shield rim and boss: light silver-blue
MAIL = 0x93A5BE  # the mail shirt, a shade darker than the helmet so the two read apart
BEARD = 0xD5702F  # orange auburn, kept well away from the red team's hue
SKIN = 0xF6C3A4
EYE = 0x241B22
GLINT = 0xFFFFFF
ROSY = 0xF3A08A  # nose and cheeks, rosier than the face, so the nose reads as a ball
TUNIC = 0x4F9A55  # a band of green under the mail, neither team's colour
LEATHER = 0x8A4D28  # belt, bracers, boots and the back of the shield
BRASS = 0xF4C24C
WOOD = 0xB0703A

# Proportions, in game units (1 Blender unit). He stands 1.11 tall to the knob on his helmet.
HEAD = Vector((0, 0, 0.70))
HEAD_RADIUS = 0.25
HELMET_BASE = 0.80  # the middle of the brass band, where the dome starts
SHOULDER = Vector((0.165, -0.01, 0.42))  # the left one; the right mirrors it in x
RIGHT_FIST = Vector((-0.315, -0.09, 0.345))
LEFT_FIST = Vector((0.27, -0.12, 0.35))


# --- Geometry -------------------------------------------------------------------------------------


def frame(z_axis, x_hint) -> Matrix:
    """A rotation that turns local +Z to `z_axis`, with local +X as close to `x_hint` as it can be."""
    z = Vector(z_axis).normalized()
    x = Vector(x_hint)
    x = (x - z * x.dot(z)).normalized()
    return Matrix((x, z.cross(x), z)).transposed()


def place(verts, center=(0, 0, 0), z_axis=(0, 0, 1), x_hint=(1, 0, 0), scale=(1, 1, 1)):
    """Local vertices scaled per axis, turned by `frame(z_axis, x_hint)` and moved to `center`."""
    turn = frame(z_axis, x_hint)
    sx, sy, sz = scale
    return [Vector(center) + turn @ Vector((v.x * sx, v.y * sy, v.z * sz)) for v in verts]


def lathe(profile, segments, arc=None, plan=None, angles=None):
    """A surface of revolution about +Z from `profile`, a list of (radius, height) points.

    Walk the profile with the outside on its right (upwards for a dome); a radius of 0 at either
    end closes it with a pole. `arc` = (start, end) in degrees, 0 at +X and 90 at +Y, makes an open
    sheet instead of a full turn, and `angles` (degrees, increasing) a full turn through those
    angles instead of even steps. `plan(index, angle, radius, height)` may move each point, for
    shapes that aren't round. Returns the vertices, the faces, each face's band (the index of the
    profile segment it came from) and the rings of vertex indices.
    """
    if angles is not None:
        angles = [math.radians(a) for a in angles]
        arc = None
    elif arc is None:
        angles = [2 * math.pi * k / segments for k in range(segments)]
    else:
        start, end = map(math.radians, arc)
        angles = [start + (end - start) * k / segments for k in range(segments + 1)]
    verts, rings = [], []
    for i, (r, h) in enumerate(profile):
        if r < 1e-9:
            rings.append([len(verts)])
            verts.append(Vector((0, 0, h)))
            continue
        ring = []
        for a in angles:
            rr, hh = plan(i, a, r, h) if plan else (r, h)
            ring.append(len(verts))
            verts.append(Vector((rr * math.cos(a), rr * math.sin(a), hh)))
        rings.append(ring)
    count = len(angles)
    spans = count if arc is None else count - 1
    faces, bands = [], []
    for i in range(len(rings) - 1):
        low, high = rings[i], rings[i + 1]
        for k in range(spans):
            k1 = (k + 1) % count
            if len(low) == 1:
                faces.append((low[0], high[k1], high[k]))
            elif len(high) == 1:
                faces.append((low[k], low[k1], high[0]))
            else:
                faces.append((low[k], low[k1], high[k1], high[k]))
            bands.append(i)
    return verts, faces, bands, rings


def sphere_profile(latitudes):
    """A lathe profile for a unit sphere through `latitudes` in degrees, from the bottom up."""
    points = []
    for lat in latitudes:
        r = math.cos(math.radians(lat))
        points.append((0.0 if abs(lat) >= 90 else r, math.sin(math.radians(lat))))
    return points


def ring_edges(ring):
    """The edges round a closed ring of vertex indices."""
    return list(zip(ring, ring[1:] + ring[:1]))


def build(name, verts, faces, face_materials, sharp=(), sharp_angle=None):
    """A smooth-shaded mesh object with a material per face. Edges in `sharp` (vertex index pairs)
    and, with `sharp_angle` in degrees, edges between faces meeting at more than it stay crisp."""
    data = bpy.data.meshes.new(name)
    data.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    slots = []
    for m in face_materials:
        if m not in slots:
            slots.append(m)
    for m in slots:
        data.materials.append(m)
    data.polygons.foreach_set('material_index', [slots.index(m) for m in face_materials])
    data.shade_smooth()
    if sharp_angle is not None:
        data.set_sharp_from_angle(angle=math.radians(sharp_angle))
    wanted = {tuple(sorted(pair)) for pair in sharp}
    for edge in data.edges:
        if tuple(sorted(edge.vertices)) in wanted:
            edge.use_edge_sharp = True
    data.validate()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def ellipsoid(name, mat, center, radii, segments, latitudes, z_axis=(0, 0, 1), x_hint=(1, 0, 0)):
    """A smooth ellipsoid with its poles along `z_axis`; `radii` are along local x, y and z."""
    verts, faces, _, _ = lathe(sphere_profile(latitudes), segments)
    verts = place(verts, center, z_axis, x_hint, radii)
    return build(name, verts, faces, [mat] * len(faces))


def puff_field(puffs, sharpness):
    """The smooth union of ellipsoids, each a (centre, radii) pair: below 1 inside, 1 on the skin.
    Where two puffs meet they bulge together a little, like cloud or stuffed vinyl."""

    def value(p):
        total = 0.0
        for c, (rx, ry, rz) in puffs:
            q = p - c
            g = math.sqrt((q.x / rx) ** 2 + (q.y / ry) ** 2 + (q.z / rz) ** 2)
            total += max(g, 1e-6) ** -sharpness
        return total ** (-1 / sharpness)

    return value


def blob(name, mat, puffs, center, z_axis, x_hint, polar, angles, sharpness=6.0):
    """A cloud of puffs as one smooth surface: a UV sphere around `center`, its pole along
    `z_axis` (local +X along `x_hint`), with rings at the `polar` angles from the pole and spokes
    at `angles` round it, all in degrees. Every vertex is pushed out along its ray to the
    outermost skin of the puffs, so the lobes merge without seams. A lobe only shows as a round
    bump in the outline if three or four spokes cross it."""
    turn = frame(z_axis, x_hint)
    origin = Vector(center)
    profile = [
        (0.0 if p in (0, 180) else math.sin(math.radians(p)), math.cos(math.radians(p)))
        for p in reversed(polar)
    ]
    verts, faces, _, _ = lathe(profile, len(angles), angles=sorted(a % 360 for a in angles))
    inside = puff_field([(Vector(c), r) for c, r in puffs], sharpness)
    step = 0.004
    surface = []
    for v in verts:
        ray = (turn @ v).normalized()
        # March in from outside, so the vertex lands on the outermost skin, then refine.
        t = 0.6
        while t > 0 and inside(origin + ray * t) > 1:
            t -= step
        low, high = max(t, 0.0), t + step
        for _ in range(14):
            mid = (low + high) / 2
            if inside(origin + ray * mid) > 1:
                high = mid
            else:
                low = mid
        surface.append(origin + ray * low)
    return build(name, surface, faces, [mat] * len(faces))


def decal(name, mat, center, radius, latitude, longitude, size, lift=(0.003, 0.009), points=8):
    """A domed oval lying on a sphere, like a printed eye on a toy: `size` is its half width and
    half height, `lift` how far its edge and its middle stand off the surface. Longitude 0 faces
    the front (-Y) and grows towards his left (+X)."""
    lat, lon = math.radians(latitude), math.radians(longitude)
    normal = Vector((math.cos(lat) * math.sin(lon), -math.cos(lat) * math.cos(lon), math.sin(lat)))
    across = Vector((0, 0, 1)).cross(normal).normalized()
    up = normal.cross(across)
    verts = [Vector(center) + normal * (radius + lift[1])]
    for k in range(points):
        a = 2 * math.pi * k / points
        offset = across * (size[0] * math.cos(a)) + up * (size[1] * math.sin(a))
        verts.append(Vector(center) + (normal + offset / radius).normalized() * (radius + lift[0]))
    faces = [(0, 1 + k, 1 + (k + 1) % points) for k in range(points)]
    return build(name, verts, faces, [mat] * len(faces))


# --- Parts ----------------------------------------------------------------------------------------


def helmet(steel, brass):
    """A round steel cap, a little big for him, like a toy's. A brass band frames his face and ties
    the helmet to his buckle, and a brass knob on top is its finial."""
    dome = [(0.272, 0.0), (0.252, 0.1), (0.198, 0.192), (0.11, 0.257), (0, 0.28)]
    verts, faces, _, _ = lathe(dome, 12)
    build('helmet', place(verts, (0, 0.005, HELMET_BASE)), faces, [steel] * len(faces))
    verts, faces, _, _ = lathe([(0.285, -0.026), (0.272, 0.028)], 12)
    build('helmet-band', place(verts, (0, 0.005, HELMET_BASE)), faces, [brass] * len(faces))
    verts, faces, _, _ = lathe([(0.032, -0.012), (0.03, 0.018), (0, 0.04)], 5)
    knob = place(verts, (0, 0.005, HELMET_BASE + 0.268))
    build('helmet-knob', knob, faces, [brass] * len(faces))


def head(skin, hair):
    """Only the band under the helmet shows: the face in front, his hair round the back."""
    verts, faces, _, _ = lathe(sphere_profile([-55, -20, 4, 25]), 10)
    verts = place(verts, HEAD, scale=(HEAD_RADIUS,) * 3)
    mats = []
    for f in faces:
        middle = sum((verts[i] - HEAD for i in f), Vector()) / len(f)
        # The face wraps round to the ears, so the head reads as a ball; hair only at the back.
        facing = math.degrees(math.atan2(middle.x, -middle.y))
        mats.append(skin if abs(facing) < 110 else hair)
    build('head', verts, faces, mats)


def face(eye, glint, rosy, beard_mat):
    """Big dark eyes with a glint, rosy cheeks, bushy brows from under the band and a big round
    nose sitting on the moustache."""
    for side in (-1, 1):
        decal(f'eye-{side}', eye, HEAD, HEAD_RADIUS, 1, 22 * side, (0.042, 0.058))
        # The glints sit up and to the same side on both eyes, as if lit from one window.
        decal(
            f'glint-{side}', glint, HEAD, HEAD_RADIUS + 0.009, 7, 22 * side - 5, (0.013, 0.013),
            lift=(0.002, 0.003), points=4,
        )
        decal(
            f'cheek-{side}', rosy, HEAD, HEAD_RADIUS, -12, 40 * side, (0.036, 0.024),
            lift=(0.001, 0.004), points=5,
        )
        brow = Vector((0.09 * side, 0, 0.766))
        brow.y = -math.sqrt(HEAD_RADIUS**2 - brow.x**2 - (brow.z - HEAD.z) ** 2) - 0.014
        # Long and soft, their poles at the ends so they show a rounded outline from the front;
        # the inner ends a little low, for a determined look on a friendly face.
        ellipsoid(
            f'brow-{side}', beard_mat, brow, (0.03, 0.034, 0.07), 5, [-90, -30, 30, 90],
            z_axis=(1, 0, 0.2 * side), x_hint=(0, -1, 0),
        )
    ellipsoid(
        'nose', rosy, (0, -0.262, 0.628), (0.062, 0.06, 0.058), 8, [-90, -30, 30, 90],
        z_axis=(0, -1, 0),
    )


def beard(mat):
    """The cloud: cheeks, jaw and a chest of beard in one puffy shape, pinched at the bottom where
    it is tucked into his belt, with a moustache over it."""
    puffs = [
        ((0, -0.19, 0.47), (0.15, 0.1, 0.14)),  # chin and chest
        ((0, -0.215, 0.575), (0.12, 0.065, 0.055)),  # upper lip, under the moustache
        ((0, -0.18, 0.33), (0.08, 0.07, 0.07)),  # the end, tucked behind the belt
    ]
    for side in (-1, 1):
        puffs += [
            ((0.17 * side, -0.14, 0.56), (0.09, 0.095, 0.085)),  # cheeks
            ((0.18 * side, -0.16, 0.43), (0.095, 0.095, 0.095)),  # jaw
        ]
    # Pole forward and a little down, so the rings round it trace the outline seen from the front.
    spokes = [15 * k for k in range(24)]
    blob('beard', mat, puffs, (0, -0.1, 0.47), (0, -1, -0.2), (1, 0, 0), [0, 45, 95, 180], spokes)
    for side in (-1, 1):
        # Each half droops outwards from under the nose.
        ellipsoid(
            f'moustache-{side}', mat, (0.064 * side, -0.262, 0.58), (0.048, 0.042, 0.074), 5,
            [-90, -35, 35, 90], z_axis=(side, 0, -0.45), x_hint=(0, -1, 0),
        )


def body(tunic, mail, leather, brass):
    """A barrel of mail to mid-thigh over a green tunic hem, a broad belt with a brass buckle, and
    two round boots underneath."""

    def belly(index, angle, r, h):
        # The belt bulges forward over his belly, so it passes in front of the tucked-in beard.
        front = max(0.0, -math.sin(angle)) ** 2
        return r + (0.0, 0.0, 0.035, 0.04)[index] * front, h

    profile = [(0.15, 0.08), (0.18, 0.15), (0.205, 0.25), (0.21, 0.33)]
    verts, faces, bands, rings = lathe(profile, 8, plan=belly)
    mats = [(tunic, mail, leather)[b] for b in bands]
    build('body', place(verts, (0, 0.01, 0)), faces, mats, sharp=ring_edges(rings[2]))
    verts, faces, _, _ = lathe([(0.06, -0.01), (0.052, 0.014), (0, 0.018)], 4)
    verts = place(verts, (0, -0.25, 0.29), (0, -1, 0.15), (1, 0, 1), (1, 0.85, 1))
    build('buckle', verts, faces, [brass] * len(faces), sharp_angle=50)
    for side in (-1, 1):
        # Toes turned out a little, feet apart.
        verts, faces, _, _ = lathe(sphere_profile([0, 40, 90]), 5)
        toes = (math.cos(0.2 * side), math.sin(0.2 * side), 0)
        verts = place(verts, (0.105 * side, -0.03, 0), (0, 0, 1), toes, (0.08, 0.11, 0.11))
        build(f'boot-{side}', verts, faces, [leather] * len(faces))


def arms(mail, leather, skin):
    """Stubby arms: a mail sleeve, a leather bracer and a big round mitt of a fist. The left fist
    is hidden by the shield, so it is a plain cap."""
    for side, fist in ((-1, RIGHT_FIST), (1, LEFT_FIST)):
        shoulder = Vector((SHOULDER.x * side, SHOULDER.y, SHOULDER.z))
        reach = (fist - shoulder).length
        if side < 0:
            profile = [
                (0.05, 0), (0.056, reach * 0.45), (0.06, reach * 0.7), (0.074, reach * 0.98),
                (0, reach + 0.07),
            ]
        else:
            profile = [(0.05, 0), (0.056, reach * 0.45), (0.06, reach * 0.8), (0, reach + 0.05)]
        verts, faces, bands, _ = lathe(profile, 5)
        verts = place(verts, shoulder, fist - shoulder, (0, 0, 1))
        build(f'arm-{side}', verts, faces, [(mail, leather, skin, skin)[b] for b in bands])


def cloak(team):
    """His hood, thrown back, makes a broad mantle over his shoulders, with the hood itself
    bunched in his nape and its point down his back, and a short cape hangs to his knees: team
    colour from the front, the back and above. The mantle is open in front, where the beard hides
    it anyway."""

    def hunch(index, angle, r, h):
        # Higher and fuller at the back, where the hood gathers.
        back = max(0.0, math.sin(angle)) ** 2
        return r + (0.01, 0.04, 0.05)[index] * back, h + (0.0, 0.03, 0.05)[index] * back

    profile = [(0.29, 0.32), (0.255, 0.44), (0.13, 0.54)]
    verts, faces, _, _ = lathe(profile, 9, arc=(-45, 225), plan=hunch)
    build('mantle', place(verts, (0, 0.01, 0)), faces, [team] * len(faces))

    top, tip = Vector((0, 0.2, 0.7)), Vector((0, 0.3, 0.3))
    length = (tip - top).length
    profile = [(0, 0), (0.17, length * 0.2), (0.13, length * 0.5), (0.05, length * 0.85), (0, length)]
    verts, faces, _, _ = lathe(profile, 6)
    verts = place(verts, top, tip - top, (1, 0, 0), (1, 0.55, 1))  # flattened against his back
    build('hood', verts, faces, [team] * len(faces))

    def hem(index, angle, r, h):
        # The cape hangs lowest at the middle of his back.
        return (r, h + 0.05 * (1 - math.sin(angle))) if index == 0 else (r, h)

    profile = [(0.3, 0.1), (0.272, 0.25), (0.25, 0.38)]
    verts, faces, _, _ = lathe(profile, 5, arc=(20, 160), plan=hem)
    build('cape', place(verts, (0, 0.01, 0)), faces, [team] * len(faces))


def axe(steel, wood):
    """An oversized war axe, upright in his right fist with its head beside his own: one broad
    crescent blade pointing out to his right, so it shows face-on from the front and the back."""
    axis = Vector((-0.1, -0.2, 1)).normalized()
    profile = [(0, -0.25), (0.04, -0.215), (0.03, 0.54), (0, 0.566)]
    verts, faces, bands, _ = lathe(profile, 5)
    haft = place(verts, RIGHT_FIST, axis, (0, 1, 0))
    build('haft', haft, faces, [(steel, wood, wood)[b] for b in bands])

    # The blade is a lens: thick along its middle, coming to an edge all round, so smooth shading
    # rounds it like a moulded toy's and the edge stays crisp.
    outward = Vector((-1, 0, 0))
    outward = (outward - axis * outward.dot(axis)).normalized()
    normal = outward.cross(axis)
    root = RIGHT_FIST + axis * 0.36
    outline = [
        (0.0, 0.085), (0.06, 0.095), (0.12, 0.13), (0.18, 0.185), (0.235, 0.2), (0.262, 0.11),
        (0.272, 0.0), (0.262, -0.11), (0.235, -0.2), (0.18, -0.185), (0.12, -0.13),
        (0.06, -0.095), (0.0, -0.085),
    ]
    rim = [root + outward * a + axis * b for a, b in outline]
    middle = root + outward * 0.13
    verts = rim + [middle + normal * 0.042, middle - normal * 0.042]
    front, back = len(rim), len(rim) + 1
    faces = []
    for k in range(len(rim)):
        k1 = (k + 1) % len(rim)
        faces.append((front, k1, k))
        faces.append((back, k, k1))
    build('blade', verts, faces, [steel] * len(faces), sharp_angle=60)


def shield(team, steel, leather):
    """A big round shield on his left arm, held forward and tipped up to the camera: a domed
    team-colour face inside a steel rim, with a steel boss. Its back is covered in dark leather,
    so from behind it doesn't outshine the cape."""
    axis = Vector((0.42, -1, 0.3)).normalized()
    profile = [(0, -0.01), (0.272, 0.012), (0.242, 0.036), (0.075, 0.046), (0, 0.088)]
    verts, faces, bands, rings = lathe(profile, 14)
    verts = place(verts, (0.315, -0.205, 0.335), axis, (0, 0, 1))
    mats = [(leather, steel, team, steel)[b] for b in bands]
    build('shield', verts, faces, mats, sharp=ring_edges(rings[2]) + ring_edges(rings[3]))


def main():
    reset()
    team = team_material()
    steel = material('steel', STEEL, roughness=0.35)
    mail = material('mail', MAIL, roughness=0.5)
    beard_mat = material('beard', BEARD, roughness=0.5)
    skin = material('skin', SKIN, roughness=0.45)
    eye = material('eye', EYE, roughness=0.25)
    glint = material('glint', GLINT, roughness=0.3)
    rosy = material('rosy', ROSY, roughness=0.4)
    tunic = material('tunic', TUNIC, roughness=0.5)
    leather = material('leather', LEATHER, roughness=0.45)
    brass = material('brass', BRASS, roughness=0.35)
    wood = material('wood', WOOD, roughness=0.5)

    helmet(steel, brass)
    head(skin, beard_mat)
    face(eye, glint, rosy, beard_mat)
    beard(beard_mat)
    body(tunic, mail, leather, brass)
    arms(mail, leather, skin)
    cloak(team)
    axe(steel, wood)
    shield(team, steel, leather)
    finish('gimli-chibi', budget=800, flat=False)


if __name__ == '__main__':
    main()
