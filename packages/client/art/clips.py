"""The clip library: the seven clips a rigged model plays (docs/viewer-spec.md section 4, Rigs and
clips), keyframed in Python from the rig's proportions (rig.py, README.md).

A script picks a style for each clip in its Rig, with options, or gives a function of its own:

    Rig(clips={'idle': 'ready', 'attack': ('chop', {'hand': 'r'}), 'cast': my_cast, ...})

A style is a function `(rig, **options) -> Clip`, registered with `@style(clip, name)`, so a new one
joins the library by being written here. Its pose at a frame is a dict of channels, all optional,
which Rig.solve() reads; what isn't given stays as in the rest pose (`rig.rest` has every one):

- `hips_at`: where the hips move to, as an offset from where they stand (the root's frame);
- a bone's name (`hips`, `spine`, `head`, `cape`, ...): its turn from its parent, (pitch, tilt,
  yaw) in degrees (rig.py says which way each goes);
- `hand_r_at`: where the right wrist reaches, a point in the rest pose's coordinates that moves
  with the chest (the spine), so the arm is posed by IK; `elbow_r` is the way the elbow points;
  `hand_r_aim` is how the hand, and what it holds, turns from its rest on the chest: a quaternion,
  most easily `rig.aim('r', axis, face)`, which points the held thing from its grip to its tip
  along `axis`, its edge or front towards `face` (rig.held()). `hand_r_world` (0 to 1) moves all
  three from the chest's frame to the model's own, for a weapon's path drawn where it goes
  whatever the body does, or a hand that drops its weapon on the ground;
- `foot_r_at`: where the right ankle goes, on the ground's frame, so the leg is posed by IK, with
  `knee_r` where the knee points and `foot_r` the foot's turn on the ground;
- and the same for the left (`_l`). An arm or leg without a target turns bone by bone instead.

Timing (rig.py checks it): a style keys an attack's blow, or its shot, on frame 3 (BLOW), which it
marks as `strike`, and a cast's `height` on a frame of its own, 3 to 6, and timed() then fits both to
the unit's timing in the sim, so a melee blow lands on frame 7 and a cast is at its height at the end
of its ability's wind-up, frames 11 to 18 (Timing below); the frames in the styles' docstrings are
their own keys. A death lasts at most half a second and ends low; idle, move and stun loop, ending where they start. Motion is eased so it reads
as weight, not machinery: a wind-up before a blow, a blow that gathers speed into the hit, a
rebound and a slow settle after it, a head and cape that follow a frame or two behind.

The ground (rig.py warns about any frame under it): a foot placed on it rises by `sole_lift()`, which
measures the foot's own parts as it rolls, and a keyed clip that brings the body or the feet down
to it is `grounded()`, which stops them on it instead of passing through.

Between frames (rig.py warns about those too): the client shows the poses between frames, turning
each bone the short way round from one to the next (Rig.between()), so a bone that turns far in a
frame swings what hangs from it round in an arc, which can reach out of the hex where neither frame
does. fit(between=True), or tweened() for a script that doesn't fit its clips, keeps what the hands
hold, and a mount's feet, in the hex and out of the ground between frames as well (kept_between()).

An attack's or a cast's room reaches further ahead than the hex (rig.crowding(), docs/viewer-spec.md
section 4, Size), and the fitting tools keep what the hands hold in that room there: in the hex to the
sides and behind, and up to kit.AHEAD_REACH straight ahead (rig.measured(), ROOM).
"""

import math
import re

import numpy as np
from mathutils import Quaternion, Vector

from rig import ACTIONS, BETWEEN, CLIPS, FPS, LIMBS, STRIKE, Clip, V, aligning, measured, turn_of

BLOW = 3  # the frame a style keys its blow or shot on, 0.1 s in; timed() moves a melee blow to STRIKE

STYLES = {name: {} for name in CLIPS}


def style(clip: str, name: str):
    """Registers a style for a clip under a name a script can pick."""

    def register(fn):
        STYLES[clip][name] = fn
        return fn

    return register


# Easing and keys -------------------------------------------------------------------------------

EASES = {
    'linear': lambda u: u,
    'smooth': lambda u: u * u * (3 - 2 * u),  # starts and stops gently
    'in': lambda u: u * u,  # gathers speed into the key: a blow
    'in3': lambda u: u * u * u,
    'out': lambda u: 1 - (1 - u) ** 2,  # slows into the key: a settle
    'out3': lambda u: 1 - (1 - u) ** 3,
}

# Channels that are directions, and turn rather than slide between keys.
DIRECTION = re.compile(r'^(elbow|knee)_[lr]$')


def mix(name, a, b, u):
    """A channel's value a share `u` of the way from `a` to `b`: turns the short way round."""
    if isinstance(a, (int, float)):
        return a + (b - a) * u
    if isinstance(a, Quaternion):
        b = Quaternion(b)
        return a.slerp(-b if a.dot(b) < 0 else b, u)
    a, b = Vector(a), Vector(b)
    if DIRECTION.search(name):
        a, b = a.normalized(), b.normalized()
        if a.angle(b) < 1e-6:
            return a
        return a.slerp(b, u, a.lerp(b, u).normalized())
    return a.lerp(b, u)


class Keys:
    """A one-shot clip's channels from key poses. `key(frame, ease, **channels)` sets channels at a
    frame, each moving into it from its key before with `ease` (EASES). Before its first key a
    channel holds that key's value, and after its last key the last one. `lag` delays channels by
    some frames, so they follow behind (a head, a cape)."""

    def __init__(self, lag=None):
        self.channels = {}
        self.lag = dict(lag or {})

    def key(self, frame, ease='smooth', **channels):
        for name, value in channels.items():
            keys = [k for k in self.channels.get(name, []) if k[0] != frame]  # a later key replaces
            keys.append((frame, value, ease))
            keys.sort(key=lambda k: k[0])
            self.channels[name] = keys
        return self

    def value(self, name, frame):
        keys = self.channels[name]
        f = frame - self.lag.get(name, 0)
        if f <= keys[0][0]:
            return keys[0][1]
        for (f0, v0, _), (f1, v1, ease) in zip(keys, keys[1:]):
            if f <= f1:
                return mix(name, v0, v1, EASES[ease]((f - f0) / (f1 - f0)))
        return keys[-1][1]

    def __call__(self, frame):
        return {name: self.value(name, frame) for name in self.channels}


def wave(frame, frames, cycles=1, phase=0.0):
    """A sine that loops over a clip: `cycles` whole cycles in `frames`, `phase` in cycles."""
    return math.sin(math.tau * (cycles * frame / frames + phase))


def turned(direction, degrees):
    """A direction turned by (pitch, tilt, yaw) degrees (rig.py)."""
    return turn_of(degrees) @ Vector(direction)


def arc(theta, yaw=0.0, tilt=0.0):
    """Aim and face for a blade swung over the top: `theta` degrees from upright towards the front
    (0 upright, 90 level ahead, 135 down in front, negative behind), the edge leading, the swing
    turned by `yaw` and tipped by `tilt` degrees."""
    t = math.radians(theta)
    aim = V(0, -math.sin(t), math.cos(t))
    face = V(0, -math.cos(t), -math.sin(t))
    return turned(aim, (0, tilt, yaw)), turned(face, (0, tilt, yaw))


def sweep_dir(phi, rise=0.0):
    """Aim and face for a blade swept round level: `phi` degrees round from the model's left (+X)
    towards the back (+Y), so 180 is its right and 270 straight ahead; the edge leads the way phi
    grows, which is a sweep from the right across the front to the left. `rise` tips it up."""
    p, r = math.radians(phi), math.radians(rise)
    aim = V(math.cos(p) * math.cos(r), math.sin(p) * math.cos(r), math.sin(r))
    face = V(-math.sin(p), math.cos(p), 0)
    return aim, face


def leading(aims):
    """For a weapon swung through `aims` (directions at successive keys), the way its edge faces at
    each: where its tip is heading, square to the blade."""
    faces = []
    for i, aim in enumerate(aims):
        ahead = Vector(aims[min(i + 1, len(aims) - 1)]) - Vector(aims[max(i - 1, 0)])
        aim = Vector(aim).normalized()
        faces.append((ahead - ahead.dot(aim) * aim).normalized())
    return faces


class Body:
    """Places and turns relative to a rig, for the hand that holds the weapon (`hand`) and the other
    (`off`), written once for either: `side` is +1 for the left (+X) and -1 for the right, and x
    runs outwards from the middle on the side of the hand named."""

    def __init__(self, rig, hand='r'):
        self.rig = rig
        self.hand = hand
        self.off = 'l' if hand == 'r' else 'r'
        self.side = 1 if hand == 'l' else -1
        self.rest = rig.rest
        self.leg = min(rig.reach('leg_l'), rig.reach('leg_r'))

    def sign(self, hand=None):
        return self.side if (hand or self.hand) == self.hand else -self.side

    def out(self, x, y, z, hand=None):
        """A direction, x outwards on `hand`'s side."""
        return V(self.sign(hand) * x, y, z)

    def yaw(self, degrees):
        """A yaw turning the front towards the weapon's side."""
        return self.side * degrees

    def near(self, x, y, z, hand=None):
        """A point by `hand`'s shoulder, in units of its arm's reach, x outwards."""
        hand = hand or self.hand
        return self.rig.joint(f'shoulder_{hand}') + self.rig.reach(f'arm_{hand}') * self.out(x, y, z, hand)

    def wrist(self, hand=None, x=0.0, y=0.0, z=0.0):
        """`hand`'s wrist where it rests, moved by (x outwards, y, z) in units of its arm's reach."""
        hand = hand or self.hand
        return self.rest[f'hand_{hand}_at'] + self.rig.reach(f'arm_{hand}') * self.out(x, y, z, hand)

    def aim(self, axis, face, hand=None):
        """`hand`'s turn pointing what it holds along `axis`, its edge or front towards `face`,
        both with x outwards on its side."""
        hand = hand or self.hand
        return self.rig.aim(hand, self.out(*axis, hand), self.out(*face, hand))

    @staticmethod
    def tip(degrees):
        """A hand's turn tipping what it holds forward (back when negative) about the wrist."""
        return turn_of((degrees, 0, 0))

    def arm(self, hand, at, aim=None, elbow=None, world=None):
        """Channels for an arm reaching by IK."""
        ch = {f'hand_{hand}_at': at}
        if aim is not None:
            ch[f'hand_{hand}_aim'] = aim
        if elbow is not None:
            ch[f'elbow_{hand}'] = self.out(*elbow, hand)
        if world is not None:
            ch[f'hand_{hand}_world'] = world
        return ch

    def held(self, hand=None):
        """An arm at rest, by IK, with every channel set: for a clip's first and last keys."""
        hand = hand or self.hand
        return {k: self.rest[k] for k in (f'hand_{hand}_at', f'hand_{hand}_aim', f'elbow_{hand}', f'hand_{hand}_world')}

    def planted(self, **channels):
        """Channels with both feet where they stand, so the knees take up what the hips do."""
        out = {f'foot_{s}_at': self.rest[f'foot_{s}_at'] for s in ('l', 'r')}
        out.update(channels)
        return out

    def still(self):
        """The rest pose with every channel a one-shot clip moves set: its first and last key."""
        ch = self.planted(**self.held(self.hand), **self.held(self.off))
        ch['hips_at'] = V(0, 0, 0)
        for bone in self.rig.bones:  # every turn, the script's own bones' too
            if bone != 'root':
                ch[bone] = V(0, 0, 0)
        for s in ('l', 'r'):
            ch[f'knee_{s}'] = self.rest[f'knee_{s}']
        return ch


def frames_for(seconds):
    return round(seconds * FPS)


TOUCH = 1e-6  # how far under the ground counts as on it: a sole at rest computes a hair either side


def sole_lift(rig, s, pitch):
    """How far foot `s` must rise, pitched by `pitch` degrees about its ankle (toes down when
    positive), so its lowest point is on the ground and nothing of it under: measured on the parts
    that follow the foot, every corner of the sole included, or for a foot with none, such as one
    under a robe, on a heel and a toe reckoned from its joints."""
    ankle = rig.joint(f'ankle_{s}')
    pitched = turn_of((pitch, 0, 0))
    points = rig.points(f'foot_{s}')
    if len(points):
        row = np.array(pitched.to_matrix())[2]  # what the pitch does to a height
        return max(0.0, -ankle.z - float(((points - np.array(ankle)) @ row).min()))
    toe = rig.joint(f'toe_{s}')
    ahead = V(toe.x - ankle.x, toe.y - ankle.y, 0)
    heel = V(ankle.x, ankle.y, 0) - 0.55 * ahead
    tip = V(toe.x, toe.y, 0) + 0.15 * ahead
    return max(0.0, max(-(ankle + pitched @ (p - ankle)).z for p in (heel, tip)))


def grounded(rig, pose):
    """A clip's pose function kept out of the ground: in each frame, a foot placed by IK that would
    reach under it rises just enough to rest on it, and so do the hips, carrying the body, when a part
    of the body would (rig.trunk). For keyed clips, whose keys say where the body comes to rest but not
    how it passes the ground on the way: a kneel whose hem touches down stops there."""

    def lifted(frame):
        ch = pose(frame)
        for s in ('l', 'r'):
            if f'foot_{s}_at' in ch:
                low = rig.lowest(ch, [f'foot_{s}'])
                if low < -TOUCH:
                    ch[f'foot_{s}_at'] = Vector(ch[f'foot_{s}_at']) + V(0, 0, -low)
        low = rig.lowest(ch, rig.trunk)
        if low < -TOUCH:
            ch['hips_at'] = Vector(ch.get('hips_at', (0, 0, 0))) + V(0, 0, -low)
        return ch

    return lifted


# idle ------------------------------------------------------------------------------------------


@style('idle', 'ready')
def ready(rig, hand='r', seconds=2.4, breath=1.0, sway=1.0, crouch=0.04):
    """Standing ready, weapon up: two breaths and one slow shift of weight a loop, the feet planted,
    the head looking round a little. `crouch` bends the knees, a share of the leg."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg

    def pose(f):
        inhale = breath * wave(f, n, 2)  # in on the rise
        shift = sway * wave(f, n, 1)  # weight to the left on the rise
        ch = b.planted()
        ch['hips_at'] = V(0.045 * leg * shift, 0, -crouch * leg + 0.008 * leg * inhale)
        ch['hips'] = V(0, -1.6 * shift, 1.5 * sway * wave(f, n, 1, 0.12))
        ch['spine'] = V(-1.6 * inhale, 2.0 * shift, -1.0 * sway * wave(f, n, 1, 0.12))
        ch['head'] = V(1.3 * inhale, -0.6 * shift, 3.0 * wave(f, n, 1, 0.3))
        if 'cape' in rig.bones:
            ch['cape'] = V(1.2 * breath * wave(f, n, 2, -0.1), -1.0 * shift, 0)
        for s in (hand, b.off):
            weapon = s == hand
            rise = (0.03 if weapon else 0.02) * inhale
            ch.update(b.arm(s, b.wrist(s, 0, 0, rise)))
            if weapon:  # the weapon rocks a little in the hand
                ch[f'hand_{s}_aim'] = b.tip(2.5 * breath * wave(f, n, 2, 0.15))
        return ch

    return Clip(n, pose, loop=True)


# move ------------------------------------------------------------------------------------------


@style('move', 'run')
def run(rig, hand='r', seconds=0.5, heavy=0.5, stride=0.34, lift=0.3, lean=12.0, carry='high', off='pump'):
    """A run: two strides a cycle, each foot down for a little under half of it, so the body is in
    the air between strides. A quarter of the way through it is in the air with the legs apart, the
    left about to land and the right just pushed off: the stride a dash holds (viewer-spec section 5).
    `heavy` (0 to 1) deepens the bob and the crouch and keeps the feet down longer; `stride` and
    `lift` are shares of the leg; `lean` is how far the body leans into it, in degrees. `carry` is
    how the weapon hand runs: 'high' holds the weapon up, ready, 'pump' swings it like the other arm,
    'steady' keeps it where it rests on the chest, as a drawn bow is carried; `off` is how the other
    hand runs, the same ways: 'high' for a horn or a shield held up."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    ground = 0.40 + 0.06 * heavy  # share of a cycle each foot is down
    lands = {'r': 1 - ground / 2, 'l': 0.5 - ground / 2}  # so the flights centre on a quarter and three

    def foot(s, phase):
        """Ankle offset (forward is -y) and the foot's pitch, `phase` after the foot lands."""
        u = phase % 1.0
        reach = stride * leg / 2
        if u < ground:  # planted, rolling from the heel to the toes as it passes under the body
            k = u / ground
            y = -reach + 2 * reach * k
            pitch = -10 * (1 - k / 0.25) if k < 0.25 else 28 * max(0.0, (k - 0.6) / 0.4) ** 1.5
            return V(0, y, sole_lift(rig, s, pitch)), pitch
        k = (u - ground) / (1 - ground)  # swinging through, the toes up, landing on the heel
        y = reach - 2 * reach * k * k * (3 - 2 * k)
        pitch = 28 * (1 - k) ** 2 - 22 * math.sin(math.pi * k) - 10 * k ** 4
        z = lift * leg * math.sin(math.pi * k) + sole_lift(rig, s, pitch)
        return V(0, y, z), pitch

    def pose(f):
        phi = f / n
        low = math.cos(math.tau * 2 * phi)  # 1 with a foot under the body, -1 in the air
        swing = math.cos(math.tau * (phi - lands['r']))  # 1 with the right foot reaching ahead
        rock = math.cos(math.tau * phi)  # 1 with the weight on the right foot
        ch = {}
        for s in ('l', 'r'):
            offset, pitch = foot(s, phi - lands[s])
            ch[f'foot_{s}_at'] = b.rest[f'foot_{s}_at'] + offset
            ch[f'foot_{s}'] = V(pitch, 0, 0)
        crouch = (0.06 + 0.06 * heavy) * leg
        ch['hips_at'] = V(-0.04 * leg * heavy * rock, 0, -crouch - (0.04 + 0.07 * heavy) * leg * low)
        ch['hips'] = V(2.0 * heavy * low, 3.0 + 3.0 * heavy * rock, 7.0 * swing)
        ch['spine'] = V(lean + 3.5 * heavy * low, -(2.0 + 3.0 * heavy) * rock, -11.0 * swing)
        ch['head'] = V(-0.7 * lean - 4.0 * heavy * low, (1.0 + 2.0 * heavy) * rock, 4.0 * swing)
        if 'cape' in rig.bones:
            ch['cape'] = V(16 + 6 * math.cos(math.tau * 2 * (phi - 0.15)), -4.0 * rock, 4.0 * swing)
        for s in ('l', 'r'):
            pump = swing if s == 'l' else -swing  # each arm swings with the other side's leg
            if (carry if s == hand else off) == 'high':
                ch.update(b.arm(s, b.wrist(s, 0.05, -0.1 + 0.08 * pump, 0.16 - 0.05 * low), b.tip(-6 + 8 * pump)))
            elif (carry if s == hand else off) == 'steady':
                ch.update(b.arm(s, b.wrist(s)))
            else:
                ch.update(b.arm(s, b.wrist(s, 0.04, -0.24 * pump, 0.06 + 0.08 * abs(pump) - 0.03 * low),
                                b.tip(14 * pump)))
        return ch

    return Clip(n, pose, loop=True)


# attack ----------------------------------------------------------------------------------------


@style('attack', 'chop')
def chop(rig, hand='r', seconds=0.6, low=1.0, steep=0.0, out=0.0, wide=0.0, clear=0.0, lift=36.0,
         elbow=0.0, early=0.0, slow=0):
    """An overhand chop with an axe or a heavy blade, its path drawn where it goes: drawn back over
    the shoulder, brought over the top and down in front with the body behind it, landing on
    frame 3, a small rebound, a hold, and a slow, heavy recovery. `low` (0 to 1) is how far down
    in front the blow ends. For a long blade, `steep` turns it that many degrees further down as it
    lands, so it cleaves down rather than reaching level, and `out` that many towards its own side,
    so it shows past the body from behind. `wide` draws it back and brings it over further out on
    its own side, a share of the arm's reach, so the fist clears a big head of hair.

    `clear` and `lift` are for a long-hafted blade held up beside a big head thrust out over the
    blow (Gothmog's cleaver): `clear` brings it over the top and lifts it back afterwards that share
    of the arm's reach further out on its own side, past the head and its ears; `lift` is how far
    from upright the blade points as it is lifted back (degrees, as arc() takes them), so with more
    it still points down as the fist comes back, and the butt of the haft passes outside the chest
    rather than through it.

    `elbow`, `early` and `slow` keep a long blade in the hex between frames, as the client shows
    them (Blows kept in the hex between frames, below): `elbow` (0 to 1) brings the elbow that share
    of the way to pointing forward and down on frame 2, leading the blade, so the arm turns less in
    the one frame the blow comes down in (leading_elbow()); `early` turns the blade that many degrees
    further down on frame 2, so it has less to turn on the way to the blow; and `slow` lifts it back
    that many frames later, so the recovery is eased over more frames."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())

    def blow(theta, at, elbow, yaw=0.0):
        aim, face = arc(theta, b.yaw(yaw))
        return b.arm(hand, at, b.rig.aim(hand, aim, face), elbow, world=1.0)

    # Drawn back: the weapon over the shoulder, the body turned to its side, leaning back.
    k.key(0, **blow(-35, b.near(0.0 + wide, 0.12, 0.72), (0.8, 0.2, -0.4), yaw=-8),
          hips_at=V(0, 0.01, -0.03 * leg), hips=V(-2, 0, b.yaw(5)), spine=V(-8, 0, b.yaw(14)),
          head=V(5, 0, b.yaw(-8)), cape=V(-4, 0, 0))
    k.key(0, **b.arm(off, b.wrist(off, 0.0, -0.1, 0.04)))
    # Over the top, gathering speed.
    k.key(1, 'in', **blow(25, b.near(-0.05 + wide, -0.25, 0.85), (0.8, 0.3, -0.2), yaw=-4),
          hips=V(0, 0, b.yaw(2)), spine=V(-2, 0, b.yaw(4)))
    k.key(2, 'in', **blow(72 + steep / 2 + early, b.near(-0.15 + clear, -0.55, 0.5), leading_elbow(elbow),
                          yaw=out / 2),
          hips=V(2, 0, b.yaw(-3)), spine=V(8, 0, b.yaw(-6)), hips_at=V(0, -0.01, -0.06 * leg))
    # The blow: the weapon down in front, the body over it, the other arm thrown back.
    k.key(BLOW, 'in', **blow(100 + 8 * low + steep, b.near(-0.25, -0.95, -0.3 * low), (0.6, 0.5, -0.5), yaw=6 + out),
          hips=V(4, 0, b.yaw(-6)), spine=V(16, 0, b.yaw(-12)), hips_at=V(0, -0.02, -0.09 * leg),
          head=V(-9, 0, b.yaw(6)), cape=V(10, 0, 0))
    k.key(BLOW, 'in', **b.arm(off, b.wrist(off, 0.06, 0.14, -0.04)))
    # A rebound off what it hit, a hold, then the weight comes back up: the weapon lifted first,
    # edge still leading, and only then turned back in the hand.
    k.key(BLOW + 2, 'out', **blow(96 + 6 * low + steep, b.near(-0.25, -0.86, -0.22 * low), (0.6, 0.5, -0.5),
                                    yaw=6 + out),
          spine=V(14, 0, b.yaw(-11)), hips_at=V(0, -0.02, -0.08 * leg))
    k.key(BLOW + 5, 'smooth', **blow(95 + 6 * low + steep, b.near(-0.24, -0.84, -0.2 * low), (0.6, 0.5, -0.5),
                                       yaw=6 + out),
          spine=V(13, 0, b.yaw(-10)), hips_at=V(0, -0.02, -0.075 * leg), head=V(-6, 0, b.yaw(4)))
    k.key(BLOW + 9 + slow, 'smooth', **blow(lift, b.near(-0.05 + clear, -0.4, 0.15), (0.7, 0.4, -0.5)),
          spine=V(6, 0, b.yaw(-4)), hips_at=V(0, -0.01, -0.04 * leg))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'strike': BLOW})


@style('attack', 'swing')
def swing(rig, hand='r', seconds=0.55, wide=0.0, ahead=0.0):
    """A forehand slash with a blade, high on its own side across and down to the other, its edge
    leading, landing on frame 3, then a follow-through and a recovery. `wide` draws it back further
    out on its own side, a share of the arm's reach, so the fist clears a big head of hair; `ahead`
    carries the follow-through that share further ahead, so the fist clears a round belly."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    # (frame, ease, wrist by the shoulder, the blade's direction, spine yaw towards the weapon)
    path = [
        (0, 'smooth', (0.15 + wide, 0.15, 0.55), (0.35, 0.45, 0.82), 18),
        (1, 'in', (0.3 + wide, -0.35, 0.5), (0.65, -0.35, 0.67), 10),
        (2, 'in', (0.15, -0.8, 0.2), (0.35, -0.93, 0.1), 0),
        (BLOW, 'in', (-0.25, -0.85, -0.1), (-0.45, -0.82, -0.35), -14),
        (BLOW + 3, 'out', (-0.45, -0.6 - ahead, -0.25), (-0.8, -0.35, -0.48), -20),
        (BLOW + 6, 'smooth', (-0.4, -0.62 - ahead, -0.2), (-0.75, -0.42, -0.5), -18),
    ]
    faces = leading([b.out(*aim) for _, _, _, aim, _ in path])
    for (f, ease, at, aim, yaw), face in zip(path, faces):
        k.key(f, ease, **b.arm(hand, b.near(*at), b.rig.aim(hand, b.out(*aim), face), (0.7, 0.4, -0.5), world=1.0),
              spine=V(4 if f >= BLOW else -4, 0, b.yaw(yaw)), hips=V(0, 0, b.yaw(yaw / 2)))
    k.key(BLOW, 'in', hips_at=V(0, -0.02, -0.07 * leg), head=V(-4, 0, b.yaw(8)),
          **b.arm(off, b.wrist(off, 0.08, 0.12, -0.02)))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'strike': BLOW})


@style('attack', 'thrust')
def thrust(rig, hand='r', seconds=0.55, guard=False, out=0.0, wide=0.0, rise=0.0):
    """A thrust with a spear or a blade: drawn back by the hip, driven straight ahead with a lunge
    on frame 3, held, and drawn back. With `guard` the other hand keeps its shield still before the
    body as the blade goes past it; `out` turns the thrust that many degrees towards the weapon's
    own side, so it shows past the body from behind. `wide` draws it back that share of the arm's
    reach further out by the hip, so the fist clears a body that `out` would turn it into. `rise`
    points it that many degrees up from level, as a long spear is thrust up over a shield: level, a
    spear held by its middle reaches out of the hex at both ends."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    axis = V(0, -1, 0.04)
    if rise:  # pointed up
        axis = turned(axis, (-rise, 0, 0))
    ahead = b.rig.aim(hand, axis, b.out(1, 0, 0))
    near = b.near
    if out:  # the blade and the reach for it turned out about the shoulder
        ahead = b.rig.aim(hand, turned(axis, (0, 0, b.yaw(out))), b.out(1, 0, 0))
        shoulder, reach = rig.joint(f'shoulder_{hand}'), rig.reach(f'arm_{hand}')

        def near(x, y, z):
            return shoulder + reach * turned(b.out(x, y, z), (0, 0, b.yaw(out)))

    k.key(0, **b.arm(hand, near(0.1 + wide, 0.35, -0.45), ahead, (0.6, 0.6, -0.4), world=1.0),
          spine=V(-2, 0, b.yaw(16)), hips=V(0, 0, b.yaw(8)), hips_at=V(0, 0.02, -0.04 * leg))
    k.key(BLOW, 'in', **b.arm(hand, near(-0.05, -0.95, -0.15), ahead, (0.6, 0.5, -0.5), world=1.0),
          spine=V(8, 0, b.yaw(-18)), hips=V(2, 0, b.yaw(-8)), hips_at=V(0, -0.08 * leg, -0.08 * leg),
          head=V(-6, 0, b.yaw(10)), cape=V(8, 0, 0), **({} if guard else b.arm(off, b.wrist(off, 0.1, 0.15, -0.02))))
    k.key(BLOW + 4, 'out', **b.arm(hand, near(-0.05, -0.88, -0.17), ahead, (0.6, 0.5, -0.5), world=1.0),
          spine=V(7, 0, b.yaw(-15)), hips_at=V(0, -0.07 * leg, -0.07 * leg))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'strike': BLOW})


@style('attack', 'shot')
def shot(rig, bow='l', seconds=0.6, drawn=False, **drawn_options):
    """A bow shot: the bow held out at the full draw, the arrow loosed on frame 3 as the drawing
    hand flies back past the ear, a held follow-through, then the bow lowered. `bow` is the hand
    holding it, which hold() describes from its grip to its upper end, facing where it shoots.

    With `drawn`, for a model that stands at full draw, the shot is drawn_shot()'s: loosed from the
    draw it stands at, the arrow gone to its quiver, and a fresh one drawn from it and nocked;
    `drawn_options` go to drawn_shot()."""
    if drawn:
        return drawn_shot(rig, bow, seconds, BLOW, **drawn_options)
    if drawn_options:
        raise TypeError(f'shot takes {", ".join(drawn_options)} only with drawn=True')
    draw = 'r' if bow == 'l' else 'l'
    b = Body(rig, bow)
    n = frames_for(seconds)
    leg = b.leg
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    upright = b.rig.aim(bow, b.out(0.12, 0.0, 1), V(0, -1, 0))
    k.key(0, **b.arm(bow, b.near(-0.1, -0.95, 0.12), upright, (0.9, 0.1, -0.3), world=1.0),
          **b.arm(draw, b.near(-0.55, -0.45, 0.42, draw), None, (0.9, 0.2, 0.1), world=1.0),
          spine=V(0, 0, b.yaw(-25)), hips=V(0, 0, b.yaw(-12)), head=V(-2, 0, b.yaw(22)), hips_at=V(0, 0, -0.04 * leg))
    k.key(2, **b.arm(draw, b.near(-0.5, -0.4, 0.42, draw)))
    k.key(BLOW, 'in', **b.arm(draw, b.near(-0.2, -0.1, 0.48, draw)), **b.arm(bow, b.near(-0.1, -1.0, 0.1), upright),
          head=V(-3, 0, b.yaw(22)))
    k.key(BLOW + 5, 'out', **b.arm(draw, b.near(-0.15, -0.05, 0.42, draw)), **b.arm(bow, b.near(-0.1, -0.97, 0.08)))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{bow}_world': 1.0, f'hand_{draw}_world': 1.0})
    return Clip(n, k, marks={'strike': BLOW})


@style('attack', 'throw')
def throw(rig, hand='r', seconds=0.55):
    """An overhand throw: the hand cocked back behind the head, whipped over the shoulder and
    letting go on frame 3, arm out ahead, then a follow-through down and a recovery."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    path = [
        (0, 'smooth', (0.15, 0.4, 0.55), (0.1, 0.7, 0.7), -8, 24),
        (2, 'in', (0.12, -0.05, 0.75), (0.05, -0.2, 0.98), 0, 8),
        (BLOW, 'in', (0.0, -0.9, 0.35), (0.0, -0.9, 0.42), 12, -15),
        (BLOW + 3, 'out', (-0.2, -0.75, -0.25), (-0.1, -0.7, -0.7), 16, -20),
    ]
    faces = leading([b.out(*aim) for _, _, _, aim, _, _ in path])
    for (f, ease, at, aim, pitch, yaw), face in zip(path, faces):
        k.key(f, ease, **b.arm(hand, b.near(*at), b.rig.aim(hand, b.out(*aim), face), (0.8, 0.3, -0.4), world=1.0),
              spine=V(pitch, 0, b.yaw(yaw)), hips=V(0, 0, b.yaw(yaw / 2)))
    k.key(0, **b.arm(off, b.wrist(off, 0.1, -0.2, 0.1)))
    k.key(BLOW, 'in', hips_at=V(0, -0.05 * leg, -0.06 * leg), head=V(-6, 0, b.yaw(10)),
          **b.arm(off, b.wrist(off, 0.1, 0.15, -0.05)))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'strike': BLOW})


# cast ------------------------------------------------------------------------------------------


@style('cast', 'staff')
def staff(rig, hand='r', seconds=0.7, height=5):
    """A staff raised high over the head, at its height on frame `height`, held there a moment
    with the body drawn up tall, then brought down."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    k.key(0, **{f'hand_{hand}_world': 1.0})
    k.key(2, **b.arm(hand, b.wrist(hand, 0.0, 0.0, -0.06), b.tip(6)), hips_at=V(0, 0, -0.06 * leg),
          spine=V(5, 0, 0))
    up = b.rig.aim(hand, V(0, -0.12, 1), b.out(1, 0, 0))
    k.key(height, 'out', **b.arm(hand, b.near(-0.05, -0.25, 0.95), up, (0.9, 0.2, -0.2)), hips_at=V(0, 0, 0.02 * leg),
          spine=V(-7, 0, 0), head=V(-12, 0, 0), cape=V(6, 0, 0))
    k.key(n - 7, **b.arm(hand, b.near(-0.05, -0.24, 0.92), up), spine=V(-6, 0, 0), head=V(-10, 0, 0))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'height': height})


@style('cast', 'sweep')
def sweep(rig, hand='r', seconds=0.8, height=4, guard=True):
    """A wide, level sweep of the weapon round the front, from far round on its own side to the
    other, straight ahead on frame `height`; then, with `guard`, the weapon brought back across the
    front and held up at its side while the shield on the other arm comes up in front, both held
    braced before they come back."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())

    def level(phi, at, elbow, rise=0.0):
        # phi: degrees round from straight ahead, towards the weapon's side when negative.
        aim, face = sweep_dir(270 - b.side * phi, rise)
        if b.side > 0:  # from the left it runs the other way round, its edge leading
            face = -face
        return b.arm(hand, at, b.rig.aim(hand, aim, face), elbow, world=1.0)

    ring = b.rig.joint(f'shoulder_{hand}').z - 0.1 * b.rig.reach(f'arm_{hand}')  # the sweep's height

    def round_(phi, radius):
        # a point `radius` from the middle, `phi` degrees round from straight ahead as above
        p = math.radians(270 - b.side * phi)
        return V(radius * math.cos(p), radius * math.sin(p), ring)

    # Wound up: turned away, the weapon out level far round on its own side.
    k.key(0, **level(-110, round_(-92, 0.27), (0.2, 0.6, -0.8), 24), hips_at=V(0, 0, -0.06 * leg),
          hips=V(0, 0, b.yaw(18)), spine=V(4, 0, b.yaw(30)), head=V(4, 0, b.yaw(-20)), cape=V(4, 0, b.yaw(-6)))
    # Across the front, at its height on frame `height`, and on round.
    k.key(height - 2, 'in', **level(-55, round_(-50, 0.26), (0.4, 0.5, -0.7), 14), spine=V(6, 0, b.yaw(14)),
          hips=V(0, 0, b.yaw(8)))
    k.key(height, 'linear', **level(0, round_(-12, 0.26), (0.6, 0.4, -0.6), 6), spine=V(8, 0, b.yaw(-10)),
          hips=V(0, 0, b.yaw(-6)), hips_at=V(0, -0.01, -0.08 * leg), head=V(-4, 0, 0), cape=V(6, 0, b.yaw(6)))
    k.key(height + 2, 'out', **level(50, round_(30, 0.26), (0.7, 0.2, -0.5), 4), spine=V(8, 0, b.yaw(-28)),
          hips=V(0, 0, b.yaw(-15)))
    k.key(height + 4, 'out', **level(80, round_(55, 0.25), (0.7, 0.2, -0.4), 2), spine=V(6, 0, b.yaw(-34)),
          hips=V(0, 0, b.yaw(-17)))
    if guard:
        # The weapon brought back across the front and up, then held up at its side as it rests,
        # while the shield comes up in front and both are held, braced.
        k.key(height + 7, **b.arm(hand, b.wrist(hand, -0.15, -0.15, 0.15), b.tip(28), (0.8, 0.3, -0.4), world=1.0),
              spine=V(7, 0, b.yaw(-14)), hips=V(0, 0, b.yaw(-8)))
        shield = b.aim((0.15, 0.05, 1), (-0.3, -1, 0.1), off)
        brace = b.arm(off, b.near(-0.25, -0.85, -0.05, off), shield, (0.8, 0.1, -0.6))
        brace.update(b.arm(hand, b.wrist(hand, 0.0, 0.05, 0.6), Quaternion(), (0.8, 0.3, -0.4), world=1.0))
        k.key(height + 10, **brace, spine=V(8, 0, b.yaw(-4)), hips=V(0, 0, b.yaw(-2)), hips_at=V(0, 0, -0.1 * leg),
              head=V(-6, 0, 0), cape=V(2, 0, 0))
        k.key(n - 6, **{f'hand_{off}_at': b.near(-0.25, -0.83, -0.08, off)}, spine=V(7, 0, b.yaw(-3)),
              hips_at=V(0, 0, -0.095 * leg))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'height': height})


