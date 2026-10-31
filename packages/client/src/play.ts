// The play page: a menu, lobbies, and games online or against bots (docs/game-spec.md section 12,
// docs/server-spec.md section 10). It shows what the game's messages tell it, and sends the
// person's actions back. The HUD, shop bar, panels and dragging are drawn by the modules in play/.

import type { ServerMessage } from '@lotr-tactics/server';
import { LocalConnection, SocketConnection, savedSeat, socketUrl, type Connection } from './connection.js';
import { PlayFlow } from './flow.js';
import { yourTeam } from './fights.js';
import { DragAndDrop } from './play/drag.js';
import { HudBar } from './play/hud-bar.js';
import { renderLobby, renderMenu } from './play/menu.js';
import { renderBanner, renderCouncil, renderGiftOffer, renderOver, renderResults } from './play/panels.js';
import { ShopBar } from './play/shop-bar.js';
import { renderPlayers, renderTraits } from './play/side-panels.js';
import { FightScene } from './scene.js';
import { blockDisabledClicks, fillIcons, isEnabled, setText, show, toggle } from './ui/dom.js';
import { tipCard } from './ui/tip-card.js';
import { initTooltips, updateTip } from './ui/tooltip.js';
import './style.css';

const NAME_KEY = 'lotr-tactics-name';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
fillIcons(document);
initTooltips(tipCard);
blockDisabledClicks();

const view = element('view');
const menu = element('menu');
const lobbyPanel = element('lobby');
const council = element('council');
const giftPanel = element('gift-offer');
const result = element('result');
const banner = element('banner');
const backdrop = element('backdrop');
const traitsPanel = element('traits');
const playersPanel = element('players');
const nameInput = element<HTMLInputElement>('name');
const codeInput = element<HTMLInputElement>('code');
const speedButton = element<HTMLButtonElement>('speed');
const skipButton = element<HTMLButtonElement>('skip');

const scene = new FightScene(view);
let connection: Connection | null = null;
let offline = false;
const flow = new PlayFlow({
  send: (message) => connection?.send(message),
  fight: (playback, team) => {
    scene.show(playback, team);
    setText(speedButton.querySelector('.label')!, '1×');
  },
  menu: backToMenu,
  joined: (code) => {
    if (!offline) history.replaceState(null, '', `#lobby=${code}`);
  },
});
const hud = new HudBar(flow);
const shop = new ShopBar(flow, (item, event) => drag.startItem(item, event));
const drag = new DragAndDrop(flow, scene, view, shop, element('drag-hint'));

// Menu and lobby

nameInput.value = readName();
nameInput.addEventListener('change', () => saveName(nameInput.value));
element('play-bots').addEventListener('click', () => playOffline(randomSeed()));
element('create').addEventListener('click', () => goOnline().send({ type: 'create', name: nameInput.value }));
element('join').addEventListener('click', () => {
  const code = codeInput.value.trim();
  if (code === '') {
    flow.menuMessage = 'Enter the code of the lobby to join.';
    codeInput.focus();
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
element('ready').addEventListener('click', () => flow.ready());
speedButton.addEventListener('click', () => {
  if (flow.show.kind !== 'fight') return;
  flow.show.playback.speed = flow.show.playback.speed >= 4 ? 1 : flow.show.playback.speed * 2;
  setText(speedButton.querySelector('.label')!, `${flow.show.playback.speed}×`);
});
skipButton.addEventListener('click', () => flow.skip(performance.now()));
window.addEventListener('keydown', (event) => {
  if (flow.show.kind !== 'planning' || event.target instanceof HTMLInputElement) return;
  const press = (id: string, action: () => void) => {
    // The key does what its button does, and only when the button can.
    if (isEnabled(element(id))) action();
  };
  if (event.key === 'd' || event.key === 'D') press('reroll', () => flow.act({ type: 'reroll' }));
  else if (event.key === 'f' || event.key === 'F') press('buy-xp', () => flow.act({ type: 'buyXp' }));
  else if (event.key === ' ') {
    event.preventDefault();
    flow.ready();
  }
});

startPage();

let last = performance.now();
requestAnimationFrame(function frame(now) {
  const seconds = Math.min((now - last) / 1000, 0.1);
  last = now;
  flow.update(seconds, now);
  render(now);
  scene.render();
  updateTip();
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

// Drawing

function render(now: number): void {
  const { inGame, show: step } = flow;
  const planning = step.kind === 'planning';
  show(menu, step.kind === 'menu');
  show(lobbyPanel, step.kind === 'lobby');
  show(backdrop, step.kind === 'menu' || step.kind === 'lobby');
  show(shop.bar, planning);
  show(council, step.kind === 'council');
  show(giftPanel, inGame && planning && flow.state!.me.giftOffer !== null);
  show(result, step.kind === 'results' || step.kind === 'waiting' || step.kind === 'over');
  show(speedButton, step.kind === 'fight');
  show(skipButton, step.kind === 'fight');
  show(element('leave-game'), inGame);
  show(playersPanel, inGame);
  show(traitsPanel, inGame && (planning || step.kind === 'council' || step.kind === 'fight'));
  toggle(document.body, 'in-game', inGame);
  if (!planning) drag.cancel();
  let bannerShown = false;

  if (step.kind === 'menu') renderMenu(flow);
  else if (step.kind === 'lobby') renderLobby(flow);
  hud.render(now);
  if (!inGame) {
    show(banner, false);
    return;
  }

  const p = flow.me();
  if (planning) {
    scene.showPlanning(p, false, flow.planningRing());
    shop.render(p);
    renderGiftOffer(flow);
  } else if (step.kind === 'council') {
    scene.showPlanning(p, false, flow.planningRing());
    renderCouncil(flow, now);
  } else if (step.kind === 'fight' && step.playback.combat.isOver()) {
    bannerShown = true;
    renderBanner(banner, step.playback.combat.result().outcome, yourTeam(step.fight, flow.you));
  } else if (step.kind === 'results' || step.kind === 'waiting') {
    renderResults(result, flow, step.round, step.kind === 'waiting');
  } else if (step.kind === 'over') {
    renderOver(result, flow, offline, {
      newGame: () => {
        history.replaceState(null, '', location.pathname);
        playOffline(randomSeed());
      },
      menu: leave,
    });
  }
  show(banner, bannerShown);
  if (!traitsPanel.hidden) renderTraits(traitsPanel, p);
  renderPlayers(playersPanel, flow);
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
