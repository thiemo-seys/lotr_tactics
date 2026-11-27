import type { Host } from '@lotr-tactics/server';
import type { Action, OwnedUnit, PlayerView, Star } from '@lotr-tactics/sim';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalConnection } from '../src/connection.js';
import { PlayFlow } from '../src/flow.js';
import {
  CUES,
  DEFAULT_SOUND,
  SoundWatch,
  TICK_FROM,
  actionCue,
  cue,
  cueLength,
  listen,
  musicFor,
  note,
  readSettings,
  volumeGain,
  type Cue,
  type Hearing,
} from '../src/sound.js';

const unit = (id: number, star: Star): OwnedUnit => ({ id, unitId: 'sam', star, items: [] });

/** A player with these units on the bench, at this level. */
const player = (level: number, stars: Star[] = []): PlayerView =>
  ({ seat: 0, level, placement: null, bench: stars.map((star, i) => unit(i + 1, star)), board: [] }) as unknown as PlayerView;

const hearing = (changes: Partial<Hearing> = {}): Hearing => ({ step: 'planning', fight: null, me: player(3), secondsLeft: 20, ...changes });

afterEach(() => listen(null));

describe('sounds', () => {
  it('are made from tones that start, rise and die away, without being too loud together', () => {
    for (const [name, sound] of Object.entries(CUES)) {
      expect(sound.tones.length, name).toBeGreaterThan(0);
      for (const tone of sound.tones) {
        expect(tone.hz, name).toBeGreaterThan(20);
        expect(tone.hz, name).toBeLessThan(16000);
        expect(tone.attack, name).toBeGreaterThan(0);
        expect(tone.decay, name).toBeGreaterThan(0);
        expect(tone.gain, name).toBeGreaterThan(0);
        expect(tone.gain, name).toBeLessThanOrEqual(50);
      }
      // Tones that sound at once add up; the limiter catches a little more.
      const startsTogether = (at: number) => sound.tones.filter((t) => (t.at ?? 0) <= at && at < (t.at ?? 0) + t.attack + t.decay);
      for (const tone of sound.tones) {
        const total = startsTogether((tone.at ?? 0) + tone.attack).reduce((sum, t) => sum + t.gain, 0);
        expect(total, name).toBeLessThanOrEqual(100);
      }
      expect(cueLength(sound), name).toBeLessThanOrEqual(3.5);
    }
  });

  it('keep the small ones short, so they never get in the way', () => {
    for (const name of ['click', 'denied', 'tick', 'tickLast', 'coin', 'pickup', 'place'] as const) expect(cueLength(CUES[name]), name).toBeLessThanOrEqual(0.25);
  });

  it('name notes from A4 at 440 Hz', () => {
    expect(note('A4')).toBe(440);
    expect(note('A5')).toBe(880);
    expect(note('C4')).toBeCloseTo(261.63, 1);
    expect(note('F#4')).toBeCloseTo(369.99, 1);
    expect(note('Bb3')).toBeCloseTo(233.08, 1);
    expect(() => note('H2')).toThrow();
  });
});

describe('the music', () => {
  it('is calm out of fights and battle from a fight through its results', () => {
    expect((['menu', 'lobby', 'council', 'planning', 'over'] as const).map(musicFor)).toEqual(['calm', 'calm', 'calm', 'calm', 'calm']);
    expect((['fight', 'results', 'waiting'] as const).map(musicFor)).toEqual(['battle', 'battle', 'battle']);
  });
});