# The Hobbits' casts (units/frodo.py, sam.py and merry.py): ducking out of sight, bracing behind what
# the other hand holds up as a shield, and a lunging stab.


@style('cast', 'duck')
def duck(rig, hand='r', seconds=0.7, height=4, away=1.0):
    """Slipping out of sight: a glance aside, then down and away to the other hand's side, small and
    curled over the weapon laid across the belly, the free hand drawing the hood up over the head
    and the cape swung round behind, lowest on frame `height`; held a moment, then up again. `away`
    is how far aside and how far round. It is grounded()."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    aside = b.out(1, 0, 0, off)  # towards the free hand's side
    # Frame 0, seen at full weight: up on the toes, a glance aside.
    k.key(0, hips_at=V(0, 0.01 * leg, 0.02 * leg), spine=V(-4, 0, b.yaw(-6)), head=V(-2, 0, b.yaw(-24)),
          **b.arm(hand, b.wrist(hand, -0.05, 0.05, 0.05), b.tip(-10)), **b.arm(off, b.wrist(off, 0.05, 0.0, 0.08)))
    # Down and away, turned from the enemy and leaning to the free side (a tilt, which b.yaw() signs
    # as it signs a yaw), the cape swinging out the other way.
    hood = b.arm(off, b.near(-0.15, 0.2, 0.85, off), None, (0.9, -0.2, 0.3))
    tuck = b.arm(hand, b.wrist(hand, -0.15, 0.1, 0.1), b.aim((-1, -0.25, 0.05), (0, -0.3, 1)), (0.8, 0.4, -0.2))
    k.key(height, 'out', **hood, **tuck, hips_at=0.14 * leg * away * aside + V(0, 0.08 * leg, -0.34 * leg),
          hips=V(8, 0, b.yaw(-28 * away)), spine=V(30, b.yaw(-8), b.yaw(-18 * away)), head=V(16, 0, b.yaw(-8)),
          cape=V(28, b.yaw(14), b.yaw(20 * away)))
    k.key(height + 7, 'smooth', hips_at=0.15 * leg * away * aside + V(0, 0.08 * leg, -0.36 * leg),
          spine=V(32, b.yaw(-8), b.yaw(-18 * away)), cape=V(20, b.yaw(10), b.yaw(14 * away)))
    k.key(n, **b.still())
    return Clip(n, grounded(rig, k), marks={'height': height})


@style('cast', 'brace')
def brace(rig, hand='r', seconds=0.8, height=4):
    """Bracing to cover another: what the other hand holds as a shield (hold() describes it from the
    grip up, facing the enemy) drawn in, then thrust up before the face with the body set low behind
    it and the weapon cocked up beside it, at its height on frame `height`; a shove into it, held
    braced, and lowered."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    up = b.aim((0.0, 0.05, 1), (-0.1, -1, 0.1), off)
    # Frame 0, seen at full weight: gathering, the shield drawn in to the chest, turned to it.
    k.key(0, **b.arm(off, b.wrist(off, -0.12, 0.08, 0.02)), **b.arm(hand, b.wrist(hand, 0.05, 0.1, -0.05)),
          spine=V(-3, 0, b.yaw(12)), hips=V(0, 0, b.yaw(6)), hips_at=V(0, 0.01 * leg, -0.02 * leg))
    k.key(height, 'out', **b.arm(off, b.near(-0.6, -0.85, 0.05, off), up, (0.8, 0.1, -0.6)),
          **b.arm(hand, b.wrist(hand, 0.05, 0.1, 0.35), b.tip(-15), (0.8, 0.3, -0.3)),
          spine=V(10, 0, b.yaw(-16)), hips=V(4, 0, b.yaw(-8)), hips_at=V(0, -0.04 * leg, -0.13 * leg),
          head=V(-6, 0, b.yaw(6)), cape=V(6, 0, 0))
    k.key(height + 4, 'smooth', **{f'hand_{off}_at': b.near(-0.6, -0.92, 0.02, off)},
          hips_at=V(0, -0.05 * leg, -0.14 * leg), spine=V(12, 0, b.yaw(-16)))
    k.key(n - 7, **{f'hand_{off}_at': b.near(-0.6, -0.88, 0.0, off)}, hips_at=V(0, -0.04 * leg, -0.13 * leg),
          spine=V(10, 0, b.yaw(-14)))
    k.key(n, **b.still())
    return Clip(n, k, marks={'height': height})


@style('cast', 'lunge')
def lunge(rig, hand='r', seconds=0.7, height=4, reach=1.0, rise=0.0, wide=0.0):
    """A lunging stab, its path drawn where it goes: the blade drawn back low by the hip and the body
    coiled over the back foot, then driven ahead with the whole body behind it and the other arm
    flung back, furthest on frame `height`; a twist of the blade, held, and drawn out. `reach` is how
    far the hand goes, a share of the arm's, and `rise` how many degrees the blade points up from
    level (down when negative): less of one and more of the other keep a long blade in the hex.
    `wide` draws it back that share of the arm's reach further out by the hip, so the fist and the
    hilt clear a round belly as the body coils. Frame 2, as the body drives forward out of its coil, is
    `off`: where a unit whose ability dashes sets off (timed())."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    up = math.radians(rise)
    axis = V(0, -math.cos(up), math.sin(up))
    ahead = b.rig.aim(hand, axis, b.out(1, 0, 0))  # the edge outwards
    twist = b.rig.aim(hand, axis, V(0, math.sin(up), math.cos(up)))  # the edge turned up
    k.key(0, **b.arm(hand, b.near(0.12 + wide, 0.3, -0.5), ahead, (0.6, 0.6, -0.4), world=1.0),
          **b.arm(off, b.wrist(off, 0.0, -0.12, 0.08)), spine=V(-4, 0, b.yaw(20)), hips=V(0, 0, b.yaw(10)),
          hips_at=V(0, 0.05 * leg, -0.08 * leg), head=V(4, 0, b.yaw(-14)))
    k.key(2, 'in', **b.arm(hand, b.near(0.02 + wide / 2, -0.4, -0.38), ahead, (0.6, 0.5, -0.5), world=1.0),
          spine=V(6, 0, b.yaw(4)), hips=V(2, 0, b.yaw(2)), hips_at=V(0, -0.06 * leg, -0.12 * leg))
    k.key(height, 'in', **b.arm(hand, b.near(-0.08, -1.15 * reach, -0.32), ahead, (0.6, 0.5, -0.5), world=1.0),
          **b.arm(off, b.wrist(off, 0.2, 0.35, 0.05)), spine=V(20, 0, b.yaw(-20)), hips=V(6, 0, b.yaw(-10)),
          hips_at=V(0, -0.22 * leg * reach, -0.17 * leg), head=V(-12, 0, b.yaw(12)), cape=V(14, 0, 0))
    k.key(height + 3, 'out', **b.arm(hand, b.near(-0.08, -1.1 * reach, -0.33), twist, (0.6, 0.5, -0.5), world=1.0),
          hips_at=V(0, -0.21 * leg * reach, -0.17 * leg))
    k.key(n - 7, **b.arm(hand, b.near(0.0, -0.6, -0.3), twist, (0.6, 0.5, -0.5), world=1.0),
          spine=V(8, 0, b.yaw(-6)), hips_at=V(0, -0.08 * leg, -0.08 * leg))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'height': height, 'off': 2})


# stun ------------------------------------------------------------------------------------------


@style('stun', 'dazed')
def dazed(rig, hand='r', seconds=1.2, droop=1.0, low=0.0, off_low=0.0, off_back=0.08, off_ahead=0.0):
    """Dazed: knees gone soft, the body swaying in a slow loop, the head lolling behind it, the
    weapon drooping towards the ground and the other hand hanging. `low` (0 to 1) drops a weapon
    held up high as the model stands that share of the way to hang by its hip, pointing down;
    `off_low` does the same for what the other hand holds up high, a horn or a torch, which hangs
    from it by its hip. `off_back` is how far back the other hand hangs as it swings, a share of the
    arm's reach: less, or 0, for a hand that rests before the chest, as a drawing hand on the string
    under the jaw does (Lurtz's), so it sags in front of the chest rather than into it. `off_ahead`
    is for a drawing hand at the cheek, whose arrow stays in its fingers: it comes down that share of
    the arm's reach out before the chest, the arrow turned down past the bow (let_down())."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off

    def pose(f):
        sway = wave(f, n, 1)
        bob = wave(f, n, 1, 0.25)
        ch = b.planted()
        ch['hips_at'] = V(0.05 * leg * sway, 0.03 * leg * bob, -0.11 * leg + 0.02 * leg * wave(f, n, 2))
        ch['hips'] = V(2 + 2 * bob, -3 * sway, 3 * bob)
        ch['spine'] = V(10 + 3 * wave(f, n, 2, 0.2), 4 * wave(f, n, 1, 0.1), 4 * bob)
        ch['head'] = V(14 + 7 * wave(f, n, 1, 0.1), 10 * wave(f, n, 1, 0.35), 6 * wave(f, n, 1, 0.2))
        if 'cape' in rig.bones:
            ch['cape'] = V(-2 + 2 * wave(f, n, 1, -0.1), -3 * sway, 0)
        # The weapon hangs forward from a loose wrist, its edge turned in.
        hang = turned(V(0.1, -0.9, -0.2 * droop - low), (0, 0, 4 * sway))
        at = b.wrist(hand, 0.05, 0.08, -0.2 * droop)
        if low:  # from held high to hanging by the hip
            at = at.lerp(b.near(0.12, -0.12, -0.85), low)
        ch.update(b.arm(hand, at + V(0, 0, 0.01 * wave(f, n, 1, 0.3)), b.aim(hang, (-1, 0, -0.15))))
        swing = wave(f, n, 1, -0.15)  # the hanging arm swings behind the body
        at, aim, elbow = b.wrist(off, 0.04, off_back + 0.08 * swing, -0.3 * droop), b.tip(14 * droop + 6 * swing), None
        if off_ahead:  # a drawing hand let down before the chest, its arrow pointing down past the bow
            at, aim, elbow = let_down(rig, b, off, off_ahead, droop, swing)
        if off_low:  # from held high to hanging by the hip, what it holds hanging down from it
            at = at.lerp(b.near(0.1, 0.03 + 0.06 * swing, -0.85, off), off_low)
            aim = aim.slerp(b.aim(turned(V(0.15, -0.3, -1), (8 * swing, 0, 0)), (0, -1, 0), off), off_low)
            elbow = (0.35, 0.9, 0.0)
        ch.update(b.arm(off, at, aim, elbow))
        return ch

    return Clip(n, pose, loop=True)


# death -----------------------------------------------------------------------------------------


@style('death', 'knees')
def knees(rig, hand='r', seconds=0.5, slump=1.0, lay=0.3, dropped=False, behind=0.15, back=0.0,
          fall=(0.1, -0.1, -0.15)):
    """Struck, then down on both knees, the toes tucked under, and slumping forward over them, the
    weapon dropped on the ground in front and the other hand hanging: ends low, inside the hex. It is
    grounded(), so a skirt or hem that reaches the ground as the body slumps rests on it. `lay` is
    how high the dropped weapon's hand comes to rest, a share of the leg: higher keeps a broad
    guard out of the ground on short legs. With `dropped` the other hand lets what it holds fall out
    and down by its knee too, a horn or a banner, rather than resting it upright as a shield. `behind`
    is how far behind the pelvis the feet are tucked, a share of the leg: less, or below 0, keeps them
    under a robe that goes forward with the body (robed()), where they would poke out behind it. `back`
    settles the hips that share of the leg further back as the knees go, so a tall body that slumps
    deep, a Large one, keeps its head inside the hex. `fall` is where the weapon hand goes as the
    knees give, (out, back, up) from where it rests in shares of the arm's reach: further back and
    lower keeps a long bow, whose top falls forward as it goes down, in the hex between frames."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 1})
    k.key(0, **b.still())
    # Struck: thrown back a little, arms out.
    k.key(2, 'out', spine=V(-12, 0, b.yaw(4)), head=V(-14, 0, 0), hips_at=V(0, 0.01, -0.02 * leg),
          **b.arm(hand, b.wrist(hand, 0.1, 0.05, 0.05)), **b.arm(off, b.wrist(off, 0.1, 0.05, 0.04)))
    # The knees go: the hips drop over them, the feet tucked behind on their toes.
    thigh = rig.length('thigh_r')
    knee_z = 0.3 * leg
    drop = rig.joint('hip_r').z - (knee_z + thigh)
    pelvis = rig.joint('pelvis')
    down = {}
    for s in ('l', 'r'):
        down[f'foot_{s}_at'] = V(1.15 * rig.joint(f'hip_{s}').x, pelvis.y + behind * leg,
                                 knee_z + 0.3 * leg + sole_lift(rig, s, 40) - 0.1 * leg)
        down[f'foot_{s}'] = V(40, 0, 0)
        down[f'knee_{s}'] = V(0, -1, -0.6)
    k.key(7, 'in', **down, hips_at=V(0, (back - 0.18) * leg, -drop), hips=V(-6, 0, 0), spine=V(2, 0, 0),
          head=V(6, 0, 0), cape=V(-6, 0, 0), **b.arm(hand, b.wrist(hand, *fall)),
          **b.arm(off, b.wrist(off, 0.08, 0, -0.15)))
    # Slumped forward, the weapon on the ground in front, the other hand down by the knee.
    k.key(n, 'out', hips_at=V(0, (back - 0.1) * leg, -drop - 0.05 * leg), hips=V(10 * slump, 0, 0),
          spine=V(36 * slump, 0, b.yaw(4)), head=V(26 * slump, b.side * 6, 0), cape=V(-12, 0, 0))
    ground = b.rig.joint(f'wrist_{hand}')
    laid = b.aim((-0.7, -0.7, 0), (0.7, -0.7, 0))
    k.key(n, 'out', **b.arm(hand, V(ground.x * 0.75, pelvis.y - 0.9 * leg, lay * leg), laid, (0.5, 0.6, 0.3),
                            world=1.0))
    shield = b.rig.joint(f'wrist_{off}')
    if dropped:
        k.key(n, 'out', **b.arm(off, V(shield.x * 0.85, pelvis.y - 0.3 * leg, 0.45 * leg),
                                b.aim((0.75, -0.35, -0.55), (0, 0, 1), off), (0.6, 0.6, 0.2), world=1.0))
    else:
        k.key(n, 'out', **b.arm(off, V(shield.x * 0.8, pelvis.y - 0.5 * leg, 0.95 * leg),
                                b.aim((0.3, 0.1, 0.95), (0.5, -0.85, 0.1), off), (0.6, 0.6, 0.2), world=1.0))
    return Clip(n, grounded(rig, k))


# victory ---------------------------------------------------------------------------------------


@style('victory', 'raise')
def raise_(rig, hand='r', seconds=0.8, out=0.08, lean=0.0):
    """The weapon thrust up high: a small dip to gather, up past the top, and settling into a proud
    hold, chest out and looking up, which the last frame keeps. `out` is how far out from the
    shoulder the fist goes up, a share of the arm's reach: more for a big head of hair. `lean` tips
    the weapon that many degrees out to its own side as it is held up, so a long-hafted one holds its
    head up beside the body rather than far above it."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    k.key(0, **{f'hand_{hand}_world': 1.0})
    k.key(3, hips_at=V(0, 0, -0.08 * leg), spine=V(6, 0, 0), head=V(4, 0, 0),
          **b.arm(hand, b.wrist(hand, 0.02, 0.02, -0.08), b.tip(-6)))

    def up(theta, height):
        aim, _ = arc(theta, 0.0, b.yaw(lean)) if lean else arc(theta)
        return b.arm(hand, b.near(out, -0.05, height), b.rig.aim(hand, aim, b.out(1, 0, 0)), (0.9, 0.2, -0.3))

    k.key(10, 'out', **up(-10, 0.98), hips_at=V(0, 0, 0.015 * leg), spine=V(-8, 0, b.yaw(3)), head=V(-12, 0, 0),
          cape=V(8, 0, 0), **b.arm(off, b.wrist(off, 0.14, 0.04, 0.08)))
    k.key(16, **up(2, 0.94), hips_at=V(0, 0, -0.01 * leg), spine=V(-6, 0, b.yaw(2)), head=V(-9, 0, 0), cape=V(2, 0, 0))
    k.key(n, **up(0, 0.95), hips_at=V(0, 0, -0.008 * leg), spine=V(-6, 0, b.yaw(2)), head=V(-9, 0, 0), cape=V(0, 0, 0),
          **b.arm(off, b.wrist(off, 0.12, 0.04, 0.06)))
    return Clip(n, k)



# mounted ---------------------------------------------------------------------------------------
#
# A rider and its mount are one model on one armature (rig.Mount): the rider's hips hang from the
# mount's body, and a path its hands draw in the model's frame (`hand_r_world`) goes with the
# mount's body. These styles move both: the mount on its legs, whose feet IK places on the ground as
# it places a rider's, and the rider on it, its weapon in `hand` and the reins, if it holds them,
# in the other. The rider sits: its hips stay in the saddle and its legs hang as built, so they have
# no tracks. A clip that doesn't move the mount's body leaves its standing legs unposed, so they
# have none either, and only a raised leg is held up.


class Steed:
    """Places and turns for a rider's mount (rig.Mount), written once for a horse or a warg: where
    each of its legs stands, channels for its legs, body, neck, head and tail, and how it stands."""

    def __init__(self, rig):
        if rig.mount is None:
            raise RuntimeError('a mounted style needs a Rig with a mount')
        self.rig = rig
        self.rest = rig.rest
        self.legs = dict(rig.mount.legs)  # each leg's bones: upper, lower, foot
        self.raised = rig.mount.raised
        self.centre = rig.joint(rig.bones['mount_body'][1])  # what the body turns about
        self.top = {leg: rig.joint(rig.bones[chain[0]][1]) for leg, chain in self.legs.items()}
        self.fetlock = {leg: rig.joint(rig.bones[chain[2]][1]) for leg, chain in self.legs.items()}
        self.reach = {leg: rig.reach(f'mount_{leg}') for leg in self.legs}
        self.height = min(t.z for t in self.top.values())  # how tall it stands, to the tops of its legs
        self.fore = [leg for leg in self.legs if leg.startswith('fore')]
        self.hind = [leg for leg in self.legs if leg.startswith('hind')]
        self.parts = [b for b in ('mount_neck', 'mount_head', 'mount_tail', 'mount_jaw') if b in rig.bones]

    def lift(self, leg, pitch):
        """How far a foot pitched by `pitch` degrees about its head (its fetlock; the toe back when
        positive) must move up from where it stands to rest on the ground: down when negative."""
        head = self.fetlock[leg]
        points = self.rig.points(self.legs[leg][2])
        row = np.array(turn_of((pitch, 0, 0)).to_matrix())[2]
        return -head.z - float(((points - np.array(head)) @ row).min())

    def foot(self, leg, at=(0, 0, 0), pitch=0.0, bend=None):
        """Channels for `leg` reaching by IK, its foot's head moved by `at` from where it stands, on
        the ground's frame, and the foot pitched by `pitch` degrees; `bend` turns the way the middle
        joint points by a (pitch, tilt, yaw) of its own."""
        limb = f'mount_{leg}'
        way = self.rest[f'{limb}_bend']
        return {f'{limb}_at': self.fetlock[leg] + Vector(at), self.legs[leg][2]: V(pitch, 0, 0),
                f'{limb}_bend': turned(way, bend) if bend else way}

    def planted(self, leg, dy=0.0, pitch=0.0, dx=0.0):
        """`leg` with its foot on the ground, `dy` behind where it stands (ahead when negative), and
        pitched by `pitch` degrees, resting on the ground."""
        return self.foot(leg, V(dx, dy, self.lift(leg, pitch)), pitch)

    def held_up(self, leg, k=1.0):
        """`leg` lifted as the mount stands ready to charge, a share `k` of the way: the knee
        forward, the foot tucked back under it."""
        r = self.reach[leg]
        return self.foot(leg, V(0, -0.33 * r * k, 0.4 * r * k), 75 * k)

    def folded(self, leg, top, low=0.06):
        """`leg` folded under the body as it lies down, its top now at `top`: the middle joint down
        by the ground the way the leg bends, and the lower leg folded back along the ground under
        it, the foot laid along the ground too (a forefoot that folds back under a knee turned up
        behind it, any other forward)."""
        upper, lower, _ = self.legs[leg]
        l1, l2 = self.rig.length(upper), self.rig.length(lower)
        way = self.rest[f'mount_{leg}_bend']
        way = V(way.x, way.y, 0).normalized()
        rise = low * self.height
        d = math.sqrt(max(0.0, l1 * l1 - (top.z - rise) ** 2))
        end = V(top.x, top.y, rise) + way * (d - l2)
        pitch = 110 if leg in self.fore and way.y < 0 else -80
        return self.foot(leg, end - self.fetlock[leg] + V(0, 0, 0.02), pitch)

    def body(self, pitch=0.0, tilt=0.0, yaw=0.0, at=(0, 0, 0), about=None):
        """Channels turning the body by (pitch, tilt, yaw) degrees about the point `about`, its middle
        by default, and then moving it by `at`."""
        turn = turn_of((pitch, tilt, yaw))
        pivot = self.centre if about is None else Vector(about)
        offset = pivot + turn @ (self.centre - pivot) - self.centre + Vector(at)
        return {'mount_body': V(pitch, tilt, yaw), 'mount_body_at': offset}

    def stance(self, legs=True, raised=1.0):
        """Channels for the mount standing as built, its raised leg held up a share `raised` of the
        way; with `legs` its other feet are placed where they stand, for a clip that moves its body."""
        ch = self.body()
        for leg in self.legs:
            if leg == self.raised:
                ch.update(self.held_up(leg, raised))
            elif legs:
                ch.update(self.planted(leg))
        for bone in self.parts:
            ch[bone] = V(0, 0, 0)
        return ch


def seated(b, m, legs=True, **channels):
    """The rider at rest on its mount, which stands, with every channel a mounted one-shot clip
    moves set: its first and last key. `legs` places the mount's feet, for a clip that moves its
    body; without it its standing legs are left as built."""
    ch = {bone: V(0, 0, 0) for bone in b.rig.bones if bone != 'root'}
    ch['hips_at'] = V(0, 0, 0)
    ch.update(b.held(b.hand))
    ch.update(b.held(b.off))
    ch.update(m.stance(legs))
    ch.update(channels)
    return ch


@style('idle', 'saddle')
def saddle(rig, hand='r', seconds=2.0, breath=1.0, sway=1.0):
    """A rider sitting its mount, which stands: two breaths a loop and a slow shift of the mount's
    weight from side to side, its head nodding and turning a little and its tail swishing, a raised
    foreleg held up, ready to charge; the rider breathing and looking round, the weapon rocking in
    its hand and the rein hand giving to the mount's head."""
    b = Body(rig, hand)
    m = Steed(rig)
    n = frames_for(seconds)
    h = m.height

    def pose(f):
        inhale = breath * wave(f, n, 2)
        shift = sway * wave(f, n, 1)  # its weight to its left on the rise
        nod = wave(f, n, 1, 0.3)
        ch = m.stance()
        ch.update(m.body(0.5 * nod, 1.0 * shift, 0.6 * sway * wave(f, n, 1, 0.15),
                         at=V(0.01 * h * shift, 0, 0.004 * h * (inhale + 1))))
        if m.raised:  # the lifted foot stirs
            ch.update(m.held_up(m.raised, 1 + 0.05 * wave(f, n, 1, 0.6)))
        ch['mount_neck'] = V(2.5 * nod - 1.0 * inhale, 0, 2.0 * sway * wave(f, n, 1, 0.1))
        ch['mount_head'] = V(1.5 * wave(f, n, 2, 0.4), 0, 4.0 * wave(f, n, 1, 0.45))
        if 'mount_tail' in rig.bones:
            ch['mount_tail'] = V(2.0 * inhale, 6.0 * wave(f, n, 2, 0.2), 0)
        # The rider sits tall, breathing, and turns to look round.
        ch['hips'] = V(-0.5 * nod, -0.8 * shift, 0)
        ch['spine'] = V(-1.4 * inhale, 1.0 * shift, -1.2 * sway * wave(f, n, 1, 0.12))
        ch['head'] = V(1.2 * inhale, -0.5 * shift, 3.0 * wave(f, n, 1, 0.3))
        if 'cape' in rig.bones:
            ch['cape'] = V(1.2 * breath * wave(f, n, 2, -0.1), -1.0 * shift, 0)
        ch.update(b.arm(hand, b.wrist(hand, 0, 0, 0.03 * inhale), b.tip(2.5 * breath * wave(f, n, 2, 0.15))))
        ch.update(b.arm(b.off, b.wrist(b.off, 0, -0.04 * nod, 0.02 * inhale - 0.02 * nod)))
        return ch

    return Clip(n, pose, loop=True)


@style('move', 'gallop')
def gallop(rig, hand='r', seconds=16 / 30, stride=0.55, fold=1.0, bob=1.0, bound=0.0, lean=10.0, carry=8.0,
            tail=16.0):
    """A gallop, a stride a cycle (one hex step): the hind feet strike, then the fore, each foot down
    for under a third of the stride, and a quarter of the way through the mount is in the air, at
    full stretch, its forefeet reaching and its hind feet just pushed off: the leap a dash holds.
    The body rocks over the legs, the neck nods and the tail streams; the rider sits it, leaning
    into it, the weapon carried tipped forward by `carry` degrees and the rein hand giving to the
    head. `stride` is how far each foot travels while down, a share of the leg; `fold` how high the
    feet fold up behind, `bob` how far the body rises and falls, and `tail` how many degrees the tail
    streams up behind. `bound` (0 to 1) brings each pair of feet down closer together, the body lower
    and rocking more: a bounding lope, as a wolf runs."""
    b = Body(rig, hand)
    m = Steed(rig)
    n = frames_for(seconds)
    h = m.height
    duty = 0.3  # the share of a stride each foot is down
    lead = 0.08 * (1 - 0.6 * bound)  # how long after its pair's first foot the second lands
    lands = {'hind_l': 0.75, 'hind_r': 0.75 + lead, 'fore_l': 0.37, 'fore_r': 0.37 + lead}

    def leg_at(leg, u):
        """The foot's head (from where it stands) and pitch, `u` of a stride after it lands."""
        u %= 1.0
        reach = stride * m.reach[leg] / 2
        fore = leg.startswith('fore')
        if u < duty:  # down, the body passing over it, rolling off the toe at the end
            k = u / duty
            pitch = -8 * (1 - k / 0.2) if k < 0.2 else 24 * max(0.0, (k - 0.7) / 0.3) ** 2
            return V(0, -reach + 2 * reach * k, m.lift(leg, pitch)), pitch
        k = (u - duty) / (1 - duty)  # in the air: folding up behind, then reaching ahead
        over = 0.35 * reach
        if k < 0.85:
            y = reach - (2 * reach + over) * EASES['smooth'](k / 0.85)
        else:
            y = -reach - over + over * EASES['smooth']((k - 0.85) / 0.15)
        high = (0.36 if fore else 0.24) * fold * m.reach[leg]
        z = high * math.sin(math.pi * min(1.0, k / 0.9)) ** 1.3
        flip = (105 if fore else 70) * fold
        reaching = max(0.0, (k - 0.6) / 0.25) * (1 - max(0.0, (k - 0.85) / 0.15))
        pitch = flip * math.sin(math.pi * min(1.0, k / 0.75)) - 14 * reaching
        return V(0, y, z + max(0.0, m.lift(leg, pitch))), pitch

    def pose(f):
        u = f / n
        rock = math.cos(math.tau * (u - 0.56))  # 1 with the forehand down on the forefeet
        rise = math.cos(math.tau * (u - 0.25))  # 1 in the leap
        ch = {}
        for leg in m.legs:
            at, pitch = leg_at(leg, u - lands[leg])
            ch.update(m.foot(leg, at, pitch))
        crouch = (0.06 + 0.04 * bound) * h
        pitch = (4 + 3 * bound) * rock
        ch.update(m.body(pitch, 0, 1.5 * math.sin(math.tau * (u - 0.4)),
                         at=V(0, 0, -crouch + (0.035 + 0.01 * bound) * h * bob * rise)))
        ch['mount_neck'] = V(7 * rock - 4, 0, 0)
        ch['mount_head'] = V(-4 * rock + 3, 0, 0)
        if 'mount_tail' in rig.bones:  # streaming out behind, level as the body rocks
            ch['mount_tail'] = V(tail - pitch + 5 * math.cos(math.tau * (u - 0.1)), 5 * math.sin(math.tau * u), 0)
        # The rider sits the gallop, the body leaning into it and keeping the head steady over the
        # rocking, the weapon carried up and the rein hand giving.
        ch['hips'] = V(-2.5 * rock, 0, 0)
        ch['spine'] = V(lean - 2.5 * rock + 1.5 * rise, 0, 0)
        ch['head'] = V(-0.6 * lean - 1.5 * rock, 0, 0)
        if 'cape' in rig.bones:
            ch['cape'] = V(18 + 6 * math.cos(math.tau * (u - 0.2)), 2 * math.sin(math.tau * u), 0)
        ch.update(b.arm(hand, b.wrist(hand, 0.02, -0.04, 0.05 + 0.03 * rise), b.tip(carry + 4 * rock)))
        ch.update(b.arm(b.off, b.wrist(b.off, 0, -0.06 - 0.05 * rock, 0.02 - 0.03 * rock)))
        return ch

    return Clip(n, pose, loop=True)


def mount_grounded(rig, m, pose):
    """A mounted clip's pose function kept out of the ground: in each frame, each of the mount's legs
    placed by IK whose lower leg or foot would reach under the ground rises until it rests on it; its
    tail, if it would, lifts behind; and its body rises, carrying the rider, if a part of the body
    or the rider would. For keyed clips that bring the mount down, as `fall` does."""
    lower = {leg: [chain[1], chain[2]] for leg, chain in m.legs.items()}
    tail = [b for b in rig.bones if b.startswith('mount_tail')]
    # The body with everything on it but its lower legs, its tail and the rider's arms, which aim
    # the weapon.
    held = {b for s in ('l', 'r') for b in LIMBS[f'arm_{s}']}
    below = {b for bones in lower.values() for b in bones}
    trunk = [b for b in rig.bones if b not in ('root', *tail, *held, *below)]

    def lifted(frame):
        ch = pose(frame)
        for _ in range(8):
            for leg, bones in lower.items():  # each lower leg and foot up onto the ground
                key = f'mount_{leg}_at'
                for _ in range(4):
                    low = rig.lowest(ch, bones) if key in ch else 0.0
                    if low >= -TOUCH:
                        break
                    ch[key] = Vector(ch[key]) + V(0, 0, -low + TOUCH)
            for bone in tail[:1]:  # the tail lifted behind
                for _ in range(12):
                    if rig.lowest(ch, tail) >= -TOUCH:
                        break
                    ch[bone] = Vector(ch.get(bone, (0, 0, 0))) + V(4, 0, 0)
            # and the body, with the rider and the legs, up off it where a leg can't lift itself
            low = min(rig.lowest(ch, trunk), *(rig.lowest(ch, bones) for bones in lower.values()))
            if low >= -TOUCH:
                break
            ch['mount_body_at'] = Vector(ch.get('mount_body_at', (0, 0, 0))) + V(0, 0, -low + TOUCH)
        return ch

    return lifted


def spear_clip(rig, hand, seconds, strike, charge):
    """A spear stabbed down from the saddle beside the mount's shoulder, its point kept inside the
    hex; with `charge` raised higher and driven harder as the mount rises and slams down under it."""
    b = Body(rig, hand)
    m = Steed(rig)
    n = frames_for(seconds)
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2, 'mount_head': 1, 'mount_tail': 2})
    k.key(0, **seated(b, m, legs=charge))

    def spear(at, axis, elbow):
        aim = b.rig.aim(hand, b.out(*axis), b.out(1, 0, 0))
        return b.arm(hand, b.near(*at), aim, elbow, world=1.0)

    if charge:
        hind = sum((m.fetlock[leg] for leg in m.hind), Vector()) / len(m.hind) + V(0, 0, 0.15 * m.height)
        rising = {}
        for i, leg in enumerate(m.fore):
            rising.update(m.foot(leg, V(0, -0.05 * m.height, (0.22 + 0.06 * i) * m.height), 60 + 15 * i))
        for leg in m.hind:
            rising.update(m.planted(leg))
        # Rising: the forehand up off the ground, forefeet lifted; the spear raised high.
        k.key(0, **rising, **m.body(-7, 0, 0, at=V(0, 0.02, 0), about=hind), mount_neck=V(-10, 0, 4),
              mount_head=V(6, 0, 0), mount_tail=V(6, 0, 0))
        k.key(0, **spear((0.25, 0.2, 0.92), (0.2, -0.38, -0.9), (0.8, 0.4, 0.5)), spine=V(-9, 0, b.yaw(14)),
              hips=V(-3, 0, b.yaw(5)), head=V(6, 0, b.yaw(-6)), cape=V(-4, 0, 0), **b.arm(off, b.wrist(off, 0.0, 0.06, 0.06)))
        k.key(2, 'in', **spear((0.27, 0.0, 0.6), (0.24, -0.42, -0.88), (0.8, 0.4, 0.2)), spine=V(-2, 0, b.yaw(8)))
        # Slamming down: the forefeet down, the weight thrown forward, and the stab at full stretch on
        # frame `strike`.
        k.key(strike, 'in', **{c: v for leg in m.fore for c, v in m.planted(leg).items()},
              **m.body(4, 0, 0, at=V(0, -0.015, -0.03)), mount_neck=V(6, 0, 14), mount_head=V(-4, 0, 0),
              mount_tail=V(14, 0, 0))
        k.key(strike, 'in', **spear((0.38, -0.5, -0.4), (0.3, -0.42, -0.86), (0.6, 0.4, -0.3)),
              spine=V(20, 0, b.yaw(-10)), hips=V(5, 0, b.yaw(-5)), head=V(-10, 0, b.yaw(8)), cape=V(14, 0, 0),
              **b.arm(off, b.wrist(off, 0.0, 0.1, -0.02)))
        k.key(strike + 4, 'out', **spear((0.38, -0.46, -0.37), (0.3, -0.43, -0.85), (0.6, 0.4, -0.3)),
              **m.body(3, 0, 0, at=V(0, -0.01, -0.025)), spine=V(18, 0, b.yaw(-9)))
    else:
        # Raised high by the shoulder, the point down at what he strikes.
        k.key(0, **spear((0.3, 0.15, 0.85), (0.2, -0.4, -0.89), (0.8, 0.4, 0.4)),
              spine=V(-6, 0, b.yaw(12)), hips=V(-2, 0, b.yaw(4)), head=V(6, 0, b.yaw(-6)), cape=V(-2, 0, 0),
              mount_neck=V(-3, 0, 0), **b.arm(off, b.wrist(off, 0.0, 0.04, 0.03)))
        k.key(1, 'in', **spear((0.31, 0.05, 0.7), (0.22, -0.42, -0.88), (0.8, 0.4, 0.3)), spine=V(-3, 0, b.yaw(8)))
        # The stab, down and forward along the spear beside the mount's shoulder, the body behind it.
        k.key(strike, 'in', **spear((0.4, -0.4, -0.3), (0.3, -0.45, -0.84), (0.6, 0.4, -0.3)),
              spine=V(16, 0, b.yaw(-8)), hips=V(3, 0, b.yaw(-4)), head=V(-6, 0, b.yaw(6)), cape=V(10, 0, 0),
              mount_neck=V(-6, 0, 4), mount_head=V(-5, 0, 0), mount_tail=V(8, 0, 0),
              **b.arm(off, b.wrist(off, 0.0, 0.08, 0.0)))
        k.key(strike + 2, 'out', **spear((0.4, -0.36, -0.27), (0.3, -0.46, -0.84), (0.6, 0.4, -0.3)),
              spine=V(14, 0, b.yaw(-7)))
    # Drawn back out, the point still low, then brought up level past his hip and lifted upright, so
    # the point stays inside the hex as the spear turns.
    k.key(strike + 5, 'smooth', **spear((0.3, 0.45, 0.1), (0.2, -0.45, -0.87), (0.8, 0.4, 0.1)),
          spine=V(5, 0, b.yaw(-2)))
    k.key(strike + 9, 'smooth', **spear((0.15, 0.6, -0.25), (-0.1, -0.99, 0.05), (0.8, 0.4, -0.3)),
          spine=V(2, 0, b.yaw(-1)))
    k.key(strike + 12, 'smooth', **spear((0.1, 0.4, -0.15), (-0.05, -0.6, 0.8), (0.8, 0.4, -0.3)))
    k.key(n, **seated(b, m, legs=charge))
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'height' if charge else 'strike': strike})


