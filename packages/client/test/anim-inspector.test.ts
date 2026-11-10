// The animation inspector's state and frame arithmetic (dev/anim/state.ts), and that the build
// leaves the inspector out, since it's a dev tool for pnpm dev only.

import { describe, expect, it } from 'vitest';
import config from '../vite.config.js';
import {
  CAMERAS,
  DEFAULTS,
  HOLD_SECONDS,
  advance,
  formatState,
  ghosts,
  lastFrame,
  markers,
  nextMarker,
  orbitFromOffset,
  orbitOffset,
  parseOrbit,
  parseState,
  rigTiming,
  shownTime,
  stepFrame,
} from '../dev/anim/state.js';

const UNITS = ['gimli', 'frodo', 'eomer'];

describe('the inspector in the URL', () => {
  it('opens on the first unit with the defaults when the URL says nothing', () => {
    expect(parseState('', UNITS)).toEqual({ ...DEFAULTS, unit: 'gimli' });
  });

  it('reads back what it writes', () => {
    const state = {
      ...DEFAULTS,
      unit: 'eomer',
      star: 2 as const,
      clip: 'cast' as const,
      frame: 7.25,
      playing: false,
      speed: 0.25 as const,
      camera: 'game-back' as const,
      onion: 2 as const,
      gap: 4 as const,
      trails: ['hands', 'feet'] as const,
      hex: false,
      bones: true,
      label: true,
      arena: true,
    };
    expect(parseState(formatState(state), UNITS)).toEqual(state);
  });

  it('writes only the unit for the defaults', () => {
    expect(formatState({ ...DEFAULTS, unit: 'frodo' })).toBe('#unit=frodo');
  });

  it('keeps a paused frame, so a link opens on the same pose, and leaves it out while playing', () => {
    expect(formatState({ ...DEFAULTS, unit: 'frodo', playing: false, frame: 7.256 })).toBe('#unit=frodo&frame=7.26');
    expect(formatState({ ...DEFAULTS, unit: 'frodo', playing: true, frame: 7 })).toBe('#unit=frodo');
  });

  it('opens a link with a frame paused on it, unless it says to play', () => {
    expect(parseState('#unit=frodo&frame=4', UNITS)).toMatchObject({ frame: 4, playing: false });
    expect(parseState('#unit=frodo&frame=4&play=1', UNITS)).toMatchObject({ frame: 4, playing: true });
  });

  it('takes the default for anything it doesn’t know', () => {
    const state = parseState('#unit=nobody&star=4&clip=dance&speed=3&cam=moon&onion=9&gap=3&trails=tail,head&hex=maybe&frame=-2', UNITS);
    expect(state).toEqual({ ...DEFAULTS, unit: 'gimli', trails: ['head'] });
  });

  it('keeps a camera the mouse put somewhere as an orbit', () => {
    const state = { ...DEFAULTS, unit: 'gimli', camera: { azimuth: -40, elevation: 22, distance: 5.5 } };
    expect(formatState(state)).toBe('#unit=gimli&view=-40,22,5.5');
    expect(parseState(formatState(state), UNITS).camera).toEqual(state.camera);
    expect(parseOrbit('1,2')).toBeNull();
    expect(parseOrbit('0,95,4')).toBeNull();
    expect(parseOrbit('0,10,0')).toBeNull();
  });
});

describe('the camera', () => {
  it('stands in front of the model at azimuth 0, on its left at 90, and behind it at 180', () => {
    const [x0, , z0] = orbitOffset({ azimuth: 0, elevation: 0, distance: 4 });
    expect([x0, z0].map((n) => Math.round(n * 1000) / 1000)).toEqual([0, 4]);
    const [x90, , z90] = orbitOffset({ azimuth: 90, elevation: 0, distance: 4 });
    expect([Math.round(x90), Math.round(z90)]).toEqual([4, 0]);
    expect(orbitOffset({ azimuth: 180, elevation: 0, distance: 4 })[2]).toBeCloseTo(-4);
  });

  it('turns a position back into the orbit it is on', () => {
    const orbit = { azimuth: -120, elevation: 33, distance: 7 };
    const back = orbitFromOffset(...orbitOffset(orbit));
    expect(back.azimuth).toBeCloseTo(orbit.azimuth);
    expect(back.elevation).toBeCloseTo(orbit.elevation);
    expect(back.distance).toBeCloseTo(orbit.distance);
  });

  it('frames the game views from as far and as high as the game’s camera', () => {
    // The fight viewer's camera is at (0, 12.5, 12.5), looking at (0, 0, -0.4) (src/look.ts).
    expect(CAMERAS['game-front'].distance).toBeCloseTo(Math.hypot(12.5, 12.9));
    expect(CAMERAS['game-front'].elevation).toBeCloseTo((Math.atan2(12.5, 12.9) * 180) / Math.PI);
    expect(CAMERAS['game-back'].azimuth).toBe(180);
  });
});

