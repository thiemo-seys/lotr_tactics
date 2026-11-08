// The button that switches the frame rate cap on and off (docs/viewer-spec.md section 6), on both
// pages. The choice is remembered in the browser.

import { CAPPED_FPS, FrameCap } from '../frame-cap.js';
import { textTip } from '../tips.js';
import { setTip } from './tooltip.js';

const KEY = 'lotr-tactics-frame-cap';

/** A frame cap switched by `button`, on or off as the person last left it. */
export function frameCapButton(button: HTMLElement): FrameCap {
  const cap = new FrameCap(read());
  const show = () => button.setAttribute('aria-pressed', String(cap.on));
  show();
  setTip(button, () =>
    textTip(
      `Cap at ${CAPPED_FPS} fps`,
      cap.on ? `On: at most ${CAPPED_FPS} frames a second.` : 'Off: as many frames a second as the screen shows.',
      'Fewer frames spare the graphics card and the battery. Fights play at the same speed either way.',
    ),
  );
  button.addEventListener('click', (event) => {
    cap.on = !cap.on;
    show();
    save(cap.on);
    // A click with the mouse doesn't keep the keyboard, so the space bar keeps its job on the page.
    if (event.detail > 0) button.blur();
  });
  return cap;
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

function save(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // The choice just isn't remembered.
  }
}
