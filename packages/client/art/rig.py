"""Rigs and clips for the game's models (docs/viewer-spec.md section 4, Rigs and clips; README.md).

A rigged model's script does three things as it builds its parts:

- binds each part to a bone, inside `with kit.bone('hand_r'):`, rigidly: every vertex follows that
  one bone with weight 1, so the faceted parts move as solid pieces;
- marks its joints with `joint()` next to the parts they belong to, and what each hand holds with
  `hold()`. Marks are points that lean(), turn() and stoop() carry with the parts, so the bones sit
  where the joints end up, and the rest pose is the model as built;
- ends with `finish(name, rig=Rig(clips=...))`, naming a style from the clip library (clips.py), or
  its own function, for each of the seven clips.

finish() then reads the marks, builds the armature from them (the 16 bones in BONES, and any of the
script's own), binds the mesh, keyframes every clip at 30 frames a second, checks the bones, the
binding and the clips, warns about frames that reach outside the hex or under the ground, and
exports the skin and one glTF animation per clip. Before it makes the clips it keeps each bone's
vertices, so a clip style can measure the parts it moves (`points()`, `lowest()`), such as a sole
it keeps on the ground.

Riders. A rider and its mount are one model on one armature: the mount's script binds its parts to
bones of its own, named mount_..., and returns a `Mount`, which the rider's Rig takes
(`Rig(kind='mounted', mount=...)`). The rider's hips then hang from the mount's seat, its body; its
feet are placed, and its hands' paths in the model's frame drawn, on the seat's frame, so they go
with the mount; and the mount's legs are posed by IK on the ground as the rider's legs are on foot.
mounts.py builds the horse and units/eomer.py, the reference rider, rides it.

Poses. A clip gives, for each frame, a few channels (clips.py lists them); `Rig.solve()` turns them
into a motion for each bone, with two-bone IK for arms and legs that have a target. Turns are in
degrees about the armature's own axes, in the rest pose, relative to the parent bone:

- pitch, about X: positive tips the top forward (towards -Y), as lean() does;
- tilt, about Y: positive tips the top towards the model's left (+X);
- yaw, about Z: positive turns the front towards the model's left (+X), as turn() does.

Coordinates are Blender's: z up, the model faces -Y, its left is +X.
"""

import math
import os
import re

import bpy
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector

FPS = 30  # one frame per tick of the sim

# The bones every rigged model has (docs/viewer-spec.md section 4): each with its parent and the
# joints at its head and its tail. `root` lies on the ground at the origin, pointing forward.
BONES = {
    'root': (None, 'origin', 'front'),
    'hips': ('root', 'pelvis', 'waist'),
    'spine': ('hips', 'waist', 'neck'),
    'head': ('spine', 'neck', 'crown'),
    'upper_arm_l': ('spine', 'shoulder_l', 'elbow_l'),
    'forearm_l': ('upper_arm_l', 'elbow_l', 'wrist_l'),
    'hand_l': ('forearm_l', 'wrist_l', 'fist_l'),
    'upper_arm_r': ('spine', 'shoulder_r', 'elbow_r'),
    'forearm_r': ('upper_arm_r', 'elbow_r', 'wrist_r'),
    'hand_r': ('forearm_r', 'wrist_r', 'fist_r'),
    'thigh_l': ('hips', 'hip_l', 'knee_l'),
    'shin_l': ('thigh_l', 'knee_l', 'ankle_l'),
    'foot_l': ('shin_l', 'ankle_l', 'toe_l'),
    'thigh_r': ('hips', 'hip_r', 'knee_r'),
    'shin_r': ('thigh_r', 'knee_r', 'ankle_r'),
    'foot_r': ('shin_r', 'ankle_r', 'toe_r'),
}
BONE_NAME = re.compile(r'^[a-z][a-z0-9_]*$')
MAX_BONES = {'foot': 24, 'large': 32, 'mounted': 40}  # placeholders

