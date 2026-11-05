// The shop bar while planning and while the fights play (docs/game-spec.md section 12): Buy XP, Reroll and Lock, the shop's
// unit cards, the person's items and the One Ring to drag onto units, and Ready. Dropping a dragged
// unit on the bar sells it.

import { SHOP, UNITS, XP, completesMerge, isComponent, ownedUnits, type ActionResult, type PlayerView, type Star, type UnitId } from '@lotr-tactics/sim';
import type { PlayFlow } from '../flow.js';
import { shopOddsView } from '../hud.js';
import { TRAIT_ICONS } from '../icons.js';
import { actionTip, unitTip } from '../tips.js';
import { shopMark } from '../shop.js';
import { goldCost, itemChip, ringChip, traitTag } from '../ui/chips.js';
import { el, icon, rebuild, setEnabled, setText, starBadge, toggle } from '../ui/dom.js';
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
  /** The state, lobby and step last drawn: the bar changes only when one of them does. */
  private drawn: { state: unknown; lobby: unknown; step: string } = { state: null, lobby: null, step: '' };

  constructor(
    private readonly flow: PlayFlow,
    private readonly drag: (item: TrayItem, event: PointerEvent) => void,
  ) {
    const reason = (result: ActionResult) => (result.ok ? null : result.reason);
    setTip(this.buyXp, () => {
      const odds = shopOddsView(flow.me());
      const tip = actionTip('Buy XP', `Gain ${XP.buyAmount} XP for ${XP.buyCost} gold.`, reason(flow.check({ type: 'buyXp' })), 'F');
      return { ...tip, body: [...tip.body!, ...(odds.note === null ? [] : [{ text: odds.note }])], odds: odds.rows };
    });
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
      if (flow.show.kind !== 'planning') return actionTip('Ready', 'End your planning, once it starts.', 'The fights are still on.', 'Space');
      const isReady = flow.state!.ready.includes(flow.you);
      return actionTip('Ready', isReady ? 'You are Ready. Planning ends once everyone is.' : 'End your planning now.', null, 'Space');
    });
  }

  render(p: PlayerView): void {
    const { flow } = this;
    if (this.drawn.state === flow.state && this.drawn.lobby === flow.lobby && this.drawn.step === flow.show.kind) return;
    this.drawn = { state: flow.state, lobby: flow.lobby, step: flow.show.kind };
    const buys = p.shop.map((_, slot) => flow.check({ type: 'buy', slot }));
    const mine = ownedUnits(p);
    const owned = p.shop.map((id) => mine.flatMap(({ unit }) => (unit.unitId === id ? [unit.star] : [])));
    // While the fights play, copies on the board merge only once they end.
    const fighting = flow.state!.phase === 'fight';
    const merges = p.shop.map((id) => id !== null && completesMerge(p, id, fighting));
    rebuild(this.shop, JSON.stringify([p.shop, buys, owned, merges]), () =>
      p.shop.map((id, slot) => {
        if (id === null) return el('div', 'unit-card empty', icon('board'));
        const buy = buys[slot]!;
        return unitCard(id, owned[slot]!, merges[slot]!, buy, () => flow.act({ type: 'buy', slot }));
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
        ...p.items.map((id, index) =>
          this.trayChip(itemChip(id, 'lg', isComponent(id) ? 'Drag onto a unit to give it this item, or onto another component to combine them.' : 'Drag onto a unit to give it this item.'), index),
        ),
      ];
      return chips.length > 0 ? chips : [el('span', 'tray-empty', 'None yet')];
    });

    // Ready ends planning; while the fights play, a Ready means having watched them, which the page sends itself.
    const planning = flow.show.kind === 'planning';
    const isReady = planning && flow.state!.ready.includes(flow.you);
    setEnabled(this.ready, planning && !isReady);
    toggle(this.ready, 'is-ready', isReady);
    const others = flow.planners().filter((seat) => seat !== flow.you && !flow.state!.ready.includes(seat)).length;
    setText(this.readyLabel, isReady ? (others > 0 ? `Waiting for ${others}` : 'Ready') : 'Ready');
  }

  /** While a unit is dragged over the bar, says that dropping it sells it; null when it isn't. */
  selling(name: string | null): void {
    toggle(this.bar, 'selling', name !== null);
    if (name !== null) setText(this.sellText, `Drop to sell ${name}`);
  }

  /** The index of the person's item whose chip is under a point, for dropping a dragged item on it. */
  itemAt(x: number, y: number): number | null {
    const chip = document.elementFromPoint(x, y)?.closest<HTMLElement>('#items [data-item]');
    return chip === null || chip === undefined ? null : Number(chip.dataset.item);
  }

  /** Marks the item chip a dragged item would combine with, in gold if it can and red if not, or none. */
  markItem(index: number | null, ok = true): void {
    for (const chip of this.items.querySelectorAll<HTMLElement>('[data-item]')) {
      const marked = index !== null && chip.dataset.item === String(index);
      toggle(chip, 'combine-target', marked && ok);
      toggle(chip, 'combine-refused', marked && !ok);
    }
  }

  private trayChip(chip: HTMLElement, item: TrayItem): HTMLElement {
    if (item !== 'ring') chip.dataset.item = String(item);
    chip.classList.add('draggable');
    chip.tabIndex = 0;
    chip.addEventListener('pointerdown', (event) => this.drag(item, event));
    return chip;
  }
}

/**
 * A unit card for the shop: framed and coloured by cost, with its traits, cost, copies owned and,
 * if it can't be bought, why. A unit the person already has on the bench or the board gets a gold
 * border, which glows when buying it would make a 2★ from two 1★ copies.
 */
function unitCard(id: UnitId, owned: readonly Star[], merges: boolean, buy: ActionResult, onBuy: () => void): HTMLElement {
  const def = UNITS[id];
  const mark = shopMark(owned, merges);
  const card = el(
    'button',
    `unit-card cost-${def.cost}${mark === 'none' ? '' : ' has-copy'}${mark === 'completes' ? ' completes-star' : ''}`,
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
  const ownedText = owned.length === 0 ? '' : `, you have ${owned.length}${mark === 'completes' ? ', buying it makes a 2★' : ''}`;
  card.setAttribute('aria-label', `${def.name}, ${def.cost} gold${ownedText}${buy.ok ? '' : `: ${buy.reason}`}`);
  setEnabled(card, buy.ok);
  const hint = mark === 'completes' ? 'Click to buy: it combines into a 2★.' : owned.length > 0 ? `Click to buy. You have ${owned.length}.` : 'Click to buy.';
  setTip(card, unitTip(id, buy.ok ? { text: hint, reason: false } : { text: buy.reason, reason: true }));
  card.addEventListener('click', onBuy);
  return card;
}

/** A star badge per copy of the unit the person owns, at its star level. */
function ownedBadge(stars: readonly Star[]): HTMLElement {
  const badge = el('span', 'owned', ...[...stars].sort((a, b) => b - a).map((star) => starBadge(star)));
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', `You own ${stars.length}`);
  return badge;
}
