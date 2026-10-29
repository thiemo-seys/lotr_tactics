// The play page: a menu, lobbies, and games online or against bots (docs/game-spec.md section 12,
// docs/server-spec.md section 10). It shows what the game's messages tell it, and sends the
// person's actions back.

import {
  COMPONENT_NAMES,
  GIFTS,
  RING,
  SHOP,
  TICKS_PER_SECOND,
  TRAITS,
  UNITS,
  XP,
  createCombat,
  roundType,
  xpForNextLevel,
  type Action,
  type OwnedUnit,
  type Place,
  type PlayerView,
  type UnitId,
} from '@lotr-tactics/sim';
import { TIMERS, type FightRecord, type LobbyView, type MatchView, type RoundRecord, type ServerMessage } from '@lotr-tactics/server';
import { LocalConnection, SocketConnection, savedSeat, socketUrl, type Connection } from './connection.js';
import { yourFight, yourTeam } from './fights.js';
import { TIER_NAMES, giftEffect, giftText } from './gifts.js';
import { placeAtPoint } from './layout.js';
import { Playback } from './playback.js';
import { ringText, ringTier } from './ring.js';
import { FightScene, itemChip, ringChip, type PlanningRing } from './scene.js';
import './style.css';

/** How long a finished fight stays on screen, in ticks of fight time, before the results. */
const FIGHT_END_TICKS = TIMERS.fightHold * TICKS_PER_SECOND;

const ROUND_NAMES = { council: 'Council of Elrond', pvp: 'PvP', pve: 'PvE' } as const;

const NAME_KEY = 'lotr-tactics-name';

/** What the page shows. The game's own step comes from the server; fights and results are shown here. */
type Show =
  | { kind: 'menu' }
  | { kind: 'lobby' }
  | { kind: 'council' }
  | { kind: 'planning' }
  | { kind: 'fight'; round: RoundRecord; fight: FightRecord; playback: Playback }
  | { kind: 'results'; round: RoundRecord; until: number }
  /** The results have been shown and Ready sent: waiting for the next step. */
  | { kind: 'waiting'; round: RoundRecord }
  | { kind: 'over' };

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const view = element('view');
const shopBar = element('shop-bar');
const shop = element('shop');
const menu = element('menu');
const lobbyPanel = element('lobby');
const council = element('council');
const giftPanel = element('gift-offer');
const result = element('result');
const banner = element('banner');
const nameInput = element<HTMLInputElement>('name');
const codeInput = element<HTMLInputElement>('code');
const speedButton = element<HTMLButtonElement>('speed');
const skipButton = element<HTMLButtonElement>('skip');
const readyButton = element<HTMLButtonElement>('ready');

const scene = new FightScene(view);
let connection: Connection | null = null;
let offline = false;
let you = 0;
let lobby: LobbyView | null = null;
let state: MatchView | null = null;
/** When `state` arrived, to count down its step's time. */
let stateAt = 0;
let show: Show = { kind: 'menu' };
let menuMessage = '';
let lobbyMessage = '';
let dragging: { unit: OwnedUnit; from: Place } | null = null;
/** One of the person's items, or the One Ring, being dragged onto a unit, with the chip that follows the mouse. */
let draggingItem: { index: number | 'ring'; ghost: HTMLElement } | null = null;

// Menu and lobby

nameInput.value = readName();
nameInput.addEventListener('change', () => saveName(nameInput.value));
element('play-bots').addEventListener('click', () => playOffline(randomSeed()));
element('create').addEventListener('click', () => goOnline().send({ type: 'create', name: nameInput.value }));
element('join').addEventListener('click', () => {
  const code = codeInput.value.trim();
  if (code === '') {
    menuMessage = 'Enter the code of the lobby to join.';
    return;
  }
  goOnline().send({ type: 'join', code, name: nameInput.value });
});
codeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') element('join').click();
});
element('start').addEventListener('click', () => connection?.send({ type: 'start' }));
element('leave-lobby').addEventListener('click', leave);
element('leave-game').addEventListener('click', () => {
  if (show.kind === 'over' || confirm('Leave this game? A bot will play your seat for the rest of it.')) leave();
});
element('copy-link').addEventListener('click', () => {
  if (lobby === null) return;
  const link = `${location.origin}${location.pathname}#lobby=${lobby.code}`;
  // The clipboard needs a secure page, such as localhost; otherwise show the link to copy by hand.
  if (navigator.clipboard === undefined) lobbyMessage = link;
  else void navigator.clipboard.writeText(link).then(() => (lobbyMessage = 'Link copied.'), () => (lobbyMessage = link));
});

