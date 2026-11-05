// The optional cap on the frame rate (docs/viewer-spec.md section 6): both pages draw at most
// CAPPED_FPS frames a second while it is on, to spare the GPU, the battery and the fans. It only
// spaces out frames: display time still follows the clock, so a fight plays at the same speed and
// ends at the same moment either way. No Three.js and no DOM, so it can be tested.

/** The frame rate while the cap is on. */
export const CAPPED_FPS = 30;

const INTERVAL = 1000 / CAPPED_FPS;
/**
 * How early, in milliseconds, a frame may come and still be drawn. The browser's frames don't land
 * exactly on the cap's, so at 60 Hz the frame due at 33.3 ms may come at 33.2; without slack it
 * would wait for the next one, and the page would draw at 20 a second.
 */
const SLACK = 2;

/** Which of the browser's animation frames the page runs, given the time of each. */
export class FrameCap {
  /** When the next frame may be run; frames are kept on a steady grid while they keep up with it. */
  private next = -Infinity;

  constructor(public on = false) {}

  /** Whether to run the frame at `now`, in milliseconds. If so, it counts as run. */
  due(now: number): boolean {
    if (!this.on) return true;
    if (now + SLACK < this.next) return false;
    // After a long gap, such as a background tab or the cap just switched on, start the grid afresh
    // rather than run a burst of frames to catch up.
    this.next = now - this.next > INTERVAL ? now + INTERVAL : this.next + INTERVAL;
    return true;
  }
}