# The clips, in order, with their lengths in seconds and whether they loop (placeholders).
CLIPS = ('idle', 'move', 'attack', 'cast', 'stun', 'death', 'victory')
LENGTHS = {
    'idle': (1.5, 3.0),
    'move': (0.4, 1.0),
    'attack': (0.4, 0.9),
    'cast': (0.3, 0.8),
    'stun': (0.5, 1.5),
    'death': (0.3, 0.5),
    'victory': (0.5, 1.0),  # within the second the viewer and the play page hold a fight's end
}
LOOPS = ('idle', 'move', 'stun')
STRIKE = 3  # the frame an attack's blow lands or its shot leaves: 0.1 s in
CAST_HEIGHT = (3, 6)  # the frames a cast may be at its height in: 0.1 to 0.2 s
MAX_BYTES = {'foot': 200_000, 'large': 300_000, 'mounted': 300_000}  # a rigged model's .glb, by kind (placeholders)
# A rigged gear model (<id>-2, README.md, Gear models) has a triangle budget 12.5% above its 1★ model's, and
# as much more room: 225,000 bytes on foot and 337,500 for a Large or mounted model (placeholders).
GEAR_BYTES = {kind: limit * 9 // 8 for kind, limit in MAX_BYTES.items()}
FLOOR = -1e-4  # how far under the ground a frame may reach before it warns: rounding, no more
# The client shows the poses between frames too (docs/viewer-spec.md section 5), which finish() checks
# in BETWEEN steps from each frame to the next. Between frames a foot or a hoof rolling on the ground
# dips a few millimetres, which the board hides, so there it warns only past BETWEEN_FLOOR.
BETWEEN = 4
BETWEEN_FLOOR = -0.01
DEATH_LOW = 0.8  # a death ends with its top below this share of the standing height

LIMBS = {  # the bones of each limb, from the body out: the two IK turns, then the hand or foot
    'arm_l': ('upper_arm_l', 'forearm_l', 'hand_l'),
    'arm_r': ('upper_arm_r', 'forearm_r', 'hand_r'),
    'leg_l': ('thigh_l', 'shin_l', 'foot_l'),
    'leg_r': ('thigh_r', 'shin_r', 'foot_r'),
}


# A mount's legs, by name, for its own left (+X) and right, as a rider's are (Mount below).
MOUNT_LEGS = ('fore_l', 'fore_r', 'hind_l', 'hind_r')


def V(x, y, z):
    return Vector((x, y, z))


def joint(name: str, point) -> bpy.types.Object:
    """Marks a joint (BONES lists the ones every model needs) at `point`, as the parts round it are
    built: a one-vertex mesh that lean(), turn() and stoop() carry along with the parts, which
    finish() reads and removes. Make it where the parts it moves with are made, so it ends up
    in the same set of parts a pose is given to."""
    data = bpy.data.meshes.new(f'joint-{name}')
    data.from_pydata([tuple(point)], [], [])
    obj = bpy.data.objects.new(f'joint-{name}', data)
    obj['joint'] = name
    bpy.context.scene.collection.objects.link(obj)
    return obj


def hold(hand: str, grip, tip, face) -> None:
    """Says what a hand ('l' or 'r') holds, so clips can aim it: it runs from `grip` to its business
    end at `tip` (an axe's head, a blade's point, a staff's top, a bow's upper end), and faces from
    there towards the point `face` (a blade's edge, a shield's front, where a bow shoots). Mark it
    with the item, so it is posed with it."""
    joint(f'grip_{hand}', grip)
    joint(f'tip_{hand}', tip)
    joint(f'face_{hand}', face)


def turn_of(degrees) -> Quaternion:
    """A turn given as (pitch, tilt, yaw) in degrees about the armature's X, Y and Z, pitch first."""
    p, t, y = degrees
    return Euler((math.radians(p), math.radians(t), math.radians(y)), 'XYZ').to_quaternion()


def basis(a, b) -> Matrix:
    """An orthonormal frame with its first axis along `a` and its second towards `b`."""
    x = Vector(a).normalized()
    y = Vector(b) - Vector(b).dot(x) * x
    if y.length < 1e-9:
        y = x.orthogonal()
    y.normalize()
    return Matrix((x, y, x.cross(y))).transposed()


def aligning(a_from, b_from, a_to, b_to) -> Quaternion:
    """The rotation taking direction `a_from` to `a_to`, with `b_from` turned towards `b_to`."""
    return (basis(a_to, b_to) @ basis(a_from, b_from).transposed()).to_quaternion()


def two_bone(start, target, l1, l2, pole):
    """Two-bone IK: where the middle joint and the end go for bones of lengths l1 and l2 from
    `start` to reach `target`, the middle joint bending towards `pole`. Out of reach, the end
    points at the target as far as it goes."""
    d = target - start
    dist = d.length
    ahead = d / dist if dist > 1e-9 else Vector(pole).orthogonal().normalized()
    dist = min(max(dist, abs(l1 - l2) + 1e-6), (l1 + l2) * (1 - 1e-6))
    cos_a = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)
    sin_a = math.sqrt(max(0.0, 1 - cos_a * cos_a))
    side = Vector(pole) - Vector(pole).dot(ahead) * ahead
    if side.length < 1e-9:
        side = ahead.orthogonal()
    side.normalize()
    middle = start + l1 * (cos_a * ahead + sin_a * side)
    return middle, start + dist * ahead


class Motion:
    """How a bone moves in a pose: a vertex at x in the rest pose goes to `at + turn @ (x - head)`."""

    __slots__ = ('turn', 'at', 'head')

    def __init__(self, turn: Quaternion, at: Vector, head: Vector):
        self.turn, self.at, self.head = turn, at, head

    def __call__(self, x) -> Vector:
        return self.at + self.turn @ (Vector(x) - self.head)


class Mount:
    """What a mount adds to its rider's rig, for Rig(mount=...) (docs/viewer-spec.md section 4): a
    rider and its mount are one model on one armature, the rider's `hips` hanging from the mount's
    `seat` bone, so the rider moves with it.

    `bones` are the mount's own, `{name: (parent, head joint, tail joint)}`, each named mount_...,
    parents before children and the first hanging from `root`. `legs` gives each of MOUNT_LEGS
    that the mount stands on its three bones from the body down, (upper, lower, foot), which clips
    pose by IK on the ground as they pose a rider's legs (clips.py), and `bends` the way each leg's
    middle joint points as it bends: forward for a horse's knee, back for its hock. `raised` names a
    leg the mount holds up as it stands, ready to charge, or None."""

    def __init__(self, bones, legs, bends, seat: str = 'mount_body', raised=None):
        self.bones = {name: tuple(spec) for name, spec in bones.items()}
        self.legs = {leg: tuple(chain) for leg, chain in legs.items()}
        self.bends = {leg: Vector(bend).normalized() for leg, bend in bends.items()}
        self.seat = seat
        self.raised = raised
        for name in self.bones:
            if not name.startswith('mount_'):
                raise ValueError(f'a mount\'s bones are named mount_..., not "{name}"')
        if seat not in self.bones:
            raise ValueError(f'the seat "{seat}" is not one of the mount\'s bones')
        for leg, chain in self.legs.items():
            if leg not in MOUNT_LEGS or len(chain) != 3 or any(b not in self.bones for b in chain):
                raise ValueError(f'leg "{leg}" must be one of {", ".join(MOUNT_LEGS)}, three of the mount\'s bones')
            if leg not in self.bends:
                raise ValueError(f'leg "{leg}" needs the way its middle joint bends')
        if raised is not None and raised not in self.legs:
            raise ValueError(f'the raised leg "{raised}" is not one of the mount\'s legs')


