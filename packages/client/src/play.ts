// The play page: a menu, lobbies, and games online or against bots (docs/game-spec.md section 12,
// docs/server-spec.md section 10). It shows what the game's messages tell it, and sends the
// person's actions back.

import {
  GIFTS,
  ITEMS,
  SHOP,
  TRAITS,
  UNITS,
  XP,
  isRingOfPower,
  placeOf,
  roundType,
  unitAt,
  xpForNextLevel,
  type Action,
  type OwnedUnit,
  type Place,
  type PlayerView,
  type UnitId,
} from '@lotr-tactics/sim';
import type { RoundRecord, ServerMessage } from '@lotr-tactics/server';
import { LocalConnection, SocketConnection, savedSeat, socketUrl, type Connection } from './connection.js';
import { PlayFlow, ordinal, outcomeText, standings, type PlanningRing } from './flow.js';
import { yourTeam } from './fights.js';
import { TIER_NAMES, giftEffect, giftText } from './gifts.js';
import { itemText } from './items.js';
import { placeAtPoint } from './layout.js';
import { ringText, ringTier } from './ring.js';
import { FightScene, itemChip, ringChip } from './scene.js';
import './style.css';

const ROUND_NAMES = { council: 'Council of Elrond', pvp: 'PvP', pve: 'PvE' } as const;

const NAME_KEY = 'lotr-tactics-name';

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
const flow = new PlayFlow({
  send: (message) => connection?.send(message),
  fight: (playback, team) => {
    scene.show(playback, team);
    speedButton.textContent = '1×';
  },
  menu: backToMenu,
  joined: (code) => {
    if (!offline) history.replaceState(null, '', `#lobby=${code}`);
  },
});
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
    flow.menuMessage = 'Enter the code of the lobby to join.';
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
  if (flow.show.kind === 'over' || confirm('Leave this game? A bot will play your seat for the rest of it.')) leave();
});
element('copy-link').addEventListener('click', () => {
  if (flow.lobby === null) return;
  const link = `${location.origin}${location.pathname}#lobby=${flow.lobby.code}`;
  // The clipboard needs a secure page, such as localhost; otherwise show the link to copy by hand.
  if (navigator.clipboard === undefined) flow.lobbyMessage = link;
  else void navigator.clipboard.writeText(link).then(() => (flow.lobbyMessage = 'Link copied.'), () => (flow.lobbyMessage = link));
});

// The game

element('reroll').addEventListener('click', () => flow.act({ type: 'reroll' }));
element('reroll-gifts').addEventListener('click', () => flow.act({ type: 'rerollGifts' }));
element('mount-doom').addEventListener('click', () => flow.act({ type: 'destroyRing' }));
element('buy-xp').addEventListener('click', () => flow.act({ type: 'buyXp' }));
element('lock').addEventListener('click', () => flow.act({ type: 'lock', locked: !flow.me().shopLocked }));
readyButton.addEventListener('click', () => flow.ready());
speedButton.addEventListener('click', () => {
  if (flow.show.kind !== 'fight') return;
  flow.show.playback.speed = flow.show.playback.speed >= 4 ? 1 : flow.show.playback.speed * 2;
  speedButton.textContent = `${flow.show.playback.speed}×`;
});
skipButton.addEventListener('click', () => {
  flow.skip(performance.now());
});
window.addEventListener('keydown', (event) => {
  if (flow.show.kind !== 'planning' || event.target instanceof HTMLInputElement) return;
  if (event.key === 'd') flow.act({ type: 'reroll' });
  else if (event.key === 'f') flow.act({ type: 'buyXp' });
  else if (event.key === ' ') {
    event.preventDefault();
    flow.ready();
  }
});

// Dragging units. Capturing on the view runs before the camera controls see the press.
view.addEventListener(
  'pointerdown',
  (event) => {
    if (flow.show.kind !== 'planning' || event.button !== 0) return;
    const place = unitPlaceAt(event.clientX, event.clientY);
    const unit = place === null ? null : unitAt(flow.me(), place);
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
    if (to !== null) flow.act(index === 'ring' ? { type: 'ring', to } : { type: 'equip', item: index, to });
  }
  if (dragging === null) return;
  const { from } = dragging;
  dragging = null;
  scene.cameraControls = true;
  if (shopBar.contains(document.elementFromPoint(event.clientX, event.clientY))) {
    flow.act({ type: 'sell', from });
  } else {
    const point = scene.groundPoint(event.clientX, event.clientY);
    const to = point === null ? null : placeAtPoint(point);
    if (to !== null) flow.act({ type: 'move', from, to });
  }
  // Back where it was until the game says where it is now.
  scene.showPlanning(flow.me(), true, flow.planningRing());
});

startPage();

