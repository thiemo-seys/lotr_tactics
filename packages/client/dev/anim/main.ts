// The animation inspector page (dev/anim.html): pick a unit, a star level and a clip, and play,
// scrub and step it frame by frame, with the onion skin, trails and measurements in stage.ts. What
// it shows is kept in the URL, so a link opens the same pose from the same camera. A dev tool for
// `pnpm dev` only (docs/animation-plan.md, Tools).

import { UNITS, type Star, type UnitId } from '@lotr-tactics/sim';
import MODEL_FILES from 'virtual:models';
import { CLIPS, sinkDelay, type ClipName } from '../../src/animation.js';
import { copyModel } from '../../src/models.js';
import { HEX_RADIUS } from '../../src/stars.js';
import { fillIcons, setText, toggle } from '../../src/ui/dom.js';
import { displayName } from '../../src/units.js';
import '../../src/style.css';
import './anim.css';
import { SUNK, Stage } from './stage.js';
import {
  CAMERAS,
  CAMERA_NAMES,
  FPS,
  LOOPING,
  ONION_COUNTS,
  ONION_GAPS,
  SPEEDS,
  TRAILS,
  advance,
  formatState,
  ghosts,
  lastFrame,
  markers,
  nextMarker,
  orbitOf,
  parseState,
  rigTiming,
  shownTime,
  stepFrame,
  type CameraName,
  type InspectorState,
  type Marker,
  type Trail,
} from './state.js';

/**
 * How far past the limit a reach may be before it is flagged: a 2★ model is scaled to reach exactly
 * the limit, give or take rounding.
 */
const SLACK = 0.0005;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** The units with a model, cheapest first, then by name. */
const UNIT_IDS = (Object.keys(UNITS) as UnitId[])
  .filter((id) => (MODEL_FILES as readonly string[]).includes(id))
  .sort((a, b) => UNITS[a].cost - UNITS[b].cost || displayName(a).localeCompare(displayName(b)));

fillIcons(document);
const unitSelect = element<HTMLSelectElement>('unit');
const starControl = element<HTMLFieldSetElement>('star');
const clipControl = element<HTMLFieldSetElement>('clip');
const cameraSelect = element<HTMLSelectElement>('camera');
const playButton = element<HTMLButtonElement>('play');
const speedControl = element<HTMLFieldSetElement>('speed');
const onionControl = element<HTMLFieldSetElement>('onion');
const gapControl = element<HTMLFieldSetElement>('gap');
const timeline = element('timeline');
const framesLayer = timeline.querySelector('.frames') as HTMLElement;
const marksLayer = timeline.querySelector('.marks') as HTMLElement;
const playhead = timeline.querySelector('.head') as HTMLElement;
const clock = element('clock');
const status = element('status');
const measures = element('measures');
const moments = element('moments');
const checks = { hex: element<HTMLInputElement>('hex'), bones: element<HTMLInputElement>('bones'), label: element<HTMLInputElement>('label'), arena: element<HTMLInputElement>('arena') };
const trailChecks = [...document.querySelectorAll<HTMLInputElement>('input[name=trail]')];

let state: InspectorState = parseState(location.hash, UNIT_IDS);
/** Where the playhead is in the clip, in seconds; past its end while a clip that plays once holds. */
let playClock = state.frame / FPS;
let marks: Marker[] = [];

const stage = new Stage(element('view'), (orbit) => update({ camera: orbit }));

buildControls();
showModel();
stage.setOrbit(orbitOf(state.camera));
showState();

// A link pasted into the address bar of an open inspector changes only the hash.
window.addEventListener('hashchange', () => {
  const next = parseState(location.hash, UNIT_IDS);
  update(next);
  playClock = next.frame / FPS;
  stage.setOrbit(orbitOf(next.camera));
});

let last = performance.now();
requestAnimationFrame(function frame(now) {
  const seconds = Math.min((now - last) / 1000, 0.1);
  last = now;
  const length = clipLength();
  if (state.playing && length > 0) playClock = advance(playClock, seconds * state.speed, length, LOOPING.has(state.clip));
  const shown = shownTime(playClock, length);
  stage.pose(state.clip, shown);
  stage.setGhosts(
    state.clip,
    ghosts(shown * FPS, state.onion, state.gap, lastFrame(length), LOOPING.has(state.clip)).map((ghost) => ({
      offset: ghost.offset,
      seconds: Math.min(ghost.frame / FPS, length),
    })),
  );
  stage.setOverlays(state);
  if (stage.render()) {
    // The model has come in: frame it, and show what it has.
    stage.setOrbit(orbitOf(state.camera));
    buildTimeline();
  }
  showPlayhead(shown, length);
  requestAnimationFrame(frame);
});

