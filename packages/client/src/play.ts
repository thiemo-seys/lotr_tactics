// The play page: a menu, lobbies, and games online or against bots (docs/game-spec.md section 12,
// docs/server-spec.md section 10), with the person's account, profile and history
// (docs/accounts-spec.md section 14). It shows what the game's messages tell it, and sends the
// person's actions back. The HUD, shop bar, panels and dragging are drawn by the modules in play/.

import { ownedUnits } from '@lotr-tactics/sim';
import type { ServerMessage } from '@lotr-tactics/server';
import { AccountApi, AccountState } from './account.js';
import { LocalConnection, SocketConnection, socketUrl } from './connection.js';
import { PlayFlow } from './flow.js';
import { yourTeam } from './fights.js';
import { AccountUi } from './play/account.js';
import { DragAndDrop } from './play/drag.js';
import { HudBar } from './play/hud-bar.js';
import { renderLobby, renderMenu } from './play/menu.js';
import { renderBanner, renderCouncil, renderGiftOffer, renderOver, renderResults } from './play/panels.js';
import { ShopBar } from './play/shop-bar.js';
import { renderProfile } from './play/profile.js';
import { renderPlayers, renderTraits } from './play/side-panels.js';
import { renderViewingBar } from './play/viewing-bar.js';
import { ProfileBrowser } from './profile.js';
import { FightScene } from './scene.js';
import { frameCapButton } from './ui/frame-cap.js';
import { MeterPanel } from './ui/meter.js';
import { blockDisabledClicks, fillIcons, isEnabled, setText, show, toggle } from './ui/dom.js';
import { fighterTip, ownedUnitTip } from './tips.js';
import { tipCard } from './ui/tip-card.js';
import { hoverUnits } from './ui/unit-hover.js';
import { displayName } from './units.js';
import { initTooltips, updateTip } from './ui/tooltip.js';
import './style.css';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
fillIcons(document);
initTooltips(tipCard);
blockDisabledClicks();

const view = element('view');
const menu = element('menu');
const lobbyPanel = element('lobby');
const council = element('council');
const giftPanel = element('gift-offer');
const viewingBar = element('viewing');
const result = element('result');
const banner = element('banner');
const backdrop = element('backdrop');
const traitsPanel = element('traits');
const playersPanel = element('players');
const codeInput = element<HTMLInputElement>('code');
const speedButton = element<HTMLButtonElement>('speed');
const skipButton = element<HTMLButtonElement>('skip');
const meterButton = element('toggle-meter');
const meter = new MeterPanel(element('meter'), meterButton, false);
const frameCap = frameCapButton(element('frame-cap'));

const accountPanel = element('account');
const profilePanel = element('profile');
const notice = element('notice');

// The board and bench framing in every step, so the board doesn't move between planning and fights.
const scene = new FightScene(view, 'bench');
/** The game server's WebSocket, open while the menu, a lobby or an online game is on screen. */
let socket: SocketConnection | null = null;
/** An offline game against bots, which needs no server and no account. */
let local: LocalConnection | null = null;
const api = new AccountApi();
const account = new AccountState();
const profiles = new ProfileBrowser(api);
/** What the menu shows: the menu itself, the account panel or a profile. */
let screen: 'menu' | 'account' | 'profile' = 'menu';
const flow = new PlayFlow({
  send: (message) => (local ?? socket)?.send(message),
  fight: (playback, team) => {
    scene.show(playback, team);
    setText(speedButton.querySelector('.label')!, '1×');
  },
  menu: backToMenu,
  joined: (code) => {
    if (local === null) history.replaceState(null, '', `#lobby=${code}`);
  },
});
const accountUi = new AccountUi(account, {
  rename,
  signOut,
  retry: () => void loadAccount(),
  openProfile: () => {
    profiles.close();
    profiles.open(null);
    screen = 'profile';
  },
  openAccount: () => {
    accountUi.opened();
    screen = 'account';
    focusSoon('account-name-input');
  },
  closeAccount: () => showMenuScreen('open-account'),
});
const hud = new HudBar(flow);
const shop = new ShopBar(flow, (item, event) => drag.startItem(item, event));
const drag = new DragAndDrop(flow, scene, view, shop, element('drag-hint'));
// Hovering a unit shows its stats and ability: in a fight as it is now, and in planning with its items.
hoverUnits(view, scene, (pick) => {
  const step = flow.show;
  if (pick.kind === 'fight') {
    const unit = step.kind === 'fight' ? step.playback.combat.state.units[pick.id] : undefined;
    return unit?.alive === true ? fighterTip(unit, displayName(unit.unitId)) : null;
  }
  if (!flow.inGame) return null;
  const owner = flow.viewed() ?? flow.me();
  const unit = ownedUnits(owner).find((u) => u.unit.id === pick.id)?.unit;
  if (unit === undefined) return null;
  const ring = flow.ringOf(owner.seat);
  return ownedUnitTip(unit, ring?.bearer === unit.id ? ring.corruption : null);
});