// The game

element('reroll').addEventListener('click', () => act({ type: 'reroll' }));
element('reroll-gifts').addEventListener('click', () => act({ type: 'rerollGifts' }));
element('mount-doom').addEventListener('click', () => act({ type: 'destroyRing' }));
element('buy-xp').addEventListener('click', () => act({ type: 'buyXp' }));
element('lock').addEventListener('click', () => act({ type: 'lock', locked: !me().shopLocked }));
readyButton.addEventListener('click', ready);
speedButton.addEventListener('click', () => {
  if (show.kind !== 'fight') return;
  show.playback.speed = show.playback.speed >= 4 ? 1 : show.playback.speed * 2;
  speedButton.textContent = `${show.playback.speed}×`;
});
skipButton.addEventListener('click', () => {
  if (show.kind === 'fight') showResults(show.round);
});
window.addEventListener('keydown', (event) => {
  if (show.kind !== 'planning' || event.target instanceof HTMLInputElement) return;
  if (event.key === 'd') act({ type: 'reroll' });
  else if (event.key === 'f') act({ type: 'buyXp' });
  else if (event.key === ' ') {
    event.preventDefault();
    ready();
  }
});

// Dragging units. Capturing on the view runs before the camera controls see the press.
view.addEventListener(
  'pointerdown',
  (event) => {
    if (show.kind !== 'planning' || event.button !== 0) return;
    const place = unitPlaceAt(event.clientX, event.clientY);
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
  if (draggingItem !== null) moveGhost(draggingItem.ghost, event);
  if (dragging === null) return;
  const point = scene.groundPoint(event.clientX, event.clientY);
  if (point !== null) scene.drag(dragging.unit.id, point);
});
window.addEventListener('pointerup', (event) => {
  if (draggingItem !== null) {
    const { index, ghost } = draggingItem;
    draggingItem = null;
    ghost.remove();
    scene.cameraControls = true;
    const to = view.contains(document.elementFromPoint(event.clientX, event.clientY)) ? unitPlaceAt(event.clientX, event.clientY) : null;
    if (to !== null) act(index === 'ring' ? { type: 'ring', to } : { type: 'equip', item: index, to });
  }
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
  // Back where it was until the game says where it is now.
  scene.showPlanning(me(), true, planningRing());
});

startPage();

let last = performance.now();
requestAnimationFrame(function frame(now) {
  const seconds = Math.min((now - last) / 1000, 0.1);
  last = now;
  update(seconds, now);
  render(now);
  scene.render();
  requestAnimationFrame(frame);
});

// Connections

/** An offline game from the URL, a seat to rejoin, or the menu. */
function startPage(): void {
  const hash = new URLSearchParams(location.hash.slice(1));
  const seed = Number(hash.get('seed'));
  const seat = savedSeat();
  if (Number.isInteger(seed) && seed !== 0) playOffline(seed);
  else if (seat !== null) goOnline().send({ type: 'rejoin', ...seat });
  else codeInput.value = hash.get('lobby') ?? '';
}

function playOffline(seed: number): void {
  connection?.close();
  offline = true;
  reset();
  connection = new LocalConnection(seed, { message: receive, closed: backToMenu });
}

function goOnline(): Connection {
  connection?.close();
  offline = false;
  reset();
  menuMessage = 'Connecting…';
  const socket = new SocketConnection(socketUrl(), { message: receive, closed: backToMenu });
  connection = socket;
  return socket;
}

function leave(): void {
  if (!offline) connection?.send({ type: 'leave' });
  backToMenu('');
}

function backToMenu(message: string): void {
  connection?.close();
  connection = null;
  reset();
  menuMessage = message;
  history.replaceState(null, '', location.pathname);
}

function reset(): void {
  lobby = null;
  state = null;
  show = { kind: 'menu' };
  menuMessage = '';
  lobbyMessage = '';
}

