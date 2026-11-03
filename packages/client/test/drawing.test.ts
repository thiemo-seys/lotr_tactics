import { createCombat } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { PRESETS } from '../src/boards.js';
import { ModelSwaps, Redraws } from '../src/drawing.js';
import { Playback } from '../src/playback.js';

// When the scene draws a frame, and when pawns swap for their models (docs/viewer-spec.md section 4,
// In the viewer).

/** A frame at 60 frames a second, in seconds. */
const FRAME = 1 / 60;

function fight(): Playback {
  return new Playback(createCombat({ seed: 1, stage: 2, teams: { A: PRESETS.duel, B: PRESETS.duel } }));
}

/** Whether each of `count` frames in a row is drawn. */
function frames(count: number, draw: () => boolean): boolean[] {
  return Array.from({ length: count }, draw);
}

describe('when the scene draws a frame', () => {
  it('draws a fight in each frame its display time moves, and a paused or finished one no more', () => {
    const redraws = new Redraws();
    const p = fight();
    expect(redraws.due(p, 0, false)).toBe(true);
    expect(redraws.due(p, 0, false)).toBe(false);
    p.advance(FRAME);
    expect(redraws.due(p, 0, false)).toBe(true);

    // A frame of real time passes before each frame is drawn.
    const next = () => {
      p.advance(FRAME);
      return redraws.due(p, 0, false);
    };
    p.playing = false;
    expect(frames(3, next)).toEqual([false, false, false]);
    p.step();
    expect(redraws.due(p, 0, false)).toBe(true);

    // Display time runs on a little past the end, then stops.
    p.playing = true;
    while (!p.combat.isOver()) p.advance(1);
    p.advance(10);
    expect(redraws.due(p, 0, false)).toBe(true);
    expect(frames(3, next)).toEqual([false, false, false]);
  });

  it('draws a new fight, even at the display time the last one was drawn at', () => {
    const redraws = new Redraws();
    redraws.due(fight(), 0, false);
    expect(redraws.due(fight(), 0, false)).toBe(true);
  });

  it('draws when a fight gives way to planning, and planning to a fight', () => {
    const redraws = new Redraws();
    const p = fight();
    redraws.due(p, 0, false);
    expect(redraws.due(null, 0, false)).toBe(true);
    expect(redraws.due(null, 0, false)).toBe(false);
    expect(redraws.due(p, 0, false)).toBe(true);
  });

  it('draws again after a change, such as a resize or a WebGL context restored, which clear the canvas', () => {
    const redraws = new Redraws();
    const p = fight();
    p.playing = false;
    redraws.due(p, 0, false);
    expect(redraws.due(p, 0, false)).toBe(false);
    redraws.change();
    expect(frames(3, () => redraws.due(p, 0, false))).toEqual([true, false, false]);

    // The same for planning that holds still and for the board alone.
    redraws.due(null, 0, false);
    redraws.change();
    expect(frames(3, () => redraws.due(null, 0, false))).toEqual([true, false, false]);
    redraws.change();
    expect(frames(3, () => redraws.due(null, 4, true))).toEqual([true, false, false]);
  });

  it('draws planning in every frame while a unit idles', () => {
    const redraws = new Redraws();
    expect(frames(5, () => redraws.due(null, 1, false))).toEqual([true, true, true, true, true]);
  });

  it('draws a paused or finished fight in every frame while a unit on the bench idles, unless under reduced motion', () => {
    const redraws = new Redraws();
    const p = fight();
    p.playing = false;
    redraws.due(p, 0, false);
    expect(frames(3, () => redraws.due(p, 2, false))).toEqual([true, true, true]);
    expect(frames(3, () => redraws.due(p, 2, true))).toEqual([false, false, false]);
  });

  it('draws planning only on a change under reduced motion, as `idle` holds its first frame', () => {
    const redraws = new Redraws();
    expect(frames(5, () => redraws.due(null, 9, true))).toEqual([true, false, false, false, false]);
    redraws.change();
    expect(frames(2, () => redraws.due(null, 9, true))).toEqual([true, false]);
  });

  it('draws the board alone, as behind the menu, and planning with only pawns and static models, only on a change', () => {
    const redraws = new Redraws();
    expect(frames(5, () => redraws.due(null, 0, false))).toEqual([true, false, false, false, false]);
  });
});