@style('attack', 'spear')
def spear_thrust(rig, hand='r', seconds=0.6):
    """A spear stabbed down from the saddle: raised high by the shoulder, the point down at the foe,
    then driven down and forward along its length beside the mount's shoulder, landing on frame 3,
    as the mount tosses its head; then drawn back out past the hip and lifted upright."""
    return spear_clip(rig, hand, seconds, BLOW, False)


@style('cast', 'spear')
def spear_charge(rig, hand='r', seconds=0.7, height=4):
    """A stab with the mount's whole weight behind it: the mount rising, forefeet off the ground,
    as the rider lifts the spear high, then slamming down and forward as he drives it down beside
    its shoulder, at full stretch on frame `height`; then the spear drawn back and lifted upright."""
    return spear_clip(rig, hand, seconds, height, True)


@style('attack', 'cut')
def cut(rig, hand='r', seconds=0.55, out=1.0, across=0.0, early=0.0):
    """A blade, an axe or a mace swung down from the saddle on its own side: drawn back high over the
    shoulder, then over the top and down past the mount's shoulder with the body behind it, landing
    on frame 3, a rebound and a recovery, while the mount tosses its head. `out` is how far out to its
    side the blow comes down, clear of the mount.

    `across` and `early` keep a long blade in the hex between frames, as the client shows them
    (Blows kept in the hex between frames, below): on frame 2 the blade is turned `across` degrees in
    across the front and `early` degrees further down, so as it comes over level it points ahead
    rather than out past the hex, and is swept out to its side only as it comes down."""
    b = Body(rig, hand)
    m = Steed(rig)
    n = frames_for(seconds)
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2, 'mount_head': 1, 'mount_tail': 2})
    k.key(0, **seated(b, m, legs=False))

    def blow(theta, at, elbow, yaw, inward=0.0):
        aim, face = arc(theta, b.yaw(yaw * out - inward))
        return b.arm(hand, b.near(*at), b.rig.aim(hand, aim, face), elbow, world=1.0)

    # Drawn back high over the shoulder, the body turned to its side.
    k.key(0, **blow(-40, (0.2 * out, 0.3, 0.7), (0.8, 0.3, 0.2), 30), spine=V(-6, 0, b.yaw(16)),
          hips=V(-2, 0, b.yaw(5)), head=V(4, 0, b.yaw(-8)), cape=V(-4, 0, 0), mount_neck=V(-4, 0, 0),
          **b.arm(off, b.wrist(off, 0.0, 0.04, 0.03)))
    # Over the top, gathering speed.
    k.key(1, 'in', **blow(20, (0.25 * out, 0.1, 0.8), (0.8, 0.3, 0.1), 25), spine=V(-2, 0, b.yaw(8)))
    k.key(2, 'in', **blow(75 + early, (0.32 * out, -0.08, 0.5), (0.7, 0.4, -0.2), 20, across),
          spine=V(6, 0, b.yaw(-2)))
    # The blow, down beside the mount's shoulder, the body over it.
    k.key(BLOW, 'in', **blow(135, (0.45 * out, -0.1, -0.2), (0.6, 0.4, -0.4), 20), spine=V(14, 0, b.yaw(-8)),
          hips=V(3, 0, b.yaw(-4)), head=V(-6, 0, b.yaw(6)), cape=V(10, 0, 0), mount_neck=V(-8, 0, 5),
          mount_head=V(-6, 0, 0), mount_tail=V(8, 0, 0), **b.arm(off, b.wrist(off, 0.0, 0.08, 0.0)))
    k.key(BLOW + 2, 'out', **blow(128, (0.45 * out, -0.02, -0.15), (0.6, 0.4, -0.4), 20), spine=V(12, 0, b.yaw(-7)))
    k.key(BLOW + 7, 'smooth', **blow(30, (0.3 * out, 0.25, 0.4), (0.7, 0.4, -0.3), 15), spine=V(4, 0, b.yaw(-2)))
    k.key(n, **seated(b, m, legs=False))
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'strike': BLOW})


def hinged(rig, bone, degrees):
    """The turn, as a channel, opening a jaw on `bone` by `degrees` about its own hinge: square to the
    jaw and level, as the head it hangs from is turned in the rest pose."""
    _, head, tail = rig.bones[bone]
    along = rig.joint(tail) - rig.joint(head)
    axis = along.cross(V(0, 0, 1)).normalized()
    if axis.x < 0:
        axis = -axis
    e = Quaternion(axis, math.radians(degrees)).to_euler('XYZ')
    return V(*(math.degrees(a) for a in e))


@style('cast', 'bite')
def bite(rig, hand='r', seconds=0.7, height=4, jaw='mount_jaw'):
    """The mount bites: its head drawn back and its jaws wide, then lunging, the body thrown forward
    behind it and the head snapping round to its side so it keeps inside the hex, the jaws shut on
    frame `height`; a shake of the head and back. The rider leans back over it, the weapon raised."""
    b = Body(rig, hand)
    m = Steed(rig)
    n = frames_for(seconds)
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2, 'mount_tail': 2})
    k.key(0, **seated(b, m))
    opened = {jaw: hinged(rig, jaw, 16)} if jaw in rig.bones else {}
    shut = {jaw: hinged(rig, jaw, -36)} if jaw in rig.bones else {}
    k.key(0, **m.body(-3, 0, 0, at=V(0, 0.03, -0.02)), mount_neck=V(-14, 0, -8), mount_head=V(-10, 0, 0), **opened,
          spine=V(-6, 0, b.yaw(-6)), head=V(4, 0, 0), **b.arm(hand, b.wrist(hand, 0.04, 0.04, 0.06), b.tip(-8)),
          **b.arm(off, b.wrist(off, 0.0, 0.08, 0.06)))
    k.key(height, 'in', **m.body(4, 0, 0, at=V(0, -0.03, -0.03)), mount_neck=V(16, 0, 14), mount_head=V(6, 0, 6),
          **shut, spine=V(-10, 0, b.yaw(4)), head=V(-6, 0, b.yaw(8)), mount_tail=V(10, 0, 0),
          **b.arm(hand, b.wrist(hand, 0.05, 0.08, 0.1), b.tip(-14)), **b.arm(off, b.wrist(off, 0.0, -0.08, -0.02)))
    k.key(height + 3, 'out', mount_head=V(4, 10, 0), mount_neck=V(14, 0, 18))
    k.key(height + 6, 'smooth', mount_head=V(5, -8, 4), mount_neck=V(13, 0, 10), **m.body(3, 0, 0, at=V(0, -0.025, -0.025)))
    k.key(n, **seated(b, m))
    return Clip(n, k, marks={'height': height})


@style('stun', 'reel')
def reel(rig, hand='r', seconds=1.2, droop=1.0, low=0.0):
    """Dazed in the saddle: the mount's head hanging and swaying from side to side, its raised foot
    put down, its tail limp; the rider slumped and swaying with it, the head lolling, the weapon
    slack against the shoulder and the rein hand dropped. `low` (0 to 1) brings a weapon the rider
    sits holding up high that share of the way down to rest by its thigh, hanging slack down the
    mount's flank (the Riders below)."""
    b = Body(rig, hand)
    m = Steed(rig)
    n = frames_for(seconds)
    off = b.off

    def pose(f):
        sway = wave(f, n, 1)
        bob = wave(f, n, 1, 0.25)
        ch = m.stance(legs=False)
        if m.raised:
            ch.update(m.planted(m.raised))
        ch['mount_neck'] = V(16 * droop + 3 * bob, 0, 9 * sway)
        ch['mount_head'] = V(10 * droop + 4 * wave(f, n, 2, 0.2), 6 * wave(f, n, 1, 0.35), 4 * wave(f, n, 1, 0.2))
        if 'mount_tail' in rig.bones:
            ch['mount_tail'] = V(-3, 3 * wave(f, n, 1, 0.1), 0)
        ch['hips'] = V(2 + 1.5 * bob, -2.5 * sway, 2 * bob)
        ch['spine'] = V(12 + 3 * wave(f, n, 2, 0.2), 4 * wave(f, n, 1, 0.1), 4 * bob)
        ch['head'] = V(16 + 6 * wave(f, n, 1, 0.1), 9 * wave(f, n, 1, 0.35), 5 * wave(f, n, 1, 0.2))
        if 'cape' in rig.bones:
            ch['cape'] = V(-2 + 2 * wave(f, n, 1, -0.1), -3 * sway, 0)
        # The weapon leans slack outwards and back from a loose hand, swaying.
        slack = turned(V(0.45, 0.3, 0.84), (0, 0, 5 * sway))
        at = b.wrist(hand, 0.06, 0.04, -0.12 * droop) + V(0, 0, 0.01 * wave(f, n, 1, 0.3))
        aim = b.aim(slack, (-0.3, -1, 0))
        if low:  # from held high to resting by the thigh, the weapon hanging down the flank
            hanging_ = turned(V(0.4, -0.25, -0.88), (0, 0, 5 * sway))
            at = at.lerp(b.near(0.25, -0.1, -0.6) + V(0, 0, 0.01 * wave(f, n, 1, 0.3)), low)
            aim = aim.slerp(b.aim(hanging_, (0.3, -1, 0)), low)
        ch.update(b.arm(hand, at, aim))
        ch.update(b.arm(off, b.wrist(off, 0.02, 0.06, -0.12 * droop), b.tip(10 * droop + 4 * sway)))
        return ch

    return Clip(n, pose, loop=True)


@style('death', 'fall')
def fall(rig, hand='r', seconds=0.5, roll=1.0):
    """Struck, rider and mount go down together: the mount's head flung up, its forelegs buckling to
    its knees and its hind legs folding under it, until it lies on its belly, rolled a little on its
    side, its neck curled round and its head low; the rider thrown back, then slumped forward over
    its neck, the weapon dropped along its flank. Ends low, inside the hex. It is mount_grounded()."""
    b = Body(rig, hand)
    m = Steed(rig)
    n = frames_for(seconds)
    h = m.height
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 1, 'mount_head': 1, 'mount_tail': 1})
    k.key(0, **seated(b, m))

    def fold(body, leg):
        """A leg folded under the body posed by `body`."""
        return m.folded(leg, rig.solve(body)[m.legs[leg][0]].at)

    # Struck: the head flung up, the rider thrown back.
    k.key(2, 'out', **m.body(-3, 0, 0, at=V(0, 0.01, 0.0)), mount_neck=V(-12, 0, 0), mount_head=V(-8, 0, 0),
          spine=V(-14, 0, b.yaw(6)), head=V(-12, 0, 0),
          **b.arm(hand, b.wrist(hand, 0.1, 0.05, 0.06)), **b.arm(off, b.wrist(off, 0.1, 0.05, 0.05)))
    # The forelegs buckle: down on its knees, the hind legs still under it.
    hind = sum((m.fetlock[leg] for leg in m.hind), Vector()) / len(m.hind) + V(0, 0, 0.2 * h)
    body = m.body(22, 0, 0, at=V(0, 0.06 * h, -0.06 * h), about=hind)
    knelt = dict(body)
    for leg in m.fore:
        knelt.update(fold(body, leg))
    for leg in m.hind:
        knelt.update(m.planted(leg))
    k.key(7, 'in', **knelt, mount_neck=V(-14, 0, 40 * roll), mount_head=V(4, 0, 0), spine=V(8, 0, 0), head=V(10, 0, 0),
          **b.arm(hand, b.wrist(hand, 0.15, -0.1, -0.2)), **b.arm(off, b.wrist(off, 0.1, 0.0, -0.15)))
    # Down: the hind legs folded under, lying on its belly and rolled a little onto its left.
    body = m.body(3, 7 * roll, 0, at=V(0, 0.02 * h, -0.5 * h))
    down = dict(body)
    for leg in m.legs:
        down.update(fold(body, leg))
    k.key(n, 'out', **down, mount_neck=V(14, 0, 50 * roll), mount_head=V(24, 0, 12 * roll), mount_tail=V(10, 0, 0),
          spine=V(38, b.side * 4, 0), hips=V(6, 0, 0), head=V(24, b.side * 8, 0), cape=V(-10, 0, 0))
    # The weapon let fall along its flank, its end resting on the ground: the hand placed in the
    # mount's frame, where it lies, a little off the ground.
    seat = rig.solve(body)[rig.seat]
    shoulder = b.rig.joint(f'shoulder_{hand}')
    rest = V(shoulder.x * 1.5, shoulder.y - 0.3, 0.3)
    at = seat.head + seat.turn.inverted() @ (rest - seat.at)
    held = rig.held(hand)
    reach = (held[1] - b.rest[f'hand_{hand}_at']).length if held else 0.3
    slope = math.asin(min(0.9, 0.24 / max(reach, 0.3)))
    lay = b.aim((0.1, math.cos(slope), -math.sin(slope)), (1, 0, 0))
    k.key(n, 'out', **b.arm(hand, at, lay, (0.6, 0.4, 0.3), world=1.0))
    k.key(n, 'out', **b.arm(off, b.wrist(off, 0.05, -0.1, -0.4), b.tip(30)))
    return Clip(n, mount_grounded(rig, m, k))


@style('victory', 'rear')
def rear(rig, hand='r', seconds=1.2, rear=1.0, out=0.08):
    """The mount rears, forefeet pawing, and comes down with a stamp to stand proud, its neck arched
    and a raised foreleg up again, while the rider leans into the rear and thrusts the weapon up high,
    and holds it there. `rear` is how high it rears: 0 for a stamp alone. `out` is how far out from
    the shoulder the fist goes up, a share of the arm's reach, as raise's: more to hold the weapon
    clear of a big hood (the Riders below). It is mount_grounded()."""
    b = Body(rig, hand)
    m = Steed(rig)
    n = frames_for(seconds)
    h = m.height
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2, 'mount_head': 1, 'mount_tail': 2})
    k.key(0, **seated(b, m))
    hind = sum((m.fetlock[leg] for leg in m.hind), Vector()) / len(m.hind) + V(0, 0, 0.15 * h)

    def up(theta, height):
        aim, _ = arc(theta)
        return b.arm(hand, b.near(out, -0.05, height), b.rig.aim(hand, aim, b.out(1, 0, 0)), (0.9, 0.2, -0.3))

    def merged(*parts, **channels):
        out = {}
        for p in parts:
            out.update(p)
        out.update(channels)
        return out

    planted = merged(*(m.planted(leg) for leg in m.legs))
    # Gathering: down on its haunches.
    k.key(4, **merged(planted, m.body(-4 * rear, 0, 0, at=V(0, 0.02, -0.03 * h), about=hind)),
          mount_neck=V(-6, 0, 0), spine=V(6, 0, 0), **b.arm(hand, b.wrist(hand, 0.02, 0.02, -0.06), b.tip(-6)))
    # Up on its hind legs, forefeet pawing; the weapon thrust up.
    pawing = merged(*(m.foot(leg, V(0, -0.12 * h + 0.06 * h * i, 0.5 * h + 0.06 * h * i), 95)
                      for i, leg in enumerate(m.fore)))
    k.key(12, 'out', **merged(pawing, m.body(-24 * rear, 0, 0, at=V(0, 0.02, 0.0), about=hind)), mount_neck=V(14, 0, 0),
          mount_head=V(10, 0, 0), mount_tail=V(10, 0, 0), spine=V(22 * rear, 0, b.yaw(3)), hips=V(4, 0, 0),
          head=V(-8, 0, 0), cape=V(10, 0, 0), **up(-10, 0.98), **b.arm(off, b.wrist(off, 0.0, -0.1, 0.06)))
    pawing = merged(*(m.foot(leg, V(0, -0.06 * h - 0.06 * h * i, 0.45 * h - 0.05 * h * i), 70)
                      for i, leg in enumerate(m.fore)))
    k.key(17, **merged(pawing, m.body(-20 * rear, 0, 0, at=V(0, 0.02, 0.0), about=hind)), spine=V(18 * rear, 0, b.yaw(2)))
    # Down with a stamp, then standing proud, the weapon held high.
    k.key(24, 'in', **merged(*(m.planted(leg) for leg in m.fore), m.body(2, 0, 0, at=V(0, 0, -0.02 * h))),
          mount_neck=V(4, 0, 0), mount_head=V(0, 0, 0), spine=V(-2, 0, b.yaw(2)), hips=V(0, 0, 0), **up(2, 0.94))
    proud = m.stance()
    proud.update(mount_neck=V(-6, 0, 0), mount_head=V(6, 0, 0), mount_tail=V(4, 0, 0))
    k.key(n, **proud, spine=V(-5, 0, b.yaw(2)), head=V(-8, 0, 0), cape=V(2, 0, 0), **up(0, 0.95),
          **b.arm(off, b.wrist(off, 0.0, -0.04, 0.04)))
    return Clip(n, mount_grounded(rig, m, k))


# The Riders (units/gamling.py, theoden.py, khamul.py and witch-king.py) --------------------------
#
# Mounted casts for Riders without a spear or a bite, and an attack for one whose hands hold no
# weapon: a charge through the foes' line (Théoden's Forth Eorlingas! and Khamûl's Shadow ride), a
# leap that comes down in a slam (the Witch-king's Morgul mace), a horn sounded from the saddle
# (Gamling's Horn of the Hornburg), and the mount striking out with its forefeet (Gamling's attack,
# his hands on the horn and the reins). A charge or a leap sets off on its dash at the ability's release,
# and the viewer plays `move` from there (docs/viewer-spec.md section 5), so for a unit whose ability
# dashes timed() puts the frame it springs on, which the style marks `off`, at the release: the mount
# gathered on its haunches through the wind-up, springing as it ends. What follows, the landing and the
# blow, shows only if no dash carries it off.


def together(*parts, **channels):
    """One pose's channels from several, the later winning."""
    out = {}
    for part in parts:
        out.update(part)
    out.update(channels)
    return out


def hoof(m, leg, dy, dz, pitch):
    """A mount's `leg` with its foot off the ground: `dy` behind where it stands (ahead when
    negative) and `dz` above it, both shares of the leg's reach, pitched by `pitch` degrees and kept
    clear of the ground as it turns."""
    r = m.reach[leg]
    return m.foot(leg, V(0, dy * r, dz * r + max(0.0, m.lift(leg, pitch))), pitch)


def haunches(m):
    """The point a mount rises about on its hind legs: over its hind feet."""
    return sum((m.fetlock[leg] for leg in m.hind), Vector()) / len(m.hind) + V(0, 0, 0.15 * m.height)


@style('cast', 'charge')
def charge(rig, hand='r', seconds=0.7, height=4, stretch=1.0, out=16.0, wide=0.0):
    """A charge through the foes' line: the mount gathered on its haunches, its forehand rising, as
    the rider draws the blade back high; then springing out at full stretch, forefeet reaching and
    hind feet pushed off, the rider leaning into it and sweeping the blade forward over the top;
    landing on its forefeet as the blade is levelled down at the line ahead, `out` degrees out to its
    own side, at its height on frame `height`; then the hind feet come under it, it pulls up, and the
    blade is lifted back. Levelled, its flat is turned up, so it shows from above and behind rather
    than edge on. `stretch` is how far the mount reaches out, and `wide` draws the blade back and
    lifts it again that share of the arm's reach further out on its own side, clear of a big hood. It
    is mount_grounded(). Frame 1, as it springs from its haunches, is `off`: where the charge sets off
    on its dash (timed())."""
    b = Body(rig, hand)
    m = Steed(rig)
    n = frames_for(seconds)
    h = m.height
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2, 'mount_head': 1, 'mount_tail': 2})
    k.key(0, **seated(b, m))
    hind = haunches(m)

    def blade(theta, at, elbow, yaw=0.0, flat=False):
        aim, face = arc(theta, b.yaw(yaw))
        if flat:  # an edge out to its side, the flat up
            face = b.out(1, 0, 0)
        return b.arm(hand, b.near(*at), b.rig.aim(hand, aim, face), elbow, world=1.0)

    # Gathered: the hind feet under it, the forehand rising; the blade drawn back high.
    gathered = together(*(m.planted(leg, -0.12 * m.reach[leg]) for leg in m.hind),
                        *(hoof(m, leg, -0.08, 0.3 + 0.08 * i, 70 + 15 * i) for i, leg in enumerate(m.fore)))
    k.key(0, **gathered, **m.body(-7, 0, 0, at=V(0, 0.03, -0.02 * h), about=hind), mount_neck=V(-4, 0, 0),
          mount_head=V(6, 0, 0), mount_tail=V(4, 0, 0))
    k.key(0, **blade(-30, (0.15 + wide, 0.2, 0.85), (0.8, 0.3, 0.2), 10), spine=V(5, 0, b.yaw(12)), hips=V(-2, 0, b.yaw(4)),
          head=V(-4, 0, b.yaw(-6)), cape=V(8, 0, 0), **b.arm(off, b.wrist(off, 0.0, 0.04, 0.05)))
    # In the air at full stretch, forefeet reaching and hind feet pushed off, the body raised; the
    # rider leaning into it, the blade coming over the top.
    stretched = together(*(hoof(m, leg, -0.4 * stretch + 0.08 * i, 0.22, -12) for i, leg in enumerate(m.fore)),
                         *(hoof(m, leg, 0.38 * stretch - 0.06 * i, 0.2, 60) for i, leg in enumerate(m.hind)))
    k.key(2, 'out', **stretched, **m.body(1, 0, 1.5, at=V(0, -0.01, 0.07 * h)), mount_neck=V(0, 0, 0),
          mount_head=V(-3, 0, 0), mount_tail=V(16, 0, 0))
    k.key(2, 'in', **blade(50, (0.25 + wide, -0.1, 0.6), (0.8, 0.3, 0.0), 12), spine=V(14, 0, b.yaw(4)), hips=V(2, 0, 0),
          head=V(-10, 0, 0), cape=V(22, 0, 0), **b.arm(off, b.wrist(off, 0.0, -0.08, 0.0)))
    # Down on its forefeet, the blade levelled down at the line: the height.
    landing = together(*(m.planted(leg, (-0.28 * stretch + 0.12 * i) * m.reach[leg], -8) for i, leg in enumerate(m.fore)),
                       *(hoof(m, leg, 0.3 * stretch - 0.06 * i, 0.26, 85) for i, leg in enumerate(m.hind)))
    k.key(height, 'in', **landing, **m.body(5, 0, 0, at=V(0, 0.0, -0.02 * h)), mount_neck=V(3, 0, 4),
          mount_head=V(-4, 0, 0), mount_tail=V(14, 0, 0))
    k.key(height, 'in', **blade(102, (0.28, -0.34, 0.05), (0.7, 0.4, -0.2), out, True), spine=V(20, 0, b.yaw(-6)),
          hips=V(4, 0, b.yaw(-3)), head=V(-12, 0, b.yaw(4)), cape=V(26, 0, 0),
          **b.arm(off, b.wrist(off, 0.0, -0.1, -0.02)))
    k.key(height + 2, 'out', **blade(108, (0.3, -0.32, 0.0), (0.7, 0.4, -0.2), out, True), spine=V(18, 0, b.yaw(-5)))
    # The hind feet come under it as it pulls up; the blade swept back up.
    under = together(*(m.planted(leg, -0.08 * m.reach[leg]) for leg in m.fore),
                     *(m.planted(leg, -0.14 * m.reach[leg]) for leg in m.hind))
    k.key(height + 4, 'out', **under, **m.body(-3, 0, 0, at=V(0, 0.01, -0.03 * h), about=hind),
          mount_neck=V(-6, 0, 0), mount_head=V(4, 0, 0), mount_tail=V(8, 0, 0))
    k.key(height + 9, 'smooth', **blade(20, (0.25 + wide, 0.1, 0.55), (0.8, 0.3, 0.0), 8), spine=V(4, 0, b.yaw(2)),
          head=V(-3, 0, 0), cape=V(8, 0, 0))
    k.key(n, **seated(b, m))
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, mount_grounded(rig, m, k), marks={'height': height, 'off': 1})


@style('cast', 'leap')
def leap(rig, hand='r', seconds=0.8, height=4, spring=1.0, out=1.0):
    """A leap that comes down in a slam: the mount sunk on its haunches, forefeet tucked up, as the
    rider rears back with the weapon drawn high over the shoulder; up and over, every foot off the
    ground, the weapon at the top of its swing; then down onto its forefeet with a crash as the rider
    brings the weapon down past the mount's shoulder with the body over it, at its height on frame
    `height`; then the hind feet land and it stands. `spring` is how high it leaps, and `out` how far
    out to its own side the blow comes down, as cut's. It is mount_grounded(). Frame 1, as it springs
    from its haunches, is `off`: where the leap sets off on its dash (timed())."""
    b = Body(rig, hand)
    m = Steed(rig)
    n = frames_for(seconds)
    h = m.height
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2, 'mount_head': 1, 'mount_tail': 2})
    k.key(0, **seated(b, m))
    hind = haunches(m)

    def blow(theta, at, elbow, yaw):
        aim, face = arc(theta, b.yaw(yaw * out))
        return b.arm(hand, b.near(at[0] * out, at[1], at[2]), b.rig.aim(hand, aim, face), elbow, world=1.0)

    # Sunk on its haunches, forefeet tucked up; the weapon drawn back high over the shoulder.
    crouched = together(*(m.planted(leg, -0.1 * m.reach[leg], -6) for leg in m.hind),
                        *(hoof(m, leg, 0.0, 0.42 + 0.06 * i, 100) for i, leg in enumerate(m.fore)))
    k.key(0, **crouched, **m.body(-12, 0, 0, at=V(0, 0.04, -0.06 * h), about=hind), mount_neck=V(6, 0, 0),
          mount_head=V(6, 0, 0), mount_tail=V(-4, 0, 0))
    k.key(0, **blow(-55, (0.32, 0.28, 0.7), (0.8, 0.3, 0.2), 25), spine=V(-4, 0, b.yaw(16)), hips=V(-3, 0, b.yaw(5)),
          head=V(6, 0, b.yaw(-8)), cape=V(-4, 0, 0), **b.arm(off, b.wrist(off, 0.0, 0.06, 0.06)))
    # Up and over, every foot off the ground, the weapon at the top of its swing.
    flying = together(*(hoof(m, leg, -0.1, 0.5 + 0.05 * i, 105) for i, leg in enumerate(m.fore)),
                      *(hoof(m, leg, 0.35 + 0.05 * i, 0.3, 60) for i, leg in enumerate(m.hind)))
    k.key(2, 'out', **flying, **m.body(-4, 0, 0, at=V(0, -0.02, 0.18 * spring * h)), mount_neck=V(0, 0, 0),
          mount_head=V(2, 0, 0), mount_tail=V(14, 0, 0))
    k.key(2, 'in', **blow(10, (0.3, 0.05, 0.92), (0.8, 0.3, 0.1), 22), spine=V(4, 0, b.yaw(8)), hips=V(0, 0, b.yaw(2)),
          head=V(-2, 0, 0), cape=V(14, 0, 0))
    k.key(height - 1, 'in', **blow(80, (0.32, -0.15, 0.5), (0.7, 0.4, -0.2), 20), spine=V(14, 0, b.yaw(-2)))
    # Down onto its forefeet with a crash, its head flung up, the weapon slammed down past its
    # shoulder: the height.
    crash = together(*(m.planted(leg, (-0.18 + 0.08 * i) * m.reach[leg], -10) for i, leg in enumerate(m.fore)),
                     *(hoof(m, leg, 0.25, 0.22, 70) for leg in m.hind))
    k.key(height, 'in', **crash, **m.body(5, 0, 0, at=V(0, 0.0, -0.05 * h)), mount_neck=V(-4, 0, 4),
          mount_head=V(-2, 0, 0), mount_tail=V(16, 0, 0))
    k.key(height, 'in', **blow(140, (0.45, -0.15, -0.3), (0.6, 0.4, -0.4), 20), spine=V(24, 0, b.yaw(-10)),
          hips=V(5, 0, b.yaw(-4)), head=V(-12, 0, b.yaw(6)), cape=V(16, 0, 0),
          **b.arm(off, b.wrist(off, 0.0, 0.1, -0.04)))
    k.key(height + 2, 'out', **blow(132, (0.45, -0.08, -0.25), (0.6, 0.4, -0.4), 20), spine=V(21, 0, b.yaw(-9)))
    # The hind feet come down and it stands, the weapon lifted back.
    landed = together(*(m.planted(leg, -0.06 * m.reach[leg]) for leg in m.fore),
                      *(m.planted(leg, -0.1 * m.reach[leg]) for leg in m.hind))
    k.key(height + 5, 'out', **landed, **m.body(3, 0, 0, at=V(0, -0.01, -0.03 * h)), mount_neck=V(2, 0, 2),
          mount_head=V(2, 0, 0), mount_tail=V(6, 0, 0))
    k.key(height + 10, 'smooth', **blow(35, (0.3, 0.25, 0.4), (0.7, 0.4, -0.3), 15), spine=V(5, 0, b.yaw(-2)),
          head=V(-2, 0, 0), cape=V(4, 0, 0))
    k.key(n, **seated(b, m))
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, mount_grounded(rig, m, k), marks={'height': height, 'off': 1})


