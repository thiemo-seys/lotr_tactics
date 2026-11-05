import { describe, expect, it } from 'vitest';
import { CAPPED_FPS, FrameCap } from '../src/frame-cap.js';

/** How many of the browser's frames, `hz` a second for `seconds` with up to `jitter` ms either way, the cap runs. */
function runs(cap: FrameCap, hz: number, seconds = 10, jitter = 0): number {
  let count = 0;
  const frames = hz * seconds;
  for (let i = 0; i < frames; i++) {
    const wobble = jitter === 0 ? 0 : (i % 2 === 0 ? -1 : 1) * jitter;
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
    expect(at144).toBeGreaterThanOrEqual(280);
    expect(at144).toBeLessThanOrEqual(300);
  });

  it('keeps 30 a second at 60 Hz when frames come a little early or late', () => {
    expect(runs(new FrameCap(true), 60, 10, 0.5)).toBe(300);
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