/** A unit's view in the scene: a pawn until it swaps for its model. */
interface View {
  readonly unitId: string;
  model: boolean;
}

function pawns(...units: string[]): View[] {
  return units.map((unitId) => ({ unitId, model: false }));
}

/** The scene's side of the swaps: the models loaded, how many times a view was tried, and the swap itself. */
class Scene {
  readonly loaded = new Set<string>();
  tries = 0;
  readonly views: View[] = [];

  /** Swaps a pawn for its model, if it has loaded. Whether it did. */
  readonly swap = (view: View): boolean => {
    this.tries++;
    if (view.model || !this.loaded.has(view.unitId)) return false;
    view.model = true;
    return true;
  };

  /** One frame's swaps, as the scene makes them, with the models' shader `ready` or not: how many swapped. */
  frame(swaps: ModelSwaps, ready: boolean): number {
    const loaded = this.loaded.size;
    return swaps.due(ready, loaded) ? swaps.swapIn(loaded, this.views, this.swap) : 0;
  }

  get models(): number {
    return this.views.filter((view) => view.model).length;
  }
}

const NINE = ['gimli', 'legolas', 'aragorn', 'boromir', 'frodo', 'sam', 'merry', 'pippin', 'gandalf'];

describe('when pawns swap for their models', () => {
  it('swaps none before the models’ shader is ready, however many models have loaded', () => {
    const swaps = new ModelSwaps();
    const scene = new Scene();
    scene.views.push(...pawns(...NINE));
    NINE.forEach((id) => scene.loaded.add(id));
    expect(frames(10, () => scene.frame(swaps, false) > 0)).not.toContain(true);
    expect(scene.models).toBe(0);
    expect(scene.tries).toBe(0);
  });

  it('swaps at most 3 a frame once the shader is ready, even when every model loaded long before it', () => {
    const swaps = new ModelSwaps();
    const scene = new Scene();
    NINE.forEach((id) => scene.loaded.add(id));
    // Units shown while the shader compiles are pawns, though their models have loaded.
    scene.views.push(...pawns(...NINE.slice(0, 4)));
    scene.frame(swaps, false);
    scene.views.push(...pawns(...NINE.slice(4)));
    scene.frame(swaps, false);
    const swapped = frames(5, () => scene.frame(swaps, true) > 0);
    expect(swapped).toEqual([true, true, true, false, false]);
    expect(scene.models).toBe(9);
  });

  it('goes on in the next frame where the limit stopped it', () => {
    const swaps = new ModelSwaps();
    const scene = new Scene();
    scene.views.push(...pawns(...NINE, 'treebeard'));
    NINE.forEach((id) => scene.loaded.add(id));
    scene.loaded.add('treebeard');
    expect([1, 2, 3, 4, 5].map(() => scene.frame(swaps, true))).toEqual([3, 3, 3, 1, 0]);
    expect(scene.models).toBe(10);
  });

  it('tries again only when more models load', () => {
    const swaps = new ModelSwaps();
    const scene = new Scene();
    // Monsters and summons have no models, so they stay pawns.
    scene.views.push(...pawns('gimli', 'orc-grunt', 'legolas'));
    scene.loaded.add('gimli');
    expect(scene.frame(swaps, true)).toBe(1);
    const tries = scene.tries;
    expect(frames(5, () => scene.frame(swaps, true) > 0)).not.toContain(true);
    expect(scene.tries).toBe(tries);
    scene.loaded.add('legolas');
    expect(scene.frame(swaps, true)).toBe(1);
    expect(scene.views.map((view) => view.model)).toEqual([true, false, true]);
  });
});