@style('attack', 'trample')
def trample(rig, hand='r', seconds=0.6, rear=1.0):
    """The mount strikes out with its forefeet, for a rider whose hands hold no weapon to strike with,
    such as a horn and the reins: half-reared, forefeet pawing high, then struck down onto the foe
    ahead, landing on frame 3, its head thrust down after them; a rebound, and it stands. The rider
    leans into the rear and is jolted back as the feet come down, what it holds kept up, the rein hand
    giving. `rear` is how high it rears. It is mount_grounded()."""
    b = Body(rig, hand)
    m = Steed(rig)
    n = frames_for(seconds)
    h = m.height
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2, 'mount_head': 1, 'mount_tail': 2})
    k.key(0, **seated(b, m))
    hind = haunches(m)
    # Half-reared, the forefeet pawing high.
    pawing = together(*(m.planted(leg, -0.04 * m.reach[leg]) for leg in m.hind),
                      *(hoof(m, leg, -0.12 + 0.08 * i, (0.55 + 0.08 * i) * rear, 100) for i, leg in enumerate(m.fore)))
    k.key(0, **pawing, **m.body(-14 * rear, 0, 0, at=V(0, 0.02, 0.0), about=hind), mount_neck=V(10 * rear, 0, 0),
          mount_head=V(6, 0, 0), mount_tail=V(6, 0, 0))
    k.key(0, spine=V(10 * rear, 0, 0), hips=V(3, 0, 0), head=V(-6, 0, 0), cape=V(10, 0, 0),
          **b.arm(hand, b.wrist(hand, 0.02, 0.0, 0.04)), **b.arm(off, b.wrist(off, 0.0, 0.04, 0.08)))
    # Struck down onto the foe ahead, the head thrust after them.
    striking = together(*(hoof(m, leg, -0.3 + 0.06 * i, (0.25 + 0.04 * i) * rear, 40) for i, leg in enumerate(m.fore)))
    k.key(2, 'in', **striking, **m.body(-5 * rear, 0, 0, at=V(0, 0.01, 0.0), about=hind), mount_neck=V(6, 0, 0))
    struck = together(*(m.planted(leg, (-0.3 + 0.08 * i) * m.reach[leg], -8) for i, leg in enumerate(m.fore)))
    k.key(BLOW, 'in', **struck, **m.body(5, 0, 0, at=V(0, -0.02, -0.03 * h)), mount_neck=V(12, 0, 0),
          mount_head=V(8, 0, 0), mount_tail=V(10, 0, 0))
    k.key(BLOW, 'in', spine=V(-4, 0, 0), hips=V(-2, 0, 0), head=V(6, 0, 0), cape=V(-4, 0, 0),
          **b.arm(hand, b.wrist(hand, 0.02, 0.0, 0.0)), **b.arm(off, b.wrist(off, 0.0, -0.08, -0.03)))
    k.key(BLOW + 2, 'out', **m.body(3, 0, 0, at=V(0, -0.015, -0.02 * h)), mount_neck=V(9, 0, 0), spine=V(-2, 0, 0))
    k.key(BLOW + 8, 'smooth', **together(*(m.planted(leg, -0.06 * m.reach[leg]) for leg in m.fore)),
          **m.body(0, 0, 0), mount_neck=V(2, 0, 0), mount_head=V(2, 0, 0), spine=V(1, 0, 0))
    k.key(n, **seated(b, m))
    return Clip(n, mount_grounded(rig, m, k), marks={'strike': BLOW})


@style('cast', 'sound')
def sound(rig, hand='l', seconds=0.8, height=5, rear=1.0, lift=0.0):
    """A horn sounded from the saddle: a breath drawn, then the horn in `hand` put to the lips, the
    rider drawn up tall, head thrown back, as the mount half-rears, forefeet off the ground and its
    head up, at its height on frame `height`, and held while it sounds; then the mount comes down with
    a stamp and the horn is lowered. As for the horn style on foot, the script marks the mouthpiece
    (`mouthpiece`) and the lips (`mouth`) with joint(): the horn goes with the head as it sounds, its
    bell tipped `lift` degrees further up. `rear` is how high the mount rises. It is
    mount_grounded()."""
    if 'mouth' not in rig.joints or 'mouthpiece' not in rig.joints:
        raise RuntimeError('the sound style needs the joints "mouth" and "mouthpiece" marked')
    b = Body(rig, hand)
    m = Steed(rig)
    n = frames_for(seconds)
    h = m.height
    off = b.off
    mouth, piece, wrist = rig.joint('mouth'), rig.joint('mouthpiece'), rig.joint(f'wrist_{hand}')
    k = Keys(lag={'head': 1, 'cape': 2, 'mount_head': 1, 'mount_tail': 2})
    k.key(0, **seated(b, m))
    hind = haunches(m)
    # A breath drawn, the mount gathering under it.
    k.key(2, **m.body(-2 * rear, 0, 0, at=V(0, 0.01, -0.01 * h), about=hind), spine=V(5, 0, 0), head=V(5, 0, 0),
          cape=V(-2, 0, 0), **b.arm(off, b.wrist(off, 0.0, 0.03, 0.02)))
    # Sounding: the mount half-reared, its head up, the rider upright on it, head thrown back.
    rising = together(*(m.planted(leg) for leg in m.hind),
                      *(hoof(m, leg, -0.1 + 0.06 * i, (0.36 + 0.08 * i) * rear, 85 + 10 * i) for i, leg in enumerate(m.fore)))
    k.key(height, 'out', **rising, **m.body(-10 * rear, 0, 0, at=V(0, 0.02, 0.0), about=hind), mount_neck=V(-4, 0, 0),
          mount_head=V(-8, 0, 0), mount_tail=V(8, 0, 0), hips=V(-2, 0, 0), spine=V(10 * rear - 9, 0, b.yaw(-4)),
          head=V(-14, 0, b.yaw(-6)), cape=V(6, 0, 0), **b.arm(off, b.wrist(off, 0.0, -0.06, 0.04)))
    k.key(n - 9, **m.body(-8 * rear, 0, 0, at=V(0, 0.02, 0.0), about=hind), spine=V(8 * rear - 8, 0, b.yaw(-3)),
          head=V(-12, 0, b.yaw(-5)), cape=V(3, 0, 0))
    # Down with a stamp, the horn lowered.
    k.key(n - 5, 'in', **together(*(m.planted(leg) for leg in m.fore)), **m.body(2, 0, 0, at=V(0, 0.0, -0.015 * h)),
          mount_neck=V(4, 0, 0), mount_head=V(2, 0, 0), mount_tail=V(4, 0, 0), spine=V(2, 0, 0), head=V(-4, 0, 0))
    k.key(n, **seated(b, m))
    at_lips = Keys().key(1, u=0.0).key(height, 'out', u=1.0).key(n - 7, u=1.0).key(n, 'smooth', u=0.0)
    lifted = turn_of((-lift, 0, 0))
    kept = mount_grounded(rig, m, k)

    def pose(f):
        ch = kept(f)
        u = at_lips.value('u', f)
        if u > 0:  # the horn on its way to the lips or at them, drawn where it goes on the mount
            motions = rig.solve(ch)
            chest, head, seat = motions['spine'], motions['head'], motions[rig.seat]
            sounding = head.turn @ lifted
            at = chest(wrist).lerp(head(mouth) - sounding @ (piece - wrist), u)
            back = seat.turn.inverted()
            ch[f'hand_{hand}_at'] = seat.head + back @ (at - seat.at)
            ch[f'hand_{hand}_aim'] = back @ chest.turn.slerp(sounding, u)
            ch[f'hand_{hand}_world'] = 1.0
            ch[f'elbow_{hand}'] = back @ (chest.turn @ b.rest[f'elbow_{hand}'])
        return ch

    return Clip(n, pose, marks={'height': height})


# fitting clips to what a model holds -----------------------------------------------------------
#
# A style moves a figure as it would move anyone; fit() fits its clips to what a model holds. It
# takes the specs a Rig takes and gives back, for each clip, a function of the rig, as a script's own
# would be, that makes the clip with its style and then, in every frame:
#
# - draws in each hand that reaches for a target, wherever what it holds would reach out of the
#   clip's room, as far as it must to keep it `room` from the centre, so a long blade carried or swung
#   out to the side lands a little closer in, inside the hex; in an attack or a cast (rig.ACTIONS),
#   whose room reaches further ahead, `room` is measured against it (rig.measured()), so a blow
#   straight ahead may reach the same share of the way to kit.AHEAD_REACH; and it lifts what the hand
#   holds wherever it would go under the ground, as a blade laid down;
# - with `pole`, the hand ('l' or 'r') that holds a pole stood on the ground beside the model (a
#   standard, a banner, a staff, which hold() describes from the grip up to its top) keeps it planted
#   where it stands while the model stands, fights and is stunned; carries it upright and clear of
#   the ground as it runs; lets it tip over as the model falls; and lifts it as the model wins
#   (holding()). Clips named in `free` leave the pole hand to their style, as a cast that raises a
#   staff would, and are only kept in the hex and out of the ground;
# - with `between`, keeps what the hands hold in the clip's room and out of the ground between frames
#   too, as the client shows them, where a fast blow would swing it out between two frames
#   (kept_between()).
#
#     Rig(clips=fit({'idle': ('ready', {}), 'attack': ('chop', {}), ...}, pole='l', between=True))

# How far from the centre a fitted clip lets what a hand holds reach: inside the hex, and in an attack's
# or a cast's wedge ahead the same share of kit.AHEAD_REACH, 0.92 / 0.94 of 1.3 (1.27), by rig.measured().
ROOM = 0.92
SUNK = -0.005  # how far under the ground what a hand holds may dip between frames (kept_between())
GIVE = 0.005  # how much deeper than the clip kept_between() may take a hand into the head or chest's hull


def made(rig, clip, spec):
    """The Clip a Rig's spec gives for `clip`, as Rig makes it: a style's name, with or without
    options, its attack or cast retimed to the unit's Timing (timed()); or a function of the rig, which
    times its own clip. An attack's or a cast's options may give `begin`, how far into the style's first
    key the retimed clip begins (Timing below)."""
    if callable(spec):
        return spec(rig)
    name, options = (spec, {}) if isinstance(spec, str) else spec
    styles = STYLES.get(clip, {})
    if name not in styles:
        raise RuntimeError(f'no "{name}" style for {clip}; the library has {", ".join(sorted(styles))}')
    options = dict(options)
    begin = options.pop('begin', None) if clip in ('attack', 'cast') else None
    made_clip = styles[name](rig, **options)
    if begin is not None:
        made_clip.begin = begin
    return timed(rig, clip, made_clip)


# Timing ----------------------------------------------------------------------------------------
#
# A style keys an attack's blow or shot on frame 3 (BLOW) and a cast's height on a frame of its own, 3 to
# 6, each after a short wind-up, a few frames of drawing back or gathering from a first frame already
# drawn back: as the sim had blows land on their attack and abilities on their cast. The sim now lands a
# melee blow 7 frames after its attack, and an ability at the end of its wind-up, 11 to 18 frames after
# its cast (docs/viewer-spec.md section 4, Rigs and clips). timed() fits each clip a style makes to its
# unit's Timing (rig.timing()), so every style keeps its keys and a unit's own timing comes from the sim:
#
# - A ranged attack's shot still leaves on frame 3: the clip is as keyed.
# - A melee attack draws back for the 4 frames more the blow now waits: it starts BEGIN of the way from
#   rest to the style's first key (BEGIN), drawn back, and eases into it by frame 4; then the style plays on at
#   its own pace, so the blow, as fast as keyed, lands on frame 7, and the clip is 4 frames longer.
# - A spec's `begin` (made()) starts it that far into its first key instead, 1 for already there: for a
#   style whose first key is so far from rest that on the way what the hand holds passes through the body.
# - A cast reaches the frame it releases on (its height, or for a unit whose ability dashes or charges
#   the frame its style springs on, `off`) at the end of its wind-up: it starts BEGIN of the way into the
#   style's first key and eases into it over half of the wind-up before the last FAST frames; the style's
#   frames up to those then play slowly over the rest of it, a staff raised or a bow drawn at leisure; and
#   its last FAST frames, the blow, the loose or the stamp, at their own pace. Its hits, and FOLLOW frames
#   after the last, play at their own pace too, so a flurry still looses every 3 frames; and the rest,
#   the recovery, is drawn in if it must be to keep the clip within a second (LONGEST).

BEGIN = 0.35  # how far a retimed clip begins into its style's first key, a share of the way from rest
FAST = 2  # the frames before a cast's release that keep their pace: the blow, the loose, the stamp
FOLLOW = 4  # the frames after a cast's last hit that keep their pace: its follow-through
LONGEST = {'attack': 27, 'cast': 30}  # the most frames each may last (rig.LENGTHS: 0.9 and 1 s)


def at_rest(rig, name, value):
    """A channel's value in the rest pose: rig.rest's, or for one of a bone's own (`string_at`) none."""
    if name in rig.rest:
        return rig.rest[name]
    if isinstance(value, Quaternion):
        return Quaternion()
    if isinstance(value, (int, float)):
        return 0.0
    return V(0, 0, 0)


def timed(rig, clip, made_clip):
    """An attack or a cast a style made, `made_clip`, fitted to the unit's Timing (Timing above); any
    other clip as made."""
    t = rig.timing
    if t is None or clip not in ('attack', 'cast'):
        return made_clip
    marks = made_clip.marks
    if clip == 'attack':
        keyed = marks['strike']
        if not t.melee:  # a shot leaves on frame 3, as keyed
            if keyed != t.strike:
                raise RuntimeError(f'a ranged attack is keyed to loose on frame {t.strike}, not {keyed}')
            return made_clip
        return retimed(rig, made_clip, keyed, t.strike, lead=t.strike - keyed, fast=keyed, last=keyed,
                       longest=LONGEST[clip], marks={'strike': t.strike})
    keyed = marks.get('off') if t.dash else marks['height']
    if keyed is None:
        raise RuntimeError(f'{t.unit}\'s ability sets off on a dash or charge at its release, so its cast style '
                           f'must mark the frame it springs on (`off`)')
    hits = made_clip.hits if made_clip.hits is not None else [keyed]
    if len(hits) != len(t.hits) or hits[0] != keyed or any(b - a != t.hits[1] - t.hits[0] for a, b in zip(hits, hits[1:])):
        raise RuntimeError(f'{t.unit}\'s cast must strike or loose {len(t.hits)} times, every '
                           f'{t.hits[1] - t.hits[0] if len(t.hits) > 1 else 0} frames, not on frames {hits}')
    fast = min(FAST, keyed)
    new = {'height': t.release, **({'off': t.release} if t.dash else {})}
    return retimed(rig, made_clip, keyed, t.release, lead=round(0.5 * (t.release - fast)), fast=fast,
                   last=hits[-1], longest=LONGEST[clip], marks=new, hits=[t.release + h - keyed for h in hits])


def retimed(rig, made_clip, keyed, at, lead, fast, last, longest, marks, hits=None):
    """`made_clip` with its frame `keyed` moved to `at`: from BEGIN of the way into its first key (or its own `begin`), easing into
    it by frame `lead`; its frames up to `fast` before `keyed` drawn out over the frames from there to
    `fast` before `at`; and its last `fast` frames to `keyed`, those on to FOLLOW after `last`, and the
    rest at their own pace, the rest drawn in only as far as it must be to last no more than `longest`."""
    n = made_clip.frames
    pose = made_clip.pose
    end = min(last + FOLLOW, n)
    frames = min(longest, at + n - keyed)
    knots = [(lead, 0.0), (at - fast, keyed - fast), (at, keyed), (at + end - keyed, end), (frames, n)]
    if not lead <= at - fast or knots[3][0] > frames:
        raise RuntimeError(f'a clip keyed to {keyed} can\'t be retimed to {at} within {longest} frames')
    first = pose(0)
    start = {name: at_rest(rig, name, value) for name, value in first.items()}

    def keyed_frame(f):
        """The style's frame shown at frame f, from frame `lead` on."""
        for (f0, s0), (f1, s1) in zip(knots, knots[1:]):
            if f <= f1:
                return s0 if f1 == f0 else s0 + (s1 - s0) * (f - f0) / (f1 - f0)
        return float(n)

    share = BEGIN if made_clip.begin is None else made_clip.begin

    def drawing_back(f):
        u = share + (1 - share) * EASES['out'](f / lead)
        return {name: mix(name, start[name], value, u) for name, value in first.items()}

    # On the way into the first key, kept out of the ground, as the style keeps its own frames.
    drawing_back = mount_grounded(rig, Steed(rig), drawing_back) if rig.mount else grounded(rig, drawing_back)

    def retimed_pose(f):
        return pose(keyed_frame(f)) if f >= lead else drawing_back(f)

    return Clip(frames, retimed_pose, made_clip.loop, marks, hits)


def fit(clips, room=ROOM, pole=None, free=(), bow=None, between=False, **holding_options):
    """A Rig's clips, `{clip: spec}` as Rig takes them, each fitted to the model (above): back comes
    a function of the rig for each. `holding_options` go to holding(). With `bow`, the hand holding a
    bow the model stands at full draw with, the drawing hand stays on the string or lets it down
    (strung(), An archer at the draw below). With `between`, what the hands hold is kept in the clip's
    room and out of the ground between frames too, as the client shows them (kept_between()): for a
    fast blow, whose arm turns so far in a frame that it would swing what it holds out between two.
    An attack's or a cast's room reaches further ahead (rig.ACTIONS, rig.measured())."""

    def fitted(rig, clip, spec):
        clip_ = made(rig, clip, spec)
        pose = clip_.pose
        ahead = clip in ACTIONS
        if pole is not None and clip not in free:
            pose = holding(rig, clip, clip_, pole, **holding_options)
        pose = kept(rig, pose, room, ahead)
        if between:
            pose = kept_between(rig, clip_.with_pose(pose), room, ahead=ahead)
        if bow is not None:  # once the bow hand is kept in, so the drawing hand stays on the string
            pose = strung(rig, clip, clip_.with_pose(pose), bow)
        return clip_.with_pose(pose)

    return {clip: (lambda rig, clip=clip, spec=spec: fitted(rig, clip, spec)) for clip, spec in clips.items()}


def posed(rig, motions, bone):
    """Where the vertices that follow `bone` are in a pose's motions: an array of (x, y, z) rows."""
    points = rig.points(bone)
    if not len(points):
        return points
    m = motions[bone]
    return (points - np.array(m.head)) @ np.array(m.turn.to_matrix()).T + np.array(m.at)


def moving_hand(rig, motions, ch, s, shift):
    """How far to move hand `s`'s target, in the frame it is given in (the chest's, the model's, or
    between them by `hand_s_world`), to move the hand by `shift` in the model's frame."""
    w = float(ch.get(f'hand_{s}_world', 0.0))
    chest = np.array(motions['spine'].turn.to_matrix())
    seat = np.array(motions[rig.seat].turn.to_matrix())
    return Vector(np.linalg.solve((1 - w) * chest + w * seat, np.array(shift)))


def below(rig, bone):
    """`bone` and every bone that hangs from it, such as the string and the arrow on a bow hand."""
    out = [bone]
    for name, (parent, _, _) in rig.bones.items():
        if parent in out and name not in out:
            out.append(name)
    return out


def kept(rig, pose, room=ROOM, ahead=False):
    """A clip's pose function with, in every frame, each hand that reaches for a target drawn in as
    far as it must to keep what it holds (the parts on it and on the bones hanging from it) `room`
    from the centre, and lifted as far as it must to keep them out of the ground. With `ahead`, for an
    attack or a cast, how far is measured against the clip's room ahead (rig.measured()), so what the
    hand holds may reach further straight ahead."""
    held = {s: below(rig, f'hand_{s}') for s in ('l', 'r')}

    def fitted(frame):
        ch = pose(frame)
        for s in ('l', 'r'):
            key = f'hand_{s}_at'
            if key not in ch:
                continue
            for _ in range(6):
                motions = rig.solve(ch)
                p = np.concatenate([posed(rig, motions, b).reshape(-1, 3) for b in held[s]])
                if not len(p):
                    break
                radii = measured(p, ahead)
                i = int(radii.argmax())
                far = float(radii[i])
                shift = V(0, 0, 0)
                if far > room + 1e-6:  # drawn in towards the centre, which keeps it in the wedge ahead or out of it
                    shift -= (far - room + 1e-4) / far * V(float(p[i, 0]), float(p[i, 1]), 0)
                low = float(p[:, 2].min())
                if low < -TOUCH:
                    shift += V(0, 0, -low)
                if shift.length < 1e-6:
                    break
                ch[key] = Vector(ch[key]) + moving_hand(rig, motions, ch, s, shift)
        return ch

    return fitted


def hull_of(points):
    """The convex hull of some points, as the normals and offsets of its faces' planes, each normal
    turned out: a point p is inside by min(offsets - normals @ p), below 0 outside."""
    import bmesh  # noqa: PLC0415, Blender's own

    bm = bmesh.new()
    for p in points:
        bm.verts.new(tuple(p))
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bm.normal_update()
    middle = Vector(np.asarray(points).mean(axis=0))
    normals, offsets = [], []
    for face in bm.faces:
        normal = face.normal.normalized()
        if normal.length < 0.5:
            continue
        offset = normal.dot(face.verts[0].co)
        if offset - normal.dot(middle) < 0:  # turned in: turn it out
            normal, offset = -normal, -offset
        normals.append(tuple(normal))
        offsets.append(offset)
    bm.free()
    return np.array(normals), np.array(offsets)


