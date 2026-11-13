// Dragging while planning (docs/game-spec.md section 12): units between the bench and the board,
// onto the shop bar to sell them, the person's items and the One Ring onto units, and a component
// onto another of the person's components to combine them. While the fights play, the same on the
// bench, since the board is fighting. While
// dragging, the scene marks where the drop would go, in gold if the game's rules allow it and in
// red with the reason if not; the rules are the sim's own `checkAction`. A component that would
// combine, with another component or with one the unit holds, shows the item it would make.

import { ITEMS, UNITS, placeOf, unitAt, type Action, type ItemId, type OwnedUnit, type Place } from '@lotr-tactics/sim';
import type { PlayFlow } from '../flow.js';
import { combinesInto } from '../items.js';
import { placeAtPoint } from '../layout.js';
import type { FightScene } from '../scene.js';
import { itemTip } from '../tips.js';
import { itemChip, ringChip } from '../ui/chips.js';
import { el, setText, show, toggle } from '../ui/dom.js';
import { tipCard } from '../ui/tip-card.js';
import { suppressTips } from '../ui/tooltip.js';
import type { ShopBar, TrayItem } from './shop-bar.js';

/** How far the hint sits from the pointer. */
const HINT_OFFSET = { x: 16, y: 18 };
/** Space between the pointer and the card of the item a drop would make, and the window's edges. */
const PREVIEW_GAP = { pointer: 30, edge: 8 };

/** When a drag started: in planning, or while the fights play, when only the bench can be used. */
type DragTime = 'planning' | 'fights';

export class DragAndDrop {
  /** When the drag under way started; a drag ends when that time does. */
  private time: DragTime = 'planning';
  private unit: { readonly unit: OwnedUnit; readonly from: Place } | null = null;
  private item: { readonly item: TrayItem; readonly ghost: HTMLElement; readonly caption: HTMLElement } | null = null;
  /** The card of the item a dragged component would make where it is now, and which item it shows. */
  private readonly preview: HTMLElement = el('div', 'tip-card combine-preview');
  private previewing: ItemId | null = null;

  constructor(
    private readonly flow: PlayFlow,
    private readonly scene: FightScene,
    private readonly view: HTMLElement,
    private readonly shop: ShopBar,
    private readonly hint: HTMLElement,
  ) {
    // Capturing on the view runs before the camera controls see the press.
    view.addEventListener('pointerdown', (event) => this.pressUnit(event), { capture: true });
    window.addEventListener('pointermove', (event) => this.move(event));
    window.addEventListener('pointerup', (event) => this.drop(event));
    window.addEventListener('pointercancel', () => this.cancel());
    this.preview.hidden = true;
    document.body.append(this.preview);
  }

  /** Starts dragging one of the person's items or the Ring from the tray. */
  startItem(item: TrayItem, event: PointerEvent): void {
    if (!this.canDrag() || event.button !== 0 || this.unit !== null) return;
    event.preventDefault();
    const chip = item === 'ring' ? ringChip(this.flow.state!.ring.corruption, 'lg', false) : itemChip(this.flow.me().items[item]!, 'lg', false);
    const caption = el('span', 'ghost-caption');
    const ghost = el('div', 'drag-ghost', chip, caption);
    document.body.append(ghost);
    this.item = { item, ghost, caption };
    this.begin();
    this.move(event);
  }

  /** Stops any drag without doing anything, such as when planning ends. */
  cancel(): void {
    if (this.unit === null && this.item === null) return;
    this.item?.ghost.remove();
    const wasUnit = this.unit !== null;
    this.unit = null;
    this.item = null;
    this.end();
    // A dragged unit goes back to its place.
    if (wasUnit && this.flow.inGame) this.redrawOwn();
  }

  /**
   * Draws the person's units again where the game has them: the planning board and bench, or the
   * bench while a fight is on screen, whose board drawing it again would hide.
   */
  private redrawOwn(): void {
    const p = this.flow.me();
    if (this.scene.showsFight) this.scene.showBench(p.bench, true, this.flow.planningRing());
    else if (this.flow.show.kind === 'planning') this.scene.showPlanning(p, true, this.flow.planningRing());
  }

