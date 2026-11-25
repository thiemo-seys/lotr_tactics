// The play page's sound (docs/game-spec.md section 12, Sound): which sound goes with what the person
// does and what the game shows, how each is made from tones and noise, which music track goes with
// each step, and the settings. No DOM and no Web Audio, so it can be tested; audio.ts plays it.

import { ownedUnits, type Action, type Place, type PlayerView } from '@lotr-tactics/sim';
import type { Show } from './flow.js';

/** The interface's sounds. */
export type Cue =
  | 'click'
  | 'denied'
  | 'buy'
  | 'sell'
  | 'reroll'
  | 'buyXp'
  | 'lock'
  | 'pickup'
  | 'place'
  | 'equip'
  | 'forge'
  | 'gift'
  | 'pick'
  | 'doom'
  | 'ready'
  | 'levelUp'
  | 'star2'
  | 'star3'
  | 'tick'
  | 'tickLast'
  | 'fightStart'
  | 'victory'
  | 'defeat'
  | 'draw'
  | 'hurt'
  | 'coin'
  | 'knockedOut'
  | 'champion';

/** The music: calm out of fights, battle in them. */
export type Track = 'calm' | 'battle';

export const TRACKS: readonly Track[] = ['calm', 'battle'];

export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise';

/**
 * One tone of a sound: a wave that rises to its gain over `attack` and dies away over `decay`,
 * in seconds, `at` seconds after the sound starts.
 */
export interface Tone {
  readonly wave: Wave;
  /** Pitch in Hz; for noise, the centre of its band. */
  readonly hz: number;
  /** The pitch, or noise's band, it glides to over its decay. */
  readonly to?: number;
  readonly at?: number;
  readonly attack: number;
  readonly decay: number;
  /** Loudness, in whole percents of full. */
  readonly gain: number;
  /** For noise, how narrow its band is; 1 if not given. */
  readonly q?: number;
  /** A low-pass filter on a tone, in Hz, to soften square and sawtooth waves. */
  readonly lowpass?: number;
}

export interface CueSound {
  readonly tones: readonly Tone[];
  /** How far the music is lowered while the sound plays, in whole percents. */
  readonly duck?: number;
}

/** A note's pitch in Hz from its name, such as `C5`, `F#4` or `Bb3`, with A4 at 440 Hz. */
export function note(name: string): number {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (match === null) throw new Error(`Not a note: ${name}`);
  const steps = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[match[1] as 'C'];
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const octave = Number(match[3]) - 4;
  return 440 * 2 ** ((steps + accidental + octave * 12) / 12);
}

/** A bell: a pure tone with two fainter, shorter overtones. */
function bell(name: string, at: number, gain: number, decay: number): Tone[] {
  const hz = note(name);
  return [
    { wave: 'sine', hz, at, attack: 0.004, decay, gain },
    { wave: 'sine', hz: hz * 2, at, attack: 0.004, decay: decay * 0.6, gain: gain * 0.4 },
    { wave: 'sine', hz: hz * 3.01, at, attack: 0.004, decay: decay * 0.35, gain: gain * 0.2 },
  ];
}

/** A plucked note, soft and bright. */
function pluck(name: string, at: number, gain: number, decay: number): Tone {
  return { wave: 'triangle', hz: note(name), at, attack: 0.006, decay, gain };
}

/** A brass note: a sawtooth softened by a low-pass, rising slowly. */
function brass(name: string, at: number, gain: number, decay: number, lowpass = 1400): Tone {
  return { wave: 'sawtooth', hz: note(name), at, attack: 0.05, decay, gain, lowpass };
}

/** A coin's clink. */
function clink(hz: number, at: number, gain: number): Tone[] {
  return [
    { wave: 'sine', hz, at, attack: 0.002, decay: 0.12, gain },
    { wave: 'sine', hz: hz * 1.34, at, attack: 0.002, decay: 0.07, gain: gain * 0.6 },
  ];
}