def kept_between(rig, clip, room=ROOM, steps=BETWEEN, floor=SUNK, bend=150.0, ahead=False):
    """A clip's pose function kept in the hex, or with `ahead`, for an attack or a cast, in its room
    ahead too (rig.measured(), as kept() takes it), and out of the ground between its frames too, as
    the client shows them (Rig.between()). Three.js turns each bone the short way round from one frame
    to the next, so an arm that swings far in one frame, as a blow does between its last frame drawn
    back and the frame it lands on, carries what its hand holds round in an arc about the shoulder,
    reaching further out than on either frame, which fit() keeps in the hex: a long weapon can reach
    outside the hex between two frames that keep inside. And a mount's leg folding fast can dip a
    hoof into the ground.

    Wherever, at `steps` steps from each frame to the next, what a hand holds would reach outside the
    hex, the arm is moved on the frames either side, a few degrees at a time and by the same on both,
    in whichever of three ways brings it in most (turned_arm()): the elbow bent further, the hand
    drawn in towards the shoulder about it (`tuck`, to `bend` degrees from straight at most); the
    hand, and what it holds, turned about the elbow's axis (`wrist`); or the whole arm turned about
    the chest's upright through the shoulder (`swing`). Each turns every bone of the arm by the same
    amount on both frames, so the arc between them keeps its shape and only comes in: re-placing the
    hand by IK instead would change how far each bone turns, and a blow that turns near half a circle
    in a frame would then swing the short way round, backwards. No move may take what the hand holds
    out further between other frames, or take the hand, or what it holds, more than GIVE into the
    convex hull of the head or of the chest (every part on `spine`: a rougher test than clash.py's,
    which takes only the chest's material and the surface), or GIVE deeper than the clip already
    takes it; so a blow drawn back close by the head may stay a
    little outside the hex between frames, and finish() says so. Wherever what a hand holds would go
    more than `floor` under the ground between frames, the hand is lifted on the frames either side,
    the nearer more; and wherever a mount's lower leg or foot would, the mount is lifted whole, its
    rider on it and the feet it places with it."""
    from kit import HEX_RADIUS  # noqa: PLC0415, as rig.py imports it

    n = clip.frames
    held = {s: below(rig, f'hand_{s}') for s in ('l', 'r')}
    legs = {} if rig.mount is None else {leg: list(chain[1:]) for leg, chain in rig.mount.legs.items()}
    frames = [clip.pose(f) for f in range(n + 1)]
    motions = [rig.solve(ch) for ch in frames]

    def hands(f):
        return [s for s in ('l', 'r') if all(f'hand_{s}_at' in frames[g] for g in (f, f + 1))]

    def held_at(between, s):
        return np.concatenate([posed(rig, between, b).reshape(-1, 3) for b in held[s]])

    def model_at(m, ch, s):
        """Where hand `s`'s target is in the model's frame, as solve() places it: it may be out of
        reach, beyond the wrist."""
        target = Vector(ch[f'hand_{s}_at'])
        seat = m[rig.seat](target) if rig.seat != 'root' else target
        return m['spine'](target).lerp(seat, float(ch.get(f'hand_{s}_world', 0.0)))

    def frame_of(m, ch, s):
        """The turn that takes hand `s`'s channels, which are given in the chest's frame, the model's or
        between them (`hand_s_world`), to the model's."""
        seat = m[rig.seat].turn if rig.seat != 'root' else Quaternion()
        return m['spine'].turn.slerp(seat, float(ch.get(f'hand_{s}_world', 0.0)))

    def turned_arm(g, s, kind, degrees):
        """Moves hand `s`'s arm on frame g, in a way that turns each of its bones by the same amount on
        any frame it is used on, so the arc to the next frame keeps its shape: `tuck` bends the elbow,
        the hand drawn in about it towards the shoulder, what it holds still pointing as it did;
        `wrist` turns the hand, and what it holds, about the elbow's axis; `swing` turns the whole arm
        about the chest's upright through the shoulder. False if the elbow can't bend that far."""
        upper, lower, end = LIMBS[f'arm_{s}']
        m, ch = motions[g], frames[g]
        hinge = m[upper].turn @ rig._hinge(f'arm_{s}')  # the way the elbow bends, as the IK bends it
        if kind == 'tuck':
            along, ahead = m[lower].at - m[upper].at, m[end].at - m[lower].at
            now = math.degrees(along.angle(ahead)) if along.length > 1e-9 and ahead.length > 1e-9 else 0.0
            if now + degrees > bend:
                return False
            to = m[lower].at + Quaternion(hinge, math.radians(degrees)) @ ahead
            ch[f'hand_{s}_at'] = Vector(ch[f'hand_{s}_at']) + moving_hand(rig, m, ch, s, to - model_at(m, ch, s))
        else:
            axis = hinge if kind == 'wrist' else m['spine'].turn @ V(0, 0, 1)
            q = Quaternion(axis, math.radians(degrees))
            frame = frame_of(m, ch, s)
            aim = Quaternion(ch.get(f'hand_{s}_aim', Quaternion()))
            ch[f'hand_{s}_aim'] = frame.inverted() @ q @ frame @ aim
            if kind == 'swing':
                shoulder = m[upper].at
                at = model_at(m, ch, s)
                ch[f'hand_{s}_at'] = Vector(ch[f'hand_{s}_at']) + moving_hand(rig, m, ch, s, shoulder + q @ (at - shoulder) - at)
                pole = Vector(ch.get(f'elbow_{s}', rig.rest[f'elbow_{s}']))
                ch[f'elbow_{s}'] = pole + moving_hand(rig, m, ch, s, q @ (frame @ pole) - frame @ pole)
        motions[g] = rig.solve(ch)
        return True

    hulls = [(b, hull_of(rig.points(b))) for b in ('head', 'spine') if len(rig.points(b)) >= 4]

    def gap(f, s):
        """How deep hand `s`, and what it holds, go into the convex hull of the head or the chest
        (the parts on `spine`), on frames f and f + 1 and halfway between them, as clash.py measures
        it: below 0 when they stay out of both."""
        deep = -math.inf
        for pose in (motions[f], rig.between(motions[f], motions[f + 1], 0.5), motions[f + 1]):
            p = held_at(pose, s)
            for b, (normals, offsets) in hulls:
                m = pose[b]  # each point where it would be on the model as built, to test it there
                q = (p - np.array(m.at)) @ np.array(m.turn.to_matrix()) + np.array(m.head)
                deep = max(deep, float((offsets[None, :] - q @ normals.T).min(axis=1).max()))
        return deep

    def reach(f, s):
        """How far from the centre what hand `s` holds reaches between frames f and f + 1, and on
        them, measured against the clip's room (rig.measured())."""
        far = 0.0
        for step in range(steps + 1):
            between = motions[f + step // steps] if step in (0, steps) else rig.between(motions[f], motions[f + 1], step / steps)
            p = held_at(between, s)
            if len(p):
                far = max(far, float(measured(p, ahead).max()))
        return far

    # Moved in, a little at a time, the furthest first, by whichever way brings it in most without
    # taking anything near it out further, as far as `limits` let each way go.
    limits = {'tuck': bend, 'wrist': 40.0, 'swing': 30.0}
    used = {}  # (frame, hand, way): degrees so far, either way round
    first = {}  # (frame, hand): how deep the clip as made takes the hand into the head or chest (gap())
    stuck = set()
    for _ in range(200):
        over = [(reach(f, s), f, s) for f in range(n) for s in hands(f) if (f, s) not in stuck]
        over = [o for o in over if o[0] > HEX_RADIUS]
        if not over:
            break
        far, f, s = max(over)
        near = [i for i in (f - 1, f + 1) if 0 <= i < n and s in hands(i)]
        before = {i: reach(i, s) for i in near}
        clear = {i: max(first.setdefault((i, s), gap(i, s)), 0.0) + GIVE for i in (f - 1, f, f + 1)
                 if 0 <= i < n and s in hands(i)}
        saved = [(g, dict(frames[g]), motions[g]) for g in (f, f + 1)]
        best = None
        for step in (min(6.0, max(2.0, 50.0 * (far - room))), 1.5, 0.5):  # finer where coarser won't do
            for kind, degrees in (('tuck', step), ('wrist', step), ('wrist', -step), ('swing', step), ('swing', -step)):
                if any(abs(used.get((g, s, kind), 0.0) + degrees) > limits[kind] for g in (f, f + 1)):
                    continue
                if all(turned_arm(g, s, kind, degrees) for g in (f, f + 1)):
                    now = reach(f, s)
                    if now < far - 1e-4 and all(reach(i, s) <= max(before[i], HEX_RADIUS) for i in near) \
                            and all(gap(i, s) <= c for i, c in clear.items()):
                        if best is None or now < best[0]:
                            best = (now, kind, degrees, [(g, dict(frames[g]), motions[g]) for g in (f, f + 1)])
                for g, ch, m in saved:
                    frames[g], motions[g] = dict(ch), m
            if best is not None:
                break
        if best is None:
            stuck.add((f, s))
            continue
        _, kind, degrees, done = best
        for g, ch, m in done:
            frames[g], motions[g] = ch, m
            used[(g, s, kind)] = used.get((g, s, kind), 0.0) + degrees

    # Lifted out of the ground.
    for _ in range(24):
        shifts = {}  # (frame, what moves): how far to lift it

        def push(f, u, key, rise):
            for g, share in ((f, 2 * (1 - u)), (f + 1, 2 * u)):
                if min(1.0, share) * rise > shifts.get((g, key), 0.0):
                    shifts[(g, key)] = min(1.0, share) * rise

        for f in range(n):
            for step in range(1, steps):
                u = step / steps
                between = rig.between(motions[f], motions[f + 1], u)
                for s in hands(f):
                    p = held_at(between, s)
                    if len(p) and float(p[:, 2].min()) < floor:
                        push(f, u, f'hand_{s}_at', floor - float(p[:, 2].min()) + 1e-4)
                if legs:
                    low = min(float(posed(rig, between, b)[:, 2].min()) for bones in legs.values() for b in bones)
                    if low < floor:
                        push(f, u, 'mount', floor - low + 1e-4)
        if not shifts:
            break
        for (g, key), rise in sorted(shifts.items()):
            ch = frames[g]
            if key.startswith('hand_'):
                ch[key] = Vector(ch[key]) + moving_hand(rig, motions[g], ch, key[5], V(0, 0, rise))
                kept(rig, lambda _, ch=ch: ch, room, ahead)(g)
            else:  # the mount's body, which hangs from the root, and the feet it places on the ground
                for name in ['mount_body_at'] + [f'mount_{leg}_at' for leg in legs if f'mount_{leg}_at' in ch]:
                    ch[name] = Vector(ch.get(name, (0, 0, 0))) + V(0, 0, rise)
            motions[g] = rig.solve(ch)

    def fitted(frame):
        if frame == int(frame) and 0 <= frame <= n:
            return {name: value.copy() if hasattr(value, 'copy') else value for name, value in frames[int(frame)].items()}
        return clip.pose(frame)

    return fitted


def tweened(clips, only=None, room=ROOM):
    """A Rig's clips, `{clip: spec}` as Rig takes them, kept in their room and out of the ground
    between frames as well as on them (kept_between()), for a script that doesn't fit() its clips: all
    of them, or those named in `only`, an attack or a cast in its room ahead too (rig.ACTIONS). Back
    comes a function of the rig for each, as fit() gives."""

    def wrapped(rig, clip, spec):
        made_clip = made(rig, clip, spec)
        if only is not None and clip not in only:
            return made_clip
        return made_clip.with_pose(kept_between(rig, made_clip, room, ahead=clip in ACTIONS))

    return {clip: (lambda rig, clip=clip, spec=spec: wrapped(rig, clip, spec)) for clip, spec in clips.items()}


class Pole:
    """A pole one hand holds stood on the ground beside the body: a standard, a banner or a staff,
    bound to the hand, which hold() describes from its grip up to its top. Channels for the hand,
    planting it, carrying it, lifting it or leaning it."""

    def __init__(self, rig, hand):
        held = rig.held(hand)
        if held is None:
            raise RuntimeError(f'hand_{hand} holds no pole: say what it holds with hold()')
        self.hand = hand
        self.grip, self.top, self.axis, _ = held
        points = rig.points(f'hand_{hand}')
        low = float(points[:, 2].min())
        self.butt = self.grip + self.axis * ((low - self.grip.z) / self.axis.z)  # on its line, on the ground
        self.length = float(((points - np.array(self.butt)) @ np.array(self.axis)).max())  # to its highest part
        self.wrist = rig.joint(f'wrist_{hand}')
        self.elbow = rig.rest[f'elbow_{hand}']

    def channels(self, at, turn, world=1.0):
        h = self.hand
        return {f'hand_{h}_at': Vector(at), f'hand_{h}_aim': Quaternion(turn), f'hand_{h}_world': world,
                f'elbow_{h}': self.elbow.copy()}

    def planted(self):
        """Where it stands, whatever the body does: the hand where it rests, in the model's frame."""
        return self.channels(self.wrist, Quaternion())

    def lifted(self, rise):
        """Lifted straight up by `rise`, in the model's frame."""
        return self.channels(self.wrist + V(0, 0, rise), Quaternion())

    def carried(self, rise, tip):
        """Carried on the chest's frame, lifted by `rise` and its top tipped `tip` degrees forward."""
        return self.channels(self.wrist + V(0, 0, rise), turn_of((tip, 0, 0)), world=0.0)

    def leaning(self, butt, lean, way):
        """Its butt at `butt`, on the ground, and leaning `lean` degrees from upright towards `way`, a
        direction across the ground."""
        way = V(way[0], way[1], 0).normalized()
        axis = math.cos(math.radians(lean)) * V(0, 0, 1) + math.sin(math.radians(lean)) * way
        turn = self.axis.rotation_difference(axis)
        return self.channels(Vector(butt) + turn @ (self.wrist - self.butt), turn)


def holding(rig, clip, made_clip, hand, rise=0.12, tip=8.0, clear=0.05, fall=48.0, ahead=0.95, aside=0.42):
    """A clip's pose function (`made_clip`, a Clip of `clip`) with hand `hand` holding a pole stood on
    the ground (fit()): planted where it stands in `idle`, `attack`, `cast` and `stun`; in `move`
    carried on the chest's frame, tipped `tip` degrees forward and lifted by `rise`, or more if a
    frame would bring it within `clear` of the ground; in `death`, once struck, tipping over as the
    body goes down until it leans `fall` degrees, its top coming down ahead and in (`ahead` of a
    turn towards the front) and its butt sliding back along the ground, so it ends across the hex
    beside the body, `aside` from its middle; in `victory` lifted by `rise` as the weapon goes up."""
    p = Pole(rig, hand)
    pose, n = made_clip.pose, made_clip.frames

    def with_(f, channels):
        ch = pose(f)
        ch.update(channels)
        return ch

    if clip == 'move':
        lift = rise
        for _ in range(4):
            low = min(rig.lowest(with_(f, p.carried(lift, tip)), [f'hand_{hand}']) for f in range(n + 1))
            if low >= clear - 1e-4:
                break
            lift += clear - low
        return lambda f: with_(f, p.carried(lift, tip))
    if clip == 'death':
        side = 1.0 if p.butt.x >= 0 else -1.0
        way = V(-side * math.sqrt(max(0.0, 1 - ahead * ahead)), -ahead, 0)
        beside = side * V(-way.y, way.x, 0)  # square to it, towards the pole's side
        span = p.length * math.sin(math.radians(fall))
        butt = aside * beside - span / 2 * way
        struck = 2

        def falling(f):
            u = EASES['in'](min(max((f - struck) / (n - struck), 0.0), 1.0))
            return with_(f, p.leaning(p.butt.lerp(butt, u), fall * u, way))

        return falling
    if clip == 'victory':
        return lambda f: with_(f, p.lifted(rise * EASES['smooth'](min(max((f - 3) / 7, 0.0), 1.0))))
    return lambda f: with_(f, p.planted())


# A captain's cast ------------------------------------------------------------------------------


@style('cast', 'rally')
def rally(rig, hand='r', seconds=0.8, height=4, low=1.0, steep=0.0, out=0.0, lead=0.0, elbow=0.0):
    """A Captain's blow and rally: drawn far back, a great overhand blow down in front with the body
    thrown behind it, at its height on frame `height`; then the weapon swept back up and thrust high
    overhead, chest out and head up, held a moment to rally the allies round, and lowered. `low` (0
    to 1) is how far down in front the blow ends, as chop's. For a long blade, `steep` and `out` turn
    the blow, and the rebound after it, that many degrees further down and towards its own side, as
    chop's do: a long blade levelled in front reaches out of the hex, so fit() draws the hand in
    until the fist is in the chest, and the blade then sweeps up through the body to the rally.
    `lead` turns the frame before the blow that share of `steep` and `out` as well, as chop turns its
    frame before the blow by half of them, so a long blade turns less in the one frame it comes down
    in, and doesn't sweep out of the hex between the two as the client shows them. `elbow` (0 to 1)
    brings the elbow forward and down on the frame before the blow, leading the blade, as chop's does
    (leading_elbow())."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())

    def blow(theta, at, elbow, yaw=0.0):
        aim, face = arc(theta, b.yaw(yaw))
        return b.arm(hand, at, b.rig.aim(hand, aim, face), elbow, world=1.0)

    def up(theta, height_, out_=0.08):
        aim, _ = arc(theta)
        return b.arm(hand, b.near(out_, -0.05, height_), b.rig.aim(hand, aim, b.out(1, 0, 0)), (0.9, 0.2, -0.3),
                     world=1.0)

    # Drawn far back over the shoulder, the body turned and rearing back.
    k.key(0, **blow(-50, b.near(0.0, 0.16, 0.74), (0.8, 0.2, -0.4), yaw=-10), hips_at=V(0, 0.015, -0.035 * leg),
          hips=V(-3, 0, b.yaw(7)), spine=V(-12, 0, b.yaw(18)), head=V(6, 0, b.yaw(-10)), cape=V(-6, 0, 0),
          **b.arm(off, b.wrist(off, 0.0, -0.1, 0.05)))
    # Over the top, gathering speed.
    k.key(height - 2, 'in', **blow(15, b.near(-0.05, -0.2, 0.88), (0.8, 0.3, -0.2), yaw=-4), hips=V(0, 0, b.yaw(2)),
          spine=V(-4, 0, b.yaw(5)))
    k.key(height - 1, 'in', **blow(66 + lead * steep, b.near(-0.15, -0.55, 0.55), leading_elbow(elbow), yaw=lead * out),
          hips=V(2, 0, b.yaw(-3)),
          spine=V(9, 0, b.yaw(-6)), hips_at=V(0, -0.01, -0.07 * leg))
    # The blow, harder and lower than an attack's: down in front, the body thrown over it.
    k.key(height, 'in', **blow(110 + 10 * low + steep, b.near(-0.25, -0.95, -0.35 * low), (0.6, 0.5, -0.5),
                               yaw=6 + out),
          hips=V(5, 0, b.yaw(-7)), spine=V(20, 0, b.yaw(-14)), hips_at=V(0, -0.03, -0.12 * leg),
          head=V(-10, 0, b.yaw(6)), cape=V(12, 0, 0), **b.arm(off, b.wrist(off, 0.06, 0.14, -0.04)))
    k.key(height + 2, 'out', **blow(104 + 8 * low + steep, b.near(-0.25, -0.88, -0.28 * low), (0.6, 0.5, -0.5),
                                    yaw=6 + out),
          spine=V(18, 0, b.yaw(-12)), hips_at=V(0, -0.025, -0.11 * leg))
    # Swept back up and thrust high overhead, the chest out and the head up: the rally, held.
    k.key(height + 8, 'out', **up(-8, 1.0), hips_at=V(0, 0, 0.01 * leg), hips=V(0, 0, 0), spine=V(-9, 0, b.yaw(3)),
          head=V(-14, 0, 0), cape=V(8, 0, 0), **b.arm(off, b.wrist(off, 0.12, 0.02, 0.06)))
    k.key(n - 6, **up(-3, 0.97), hips_at=V(0, 0, 0.005 * leg), spine=V(-7, 0, b.yaw(2)), head=V(-11, 0, 0),
          cape=V(3, 0, 0))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'height': height})


@style('cast', 'horn')
def horn(rig, hand='l', seconds=0.8, height=5, lift=8.0):
    """A horn sounded: a breath drawn, then the horn in `hand` raised and its mouthpiece put to the
    lips, the body drawn up tall, chest out and head thrown back, its bell tipped `lift` degrees
    further up, at its height on frame `height` and held while it sounds; then lowered. The weapon
    in the other hand is held out to the side. The script marks the horn's mouthpiece (`mouthpiece`)
    and the lips (`mouth`) with joint(); the horn goes with the head as it sounds, so it stays at the
    lips whatever the head does."""
    if 'mouth' not in rig.joints or 'mouthpiece' not in rig.joints:
        raise RuntimeError('the horn style needs the joints "mouth" and "mouthpiece" marked')
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    mouth, piece, wrist = rig.joint('mouth'), rig.joint('mouthpiece'), rig.joint(f'wrist_{hand}')
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    # A breath drawn, a little crouched, the weapon drawn in.
    k.key(2, hips_at=V(0, 0, -0.04 * leg), spine=V(5, 0, 0), head=V(5, 0, 0), cape=V(-2, 0, 0),
          **b.arm(off, b.wrist(off, 0.02, 0.04, -0.02)))
    # Sounding: drawn up tall, chest out and head thrown back, the weapon held out to the side.
    k.key(height, 'out', hips_at=V(0, 0, 0.012 * leg), hips=V(-2, 0, 0), spine=V(-9, 0, b.yaw(-4)),
          head=V(-14, 0, b.yaw(-6)), cape=V(6, 0, 0), **b.arm(off, b.wrist(off, 0.16, 0.02, 0.1), b.tip(-14)))
    k.key(n - 7, hips_at=V(0, 0, 0.01 * leg), spine=V(-8, 0, b.yaw(-3)), head=V(-12, 0, b.yaw(-5)), cape=V(3, 0, 0),
          **b.arm(off, b.wrist(off, 0.15, 0.02, 0.09), b.tip(-12)))
    k.key(n, **b.still())
    # How far the horn is from where it rests on the chest to the lips.
    at_lips = Keys().key(1, u=0.0).key(height, 'out', u=1.0).key(n - 6, u=1.0).key(n, 'smooth', u=0.0)
    lifted = turn_of((-lift, 0, 0))

    def pose(f):
        ch = k(f)
        u = at_lips.value('u', f)
        if u > 0:
            motions = rig.solve(ch)
            chest, head = motions['spine'], motions['head']
            sounding = head.turn @ lifted
            lips = head(mouth)
            at = lips - sounding @ (piece - wrist)
            ch[f'hand_{hand}_at'] = chest(wrist).lerp(at, u)
            ch[f'hand_{hand}_aim'] = chest.turn.slerp(sounding, u)
            ch[f'hand_{hand}_world'] = 1.0
            ch[f'elbow_{hand}'] = chest.turn @ b.rest[f'elbow_{hand}']  # as it points on the chest
        return ch

    return Clip(n, pose, marks={'height': height})


@style('cast', 'bash')
def bash(rig, hand='r', seconds=0.7, height=4):
    """A shield bash with the shield on the other arm: drawn in against the chest, edge on, the body
    wound away and low; then driven straight ahead, its face square to the front, the body and the
    hips behind it, at its height on frame `height`; held a moment, and brought back on guard. The
    weapon is drawn back, ready to follow up."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    square = b.aim((0.08, 0.0, 1.0), (0.0, -1.0, 0.0), off)  # upright, its face to the front
    # Wound up: the shield drawn in against the chest, turned edge on, the body turned well away from
    # the blow, leaning back over the back foot and low.
    k.key(0, **b.arm(off, b.near(-0.05, -0.35, -0.45, off), b.aim((0.1, 0.15, 1.0), (0.8, -0.6, 0.0), off),
                     (0.9, 0.2, -0.5), world=1.0),
          **b.arm(hand, b.wrist(hand, 0.05, 0.16, 0.08), b.tip(-14)), hips_at=V(0, 0.06 * leg, -0.08 * leg),
          hips=V(-2, 0, b.yaw(-12)), spine=V(-6, 0, b.yaw(-24)), head=V(6, 0, b.yaw(16)), cape=V(-6, 0, 0))
    # Driven forward, square, the whole body thrown behind it.
    k.key(height, 'in', **b.arm(off, b.near(-0.25, -0.98, -0.3, off), square, (0.8, 0.1, -0.6), world=1.0),
          hips_at=V(0, -0.17 * leg, -0.09 * leg), hips=V(4, 0, b.yaw(10)), spine=V(18, 0, b.yaw(20)),
          head=V(-12, 0, b.yaw(-12)), cape=V(12, 0, 0))
    k.key(height + 3, 'out', **b.arm(off, b.near(-0.25, -0.92, -0.28, off), square), hips_at=V(0, -0.15 * leg, -0.085 * leg),
          spine=V(15, 0, b.yaw(17)))
    k.key(n - 6, **b.arm(off, b.near(-0.2, -0.72, -0.32, off), square), hips_at=V(0, -0.06 * leg, -0.05 * leg),
          spine=V(6, 0, b.yaw(7)), hips=V(1, 0, b.yaw(3)))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{off}_world': 1.0})
    return Clip(n, k, marks={'height': height})


# An archer at the draw -------------------------------------------------------------------------
#
# An archer built at full draw (Faramir, the Elves' and the Orcs' archers) stands with the drawing
# hand at the nock. Two bones of its own move what a rigid bow can't: the middle of the string, on
# `string` (hanging from the bow hand, from the nock at full draw to where the string rests let down),
# which the string's two halves follow at the nock (bone(follows=...)); and the nocked arrow, on
# `arrow` (hanging from the bow hand too, from the nock to the point), which goes with the string
# while it is drawn, goes to the quiver when it is loosed, and stays in the drawing hand's fingers
# when the string is let down, but in a death falls with the bow. The string's tail (`loose`) lies on
# the straight line between the bow's tips, which the bow stands on (Bow.chord). The joints
# `quiver_mouth` and `quiver_foot` mark the quiver an arrow is drawn from. fit(bow=...) keeps the
# drawing hand on the string in `idle` and `move`, and lets the string down in `stun`, `death` and
# `victory`; the shot, `attack` and `cast`, is drawn_shot()'s, and `aloft` is an archer's victory.


def degrees_of(turn):
    """A turn as the (pitch, tilt, yaw) degrees a bone's channel takes."""
    return V(*(math.degrees(a) for a in Quaternion(turn).to_euler('XYZ')))


class Bow:
    """A bow drawn in hand `hand` as the model stands, the other hand (`draw`) at the nock, with the
    string and the arrow on the bones `string` and `arrow` if the rig has them (above)."""

    def __init__(self, rig, hand='l', string='string', arrow='arrow'):
        if rig.held(hand) is None:
            raise RuntimeError(f'hand_{hand} holds no bow: say what it holds with hold()')
        self.rig = rig
        self.hand, self.draw = hand, ('r' if hand == 'l' else 'l')
        self.string = string if string in rig.bones else None
        self.arrow = arrow if arrow in rig.bones else None
        grip, tip, axis, face = rig.held(hand)
        if self.arrow:
            _, head, tail = rig.bones[self.arrow]
            face = rig.joint(tail) - rig.joint(head)
        self.aim = face.normalized()  # where it shoots
        self.nock, self.slack = rig.joint(f'wrist_{self.draw}'), V(0, 0, 0)
        self.chord = axis  # the line the bow stands on, from tip to tip: along the string let down
        if self.string:
            _, head, tail = rig.bones[self.string]
            self.nock, self.slack = rig.joint(head), rig.joint(tail) - rig.joint(head)
            self.chord = (tip - rig.joint(tail)).normalized()
        self.wrist = rig.joint(f'wrist_{self.draw}')
        self.fist = rig.joint(f'fist_{self.draw}')
        self.elbow = rig.rest[f'elbow_{self.draw}']
        self.head = rig.joint(rig.bones[self.arrow][1]) if self.arrow else None  # the arrow's nock
        # The bow arm swings about its shoulder square to the shot (swung()).
        self.shoulder = rig.joint(f'shoulder_{hand}')
        self.bow_rest = rig.rest[f'hand_{hand}_at']  # where the bow hand rests
        self.bow_elbow = rig.rest[f'elbow_{hand}']
        level = V(self.aim.x, self.aim.y, 0).normalized()
        self.across = level.cross(V(0, 0, 1)).normalized()  # square to the shot, level: turns it up when positive
        self.worn = 'spine'  # the bone the quiver rides: the spine for one on the back, the hips for one at the hip
        self.quiver = None
        if self.arrow and 'quiver_mouth' in rig.joints and 'quiver_foot' in rig.joints:
            mouth, foot = rig.joint('quiver_mouth'), rig.joint('quiver_foot')
            down = (foot - mouth).normalized()
            _, head, tail = rig.bones[self.arrow]
            length = (rig.joint(tail) - rig.joint(head)).length
            # Stowed point down, its point a little above the quiver's foot, the nock out of its mouth.
            turn = self.aim.rotation_difference(down)
            self.quiver = (turn, foot - down * (length + 0.06))

    def strung(self, ch, s, nocked=False):
        """Sets the string `s` of the way from full draw (0) to let down (1), below 0 drawn further;
        with `nocked`, the arrow goes with it."""
        if self.string:
            ch[f'{self.string}_at'] = s * self.slack
        if self.arrow and nocked:
            ch[f'{self.arrow}_at'] = s * self.slack

    def on_string(self, ch, s, motions=None):
        """Channels for the drawing hand on the string, `s` let down as strung() takes it, as it rests
        on it at full draw: worked out from where the bow hand is."""
        motions = motions or self.rig.solve(ch)
        bow, chest = motions[f'hand_{self.hand}'], motions['spine']
        at = bow(self.wrist) + bow.turn @ (s * self.slack)
        h = self.draw
        return {f'hand_{h}_at': at, f'hand_{h}_aim': bow.turn.copy(), f'hand_{h}_world': 1.0,
                f'elbow_{h}': chest.turn @ self.elbow}

    def stowed(self, motions):
        """Where the arrow goes in its quiver, on the bone the quiver rides (`worn`): its turn, and where
        its head (the nock) goes."""
        worn = motions[self.worn]
        turn, at = self.quiver
        return worn.turn @ turn, worn(at)

    def arrow_to(self, ch, motions, turn, at):
        """Sets the arrow's channels so it goes where `turn` and `at` say, from the bow hand's motion."""
        parent = motions[self.rig.bones[self.arrow][0]]
        back = parent.turn.inverted()
        ch[self.arrow] = degrees_of(back @ turn)
        ch[f'{self.arrow}_at'] = back @ (Vector(at) - parent(self.head))

    def in_hand(self, ch, motions=None):
        """Sets the arrow's channels so it stays in the drawing hand's fingers, as it was on the string
        at full draw, wherever the hand goes."""
        motions = motions or self.rig.solve(ch)
        hand = motions[f'hand_{self.draw}']
        self.arrow_to(ch, motions, hand.turn, hand(self.head))

    def swung(self, degrees, push=0.0, drop=0.0, tip=0.0):
        """Channels for the bow hand swung `degrees` up about its shoulder (down when negative), square
        to the shot, the bow turning with the arm, as an archer raises or lowers it; pushed `push`
        along the shot, dropped `drop`, and the bow's top tipped `tip` degrees forward over the shot."""
        up = Quaternion(self.across, math.radians(degrees))
        tipped = Quaternion(self.across, math.radians(-tip))
        at = self.shoulder + up @ (self.bow_rest - self.shoulder) + push * (up @ self.aim) - V(0, 0, drop)
        h = self.hand
        return {f'hand_{h}_at': at, f'hand_{h}_aim': up @ tipped, f'elbow_{h}': up @ self.bow_elbow}

    def pointed(self, degrees, push=0.0, drop=0.0, tip=0.0, point=0.0):
        """swung()'s channels, the bow then tipped `point` degrees further forward about the nock rather
        than the hand, its arrow pointing at the ground: so the string, and a drawing hand on it, come no
        higher than the nock as the bow is drawn and raised again."""
        ch = self.swung(degrees, push, drop, tip)
        if point:
            h = self.hand
            more = self.swung(degrees, push, drop, tip + point)
            arm = self.nock - self.bow_rest  # from the bow hand's wrist to the nock
            more[f'hand_{h}_at'] = more[f'hand_{h}_at'] + ch[f'hand_{h}_aim'] @ arm - more[f'hand_{h}_aim'] @ arm
            ch = more
        return ch


def drawn_shot(rig, bow, seconds, loose, rise=0.0, recoil=1.0, string='string', arrow='arrow', mark='strike',
               deeper=0.1, quiver='back', anchor='cheek', snap=None, point=0.0, gather=1.0, wide=1.0):
    """A shot from the full draw the model stands at (Bow), loosed on frame `loose`: the draw pulled
    a little deeper, the shot raised `rise` degrees as it is held (a long, heavy shot), then loosed,
    the string snapping straight and the drawing hand flying back past the ear while the bow arm
    kicks `recoil`; then, with a quiver and an arrow bone, the hand reaches back over the shoulder,
    draws a fresh arrow from the quiver, brings it over to the string, nocks it and draws again, as
    it stands. The loosed arrow is put away in the quiver, which stands in for it flying. `mark` names
    the frame it is loosed on: an attack's `strike` or a cast's `height`.

    `deeper` is how far past the draw the model stands at the string is pulled before the loose, a
    share of its travel from there to let down (Bow.slack): a little for a model at full draw, about
    1 to draw fully one that stands half drawn. `quiver` is where the fresh arrow comes from: 'back',
    over the shoulder from a quiver on the back, or 'hip', down beside the body from a quiver hanging
    at the drawing hand's hip, which rides on the hips; the arrow comes up out of it point first.

    `anchor` is where the drawing hand holds the string: 'cheek', by the face, for the hand to fly
    back past the ear; or 'chin', under the chin and ahead of the face, as Legolas draws, where flying
    back would go through it: the hand flies out past the front of its shoulder instead, goes up
    beside the head, well out from it, to a quiver on the back, and brings the arrow down in front of
    its shoulder and across under the chin to the string. `snap`, for a body that leans over the chin,
    is where the hand flies to instead, (out, back, up) from where it rests on the string, as flurry()
    takes it.

    `point` and `gather` are for a bow drawn close before the face (Gorbag's): while the fresh arrow is
    taken and nocked, the bow is tipped forward `point` degrees more about the nock (Bow.pointed()),
    its arrow pointing at the ground, so its upper limb leans away from the face and the arrow on the
    slack string reaches less far out; and it comes in a share `gather` as far as the string is
    slack, rather than all the way, keeping it clear of the face, the drawing hand reaching out to
    the string instead.

    `wide` scales how far out to the drawing hand's side the fresh arrow swings on its way from the
    quiver to the string: less for a long arrow (Lurtz's), whose point would swing out of the hex
    between frames as the client shows them.
    """
    if quiver not in ('back', 'hip'):
        raise ValueError(f'quiver is "back" or "hip", not "{quiver}"')
    if anchor not in ('cheek', 'chin') or (anchor == 'chin' and quiver != 'back'):
        raise ValueError(f'anchor is "cheek", or "chin" with a quiver on the back, not "{anchor}"')
    w = Bow(rig, bow, string, arrow)
    if quiver == 'hip':
        w.worn = 'hips'
    b = Body(rig, bow)
    n = frames_for(seconds)
    leg = b.leg
    draw = w.draw
    bow_arm = w.swung

    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    held = loose - 1 if rise == 0 else max(1, loose - 3)
    k.key(held, 'smooth', **bow_arm(rise, 0.01), spine=V(-1.5 - 0.3 * rise, 0, 0), head=V(-0.3 * rise, 0, 0),
          hips_at=V(0, 0.005, -0.02 * leg))
    k.key(loose - 1, **bow_arm(rise, 0.012), spine=V(-1.5 - 0.3 * rise, 0, 0), head=V(-0.3 * rise, 0, 0))
    # Loosed: the bow arm kicks and the bow rolls forward in the hand; the body jolts.
    k.key(loose, 'in', **bow_arm(rise, 0.035 * recoil, 0.0, 10 * recoil), spine=V(-0.5 - 0.3 * rise, 0, 0),
          hips_at=V(0, 0.01, -0.025 * leg))
    k.key(loose + 3, 'out', **bow_arm(rise * 0.8, 0.02 * recoil, 0.02, 14 * recoil), spine=V(0, 0, 0),
          head=V(-0.2 * rise, 0, 0))
    # Lowered a little while the hand fetches an arrow, and raised again to draw.
    fetch = loose + 4  # the hand on its way to the quiver
    grab = loose + 7  # the arrow taken
    nocked = loose + 11  # on the string
    # The bow comes in to take the fresh arrow on its slack string, and is pushed out again as the
    # string is drawn, so the arrow's point keeps its place.
    k.key(grab, 'smooth', **w.pointed(-6, -0.14 * gather, 0.04, 6, point), spine=V(2, 0, b.yaw(4)),
          head=V(2, 0, b.yaw(-6)), hips_at=V(0, 0, -0.02 * leg))
    k.key(nocked, 'smooth', **w.pointed(-2, -w.slack.length * gather, 0.015, 2, point), spine=V(1, 0, b.yaw(1)),
          head=V(1, 0, 0))
    k.key(n, **b.still())
    keyed = kept(rig, k, ahead=True)  # in its room before the drawing hand and the arrow are worked out from it

    # The string: drawn deeper, then let down as it is loosed, and drawn again once nocked.
    s_keys = Keys().key(0, s=0.0).key(loose - 1, s=-deeper).key(loose, 'linear', s=1.0).key(nocked, s=1.0)
    s_keys.key(n - 1, 'smooth', s=0.0).key(n, s=0.0)
    # The drawing hand, off the string from the loose until it nocks the fresh arrow: flown back past
    # the ear, then over the shoulder to the quiver for one, then out round the side of the head,
    # pulling it out, and over to the string.
    released = w.wrist - 0.16 * w.aim + V(0, 0, 0.05)
    if anchor == 'chin':  # out past the front of the drawing shoulder, low, clear of the chin
        released = b.near(0.09, -0.34, 0.01, draw)
    if snap is not None:
        released = w.wrist + b.out(*snap, draw)
    hand = Keys()
    hand.key(loose, at=released)
    hand.key(loose + 2, 'out', at=released - 0.03 * w.aim + V(0, 0, 0.02))
    if w.quiver and quiver == 'hip':
        # Down beside the body, out from it, to the quiver at the hip, and up out of it.
        turn, nock_q = w.quiver
        reach = nock_q - (w.fist - w.wrist)  # the wrist, so the fist closes on the stowed arrow's nock
        hand.key(fetch, 'smooth', at=released.lerp(reach, 0.5) + b.out(0.12, 0.04, 0.0, draw))
        hand.key(grab, 'smooth', at=reach)
        hand.key(grab + 2, 'smooth', at=reach.lerp(w.wrist, 0.45) + b.out(0.12, -0.06, 0.0, draw))
    elif w.quiver:
        turn, nock_q = w.quiver
        reach = nock_q - (w.fist - w.wrist)  # the wrist, so the fist closes on the stowed arrow's nock
        hand.key(fetch, 'smooth', at=released.lerp(reach, 0.45) + V(0, 0, 0.12))
        hand.key(grab, 'smooth', at=reach)
        hand.key(grab + 2, 'smooth', at=reach.lerp(w.wrist, 0.5) + b.out(0.16, 0.0, 0.08, draw))
        if anchor == 'chin':  # up beside the head, well out from it, and down in front of the shoulder
            hand.key(fetch, 'smooth', at=b.near(0.24, 0.05, 0.49, draw))
            hand.key(grab + 2, 'smooth', at=b.near(0.3, -0.34, 0.09, draw))
    else:
        hand.key(grab, 'smooth', at=w.wrist - 0.12 * w.aim + V(0, 0, 0.02))
    on = Keys().key(loose - 1, u=1.0).key(loose, 'linear', u=0.0).key(nocked - 2, u=0.0).key(nocked, 'smooth', u=1.0)
    # The elbow raised to reach over the shoulder, or drawn back and out to reach down to the hip.
    elbow = V(0, 0.4, 1.0) if quiver == 'back' else b.out(0.6, 1.0, -1.0, draw)
    lift = Keys().key(loose, e=V(0, 0, 0)).key(fetch, e=elbow).key(grab, e=elbow)
    lift.key(nocked, 'smooth', e=V(0, 0, 0))
    # The fresh arrow's way, held by its nock in the drawing hand: its point swings back and up out of
    # the quiver, up and out on the drawing hand's side, clear of the head and inside the hex, then
    # forward past the cheek, and onto the string; each a direction on the chest, at a share of the
    # way from the grab to the nock. From a quiver at the hip it comes up point first instead, swinging
    # forward and up out on the drawing hand's side.
    ways = [(0.4, b.out(0.55 * wide, 0.3, 0.8, draw)), (0.7, b.out(0.45 * wide, -1.0, 0.25, draw))]
    if quiver == 'hip':
        ways = [(0.35, b.out(0.35 * wide, -0.6, -0.7, draw)), (0.7, b.out(0.3 * wide, -1.0, 0.1, draw))]
    cache = {}

    def relation():
        """How the arrow sits in the hand as the hand takes it from the quiver, on frame `grab`."""
        if 'grab' not in cache:
            ch = pose(grab, relate=False)
            motions = rig.solve(ch)
            hand_ = motions[f'hand_{draw}']
            turn_q, at_q = w.stowed(motions)
            back = hand_.turn.inverted()
            cache['grab'] = (back @ turn_q, w.wrist + back @ (at_q - hand_.at))
        return cache['grab']

    def pose(f, relate=True):
        ch = keyed(f)
        s = s_keys.value('s', f)
        w.strung(ch, s, nocked=not loose <= f < nocked)
        motions = rig.solve(ch)
        on_string = w.on_string(ch, s, motions)
        u = on.value('u', f)
        if u >= 1.0:
            ch.update(on_string)
        else:
            chest = motions['spine']
            free_at = chest(hand.value('at', f))
            free_aim = chest.turn.copy()
            pole = chest.turn @ (w.elbow + lift.value('e', f))
            ch[f'hand_{draw}_at'] = free_at.lerp(on_string[f'hand_{draw}_at'], u)
            ch[f'hand_{draw}_aim'] = free_aim.slerp(on_string[f'hand_{draw}_aim'], u)
            ch[f'hand_{draw}_world'] = 1.0
            ch[f'elbow_{draw}'] = pole.lerp(on_string[f'elbow_{draw}'], u)
        if w.arrow and w.quiver and loose <= f < nocked:
            if f < grab or not relate:
                motions = rig.solve(ch)
                w.arrow_to(ch, motions, *w.stowed(motions))
            else:
                motions = rig.solve(ch)
                hand_, chest = motions[f'hand_{draw}'], motions['spine']
                turn_g, at_g = relation()
                t = (f - grab) / (nocked - grab)
                # Its turn in the model's frame through the ways above, from the quiver to the bow.
                turns = [(0.0, hand_.turn @ turn_g)]
                turns += [(u, w.aim.rotation_difference(chest.turn @ way.normalized())) for u, way in ways]
                turns.append((1.0, motions[f'hand_{bow}'].turn))
                for (u0, q0), (u1, q1) in zip(turns, turns[1:]):
                    if t <= u1:
                        turn = q0.slerp(q1 if q0.dot(q1) >= 0 else -q1, EASES['smooth']((t - u0) / (u1 - u0)))
                        break
                at = at_g.lerp(w.head, EASES['smooth'](t))
                w.arrow_to(ch, motions, turn, hand_(at))
        return ch

    return Clip(n, pose, marks={mark: loose})


@style('cast', 'shot')
def heavy_shot(rig, bow='l', seconds=0.8, height=6, rise=14.0, recoil=1.4, string='string', arrow='arrow',
               **drawn_options):
    """A heavy shot from the full draw the model stands at, loosed at its height on frame `height`:
    the bow raised `rise` degrees and held a moment for a long shot, then loosed with a harder kick,
    and a fresh arrow drawn from the quiver (drawn_shot(), which takes `drawn_options`)."""
    return drawn_shot(rig, bow, seconds, height, rise, recoil, string, arrow, mark='height', **drawn_options)


@style('victory', 'aloft')
def aloft(rig, bow='l', seconds=0.8, out=0.7, height=0.7, lean=10.0, string='string', arrow='arrow',
          clench=(0.06, 0.02, -0.4)):
    """An archer's victory from the full draw it stands at (Bow): a dip to gather as the drawing hand
    comes off the string, then the bow thrust up and out at arm's length, past the top, standing
    upright on its string's line with its face out to its side, so its curve shows from behind and in
    front and its string clears the head; settling into a proud hold that the last frame keeps, chest
    out and looking up, the drawing hand clenched at the chest. `out` and `height` place the bow hand
    by its shoulder, in shares of the arm's reach; `lean` tips the bow's top in over the head, in
    degrees, so its lower tip clears the hip. With fit(bow=...) the string is let down and the arrow
    stays in the drawing hand. `clench` is where the drawing hand goes, (out, back, up) from where it
    rests on the string, in shares of its arm's reach with x outwards on its side: down to the chest,
    or for a model whose chest is turned under that hand, out in front of it."""
    w = Bow(rig, bow, string, arrow)
    b = Body(rig, bow)
    n = frames_for(seconds)
    leg = b.leg
    draw = w.draw

    def held_up(out_, height_, lean_):
        up = turned(V(0, 0, 1), (0, b.yaw(-lean_), 0))
        face = b.out(1, 0, 0)
        face = (face - face.dot(up) * up).normalized()
        return b.arm(bow, b.near(out_, 0.0, height_), aligning(w.chord, w.aim, up, face), (0.9, 0.3, -0.3))

    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    k.key(3, **w.swung(-10, 0.0, 0.02), **b.arm(draw, b.wrist(draw, clench[0] / 2, clench[1], clench[2] / 2)),
          hips_at=V(0, 0, -0.06 * leg),
          spine=V(5, 0, 0), head=V(4, 0, 0))
    k.key(10, 'out', **held_up(out + 0.04, height + 0.06, lean + 4),
          **b.arm(draw, b.wrist(draw, *clench), None, (0.7, 0.4, -0.6)),
          hips_at=V(0, 0, 0.015 * leg), spine=V(-8, 0, 0), head=V(-12, 0, 0), cape=V(8, 0, 0))
    k.key(16, **held_up(out, height - 0.02, lean), hips_at=V(0, 0, -0.01 * leg), spine=V(-6, 0, 0), head=V(-9, 0, 0),
          cape=V(2, 0, 0))
    k.key(n, **held_up(out, height, lean), hips_at=V(0, 0, -0.008 * leg), spine=V(-6, 0, 0), head=V(-9, 0, 0),
          cape=V(0, 0, 0))
    return Clip(n, k)


def strung(rig, clip, made_clip, bow, string='string', arrow='arrow'):
    """A clip's pose function for a model at full draw (Bow): in `idle` and `move` the drawing hand
    stays on the string, wherever the bow hand goes; in `stun`, `death` and `victory` the string is
    let down over the first frames and the drawing hand left to the style, the arrow staying in its
    fingers, but for the death, where it falls with the bow."""
    w = Bow(rig, bow, string, arrow)
    pose, n = made_clip.pose, made_clip.frames
    if clip in ('idle', 'move'):
        def drawn(f):
            ch = pose(f)
            ch.update(w.on_string(ch, 0.0))
            return ch

        return drawn
    if clip in ('stun', 'death', 'victory'):
        def let_down(f):
            ch = pose(f)
            w.strung(ch, 1.0 if made_clip.loop else EASES['out'](min(f / 3, 1.0)))
            if w.arrow and clip != 'death':
                w.in_hand(ch)
            return ch

        return let_down
    return pose


# The Dwarves (units/balin.py and units/dain.py) --------------------------------------------------
#
# A Captain's rally to the standard he holds, a long beard that hangs from the chin (hanging()), and
# below, a weapon held in both hands.


@style('cast', 'plant')
def plant(rig, hand='r', pole='l', seconds=0.8, height=4, rise=0.2, out=0.08):
    """A Captain's rally to the standard: the pole the other hand holds (`pole`, which hold()
    describes from its grip up to its top, and which fit(pole=..., free=('cast',)) leaves to this
    style) heaved up off the ground by `rise` as the body gathers under it, turned to it; then driven
    down into the ground again with a stamp, at its height on frame `height`, as the weapon is
    thrust up high, chest out and head up; held while the allies rally to it, and lowered. `out` is
    how far out from the shoulder the weapon goes up, a share of the arm's reach: more takes a fist
    held up beside a big head up past it rather than through it (Gothmog's)."""
    b = Body(rig, hand)
    p = Pole(rig, pole)
    n = frames_for(seconds)
    leg = b.leg
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())

    def up(theta, height_):
        aim, _ = arc(theta)
        return b.arm(hand, b.near(out, -0.05, height_), b.rig.aim(hand, aim, b.out(1, 0, 0)), (0.9, 0.2, -0.3),
                     world=1.0)

    # Frame 0, seen at full weight: the standard gripped and heaved up, the body crouched under it and
    # turned to it, the weapon drawn in to the chest.
    k.key(0, **p.lifted(0.55 * rise), **b.arm(hand, b.wrist(hand, -0.06, 0.06, 0.02), b.tip(-12), world=1.0),
          hips_at=V(0, 0.01, -0.05 * leg), hips=V(0, 0, b.yaw(-6)), spine=V(6, 0, b.yaw(-14)),
          head=V(-4, 0, b.yaw(-16)), cape=V(-3, 0, 0))
    # Up at full stretch, the body rising under it.
    k.key(2, 'out', **p.lifted(rise), hips_at=V(0, 0, 0), spine=V(-2, 0, b.yaw(-8)), head=V(-8, 0, b.yaw(-10)))
    # Driven down into the ground with a stamp as the weapon goes up: the rally.
    k.key(height, 'in', **p.planted(), **up(-8, 0.96), hips_at=V(0, 0, -0.09 * leg), hips=V(2, 0, 0),
          spine=V(-4, 0, b.yaw(2)), head=V(-10, 0, 0), cape=V(8, 0, 0))
    k.key(height + 3, 'out', **up(-12, 0.99), hips_at=V(0, 0, -0.03 * leg), spine=V(-9, 0, b.yaw(3)),
          head=V(-14, 0, 0))
    k.key(n - 7, **up(-4, 0.96), hips_at=V(0, 0, -0.02 * leg), spine=V(-7, 0, b.yaw(2)), head=V(-11, 0, 0))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0, f'hand_{pole}_world': 1.0})
    return Clip(n, k, marks={'height': height})


