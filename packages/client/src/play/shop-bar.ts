// The shop bar while planning (docs/game-spec.md section 12): Buy XP, Reroll and Lock, the shop's
// unit cards, the person's items and the One Ring to drag onto units, and Ready. Dropping a dragged
// unit on the bar sells it.

import { SHOP, UNITS, XP, ownedUnits, type ActionResult, type PlayerView, type Star, type UnitId } from '@lotr-tactics/sim';
import type { PlayFlow } from '../flow.js';
import { TRAIT_ICONS } from '../icons.js';
import { actionTip, unitTip } from '../tips.js';
import { goldCost, itemChip, ringChip, traitTag } from '../ui/chips.js';
import { el, icon, rebuild, setEnabled, setText, toggle } from '../ui/dom.js';
import { setTip } from '../ui/tooltip.js';

const element = (id: string) => document.getElementById(id) as HTMLElement;

/** What the person drags from the tray: one of their items by index, or the One Ring. */
export type TrayItem = number | 'ring';

export class ShopBar {
  readonly bar = element('shop-bar');
  private readonly shop = element('shop');
  private readonly items = element('items');
  private readonly buyXp = element('buy-xp');
  private readonly reroll = element('reroll');
  private readonly lock = element('lock');
  private readonly ready = element('ready');
  private readonly sellText = this.bar.querySelector('.sell-text') as HTMLElement;
  private readonly xpCost = this.buyXp.querySelector('.cost') as HTMLElement;
  private readonly rerollCost = this.reroll.querySelector('.cost') as HTMLElement;
  private readonly lockLabel = this.lock.querySelector('.label') as HTMLElement;
  private readonly readyLabel = this.ready.querySelector('.label') as HTMLElement;
  /** The state and lobby last drawn: the bar changes only when one of them does. */
  private drawn: { state: unknown; lobby: unknown } = { state: null, lobby: null };

  constructor(
    private readonly flow: PlayFlow,
    private readonly drag: (item: TrayItem, event: PointerEvent) => void,
  ) {
    const reason = (result: ActionResult) => (result.ok ? null : result.reason);
    setTip(this.buyXp, () => actionTip('Buy XP', `Gain ${XP.buyAmount} XP for ${XP.buyCost} gold.`, reason(flow.check({ type: 'buyXp' })), 'F'));
    setTip(this.reroll, () => {
      const free = flow.me().freeRerolls;
      const what =
        free > 0 ? `A new shop, for free: ${free === 1 ? 'one free reroll' : `${free} free rerolls`} left this round.` : `A new shop for ${SHOP.rerollCost} gold.`;
      return actionTip('Reroll', what, reason(flow.check({ type: 'reroll' })), 'D');
    });
    setTip(this.lock, () =>
      flow.me().shopLocked
        ? actionTip('Unlock the shop', 'The shop is locked: it stays the same next round. Unlock it to roll a new one.', null)
        : actionTip('Lock the shop', 'Keep these units in the shop for the next round.', null),
    );
    setTip(this.ready, () => {
      const isReady = flow.state!.ready.includes(flow.you);
      return actionTip('Ready', isReady ? 'You are Ready. Planning ends once everyone is.' : 'End your planning now.', null, 'Space');
    });
  }