  /** When it is now, for a drag: planning, or while the fights play. */
  private now(): DragTime {
    return this.flow.show.kind === 'planning' ? 'planning' : 'fights';
  }

  /**
   * Cancels a drag whose time has ended, planning or the fights, which the next frame would cancel
   * too: the pointer can move or be released between the game's message that ends it and that
   * frame. Whether it did.
   */
  private cutOff(): boolean {
    if ((this.unit === null && this.item === null) || (this.flow.canShop && this.now() === this.time)) return false;
    this.cancel();
    return true;
  }

  /**
   * Dragging is for planning and while the fights play, on the person's own board, not while they
   * look at another player's.
   */
  private canDrag(): boolean {
    return this.flow.canShop && this.flow.viewed() === null;
  }

  private pressUnit(event: PointerEvent): void {
    if (!this.canDrag() || event.button !== 0 || this.item !== null) return;
    const place = this.unitPlaceAt(event.clientX, event.clientY);
    const unit = place === null ? null : unitAt(this.flow.me(), place);
    if (place === null || unit === null) return;
    // No text selection while dragging.
    event.preventDefault();
    this.unit = { unit, from: place };
    this.begin();
  }

  private begin(): void {
    this.time = this.now();
    this.scene.cameraControls = false;
    suppressTips(true);
    toggle(document.body, 'grabbing', true);
  }

  private end(): void {
    this.scene.cameraControls = true;
    this.scene.markPlace(null);
    this.scene.markUnit(null);
    this.shop.selling(null);
    this.shop.markItem(null);
    show(this.hint, false);
    this.showPreview(null, 0, 0);
    suppressTips(false);
    toggle(document.body, 'grabbing', false);
  }

  private move(event: PointerEvent): void {
    if (this.cutOff()) return;
    const { clientX: x, clientY: y } = event;
    if (this.item !== null) {
      this.item.ghost.style.transform = `translate(${x}px, ${y}px)`;
      // Onto another of the person's items: the two combine.
      const other = this.combineWith(this.item.item, x, y);
      if (other !== null) {
        const result = this.flow.check({ type: 'combine', item: this.item.item as number, with: other });
        const items = this.flow.me().items;
        const made = result.ok ? combinesInto(items[this.item.item as number]!, items[other]!) : null;
        this.scene.markPlace(null);
        this.scene.markUnit(null);
        this.shop.markItem(other, result.ok);
        setText(this.item.caption, made !== null ? `Combine into ${ITEMS[made].name}` : result.ok ? '' : result.reason);
        toggle(this.item.ghost, 'refused', !result.ok);
        this.showPreview(made, x, y);
        return;
      }
      this.shop.markItem(null);
      const to = this.overView(x, y) ? this.unitPlaceAt(x, y) : null;
      const target = to === null ? null : unitAt(this.flow.me(), to);
      const result = to === null ? null : this.flow.check(this.itemAction(this.item.item, to));
      // A component given to a unit that holds a lone component combines with it.
      const made = result?.ok === true && target !== null && this.item.item !== 'ring' ? combinesInto(this.flow.me().items[this.item.item]!, target.items) : null;
      this.scene.markPlace(to, result?.ok ?? true);
      this.scene.markUnit(result?.ok === true && target !== null ? target.id : null);
      const name = target === null ? '' : UNITS[target.unitId].name;
      setText(
        this.item.caption,
        target === null ? 'Drop on a unit' : !result!.ok ? result!.reason : made !== null ? `Give to ${name}, making ${ITEMS[made].name}` : `Give to ${name}`,
      );
      toggle(this.item.ghost, 'refused', result !== null && !result.ok);
      this.showPreview(made, x, y);
      return;
    }
    if (this.unit === null) {
      this.hover(x, y);
      return;
    }
    const point = this.scene.groundPoint(x, y);
    if (point !== null) this.scene.drag(this.unit.unit.id, point);
    if (this.overShop(x, y)) {
      this.shop.selling(UNITS[this.unit.unit.unitId].name);
      this.scene.markPlace(null);
      show(this.hint, false);
      return;
    }
    this.shop.selling(null);
    const to = point === null ? null : placeAtPoint(point);
    const result = to === null ? null : this.flow.check({ type: 'move', from: this.unit.from, to });
    this.scene.markPlace(to, result?.ok ?? true);
    this.showHint(result !== null && !result.ok ? result.reason : null, x, y);
  }