def hanging(clips, bone='beard', share=0.8):
    """A Rig's clips, `{clip: spec}` as Rig takes them or as fit() gives them, with the script's own
    bone `bone`, which hangs from the head (a long beard, from the chin), turned in every frame to take
    back a share `share` of the head's nod and tilt, so it hangs down the chest as the head nods,
    looks up or lolls, rather than swinging out from it or through it; it still turns as the head
    turns from side to side. Where that would take it under the ground, as a body slumps, it takes
    back less, so it rests on the ground. Back comes a function of the rig for each clip, as from
    fit()."""

    def hung(rig, clip, spec):
        made_clip = made(rig, clip, spec)
        pose = made_clip.pose

        def with_beard(f):
            ch = pose(f)
            pitch, tilt, _ = ch.get('head', (0, 0, 0))
            back = turn_of((pitch, tilt, 0)).inverted()
            ch[bone] = degrees_of(Quaternion().slerp(back, share))
            if rig.lowest(ch, [bone]) < -TOUCH:
                low, high = 0.0, share  # how much it can take back and stay out of the ground, and can't
                for _ in range(12):
                    ch[bone] = degrees_of(Quaternion().slerp(back, (low + high) / 2))
                    if rig.lowest(ch, [bone]) < -TOUCH:
                        high = (low + high) / 2
                    else:
                        low = (low + high) / 2
                ch[bone] = degrees_of(Quaternion().slerp(back, low))
            return ch

        return made_clip.with_pose(with_beard)

    return {clip: (lambda rig, clip=clip, spec=spec: hung(rig, clip, spec)) for clip, spec in clips.items()}


# A weapon held in both hands (units/dain.py's mattock): the weapon hand holds it low on the haft and
# draws its path, as in any style, and both_hands() keeps the other hand on the haft further up,
# sliding along it as far as it must to reach. smite and slam are blows for it.


class Haft:
    """A weapon held in both hands, as a mattock, a great axe or a maul is: `hand` holds it low on the
    haft, from its grip up to its head as hold() describes it, and the other hand holds it further up,
    where it holds it as the model stands. Channels for `hand` putting its grip where a blow goes
    (held_at()), and for the other hand on the haft wherever that is (on())."""

    def __init__(self, rig, hand='r'):
        held = rig.held(hand)
        if held is None:
            raise RuntimeError(f'hand_{hand} holds nothing: say what it holds with hold()')
        self.rig = rig
        self.hand, self.off = hand, ('l' if hand == 'r' else 'r')
        self.grip, self.head, self.axis, self.face = held
        self.wrist = rig.joint(f'wrist_{hand}')
        self.off_wrist = rig.joint(f'wrist_{self.off}')
        self.at = (rig.joint(f'fist_{self.off}') - self.grip).dot(self.axis)  # how far up it the other hand holds it
        self.top = (self.head - self.grip).length - 0.15  # and the furthest it slides, short of the head
        upper, lower, _ = LIMBS[f'arm_{self.off}']
        self.lengths = (rig.length(upper), rig.length(lower))
        self.elbow = rig.rest[f'elbow_{self.off}']

    def held_at(self, at, axis, face):
        """`hand`'s wrist and turn putting its grip at `at`, the haft along `axis` up to the head and the
        head's face towards `face`, in the model's frame."""
        turn = self.rig.aim(self.hand, axis, face)
        return Vector(at) - turn @ (self.grip - self.wrist), turn

    def on(self, ch, low=0.12, motions=None):
        """Channels for the other hand holding the haft where the pose `ch` puts it, as near as it can
        reach to where it holds it as the model stands, sliding along it no nearer the grip than `low`
        and no further than a little short of the head; and how far short of the haft it falls, 0 if
        it reaches."""
        motions = motions or self.rig.solve(ch)
        weapon, chest = motions[f'hand_{self.hand}'], motions['spine']
        shoulder = np.array(chest(self.rig.joint(f'shoulder_{self.off}')))
        along = np.array(weapon.turn @ self.axis)
        held = np.array(weapon(self.off_wrist))  # its wrist where it holds the haft as the model stands
        slide = np.linspace(low - self.at, self.top - self.at, 241)
        far = np.linalg.norm(held + slide[:, None] * along - shoulder, axis=1)
        l1, l2 = self.lengths
        short = np.maximum(far - (l1 + l2) * 0.998, abs(l1 - l2) * 1.002 - far).clip(0.0)
        reached = np.flatnonzero(short == 0)
        i = reached[np.abs(slide[reached]).argmin()] if len(reached) else int(short.argmin())
        o = self.off
        channels = {f'hand_{o}_at': Vector(held + slide[i] * along), f'hand_{o}_aim': weapon.turn.copy(),
                    f'hand_{o}_world': 1.0, f'elbow_{o}': chest.turn @ self.elbow}
        return channels, float(short[i])


def both_hands(clips, hand='r', held=('idle', 'move', 'attack', 'cast'), low=0.12):
    """A Rig's clips, `{clip: spec}` as Rig takes them or as fit() gives them, for a weapon held in both
    hands (Haft): in the clips named in `held` the other hand keeps hold of the haft wherever the
    weapon goes, sliding along it as far as it must to reach; in the others it lets go and does as
    the style has it, as a dazed or falling model would. Give it fit()'s clips, so the weapon is kept
    in the hex before the other hand takes hold. A build warns where the other hand can't reach the
    haft. Back comes a function of the rig for each clip, as from fit()."""

    def gripped(rig, clip, spec):
        made_clip = made(rig, clip, spec)
        if clip not in held:
            return made_clip
        h = Haft(rig, hand)
        pose = made_clip.pose

        def holding_on(f):
            ch = pose(f)
            ch.update(h.on(ch, low)[0])
            return ch

        short = [(f, h.on(pose(f), low)[1]) for f in range(made_clip.frames + 1)]
        short = [(f, d) for f, d in short if d > 1e-3]
        if short:
            model = rig.armature.children[0].name if rig.armature and rig.armature.children else 'the model'
            print(f'WARNING {model}: in {clip} hand_{h.off} falls up to {max(d for _, d in short):.3f} short of '
                  f'the haft, in frames {", ".join(str(f) for f, _ in short)}')
        return made_clip.with_pose(holding_on)

    return {clip: (lambda rig, clip=clip, spec=spec: gripped(rig, clip, spec)) for clip, spec in clips.items()}


def haft_blow(rig, hand, seconds, mark, frame, path, body, crouch, apart=0.24):
    """A blow with a weapon held in both hands (Haft), its path drawn where it goes. `path` is keys of
    (frame, ease, where the middle of the two hands goes, the way the haft points from them up to its
    head, and the way the elbow points). The middle of the hands is a point from the middle of the
    shoulders, in units of the shorter arm's reach; it and the haft's way have x outwards on `hand`'s
    side. Keep the hands where both arms reach, before the chest. `hand`'s grip goes half of `apart`
    down the haft from the middle, and both_hands() puts the other hand on the haft above it. The
    head's face leads the swing up to frame `frame`, which it marks as `mark`, and stays down after
    it as the weapon comes back up. `body` is keys of (frame, ease, hips, spine and head as pitch and
    a yaw towards `hand`'s side), and `crouch` of (frame, ease, how low the hips go and how far
    forward, shares of the leg)."""
    b = Body(rig, hand)
    h = Haft(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    middle = (rig.joint('shoulder_l') + rig.joint('shoulder_r')) / 2
    reach = min(rig.reach('arm_l'), rig.reach('arm_r'))
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    aims = [b.out(*aim).normalized() for _, _, _, aim, _ in path]
    swung = [i for i, key in enumerate(path) if key[0] <= frame]
    faces = leading(aims[:len(swung)])
    for i in range(len(swung), len(path)):  # after the blow, the face stays down as the haft comes up
        down = faces[len(swung) - 1]
        faces.append((down - down.dot(aims[i]) * aims[i]).normalized())
    for (f, ease, (x, y, z), _, elbow), aim, face in zip(path, aims, faces):
        wrist, turn = h.held_at(middle + reach * b.out(x, y, z) - apart / 2 * aim, aim, face)
        k.key(f, ease, **b.arm(hand, wrist, turn, elbow, world=1.0))
    for f, ease, hips, spine, head in body:
        k.key(f, ease, hips=V(hips[0], 0, b.yaw(hips[1])), spine=V(spine[0], 0, b.yaw(spine[1])),
              head=V(head[0], 0, b.yaw(head[1])))
    for f, ease, low, ahead in crouch:
        k.key(f, ease, hips_at=V(0, -ahead * leg, -low * leg))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={mark: frame})


@style('attack', 'smite')
def smite(rig, hand='r', seconds=0.6, beard=False):
    """A blow with a weapon held in both hands (both_hands()), `hand` low on the haft and the other
    hand above it, as a mattock is held across the body with its head over the other shoulder: wound
    up with the body turned to that side and the head drawn back high over that shoulder, then
    brought over and down in an arc on that side, landing on frame 3 low before it, as the body leans
    in behind it; a rebound, a hold, and a slow, heavy recovery. The hands stay before the chest, so
    a long haft keeps its head in the hex, and the blow shows beside the body from behind and from
    in front. With `beard`, the hands and the haft keep out before a long beard and clear of a big
    helm (beard_smite(), Blows before a long beard below)."""
    if beard:
        return haft_blow(rig, hand, seconds, 'strike', BLOW, *beard_smite(BLOW))
    path = [  # frame, ease, the middle of the hands, the way the haft points, elbow
        (0, 'smooth', (-0.34, -0.46, 0.22), (-0.35, 0.55, 0.76), (0.7, 0.3, -0.5)),
        (1, 'in', (-0.26, -0.56, 0.22), (-0.5, 0.05, 0.86), (0.7, 0.3, -0.5)),
        (2, 'in', (-0.12, -0.66, 0.16), (-0.82, -0.3, 0.48), (0.6, 0.4, -0.5)),
        (BLOW, 'in', (0.0, -0.72, 0.14), (-0.8, -0.36, -0.46), (0.6, 0.4, -0.6)),
        (BLOW + 2, 'out', (-0.02, -0.7, 0.16), (-0.8, -0.34, -0.4), (0.6, 0.4, -0.6)),
        (BLOW + 5, 'smooth', (-0.02, -0.7, 0.17), (-0.8, -0.34, -0.38), (0.6, 0.4, -0.6)),
        (BLOW + 10, 'smooth', (-0.06, -0.66, 0.12), (-0.8, -0.2, 0.2), (0.6, 0.4, -0.5)),
    ]
    body = [  # frame, ease, hips, spine and head as (pitch, yaw)
        (0, 'smooth', (-2, -10), (-8, -18), (5, 12)),
        (1, 'in', (0, -6), (-3, -10), (3, 6)),
        (2, 'in', (2, -2), (6, -3), (0, 0)),
        (BLOW, 'in', (4, 0), (16, 0), (-8, -8)),
        (BLOW + 2, 'out', (4, 0), (14, 0), (-7, -7)),
        (BLOW + 5, 'smooth', (3, 0), (13, 0), (-6, -6)),
        (BLOW + 10, 'smooth', (1, -1), (6, -2), (-2, -2)),
    ]
    crouch = [(0, 'smooth', 0.03, -0.02), (2, 'in', 0.06, 0.02), (BLOW, 'in', 0.1, 0.05),
              (BLOW + 2, 'out', 0.09, 0.05), (BLOW + 5, 'smooth', 0.085, 0.045),
              (BLOW + 10, 'smooth', 0.04, 0.02)]
    return haft_blow(rig, hand, seconds, 'strike', BLOW, path, body, crouch)


@style('cast', 'slam')
def slam(rig, hand='r', seconds=0.8, height=4, beard=False):
    """A greater blow with a weapon held in both hands (both_hands()), as smite's but slammed down
    into the ground before the other hand's side: heaved up higher, the body rising and turned away
    to that side, then brought over and down with the whole body dropping behind it, its head
    striking the ground at its height on frame `height` (fit() keeps it on the ground, not through
    it); held, braced, as the ground shakes, then lifted out and back. With `beard`, as smite's, the
    hands and the haft keep out before a long beard and clear of a big helm (beard_slam())."""
    if beard:
        return haft_blow(rig, hand, seconds, 'height', height, *beard_slam(height))
    path = [  # frame, ease, the middle of the hands, the way the haft points, elbow
        (0, 'smooth', (-0.36, -0.42, 0.28), (-0.3, 0.5, 0.82), (0.7, 0.3, -0.4)),
        (height - 2, 'in', (-0.28, -0.52, 0.26), (-0.45, 0.1, 0.89), (0.7, 0.3, -0.4)),
        (height - 1, 'in', (-0.14, -0.64, 0.18), (-0.82, -0.25, 0.5), (0.6, 0.4, -0.5)),
        (height, 'in', (0.0, -0.72, 0.12), (-0.72, -0.3, -0.62), (0.6, 0.4, -0.6)),
        (height + 3, 'out', (-0.01, -0.71, 0.14), (-0.73, -0.3, -0.58), (0.6, 0.4, -0.6)),
        (height + 12, 'smooth', (-0.01, -0.71, 0.15), (-0.73, -0.3, -0.57), (0.6, 0.4, -0.6)),
        (height + 16, 'smooth', (-0.06, -0.66, 0.12), (-0.8, -0.2, 0.1), (0.6, 0.4, -0.5)),
    ]
    body = [  # frame, ease, hips, spine and head as (pitch, yaw)
        (0, 'smooth', (-3, -12), (-10, -20), (4, 14)),
        (height - 2, 'in', (-1, -6), (-5, -10), (2, 6)),
        (height - 1, 'in', (3, -2), (8, -3), (-2, 0)),
        (height, 'in', (8, 0), (20, 0), (-10, -8)),
        (height + 3, 'out', (7, 0), (18, 0), (-9, -7)),
        (height + 12, 'smooth', (7, 0), (17, 0), (-8, -6)),
        (height + 16, 'smooth', (3, -1), (8, -1), (-3, -2)),
    ]
    crouch = [(0, 'smooth', -0.02, -0.02), (height - 2, 'in', 0.0, 0.0), (height - 1, 'in', 0.06, 0.03),
              (height, 'in', 0.14, 0.06), (height + 3, 'out', 0.12, 0.06), (height + 12, 'smooth', 0.115, 0.055),
              (height + 16, 'smooth', 0.05, 0.02)]
    return haft_blow(rig, hand, seconds, 'height', height, path, body, crouch)


# Blows before a long beard (units/dain.py) -------------------------------------------------------
#
# smite and slam with `beard`, for a short-armed model whose long beard hangs before its chest under
# a big helm, as Dáin's does: its hands can't meet on the haft before the beard, and bending over
# the blow brings the helm down onto them. So the hands stay out before the chest, the weapon hand
# beside the beard on its own side and the other hand past it on the other side, as far up the haft
# as it holds it standing. The haft is heaved up on the other hand's side, past the face rather than
# over the head, brought down across the front clear of the beard, and lands with its head low on
# the other hand's side, where it shows past the body from behind; the body bends a little into it,
# the head looking down at the blow, the hips held back so the beard stays behind the haft.


def beard_smite(strike):
    """smite's keys with `beard`, for haft_blow(): the path, the body and the crouch of a blow that
    lands on frame `strike`."""
    s = strike
    path = [  # frame, ease, the middle of the hands, the way the haft points, elbow
        (0, 'smooth', (-0.04, -0.76, 0.33), (-0.56, 0.49, 0.67), (0.7, 0.3, -0.5)),
        (s - 2, 'in', (-0.02, -0.82, 0.31), (-0.73, 0.34, 0.59), (0.7, 0.3, -0.5)),
        (s - 1, 'in', (0.25, -0.89, 0.13), (-0.98, -0.05, 0.21), (0.6, 0.4, -0.5)),
        (s, 'in', (0.23, -0.94, -0.03), (-0.9, 0.0, -0.43), (0.6, 0.4, -0.6)),
        (s + 2, 'out', (0.23, -0.94, 0.0), (-0.91, 0.0, -0.41), (0.6, 0.4, -0.6)),
        (s + 5, 'smooth', (0.23, -0.94, 0.0), (-0.91, 0.0, -0.4), (0.6, 0.4, -0.6)),
        (s + 10, 'smooth', (0.18, -0.89, -0.11), (-0.95, -0.05, 0.32), (0.6, 0.4, -0.5)),
    ]
    body = [  # frame, ease, hips, spine and head as (pitch, yaw)
        (0, 'smooth', (-3, -8), (-10, -8), (6, 8)),
        (s - 2, 'in', (-1, -5), (-4, -5), (3, 4)),
        (s - 1, 'in', (2, -2), (4, -2), (0, 0)),
        (s, 'in', (4, 0), (7, 0), (4, -6)),
        (s + 2, 'out', (4, 0), (7, 0), (4, -5)),
        (s + 5, 'smooth', (3, 0), (6, 0), (3, -4)),
        (s + 10, 'smooth', (1, -1), (4, -2), (0, -2)),
    ]
    crouch = [(0, 'smooth', -0.03, -0.02), (s - 1, 'in', 0.06, 0.0), (s, 'in', 0.14, -0.03),
              (s + 2, 'out', 0.13, -0.03), (s + 5, 'smooth', 0.12, -0.03), (s + 10, 'smooth', 0.05, -0.01)]
    return path, body, crouch


def beard_slam(height):
    """slam's keys with `beard`, for haft_blow(): heaved higher than smite's, the body rising, and
    slammed down onto the ground at its height on frame `height`, the body dropping lower behind it."""
    h = height
    path = [  # frame, ease, the middle of the hands, the way the haft points, elbow
        (0, 'smooth', (-0.06, -0.76, 0.37), (-0.57, 0.49, 0.66), (0.7, 0.3, -0.4)),
        (h - 2, 'in', (-0.04, -0.8, 0.38), (-0.67, 0.42, 0.61), (0.7, 0.3, -0.4)),
        (h - 1, 'in', (0.26, -0.91, 0.2), (-0.95, -0.05, 0.32), (0.6, 0.4, -0.5)),
        (h, 'in', (0.23, -0.94, 0.05), (-0.9, 0.0, -0.44), (0.6, 0.4, -0.6)),
        (h + 3, 'out', (0.23, -0.94, 0.06), (-0.9, 0.0, -0.43), (0.6, 0.4, -0.6)),
        (h + 12, 'smooth', (0.23, -0.94, 0.06), (-0.91, 0.0, -0.42), (0.6, 0.4, -0.6)),
        (h + 16, 'smooth', (0.18, -0.89, -0.11), (-0.95, -0.05, 0.32), (0.6, 0.4, -0.5)),
    ]
    body = [  # frame, ease, hips, spine and head as (pitch, yaw)
        (0, 'smooth', (-4, -8), (-10, -8), (7, 8)),
        (h - 2, 'in', (-2, -5), (-6, -5), (4, 4)),
        (h - 1, 'in', (3, -2), (5, -2), (0, 0)),
        (h, 'in', (7, 0), (8, 0), (5, -6)),
        (h + 3, 'out', (6, 0), (8, 0), (5, -5)),
        (h + 12, 'smooth', (6, 0), (7, 0), (4, -4)),
        (h + 16, 'smooth', (2, -1), (4, -1), (0, -2)),
    ]
    crouch = [(0, 'smooth', -0.05, -0.02), (h - 2, 'in', -0.02, 0.0), (h - 1, 'in', 0.06, 0.0),
              (h, 'in', 0.18, -0.03), (h + 3, 'out', 0.16, -0.03), (h + 12, 'smooth', 0.15, -0.03),
              (h + 16, 'smooth', 0.05, -0.01)]
    return path, body, crouch


# A drawing hand let down (units/faramir.py) ------------------------------------------------------
#
# dazed with `off_ahead`, for an archer at the draw (An archer at the draw above) whose drawing hand
# rests at the cheek and keeps the arrow in its fingers as the string is let down (strung()). Sagging
# by the body, as dazed's other hand does, it would go into the chest; brought forward with the
# arrow still pointing where it was drawn, the arrow would reach out of the hex. So the hand comes
# down off the string and out before the chest, and turns the arrow down, forward and across past
# the bow, swaying a little as the body sways.


def let_down(rig, b, off, ahead, droop, swing):
    """dazed's channels for the other hand, `off`, with `off_ahead` (`ahead`): where its wrist goes,
    its turn and the way its elbow points, as the body sways (`swing`, -1 to 1)."""
    across = rig.joint('shoulder_l') - rig.joint('shoulder_r')
    front = V(across.y, -across.x, 0).normalized()  # the chest's front as the model stands
    at = b.wrist(off, 0.0, 0.03 * swing, -0.3 * droop) + ahead * rig.reach(f'arm_{off}') * front
    down = turned(V(-0.45, -0.4, -0.8), (6 * swing, 0, 0))  # x outwards: across towards the bow
    return at, b.aim(down, (0.0, -1.0, 0.3), off), (0.6, 0.5, -0.6)


# The Elves (units/legolas.py, haldir.py, elrond.py and galadriel.py) ------------------------------
#
# Legolas's flurry: arrows loosed as fast as he can nock them, from the draw he stands at.


@style('cast', 'flurry')
def flurry(rig, bow='l', seconds=0.8, height=3, shots=5, every=3, deeper=0.5, recoil=0.7, snap=(0.08, 0.1, 0.03),
           sweep=0.0, string='string', arrow='arrow', point=0.0):
    """A flurry of shots from the draw the model stands at (Bow): drawn `deeper` (as drawn_shot() takes
    it) and loosed at its height on frame `height`, then again every `every` frames, `shots` in all,
    the drawing hand snapping back from each loose and catching the string again at once with a fresh
    arrow from its fingers, drawing and loosing while the bow arm kicks (`recoil`) and steadies. After
    the last the hand flies back, comes to the string again and draws as the model stands. Each loosed
    arrow is put away in the quiver, which stands in for it flying, and the fresh one is on the string
    as the hand takes it. `snap` is where the hand snaps to from each loose, (out, back, up) on the chest
    from where it rests on the string, x outwards on its side: back past the cheek for a model that
    draws to it, out to its side for one that draws to under its chin, ahead of its face. `sweep` turns
    the body that many degrees across the shots, from the weapon's side round to the other, an arrow
    for each of several foes: a volley. `point` tips the bow forward that many degrees more as the hand
    catches the string after the last, its arrow pointing at the ground, as drawn_shot() takes it, for a
    bow drawn close before the face."""
    w = Bow(rig, bow, string, arrow)
    b = Body(rig, bow)
    n = frames_for(seconds)
    leg = b.leg
    draw = w.draw
    looses = [height + i * every for i in range(shots)]
    last = looses[-1]
    back = last + 4  # the hand on the string again after the last loose, which it draws from let down
    if every < 3 or back > n - 3:
        raise ValueError('a flurry needs 3 frames a shot and 3 after the hand is back on the string')

    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    k.key(height - 1, 'smooth', **w.swung(0, 0.012), spine=V(-1.5, 0, 0), hips_at=V(0, 0.005, -0.03 * leg))
    for i, f in enumerate(looses):  # each loose kicks the bow arm and jolts the body; it steadies for the next
        k.key(f, 'in', **w.swung(0, 0.03 * recoil, 0.0, 4 * recoil), spine=V(-0.5, 0, 0),
              hips_at=V(0, 0.012, -0.035 * leg))
        if f != last:
            k.key(f + every - 1, 'out', **w.swung(0, 0.012), spine=V(-1.5, 0, 0), hips_at=V(0, 0.005, -0.03 * leg))
        if sweep:  # turned to the next foe for each shot, the bow with the chest
            turn = sweep * (i / max(1, shots - 1) - 0.5)
            k.key(f - 1 if i else 0, 'smooth', spine=V(-1.5, 0, b.yaw(-0.6 * turn)), hips=V(0, 0, b.yaw(-0.4 * turn)))
            k.key(f, 'in', spine=V(-0.5, 0, b.yaw(-0.6 * turn)))
    k.key(last + 3, 'out', **w.swung(-2, 0.02 * recoil, 0.01, 10 * recoil), spine=V(0, 0, 0), head=V(1, 0, 0))
    if point:  # pointed at the ground as the hand catches the string again
        k.key(back, 'smooth', **w.pointed(-2, 0.0, 0.01, 10 * recoil, point))
    k.key(n, **b.still())
    keyed = kept(rig, k, ahead=True)  # in its room before the drawing hand and the arrow are worked out from it

    # The string: drawn, let down as each is loosed, caught again a little drawn and drawn for the next;
    # after the last, let down until the hand takes it again, then drawn as the model stands.
    s_keys = Keys().key(0, s=0.0).key(height - 1, s=-deeper)
    on = Keys().key(height - 1, u=1.0)  # the hand on the string (1) or off it (0)
    for f in looses:
        s_keys.key(f, 'linear', s=1.0)
        on.key(f, 'linear', u=0.0)
        if f != last:
            s_keys.key(f + 1, 'linear', s=0.3).key(f + every - 1, 'smooth', s=-deeper)
            on.key(f + 1, 'linear', u=1.0)
    s_keys.key(back, s=1.0).key(n - 1, 'smooth', s=0.0).key(n, s=0.0)
    on.key(last + 2, u=0.0).key(back, 'smooth', u=1.0)
    # The drawing hand off the string: flown back past the ear from the draw, further after the last.
    released = w.wrist + b.out(*snap, draw)
    hand = Keys().key(height, at=released).key(last, at=released)
    hand.key(last + 2, 'out', at=released - 0.05 * w.aim + V(0, 0, 0.04))
    hidden = {f for loose in looses for f in range(loose, loose + 1 if loose != last else back)}

    def pose(f):
        ch = keyed(f)
        s = s_keys.value('s', f)
        w.strung(ch, s, nocked=f not in hidden)
        motions = rig.solve(ch)
        on_string = w.on_string(ch, s, motions)
        u = on.value('u', f) if f >= height - 1 else 1.0
        if u >= 1.0:
            ch.update(on_string)
        else:
            chest = motions['spine']
            ch[f'hand_{draw}_at'] = chest(hand.value('at', f)).lerp(on_string[f'hand_{draw}_at'], u)
            ch[f'hand_{draw}_aim'] = chest.turn.slerp(on_string[f'hand_{draw}_aim'], u)
            ch[f'hand_{draw}_world'] = 1.0
            ch[f'elbow_{draw}'] = on_string[f'elbow_{draw}']
        if w.arrow and w.quiver and f in hidden:
            w.arrow_to(ch, rig.solve(ch), *w.stowed(rig.solve(ch)))
        return ch

    return Clip(n, pose, marks={'height': height}, hits=looses)


# Elrond's and Galadriel's bolt: a sorcerer's attack, loosed from what the hand holds up.


@style('attack', 'bolt')
def bolt(rig, hand='r', seconds=0.6, rise=10.0, reach=0.95):
    """A bolt loosed from the hand, a sorcerer's attack: what it holds (hold(): an open hand from its
    wrist to its fingertips with its palm as the face, or a light held up in it) drawn back by the
    shoulder and turned up, the body turned away from the foe; then thrust out at it at the height
    of the shoulder, `reach` of the arm's length, the face to the foe and tipped `rise` degrees up,
    loosing the bolt on frame 3 as the body leans in after it; held a moment, and drawn back. The
    other hand swings back for balance, unless fit() holds a staff in it."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    up = math.radians(rise)
    facing = V(0, -math.cos(up), math.sin(up))  # to the foe, a little up
    raised = b.aim((0.0, -0.25, 1.0), (0.0, -1.0, 0.25))  # held upright, its face to the front
    # Frame 0, seen at full weight: wound up, drawn back by the shoulder, the body turned away.
    k.key(0, **b.arm(hand, b.near(0.26, 0.16, 0.24), raised, (0.8, 0.3, -0.5), world=1.0),
          **b.arm(off, b.wrist(off, 0.04, -0.1, 0.04)), spine=V(-5, 0, b.yaw(20)), hips=V(-1, 0, b.yaw(8)),
          hips_at=V(0, 0.02 * leg, -0.03 * leg), head=V(3, 0, b.yaw(-12)), cape=V(-4, 0, 0))
    # On its way, wide of the face as the body turns into it.
    k.key(2, 'in', **{f'hand_{hand}_at': b.near(0.2, -0.5, 0.18)})
    # Thrust out at the foe, the face to it, the body after it: the bolt leaves.
    thrust = b.rig.aim(hand, turned(V(0, -0.25, 1.0), (rise - 90 + 14, 0, 0)), facing)
    k.key(BLOW, 'in', **b.arm(hand, b.near(-0.12, -reach, 0.1), thrust, (0.8, 0.2, -0.6), world=1.0),
          **b.arm(off, b.wrist(off, 0.08, 0.14, -0.02)), spine=V(9, 0, b.yaw(-14)), hips=V(2, 0, b.yaw(-6)),
          hips_at=V(0, -0.07 * leg, -0.05 * leg), head=V(-6, 0, b.yaw(8)), cape=V(8, 0, 0))
    k.key(BLOW + 4, 'out', **b.arm(hand, b.near(-0.12, -0.92 * reach, 0.08), thrust, (0.8, 0.2, -0.6), world=1.0),
          spine=V(8, 0, b.yaw(-12)), hips_at=V(0, -0.065 * leg, -0.045 * leg))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'strike': BLOW})


# Galadriel's beacon: a light that the model stands with held up is gathered in and lifted high.


@style('cast', 'beacon')
def beacon(rig, hand='r', seconds=0.8, height=5, out=0.1):
    """A light held up as a beacon (Galadriel's star-glass, which hold() describes from the fist up to
    the top of its light): drawn in before the breast, the body gathered over it; then lifted high
    overhead at full stretch, `out` of the arm's reach out from the shoulder, at its height on frame
    `height`, the body drawn up tall and the head thrown back, the other hand spread out low; held while
    it shines, and lowered."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    upright = b.aim((0.0, -0.05, 1.0), (0.0, -1.0, 0.0))  # upright, its face to the front
    # Frame 0, seen at full weight: drawn in before the breast, the body gathered over it.
    k.key(0, **b.arm(hand, b.near(-0.3, -0.6, -0.2), upright, (0.8, 0.3, -0.5), world=1.0),
          **b.arm(off, b.wrist(off, -0.04, -0.06, 0.06)), spine=V(8, 0, b.yaw(-6)), head=V(10, 0, 0),
          hips_at=V(0, 0, -0.05 * leg))
    # Lifted out past the face on its own side, then high at full stretch, the body drawn up after it, the
    # other hand spread out low.
    k.key(2, 'smooth', **{f'hand_{hand}_at': b.near(0.3, -0.4, 0.45)})
    k.key(height, 'out', **b.arm(hand, b.near(out, -0.12, 0.98), upright, (0.9, 0.2, -0.3), world=1.0),
          **b.arm(off, b.wrist(off, 0.25, -0.1, 0.05)), spine=V(-8, 0, 0), head=V(-14, 0, 0),
          hips_at=V(0, 0, 0.02 * leg), cape=V(6, 0, 0))
    k.key(n - 6, **b.arm(hand, b.near(out, -0.11, 0.95), upright, (0.9, 0.2, -0.3), world=1.0), spine=V(-7, 0, 0),
          head=V(-12, 0, 0), hips_at=V(0, 0, 0.012 * leg))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'height': height})


# The Nazgûl and Rohan on foot (units/ringwraith.py, eowyn.py and hama.py) -------------------------
#
# A robe to the ground, whose lower part hangs plumb under the body and rests on the ground as the
# body moves in it (robed()); and the Ringwraith's Black Breath, a hand thrust out at the enemy (grasp).


def robed(clips, bone='robe', share=0.8, sway=0.4, kick=0.25):
    """A Rig's clips, `{clip: spec}` as Rig takes them or as fit() gives them, for a robe or a long coat
    to the ground whose lower part, below the knees, is on a bone of the script's own, `bone`, hanging
    from the root (units/ringwraith.py): in every frame it goes where the hips take it and turns as they
    turn about the upright, but takes back a share `share` of their pitch and tilt, so it hangs plumb
    under the body; it twists after the knees, `sway` of the way the line between them turns, and its
    hem lifts on the side of the knee that comes forward, `kick` as many degrees as it twists, so a
    stride shows through it; and it rests on the ground where the hips would take it under, so the
    body sinks into it as they go down, as into a skirt that lies on the ground. Build the robe above it on
    the hips, reaching down inside it, so no gap opens as the body sinks. As it hangs from the root it
    is no part of the trunk (rig.trunk), so grounded() lets the hips go down into it. Back comes a
    function of the rig for each clip, as from fit()."""

    def wrapped(rig, clip, spec):
        made_clip = made(rig, clip, spec)
        pose = made_clip.pose
        top = rig.joint(rig.bones[bone][1])
        pelvis = rig.joint('pelvis')
        knees = {s: rig.joint(f'knee_{s}') for s in ('l', 'r')}
        apart = knees['l'].x - knees['r'].x

        def with_robe(f):
            ch = pose(f)
            motions = rig.solve(ch)
            hips = motions['hips']
            pitch, tilt, yaw = ch.get('hips', (0, 0, 0))
            back = hips.turn.inverted()
            ahead = {s: (back @ (motions[f'shin_{s}'].at - hips.at) + pelvis - knees[s]).y for s in ('l', 'r')}
            twist = math.degrees(math.atan2(ahead['l'] - ahead['r'], apart))
            ch[bone] = V((1 - share) * pitch, (1 - share) * tilt + kick * sway * twist, yaw + sway * twist)
            ch[f'{bone}_at'] = hips(top) - top
            low = rig.lowest(ch, [bone])
            if low < -TOUCH:
                ch[f'{bone}_at'] = ch[f'{bone}_at'] + V(0, 0, -low)
            return ch

        return made_clip.with_pose(with_robe)

    return {clip: (lambda rig, clip=clip, spec=spec: wrapped(rig, clip, spec)) for clip, spec in clips.items()}


