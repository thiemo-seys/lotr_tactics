// The play page: a game against 7 bots (docs/game-spec.md section 12).

import {
  COMPONENT_NAMES,
  SHOP,
  TRAITS,
  UNITS,
  XP,
  createCombat,
  roundType,
  xpForNextLevel,
  type FightReport,
  type OwnedUnit,
  type Place,
  type PlayerView,
  type RoundReport,
  type UnitId,
} from '@lotr-tactics/sim';
import { placeAtPoint } from './layout.js';
import { Playback } from './playback.js';
import { FightScene } from './scene.js';
import { Session, YOU, yourFight, yourTeam } from './session.js';
import './style.css';

/** Seconds of real time for each step. Planning is from docs/design.md section 9. */
const TIMERS = { planning: 30, pick: 15, results: 4 };

/** How long a finished fight stays on screen, in ticks of fight time, before the results. */
const FIGHT_END_TICKS = 30;

const ROUND_NAMES = { council: 'Council of Elrond', pvp: 'PvP', pve: 'PvE' } as const;

type Step =
  | { kind: 'council'; endsAt: number }
  | { kind: 'planning'; endsAt: number }
  | { kind: 'fight'; report: RoundReport; fight: FightReport; playback: Playback }
  | { kind: 'results'; report: RoundReport; endsAt: number }
  | { kind: 'over' };

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const view = element('view');
const shopBar = element('shop-bar');
const shop = element('shop');
const council = element('council');
const result = element('result');
const banner = element('banner');
const speedButton = element<HTMLButtonElement>('speed');
const skipButton = element<HTMLButtonElement>('skip');

const scene = new FightScene(view);
let session = new Session(readSeed());
let step: Step = nextStep();
let dragging: { unit: OwnedUnit; from: Place } | null = null;

element('reroll').addEventListener('click', () => act({ type: 'reroll' }));
element('buy-xp').addEventListener('click', () => act({ type: 'buyXp' }));
element('lock').addEventListener('click', () => act({ type: 'lock', locked: !me().shopLocked }));
element('ready').addEventListener('click', endPlanning);
speedButton.addEventListener('click', () => {
  if (step.kind !== 'fight') return;
  step.playback.speed = step.playback.speed >= 4 ? 1 : step.playback.speed * 2;
  speedButton.textContent = `${step.playback.speed}×`;
});
skipButton.addEventListener('click', () => {
  if (step.kind === 'fight') showResults(step.report);
});
window.addEventListener('keydown', (event) => {
  if (step.kind !== 'planning') return;
  if (event.key === 'd') act({ type: 'reroll' });
  else if (event.key === 'f') act({ type: 'buyXp' });
  else if (event.key === ' ') {
    event.preventDefault();
    endPlanning();
  }
});

// Dragging units. Capturing on the view runs before the camera controls see the press.
view.addEventListener(
  'pointerdown',
  (event) => {
    if (step.kind !== 'planning' || event.button !== 0) return;
    const point = scene.groundPoint(event.clientX, event.clientY);
    const place = point === null ? null : placeAtPoint(point);
    const unit = place === null ? null : unitAt(me(), place);
    if (place === null || unit === null) return;
    // No text selection while dragging.
    event.preventDefault();
    dragging = { unit, from: place };
    scene.cameraControls = false;
  },
  { capture: true },
);
window.addEventListener('pointermove', (event) => {
  if (dragging === null) return;
  const point = scene.groundPoint(event.clientX, event.clientY);
  if (point !== null) scene.drag(dragging.unit.id, point);
});
window.addEventListener('pointerup', (event) => {
  if (dragging === null) return;
  const { from } = dragging;
  dragging = null;
  scene.cameraControls = true;
  if (shopBar.contains(document.elementFromPoint(event.clientX, event.clientY))) {
    act({ type: 'sell', from });
  } else {
    const point = scene.groundPoint(event.clientX, event.clientY);
    const to = point === null ? null : placeAtPoint(point);
    if (to !== null) act({ type: 'move', from, to });
  }
  scene.showPlanning(me(), true);
});

let last = performance.now();
requestAnimationFrame(function frame(now) {
  const seconds = Math.min((now - last) / 1000, 0.1);
  last = now;
  update(seconds);
  scene.render();
  requestAnimationFrame(frame);
});

function me(): PlayerView {
  return session.game.state.players[YOU]!;
}

function unitAt(player: PlayerView, place: Place): OwnedUnit | null {
  return ('bench' in place ? player.bench[place.bench] : player.board[place.row * 7 + place.col]) ?? null;
}

function act(action: Parameters<typeof session.game.act>[1]): void {
  if (step.kind === 'planning') session.game.act(YOU, action);
}