/** A low drum. */
function drum(at: number, gain: number): Tone[] {
  return [
    { wave: 'sine', hz: 90, to: 45, at, attack: 0.003, decay: 0.35, gain },
    { wave: 'noise', hz: 180, q: 0.7, at, attack: 0.002, decay: 0.12, gain: gain * 0.6 },
  ];
}

/** How each sound is made. */
export const CUES: Readonly<Record<Cue, CueSound>> = {
  click: {
    tones: [
      { wave: 'sine', hz: 1800, to: 1200, attack: 0.002, decay: 0.04, gain: 16 },
      { wave: 'noise', hz: 4000, q: 2, attack: 0.001, decay: 0.02, gain: 8 },
    ],
  },
  denied: {
    tones: [
      { wave: 'square', hz: 220, to: 185, attack: 0.005, decay: 0.09, gain: 9, lowpass: 1100 },
      { wave: 'square', hz: 165, to: 140, at: 0.1, attack: 0.005, decay: 0.12, gain: 9, lowpass: 900 },
    ],
  },
  buy: {
    tones: [{ wave: 'sine', hz: 170, to: 90, attack: 0.003, decay: 0.1, gain: 30 }, ...clink(2637, 0, 12), ...clink(3520, 0.05, 10)],
  },
  sell: {
    tones: [...clink(3136, 0, 11), ...clink(2637, 0.06, 11), ...clink(2093, 0.12, 11), { wave: 'noise', hz: 5000, q: 1, attack: 0.01, decay: 0.15, gain: 6 }],
  },
  reroll: {
    tones: [
      { wave: 'noise', hz: 900, to: 3500, q: 1.5, attack: 0.02, decay: 0.25, gain: 26 },
      { wave: 'sine', hz: 1400, at: 0.05, attack: 0.002, decay: 0.03, gain: 9 },
      { wave: 'sine', hz: 1600, at: 0.13, attack: 0.002, decay: 0.03, gain: 9 },
    ],
  },
  buyXp: {
    tones: [{ wave: 'triangle', hz: note('C5'), to: note('G5'), attack: 0.01, decay: 0.25, gain: 16 }, pluck('G5', 0.09, 12, 0.3)],
  },
  lock: {
    tones: [
      { wave: 'sine', hz: 1250, attack: 0.002, decay: 0.05, gain: 12 },
      { wave: 'sine', hz: 820, at: 0.05, attack: 0.002, decay: 0.08, gain: 14 },
      { wave: 'noise', hz: 3000, q: 2, at: 0.05, attack: 0.001, decay: 0.03, gain: 8 },
    ],
  },
  pickup: {
    tones: [
      { wave: 'noise', hz: 1500, to: 3000, q: 2, attack: 0.01, decay: 0.08, gain: 12 },
      { wave: 'sine', hz: 500, to: 760, attack: 0.005, decay: 0.08, gain: 12 },
    ],
  },
  place: {
    tones: [
      { wave: 'sine', hz: 180, to: 70, attack: 0.003, decay: 0.14, gain: 36 },
      { wave: 'noise', hz: 800, q: 0.8, attack: 0.002, decay: 0.05, gain: 16 },
    ],
  },
  equip: {
    tones: [
      { wave: 'sine', hz: 1760, attack: 0.002, decay: 0.25, gain: 11 },
      { wave: 'sine', hz: 4400, attack: 0.002, decay: 0.12, gain: 6 },
      { wave: 'noise', hz: 6000, q: 1, attack: 0.001, decay: 0.02, gain: 8 },
    ],
  },
  forge: {
    tones: [
      { wave: 'noise', hz: 3000, q: 1, attack: 0.001, decay: 0.04, gain: 20 },
      { wave: 'sine', hz: 880, attack: 0.002, decay: 0.5, gain: 15 },
      { wave: 'sine', hz: 2112, attack: 0.002, decay: 0.3, gain: 9 },
      { wave: 'sine', hz: 3432, attack: 0.002, decay: 0.15, gain: 6 },
      ...bell('E6', 0.14, 7, 0.5),
    ],
  },
  gift: {
    tones: [
      ...['A5', 'C#6', 'E6', 'A6'].map((n, i) => ({ wave: 'sine' as const, hz: note(n), at: i * 0.06, attack: 0.01, decay: 0.5, gain: 8 })),
      { wave: 'noise', hz: 8000, q: 1, attack: 0.1, decay: 0.4, gain: 4 },
    ],
  },
  pick: { tones: [...bell('D5', 0, 11, 0.5), ...bell('A5', 0.1, 9, 0.6)] },
  doom: {
    duck: 50,
    tones: [
      { wave: 'noise', hz: 200, q: 0.7, attack: 0.05, decay: 1.2, gain: 36 },
      { wave: 'sine', hz: 55, to: 40, attack: 0.02, decay: 1.2, gain: 34 },
      { wave: 'sawtooth', hz: note('D2'), attack: 0.05, decay: 0.8, gain: 10, lowpass: 300 },
    ],
  },
  ready: { tones: [pluck('G5', 0, 13, 0.15), pluck('D6', 0.08, 13, 0.25)] },
  levelUp: {
    tones: [...['C5', 'E5', 'G5', 'C6'].map((n, i) => pluck(n, i * 0.07, 13, 0.3)), { wave: 'sine', hz: note('C6'), at: 0.21, attack: 0.01, decay: 0.6, gain: 9 }],
  },
  star2: { tones: [...bell('E5', 0, 12, 0.6), ...bell('B5', 0.1, 11, 0.8)] },
  star3: {
    duck: 40,
    tones: [
      ...bell('C5', 0, 11, 0.7),
      ...bell('E5', 0.08, 11, 0.7),
      ...bell('G5', 0.16, 11, 0.8),
      ...bell('C6', 0.3, 13, 1.4),
      { wave: 'noise', hz: 7000, q: 1, at: 0.3, attack: 0.15, decay: 0.9, gain: 5 },
    ],
  },
  tick: { tones: [{ wave: 'sine', hz: 1100, attack: 0.001, decay: 0.04, gain: 14 }] },
  tickLast: { tones: [{ wave: 'sine', hz: 1500, attack: 0.001, decay: 0.06, gain: 20 }] },
  fightStart: {
    duck: 40,
    tones: [
      ...drum(0, 36),
      brass('D3', 0.02, 12, 0.9, 900),
      brass('A3', 0.04, 9, 0.9, 900),
      { wave: 'sine', hz: note('D2'), at: 0.02, attack: 0.08, decay: 1, gain: 12 },
    ],
  },
  victory: {
    duck: 60,
    tones: [
      pluck('C5', 0, 13, 0.25),
      pluck('E5', 0.1, 13, 0.25),
      pluck('G5', 0.2, 13, 0.25),
      brass('C5', 0.32, 8, 1.1),
      brass('E5', 0.32, 7, 1.1),
      brass('G5', 0.32, 7, 1.1),
      ...bell('C6', 0.32, 9, 1.2),
    ],
  },
  defeat: {
    duck: 60,
    tones: [pluck('A4', 0, 13, 0.5), pluck('F4', 0.18, 13, 0.5), pluck('D4', 0.36, 14, 0.8), { wave: 'sine', hz: note('D3'), at: 0.36, attack: 0.05, decay: 1.2, gain: 16 }],
  },
  draw: { duck: 40, tones: [pluck('D4', 0, 12, 0.8), pluck('A4', 0, 10, 0.8), { wave: 'sine', hz: note('D3'), attack: 0.04, decay: 0.9, gain: 10 }] },
  hurt: {
    tones: [
      { wave: 'sine', hz: 120, to: 45, attack: 0.003, decay: 0.25, gain: 42 },
      { wave: 'noise', hz: 400, q: 0.6, attack: 0.002, decay: 0.12, gain: 26 },
    ],
  },
  coin: { tones: clink(2960, 0, 9) },
  knockedOut: {
    duck: 70,
    tones: [
      { wave: 'sine', hz: note('A2'), attack: 0.005, decay: 2, gain: 30 },
      { wave: 'sine', hz: note('A2') * 2.4, attack: 0.005, decay: 1.2, gain: 11 },
      { wave: 'sine', hz: note('A2') * 3, attack: 0.005, decay: 0.8, gain: 7 },
      { wave: 'sine', hz: note('A2'), at: 1, attack: 0.005, decay: 2.2, gain: 26 },
      { wave: 'sine', hz: note('A2') * 2.4, at: 1, attack: 0.005, decay: 1.2, gain: 9 },
    ],
  },
  champion: {
    duck: 70,
    tones: [
      ...drum(0, 32),
      pluck('G4', 0, 12, 0.2),
      pluck('C5', 0.12, 12, 0.2),
      pluck('E5', 0.24, 12, 0.2),
      pluck('G5', 0.36, 13, 0.3),
      ...drum(0.5, 24),
      brass('C4', 0.5, 8, 1.6),
      brass('G4', 0.5, 7, 1.6),
      brass('C5', 0.5, 7, 1.6),
      brass('E5', 0.5, 6, 1.6),
      ...bell('C6', 0.5, 10, 1.8),
      ...bell('G6', 0.62, 6, 1.4),
    ],
  },
};

