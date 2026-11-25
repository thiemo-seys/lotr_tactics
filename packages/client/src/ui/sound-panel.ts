// The play page's sound button and its panel (docs/game-spec.md section 12, Sound): mute, and the
// music and effects volumes, remembered in the browser.

import type { SoundSystem } from '../audio.js';
import { readSettings, type SoundSettings } from '../sound.js';
import { textTip } from '../tips.js';
import { el, icon } from './dom.js';
import { dropdown } from './dropdown.js';
import { setTip } from './tooltip.js';

const KEY = 'lotr-tactics-sound';

/** Wires the sound button to its panel and the settings to `system`, as the person last left them. */
export function soundControls(button: HTMLElement, panel: HTMLElement, system: SoundSystem): void {
  let settings = read();
  system.set(settings);

  // A toggle in the list, like the frame cap in the menu, which leaves the list open.
  const mute = el('button', 'hud-menu-item sound-mute', icon('muted'), 'Mute', el('span', 'check'));
  mute.type = 'button';
  const music = slider('Music', settings.music);
  const effects = slider('Effects', settings.effects);
  panel.replaceChildren(mute, music.field, effects.field);

  const showMuted = () => {
    button.dataset.muted = String(settings.muted);
    mute.setAttribute('aria-pressed', String(settings.muted));
    panel.classList.toggle('is-muted', settings.muted);
  };
  const change = (next: Partial<SoundSettings>, keep = true) => {
    settings = { ...settings, ...next };
    system.set(settings);
    showMuted();
    if (keep) save(settings);
  };
  showMuted();

  setTip(button, () => textTip('Sound', settings.muted ? 'Muted.' : `Music ${settings.music}, effects ${settings.effects}.`, 'Mute, or set the volumes.'));
  // Opens under the button, and closes on a press elsewhere or Escape, like the menu.
  dropdown(button, panel);
  mute.addEventListener('click', (event) => {
    change({ muted: !settings.muted });
    if (event.detail > 0) mute.blur();
  });
  // While a slider moves, the volume follows it; it is remembered once it is let go.
  music.input.addEventListener('input', () => change({ music: music.input.valueAsNumber }, false));
  effects.input.addEventListener('input', () => change({ effects: effects.input.valueAsNumber }, false));
  for (const input of [music.input, effects.input]) input.addEventListener('change', () => save(settings));
}

function slider(label: string, value: number): { field: HTMLElement; input: HTMLInputElement } {
  const input = el('input', 'sound-slider');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.step = '1';
  input.value = String(value);
  input.setAttribute('aria-label', `${label} volume`);
  const number = el('span', 'sound-value', String(value));
  input.addEventListener('input', () => (number.textContent = input.value));
  return { field: el('label', 'sound-field', el('span', 'sound-label', label), input, number), input };
}

function read(): SoundSettings {
  try {
    return readSettings(localStorage.getItem(KEY));
  } catch {
    return readSettings(null);
  }
}

function save(settings: SoundSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // The settings just aren't remembered.
  }
}
