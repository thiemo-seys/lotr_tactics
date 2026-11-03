// When the scene draws a frame, and when units' models take their pawns' place (docs/viewer-spec.md
// section 4, In the viewer). The scene asks both each frame. No Three.js and no DOM, so it can be
// tested.

import type { Playback } from './playback.js';

/**
 * How many units swap their pawn for their model in a frame. Models that load together, or wait
 * together for their shader, are set up over a few frames rather than all in one that would stall.
 */
const SWAPS_PER_FRAME = 3;

/**
 * Whether a frame has anything new to show. The canvas keeps the last frame drawn, so a paused or
 * finished fight, planning that holds still and the board alone behind the menu cost next to
 * nothing.
 */
export class Redraws {
  /**
   * Something on screen has changed besides a fight's display time and planning units' idling: the
   * camera, the units, a dragged unit or the marker; or the canvas has been cleared, which a resize
   * and a restored WebGL context both do.
   */
  private changed = true;
  /** The fight the last frame drawn showed, and its display time; null while planning. */
  private fight: Playback | null = null;
  private time = -1;

  /** Something on screen has changed, so the next frame is drawn. */
  change(): void {
    this.changed = true;
  }

  /**
   * Whether to draw a frame showing `fight` at its display time, or, with `fight` null, the planning
   * board and bench (or the board alone), where `idlers` units, on the bench during a fight too,
   * play `idle` unless `still`, reduced motion, holds them on its first frame. If so, the frame
   * counts as drawn.
   */
  due(fight: Playback | null, idlers: number, still: boolean): boolean {
    const moving = fight !== this.fight || (fight !== null && fight.time !== this.time) || (idlers > 0 && !still);
    if (!moving && !this.changed) return false;
    this.changed = false;
    this.fight = fight;
    this.time = fight === null ? -1 : fight.time;
    return true;
  }
}

/**
 * When pawns swap for their units' models. No model is drawn before the models' shader is ready, so
 * until then every unit is a pawn, however many models have loaded. Once it is ready, pawns swap
 * for the models that have loaded, at most SWAPS_PER_FRAME a frame, and again each time more load.
 */
export class ModelSwaps {
  /**
   * How many models had loaded when every view was last tried, which is only ever done with the
   * shader ready; -1 until then. So the first frame with the shader ready tries them all, however
   * long before it the last model loaded.
   */
  private seen = -1;

  /** Whether to try swapping pawns this frame: with the shader `ready`, if models have loaded since every view was last tried. */
  due(ready: boolean, loaded: number): boolean {
    return ready && loaded !== this.seen;
  }

  /**
   * Tries `swap` on each view in turn, which swaps its pawn for its model if it can and says whether
   * it did, until SWAPS_PER_FRAME have swapped; the rest wait for the next frame. Once every view has
   * been tried, none is due again until more models load. Returns how many swapped.
   */
  swapIn<V>(loaded: number, views: Iterable<V>, swap: (view: V) => boolean): number {
    let swaps = 0;
    for (const view of views) {
      if (swap(view) && ++swaps === SWAPS_PER_FRAME) return swaps;
    }
    this.seen = loaded;
    return swaps;
  }
}