function receive(message: ServerMessage): void {
  switch (message.type) {
    case 'joined':
      you = message.seat;
      menuMessage = '';
      if (!offline) history.replaceState(null, '', `#lobby=${message.code}`);
      return;
    case 'lobby':
      lobby = message.lobby;
      if (!lobby.started) show = { kind: 'lobby' };
      return;
    case 'state':
      state = message.state;
      stateAt = performance.now();
      follow(message.state);
      return;
    case 'round':
      startRound(message.round);
      return;
    case 'left':
      backToMenu(message.reason === 'You left the lobby.' ? '' : message.reason);
      return;
    case 'refused':
      if (message.request === 'create' || message.request === 'join' || message.request === 'rejoin') backToMenu(message.reason);
      else if (message.request === 'start') lobbyMessage = message.reason;
      // A refused action was valid a moment ago; the next state shows how things are.
      return;
  }
}

/** Moves to the server's step. A fight that is still playing is cut short. */
function follow(next: MatchView): void {
  const out = next.me.placement !== null;
  switch (next.step.kind) {
    case 'over':
      show = { kind: 'over' };
      return;
    case 'council':
    case 'planning':
      if (out) show = { kind: 'over' };
      else if (show.kind !== next.step.kind) show = { kind: next.step.kind };
      return;
    case 'fight':
      // The round arrived just before this step, and started the fight.
      return;
  }
}

// Steps

function me(): PlayerView {
  return state!.me;
}

function unitAt(player: PlayerView, place: Place): OwnedUnit | null {
  return ('bench' in place ? player.bench[place.bench] : player.board[place.row * 7 + place.col]) ?? null;
}

/** The place of the person's unit under the mouse: its pawn, or else the hex or bench tile. */
function unitPlaceAt(clientX: number, clientY: number): Place | null {
  const id = scene.planningUnitAt(clientX, clientY);
  const p = me();
  if (id !== null) {
    const board = p.board.findIndex((u) => u?.id === id);
    if (board >= 0) return { col: board % 7, row: Math.floor(board / 7) };
    const bench = p.bench.findIndex((u) => u?.id === id);
    if (bench >= 0) return { bench };
  }
  const point = scene.groundPoint(clientX, clientY);
  const place = point === null ? null : placeAtPoint(point);
  return place !== null && unitAt(p, place) !== null ? place : null;
}

/** The One Ring, if the person holds it: its bearer among their units and its Corruption. */
function planningRing(): PlanningRing | null {
  const ring = state?.ring;
  return ring !== undefined && ring.state === 'held' && ring.holder === you ? { bearer: ring.bearer, corruption: ring.corruption } : null;
}

/** Whether the person can throw the Ring into Mount Doom now: a Hobbit bears it after enough Hobbit fights. */
function canDestroyRing(): boolean {
  const ring = planningRing();
  if (ring === null || ring.bearer === null || state!.ring.hobbitFights < RING.destroy.hobbitFights) return false;
  const bearer = [...me().board, ...me().bench].find((u) => u?.id === ring.bearer);
  return bearer !== undefined && bearer !== null && UNITS[bearer.unitId].origin === 'hobbit';
}

/** Starts dragging one of the person's items or the Ring; dropping it on a unit gives it to that unit. */
function dragItem(index: number | 'ring', event: PointerEvent): void {
  if (show.kind !== 'planning' || event.button !== 0) return;
  event.preventDefault();
  const ghost = index === 'ring' ? ringChip(state!.ring.corruption) : itemChip(me().items[index]!);
  ghost.classList.add('ghost');
  document.body.append(ghost);
  moveGhost(ghost, event);
  draggingItem = { index, ghost };
  scene.cameraControls = false;
}

function moveGhost(ghost: HTMLElement, event: PointerEvent): void {
  ghost.style.left = `${event.clientX}px`;
  ghost.style.top = `${event.clientY}px`;
}

function act(action: Action): void {
  if (show.kind === 'planning' || (show.kind === 'council' && action.type === 'pick')) connection?.send({ type: 'act', action });
}

function ready(): void {
  if (show.kind === 'planning' && !state!.ready.includes(you)) connection?.send({ type: 'ready' });
}

function yourPick(): boolean {
  const c = state?.council ?? null;
  return c !== null && me().placement === null && c.groups[c.group]!.includes(you) && !c.options.some((o) => o.pickedBy === you);
}

function startRound(round: RoundRecord): void {
  const fight = yourFight(round, you);
  if (fight === null) {
    showResults(round);
    return;
  }
  const playback = new Playback(createCombat(fight.input));
  scene.show(playback, yourTeam(fight, you));
  speedButton.textContent = '1×';
  show = { kind: 'fight', round, fight, playback };
}

function showResults(round: RoundRecord): void {
  show = { kind: 'results', round, until: performance.now() + TIMERS.results * 1000 };
}