/** How long a sound lasts, in seconds, to its last tone's end. */
export function cueLength(sound: CueSound): number {
  return Math.max(...sound.tones.map((t) => (t.at ?? 0) + t.attack + t.decay));
}

/** The least time between two plays of the same sound, in seconds, so a stream of coins doesn't pile up. */
export const CUE_GAP = 0.03;

/** How long the music takes to cross from one track to the other, in seconds. */
export const CROSSFADE = 1.5;

/** The track for a step of the play page: battle for fights and their results, calm otherwise. */
export function musicFor(step: Show['kind']): Track {
  return step === 'fight' || step === 'results' || step === 'waiting' ? 'battle' : 'calm';
}

/** The sound of an action as it is sent, or of a refused one. */
export function actionCue(action: Action, allowed: boolean): Cue {
  if (action.type === 'move' && samePlace(action.from, action.to)) return 'place';
  if (!allowed) return 'denied';
  switch (action.type) {
    case 'buy':
      return 'buy';
    case 'sell':
      return 'sell';
    case 'move':
      return 'place';
    case 'reroll':
    case 'rerollGifts':
      return 'reroll';
    case 'buyXp':
      return 'buyXp';
    case 'lock':
      return 'lock';
    case 'equip':
    case 'ring':
      return 'equip';
    case 'combine':
      return 'forge';
    case 'gift':
      return 'gift';
    case 'pick':
      return 'pick';
    case 'destroyRing':
      return 'doom';
  }
}