  render(p: PlayerView): void {
    const { flow } = this;
    if (this.drawn.state === flow.state && this.drawn.lobby === flow.lobby) return;
    this.drawn = { state: flow.state, lobby: flow.lobby };
    const buys = p.shop.map((_, slot) => flow.check({ type: 'buy', slot }));
    const mine = ownedUnits(p);
    const owned = p.shop.map((id) => mine.flatMap(({ unit }) => (unit.unitId === id ? [unit.star] : [])));
    rebuild(this.shop, JSON.stringify([p.shop, buys, owned]), () =>
      p.shop.map((id, slot) => {
        if (id === null) return el('div', 'unit-card empty', icon('board'));
        const buy = buys[slot]!;
        return unitCard(id, owned[slot]!, buy, () => flow.act({ type: 'buy', slot }));
      }),
    );

    setEnabled(this.buyXp, flow.check({ type: 'buyXp' }).ok);
    rebuild(this.xpCost, 'xp', () => [goldCost(XP.buyCost)]);
    setEnabled(this.reroll, flow.check({ type: 'reroll' }).ok);
    const free = p.freeRerolls;
    rebuild(this.rerollCost, `${free}`, () => [
      free > 0 ? el('span', 'free', free > 1 ? `Free ×${free}` : 'Free') : goldCost(SHOP.rerollCost),
    ]);
    const locked = p.shopLocked;
    toggle(this.lock, 'on', locked);
    if (this.lock.getAttribute('aria-pressed') !== String(locked)) this.lock.setAttribute('aria-pressed', String(locked));
    setText(this.lockLabel, locked ? 'Locked' : 'Lock');

    const ring = flow.planningRing();
    rebuild(this.items, JSON.stringify([p.items, ring]), () => {
      const chips = [
        ...(ring === null ? [] : [this.trayChip(ringChip(ring.corruption, 'lg', `Drag onto a unit to ${ring.bearer === null ? 'give it' : 'move'} the Ring.`), 'ring')]),
        ...p.items.map((id, index) => this.trayChip(itemChip(id, 'lg', 'Drag onto a unit to give it this item.'), index)),
      ];
      return chips.length > 0 ? chips : [el('span', 'tray-empty', 'None yet')];
    });

    const isReady = flow.state!.ready.includes(flow.you);
    setEnabled(this.ready, !isReady);
    toggle(this.ready, 'is-ready', isReady);
    const others = flow.planners().filter((seat) => seat !== flow.you && !flow.state!.ready.includes(seat)).length;
    setText(this.readyLabel, isReady ? (others > 0 ? `Waiting for ${others}` : 'Ready') : 'Ready');
  }

  /** While a unit is dragged over the bar, says that dropping it sells it; null when it isn't. */
  selling(name: string | null): void {
    toggle(this.bar, 'selling', name !== null);
    if (name !== null) setText(this.sellText, `Drop to sell ${name}`);
  }

  private trayChip(chip: HTMLElement, item: TrayItem): HTMLElement {
    chip.classList.add('draggable');
    chip.tabIndex = 0;
    chip.addEventListener('pointerdown', (event) => this.drag(item, event));
    return chip;
  }
}

/** A unit card for the shop: framed and coloured by cost, with its traits, cost, copies owned and, if it can't be bought, why. */
function unitCard(id: UnitId, owned: readonly Star[], buy: ActionResult, onBuy: () => void): HTMLElement {
  const def = UNITS[id];
  const card = el(
    'button',
    `unit-card cost-${def.cost}`,
    el(
      'span',
      'portrait',
      icon(TRAIT_ICONS[def.origin], 'emblem'),
      goldCost(def.cost, 'cost'),
      owned.length === 0 ? null : ownedBadge(owned),
      buy.ok ? null : el('span', 'why', buy.reason.replace(/\.$/, '')),
      el('span', 'name', def.name),
    ),
    el('span', 'card-foot', ...[def.origin, ...def.classes].map(traitTag)),
  );
  card.setAttribute('aria-label', `${def.name}, ${def.cost} gold${buy.ok ? '' : `: ${buy.reason}`}`);
  setEnabled(card, buy.ok);
  setTip(card, unitTip(id, buy.ok ? { text: 'Click to buy.', reason: false } : { text: buy.reason, reason: true }));
  card.addEventListener('click', onBuy);
  return card;
}

/** One pip per copy of the unit the person owns, coloured by its star level. */
function ownedBadge(stars: readonly Star[]): HTMLElement {
  const badge = el('span', 'owned', ...[...stars].sort((a, b) => b - a).map((star) => el('i', `star-${star}`)));
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', `You own ${stars.length}`);
  return badge;
}