function update(seconds: number, now: number): void {
  if (show.kind === 'fight') {
    const { combat } = show.playback;
    show.playback.advance(seconds);
    if (combat.isOver() && show.playback.time >= combat.tick + FIGHT_END_TICKS) showResults(show.round);
  } else if (show.kind === 'results' && now >= show.until) {
    show = { kind: 'waiting', round: show.round };
    // Finished watching; people who are out don't count.
    if (state?.me.placement === null) connection?.send({ type: 'ready' });
  }
}

// Drawing

function render(now: number): void {
  const inGame = state !== null && show.kind !== 'menu' && show.kind !== 'lobby';
  menu.hidden = show.kind !== 'menu';
  lobbyPanel.hidden = show.kind !== 'lobby';
  shopBar.hidden = show.kind !== 'planning';
  council.hidden = show.kind !== 'council';
  giftPanel.hidden = !(inGame && show.kind === 'planning' && state!.me.giftOffer !== null);
  result.hidden = show.kind !== 'results' && show.kind !== 'waiting' && show.kind !== 'over';
  speedButton.hidden = skipButton.hidden = show.kind !== 'fight';
  element('leave-game').hidden = !inGame;
  element('players').hidden = !inGame;
  banner.hidden = true;

  if (show.kind === 'menu') renderMenu();
  else if (show.kind === 'lobby') renderLobby();
  renderHud(now, inGame);
  if (!inGame) return;

  const p = me();
  if (show.kind === 'planning') {
    scene.showPlanning(p, false, planningRing());
    renderShop(p);
    renderGiftOffer(p);
  } else if (show.kind === 'council') {
    scene.showPlanning(p, false, planningRing());
    renderCouncil();
  } else if (show.kind === 'fight' && show.playback.combat.isOver()) {
    const outcome = show.playback.combat.result().outcome;
    banner.hidden = false;
    banner.textContent = outcome === 'draw' ? 'Draw' : outcome === yourTeam(show.fight, you) ? 'Victory' : 'Defeat';
  } else if (show.kind === 'results' || show.kind === 'waiting') {
    renderResults(show.round, show.kind === 'waiting');
  } else if (show.kind === 'over') {
    renderOver();
  }
  renderPlayers();
}