function samePlace(a: Place, b: Place): boolean {
  return 'bench' in a ? 'bench' in b && a.bench === b.bench : !('bench' in b) && a.col === b.col && a.row === b.row;
}

// Sounds played from anywhere on the page, heard by whatever plays them.

type Listener = (cue: Cue) => void;
let listener: Listener | null = null;

/** Plays a sound, if anything is listening: the page's sound, or nothing in tests. */
export function cue(name: Cue): void {
  listener?.(name);
}

/** Hears every `cue`; the last listener given replaces the one before. */
export function listen(next: Listener | null): void {
  listener = next;
}

// What the game shows, for the sounds that follow it

/** What the page shows that sounds follow, each frame. */
export interface Hearing {
  readonly step: Show['kind'];
  /** The person's fight on screen: the same object while it plays, with its result for them and whether it has ended. */
  readonly fight: { readonly id: object; readonly outcome: 'Victory' | 'Defeat' | 'Draw'; readonly over: boolean } | null;
  /** The person in the game's latest view, or null out of a game. */
  readonly me: PlayerView | null;
  /** Whole seconds left on the timer shown, or null. */
  readonly secondsLeft: number | null;
}

/** Seconds left from which each second ticks, and from which it ticks higher. */
export const TICK_FROM = 5;
export const TICK_LAST_FROM = 2;