// ---------------------------------------------------------------- State

/** Changes what is shown, and writes it into the URL. */
function update(patch: Partial<InspectorState>): void {
  const before = state;
  state = { ...state, ...patch };
  if (state.unit !== before.unit || state.star !== before.star) showModel();
  if (state.clip !== before.clip) {
    playClock = 0;
    buildTimeline();
  }
  showState();
  writeUrl();
}

let urlTimer = 0;

/**
 * Writes the state into the URL a moment after it last changed, with the playhead's frame then:
 * scrubbing changes it on every move, and browsers limit how often a page may replace its URL.
 */
function writeUrl(): void {
  window.clearTimeout(urlTimer);
  urlTimer = window.setTimeout(() => {
    history.replaceState(null, '', formatState({ ...state, frame: shownTime(playClock, clipLength()) * FPS }));
  }, 150);
}

function showModel(): void {
  const { unit, star } = state;
  stage.show(() => copyModel(unit as UnitId, star));
  buildTimeline();
}

function clipLength(): number {
  return stage.lengths?.[state.clip] ?? 0;
}

function setPlaying(playing: boolean): void {
  if (playing && clipLength() > 0 && playClock >= clipLength() && !LOOPING.has(state.clip)) playClock = 0;
  update({ playing });
}

/** Puts the playhead on a frame, pausing. */
function seek(frame: number): void {
  const length = clipLength();
  playClock = Math.min(Math.max(frame / FPS, 0), length);
  update({ playing: false });
}

function step(direction: 1 | -1): void {
  seek(stepFrame(shownTime(playClock, clipLength()) * FPS, direction, lastFrame(clipLength())));
}

function jump(direction: 1 | -1): void {
  const marker = nextMarker(shownTime(playClock, clipLength()) * FPS, marks, direction);
  if (marker !== null) seek(marker.frame);
}

// ---------------------------------------------------------------- Controls