describe('action sounds', () => {
  it('go with each action, or a soft no if the rules refuse it', () => {
    const bench = { bench: 0 };
    const cases: [Action, Cue][] = [
      [{ type: 'buy', slot: 0 }, 'buy'],
      [{ type: 'sell', from: bench }, 'sell'],
      [{ type: 'move', from: bench, to: { col: 2, row: 1 } }, 'place'],
      [{ type: 'reroll' }, 'reroll'],
      [{ type: 'rerollGifts' }, 'reroll'],
      [{ type: 'buyXp' }, 'buyXp'],
      [{ type: 'lock', locked: true }, 'lock'],
      [{ type: 'equip', item: 0, to: bench }, 'equip'],
      [{ type: 'ring', to: bench }, 'equip'],
      [{ type: 'combine', item: 0, with: 1 }, 'forge'],
      [{ type: 'gift', option: 1 }, 'gift'],
      [{ type: 'pick', option: 1 }, 'pick'],
      [{ type: 'destroyRing' }, 'doom'],
    ];
    for (const [action, name] of cases) {
      expect(actionCue(action, true)).toBe(name);
      expect(actionCue(action, false)).toBe('denied');
    }
  });

  it('put a unit down quietly when it is dropped back where it was', () => {
    expect(actionCue({ type: 'move', from: { bench: 3 }, to: { bench: 3 } }, false)).toBe('place');
    expect(actionCue({ type: 'move', from: { col: 1, row: 2 }, to: { col: 1, row: 2 } }, false)).toBe('place');
    expect(actionCue({ type: 'move', from: { col: 1, row: 2 }, to: { col: 2, row: 2 } }, false)).toBe('denied');
  });

  it('play as the flow sends an action, or a soft no when it can’t be sent now', () => {
    const heard: Cue[] = [];
    listen((name) => heard.push(name));
    const sent: string[] = [];
    const flow = new PlayFlow({ send: (m) => sent.push(m.type), fight: () => {}, menu: () => {}, joined: () => {} });
    // Out of the game nothing is sent, so the action is refused.
    flow.act({ type: 'reroll' });
    flow.show = { kind: 'council' };
    flow.act({ type: 'pick', option: 0 });
    expect(heard).toEqual(['denied', 'pick']);
    expect(sent).toEqual(['act']);
  });

  it('play a soft no in planning for an action the rules refuse, and a sound as Ready is sent', async () => {
    const time = 0;
    const host: Host = { now: () => time, random: () => 0.5, token: () => 'token' };
    const heard: Cue[] = [];
    listen((name) => heard.push(name));
    const sent: string[] = [];
    let connection: LocalConnection | null = null;
    const flow = new PlayFlow({
      send: (m) => {
        sent.push(m.type === 'act' ? m.action.type : m.type);
        connection!.send(m);
      },
      fight: () => {},
      menu: () => {},
      joined: () => {},
    });
    connection = new LocalConnection(5, { message: (m) => flow.receive(m, time), closed: () => {} }, { host, autoUpdate: false });
    await new Promise((done) => setTimeout(done, 0));
    expect(flow.show.kind).toBe('planning');
    heard.length = 0;
    // Selling from an empty bench slot is refused by the rules; it is still sent, and the game refuses it too.
    const refused: Action = { type: 'sell', from: { bench: flow.me().bench.length - 1 } };
    expect(flow.me().bench.at(-1)).toBeNull();
    expect(flow.check(refused).ok).toBe(false);
    flow.act(refused);
    const allowed: Action = { type: 'lock', locked: true };
    expect(flow.check(allowed).ok).toBe(true);
    flow.act(allowed);
    flow.ready();
    expect(heard).toEqual(['denied', 'lock', 'ready']);
    expect(sent).toEqual(['sell', 'lock', 'ready']);
    connection.close();
  });

  it('reach nothing while nothing listens', () => {
    expect(() => cue('click')).not.toThrow();
  });
});