/** The sounds that follow the game: what changed since the frame before. */
export class SoundWatch {
  private last: Hearing | null = null;
  /** The fight whose ending has been heard. */
  private ended: object | null = null;

  hear(now: Hearing): Cue[] {
    const last = this.last;
    this.last = now;
    if (now.me === null) {
      this.ended = null;
      return [];
    }
    const cues: Cue[] = [];
    const fight = now.fight;
    const lastFight = last?.fight ?? null;
    if (fight !== null && fight.id !== lastFight?.id) cues.push('fightStart');
    // The fight's sting as it ends, or as it is skipped before it does.
    if (fight?.over === true) this.endFight(fight, cues);
    if (lastFight !== null && lastFight.id !== fight?.id) this.endFight(lastFight, cues);

    if (last?.me != null && last.me.seat === now.me.seat) {
      if (now.me.level > last.me.level) cues.push('levelUp');
      const [two, three] = stars(now.me);
      const [twoBefore, threeBefore] = stars(last.me);
      if (three > threeBefore) cues.push('star3');
      else if (two > twoBefore) cues.push('star2');
    }

    const s = now.secondsLeft;
    if (s !== null && s >= 1 && s <= TICK_FROM && s !== last?.secondsLeft && (now.step === 'planning' || now.step === 'council')) {
      cues.push(s <= TICK_LAST_FROM ? 'tickLast' : 'tick');
    }

    if (now.step === 'over' && last !== null && last.step !== 'over' && last.me !== null) {
      cues.push(now.me.placement === 1 ? 'champion' : 'knockedOut');
    }
    return cues;
  }

  private endFight(fight: NonNullable<Hearing['fight']>, cues: Cue[]): void {
    if (this.ended === fight.id) return;
    this.ended = fight.id;
    cues.push(fight.outcome === 'Victory' ? 'victory' : fight.outcome === 'Defeat' ? 'defeat' : 'draw');
  }
}

/** How many of a player's units are at 2★ and at 3★, on the bench and the board. */
function stars(p: PlayerView): [number, number] {
  let two = 0;
  let three = 0;
  for (const { unit } of ownedUnits(p)) {
    if (unit.star === 2) two++;
    else if (unit.star === 3) three++;
  }
  return [two, three];
}

// Settings

export interface SoundSettings {
  readonly muted: boolean;
  /** Volumes, in whole percents. */
  readonly music: number;
  readonly effects: number;
}

export const DEFAULT_SOUND: SoundSettings = { muted: false, music: 50, effects: 70 };

/** Settings as saved in the browser, or the defaults for anything missing or out of range. */
export function readSettings(saved: string | null): SoundSettings {
  let raw: Partial<Record<keyof SoundSettings, unknown>> = {};
  try {
    const parsed: unknown = JSON.parse(saved ?? '{}');
    if (typeof parsed === 'object' && parsed !== null) raw = parsed;
  } catch {
    // Unreadable: the defaults.
  }
  const volume = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value))) : fallback);
  return {
    muted: typeof raw.muted === 'boolean' ? raw.muted : DEFAULT_SOUND.muted,
    music: volume(raw.music, DEFAULT_SOUND.music),
    effects: volume(raw.effects, DEFAULT_SOUND.effects),
  };
}

/** A volume as a gain from 0 to 1, by its square, so the slider's middle sounds about half as loud. */
export function volumeGain(percent: number, muted = false): number {
  return muted ? 0 : (percent / 100) ** 2;
}