function renderHud(now: number, inGame: boolean): void {
  if (!inGame) {
    text('round', 'LOTR Tactics');
    text('timer', '');
    text('stats', '');
    return;
  }
  const s = state!;
  const shown = show.kind === 'fight' || show.kind === 'results' || show.kind === 'waiting' ? show.round : null;
  const [stage, round] = shown === null ? [s.stage, s.round] : [shown.stage, shown.round];
  text('round', `${stage}-${round} · ${ROUND_NAMES[roundType(stage, round)]}`);
  const timed = (show.kind === 'council' || show.kind === 'planning') && s.step.ms !== null;
  text('timer', timed ? `${Math.max(0, Math.ceil((s.step.ms! - (now - stateAt)) / 1000))} s` : '');
  const p = me();
  const need = xpForNextLevel(p.level);
  const xp = p.level < XP.buyFromLevel ? '' : need === null ? ' · max level' : ` · XP ${p.xp}/${need}`;
  const fielded = p.board.filter((u) => u !== null).length;
  text('stats', `${p.hp} HP · ${p.gold} gold · Level ${p.level}${xp} · Board ${fielded}/${p.level}`);
  const ring = planningRing();
  const status = element('ring-status');
  status.hidden = ring === null;
  if (ring !== null) {
    text('ring-status', `The One Ring · ${ring.corruption} (${ringTier(ring.corruption)})${ring.bearer === null ? ' · unworn' : ''}`);
    status.title = ringText(ring.corruption);
  }
  element('mount-doom').hidden = show.kind !== 'planning' || !canDestroyRing();
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

function paragraph(line: string): HTMLElement {
  const p = document.createElement('p');
  p.textContent = line;
  return p;
}

function renderMenu(): void {
  text('menu-message', menuMessage);
}

function renderLobby(): void {
  if (lobby === null) return;
  const l = lobby;
  text('lobby-code', l.code);
  rebuild(element('seats'), JSON.stringify([l, you]), () =>
    l.seats.map((seat, i) => {
      const item = document.createElement('li');
      const notes = [i === l.host ? 'host' : '', i === you ? 'you' : '', seat.kind === 'person' && !seat.connected ? 'away' : ''].filter((n) => n !== '');
      item.textContent = seat.kind === 'empty' ? 'Empty seat' : `${seat.name}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`;
      item.className = seat.kind;
      return item;
    }),
  );
  element('start').hidden = l.host !== you;
  const people = l.seats.filter((s) => s.kind === 'person').length;
  const status = l.host === you ? (people < l.seats.length ? 'Bots will take the empty seats.' : 'The lobby is full.') : 'Waiting for the host to start.';
  text('lobby-message', lobbyMessage === '' ? status : lobbyMessage);
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
  element<HTMLButtonElement>('reroll').disabled = p.gold < SHOP.rerollCost && p.freeRerolls === 0;
  text('reroll', p.freeRerolls > 0 ? `Reroll · free${p.freeRerolls > 1 ? ` ×${p.freeRerolls}` : ''}` : `Reroll · ${SHOP.rerollCost}`);
  element<HTMLButtonElement>('buy-xp').disabled = p.gold < XP.buyCost || p.level < XP.buyFromLevel || xpForNextLevel(p.level) === null;
  text('lock', p.shopLocked ? 'Unlock' : 'Lock');
  const ring = planningRing();
  rebuild(element('items'), JSON.stringify([p.items, ring]), () => [
    ...(ring === null ? [] : [ringItem(ring)]),
    ...p.items.map((id, index) => {
      const chip = itemChip(id);
      chip.title += '\nDrag onto a unit to give it this item.';
      chip.addEventListener('pointerdown', (event) => dragItem(index, event));
      return chip;
    }),
  ]);
  const isReady = state!.ready.includes(you);
  readyButton.disabled = isReady;
  const others = planners().filter((seat) => seat !== you && !state!.ready.includes(seat)).length;
  text('ready', isReady ? (others > 0 ? `Waiting for ${others}` : 'Ready ✓') : 'Ready');
}

/** Connected people still in the game: the ones a step waits for. */
function planners(): number[] {
  return state!.players
    .filter((p) => p.placement === null && lobby?.seats[p.seat]?.kind === 'person' && lobby.seats[p.seat]!.connected)
    .map((p) => p.seat);
}

function seatName(seat: number): string {
  return seat === you ? 'You' : (lobby?.seats[seat]?.name ?? `Seat ${seat + 1}`);
}

function renderCouncil(): void {
  const c = state!.council;
  if (c === null) return;
  const picking = yourPick();
  text('council-status', picking ? 'Your turn: pick a unit and its item component.' : 'Waiting for the others to pick…');
  rebuild(element('options'), JSON.stringify([c.options, picking]), () =>
    c.options.map((option, i) => {
      const card = unitCard(
        option.unitId,
        `${option.component === null ? 'The One Ring' : COMPONENT_NAMES[option.component]}${option.pickedBy === null ? '' : ` · ${seatName(option.pickedBy)}`}`,
        picking && option.pickedBy === null ? () => act({ type: 'pick', option: i }) : null,
      );
      if (option.ring) {
        card.classList.add('ring');
        card.title = `${ringText(state!.ring.corruption)}\nNobody is made to take it.`;
      }
      return card;
    }),
  );
}

/** The Ring in the person's items, to drag onto the unit that should bear it. */
function ringItem(ring: PlanningRing): HTMLElement {
  const chip = ringChip(ring.corruption);
  chip.title += `\nDrag onto a unit to ${ring.bearer === null ? 'give it' : 'move'} the Ring.`;
  chip.addEventListener('pointerdown', (event) => dragItem('ring', event));
  return chip;
}

function renderGiftOffer(p: PlayerView): void {
  const offer = p.giftOffer;
  if (offer === null) return;
  text('gift-tier', offer.length > 0 ? `· ${TIER_NAMES[GIFTS[offer[0]!].tier]}` : '');
  rebuild(element('gift-options'), JSON.stringify(offer), () =>
    offer.map((id, option) => {
      const card = document.createElement('button');
      card.className = `card gift ${GIFTS[id].tier}`;
      card.innerHTML = '<strong></strong><span class="extra"></span>';
      card.querySelector('strong')!.textContent = GIFTS[id].name;
      card.querySelector('.extra')!.textContent = giftEffect(id);
      card.addEventListener('click', () => act({ type: 'gift', option }));
      return card;
    }),
  );
  element<HTMLButtonElement>('reroll-gifts').disabled = p.giftRerolled;
}

function renderResults(round: RoundRecord, waiting: boolean): void {
  const taken = round.damage.find((d) => d.seat === you)?.amount ?? 0;
  const fight = yourFight(round, you);
  const outcome = fight === null ? null : fight.result.outcome === 'draw' ? 'Draw' : fight.result.outcome === yourTeam(fight, you) ? 'Victory' : 'Defeat';
  const lines = [
    `${round.stage}-${round.round}: ${outcome ?? 'No fight'}${taken > 0 ? `, you take ${taken} damage` : ''}`,
    ...round.damage.filter((d) => d.seat !== you).map((d) => `${seatName(d.seat)} takes ${d.amount}`),
    ...round.eliminated.map((seat) => `${seatName(seat)} ${seat === you ? 'are' : 'is'} out in place ${state!.players[seat]!.placement}`),
    ...(waiting && state!.me.placement === null ? ['Waiting for the others…'] : []),
  ];
  rebuild(result, JSON.stringify(lines), () => lines.map(paragraph));
}

function renderOver(): void {
  const s = state!;
  const placement = s.me.placement!;
  const finished = s.step.kind === 'over';
  const standings = [...s.players].sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0) || b.hp - a.hp);
  rebuild(result, JSON.stringify([placement, finished, offline, standings.map((p) => [p.seat, p.placement, p.hp]), lobby?.seats]), () => {
    const title = document.createElement('h2');
    title.textContent = placement === 1 ? 'You win!' : `You placed ${ordinal(placement)}`;
    const list = document.createElement('ol');
    for (const p of standings) {
      const item = document.createElement('li');
      item.textContent = p.placement === null ? `${seatName(p.seat)} · ${p.hp} HP` : seatName(p.seat);
      list.append(item);
    }
    const buttons = document.createElement('div');
    buttons.className = 'actions';
    if (offline) {
      const again = document.createElement('button');
      again.textContent = 'New game';
      again.addEventListener('click', () => {
        history.replaceState(null, '', location.pathname);
        playOffline(randomSeed());
      });
      buttons.append(again);
    }
    const back = document.createElement('button');
    back.textContent = 'Back to menu';
    back.addEventListener('click', leave);
    buttons.append(back);
    return [title, ...(finished ? [] : [paragraph('The game goes on without you.')]), list, buttons];
  });
}