class Clip:
    """A clip: its length in frames (the frame of its last key; a loop's last frame is its first
    again), whether it loops, the frames it marks (`strike` for an attack, `height` for a cast),
    and `pose(frame)`, the channels at a frame (clips.py)."""

    def __init__(self, frames: int, pose, loop: bool = False, marks=None):
        self.frames, self.pose, self.loop, self.marks = frames, pose, loop, dict(marks or {})

    @property
    def seconds(self) -> float:
        return self.frames / FPS


class Rig:
    """A model's skeleton and clips. `clips` gives each of CLIPS a style from clips.py, as
    `(name, {options})` or a name alone, or a function `rig -> Clip` of the script's own. `bones`
    adds the script's own bones, `{name: (parent, head joint, tail joint)}`, such as a cape's.
    `kind` sets the bone budget and the size limit: 'foot', 'large' or 'mounted'. A rider passes
    its `mount` (Mount), whose bones join the rig and whose seat its hips hang from. A 2★ gear model
    finishes with its 1★ model's rig, `geared()`, which raises the size limit to GEAR_BYTES.

    finish() reads the joints, after which the rig's measurements (`joint()`, `held()`, `rest`,
    `height`) are there for the clip styles."""

    def __init__(self, clips, bones=None, kind: str = 'foot', mount=None):
        self.specs = dict(clips)
        self.bones = dict(BONES)
        self.limbs = dict(LIMBS)  # the limbs IK can pose: an arm or leg, or a mount's leg
        self.mount = mount
        self.seat = 'root'  # the bone the hips hang from: the root, or a rider's mount
        self._bends = {}  # the way each of a mount's legs bends, by limb
        self._limb_of = {}  # each bone of a mount's leg, the limb it is in
        if mount is not None:
            for name, spec in mount.bones.items():
                if name in BONES:
                    raise ValueError(f'"{name}" is one of the bones every model has')
                self.bones[name] = spec
            self.seat = mount.seat
            self.bones['hips'] = (mount.seat,) + BONES['hips'][1:]
            for leg, chain in mount.legs.items():
                limb = f'mount_{leg}'
                self.limbs[limb] = chain
                self._bends[limb] = mount.bends[leg]
                for b in chain:
                    self._limb_of[b] = limb
        for name, spec in (bones or {}).items():
            if name in self.bones:
                raise ValueError(f'"{name}" is one of the bones every model has, or its mount\'s')
            self.bones[name] = tuple(spec)
        self.kind = kind
        self.gear = False  # a 2★ gear model's rig (geared()), with GEAR_BYTES as its size limit
        self.joints = {}
        self.height = 0.0
        self.death_top = 0.0  # how tall the model is at the end of its death
        self.radius = 0.0  # the furthest any frame of any clip reaches from the centre
        self.bottom = 0.0  # the lowest any frame of any clip reaches: under the ground if below 0
        self.radius_between = 0.0  # the same between frames, as the client shows them (between())
        self.bottom_between = 0.0
        self.armature = None
        self.clips = {}
        self._points = {}  # each bone's vertices in the rest pose, once build() has the model

    def geared(self) -> 'Rig':
        """This rig, a 1★ model's, for its 2★ gear model, the 1★ model with its gear (README.md, Gear
        models): the same bones and clips, with a gear model's size limit (GEAR_BYTES)."""
        self.gear = True
        return self

    # Joints and measurements ---------------------------------------------------------------

    def read_joints(self) -> None:
        """Reads the joint marks where the model's posing left them, and removes them."""
        scene = bpy.context.scene
        marks = [o for o in scene.objects if o.get('joint')]
        for o in marks:
            name = o['joint']
            if name in self.joints:
                raise RuntimeError(f'joint "{name}" is marked twice')
            self.joints[name] = (o.matrix_world @ o.data.vertices[0].co).copy()
        for o in marks:
            data = o.data
            bpy.data.objects.remove(o)
            bpy.data.meshes.remove(data)
        self.joints['origin'] = V(0, 0, 0)
        self.joints.setdefault('front', V(0, -0.15, 0))
        needed = {j for _, head, tail in self.bones.values() for j in (head, tail)}
        missing = sorted(needed - set(self.joints))
        if missing:
            raise RuntimeError(f'joints not marked: {", ".join(missing)}')

    def joint(self, name: str) -> Vector:
        return self.joints[name].copy()

    def length(self, bone: str) -> float:
        _, head, tail = self.bones[bone]
        return (self.joints[tail] - self.joints[head]).length

    def reach(self, limb: str) -> float:
        """How far an arm or leg reaches, from shoulder to wrist or hip to ankle, straightened."""
        upper, lower, _ = self.limbs[limb]
        return self.length(upper) + self.length(lower)

    def held(self, hand: str):
        """What a hand holds: (grip, tip, axis, face), with `axis` from the grip to the tip and
        `face` square to it; or None if it holds nothing."""
        if f'grip_{hand}' not in self.joints:
            return None
        grip, tip = self.joints[f'grip_{hand}'], self.joints[f'tip_{hand}']
        axis = (tip - grip).normalized()
        face = self.joints[f'face_{hand}'] - tip
        face = (face - face.dot(axis) * axis).normalized()
        return grip.copy(), tip.copy(), axis, face

    def _item(self, hand: str):
        """The axis and face a hand's aim turns: its item's, or the hand's own."""
        held = self.held(hand)
        if held is not None:
            return held[2], held[3]
        upper, lower, end = self.limbs[f'arm_{hand}']
        axis = self.joints[self.bones[end][2]] - self.joints[self.bones[end][1]]
        return axis.normalized(), self._hinge(f'arm_{hand}')

    def _hinge(self, limb: str) -> Vector:
        """The axis a limb's middle joint bends about in the rest pose: for a mount's leg, which may
        stand straight, the way it bends when it bends towards its pole."""
        upper, lower, _ = self.limbs[limb]
        u1 = self.joints[self.bones[upper][2]] - self.joints[self.bones[upper][1]]
        u2 = self.joints[self.bones[lower][2]] - self.joints[self.bones[lower][1]]
        if limb in self._bends:
            ahead = (u1 + u2).normalized()
            side = self._pole(limb)
            return side.cross(ahead).normalized()
        n = u1.cross(u2)
        if n.length < 1e-6:
            raise RuntimeError(f'{limb} is straight in the rest pose: bend its middle joint a little')
        return n.normalized()

    def _pole(self, limb: str) -> Vector:
        """Where a limb's middle joint points in the rest pose, away from the line through its ends:
        for a mount's leg, the way it bends (Mount), square to that line."""
        upper, lower, _ = self.limbs[limb]
        start = self.joints[self.bones[upper][1]]
        middle = self.joints[self.bones[upper][2]]
        end = self.joints[self.bones[lower][2]]
        ahead = (end - start).normalized()
        side = self._bends[limb] if limb in self._bends else (middle - start)
        side = side - side.dot(ahead) * ahead
        return side.normalized()

    @property
    def rest(self) -> dict:
        """Every channel's value in the rest pose (clips.py lists the channels)."""
        r = {'hips_at': V(0, 0, 0)}
        for bone in self.bones:
            if bone != 'root':
                r[bone] = V(0, 0, 0)
        for s in ('l', 'r'):
            r[f'hand_{s}_at'] = self.joint(f'wrist_{s}')
            r[f'hand_{s}_aim'] = Quaternion()
            r[f'hand_{s}_world'] = 0.0
            r[f'elbow_{s}'] = self._pole(f'arm_{s}')
            r[f'foot_{s}_at'] = self.joint(f'ankle_{s}')
            r[f'knee_{s}'] = self._pole(f'leg_{s}')
        if self.mount is not None:
            for bone in self.mount.bones:
                r[f'{bone}_at'] = V(0, 0, 0)
            for limb in self._bends:
                r[f'{limb}_at'] = self.joint(self.bones[self.limbs[limb][2]][1])
                r[f'{limb}_bend'] = self._pole(limb)
        return r

    def aim(self, hand: str, axis, face) -> Quaternion:
        """The turn of `hand` from its rest that points what it holds along `axis`, its edge or
        front towards `face`: a value for the `hand_r_aim` channel."""
        rest_axis, rest_face = self._item(hand)
        return aligning(rest_axis, rest_face, Vector(axis), Vector(face))

    @property
    def trunk(self) -> list:
        """The bones the hips carry with them, and no arm or leg does: the hips, the spine, the head
        and the script's own bones on them, such as a cape. Raising the hips raises these alike."""
        limbs = {b for chain in LIMBS.values() for b in chain}
        out = []
        for name in self.bones:
            bone = name
            while bone not in (None, 'hips') and bone not in limbs:
                bone = self.bones[bone][0]
            if bone == 'hips':
                out.append(name)
        return out

    def points(self, bone: str) -> np.ndarray:
        """The vertices that follow `bone`, where they are in the rest pose: an array of (x, y, z)
        rows, empty if none do."""
        return self._points.get(bone, np.zeros((0, 3)))

    def lowest(self, channels: dict, bones=None) -> float:
        """How high the lowest vertex of the model, or of the parts on `bones`, is in the pose of
        some channels: below 0 where the pose reaches under the ground, and infinite if the bones
        have no parts."""
        motions = self.solve(channels)
        low = math.inf
        for bone in self._points if bones is None else bones:
            points = self.points(bone)
            if len(points):
                motion = motions[bone]
                row = np.array(motion.turn.to_matrix())[2]  # what a turn does to a height
                low = min(low, motion.at.z + float(((points - np.array(motion.head)) @ row).min()))
        return low

    # Posing --------------------------------------------------------------------------------

    def solve(self, channels: dict) -> dict:
        """Each bone's Motion for a pose's channels (clips.py). Channels left out keep the rest
        pose. An arm whose hand has a target (`hand_r_at`), a leg whose foot has one (`foot_r_at`)
        and a mount's leg whose foot has one (`mount_fore_l_at`) are posed by IK; otherwise each of
        their bones turns as given. The script's own bones and the mount's may move as well as
        turn (`mount_body_at`). A rider's frame is its mount's seat, which its hips hang from and
        its feet and its hands' paths drawn in the model's frame (`hand_r_world`) move with."""
        ch = channels
        j = self.joints
        motions = {}

        def fk(bone, parent_motion):
            _, head, _ = self.bones[bone]
            turn = parent_motion.turn @ turn_of(ch.get(bone, (0, 0, 0)))
            at = parent_motion(j[head])
            if bone not in BONES and f'{bone}_at' in ch:  # the script's own bones and a mount's move too
                at = at + parent_motion.turn @ Vector(ch[f'{bone}_at'])
            return Motion(turn, at, j[head])

        origin = j['origin']
        motions['root'] = Motion(turn_of(ch.get('root', (0, 0, 0))), origin.copy(), origin)
        if self.mount is not None:  # the mount first, as the rider's hips hang from it
            self._own(motions, ch, fk, self.mount.bones)
        seat = motions[self.seat]  # the root, unless the model rides
        seated = self.seat != 'root'
        pelvis = j['pelvis']
        hips_at = seat(pelvis) + seat.turn @ Vector(ch.get('hips_at', (0, 0, 0)))
        motions['hips'] = Motion(seat.turn @ turn_of(ch.get('hips', (0, 0, 0))), hips_at, pelvis)
        motions['spine'] = fk('spine', motions['hips'])
        motions['head'] = fk('head', motions['spine'])
        chest = motions['spine']

        for s in ('l', 'r'):
            upper, lower, end = LIMBS[f'arm_{s}']
            if f'hand_{s}_at' in ch:
                world = float(ch.get(f'hand_{s}_world', 0.0))
                target = Vector(ch[f'hand_{s}_at'])
                target = chest(target).lerp(seat(target) if seated else target, world)
                pole = Vector(ch.get(f'elbow_{s}', self._pole(f'arm_{s}')))
                pole = (chest.turn @ pole).lerp(seat.turn @ pole if seated else pole, world)
                self._limb(motions, f'arm_{s}', chest, target, pole)
                aim = Quaternion(ch.get(f'hand_{s}_aim', Quaternion()))
                turn = (chest.turn @ aim).slerp(seat.turn @ aim if seated else aim, world)
                head = j[self.bones[end][1]]
                motions[end] = Motion(turn, motions[lower](head), head)
            else:
                motions[upper] = fk(upper, chest)
                motions[lower] = fk(lower, motions[upper])
                motions[end] = fk(end, motions[lower])

        for s in ('l', 'r'):
            upper, lower, end = LIMBS[f'leg_{s}']
            if f'foot_{s}_at' in ch:
                target = seat(Vector(ch[f'foot_{s}_at']))
                pole = seat.turn @ Vector(ch.get(f'knee_{s}', self._pole(f'leg_{s}')))
                self._limb(motions, f'leg_{s}', motions['hips'], target, pole)
                turn = seat.turn @ turn_of(ch.get(end, (0, 0, 0)))
                head = j[self.bones[end][1]]
                motions[end] = Motion(turn, motions[lower](head), head)
            else:
                motions[upper] = fk(upper, motions['hips'])
                motions[lower] = fk(lower, motions[upper])
                motions[end] = fk(end, motions[lower])

        # The script's own bones turn from their parents, which come before them.
        self._own(motions, ch, fk, self.bones)
        return motions

    def order(self) -> list:
        """The bones, each after the bone it hangs from."""
        out = []

        def visit(name):
            if name not in out:
                parent = self.bones[name][0]
                if parent is not None:
                    visit(parent)
                out.append(name)

        for name in self.bones:
            visit(name)
        return out

    def between(self, a: dict, b: dict, u: float) -> dict:
        """The Motions the client shows a share `u` of the way from one keyed frame's Motions (solve())
        to the next's: three.js turns each bone from its parent the short way round between the two
        (a slerp), and moves the hips, and a bone a clip moves, in a straight line, as a glTF's linear
        keys ask. So a bone that turns far in one frame swings round, carrying all below it, rather
        than taking the path the clip's frames trace (docs/viewer-spec.md section 5)."""
        out = {}
        for name in self.order():
            parent = self.bones[name][0]
            ma, mb = a[name], b[name]
            head = self.joints[self.bones[name][1]]
            if parent is None:
                out[name] = Motion(ma.turn.slerp(mb.turn, u), ma.at.lerp(mb.at, u), head)
                continue
            pa, pb, p = a[parent], b[parent], out[parent]
            la, lb = pa.turn.inverted() @ ma.turn, pb.turn.inverted() @ mb.turn
            if la.dot(lb) < 0:
                lb = -lb
            moved = (pa.turn.inverted() @ (ma.at - pa(head))).lerp(pb.turn.inverted() @ (mb.at - pb(head)), u)
            out[name] = Motion(p.turn @ la.slerp(lb, u), p(head) + p.turn @ moved, head)
        return out

    def _own(self, motions, ch, fk, bones) -> None:
        """Poses bones not posed yet, in order, each from its parent: a mount's leg whose foot has a
        target (`mount_fore_l_at`, where the foot's head goes on the ground's frame) by IK, its knee
        towards `mount_fore_l_bend` and its foot turned by its own channel on the ground's frame, as
        a rider's feet are; every other bone by its own turn."""
        j = self.joints
        for bone in bones:
            if bone in motions:
                continue
            limb = self._limb_of.get(bone)
            if limb is not None and f'{limb}_at' in ch:
                upper, lower, end = self.limbs[limb]
                ground = motions['root']
                target = ground(Vector(ch[f'{limb}_at']))
                pole = ground.turn @ Vector(ch.get(f'{limb}_bend', self._pole(limb)))
                self._limb(motions, limb, motions[self.bones[upper][0]], target, pole)
                head = j[self.bones[end][1]]
                motions[end] = Motion(ground.turn @ turn_of(ch.get(end, (0, 0, 0))), motions[lower](head), head)
            else:
                motions[bone] = fk(bone, motions[self.bones[bone][0]])

    def _limb(self, motions, limb, parent, target, pole):
        """Poses a limb's two upper bones by IK so its end reaches `target`."""
        upper, lower, _ = self.limbs[limb]
        j = self.joints
        a, b, c = j[self.bones[upper][1]], j[self.bones[upper][2]], j[self.bones[lower][2]]
        start = parent(a)
        middle, end = two_bone(start, target, (b - a).length, (c - b).length, pole)
        hinge = self._hinge(limb)
        bent = (middle - start).cross(end - middle)
        bent = bent.normalized() if bent.length > 1e-9 else parent.turn @ hinge
        motions[upper] = Motion(aligning(b - a, hinge, middle - start, bent), start, a)
        motions[lower] = Motion(aligning(c - b, hinge, end - middle, bent), middle, b)

    def _locals(self, motions, moving=()):
        """Blender's pose for some Motions: each bone's rotation, and the location of the hips and
        of the bones in `moving`."""
        bones = self.armature.data.bones
        out = {}
        for name, motion in motions.items():
            parent = self.bones[name][0]
            rest = bones[name].matrix_local.to_quaternion()
            above = motions[parent].turn if parent else Quaternion()
            local = above.inverted() @ motion.turn
            rotation = rest.inverted() @ local @ rest
            location = None
            if name == 'hips' or name in moving:
                expected = motions[parent](self.joints[self.bones[name][1]])
                location = rest.inverted() @ (above.inverted() @ (motion.at - expected))
            out[name] = (rotation, location)
        return out

    # Building ------------------------------------------------------------------------------

    def check_parts(self, parts) -> None:
        """Fails unless every vertex of every part follows exactly one of the rig's bones."""
        for o in parts:
            if o.type != 'MESH':
                raise RuntimeError(f'{o.name}: a rigged model is made of meshes only')
            names = {g.index: g.name for g in o.vertex_groups}
            for name in names.values():
                if name not in self.bones:
                    raise RuntimeError(f'{o.name} is bound to "{name}", which is not a bone of the rig')
            for v in o.data.vertices:
                held = [g for g in v.groups if g.weight > 0]
                if len(held) != 1 or abs(held[0].weight - 1) > 1e-6:
                    raise RuntimeError(f'{o.name}: every vertex must follow one bone with weight 1')

    def build(self, model: bpy.types.Object, height: float) -> None:
        """Builds the armature and binds `model` to it, makes and checks the clips, and warns about
        frames that reach outside the hex."""
        self.height = height
        self._check_bones()
        self.check_parts([model])
        self._measure(model)
        self._make_armature(model)
        for name, spec in self.specs.items():
            self.clips[name] = self._clip(name, spec)
        self._check_clips()
        for name in CLIPS:
            self._keyframe(name, self.clips[name])
        self._check_frames(model)
        marks = ', '.join(
            f'{name} {clip.seconds:.2f} s'
            + ''.join(f' ({mark} at {frame / FPS:.2f} s)' for mark, frame in clip.marks.items())
            + (f' (ends {self.death_top:.2f} tall)' if name == 'death' else '')
            for name, clip in self.clips.items()
        )
        base = round(self.bottom, 4) + 0.0  # + 0.0 so a hair under the ground prints as +0.0000
        base_between = round(self.bottom_between, 4) + 0.0
        print(f'MODEL {model.name}: {len(self.bones)} bones (budget {MAX_BONES[self.kind]}), clips {marks}; '
              f'over every frame, radius {self.radius:.3f} and base {base:+.4f}; between frames, '
              f'radius {self.radius_between:.3f} and base {base_between:+.4f}')

    def _measure(self, model) -> None:
        """Keeps each bone's vertices as the model stands, for points() and lowest()."""
        groups = {g.index: g.name for g in model.vertex_groups}
        points = {}
        for v in model.data.vertices:
            bone = next(groups[g.group] for g in v.groups if g.weight > 0)
            points.setdefault(bone, []).append(v.co[:])
        self._points = {bone: np.array(rows) for bone, rows in points.items()}

    def _check_bones(self) -> None:
        if len(self.bones) > MAX_BONES[self.kind]:
            raise RuntimeError(f'{len(self.bones)} bones, over the budget of {MAX_BONES[self.kind]}')
        for name, (parent, _, _) in self.bones.items():
            if not BONE_NAME.match(name):
                raise RuntimeError(f'bone "{name}" is not in lower case with underscores')
            if name != 'root' and parent not in self.bones:
                raise RuntimeError(f'bone "{name}" hangs from "{parent}", which is not a bone')
        for name in self.bones:
            seen, bone = set(), name
            while bone is not None:
                if bone in seen:
                    raise RuntimeError(f'bone "{name}" is its own ancestor')
                seen.add(bone)
                bone = self.bones[bone][0]

    def _make_armature(self, model) -> None:
        scene = bpy.context.scene
        layer = bpy.context.view_layer
        scene.render.fps = FPS
        scene.render.fps_base = 1.0
        data = bpy.data.armatures.new('rig')
        arm = bpy.data.objects.new('rig', data)
        scene.collection.objects.link(arm)
        for o in scene.objects:
            o.select_set(o is arm)
        layer.objects.active = arm
        bpy.ops.object.mode_set(mode='EDIT')
        edit = {}
        for name, (_, head, tail) in self.bones.items():
            bone = data.edit_bones.new(name)
            bone.head = self.joints[head]
            bone.tail = self.joints[tail]
            if (bone.tail - bone.head).length < 1e-4:
                raise RuntimeError(f'bone "{name}" has no length: its joints coincide')
            bone.roll = 0.0
            bone.use_connect = False
            bone.use_deform = name != 'root'
            edit[name] = bone
        for name, (parent, _, _) in self.bones.items():
            if parent is not None:
                edit[name].parent = edit[parent]
        bpy.ops.object.mode_set(mode='OBJECT')
        arm.animation_data_create()
        model.parent = arm
        model.matrix_parent_inverse = Matrix.Identity(4)
        modifier = model.modifiers.new('rig', 'ARMATURE')
        modifier.object = arm
        modifier.use_vertex_groups = True
        modifier.use_bone_envelopes = False
        self.armature = arm

    def _clip(self, name, spec) -> Clip:
        import clips as library  # noqa: PLC0415, the library imports this module

        if callable(spec):
            return spec(self)
        style, options = (spec, {}) if isinstance(spec, str) else spec
        styles = library.STYLES.get(name, {})
        if style not in styles:
            raise RuntimeError(f'no "{style}" style for {name}; the library has {", ".join(sorted(styles))}')
        return styles[style](self, **options)

    def _check_clips(self) -> None:
        if sorted(self.clips) != sorted(CLIPS):
            raise RuntimeError(f'clips must be exactly {", ".join(CLIPS)}, not {", ".join(sorted(self.clips))}')
        for name, clip in self.clips.items():
            low, high = LENGTHS[name]
            if not low - 1e-9 <= clip.seconds <= high + 1e-9:
                raise RuntimeError(f'{name} lasts {clip.seconds:.2f} s, outside {low} to {high} s')
            if clip.loop != (name in LOOPS):
                raise RuntimeError(f'{name} must {"" if name in LOOPS else "not "}loop')
            if clip.loop:
                first, last = self.solve(clip.pose(0)), self.solve(clip.pose(clip.frames))
                for bone in self.bones:
                    a, b = first[bone], last[bone]
                    if a.turn.rotation_difference(b.turn).angle > 1e-4 or (a.at - b.at).length > 1e-5:
                        raise RuntimeError(f'{name} loops but ends away from where it starts ({bone})')
        if self.clips['attack'].marks.get('strike') != STRIKE:
            raise RuntimeError(f'attack must strike at frame {STRIKE} (0.1 s), and mark it')
        height = self.clips['cast'].marks.get('height')
        if height is None or not CAST_HEIGHT[0] <= height <= CAST_HEIGHT[1]:
            low, high = CAST_HEIGHT
            raise RuntimeError(f'cast must be at its height at frames {low} to {high}, and mark it')

    def _keyframe(self, name: str, clip: Clip) -> None:
        """The clip as an action of its own, keyed on every frame, with a slot for the armature."""
        action = bpy.data.actions.new(name)
        slot = action.slots.new(id_type='OBJECT', name=self.armature.name)
        strip = action.layers.new('clip').strips.new(type='KEYFRAME')
        bag = strip.channelbag(slot, ensure=True)
        frames = range(clip.frames + 1)
        rotations = {b: [] for b in self.bones if b != 'root'}
        locations = []
        poses = [clip.pose(f) for f in frames]
        # The script's own bones and a mount's that the clip moves (`mount_body_at`), besides the hips.
        moving = [b for b in self.bones if b not in BONES and any(f'{b}_at' in ch for ch in poses)]
        moved = {b: [] for b in moving}
        for ch in poses:
            pose = self._locals(self.solve(ch), moving)
            for bone, values in rotations.items():
                q = pose[bone][0]
                if values and values[-1].dot(q) < 0:  # keep each curve continuous
                    q = -q
                values.append(q)
            locations.append(pose['hips'][1])
            for b in moving:
                moved[b].append(pose[b][1])
        # A bone that stays at rest all through the clip gets no curves, so its track is left out.
        still = {b for b, qs in rotations.items() if all(abs(abs(q.w) - 1) < 1e-9 for q in qs)}
        curves = [(f'pose.bones["{b}"].rotation_quaternion', i, [q[i] for q in qs])
                  for b, qs in rotations.items() if b not in still for i in range(4)]
        if any(p.length > 1e-9 for p in locations):
            curves += [('pose.bones["hips"].location', i, [p[i] for p in locations]) for i in range(3)]
        for b in moving:
            if any(p.length > 1e-9 for p in moved[b]):
                curves += [(f'pose.bones["{b}"].location', i, [p[i] for p in moved[b]]) for i in range(3)]
        for path, index, values in curves:
            curve = bag.fcurves.new(path, index=index)
            curve.keyframe_points.add(len(values))
            curve.keyframe_points.foreach_set('co', [c for f, v in zip(frames, values) for c in (f, v)])
            for point in curve.keyframe_points:
                point.interpolation = 'LINEAR'
            curve.update()

    def _play(self, name: str) -> None:
        """Puts a clip on the armature, or none, from the rest pose: a bone the clip has no curves
        for stays at rest, as the exporter and the client leave it."""
        data = self.armature.animation_data
        data.action = None
        for bone in self.armature.pose.bones:
            bone.matrix_basis = Matrix.Identity(4)
        if name is None:
            return
        action = bpy.data.actions[name]
        data.action = action
        data.action_slot = action.slots[0]

    def _check_frames(self, model) -> None:
        """Poses the model in every frame of every clip, as Blender plays the actions back, and
        between them as the client does (between()), and warns when one reaches outside the hex or
        under the ground, or the death doesn't end low. Fails if Blender's pose doesn't match the
        rig's own (a mistake in this kit)."""
        from kit import HEX_RADIUS  # noqa: PLC0415

        scene = bpy.context.scene
        groups = {g.index: g.name for g in model.vertex_groups}
        rest = np.array([v.co[:] for v in model.data.vertices])
        owner = [groups[v.groups[0].group] for v in model.data.vertices]
        parts = {}  # each bone's vertices, by index
        for i, bone in enumerate(owner):
            parts.setdefault(bone, []).append(i)
        self.radius, self.bottom = 0.0, math.inf
        self.radius_between, self.bottom_between = 0.0, math.inf
        for name in CLIPS:
            clip = self.clips[name]
            self._play(name)
            out, under = [], []  # (frame, how far, the bone that does it)
            # Between frames, as the client shows them: BETWEEN steps from each frame to the next.
            motions = [self.solve(clip.pose(f)) for f in range(clip.frames + 1)]
            for f in range(clip.frames):
                for step in range(1, BETWEEN):
                    posed = self.between(motions[f], motions[f + 1], step / BETWEEN)
                    co = np.empty_like(rest)
                    for bone, rows in parts.items():
                        m = posed[bone]
                        co[rows] = (rest[rows] - np.array(m.head)) @ np.array(m.turn.to_matrix()).T + np.array(m.at)
                    radii = np.hypot(co[:, 0], co[:, 1])
                    self.radius_between = max(self.radius_between, float(radii.max()))
                    self.bottom_between = min(self.bottom_between, float(co[:, 2].min()))
                    if radii.max() > HEX_RADIUS:
                        out.append((f + step / BETWEEN, float(radii.max()), owner[int(radii.argmax())]))
                    if co[:, 2].min() < BETWEEN_FLOOR:
                        under.append((f + step / BETWEEN, float(-co[:, 2].min()), owner[int(co[:, 2].argmin())]))
            for f in range(clip.frames + 1):
                scene.frame_set(f)
                graph = bpy.context.evaluated_depsgraph_get()
                posed = model.evaluated_get(graph).to_mesh()
                co = np.empty(len(posed.vertices) * 3)
                posed.vertices.foreach_get('co', co)
                model.evaluated_get(graph).to_mesh_clear()
                co = co.reshape(-1, 3)
                if f in (0, clip.frames // 2):
                    motions = self.solve(clip.pose(f))
                    for i in range(0, len(rest), 37):
                        if (motions[owner[i]](rest[i]) - Vector(co[i])).length > 1e-4:
                            raise RuntimeError(f'{name} frame {f}: Blender poses the model unlike the rig')
                radii = np.hypot(co[:, 0], co[:, 1])
                self.radius = max(self.radius, float(radii.max()))
                self.bottom = min(self.bottom, float(co[:, 2].min()))
                if radii.max() > HEX_RADIUS:
                    out.append((f, float(radii.max()), owner[int(radii.argmax())]))
                if co[:, 2].min() < FLOOR:
                    under.append((f, float(-co[:, 2].min()), owner[int(co[:, 2].argmin())]))
                if name == 'death' and f == clip.frames:
                    self.death_top = float(co[:, 2].max())
                    if self.death_top > DEATH_LOW * self.height:
                        print(f'WARNING {model.name}: death ends {self.death_top:.2f} tall, not low '
                              f'(under {DEATH_LOW * self.height:.2f})')
            if out:
                out.sort()
                far = max(out, key=lambda o: o[1])
                bones = ', '.join(sorted({o[2] for o in out}))
                print(f'WARNING {model.name}: {name} reaches {far[1]:.2f} from the centre, outside its hex '
                      f'({HEX_RADIUS}), in frames {", ".join(f"{o[0]:g}" for o in out)} ({bones})')
            if under:
                under.sort()
                deep = max(under, key=lambda o: o[1])
                bones = ', '.join(sorted({o[2] for o in under}))
                print(f'WARNING {model.name}: {name} goes {deep[1]:.4f} under the ground, in frames '
                      f'{", ".join(f"{o[0]:g}" for o in under)} ({bones})')
        self._play(None)
        scene.frame_set(0)

    def export(self, model: bpy.types.Object, out: str) -> None:
        """Exports the mesh, its skin and one animation per clip, sampled on every frame. The
        armature's extras carry `reach`: the furthest from its centre any frame of any clip takes the
        model, on frames or between them as the client shows them, which the client scales a 2★ or
        3★ model by so its clips stay in the hex (docs/viewer-spec.md section 4, "Star levels")."""
        for o in bpy.context.scene.objects:
            o.select_set(o in (model, self.armature))
        self.armature['reach'] = round(max(self.radius, self.radius_between), 4)
        bpy.ops.export_scene.gltf(
            filepath=out,
            export_format='GLB',
            use_selection=True,
            export_yup=True,
            export_apply=True,
            export_texcoords=False,
            export_normals=True,
            export_materials='EXPORT',
            export_vertex_color='NONE',
            export_cameras=False,
            export_lights=False,
            export_extras=True,
            export_morph=False,
            export_skins=True,
            export_influence_nb=4,
            export_all_influences=False,
            export_def_bones=False,
            export_leaf_bone=False,
            export_rest_position_armature=True,
            export_armature_object_remove=False,
            export_hierarchy_flatten_bones=False,
            export_animations=True,
            export_animation_mode='ACTIONS',
            export_anim_single_armature=True,
            export_merge_animation='ACTION',
            export_force_sampling=True,
            export_frame_step=1,
            export_frame_range=False,
            export_anim_slide_to_zero=False,
            export_negative_frame='SLIDE',
            export_bake_animation=False,
            export_reset_pose_bones=True,
            export_optimize_animation_size=True,
            export_optimize_animation_keep_anim_armature=False,
            export_optimize_animation_keep_anim_object=False,
        )
        size = os.path.getsize(out)
        limit = (GEAR_BYTES if self.gear else MAX_BYTES)[self.kind]
        print(f'MODEL {model.name}: {size / 1000:.1f} KB (limit {limit / 1000:g} KB)')
        if size >= limit:
            raise RuntimeError(f'{model.name}.glb is {size} bytes, over the limit of {limit}')