describe('frames', () => {
  it('counts a clip’s frames at 30 a second', () => {
    expect(lastFrame(0.667)).toBe(20);
    expect(lastFrame(2.4)).toBe(72);
  });

  it('steps to the next whole frame either way, wrapping round the ends', () => {
    expect(stepFrame(3, 1, 20)).toBe(4);
    expect(stepFrame(3.25, 1, 20)).toBe(4);
    expect(stepFrame(3.25, -1, 20)).toBe(3);
    expect(stepFrame(3, -1, 20)).toBe(2);
    expect(stepFrame(20, 1, 20)).toBe(0);
    expect(stepFrame(0, -1, 20)).toBe(20);
    expect(stepFrame(5, 1, 0)).toBe(0);
  });

  it('loops a looping clip and holds the last frame of one that plays once before it plays again', () => {
    expect(advance(0.5, 0.2, 0.6, true)).toBeCloseTo(0.1);
    const held = advance(0.5, 0.2, 0.6, false);
    expect(held).toBeCloseTo(0.7);
    expect(shownTime(held, 0.6)).toBe(0.6);
    expect(advance(0.6 + HOLD_SECONDS - 0.05, 0.1, 0.6, false)).toBeCloseTo(0.05);
  });

  it('puts the onion skin’s ghosts round the playhead, wrapping a loop and stopping at the ends of a clip that plays once', () => {
    expect(ghosts(4, 2, 2, 20, false)).toEqual([
      { offset: -2, frame: 0 },
      { offset: -1, frame: 2 },
      { offset: 1, frame: 6 },
      { offset: 2, frame: 8 },
    ]);
    expect(ghosts(1, 1, 2, 20, false)).toEqual([{ offset: 1, frame: 3 }]);
    expect(ghosts(1, 1, 2, 20, true)).toEqual([
      { offset: -1, frame: 19 },
      { offset: 1, frame: 3 },
    ]);
    expect(ghosts(4, 0, 2, 20, true)).toEqual([]);
  });
});

describe('moments', () => {
  const timing = rigTiming({ reach: 0.93, strike: 7, hits: [12, 15, 18] });

  it('reads the rig kit’s strike and hits from the armature', () => {
    expect(timing).toEqual({ strike: 7, hits: [12, 15, 18] });
    expect(rigTiming({})).toEqual({ strike: null, hits: [] });
  });

  it('marks the strike, the cast’s height and later hits, and where a dying unit breaks into shards', () => {
    expect(markers('attack', timing, 0.5)).toEqual([{ frame: 7, label: 'Strike' }]);
    expect(markers('cast', timing, 0.5).map((marker) => marker.label)).toEqual(['Height', 'Hit 2', 'Hit 3']);
    expect(markers('death', timing, 0.5)).toEqual([{ frame: 15, label: 'Shards' }]);
    expect(markers('idle', timing, 0.5)).toEqual([]);
  });

  it('jumps to the next or previous moment, wrapping round', () => {
    const list = markers('cast', timing, 0);
    expect(nextMarker(12, list, 1)?.frame).toBe(15);
    expect(nextMarker(18, list, 1)?.frame).toBe(12);
    expect(nextMarker(12, list, -1)?.frame).toBe(18);
    expect(nextMarker(13, list, -1)?.frame).toBe(12);
    expect(nextMarker(3, [], 1)).toBeNull();
  });
});

describe('the build', () => {
  it('leaves the inspector out: it builds the fight viewer and the play page only', () => {
    const input = (config as { build?: { rolldownOptions?: { input?: Record<string, string> } } }).build?.rolldownOptions?.input;
    expect(input).toEqual({ viewer: 'index.html', play: 'play.html' });
  });
});