function renderPlayers(): void {
  const s = state!;
  const key = JSON.stringify([s.players.map((p) => [p.hp, p.level, p.placement, p.gifts]), lobby?.seats, s.ring]);
  rebuild(element('players'), key, () => [
    ...[...s.players]
      .sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0) || b.hp - a.hp)
      .map((p) => {
        const seat = lobby?.seats[p.seat];
        const row = document.createElement('div');
        row.className = `player${p.seat === you ? ' you' : ''}${p.placement !== null ? ' out' : ''}`;
        const holds = s.ring.state === 'held' && s.ring.holder === p.seat;
        if (holds) row.classList.add('ring-holder');
        const notes = [
          ...(holds ? [`Holds the One Ring (Corruption ${s.ring.corruption})`] : []),
          ...(p.gifts.length > 0 ? [`Gifts: ${p.gifts.map((g) => GIFTS[g].name).join(', ')}`] : []),
        ];
        if (notes.length > 0) row.title = notes.join('\n');
        const name = document.createElement('span');
        const away = seat?.kind === 'person' && !seat.connected ? ' (away)' : '';
        name.textContent = `${seatName(p.seat)}${away} · ${p.level}`;
        const hp = document.createElement('span');
        hp.textContent = p.placement !== null ? ordinal(p.placement) : String(p.hp);
        const bar = document.createElement('div');
        bar.className = 'hp';
        bar.style.width = `${Math.max(0, p.hp)}%`;
        row.append(name, hp, bar);
        return row;
      }),
    ...yourGifts(s.me),
  ]);
}

/** The person's Gifts under the players list, each naming its effect when hovered. */
function yourGifts(p: PlayerView): HTMLElement[] {
  if (p.gifts.length === 0) return [];
  const list = document.createElement('div');
  list.className = 'your-gifts';
  for (const id of p.gifts) {
    const gift = document.createElement('div');
    gift.className = `gift ${GIFTS[id].tier}`;
    gift.textContent = GIFTS[id].name;
    gift.title = giftText(id);
    list.append(gift);
  }
  return [list];
}

function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // The name just isn't remembered.
  }
}