@style('cast', 'grasp')
def grasp(rig, hand='r', seconds=0.7, height=4, reach=1.0):
    """A hand thrust out to seize the enemy, a Nazgûl's Black Breath: reared up and back, the empty
    other hand drawn back by its shoulder and the weapon low by the hip; then the hand thrust out at
    the enemy's face, the body leaning in after it and the head thrust forward, furthest on frame
    `height`; held as it clutches, hunched over it, and drawn back. `reach` is how far the hand goes,
    a share of the arm's."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    # Frame 0, seen at full weight: reared up and back, the free hand's shoulder turned back and the
    # hand drawn back by it, its fingers up.
    k.key(0, **b.arm(off, b.near(0.3, 0.12, 0.08, off), b.tip(-30), (0.9, 0.4, -0.2)),
          **b.arm(hand, b.wrist(hand, 0.06, 0.14, -0.06), b.tip(-10)),
          hips_at=V(0, 0.04 * leg, 0.0), hips=V(-3, 0, b.yaw(-8)), spine=V(-12, 0, b.yaw(-16)),
          head=V(-6, 0, b.yaw(10)), cape=V(-6, 0, 0))
    # Thrust out at the enemy's face, the body after it, the shoulder driven forward.
    k.key(height, 'in', **b.arm(off, b.near(-0.1, -1.0 * reach, 0.34, off), b.tip(-4), (0.8, 0.2, -0.6)),
          hips_at=V(0, -0.14 * leg, -0.05 * leg), hips=V(4, 0, b.yaw(8)), spine=V(14, 0, b.yaw(18)),
          head=V(-16, 0, b.yaw(-8)), cape=V(10, 0, 0))
    # Clutching: held there, over it, the fingers closing.
    k.key(height + 3, 'out', **b.arm(off, b.near(-0.1, -0.96 * reach, 0.3, off), b.tip(8)),
          spine=V(16, 0, b.yaw(16)), head=V(-14, 0, b.yaw(-7)), hips_at=V(0, -0.13 * leg, -0.06 * leg))
    k.key(n - 7, **b.arm(off, b.near(-0.08, -0.9 * reach, 0.26, off), b.tip(12)), spine=V(14, 0, b.yaw(14)),
          head=V(-11, 0, b.yaw(-6)), hips_at=V(0, -0.12 * leg, -0.055 * leg))
    k.key(n, **b.still())
    return Clip(n, k, marks={'height': height})


@style('cast', 'riposte')
def riposte(rig, hand='r', seconds=0.8, height=5, reach=1.0, rise=12.0, out=20.0, cover=1.0):
    """A parry and a riposte, a Guardian's strike from behind its shield: the shield on the other arm
    (hold() describes it from the grip up, facing the enemy) thrust up before the face as the body
    sets low behind it, the blade cocked back by the shoulder; then the shield swept out to its side
    as the blade is driven out past it and up at the enemy, `rise` degrees above level, with the body
    behind it, furthest on frame `height`; held, drawn back, and on guard again. `reach` is how far
    the hand goes, a share of the arm's; `out` turns the thrust that many degrees towards the weapon's
    own side, so it shows past the body from behind; and `cover` is how far across the face the shield
    comes."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    up = b.aim((0.0, 0.05, 1), (-0.1, -1, 0.1), off)  # the shield upright, its face to the front
    aside = b.aim((0.15, 0.0, 1), (0.45, -0.9, 0.0), off)  # turned out to its side
    t = math.radians(rise)
    outward = (0, 0, b.yaw(out))  # the thrust and the reach for it turned out about the shoulder
    ahead = b.rig.aim(hand, turned(V(0, -math.cos(t), math.sin(t)), outward), b.out(1, 0, 0))  # the edge out
    cocked = b.rig.aim(hand, turned(V(0, -0.6, 0.8), outward), b.out(1, 0, 0))
    shoulder, arm = rig.joint(f'shoulder_{hand}'), rig.reach(f'arm_{hand}')

    def near(x, y, z):
        return shoulder + arm * turned(b.out(x, y, z), outward)

    # Frame 0, seen at full weight: the shield up before the face, the body set low behind it, the
    # shield's shoulder forward, the blade cocked back by the other, its point up.
    k.key(0, **b.arm(off, b.near(-0.35 * cover, -0.8, 0.02, off), up, (0.8, 0.1, -0.6)),
          **b.arm(hand, near(0.15, 0.2, 0.12), cocked, (0.8, 0.4, -0.4), world=1.0),
          hips_at=V(0, 0.02 * leg, -0.1 * leg), hips=V(2, 0, b.yaw(6)), spine=V(6, 0, b.yaw(14)),
          head=V(-4, 0, b.yaw(-10)), cape=V(-4, 0, 0))
    # Braced behind it, gathering.
    k.key(height - 3, 'out', **b.arm(off, b.near(-0.35 * cover, -0.84, 0.0, off), up),
          **b.arm(hand, near(0.18, 0.24, 0.1), cocked, (0.8, 0.4, -0.4), world=1.0),
          hips_at=V(0, 0.03 * leg, -0.12 * leg), spine=V(8, 0, b.yaw(16)))
    # The riposte: the shield swept out to its side, the blade driven past it, its shoulder forward and
    # the body behind it.
    k.key(height, 'in', **b.arm(off, b.near(0.1, -0.62, -0.08, off), aside, (0.8, 0.2, -0.6)),
          **b.arm(hand, near(0.0, -1.0 * reach, 0.12), ahead, (0.6, 0.5, -0.5), world=1.0),
          hips_at=V(0, -0.16 * leg, -0.09 * leg), hips=V(4, 0, b.yaw(-8)), spine=V(14, 0, b.yaw(-16)),
          head=V(-10, 0, b.yaw(8)), cape=V(10, 0, 0))
    k.key(height + 3, 'out', **b.arm(hand, near(0.0, -0.96 * reach, 0.1), ahead, (0.6, 0.5, -0.5), world=1.0),
          hips_at=V(0, -0.15 * leg, -0.085 * leg), spine=V(13, 0, b.yaw(-15)))
    k.key(n - 7, **b.arm(hand, near(0.05, -0.7, 0.05), ahead, (0.6, 0.5, -0.5), world=1.0),
          **b.arm(off, b.near(0.0, -0.6, -0.1, off), aside), hips_at=V(0, -0.06 * leg, -0.05 * leg),
          spine=V(6, 0, b.yaw(-6)))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'height': height})


# The Istari (units/gandalf.py, saruman.py and radagast.py) --------------------------------------------
#
# A wizard's staff stands on the ground beside him (fit(pole=...)). His attack points it at the foe
# (point) and his casts heave it up (bar, hurl, flock); and a hand may rest on what the hips carry, as
# Gandalf's rests on Glamdring's hilt (resting()).


def staff_at(p, at, axis, world=1.0):
    """Channels for pole `p`'s hand (Pole) holding it with its grip at `at` and the staff along `axis`
    from the grip up, turned the least way from where it stands: in the model's frame, or with `world`
    0 on the chest's."""
    turn = p.axis.rotation_difference(Vector(axis).normalized())
    return p.channels(Vector(at) - turn @ (p.grip - p.wrist), turn, world)


def staff_way(b, p, lean, inward=0.0, out=0.0):
    """The way pole `p` points from its grip, from where it stands tipped `lean` degrees forward (back
    when negative), turned `inward` degrees across the front towards the other hand's side and tipped
    `out` degrees out to its own side (Body `b`, for the hand that holds it)."""
    return turn_of((0, 0, b.yaw(-inward))) @ turn_of((0, b.yaw(out), 0)) @ turn_of((lean, 0, 0)) @ p.axis


@style('attack', 'point')
def point(rig, hand='r', seconds=0.6, tip=38.0, inward=18.0, back=30.0, rise=0.55):
    """A sorcerer's shot from the head of a staff stood beside the body (hold() describes it from the
    grip up to its head; fit(pole=..., free=('attack',)) leaves it to this style). On frame 0, seen at
    full weight, it is lifted and its head drawn `back` degrees back over the shoulder, the body turned
    away to it; then thrust up and swung forward over the hand, which rises `rise` of the arm's reach
    by the body, until it points at the foe, `tip` degrees forward from upright and `inward` degrees in
    across the front, loosing the shot on frame 3 as the body leans in after it and the other hand
    swings back; held, and set down again where it stands. The hand stays close, so a long staff's head
    stays in the hex, and goes up, so its head shows over the model's own head from behind."""
    b = Body(rig, hand)
    p = Pole(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    reach = rig.reach(f'arm_{hand}')
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())

    def staff(x, y, z, lean, inward_=0.0):
        # the grip moved (x outwards, y, z) shares of the arm's reach from where it stands
        return staff_at(p, p.grip + reach * b.out(x, y, z), staff_way(b, p, lean, inward_))

    # Frame 0, seen at full weight: lifted and drawn back over the shoulder, the body turned to it.
    k.key(0, **staff(0.06, 0.2, 0.12, -back), **b.arm(off, b.wrist(off, 0.04, -0.08, 0.04)),
          hips_at=V(0, 0.015 * leg, -0.02 * leg), hips=V(-1, 0, b.yaw(6)), spine=V(-6, 0, b.yaw(14)),
          head=V(4, 0, b.yaw(-10)), cape=V(-4, 0, 0))
    # Thrust up and swung forward over the hand, gathering speed.
    k.key(1, 'in', **staff(0.04, 0.1, 0.3 * rise / 0.55, -back / 2), spine=V(-3, 0, b.yaw(8)))
    k.key(2, 'in', **staff(0.0, -0.04, 0.85 * rise, tip / 3, inward / 2), spine=V(3, 0, b.yaw(0)),
          hips=V(1, 0, b.yaw(0)))
    # Pointed at the foe, the body leaning in after it: the shot leaves.
    k.key(BLOW, 'in', **staff(-0.04, -0.12, rise, tip, inward), **b.arm(off, b.wrist(off, 0.08, 0.14, -0.02)),
          hips_at=V(0, -0.06 * leg, -0.05 * leg), hips=V(2, 0, b.yaw(-5)), spine=V(9, 0, b.yaw(-10)),
          head=V(-6, 0, b.yaw(6)), cape=V(8, 0, 0))
    k.key(BLOW + 3, 'out', **staff(-0.04, -0.11, 0.95 * rise, tip - 3, inward), spine=V(8, 0, b.yaw(-9)),
          hips_at=V(0, -0.055 * leg, -0.045 * leg))
    k.key(BLOW + 7, 'smooth', **staff(-0.03, -0.09, 0.8 * rise, tip - 8, inward * 0.8), spine=V(6, 0, b.yaw(-6)),
          hips_at=V(0, -0.04 * leg, -0.035 * leg))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'strike': BLOW})


@style('cast', 'bar')
def bar(rig, hand='r', seconds=0.8, height=4, ahead=0.45, lift=0.65, back=15.0, lean=8.0, thrust=True):
    """Barring the way with a staff stood beside the body (hold() from the grip up to its head;
    fit(pole=..., free=('cast',)) leaves it to this style): on frame 0, seen at full weight, it is
    heaved up high, its foot `lift` off the ground and its head tipped `back` degrees back, the body
    drawn up and leaning back; then struck down, its foot hitting the ground `ahead` (a share of the
    leg) in front of where it stands, at its height on frame `height`, the staff leaning `lean` degrees
    back towards the body as the body drops behind it, and with `thrust` the other hand thrust out and
    up at the foe; held as the ground shakes, and set back down where it stands."""
    b = Body(rig, hand)
    p = Pole(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())

    def raised(up, lean_, forward=0.0):
        return staff_at(p, p.grip + V(0, -forward * leg, up), staff_way(b, p, lean_))

    strike = p.butt + V(0, -ahead * leg, 0)
    # Frame 0, seen at full weight: heaved up high, the body drawn up tall and leaning back.
    k.key(0, **raised(lift, -back), **b.arm(off, b.wrist(off, 0.06, 0.1, 0.1), b.tip(-10)),
          hips_at=V(0, 0.01 * leg, 0.01 * leg), hips=V(-2, 0, b.yaw(3)), spine=V(-8, 0, b.yaw(6)),
          head=V(-10, 0, b.yaw(-4)), cape=V(-4, 0, 0))
    k.key(2, 'out', **raised(lift * 1.05, -back - 3, -0.04), spine=V(-9, 0, b.yaw(4)), head=V(-11, 0, 0))
    # Brought down hard, its foot striking the ground ahead as the body drops behind it.
    k.key(height - 1, 'in', **raised(lift * 0.35, lean * 0.5, 0.5 * ahead), spine=V(5, 0, b.yaw(0)),
          hips_at=V(0, -0.02 * leg, -0.06 * leg))
    k.key(height, 'in', **p.leaning(strike, lean, V(0, 1, 0)),
          hips_at=V(0, -0.06 * leg, -0.15 * leg), hips=V(4, 0, b.yaw(-2)), spine=V(16, 0, b.yaw(-6)),
          head=V(-12, 0, b.yaw(4)), cape=V(10, 0, 0))
    if thrust:  # the other hand thrust out and up at the foe
        k.key(height, 'in', **b.arm(off, b.near(0.22, -0.72, 0.5, off), b.tip(-60), (0.8, 0.0, -0.6)))
        k.key(n - 6, **b.arm(off, b.near(0.2, -0.68, 0.44, off), b.tip(-50)))
    k.key(height + 3, 'out', hips_at=V(0, -0.055 * leg, -0.14 * leg), spine=V(14, 0, b.yaw(-5)))
    k.key(n - 6, **p.leaning(strike, lean, V(0, 1, 0)), hips_at=V(0, -0.035 * leg, -0.1 * leg),
          spine=V(10, 0, b.yaw(-4)), head=V(-8, 0, b.yaw(3)))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'height': height})


@style('cast', 'hurl')
def hurl(rig, hand='r', seconds=0.8, height=4, tip=58.0, inward=12.0, lift=0.35, gaze=True):
    """Fire hurled from the head of a staff stood beside the body at a foe far off (hold() from the grip
    up to its head; fit(pole=..., free=('cast',)) leaves it to this style): on frame 0, seen at full
    weight, the staff is raised high, upright, the hand `lift` above where it holds it, the body drawn up
    tall, and with `gaze` the other hand holds what it carries up before the face, the head bowed to it,
    seeking the foe; the staff is tipped back, gathering, then swept over and down until its head points
    at the foe far off, `tip` degrees forward from upright and `inward` degrees in across the front, at
    its height on frame `height`, as the body is thrown after it and the other hand swings down and back;
    held, and set back down where it stands."""
    b = Body(rig, hand)
    p = Pole(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    reach = rig.reach(f'arm_{hand}')
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())

    def staff(x, y, z, lean, inward_=0.0):
        # the grip moved (x outwards, y, z) shares of the arm's reach from where it stands
        return staff_at(p, p.grip + reach * b.out(x, y, z), staff_way(b, p, lean, inward_))

    up = lift / reach
    # Frame 0, seen at full weight: the staff raised high and the head bowed to the other hand.
    k.key(0, **staff(0.12, 0.05, up, -5), hips_at=V(0, 0, 0.01 * leg), hips=V(0, 0, b.yaw(-3)),
          spine=V(-2, 0, b.yaw(-6)), head=V(18, 0, b.yaw(-16)), cape=V(-3, 0, 0))
    if gaze:
        k.key(0, **b.arm(off, b.near(-0.3, -0.75, -0.12, off), None, (0.8, 0.0, -0.6)))
        k.key(2, **b.arm(off, b.near(-0.28, -0.73, -0.08, off)))
    # Tipped back, gathering, the head coming up to the foe.
    k.key(2, 'out', **staff(0.12, 0.1, up * 1.04, -22), hips=V(-1, 0, b.yaw(4)), spine=V(-8, 0, b.yaw(8)),
          head=V(-4, 0, b.yaw(6)))
    k.key(height - 1, 'in', **staff(0.05, -0.05, up * 0.8, tip * 0.4, inward * 0.5), spine=V(2, 0, b.yaw(0)),
          hips=V(1, 0, b.yaw(0)))
    # Swept over and down at the foe far off, the body thrown after it: the fire hurled.
    k.key(height, 'in', **staff(-0.02, -0.2, up * 0.6, tip, inward), **b.arm(off, b.wrist(off, 0.12, 0.2, -0.05)),
          hips_at=V(0, -0.07 * leg, -0.06 * leg), hips=V(3, 0, b.yaw(-6)), spine=V(14, 0, b.yaw(-12)),
          head=V(-10, 0, b.yaw(6)), cape=V(10, 0, 0))
    k.key(height + 3, 'out', **staff(-0.02, -0.19, up * 0.58, tip - 3, inward), spine=V(12, 0, b.yaw(-10)),
          hips_at=V(0, -0.065 * leg, -0.055 * leg))
    k.key(n - 7, **staff(-0.02, -0.15, up * 0.5, tip - 10, inward * 0.8), spine=V(8, 0, b.yaw(-6)),
          hips_at=V(0, -0.04 * leg, -0.035 * leg))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'height': height})


@style('cast', 'flock')
def flock(rig, hand='l', seconds=0.8, height=4, bird='bird', lift=0.3, fly=(0.38, 0.55, 0.12), facing=-100.0):
    """Birds called down on the foe, as Radagast calls his flock: on frame 0, seen at full weight, the
    staff stood beside the body (hold() from the grip up to its head; fit(pole=..., free=('cast',))
    leaves it to this style) is gripped where it stands and the other hand, a bird perched on its fist
    on a bone of the model's own (`bird`, hanging from the hand), is drawn in low before the chest, the
    body crouched over them; then both are flung up, the staff raised high, the hand `lift` above where
    it holds it, and the fist thrown up and out to its side, the head thrown back, at its height on
    frame `height`, as the bird leaps from the fist and flies out and up towards the foe, `fly` (ahead,
    up and out to the fist's side) from where it sat, clear of the head, turned `facing` degrees about
    the upright to face the way it flies; it circles back and lands on the fist again as both come
    down."""
    b = Body(rig, hand)
    p = Pole(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())

    def raised(up, lean, out=0.0):
        return staff_at(p, p.grip + V(0, 0, up), staff_way(b, p, lean, 0.0, out))

    # Frame 0, seen at full weight: gathered, crouched over the staff and the fist drawn in low.
    k.key(0, **p.planted(), **b.arm(off, b.wrist(off, -0.1, 0.05, -0.25), b.tip(10), (0.8, 0.3, -0.5)),
          hips_at=V(0, 0.01 * leg, -0.06 * leg), hips=V(3, 0, b.yaw(-4)), spine=V(9, 0, b.yaw(-8)),
          head=V(8, 0, b.yaw(-6)), cape=V(4, 0, 0))
    # Rising, the fist passes out on its own side of the face, so what perches on it clears the brows.
    k.key(2, 'in', **raised(0.45 * lift, -2), **b.arm(off, b.near(0.1, -0.5, 0.35, off)), spine=V(2, 0, b.yaw(-3)),
          hips_at=V(0, 0, -0.03 * leg))
    # Flung up: the staff high, the fist thrown up and out to its side, the head back: the bird
    # leaps.
    k.key(height, 'out', **raised(lift, -6, 6), **b.arm(off, b.near(0.45, -0.42, 0.85, off), b.tip(-20), (0.9, 0.2, -0.3)),
          hips_at=V(0, 0, 0.02 * leg), hips=V(-2, 0, b.yaw(2)), spine=V(-10, 0, b.yaw(4)), head=V(-16, 0, b.yaw(2)),
          cape=V(8, 0, 0))
    k.key(height + 4, 'smooth', **raised(0.95 * lift, -5, 5), **b.arm(off, b.near(0.44, -0.4, 0.82, off)),
          spine=V(-9, 0, b.yaw(3)), head=V(-18, 0, b.yaw(0)))
    k.key(n - 8, **raised(0.8 * lift, -4, 4), **b.arm(off, b.near(0.4, -0.38, 0.7, off)), spine=V(-6, 0, b.yaw(2)),
          head=V(-12, 0, 0), hips_at=V(0, 0, 0.01 * leg))
    k.key(n - 2, 'smooth', **b.arm(off, b.wrist(off, 0.02, -0.02, 0.06)), spine=V(-1, 0, 0), head=V(-3, 0, 0))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})

    # The bird's flight, from where it sits on the fist, in the model's frame: up and out ahead, round
    # and back down onto the fist (`away` 0 on the fist, 1 in flight, for its turn).
    ahead, up, aside = fly
    flight = Keys()
    flight.key(height - 1, at=V(0, 0, 0), away=0.0)
    flight.key(height, 'out', at=b.out(0.2 * aside, -0.15 * ahead, 0.25 * up, off), away=0.6)
    flight.key(height + 5, 'out', at=b.out(0.8 * aside, -0.75 * ahead, 0.8 * up, off), away=1.0)
    flight.key(height + 10, 'smooth', at=b.out(aside, -ahead, up, off), away=1.0)
    flight.key(n - 5, 'smooth', at=b.out(0.5 * aside, -0.35 * ahead, 0.45 * up, off), away=0.8)
    flight.key(n - 1, 'out', at=V(0, 0, 0.01), away=0.1)
    flight.key(n, at=V(0, 0, 0), away=0.0)
    flying = turn_of((-18, 0, 0)) @ turn_of((0, 0, facing))  # turned to face the foe, its nose up

    def pose(f):
        ch = k(f)
        if f < height or f >= n:
            return ch
        perch = rig.solve(ch)[f'hand_{off}'].turn
        back = perch.inverted()
        ch[f'{bird}_at'] = back @ flight.value('at', f)
        ch[bird] = degrees_of(back @ perch.slerp(flying, flight.value('away', f)))
        return ch

    return Clip(n, pose, marks={'height': height})


def resting(clips, hand='l', bone='hips', held=('idle', 'move', 'attack')):
    """A Rig's clips, `{clip: spec}` as Rig takes them or as fit() gives them, with `hand` resting on a
    part that `bone` carries, as a hand rests on the hilt of a sword sheathed at the hip: in the clips
    named in `held` it goes where `bone` takes it as the model stands, turned with it, whatever the
    chest does; in the others it does as the style has it. Back comes a function of the rig for each
    clip, as from fit()."""

    def on(rig, clip, spec):
        made_clip = made(rig, clip, spec)
        if clip not in held:
            return made_clip
        pose = made_clip.pose
        wrist = rig.joint(f'wrist_{hand}')
        elbow = rig.rest[f'elbow_{hand}']

        def rests(f):
            ch = pose(f)
            carrier = rig.solve(ch)[bone]
            ch[f'hand_{hand}_at'] = carrier(wrist)
            ch[f'hand_{hand}_aim'] = carrier.turn.copy()
            ch[f'hand_{hand}_world'] = 1.0
            ch[f'elbow_{hand}'] = carrier.turn @ elbow
            return ch

        return made_clip.with_pose(rests)

    return {clip: (lambda rig, clip=clip, spec=spec: on(rig, clip, spec)) for clip, spec in clips.items()}


# The Hobbits (units/pippin.py, bilbo.py and gollum.py) -------------------------------------------
#
# Pippin and Bilbo follow Frodo (units/frodo.py), the Hobbits' reference rig: his stance and his light,
# quick run. Bilbo's cast is a stab under a riddler's raised finger (`riddle`). Pippin throws stones
# from a hand cocked by his head, which a bone of his own carries (Stone below).


@style('cast', 'riddle')
def riddle(rig, hand='r', seconds=0.7, height=4, wide=0.4, clear=0.3, up=(-0.05, -0.25, 0.1)):
    """A riddle in the dark, and a stab while the foe puzzles over it (Bilbo's Riddles in the Dark):
    lunge()'s stab, with the free hand, which the model holds up by its head, raised higher with its
    finger up as the blade is drawn back, and held up before the face as the blade goes in, furthest
    on frame `height`, rather than flung back. `up` is where that hand goes as the blade goes in, from
    where it rests: (out, back, up) in shares of its arm's reach. The blade comes back out by the hip,
    `clear` of the arm's reach further out than lunge() brings it, so the fist clears a round belly;
    `wide` is lunge()'s."""
    clip = lunge(rig, hand, seconds, height, wide=wide)
    k = clip.pose  # lunge()'s Keys, which later keys at the same frames replace
    b = Body(rig, hand)
    off = b.off
    n = clip.frames
    k.key(0, **b.arm(off, b.wrist(off, -0.02, -0.05, 0.14), b.tip(-12)))
    k.key(height, 'in', **b.arm(off, b.wrist(off, *up), b.tip(10)))
    k.key(height + 6, 'smooth', **b.arm(off, b.wrist(off, *(0.8 * u for u in up)), b.tip(6)))
    twist = b.rig.aim(hand, V(0, -1, 0), V(0, 0, 1))  # level, the edge turned up, as lunge() leaves it
    k.key(n - 7, **b.arm(hand, b.near(clear, -0.6, -0.3), twist, (0.6, 0.5, -0.5), world=1.0))
    return clip


class Stone:
    """A stone that a hand throws and then takes another from a pouch (Pippin's): on a bone of the
    model's own (`bone`, hanging from the hand, from the stone's middle out), which stays in the hand's
    fingers until it is thrown, waits in the pouch while the hand comes round to it, standing in for
    the stone the viewer flies, and is in the fingers again as they come out of the pouch. The joint
    `pouch` marks where a stone waits inside the pouch, which rides `worn`, the hips."""

    def __init__(self, rig, hand='r', bone='stone', worn='hips'):
        if bone not in rig.bones or 'pouch' not in rig.joints:
            raise RuntimeError(f'a thrown stone needs a bone "{bone}" and the joint "pouch"')
        self.rig, self.hand, self.bone, self.worn = rig, hand, bone, worn
        self.head = rig.joint(rig.bones[bone][1])  # the stone's middle
        self.wrist = rig.joint(f'wrist_{hand}')
        self.pouch = rig.joint('pouch')

    def dip(self, b, hips_at=V(0, 0, 0), rise=0.04):
        """Channels for the hand down at the pouch, reaching into it from outside, pointing down and in
        with its palm in, so the stone in its fingers is `rise` above where one waits: in the model's own
        frame, with the hips moved by `hips_at` and not turned."""
        aim = self.rig.aim(self.hand, b.out(-0.3, 0.0, -0.95), b.out(-0.95, 0.0, 0.3))
        at = self.pouch + Vector(hips_at) + V(0, 0, rise) - aim @ (self.head - self.wrist)
        return b.arm(self.hand, at, aim, (0.7, 0.6, 0.0), world=1.0)

    def stowed(self, ch):
        """Sets the stone's channels so it waits in the pouch, turned as it rests, wherever the pouch's
        bone takes it."""
        motions = self.rig.solve(ch)
        parent = motions[self.rig.bones[self.bone][0]]
        worn = motions[self.worn]
        back = parent.turn.inverted()
        ch[self.bone] = degrees_of(back @ worn.turn)
        ch[f'{self.bone}_at'] = back @ (worn(self.pouch) - parent(self.head))
        return ch

    def thrown(self, pose, loose, fetch):
        """`pose`'s channels with the stone in the pouch from frame `loose`, when it is let go, until
        frame `fetch`, when the hand is in the pouch, and in the hand's fingers otherwise."""

        def posed(f):
            ch = pose(f)
            if loose <= f < fetch:
                return self.stowed(ch)
            ch[self.bone] = V(0, 0, 0)
            ch[f'{self.bone}_at'] = V(0, 0, 0)
            return ch

        return posed


def stone_throw(rig, hand, seconds, mark, frame, path, body, stone, fetch_body):
    """A throw from a hand cocked by the head (Pippin's), its path drawn where it goes: `path` gives
    (frame, ease, wrist by the shoulder in shares of the arm's reach, the hand's direction, the spine's
    pitch and yaw) at each key up to the follow-through, the stone let go on `frame`; `body` gives
    more channels at frames. Then the hand goes down to the pouch for the next stone (Stone.dip()), its
    body bent over it as `fetch_body` says, comes up out by the shoulder and is cocked again by the
    head, as it rests."""
    b = Body(rig, hand)
    s = Stone(rig, hand, stone)
    n = frames_for(seconds)
    leg = b.leg
    fetch = n - 9  # the hand in the pouch
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    faces = leading([b.out(*aim) for _, _, _, aim, _, _ in path])
    for (f, ease, at, aim, pitch, yaw), face in zip(path, faces):
        k.key(f, ease, **b.arm(hand, b.near(*at), b.rig.aim(hand, b.out(*aim), face), (0.8, 0.4, -0.3), world=1.0),
              spine=V(pitch, 0, b.yaw(yaw)), hips=V(0, 0, b.yaw(yaw / 2)))
    for f, ease, channels in body:
        k.key(f, ease, **channels)
    # Out past the front of the hip, clear of the belly, then down into the pouch from outside it.
    clear = b.rig.aim(hand, b.out(0.1, -0.6, -0.8), b.out(-0.9, 0.2, -0.1))
    k.key(fetch - 3, 'smooth', **b.arm(hand, b.near(0.5, -0.7, -0.3), clear, (0.8, 0.4, -0.3), world=1.0))
    hips_at = V(0, -0.01 * leg, -0.05 * leg)
    k.key(fetch, 'smooth', **s.dip(b, hips_at), hips_at=hips_at, hips=V(0, 0, 0), **fetch_body)
    # Up out by the shoulder, the stone in the fingers, turning up to be cocked.
    rising = b.rig.aim(hand, b.out(0.6, 0.1, 0.8), b.out(-0.2, 0.9, 0.1))
    k.key(fetch + 4, 'smooth', **b.arm(hand, b.near(0.55, 0.05, 0.2), rising, (0.8, 0.4, -0.3), world=1.0),
          spine=V(4, 0, b.yaw(6)), hips_at=V(0, 0, -0.02 * leg), head=V(4, 0, b.yaw(4)))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, s.thrown(k, frame, fetch), marks={mark: frame})


@style('attack', 'pelt')
def pelt(rig, hand='r', seconds=0.67, stone='stone', wide=0.0):
    """A stone thrown overhand from a hand cocked by the head (Pippin's): drawn back further behind
    the shoulder, the body turned and leaning back; whipped over the shoulder, wide of the curls, and
    let go on frame 3 with the arm out ahead and the weight thrown forward; a follow-through down in
    front; then the next stone fetched from the pouch at the hip (stone_throw()). `wide` brings it over
    that share of the arm's reach further out on its own side."""
    b = Body(rig, hand)
    leg = b.leg
    path = [
        (0, 'smooth', (0.45 + wide, 0.42, 0.62), (0.25, 0.6, 0.76), -8, 22),
        (2, 'in', (0.36 + wide, -0.15, 0.86), (0.12, -0.45, 0.88), 2, 6),
        (BLOW, 'in', (0.12, -0.95, 0.42), (0.05, -0.95, 0.3), 12, -16),
        (BLOW + 3, 'out', (-0.02, -0.85, -0.05), (-0.05, -0.7, -0.7), 16, -18),
    ]
    body = [
        (0, 'smooth', dict(hips_at=V(0, 0.04 * leg, -0.03 * leg), head=V(4, 0, b.yaw(-14)))),
        (BLOW, 'in', dict(hips_at=V(0, -0.06 * leg, -0.06 * leg), head=V(-6, 0, b.yaw(10)))),
        (BLOW + 3, 'out', dict(hips_at=V(0, -0.06 * leg, -0.07 * leg))),
    ]
    fetch = dict(spine=V(6, 0, b.yaw(-4)), head=V(16, 0, b.yaw(10)))
    return stone_throw(rig, hand, seconds, 'strike', BLOW, path, body, stone, fetch)


@style('cast', 'skim')
def skim(rig, hand='r', seconds=0.8, height=4, stone='stone'):
    """A stone skimmed side-arm, low and flat, to skip from foe to foe (Pippin's Stone toss): crouched
    and turned to its side with the hand drawn back low and wide by the hip; whipped round level at the
    waist and let go on frame `height`, its height, with the arm out ahead and the body low and turned
    through after it; a follow-through across the front; then the next stone fetched from the pouch at
    the hip (stone_throw())."""
    b = Body(rig, hand)
    leg = b.leg
    path = [
        (0, 'smooth', (0.62, 0.4, -0.35), (0.7, 0.55, -0.45), 12, 34),
        (2, 'in', (0.6, -0.3, -0.38), (0.9, -0.4, -0.15), 14, 14),
        (height, 'in', (0.12, -1.0, -0.4), (0.0, -1.0, 0.05), 18, -22),
        (height + 4, 'out', (-0.35, -0.82, -0.3), (-0.75, -0.62, -0.1), 16, -30),
    ]
    body = [
        (0, 'smooth', dict(hips_at=V(0, 0.03 * leg, -0.12 * leg), head=V(-6, 0, b.yaw(-20)))),
        (height, 'in', dict(hips_at=V(0, -0.08 * leg, -0.14 * leg), head=V(-8, 0, b.yaw(14)))),
        (height + 4, 'out', dict(hips_at=V(0, -0.09 * leg, -0.13 * leg))),
    ]
    fetch = dict(spine=V(6, 0, b.yaw(-4)), head=V(16, 0, b.yaw(10)))
    return stone_throw(rig, hand, seconds, 'height', height, path, body, stone, fetch)


# Gollum (units/gollum.py) is no runner but a creature crouched on bent legs, one hand flat on the
# ground (`paw`) and the other lifted, clawed. His own styles keep the paw down or set it pawing, and
# paw_down() keeps it down in a style of the library's.


def pinned(rig, ch, paw):
    """Sets `ch`'s channels for the hand `paw` flat on the ground where it rests, whatever the body
    does."""
    ch[f'hand_{paw}_at'] = rig.joint(f'wrist_{paw}')
    ch[f'hand_{paw}_aim'] = Quaternion()
    ch[f'hand_{paw}_world'] = 1.0
    ch.pop(f'elbow_{paw}', None)  # its elbow as it rests
    return ch


def paw_down(clips, paw='l', held=('stun', 'victory')):
    """A Rig's clips, `{clip: spec}` as Rig takes them, with the hand `paw` flat on the ground where it
    rests in the clips named in `held`, as a creature on all fours keeps a forepaw down (Gollum's),
    and the body kept out of the ground (grounded()); in the others it does as the style has it. Back
    comes a function of the rig for each clip, as from fit()."""

    def on(rig, clip, spec):
        made_clip = made(rig, clip, spec)
        if clip not in held:
            return made_clip
        pose = made_clip.pose
        return made_clip.with_pose(grounded(rig, lambda f: pinned(rig, pose(f), paw)))

    return {clip: (lambda rig, clip=clip, spec=spec: on(rig, clip, spec)) for clip, spec in clips.items()}