let last = performance.now();
requestAnimationFrame(function frame(now) {
  const seconds = Math.min((now - last) / 1000, 0.1);
  last = now;
  flow.update(seconds, now);
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
  flow.reset();
  connection = new LocalConnection(seed, { message: receive, closed: backToMenu });
}

function goOnline(): Connection {
  connection?.close();
  offline = false;
  flow.reset('Connecting…');
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
  flow.reset(message);
  history.replaceState(null, '', location.pathname);
}

function receive(message: ServerMessage): void {
  flow.receive(message, performance.now());
}

// Steps

/** The place of the person's unit under the mouse: its pawn, or else the hex or bench tile. */
function unitPlaceAt(clientX: number, clientY: number): Place | null {
  const id = scene.planningUnitAt(clientX, clientY);
  const p = flow.me();
  const pawn = id === null ? null : placeOf(p, id);
  if (pawn !== null) return pawn;
  const point = scene.groundPoint(clientX, clientY);
  const place = point === null ? null : placeAtPoint(point);
  return place !== null && unitAt(p, place) !== null ? place : null;
}

/** Enables a button if its action is allowed, and otherwise says why when hovered. */
function allow(id: string, action: Action): void {
  const button = element<HTMLButtonElement>(id);
  const result = flow.check(action);
  button.disabled = !result.ok;
  button.title = result.ok ? '' : result.reason;
}

/** Starts dragging one of the person's items or the Ring; dropping it on a unit gives it to that unit. */
function dragItem(index: number | 'ring', event: PointerEvent): void {
  if (flow.show.kind !== 'planning' || event.button !== 0) return;
  event.preventDefault();
  const ghost = index === 'ring' ? ringChip(flow.state!.ring.corruption) : itemChip(flow.me().items[index]!);
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

// Drawing

function render(now: number): void {
  const { inGame, show } = flow;
  menu.hidden = show.kind !== 'menu';
  lobbyPanel.hidden = show.kind !== 'lobby';
  shopBar.hidden = show.kind !== 'planning';
  council.hidden = show.kind !== 'council';
  giftPanel.hidden = !(inGame && show.kind === 'planning' && flow.state!.me.giftOffer !== null);
  result.hidden = show.kind !== 'results' && show.kind !== 'waiting' && show.kind !== 'over';
  speedButton.hidden = skipButton.hidden = show.kind !== 'fight';
  element('leave-game').hidden = !inGame;
  element('players').hidden = !inGame;
  banner.hidden = true;

  if (show.kind === 'menu') renderMenu();
  else if (show.kind === 'lobby') renderLobby();
  renderHud(now, inGame);
  if (!inGame) return;

  const p = flow.me();
  if (show.kind === 'planning') {
    scene.showPlanning(p, false, flow.planningRing());
    renderShop(p);
    renderGiftOffer(p);
  } else if (show.kind === 'council') {
    scene.showPlanning(p, false, flow.planningRing());
    renderCouncil();
  } else if (show.kind === 'fight' && show.playback.combat.isOver()) {
    banner.hidden = false;
    banner.textContent = outcomeText(show.playback.combat.result().outcome, yourTeam(show.fight, flow.you));
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
  const { stage, round } = flow.shownRound();
  text('round', `${stage}-${round} · ${ROUND_NAMES[roundType(stage, round)]}`);
  const seconds = flow.secondsLeft(now);
  text('timer', seconds === null ? '' : `${seconds} s`);
  const p = flow.me();
  const need = xpForNextLevel(p.level);
  const xp = p.level < XP.buyFromLevel ? '' : need === null ? ' · max level' : ` · XP ${p.xp}/${need}`;
  const fielded = p.board.filter((u) => u !== null).length;
  text('stats', `${p.hp} HP · ${p.gold} gold · Level ${p.level}${xp} · Board ${fielded}/${p.level}`);
  const ring = flow.planningRing();
  const status = element('ring-status');
  status.hidden = ring === null;
  if (ring !== null) {
    text('ring-status', `The One Ring · ${ring.corruption} (${ringTier(ring.corruption)})${ring.bearer === null ? ' · unworn' : ''}`);
    status.title = ringText(ring.corruption);
  }
  element('mount-doom').hidden = flow.show.kind !== 'planning' || !flow.check({ type: 'destroyRing' }).ok;
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
  text('menu-message', flow.menuMessage);
}

function renderLobby(): void {
  if (flow.lobby === null) return;
  const l = flow.lobby;
  text('lobby-code', l.code);
  rebuild(element('seats'), JSON.stringify([l, flow.you]), () =>
    l.seats.map((seat, i) => {
      const item = document.createElement('li');
      const notes = [i === l.host ? 'host' : '', i === flow.you ? 'you' : '', seat.kind === 'person' && !seat.connected ? 'away' : ''].filter((n) => n !== '');
      item.textContent = seat.kind === 'empty' ? 'Empty seat' : `${seat.name}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`;
      item.className = seat.kind;
      return item;
    }),
  );
  element('start').hidden = l.host !== flow.you;
  const people = l.seats.filter((s) => s.kind === 'person').length;
  const status = l.host === flow.you ? (people < l.seats.length ? 'Bots will take the empty seats.' : 'The lobby is full.') : 'Waiting for the host to start.';
  text('lobby-message', flow.lobbyMessage === '' ? status : flow.lobbyMessage);
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
  const buys = p.shop.map((_, slot) => flow.check({ type: 'buy', slot }));
  rebuild(shop, JSON.stringify([p.shop, buys]), () =>
    p.shop.map((id, slot) => {
      if (id === null) {
        const empty = document.createElement('div');
        empty.className = 'card empty';
        return empty;
      }
      const buy = buys[slot]!;
      const card = unitCard(id, '', buy.ok ? () => flow.act({ type: 'buy', slot }) : null);
      if (!buy.ok) card.title = buy.reason;
      return card;
    }),
  );
  allow('reroll', { type: 'reroll' });
  text('reroll', p.freeRerolls > 0 ? `Reroll · free${p.freeRerolls > 1 ? ` ×${p.freeRerolls}` : ''}` : `Reroll · ${SHOP.rerollCost}`);
  allow('buy-xp', { type: 'buyXp' });
  text('lock', p.shopLocked ? 'Unlock' : 'Lock');
  const ring = flow.planningRing();
  rebuild(element('items'), JSON.stringify([p.items, ring]), () => [
    ...(ring === null ? [] : [ringItem(ring)]),
    ...p.items.map((id, index) => {
      const chip = itemChip(id);
      chip.title += '\nDrag onto a unit to give it this item.';
      chip.addEventListener('pointerdown', (event) => dragItem(index, event));
      return chip;
    }),
  ]);
  const isReady = flow.state!.ready.includes(flow.you);
  readyButton.disabled = isReady;
  const others = flow.planners().filter((seat) => seat !== flow.you && !flow.state!.ready.includes(seat)).length;
  text('ready', isReady ? (others > 0 ? `Waiting for ${others}` : 'Ready ✓') : 'Ready');
}

function renderCouncil(): void {
  const c = flow.state!.council;
  if (c === null) return;
  const picks = c.options.map((_, option) => flow.check({ type: 'pick', option }).ok);
  const picking = picks.includes(true);
  text('council-status', picking ? 'Your turn: pick a unit and what it brings.' : 'Waiting for the others to pick…');
  rebuild(element('options'), JSON.stringify([c.options, picks]), () =>
    c.options.map((option, i) => {
      const card = unitCard(
        option.unitId,
        `${option.item === null ? 'The One Ring' : ITEMS[option.item].name}${option.pickedBy === null ? '' : ` · ${flow.seatName(option.pickedBy)}`}`,
        picks[i] ? () => flow.act({ type: 'pick', option: i }) : null,
      );
      if (option.ring) {
        card.classList.add('ring');
        card.title = `${ringText(flow.state!.ring.corruption)}\nNobody is made to take it.`;
      } else if (option.item !== null && isRingOfPower(option.item)) {
        card.classList.add('ring-of-power');
        card.title = itemText(option.item);
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
      card.addEventListener('click', () => flow.act({ type: 'gift', option }));
      return card;
    }),
  );
  element<HTMLButtonElement>('reroll-gifts').disabled = p.giftRerolled;
}

function renderResults(round: RoundRecord, waiting: boolean): void {
  const lines = flow.resultLines(round, waiting);
  rebuild(result, JSON.stringify(lines), () => lines.map(paragraph));
}

function renderOver(): void {
  const s = flow.state!;
  const placement = s.me.placement!;
  const finished = s.step.kind === 'over';
  const order = standings(s.players);
  rebuild(result, JSON.stringify([placement, finished, offline, order.map((p) => [p.seat, p.placement, p.hp]), flow.lobby?.seats]), () => {
    const title = document.createElement('h2');
    title.textContent = placement === 1 ? 'You win!' : `You placed ${ordinal(placement)}`;
    const list = document.createElement('ol');
    for (const p of order) {
      const item = document.createElement('li');
      item.textContent = p.placement === null ? `${flow.seatName(p.seat)} · ${p.hp} HP` : flow.seatName(p.seat);
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
  const s = flow.state!;
  const key = JSON.stringify([s.players.map((p) => [p.hp, p.level, p.placement, p.gifts]), flow.lobby?.seats, s.ring]);
  rebuild(element('players'), key, () => [
    ...standings(s.players).map((p) => {
        const seat = flow.lobby?.seats[p.seat];
        const row = document.createElement('div');
        row.className = `player${p.seat === flow.you ? ' you' : ''}${p.placement !== null ? ' out' : ''}`;
        const holds = s.ring.state === 'held' && s.ring.holder === p.seat;
        if (holds) row.classList.add('ring-holder');
        const notes = [
          ...(holds ? [`Holds the One Ring (Corruption ${s.ring.corruption})`] : []),
          ...(p.gifts.length > 0 ? [`Gifts: ${p.gifts.map((g) => GIFTS[g].name).join(', ')}`] : []),
        ];
        if (notes.length > 0) row.title = notes.join('\n');
        const name = document.createElement('span');
        const away = seat?.kind === 'person' && !seat.connected ? ' (away)' : '';
        name.textContent = `${flow.seatName(p.seat)}${away} · ${p.level}`;
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