// Menu and lobby

element('play-bots').addEventListener('click', () => playOffline(randomSeed()));
// Create and Join take the person back to their seat if the account already has one.
element('create').addEventListener('click', () => socket?.send(account.createRequest()));
element('join').addEventListener('click', () => {
  const code = codeInput.value.trim();
  if (code === '' && account.game === null) {
    flow.menuMessage = 'Enter the code of the lobby to join.';
    codeInput.focus();
    return;
  }
  socket?.send(account.joinRequest(code));
});
element('use-here').addEventListener('click', useHere);
codeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') element('join').click();
});
element('start').addEventListener('click', () => socket?.send({ type: 'start' }));
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
  // Escape goes back from a profile or the account panel.
  if (event.key === 'Escape' && flow.show.kind === 'menu' && screen !== 'menu') {
    event.preventDefault();
    if (screen === 'profile') profileBack();
    else showMenuScreen();
    return;
  }
  if (event.target instanceof HTMLInputElement) return;
  // Escape goes back to the person's own board from another player's.
  if (event.key === 'Escape' && flow.viewed() !== null) {
    flow.viewBoard(null);
    return;
  }
  if (!flow.canShop) return;
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
  // With the cap on, the frames in between are skipped, and the next one run counts their time.
  if (!frameCap.due(now)) {
    requestAnimationFrame(frame);
    return;
  }
  const seconds = Math.min((now - last) / 1000, 0.1);
  last = now;
  flow.update(seconds, now);
  render(now);
  scene.render();
  updateTip();
  requestAnimationFrame(frame);
});

// Connections

/**
 * An offline game from the URL, or the menu once the account has loaded. The account loads either
 * way, and online play connects when the menu shows, so `hello` can put the person back into a game.
 */
function startPage(): void {
  const hash = new URLSearchParams(location.hash.slice(1));
  const seed = Number(hash.get('seed'));
  if (Number.isInteger(seed) && seed !== 0) playOffline(seed);
  else codeInput.value = hash.get('lobby') ?? '';
  void loadAccount();
}

/** Loads the account with GET /api/me, which makes a guest if needed, then connects for online play. */
async function loadAccount(): Promise<void> {
  account.loading();
  account.loaded(await api.me());
  connectOnline();
}

/**
 * Opens the WebSocket, while the account is loaded and no offline game is on. It rejoins the seat
 * this tab had, and the game `hello` names.
 */
function connectOnline(): void {
  const { kind } = account.online;
  // Not after the account's game was opened somewhere else, until "Use here", nor while the server is unreachable, until "Try again".
  if (local !== null || socket !== null || account.me === null || (kind !== 'connecting' && kind !== 'ready')) return;
  account.connecting();
  socket = new SocketConnection(socketUrl(), { message: receiveOnline, closed: socketClosed }, { signedIn: true });
}

function receiveOnline(message: ServerMessage): void {
  account.receive(message);
  if (message.type === 'replaced') socket = null;
  flow.receive(message, performance.now());
}

/** The WebSocket closed for good: online play is unavailable until the person tries again. */
function socketClosed(reason: string): void {
  socket = null;
  account.closed(reason);
  // On the menu, its note says why; from a lobby or a game, the menu's message does.
  backToMenu(flow.show.kind === 'menu' ? flow.menuMessage : reason);
}

/** "Use here": takes the account's game back from the page that took it. */
function useHere(): void {
  if (account.online.kind !== 'replaced') return;
  account.connecting();
  connectOnline();
}

function playOffline(seed: number): void {
  // Online play waits while the person plays offline, so the server's hello can't take them away.
  socket?.close();
  socket = null;
  local?.close();
  flow.reset();
  screen = 'menu';
  local = new LocalConnection(seed, { message: (message) => flow.receive(message, performance.now()), closed: backToMenu });
}

function leave(): void {
  if (local === null) socket?.send({ type: 'leave' });
  backToMenu('');
}

/** Back to the menu, with a message there. Online play stays connected, or connects again after an offline game. */
function backToMenu(message: string): void {
  local?.close();
  local = null;
  flow.reset(message);
  history.replaceState(null, '', location.pathname);
  connectOnline();
}

/** Back to the menu from the account panel or a profile, with the focus on the button that opened it. */
function showMenuScreen(focus = screen === 'account' ? 'open-account' : 'open-profile'): void {
  screen = 'menu';
  profiles.close();
  focusSoon(focus);
}

/** Focuses an element once the next frame has shown it. */
function focusSoon(id: string): void {
  requestAnimationFrame(() => element(id).focus());
}

function profileBack(): void {
  if (!profiles.back()) showMenuScreen('open-profile');
}

/** Renames the account. Resolves to the server's reason if it refuses. */
async function rename(name: string): Promise<string | null> {
  const result = await api.rename(name);
  if (!result.ok) return result.error;
  account.update(result.value);
  profiles.renamed(result.value.id, result.value.name);
  return null;
}

