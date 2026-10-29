// The fight viewer page: controls, URL state and the frame loop (docs/viewer-spec.md section 6).

import { LAST_TICK, OVERTIME_START_TICK, TICKS_PER_SECOND, createCombat, type CombatEvent } from '@lotr-tactics/sim';
import { BOARD_CHOICES, fightBoards, isBoardChoice, type BoardChoice } from './boards.js';
import { describe } from './log.js';
import { Playback } from './playback.js';
import { FightScene } from './scene.js';
import './style.css';

interface Settings {
  readonly a: BoardChoice;
  readonly b: BoardChoice;
  readonly seed: number;
  readonly stage: number;
}

const DEFAULTS: Settings = { a: 'full', b: 'traits', seed: 1, stage: 2 };

/** Lines kept in the event log. */
const LOG_LIMIT = 1000;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const boardA = element<HTMLSelectElement>('board-a');
const boardB = element<HTMLSelectElement>('board-b');
const seedInput = element<HTMLInputElement>('seed');
const stageInput = element<HTMLInputElement>('stage');
const playButton = element<HTMLButtonElement>('play');
const speedSelect = element<HTMLSelectElement>('speed');
const clock = element('clock');
const banner = element('banner');
const log = element('log');

for (const select of [boardA, boardB]) {
  for (const choice of BOARD_CHOICES) select.add(new Option(choice, choice));
}
const scene = new FightScene(element('view'));
let settings = readSettings();
showSettings(settings);
let playback = start();

element('new-fight').addEventListener('click', () => {
  settings = {
    a: isBoardChoice(boardA.value) ? boardA.value : DEFAULTS.a,
    b: isBoardChoice(boardB.value) ? boardB.value : DEFAULTS.b,
    seed: toInteger(seedInput.value, DEFAULTS.seed),
    stage: Math.max(1, toInteger(stageInput.value, DEFAULTS.stage)),
  };
  showSettings(settings);
  history.replaceState(null, '', `#${new URLSearchParams({ a: settings.a, b: settings.b, seed: String(settings.seed), stage: String(settings.stage) })}`);
  playback = start();
});
element('restart').addEventListener('click', () => (playback = start()));
playButton.addEventListener('click', togglePlay);
element('step').addEventListener('click', stepOnce);
speedSelect.addEventListener('change', () => (playback.speed = Number(speedSelect.value)));
element('toggle-log').addEventListener('click', () => (log.hidden = !log.hidden));
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === ' ') {
    event.preventDefault();
    togglePlay();
  } else if (event.key === 'ArrowRight' || event.key === '.') {
    stepOnce();
  }
});

let last = performance.now();
requestAnimationFrame(function frame(now) {
  // A long pause, such as a background tab, shouldn't fast-forward the fight.
  const seconds = Math.min((now - last) / 1000, 0.1);
  last = now;
  appendLog(playback, playback.advance(seconds));
  showClock();
  scene.render();
  requestAnimationFrame(frame);
});

function start(): Playback {
  const next = new Playback(
    createCombat({
      seed: settings.seed,
      stage: settings.stage,
      teams: fightBoards(settings.a, settings.b, settings.seed),
    }),
  );
  next.speed = Number(speedSelect.value);
  playButton.textContent = 'Pause';
  scene.show(next);
  log.replaceChildren();
  appendLog(next, next.combat.events);
  return next;
}

function togglePlay(): void {
  playback.playing = !playback.playing;
  playButton.textContent = playback.playing ? 'Pause' : 'Play';
}

function stepOnce(): void {
  playback.playing = false;
  playButton.textContent = 'Play';
  appendLog(playback, playback.step());
  showClock();
}

function showClock(): void {
  const { tick } = playback.combat;
  const overtime = tick >= OVERTIME_START_TICK ? ' · overtime' : '';
  clock.textContent = `Tick ${tick} / ${LAST_TICK} · ${(tick / TICKS_PER_SECOND).toFixed(1)} s${overtime}`;
  banner.hidden = !playback.combat.isOver();
  if (playback.combat.isOver()) {
    const { outcome, finalTick } = playback.combat.result();
    banner.textContent = `${outcome === 'draw' ? 'Draw' : `Team ${outcome} wins`} at tick ${finalTick}`;
  }
}

function appendLog(from: Playback, events: readonly CombatEvent[]): void {
  const units = from.combat.state.units;
  for (const event of events) {
    const text = describe(event, units);
    if (text === null) continue;
    const line = document.createElement('div');
    line.className = `line ${event.type}`;
    line.textContent = text;
    log.append(line);
  }
  while (log.childElementCount > LOG_LIMIT) log.firstElementChild!.remove();
  log.scrollTop = log.scrollHeight;
}

function readSettings(): Settings {
  const params = new URLSearchParams(location.hash.slice(1));
  const a = params.get('a') ?? '';
  const b = params.get('b') ?? '';
  return {
    a: isBoardChoice(a) ? a : DEFAULTS.a,
    b: isBoardChoice(b) ? b : DEFAULTS.b,
    seed: toInteger(params.get('seed'), DEFAULTS.seed),
    stage: Math.max(1, toInteger(params.get('stage'), DEFAULTS.stage)),
  };
}

function showSettings({ a, b, seed, stage }: Settings): void {
  boardA.value = a;
  boardB.value = b;
  seedInput.value = String(seed);
  stageInput.value = String(stage);
}

/** A 32-bit integer from user input, or the fallback. */
function toInteger(value: string | null, fallback: number): number {
  const number = Number(value);
  return value !== null && value.trim() !== '' && Number.isFinite(number) ? Math.trunc(number) | 0 : fallback;
}
