import { describe, expect, it } from 'vitest';
import { CAPPED_FPS, FrameCap } from '../src/frame-cap.js';

/** How many of the browser's frames, `hz` a second for `seconds` with some `jitter` ms early or late, the cap runs. */
function runs(cap: FrameCap, hz: number, seconds = 10, jitter = 0): number {
  let count = 0;
  const frames = hz * seconds;
  for (let i = 0; i < frames; i++) {
    // Every 4th frame from the 3rd comes early and the next late, so frames come early against the cap's grid.
    const wobble = jitter === 0 ? 0 : i % 4 === 2 ? -jitter : i % 4 === 3 ? jitter : 0;
    if (cap.due(1000 + (i * 1000) / hz + wobble)) count++;
  }
  return count;
}

describe('frame cap', () => {
  it('runs every frame while off', () => {
    expect(runs(new FrameCap(false), 144)).toBe(1440);
  });

  it(`runs ${CAPPED_FPS} frames a second while on, on 60, 120 and 144 Hz screens`, () => {
    expect(runs(new FrameCap(true), 60)).toBe(300);
    expect(runs(new FrameCap(true), 120)).toBe(300);
    // 144 Hz frames don't divide into 30 a second, so some gaps are a frame longer.
    const at144 = runs(new FrameCap(true), 144);
    // On a steady grid every 33.3 ms slot gets a frame; timing from the frame before would give 288.
    expect(at144).toBeGreaterThanOrEqual(298);
    expect(at144).toBeLessThanOrEqual(300);
  });

  it('keeps 30 a second at 60 Hz when frames come a little early or late', () => {
    expect(runs(new FrameCap(true), 60, 10, 0.5)).toBe(300);
  });

  it('runs a frame that comes up to 2 ms before its slot, rather than wait for the next', () => {
    const cap = new FrameCap(true);
    expect(cap.due(1000)).toBe(true);
    // At 60 Hz the frame for the slot at 1033.3 may come a little early; without the slack the
    // page would wait for the frame at 1050 and draw at 20 a second.
    expect(cap.due(1031.5)).toBe(true);
    expect(cap.due(1048.2)).toBe(false);
    // The grid holds: the next slot is still 1066.7, so a frame 3 ms early waits.
    expect(cap.due(1063.6)).toBe(false);
    expect(cap.due(1066.7)).toBe(true);
  });

  it('runs every frame of a screen slower than the cap', () => {
    expect(runs(new FrameCap(true), 24)).toBe(240);
  });

  it("doesn't burst to catch up after a long gap", () => {
    const cap = new FrameCap(true);
    expect(cap.due(0)).toBe(true);
    expect(cap.due(5000)).toBe(true);
    expect(cap.due(5016.7)).toBe(false);
    expect(cap.due(5033.3)).toBe(true);
  });

  it('takes effect from the next frame when switched', () => {
    const cap = new FrameCap(false);
    expect(cap.due(0)).toBe(true);
    expect(cap.due(16.7)).toBe(true);
    cap.on = true;
    expect(cap.due(33.3)).toBe(true);
    expect(cap.due(50)).toBe(false);
    cap.on = false;
    expect(cap.due(66.7)).toBe(true);
    expect(cap.due(83.3)).toBe(true);
  });
});