/** Signs out this browser or every device, then the page gets a new guest from GET /api/me. */
async function signOut(everywhere: boolean): Promise<void> {
  const before = account.me?.name ?? '';
  // The WebSocket belongs to the account being signed out.
  socket?.close();
  socket = null;
  const result = await api.signOut(everywhere);
  if (!result.ok) {
    accountUi.message = result.error;
    connectOnline();
    return;
  }
  profiles.close();
  await loadAccount();
  accountUi.message = account.me === null ? `Signed ${before} out.` : `Signed ${before} out. You are now ${account.me.name}.`;
}

// Drawing

function render(now: number): void {
  const { inGame, show: step } = flow;
  const planning = step.kind === 'planning';
  // Another player's board, when the person is looking at one instead of their own.
  const viewed = inGame ? flow.viewed() : null;
  // Anything that takes the person off the menu, such as a game hello names, closes its screens.
  if (step.kind !== 'menu' && screen !== 'menu') {
    screen = 'menu';
    profiles.close();
  }
  // The menu waits for the account, so it shows who is playing from the start.
  const onMenu = step.kind === 'menu' && account.online.kind !== 'loading';
  show(menu, onMenu && screen === 'menu');
  show(accountPanel, onMenu && screen === 'account');
  show(profilePanel, onMenu && screen === 'profile');
  // Not over an offline game, which the other page doesn't touch.
  show(notice, account.online.kind === 'replaced' && local === null);
  show(lobbyPanel, step.kind === 'lobby');
  show(backdrop, step.kind === 'menu' || step.kind === 'lobby');
  // The shop works in planning and while the fights play. In a game the bar keeps its place at
  // other times, empty, so the board's view keeps its size.
  const shopping = flow.canShop;
  show(shop.bar, inGame);
  toggle(shop.bar, 'resting', !shopping);
  show(council, step.kind === 'council');
  show(giftPanel, inGame && planning && flow.state!.me.giftOffer !== null && viewed === null);
  show(viewingBar, viewed !== null);
  show(result, step.kind === 'results' || step.kind === 'waiting' || step.kind === 'over');
  show(speedButton, step.kind === 'fight');
  show(skipButton, step.kind === 'fight');
  show(element('leave-game'), inGame);
  // Out of a game only, so the top bar keeps one row and its height in a fight.
  show(element('to-viewer'), !inGame);
  show(playersPanel, inGame);
  show(traitsPanel, inGame && (planning || step.kind === 'council' || step.kind === 'fight'));
  toggle(document.body, 'in-game', inGame);
  // The damage meter: the person's own fight, while it plays and in its results.
  const meterFight = inGame ? flow.meterFight() : null;
  show(meterButton, meterFight !== null);
  meter.render(meterFight);
  if (!shopping || viewed !== null) drag.cancel();
  let bannerShown = false;

  if (onMenu && screen === 'menu') {
    renderMenu(flow);
    accountUi.renderMenu();
  } else if (onMenu && screen === 'account') {
    accountUi.renderPanel();
  } else if (onMenu && screen === 'profile') {
    renderProfile(profilePanel, profiles, account.me, { back: profileBack });
  } else if (step.kind === 'lobby') {
    renderLobby(flow);
  }
  hud.render(now);
  if (!inGame) {
    // Behind the menu and the lobby, the board alone, as when the page opens: a game left behind
    // goes, so nothing there moves or is drawn again until something changes.
    scene.showBoard();
    show(banner, false);
    return;
  }

  const p = flow.me();
  // The board on screen: the person's own in blue, or the one they are looking at in red.
  const showBoard = () => {
    if (viewed === null) scene.showPlanning(p, false, flow.planningRing());
    else scene.showPlanning(viewed, false, flow.ringOf(viewed.seat), 'B');
  };
  if (viewed !== null) renderViewingBar(viewingBar, flow);
  if (shopping) shop.render(p);
  // The person's bench stays on screen while the fights play, and can be used.
  if (scene.showsFight) scene.showBench(p.bench, false, flow.planningRing());
  if (planning) {
    showBoard();
    renderGiftOffer(flow);
  } else if (step.kind === 'council') {
    showBoard();
    renderCouncil(flow, now);
  } else if (step.kind === 'fight' && step.playback.combat.isOver()) {
    bannerShown = true;
    renderBanner(banner, step.playback.combat.result().outcome, yourTeam(step.fight, flow.you));
  } else if (step.kind === 'results' || step.kind === 'waiting') {
    renderResults(result, flow, step.round, step.kind === 'waiting');
  } else if (step.kind === 'over') {
    renderOver(result, flow, local !== null, {
      newGame: () => {
        history.replaceState(null, '', location.pathname);
        playOffline(randomSeed());
      },
      menu: leave,
    });
  }
  show(banner, bannerShown);
  // The board on screen, or the person's side while their fight plays.
  if (!traitsPanel.hidden) renderTraits(traitsPanel, viewed ?? flow.trackedTeam(), viewed === null ? null : flow.seatName(viewed.seat));
  renderPlayers(playersPanel, flow);
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}