/** The step after the session has moved on: the person's pick, planning, or the end. */
function nextStep(): Step {
  const { phase } = session.game.state;
  if (session.out || phase === 'over') {
    session.finish();
    return { kind: 'over' };
  }
  if (phase === 'council') return { kind: 'council', endsAt: performance.now() + TIMERS.pick * 1000 };
  return { kind: 'planning', endsAt: performance.now() + TIMERS.planning * 1000 };
}

function endPlanning(): void {
  if (step.kind !== 'planning') return;
  const report = session.endPlanning();
  const fight = yourFight(report);
  if (fight === null) {
    showResults(report);
    return;
  }
  const playback = new Playback(createCombat(fight.input));
  scene.show(playback, yourTeam(fight));
  speedButton.textContent = '1×';
  step = { kind: 'fight', report, fight, playback };
}

function showResults(report: RoundReport): void {
  step = { kind: 'results', report, endsAt: performance.now() + TIMERS.results * 1000 };
}

function update(seconds: number): void {
  const now = performance.now();
  switch (step.kind) {
    case 'council':
      if (!session.yourPick || now >= step.endsAt) {
        if (session.yourPick) session.endPick();
        step = nextStep();
      }
      break;
    case 'planning':
      if (now >= step.endsAt) endPlanning();
      break;
    case 'fight': {
      const { combat } = step.playback;
      step.playback.advance(seconds);
      if (combat.isOver() && step.playback.time >= combat.tick + FIGHT_END_TICKS) showResults(step.report);
      break;
    }
    case 'results':
      if (now >= step.endsAt) step = nextStep();
      break;
    case 'over':
      break;
  }
  render(now);
}

// Drawing

function render(now: number): void {
  const state = session.game.state;
  const shown = step.kind === 'fight' || step.kind === 'results' ? step.report : null;
  const [stage, round] = shown === null ? [state.stage, state.round] : [shown.stage, shown.round];
  text('round', `${stage}-${round} · ${ROUND_NAMES[roundType(stage, round)]}`);
  const endsAt = 'endsAt' in step ? step.endsAt : null;
  text('timer', endsAt === null || step.kind === 'results' ? '' : `${Math.max(0, Math.ceil((endsAt - now) / 1000))} s`);
  const p = me();
  const need = xpForNextLevel(p.level);
  const xp = p.level < XP.buyFromLevel ? '' : need === null ? ' · max level' : ` · XP ${p.xp}/${need}`;
  const fielded = p.board.filter((u) => u !== null).length;
  text('stats', `${p.hp} HP · ${p.gold} gold · Level ${p.level}${xp} · Board ${fielded}/${p.level}`);
  speedButton.hidden = skipButton.hidden = step.kind !== 'fight';
  shopBar.hidden = step.kind !== 'planning';
  council.hidden = step.kind !== 'council';
  result.hidden = step.kind !== 'results' && step.kind !== 'over';
  banner.hidden = true;

  if (step.kind === 'planning') {
    scene.showPlanning(p);
    renderShop(p);
  } else if (step.kind === 'council') {
    scene.showPlanning(p);
    renderCouncil();
  } else if (step.kind === 'fight' && step.playback.combat.isOver()) {
    const outcome = step.playback.combat.result().outcome;
    banner.hidden = false;
    banner.textContent = outcome === 'draw' ? 'Draw' : outcome === yourTeam(step.fight) ? 'Victory' : 'Defeat';
  } else if (step.kind === 'results') {
    renderResults(step.report);
  } else if (step.kind === 'over') {
    renderOver();
  }
  renderPlayers();
}

function text(id: string, value: string): void {
  const el = element(id);
  if (el.textContent !== value) el.textContent = value;
}

/** Replaces an element's children only when what they show has changed, so clicks aren't lost. */
function rebuild(target: HTMLElement, key: string, build: () => Node[]): void {
  if (target.dataset.key === key) return;
  target.dataset.key = key;
  target.replaceChildren(...build());
}

function traitNames(id: UnitId): string {
  const def = UNITS[id];
  return [def.origin, ...def.classes].map((t) => TRAITS[t].name).join(' · ');
}

function unitCard(id: UnitId, extra: string, onClick: (() => void) | null): HTMLElement {
  const card = document.createElement('button');
  card.className = `card cost-${UNITS[id].cost}`;
  card.disabled = onClick === null;
  card.innerHTML = '<strong></strong><span class="traits"></span><span class="extra"></span>';
  card.querySelector('strong')!.textContent = `${UNITS[id].name} · ${UNITS[id].cost}`;
  card.querySelector('.traits')!.textContent = traitNames(id);
  card.querySelector('.extra')!.textContent = extra;
  if (onClick !== null) card.addEventListener('click', onClick);
  return card;
}