function buildControls(): void {
  for (const id of UNIT_IDS) {
    const label = `${UNITS[id].cost}-cost`;
    let group = [...unitSelect.querySelectorAll('optgroup')].find((g) => g.label === label);
    if (group === undefined) {
      group = document.createElement('optgroup');
      group.label = label;
      unitSelect.append(group);
    }
    group.append(new Option(displayName(id), id));
  }
  segmented(clipControl, 'clip', CLIPS, (clip) => clip);
  segmented(speedControl, 'speed', SPEEDS, (speed) => `${speed}×`);
  segmented(onionControl, 'onion', ONION_COUNTS, (count) => (count === 0 ? 'Off' : String(count)));
  segmented(gapControl, 'gap', ONION_GAPS, String);
  for (const name of CAMERA_NAMES) cameraSelect.add(new Option(cameraLabel(name), name));
  cameraSelect.add(new Option('Where you put it', 'custom'));

  unitSelect.addEventListener('change', () => update({ unit: unitSelect.value }));
  starControl.addEventListener('change', () => update({ star: Number(picked(starControl)) as Star }));
  clipControl.addEventListener('change', () => update({ clip: picked(clipControl) as ClipName }));
  speedControl.addEventListener('change', () => update({ speed: Number(picked(speedControl)) as InspectorState['speed'] }));
  onionControl.addEventListener('change', () => update({ onion: Number(picked(onionControl)) as InspectorState['onion'] }));
  gapControl.addEventListener('change', () => update({ gap: Number(picked(gapControl)) as InspectorState['gap'] }));
  cameraSelect.addEventListener('change', () => {
    if (cameraSelect.value === 'custom') return;
    const camera = cameraSelect.value as CameraName;
    stage.setOrbit(CAMERAS[camera]);
    update({ camera });
  });
  for (const [name, box] of Object.entries(checks)) {
    box.addEventListener('change', () => update({ [name]: box.checked } as Partial<InspectorState>));
  }
  for (const box of trailChecks) {
    box.addEventListener('change', () => update({ trails: TRAILS.filter((trail) => trailChecks.some((b) => b.checked && b.value === trail)) }));
  }
  // A control picked with the mouse doesn't keep the keyboard, so the keys below still work.
  for (const control of document.querySelectorAll('fieldset, input[type=checkbox]')) {
    control.addEventListener('click', (event) => {
      if ((event as MouseEvent).detail > 0 && event.target instanceof HTMLInputElement) event.target.blur();
    });
  }
  playButton.addEventListener('click', () => setPlaying(!state.playing));
  element('back').addEventListener('click', () => step(-1));
  element('forward').addEventListener('click', () => step(1));
  element('copy-link').addEventListener('click', () => {
    void navigator.clipboard.writeText(location.href).then(() => flash('Link copied'));
  });

  timeline.addEventListener('pointerdown', (event) => {
    timeline.setPointerCapture(event.pointerId);
    scrub(event);
  });
  timeline.addEventListener('pointermove', (event) => {
    if (timeline.hasPointerCapture(event.pointerId)) scrub(event);
  });

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLSelectElement || (event.target instanceof HTMLInputElement && event.target.type !== 'checkbox')) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const unitIndex = UNIT_IDS.indexOf(state.unit as UnitId);
    const handled = (() => {
      switch (event.key) {
        case ' ':
          setPlaying(!state.playing);
          return true;
        case 'ArrowRight':
        case '.':
          if (event.shiftKey) jump(1);
          else step(1);
          return true;
        case 'ArrowLeft':
        case ',':
          if (event.shiftKey) jump(-1);
          else step(-1);
          return true;
        case 'Home':
          seek(0);
          return true;
        case 'End':
          seek(lastFrame(clipLength()));
          return true;
        case '[':
          update({ unit: UNIT_IDS[(unitIndex - 1 + UNIT_IDS.length) % UNIT_IDS.length]! });
          return true;
        case ']':
          update({ unit: UNIT_IDS[(unitIndex + 1) % UNIT_IDS.length]! });
          return true;
      }
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= CLIPS.length) {
        update({ clip: CLIPS[digit - 1]! });
        return true;
      }
      return false;
    })();
    if (handled) event.preventDefault();
  });
}

function scrub(event: PointerEvent): void {
  const rect = timeline.getBoundingClientRect();
  const share = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
  seek(share * lastFrame(clipLength()));
}

/** Fills a segmented control with a radio button for each value. */
function segmented<T extends string | number>(control: HTMLFieldSetElement, name: string, values: readonly T[], label: (value: T) => string): void {
  for (const value of values) {
    const option = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = String(value);
    const text = document.createElement('span');
    text.textContent = label(value);
    option.append(input, text);
    control.append(option);
  }
}

function picked(control: HTMLFieldSetElement): string {
  return control.querySelector<HTMLInputElement>('input:checked')?.value ?? '';
}

function check(control: HTMLFieldSetElement, value: string | number): void {
  const input = control.querySelector<HTMLInputElement>(`input[value="${value}"]`);
  if (input !== null) input.checked = true;
}

function cameraLabel(name: CameraName): string {
  const labels: Record<CameraName, string> = {
    'game-front': 'Game, from the front',
    'game-back': 'Game, from behind',
    hero: 'Three-quarter',
    front: 'Front',
    left: 'Its left',
    back: 'Back',
    right: 'Its right',
  };
  return labels[name];
}

/** Shows the state in the controls. */
function showState(): void {
  unitSelect.value = state.unit;
  check(starControl, state.star);
  check(clipControl, state.clip);
  check(speedControl, state.speed);
  check(onionControl, state.onion);
  check(gapControl, state.gap);
  cameraSelect.value = typeof state.camera === 'string' ? state.camera : 'custom';
  for (const [name, box] of Object.entries(checks)) box.checked = state[name as keyof typeof checks];
  for (const box of trailChecks) box.checked = state.trails.includes(box.value as Trail);
  toggle(playButton, 'playing', state.playing);
  playButton.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
}

// ---------------------------------------------------------------- Timeline and readouts