  private drop(event: PointerEvent): void {
    if (this.cutOff()) return;
    const { clientX: x, clientY: y } = event;
    if (this.item !== null) {
      const { item, ghost } = this.item;
      this.item = null;
      ghost.remove();
      this.end();
      const other = this.combineWith(item, x, y);
      if (other !== null) {
        this.flow.act({ type: 'combine', item: item as number, with: other });
        return;
      }
      const to = this.overView(x, y) ? this.unitPlaceAt(x, y) : null;
      if (to !== null) this.flow.act(this.itemAction(item, to));
      return;
    }
    if (this.unit === null) return;
    const { from } = this.unit;
    this.unit = null;
    this.end();
    if (this.overShop(x, y)) {
      this.flow.act({ type: 'sell', from });
    } else {
      const point = this.scene.groundPoint(x, y);
      const to = point === null ? null : placeAtPoint(point);
      if (to !== null) this.flow.act({ type: 'move', from, to });
    }
    // Back where it was until the game says where it is now.
    this.redrawOwn();
  }

  /** The grab cursor over the person's own units they can move now. */
  private hover(x: number, y: number): void {
    const canGrab = this.canDrag() && this.overView(x, y) && this.unitPlaceAt(x, y) !== null;
    toggle(this.view, 'can-grab', canGrab);
  }

  /** Another of the person's items under the pointer, that a dragged item would combine with; the Ring combines with nothing. */
  private combineWith(item: TrayItem, x: number, y: number): number | null {
    if (item === 'ring') return null;
    const other = this.shop.itemAt(x, y);
    return other === null || other === item ? null : other;
  }

  private itemAction(item: TrayItem, to: Place): Action {
    return item === 'ring' ? { type: 'ring', to } : { type: 'equip', item, to };
  }

  /**
   * Shows the card of the item a drop would make, above the pointer, or below it if there is no
   * room, and within the window; null hides it.
   */
  private showPreview(made: ItemId | null, x: number, y: number): void {
    const card = this.preview;
    card.hidden = made === null;
    if (made === null) {
      this.previewing = null;
      return;
    }
    if (made !== this.previewing) {
      this.previewing = made;
      const tip = itemTip(made);
      card.className = `tip-card combine-preview tone-${tip.tone ?? 'combined'}`;
      card.replaceChildren(el('div', 'combine-preview-label', 'Makes'), ...tipCard(tip));
    }
    const { width, height } = card.getBoundingClientRect();
    const left = Math.min(Math.max(x - width / 2, PREVIEW_GAP.edge), window.innerWidth - width - PREVIEW_GAP.edge);
    const above = y - PREVIEW_GAP.pointer - height;
    const top = above >= PREVIEW_GAP.edge ? above : Math.min(y + PREVIEW_GAP.pointer + 24, window.innerHeight - height - PREVIEW_GAP.edge);
    card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  private showHint(text: string | null, x: number, y: number): void {
    show(this.hint, text !== null);
    if (text === null) return;
    setText(this.hint, text);
    this.hint.style.transform = `translate(${x + HINT_OFFSET.x}px, ${y + HINT_OFFSET.y}px)`;
  }

  private overView(x: number, y: number): boolean {
    return this.view.contains(document.elementFromPoint(x, y));
  }

  private overShop(x: number, y: number): boolean {
    return this.shop.bar.contains(document.elementFromPoint(x, y));
  }

  /**
   * The place of the person's unit under the mouse: its pawn, or else the hex or bench tile. Only
   * the bench while the fights play: the units on the board are fighting.
   */
  private unitPlaceAt(clientX: number, clientY: number): Place | null {
    const id = this.scene.planningUnitAt(clientX, clientY);
    const p = this.flow.me();
    const pawn = id === null ? null : placeOf(p, id);
    const point = pawn !== null ? null : this.scene.groundPoint(clientX, clientY);
    const place = pawn ?? (point === null ? null : placeAtPoint(point));
    if (place === null || unitAt(p, place) === null) return null;
    return this.now() === 'planning' || 'bench' in place ? place : null;
  }
}