function renderShop(p: PlayerView): void {
  rebuild(shop, JSON.stringify([p.shop, p.gold]), () =>
    p.shop.map((id, slot) => {
      if (id === null) {
        const empty = document.createElement('div');
        empty.className = 'card empty';
        return empty;
      }
      return unitCard(id, '', p.gold >= UNITS[id].cost ? () => act({ type: 'buy', slot }) : null);
    }),
  );
  element<HTMLButtonElement>('reroll').disabled = p.gold < SHOP.rerollCost;
  element<HTMLButtonElement>('buy-xp').disabled = p.gold < XP.buyCost || p.level < XP.buyFromLevel || xpForNextLevel(p.level) === null;
  text('lock', p.shopLocked ? 'Unlock' : 'Lock');
  const counts = new Map<string, number>();
  for (const item of p.items) counts.set(COMPONENT_NAMES[item], (counts.get(COMPONENT_NAMES[item]) ?? 0) + 1);
  text('items', [...counts].map(([name, n]) => `${name}${n > 1 ? ` ×${n}` : ''}`).join(' · '));
}

function seatName(seat: number): string {
  return seat === YOU ? 'You' : `Bot ${seat}`;
}

function renderCouncil(): void {
  const state = session.game.state.council;
  if (state === null) return;
  text('council-status', session.yourPick ? 'Your turn: pick a unit and its item component.' : 'Waiting for the others to pick…');
  rebuild(element('options'), JSON.stringify([state.options, session.yourPick]), () =>
    state.options.map((option, i) =>
      unitCard(
        option.unitId,
        `${COMPONENT_NAMES[option.component]}${option.pickedBy === null ? '' : ` · ${seatName(option.pickedBy)}`}`,
        session.yourPick && option.pickedBy === null
          ? () => {
              session.pick(i);
              step = nextStep();
            }
          : null,
      ),
    ),
  );
}

function renderResults(report: RoundReport): void {
  const taken = report.damage.find((d) => d.seat === YOU)?.amount ?? 0;
  const fight = yourFight(report);
  const outcome = fight === null ? null : fight.result.outcome === 'draw' ? 'Draw' : fight.result.outcome === yourTeam(fight) ? 'Victory' : 'Defeat';
  const lines = [
    `${report.stage}-${report.round}: ${outcome ?? 'No fight'}${taken > 0 ? `, you take ${taken} damage` : ''}`,
    ...report.damage.filter((d) => d.seat !== YOU).map((d) => `${seatName(d.seat)} takes ${d.amount}`),
    ...report.eliminated.map((seat) => `${seatName(seat)} is out in place ${session.game.state.players[seat]!.placement}`),
  ];
  rebuild(result, JSON.stringify(lines), () =>
    lines.map((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      return p;
    }),
  );
}

function renderOver(): void {
  const placement = me().placement!;
  rebuild(result, `over-${placement}`, () => {
    const title = document.createElement('h2');
    title.textContent = placement === 1 ? 'You win!' : `You placed ${ordinal(placement)}`;
    const standings = document.createElement('ol');
    for (const p of [...session.game.state.players].sort((a, b) => a.placement! - b.placement!)) {
      const item = document.createElement('li');
      item.textContent = seatName(p.seat);
      standings.append(item);
    }
    const again = document.createElement('button');
    again.textContent = 'New game';
    again.addEventListener('click', () => {
      session = new Session(randomSeed());
      history.replaceState(null, '', location.pathname);
      step = nextStep();
    });
    return [title, standings, again];
  });
}

function renderPlayers(): void {
  const players = session.game.state.players;
  rebuild(element('players'), JSON.stringify(players.map((p) => [p.hp, p.level, p.placement])), () =>
    [...players]
      .sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0) || b.hp - a.hp)
      .map((p) => {
        const row = document.createElement('div');
        row.className = `player${p.seat === YOU ? ' you' : ''}${p.placement !== null ? ' out' : ''}`;
        const name = document.createElement('span');
        name.textContent = `${seatName(p.seat)} · ${p.level}`;
        const hp = document.createElement('span');
        hp.textContent = p.placement !== null ? ordinal(p.placement) : String(p.hp);
        const bar = document.createElement('div');
        bar.className = 'hp';
        bar.style.width = `${Math.max(0, p.hp)}%`;
        row.append(name, hp, bar);
        return row;
      }),
  );
}

function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

function readSeed(): number {
  const seed = Number(new URLSearchParams(location.hash.slice(1)).get('seed'));
  return Number.isInteger(seed) && seed !== 0 ? seed : randomSeed();
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}