/** Draws the clip's frames and moments on the timeline, once its model is in. */
function buildTimeline(): void {
  framesLayer.replaceChildren();
  marksLayer.replaceChildren();
  moments.replaceChildren();
  const length = clipLength();
  const last = lastFrame(length);
  marks = [];
  if (!stage.ready) {
    setText(status, 'Loading the model…');
    return;
  }
  if (!stage.rigged) {
    setText(status, 'This model is static: it has no rig, as the 3★ book models don’t yet.');
    moments.textContent = 'None: the model is static.';
    toggle(document.body, 'static', true);
    return;
  }
  setText(status, '');
  toggle(document.body, 'static', false);
  for (let f = 0; f <= last; f++) {
    const tick = document.createElement('span');
    tick.className = f % 5 === 0 ? 'major' : '';
    tick.style.left = `${(f / last) * 100}%`;
    if (f % 5 === 0) tick.dataset.frame = String(f);
    framesLayer.append(tick);
  }
  const lengths = stage.lengths;
  marks = markers(state.clip, rigTiming(stage.extras), lengths === null ? 0 : sinkDelay(lengths));
  for (const marker of marks) {
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.style.left = `${(marker.frame / last) * 100}%`;
    mark.title = `${marker.label}: frame ${round(marker.frame, 2)}`;
    marksLayer.append(mark);
    const button = document.createElement('button');
    button.className = 'btn btn-ghost btn-sm';
    button.textContent = `${marker.label} · frame ${round(marker.frame, 2)} · ${(marker.frame / FPS).toFixed(2)} s`;
    button.addEventListener('click', () => seek(marker.frame));
    moments.append(button);
  }
  if (marks.length === 0) moments.textContent = 'None in this clip.';
  timeline.setAttribute('aria-valuemax', String(last));
}

/** The pose last measured, so a paused clip isn't measured again each frame. */
let measuredKey = '';

function showPlayhead(shown: number, length: number): void {
  const last = lastFrame(length);
  const frame = shown * FPS;
  playhead.style.left = last > 0 ? `${(frame / last) * 100}%` : '0';
  timeline.setAttribute('aria-valuenow', String(round(frame, 2)));
  setText(clock, last > 0 ? `Frame ${frame.toFixed(2)} / ${last} · ${shown.toFixed(3)} s / ${length.toFixed(3)} s` : '');
  toggle(playButton, 'playing', state.playing);

  const key = `${state.unit}|${state.star}|${state.clip}|${shown}|${stage.ready}`;
  if (key === measuredKey) return;
  measuredKey = key;
  const now = stage.measure();
  const extent = stage.extent;
  const label = stage.label;
  const rows: [string, string, boolean][] = [];
  if (now !== null) {
    rows.push(['Reach now', metres(now.reach), now.reach > HEX_RADIUS + SLACK]);
    rows.push(['Lowest now', metres(now.low), now.low < SUNK]);
    rows.push(['Top now', metres(now.high), false]);
  }
  if (extent !== null) {
    rows.push(['Reach in clip', `${metres(extent.reach)} · frame ${extent.reachFrame.toFixed(2)}`, extent.reach > HEX_RADIUS + SLACK]);
    rows.push(['Lowest in clip', `${metres(extent.low)} · frame ${extent.lowFrame.toFixed(2)}`, extent.low < SUNK]);
    rows.push(['Top in clip', `${metres(extent.high)} · frame ${extent.highFrame.toFixed(2)}`, false]);
  }
  rows.push(['Limit', metres(HEX_RADIUS), false]);
  if (label !== null) rows.push(['Label', `${metres(label.height)} · scale ${label.scale.toFixed(2)}`, false]);
  if (length > 0) rows.push(['Clip', `${last} frames · ${LOOPING.has(state.clip) ? 'loops' : 'plays once'}`, false]);
  measures.replaceChildren(
    ...rows.flatMap(([name, value, bad]) => {
      const dt = document.createElement('dt');
      dt.textContent = name;
      const dd = document.createElement('dd');
      dd.textContent = value;
      if (bad) dd.className = 'bad';
      return [dt, dd];
    }),
  );
}

function metres(value: number): string {
  // Not -0.000 for a point a hair under the ground.
  return Math.abs(value) < 0.0005 ? '0.000' : value.toFixed(3);
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

let flashTimer = 0;
function flash(text: string): void {
  const labelText = element('copy-link').querySelector('.label') as HTMLElement;
  setText(labelText, text);
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => setText(labelText, 'Copy link'), 1200);
}