describe('the sounds that follow the game', () => {
  it('play nothing out of a game, nor on its first frame', () => {
    const watch = new SoundWatch();
    expect(watch.hear(hearing({ step: 'menu', me: null, secondsLeft: null }))).toEqual([]);
    expect(watch.hear(hearing())).toEqual([]);
  });

  it('level up, and chime for a 2★ and a bigger chime for a 3★', () => {
    const watch = new SoundWatch();
    watch.hear(hearing({ me: player(3, [1, 1]) }));
    expect(watch.hear(hearing({ me: player(4, [1, 1]) }))).toEqual(['levelUp']);
    expect(watch.hear(hearing({ me: player(4, [2]) }))).toEqual(['star2']);
    expect(watch.hear(hearing({ me: player(4, [2]) }))).toEqual([]);
    // Three 2★ copies make a 3★: fewer 2★ units, but a 3★ is the one heard.
    watch.hear(hearing({ me: player(4, [2, 2, 2]) }));
    expect(watch.hear(hearing({ me: player(4, [3]) }))).toEqual(['star3']);
    // Selling a 2★ makes no sound here; the sale's own sound plays as it is sent.
    watch.hear(hearing({ me: player(4, [2, 3]) }));
    expect(watch.hear(hearing({ me: player(4, [3]) }))).toEqual([]);
  });

  it(`tick in each of the last ${TICK_FROM} seconds of planning or a Council, higher in the last 2`, () => {
    const watch = new SoundWatch();
    const heard: Cue[][] = [];
    for (const s of [8, 7, 6, 5, 5, 4, 3, 2, 2, 1, 0]) heard.push(watch.hear(hearing({ secondsLeft: s })));
    expect(heard.flat()).toEqual(['tick', 'tick', 'tick', 'tickLast', 'tickLast']);
    expect(watch.hear(hearing({ step: 'council', secondsLeft: 4 }))).toEqual(['tick']);
  });

  it('sound a horn as the person’s fight starts and a sting as it ends, once', () => {
    const watch = new SoundWatch();
    const id = {};
    watch.hear(hearing());
    expect(watch.hear(hearing({ step: 'fight', fight: { id, outcome: 'Victory', over: false }, secondsLeft: null }))).toEqual(['fightStart']);
    expect(watch.hear(hearing({ step: 'fight', fight: { id, outcome: 'Victory', over: false }, secondsLeft: null }))).toEqual([]);
    expect(watch.hear(hearing({ step: 'fight', fight: { id, outcome: 'Victory', over: true }, secondsLeft: null }))).toEqual(['victory']);
    expect(watch.hear(hearing({ step: 'fight', fight: { id, outcome: 'Victory', over: true }, secondsLeft: null }))).toEqual([]);
    expect(watch.hear(hearing({ step: 'results', secondsLeft: null }))).toEqual([]);
  });

  it('play the sting for a fight that is skipped before it ends', () => {
    const watch = new SoundWatch();
    watch.hear(hearing());
    watch.hear(hearing({ step: 'fight', fight: { id: {}, outcome: 'Defeat', over: false } }));
    expect(watch.hear(hearing({ step: 'results' }))).toEqual(['defeat']);
    watch.hear(hearing({ step: 'fight', fight: { id: {}, outcome: 'Draw', over: true } }));
    expect(watch.hear(hearing({ step: 'results' }))).toEqual([]);
  });

  it('play a fanfare for 1st place and a toll for the rest as the game ends', () => {
    const won = new SoundWatch();
    won.hear(hearing());
    expect(won.hear(hearing({ step: 'over', me: { ...player(3), placement: 1 } as PlayerView, secondsLeft: null }))).toEqual(['champion']);
    const lost = new SoundWatch();
    lost.hear(hearing({ step: 'results' }));
    expect(lost.hear(hearing({ step: 'over', me: { ...player(3), placement: 5 } as PlayerView, secondsLeft: null }))).toEqual(['knockedOut']);
    expect(lost.hear(hearing({ step: 'over', me: { ...player(3), placement: 5 } as PlayerView, secondsLeft: null }))).toEqual([]);
  });

  it('play the toll once for a person who is out, though each round’s results take them out of the end and back', () => {
    const watch = new SoundWatch();
    const out = { ...player(3), placement: 6 } as PlayerView;
    watch.hear(hearing({ step: 'results' }));
    expect(watch.hear(hearing({ step: 'over', me: out, secondsLeft: null }))).toEqual(['knockedOut']);
    for (let round = 0; round < 3; round++) {
      expect(watch.hear(hearing({ step: 'results', me: out, secondsLeft: null }))).toEqual([]);
      expect(watch.hear(hearing({ step: 'over', me: out, secondsLeft: null }))).toEqual([]);
    }
    // A new game, after the menu, plays it again.
    watch.hear(hearing({ step: 'menu', me: null, secondsLeft: null }));
    watch.hear(hearing({ step: 'results' }));
    expect(watch.hear(hearing({ step: 'over', me: out, secondsLeft: null }))).toEqual(['knockedOut']);
  });
});

describe('sound settings', () => {
  it('start unmuted, with music at 50 and effects at 70', () => {
    expect(readSettings(null)).toEqual({ muted: false, music: 50, effects: 70 });
    expect(DEFAULT_SOUND).toEqual(readSettings(null));
  });

  it('read back what was saved, and the defaults for anything unreadable or out of range', () => {
    expect(readSettings(JSON.stringify({ muted: true, music: 20, effects: 100 }))).toEqual({ muted: true, music: 20, effects: 100 });
    expect(readSettings('not json')).toEqual(DEFAULT_SOUND);
    expect(readSettings('null')).toEqual(DEFAULT_SOUND);
    expect(readSettings(JSON.stringify({ muted: 'yes', music: 250, effects: -3 }))).toEqual({ muted: false, music: 100, effects: 0 });
    expect(readSettings(JSON.stringify({ music: 33.4 }))).toEqual({ ...DEFAULT_SOUND, music: 33 });
  });

  it('turn a volume into a gain by its square, and nothing when muted', () => {
    expect([volumeGain(0), volumeGain(50), volumeGain(100), volumeGain(100, true)]).toEqual([0, 0.25, 1, 0]);
  });
});