def darting(u, turns=2, sharp=4.0):
    """A look that darts, over a loop, from -1 to 1: held one way, then darted to the other, `turns`
    times each way a loop; the higher `sharp`, the quicker the dart."""
    return math.tanh(sharp * math.sin(math.tau * turns * u)) / math.tanh(sharp)


@style('idle', 'lurk')
def lurk(rig, hand='r', paw='l', seconds=2.4, breath=1.0, look=8.0):
    """Crouched like a prowling creature, the hand `paw` flat on the ground and the other lifted
    (Gollum's): quick, shallow breaths, six to a loop, a slow rock from side to side, the head darting
    `look` degrees one way and then the other as it watches, and the lifted hand's fingers flexing."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg

    def pose(f):
        pant = breath * wave(f, n, 6)
        rock = wave(f, n, 1)
        ch = b.planted()
        ch['hips_at'] = V(0.02 * leg * rock, 0, 0.004 * leg * pant)
        ch['hips'] = V(0, -2.0 * rock, 2.0 * wave(f, n, 1, 0.1))
        ch['spine'] = V(-1.5 * pant, 2.0 * rock, -2.0 * wave(f, n, 1, 0.1))
        ch['head'] = V(1.5 * pant + 3.0 * wave(f, n, 2, 0.3), 2.0 * rock, look * darting(f / n + 0.1))
        ch.update(b.arm(hand, b.wrist(hand, 0, 0, 0.03 * wave(f, n, 3, 0.2)), b.tip(8.0 * wave(f, n, 3))))
        return pinned(rig, ch, paw)

    return Clip(n, pose, loop=True)


@style('move', 'scuttle')
def scuttle(rig, hand='r', paw='l', seconds=0.5, heavy=0.2, stride=0.32, lift=0.09, lean=6.0, reach=0.8, rise=0.08,
            splay=0.7, flat=0.3):
    """A creature's scuttle, low and quick (Gollum's): run()'s two strides a cycle, short and low on bent
    legs, with the hand `paw` pawing along the ground like a third foot, down with the foot on the
    other side, its stride `reach` of the feet's and lifted `rise` of the leg as it comes forward; the
    lifted hand held up, clawing. `splay` turns the knees that share of the way from where they point
    as it stands to level, so legs folded like a frog's fold out to the sides rather than up over
    the back. `flat` is the share of run()'s roll of each foot from heel to toe it keeps: long, flat
    feet rolled up onto their toes would lift the whole leg high. It is grounded()."""
    clip = run(rig, hand, seconds, heavy=heavy, stride=stride, lift=lift, lean=lean, carry='high', off='steady')
    n = clip.frames
    leg = min(rig.reach('leg_l'), rig.reach('leg_r'))
    ground = 0.40 + 0.06 * heavy  # as run() has it
    lands = 1 - ground / 2 if paw == 'l' else 0.5 - ground / 2  # down with the other side's foot
    wrist = rig.joint(f'wrist_{paw}')
    span = reach * stride * leg / 2
    knees = {}
    for s in ('l', 'r'):
        pole = rig.rest[f'knee_{s}']
        knees[f'knee_{s}'] = pole.lerp(V(pole.x, pole.y, 0).normalized(), splay).normalized()

    def pose(f):
        ch = clip.pose(f)
        ch.update(knees)
        for s in ('l', 'r'):  # rolled less, and lifted only as far as that needs
            pitch = ch[f'foot_{s}'].x
            ch[f'foot_{s}'] = V(flat * pitch, 0, 0)
            ch[f'foot_{s}_at'] = ch[f'foot_{s}_at'] + V(0, 0, sole_lift(rig, s, flat * pitch) - sole_lift(rig, s, pitch))
        u = (f / n - lands) % 1.0
        if u < ground:  # down, sliding back under the body as it goes on
            at = V(0, -span + 2 * span * u / ground, 0)
        else:  # lifted and brought forward
            k = (u - ground) / (1 - ground)
            at = V(0, span - 2 * span * k * k * (3 - 2 * k), rise * leg * math.sin(math.pi * k))
        pinned(rig, ch, paw)
        ch[f'hand_{paw}_at'] = wrist + at
        return ch

    return Clip(n, grounded(rig, pose), loop=True)


@style('attack', 'rake')
def rake(rig, hand='r', paw='l', seconds=0.53, wide=0.3):
    """A claw raked down at the foe (Gollum's): the lifted hand drawn up and back beside the head, `wide`
    of the arm's reach further out from it, the body reared back on its haunches; raked down and
    across in front on frame 3 as the body lunges after it, the head thrust out; held, and drawn back.
    The hand `paw` stays flat on the ground. It is grounded()."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    k = Keys(lag={'head': 1})
    k.key(0, **b.still())
    # (frame, ease, wrist by the shoulder, the hand's direction, the spine's pitch and yaw)
    path = [
        (0, 'smooth', (0.25 + wide, 0.15, 0.6), (0.2, 0.3, 0.93), -12, 16),
        (2, 'in', (0.15 + wide, -0.55, 0.45), (0.15, -0.8, 0.3), -2, 6),
        (BLOW, 'in', (-0.05, -0.95, -0.15), (-0.15, -0.6, -0.8), 14, -12),
        (BLOW + 3, 'out', (-0.2, -0.85, -0.22), (-0.3, -0.45, -0.85), 16, -16),
        (BLOW + 6, 'smooth', (-0.18, -0.84, -0.2), (-0.3, -0.5, -0.8), 14, -14),
    ]
    faces = leading([b.out(*aim) for _, _, _, aim, _, _ in path])
    for (f, ease, at, aim, pitch, yaw), face in zip(path, faces):
        k.key(f, ease, **b.arm(hand, b.near(*at), b.rig.aim(hand, b.out(*aim), face), (0.8, 0.3, -0.4), world=1.0),
              spine=V(pitch, 0, b.yaw(yaw)), hips=V(0, 0, b.yaw(yaw / 2)))
    k.key(0, hips_at=V(0, 0.03 * leg, 0.01 * leg), head=V(-8, 0, b.yaw(-8)))
    k.key(BLOW, 'in', hips_at=V(0, -0.06 * leg, -0.02 * leg), head=V(10, 0, b.yaw(8)))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, grounded(rig, lambda f: pinned(rig, k(f), paw)), marks={'strike': BLOW})


@style('cast', 'bites')
def bites(rig, hand='r', paw='l', seconds=0.8, height=4, every=3, count=3):
    """Bites at the foe as fast as the jaws can snap (Gollum's My precious): gathered, the head drawn back
    and the lifted hand cocked; then the body lunging and the head thrust out and snapping down,
    `count` times, the first on frame `height`, its height, and one `every` few frames after, the body
    drawn back a little between, as the lifted hand clutches the foe before it; then back. The hand
    `paw` stays flat on the ground. It is grounded()."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    k = Keys()
    k.key(0, **b.still())
    k.key(0, hips_at=V(0, 0.04 * leg, -0.02 * leg), spine=V(-10, 0, 0), head=V(-14, 0, 0),
          **b.arm(hand, b.wrist(hand, 0.05, 0.12, 0.25), b.tip(-25), world=1.0))
    clutch = b.arm(hand, b.near(0.0, -1.0, -0.12), b.aim((0.05, -0.75, -0.65), (0, -0.65, 0.75)), (0.8, 0.3, -0.4),
                   world=1.0)
    last = height + (count - 1) * every
    k.key(height, 'in', **clutch)
    k.key(last, 'smooth', **clutch)
    for i in range(count):
        f = height + i * every
        turn = b.yaw(5 if i % 2 else -5)
        k.key(f, 'in', hips_at=V(0, -0.07 * leg, -0.03 * leg), spine=V(14, 0, turn), head=V(18, turn, 0))
        if i < count - 1:
            k.key(f + 2, 'out', hips_at=V(0, -0.035 * leg, -0.02 * leg), spine=V(6, 0, 0), head=V(-6, 0, 0))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, grounded(rig, lambda f: pinned(rig, k(f), paw)), marks={'height': height},
                hits=[height + i * every for i in range(count)])


@style('stun', 'cowed')
def cowed(rig, hand='r', paw='l', seconds=1.2, droop=0.5, sink=0.03):
    """Dazed on all fours (Gollum's): dazed()'s swaying body and lolling head, the hand `paw` flat on
    the ground and the lifted hand sunk `sink` lower, limp, swaying a little with the body; both are
    kept where they hang whatever the chest does, since a hand held far out before the body would
    swing into the ground as it slumps. It is grounded()."""
    clip = dazed(rig, hand, seconds, droop=droop)
    n = clip.frames
    wrist = rig.joint(f'wrist_{hand}')

    def pose(f):
        ch = pinned(rig, clip.pose(f), paw)
        sway = V(0.02 * wave(f, n, 1), 0.01 * wave(f, n, 1, 0.25), 0.01 * wave(f, n, 1, 0.3))
        ch[f'hand_{hand}_at'] = wrist + sway - V(0, 0, sink)
        ch[f'hand_{hand}_aim'] = turn_of((6 + 4 * wave(f, n, 1, 0.1), 0, 4 * wave(f, n, 1)))
        ch[f'hand_{hand}_world'] = 1.0
        ch.pop(f'elbow_{hand}', None)
        low = rig.lowest(ch, [f'hand_{hand}'])
        if low < TOUCH:  # no lower than the ground: its fingertips rest on it
            ch[f'hand_{hand}_at'] = ch[f'hand_{hand}_at'] + V(0, 0, TOUCH - low)
        return ch

    return Clip(n, grounded(rig, pose), loop=True)


@style('death', 'sprawl')
def sprawl(rig, hand='r', paw='l', seconds=0.5):
    """Struck: reared back with a shriek, the head thrown back and the lifted hand flung up; then down
    flat on the belly, the hands splayed on the ground ahead and the legs sprawled behind, the head
    down between the hands (Gollum's). Ends low inside the hex; it is grounded()."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = paw
    k = Keys(lag={'head': 1})
    k.key(0, **pinned(rig, b.still(), paw))
    k.key(0, **{f'hand_{hand}_world': 1.0})
    k.key(3, 'out', hips_at=V(0, 0.03 * leg, 0.02 * leg), spine=V(-16, 0, b.yaw(6)), head=V(-22, 0, 0),
          **b.arm(hand, b.near(0.3, -0.2, 0.75), b.aim((0.2, 0.0, 1), (0, -1, 0)), (0.8, 0.3, -0.4), world=1.0))
    down = {}
    for s in ('l', 'r'):
        rest = rig.joint(f'ankle_{s}')
        down[f'foot_{s}_at'] = V(1.25 * rest.x, rest.y + 0.12 * leg, rest.z)
        down[f'foot_{s}'] = V(-30, 0, 0)
    wrist = rig.joint(f'wrist_{hand}')
    k.key(n, 'in', **down, hips_at=V(0, -0.02 * leg, -0.3 * leg), hips=V(10, 0, b.yaw(-6)),
          spine=V(22, b.yaw(-6), b.yaw(-8)), head=V(30, b.yaw(10), b.yaw(12)),
          **b.arm(hand, V(1.2 * wrist.x, wrist.y - 0.05, 0.08), b.aim((0.1, -1, 0.0), (0, 0, 1)), (0.8, 0.3, 0.2),
                  world=1.0),
          **b.arm(off, rig.joint(f'wrist_{off}') + V(0.03 * b.sign(off), -0.04, 0), Quaternion(), None, world=1.0))
    return Clip(n, grounded(rig, k))


# The Large units (units/treebeard.py and sauron.py) ------------------------------------------------
#
# Treebeard's beard and the leaves on his head sway after him (swaying()), and his cast hurls the
# boulder he holds and tears up another from the ground (heave). Sauron's mace is about as long as the
# hex is wide, too long to swing level in it: his blow comes over the top and down steep (smash), and
# his sweep turns it round the front tipped steeply down (reap); his long cape lies on his back and
# never swings in under him (draped()). Both slump deep as they die, their hips settled back (knees'
# `back`), so their heads stay inside the hex.


def swaying(clips, bone, share=0.0, lag=2, drag=0.5):
    """A Rig's clips, `{clip: spec}` as Rig takes them or as fit() gives them, with the script's own bone
    `bone`, which hangs from another (a long beard from the chin, leaves on a head, a branch), swaying
    after it: in every frame it turns as its parent turned `lag` frames before, `drag` of the way, so it
    trails behind a turn, a bow or a heave and catches up as its parent stops; and it takes back a share
    `share` of its parent's tilt from upright, so a beard hangs down from the chin as the body bows or
    rears, rather than swinging out from the chest or into it. A loop trails across its seam, so it still
    loops; a one-shot clip trails from its first frame. Where it would go under the ground, it turns
    less, so it rests on the ground. Back comes a function of the rig for each clip, as from fit()."""
    up = V(0, 0, 1)

    def swayed(rig, clip, spec):
        made_clip = made(rig, clip, spec)
        pose, n, loop = made_clip.pose, made_clip.frames, made_clip.loop
        parent = rig.bones[bone][0]
        seen = {}

        def hung(f):
            """Frame f's channels, the parent's turn, and the turn the bone would hang at."""
            if f not in seen:
                ch = pose(f)
                turn = rig.solve(ch)[parent].turn
                tilt = up.rotation_difference(turn @ up)
                seen[f] = (ch, turn, Quaternion().slerp(tilt, 1 - share) @ tilt.inverted() @ turn)
            return seen[f]

        def with_bone(f):
            ch, turn, now = hung(f)
            ch = dict(ch)
            then = hung((f - lag) % n if loop else max(f - lag, 0))[2]
            local = turn.inverted() @ now.slerp(-then if now.dot(then) < 0 else then, drag)
            ch[bone] = degrees_of(local)
            if rig.lowest(ch, [bone]) < -TOUCH:
                low, high = 0.0, 1.0  # how much of its turn keeps it out of the ground, and how much doesn't
                for _ in range(12):
                    ch[bone] = degrees_of(Quaternion().slerp(local, (low + high) / 2))
                    if rig.lowest(ch, [bone]) < -TOUCH:
                        high = (low + high) / 2
                    else:
                        low = (low + high) / 2
                ch[bone] = degrees_of(Quaternion().slerp(local, low))
            return ch

        return made_clip.with_pose(with_bone)

    return {clip: (lambda rig, clip=clip, spec=spec: swayed(rig, clip, spec)) for clip, spec in clips.items()}


def placed(rig, ch, bone, at, turn):
    """Channels with the script's own bone `bone` moved so its head is at `at` and it is turned by
    `turn`, both in the model's own frame, wherever its parent is."""
    parent = rig.solve(ch)[rig.bones[bone][0]]
    back = parent.turn.inverted()
    ch[bone] = degrees_of(back @ turn)
    ch[f'{bone}_at'] = back @ (Vector(at) - parent(rig.joint(rig.bones[bone][1])))
    return ch


@style('cast', 'heave')
def heave(rig, hand='r', seconds=0.8, height=4, boulder='boulder', inside='boulder_inside', fetch=13, room=ROOM):
    """A boulder hurled at the foe and another torn up from the ground (Treebeard's Boulder): drawn back
    high behind the shoulder in the hand it lies on, the body turned and rearing; heaved up over the
    shoulder and lobbed out ahead, let go at its height on frame `height` with the weight thrown after
    it; the arm swept on down in front as the body bows over it, down to the ground, where on frame
    `fetch` the hand grips another and tears it up, turning it back onto the palm as the body rises.

    The boulder is on a bone of the model's own, `boulder`, hanging from the hand from its middle, and
    hold() describes it from the palm to its middle. It flies on out of the hand for a frame after it
    is let go, as far as its room ahead lets it, then waits inside the body at the joint `inside` (on the
    spine), standing in for the one hurled, until the hand tears up another."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    # (frame, ease, wrist by the shoulder, the boulder's way from the palm, spine pitch and yaw)
    path = [
        (0, 'smooth', (0.32, 0.3, 0.5), (0.2, 0.45, 0.87), -10, 22),
        (2, 'in', (0.26, -0.05, 0.72), (0.1, -0.2, 0.97), -2, 10),
        (height, 'in', (0.2, -0.45, 0.6), (0.1, -0.62, 0.78), 10, -10),
        (height + 3, 'out', (0.45, -0.5, -0.05), (0.35, -0.75, -0.4), 18, -14),
        (height + 6, 'smooth', (0.45, -0.55, -0.55), (0.25, -0.6, -0.75), 28, -8),
    ]
    for f, ease, at, way, pitch, yaw in path:
        k.key(f, ease, **b.arm(hand, b.near(*at), b.rig.aim(hand, b.out(*way), V(0, -1, 0)), (0.8, 0.3, -0.4),
                               world=1.0),
              spine=V(pitch, 0, b.yaw(yaw)), hips=V(pitch / 4, 0, b.yaw(yaw / 2)))
    k.key(0, hips_at=V(0, 0.04 * leg, -0.03 * leg), head=V(-8, 0, b.yaw(-14)),
          **b.arm(off, b.wrist(off, 0.05, -0.45, 0.35), b.tip(-20)))
    k.key(height, 'in', hips_at=V(0, -0.06 * leg, -0.06 * leg), head=V(-6, 0, b.yaw(8)),
          **b.arm(off, b.wrist(off, 0.12, 0.2, 0.0), b.tip(10)))
    # Bowed over, the hand down at the ground ahead, gripping the next boulder from above: in the
    # model's own frame, the boulder resting on the ground.
    rest, middle = rig.joint(f'wrist_{hand}'), rig.joint(rig.bones[boulder][1])
    way = b.out(0.15, -0.45, -0.88).normalized()
    turn = b.rig.aim(hand, way, V(0, -1, 0))
    lowest = float((rig.points(boulder) - np.array(middle))[:, 2].min()) if len(rig.points(boulder)) else 0.0
    ground = b.near(0.0, -0.75, 0.0)
    ground.z = 0.0
    centre = ground + V(0, 0, -lowest + 0.01)
    # A boulder's middle turned with the hand: where the wrist goes so it is at `centre`.
    wrist = centre - turn @ (middle - rest)
    down = dict(hips_at=V(0, -0.1 * leg, -0.16 * leg), hips=V(10, 0, b.yaw(-4)), spine=V(36, 0, b.yaw(-6)),
                head=V(-18, 0, 0))
    k.key(fetch, 'smooth', **b.arm(hand, wrist, turn, (0.8, 0.4, -0.2), world=1.0), **down,
          **b.arm(off, b.wrist(off, 0.0, -0.3, -0.3), b.tip(30)))
    k.key(fetch + 2, 'smooth', **b.arm(hand, wrist + V(0, 0, 0.03), turn, (0.8, 0.4, -0.2), world=1.0),
          hips_at=V(0, -0.1 * leg, -0.15 * leg), spine=V(35, 0, b.yaw(-6)))
    # Up again, the boulder turned back onto the palm.
    rising = b.rig.aim(hand, b.out(0.1, -0.5, 0.6), V(0, -1, 0))
    k.key(fetch + 6, 'smooth', **b.arm(hand, b.wrist(hand, 0.05, -0.2, -0.1), rising, (0.8, 0.4, -0.3), world=1.0),
          hips_at=V(0, -0.04 * leg, -0.07 * leg), hips=V(4, 0, 0), spine=V(14, 0, b.yaw(-2)), head=V(-6, 0, 0))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    pose = kept(rig, k, room, ahead=True)
    points = rig.points(boulder)
    size = float(np.hypot(*(points - np.array(middle))[:, :2].T).max()) if len(points) else 0.0

    def reaching(centre):
        """How far the boulder reaches with its middle at `centre`, on the ground and measured against
        the cast's room (rig.measured()): its far side, straight out from the centre."""
        r = centre.length
        edge = centre * ((r + size) / r) if r > 1e-9 else centre
        return float(measured(np.array([[edge.x, edge.y, 0.0]]), True)[0])

    def held(f):
        """Where the boulder's middle is and how it is turned in frame f, in the hand."""
        m = rig.solve(pose(f))[hand_bone]
        return m(middle), m.turn

    hand_bone = f'hand_{hand}'
    (was, _), (at, flung) = held(height - 1), held(height)
    step, out = V(at.x - was.x, at.y - was.y, 0), V(at.x, at.y, 0)
    on = 1.0  # how much of its last step it flies on, out as far as its room lets it
    while on > 0 and reaching(out + on * step) > room:
        on -= 0.05
    flying = out + max(on, 0.0) * step + V(0, 0, at.z + max(at.z - was.z, 0.0) + 0.2)

    def thrown(f):
        ch = pose(f)
        if f == height + 1:
            return placed(rig, ch, boulder, flying, flung)
        if height + 1 < f < fetch:
            chest = rig.solve(ch)['spine']
            return placed(rig, ch, boulder, chest(rig.joint(inside)), chest.turn)
        ch[boulder] = V(0, 0, 0)
        ch[f'{boulder}_at'] = V(0, 0, 0)
        return ch

    return Clip(n, thrown, marks={'height': height})


def draped(clips, bone='cape', share=0.5, hang=0.0, slack=0.05, room=ROOM):
    """A Rig's clips, `{clip: spec}` as Rig takes them or as fit() gives them, for a long cape, down to the
    hem of a robe, on the script's own bone `bone`, which hangs from the spine (units/sauron.py). In every
    frame it swings a share `share` of what a style swings a cape, as a long cape swings less than a short
    one, and lies on the back as the body bows; with `hang` it takes back that share of the spine's tilt
    from upright, so it hangs more from the shoulders. Where its hem would come in under the body, nearer
    the hips than it hangs at rest by more than `slack`, or go under the ground as the body sinks, it
    swings back out; and where any of it would reach out of the hex, `room` from the centre, it swings
    in, which comes first. Back comes a function of the rig for each clip, as from fit()."""
    up = V(0, 0, 1)

    def fitted(rig, clip, spec):
        made_clip = made(rig, clip, spec)
        pose = made_clip.pose
        parent, head, tail = rig.bones[bone]
        hem, pelvis = rig.joint(tail), rig.joint('pelvis')
        behind = (hem - pelvis).y - slack  # how far behind the hips the hem must stay

        def with_cape(f):
            ch = pose(f)
            swing = turn_of(V(*(share * c for c in ch.get(bone, (0, 0, 0)))))
            ch[bone] = V(0, 0, 0)
            motions = rig.solve(ch)
            spine = motions[parent].turn
            tilt = up.rotation_difference(spine @ up)
            hung = Quaternion().slerp(tilt, 1 - hang) @ tilt.inverted() @ spine @ swing
            cape = motions[bone]
            top, hips = cape.at, motions['hips'](pelvis)
            points = posed(rig, motions, bone)  # as it hangs from the spine unturned

            def turned_back(degrees):
                """The world turn hung, turned `degrees` further back about the X axis through its top."""
                return Quaternion(V(1, 0, 0), math.radians(degrees)) @ hung

            def where(degrees):
                """Its hem, and its points, turned so."""
                turn = turned_back(degrees) @ spine.inverted()
                moved = (points - np.array(top)) @ np.array(turn.to_matrix()).T + np.array(top)
                return top + turn @ (cape(hem) - top), moved

            def far(degrees):
                moved = where(degrees)[1]
                return float(np.hypot(moved[:, 0], moved[:, 1]).max()) if len(moved) else 0.0

            def under(degrees):
                """In under the body, or under the ground, turned so."""
                at, moved = where(degrees)
                return (at - hips).y < behind or (len(moved) and float(moved[:, 2].min()) < -TOUCH)

            back = 0.0
            if under(0.0):  # swung back out
                low, high = 0.0, 60.0
                for _ in range(16):
                    mid = (low + high) / 2
                    low, high = (mid, high) if under(mid) else (low, mid)
                back = high
            if far(back) > room:  # out of the hex: swung in
                low, high = back - 60.0, back
                for _ in range(16):
                    mid = (low + high) / 2
                    low, high = (low, mid) if far(mid) <= room else (mid, high)
                back = low if far(low) <= room else back
            ch[bone] = degrees_of(spine.inverted() @ turned_back(back))
            return ch

        return made_clip.with_pose(with_cape)

    return {clip: (lambda rig, clip=clip, spec=spec: fitted(rig, clip, spec)) for clip, spec in clips.items()}


@style('attack', 'smash')
def smash(rig, hand='r', seconds=0.6, out=10.0, inward=8.0, drop=0.0, coil=0.0, slow=0):
    """An overhand blow with a weapon too long to swing level in the hex, a great mace or maul in one
    hand (Sauron's), its path drawn where it goes: raised up and back over the shoulder, the body turned
    to its side and rearing; swung up over the top with the fist high and drawn back over the shoulder,
    so its head stays in the hex as it passes level over the head; then brought down steep, out before
    the weapon's side, nearly upright, to land on frame 3 low by the knee as the body bows in behind it,
    where it shows past the body from behind; a
    rebound and a hold; then lifted back up across the front of the body, where there is room for its
    head, and up past the face to rest. `out` turns the blow that many degrees to its own side, so it
    shows past the body from behind; `inward` turns its pass over the top that many in over the head, so
    its head stays in the hex.

    `drop` (0 to 1) is for a weapon so long that, swung from level over the head down to the knee in
    the one frame before the blow lands, it would sweep level out of the hex between the two frames as
    the client shows them (fit()'s `between`): on frame 2 its head has already come over the top and
    dropped steep past its own side, the fist kept back by the shoulder, so it passes level over the
    head between frames 1 and 2, with the fist still back, and only then is the fist driven down and
    forward.

    `coil` and `slow` keep it in the hex between frames, as the client shows them (Blows kept in the
    hex between frames, below): `coil` keeps the body turned that many degrees further to the
    weapon's side on frame 2, the hips half as far, so it uncoils into the blow and the arm swings
    less between frames 2 and 3; `slow` lifts the weapon back that many frames later, so it swings
    across the front over more frames."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    # (frame, ease, degrees from upright towards the front, the fist by the shoulder, yaw to its side)
    # On frame 2, over the top, or with `drop` dropped steep past its own side, the fist kept back.
    over = (75 + 65 * drop, tuple(a + (b - a) * drop for a, b in zip((0.0, 0.16, 0.95), (0.2, 0.3, 0.3))),
            -inward + (20 + inward) * drop)
    path = [
        (0, 'smooth', -35, (0.15, 0.3, 0.7), -6),
        (1, 'in', 15, (0.05, 0.22, 0.92), -inward / 2),
        (2, 'in', over[0], over[1], over[2]),
        (BLOW, 'in', 170, (0.2, -0.8, -0.45), out),
        (BLOW + 2, 'out', 165, (0.2, -0.78, -0.4), out),
        (BLOW + 5, 'smooth', 164, (0.2, -0.77, -0.38), out),
    ]
    for f, ease, theta, at, yaw in path:
        aim, face = arc(theta, b.yaw(yaw))
        k.key(f, ease, **b.arm(hand, b.near(*at), b.rig.aim(hand, aim, face), (0.8, 0.2, -0.4), world=1.0))
    # Lifted back across the front, its head swung past the belly to the other side and up before the
    # chest and face, then over to its own side as it rests.
    for f, at, way in ((BLOW + 8 + slow, (-0.2, -0.82, -0.25), (-0.75, -0.25, -0.6)),
                       (BLOW + 11 + slow, (-0.1, -0.75, -0.4), (-0.45, -0.35, 0.82))):
        k.key(f, 'smooth', **b.arm(hand, b.near(*at), b.aim(way, (0, -1, 0)), (0.8, 0.2, -0.4), world=1.0))
    # (frame, ease, spine and hips as pitch and yaw to the weapon's side, hips forward and down as
    # shares of the leg)
    body = [
        (0, 'smooth', (-8, 14), (-2, 6), (-0.02, 0.03)),
        (1, 'in', (-3, 6), (0, 3), (0.0, 0.04)),
        (2, 'in', (3, -2 + coil), (1, -1 + coil / 2), (0.01, 0.05)),
        (BLOW, 'in', (14, -10), (4, -5), (0.03, 0.09)),
        (BLOW + 2, 'out', (13, -9), (4, -5), (0.03, 0.085)),
        (BLOW + 5, 'smooth', (12, -8), (3, -4), (0.03, 0.08)),
        (BLOW + 11 + slow, 'smooth', (2, -2), (0, -1), (0.01, 0.03)),
    ]
    for f, ease, spine, hips, (ahead, low) in body:
        k.key(f, ease, spine=V(spine[0], 0, b.yaw(spine[1])), hips=V(hips[0], 0, b.yaw(hips[1])),
              hips_at=V(0, -ahead * leg, -low * leg))
    k.key(0, head=V(5, 0, b.yaw(-8)), cape=V(-4, 0, 0), **b.arm(off, b.wrist(off, 0.0, -0.1, 0.04)))
    k.key(BLOW, 'in', head=V(-9, 0, b.yaw(6)), cape=V(10, 0, 0), **b.arm(off, b.wrist(off, 0.06, 0.14, -0.04)))
    k.key(n, **b.still())
    k.key(n, **{f'hand_{hand}_world': 1.0})
    return Clip(n, k, marks={'strike': BLOW})


@style('cast', 'reap')
def reap(rig, hand='r', seconds=0.8, height=4, drop=70.0, turn=45.0):
    """A great sweep of a weapon too long to swing level in the hex (Sauron's Sweep): held out before
    the weapon's side and tipped down steeply, `drop` degrees below level, it is swept round the front
    by the body as it turns, its head scything through the foes at the height of their knees: wound up
    turned far to its own side, straight ahead at its height on frame `height`, and on round to the
    other side, `turn` degrees either way between the hips and the spine, then held there, braced, and
    brought back. The hand stays before the chest, so the head keeps inside the hex all the way round."""
    b = Body(rig, hand)
    n = frames_for(seconds)
    leg = b.leg
    off = b.off
    k = Keys(lag={'head': 1, 'cape': 2})
    k.key(0, **b.still())
    d = math.radians(drop)

    def held(across, at):
        """The hand before the chest, its weapon tipped down and turned `across` degrees from ahead
        towards the other side."""
        a = math.radians(across)
        way = b.out(-math.sin(a) * math.cos(d), -math.cos(a) * math.cos(d), -math.sin(d))
        return b.arm(hand, b.near(*at), b.rig.aim(hand, way, b.out(-math.cos(a), math.sin(a), 0)), (0.8, 0.3, -0.4))

    h = turn / 2.2  # the hips' share of the turn
    # (frame, ease, the weapon turned across, the hand by the shoulder, hips and spine yaw to its side)
    for f, ease, across, at, hips, spine in (
        (0, 'smooth', -30, (0.05, -0.72, -0.42), h, turn - h),
        (height - 2, 'in', -15, (-0.08, -0.74, -0.44), h / 2, (turn - h) / 2),
        (height, 'linear', 0, (-0.15, -0.74, -0.45), 0, -6),
        (height + 2, 'out', 15, (-0.2, -0.72, -0.45), -h / 2, -(turn - h) / 2 - 6),
        (height + 4, 'out', 25, (-0.22, -0.7, -0.44), -h, -(turn - h)),
        (n - 7, 'smooth', 22, (-0.2, -0.7, -0.42), -h + 2, -(turn - h) + 4),
    ):
        k.key(f, ease, **held(across, at), hips=V(0, 0, b.yaw(hips)), spine=V(8, 0, b.yaw(spine)))
    k.key(0, hips_at=V(0, 0, -0.06 * leg), head=V(-2, 0, b.yaw(-turn / 2)), cape=V(4, 0, b.yaw(-6)),
          **b.arm(off, b.wrist(off, 0.05, 0.05, 0.0)))
    k.key(height, 'linear', hips_at=V(0, -0.02 * leg, -0.1 * leg), head=V(-4, 0, 0), cape=V(6, 0, b.yaw(6)))
    k.key(height + 4, 'out', hips_at=V(0, -0.02 * leg, -0.1 * leg), head=V(-4, 0, b.yaw(turn / 3)),
          **b.arm(off, b.wrist(off, 0.1, 0.12, -0.04)))
    k.key(n - 7, hips_at=V(0, -0.015 * leg, -0.09 * leg))
    # Brought back up across the front, where there is room for its head, and up past the chest to rest.
    for f, at, way, hips, spine in ((n - 4, (-0.15, -0.72, -0.4), (-0.9, -0.35, 0.0), -h / 2, -(turn - h) / 2),
                                    (n - 2, (-0.05, -0.7, -0.4), (-0.45, -0.3, 0.84), -h / 5, -(turn - h) / 5)):
        k.key(f, 'smooth', **b.arm(hand, b.near(*at), b.aim(way, (0, -1, 0)), (0.8, 0.3, -0.4)),
              hips=V(0, 0, b.yaw(hips)), spine=V(4, 0, b.yaw(spine)))
    k.key(n, **b.still())
    return Clip(n, k, marks={'height': height})


# Blows kept in the hex between frames (units/sharku.py, sauron.py)
#
# Written for blows that kept to the hex. An attack's or a cast's room now reaches further ahead
# (rig.measured()), where most of these arcs pass, so Aragorn's, Éowyn's and Khamûl's blows no longer
# need them; Sharku's cut and Sauron's smash, which still swing out past the side of the hex, do.
#
# The client turns each bone the short way round from one frame to the next (Rig.between()), so an
# arm that turns far in the one frame a blow comes down in swings what it holds round in an arc about
# the shoulder, reaching out of the hex where neither frame does; fit()'s `between` draws it in only
# so far before the fist would go into the head or the chest. A long blade comes down from over the
# head on frame 2 to the blow on frame 3, and passes the shoulder's height between them with the arm
# out at full length. So these options share the swing out over the frames before it and keep the
# blade pointing in as it passes:
#
# - chop's and rally's `elbow` brings the elbow forward and down on the frame before the blow, ahead
#   of the blade, rather than up by the head, so the upper arm turns about a third less into the blow;
# - chop's `early` and cut's `early` turn the blade further down on frame 2, and cut's `across` turns
#   it in across the front there, so it comes over level pointing ahead and is swept out to its own
#   side only as it comes down;
# - smash's `coil` keeps the body turned to the weapon's side into frame 2, so the body's turn about
#   its upright, which keeps everything as far from the middle as it was, carries the blow round, and
#   the arm swings less about the shoulder;
# - chop's and smash's `slow` lift the weapon back later, over more frames, where it swings past
#   level ahead on its way up.

ELBOW_UP = (0.7, 0.4, -0.4)  # chop's and rally's elbow before the blow: out and back, so it rides up by the head
ELBOW_LEADING = (0.3, -0.8, -0.5)  # leading the blade: forward and down, a little out


def leading_elbow(share):
    """The way the elbow points on the frame before an overhand blow (chop's frame 2, rally's frame
    before its height): `share` (0 to 1) of the way from up by the head to forward and down, leading
    the blade into the blow."""
    if not share:
        return ELBOW_UP
    return tuple(a + (b - a) * share for a, b in zip(ELBOW_UP, ELBOW_LEADING))
