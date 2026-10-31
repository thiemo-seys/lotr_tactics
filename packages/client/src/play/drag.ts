// Dragging while planning (docs/game-spec.md section 12): units between the bench and the board,
// onto the shop bar to sell them, and the person's items and the One Ring onto units. While
// dragging, the scene marks where the drop would go, in gold if the game's rules allow it and in
// red with the reason if not; the rules are the sim's own `checkAction`.

import { UNITS, placeOf, unitAt, type Action, type OwnedUnit, type Place } from '@lotr-tactics/sim';
import type { PlayFlow } from '../flow.js';
import { placeAtPoint } from '../layout.js';
import type { FightScene } from '../scene.js';
import { itemChip, ringChip } from '../ui/chips.js';
import { el, setText, show, toggle } from '../ui/dom.js';
import { suppressTips } from '../ui/tooltip.js';
import type { ShopBar, TrayItem } from './shop-bar.js';

/** How far the hint sits from the pointer. */
const HINT_OFFSET = { x: 16, y: 18 };

export class DragAndDrop {
  private unit: { readonly unit: OwnedUnit; readonly from: Place } | null = null;
  private item: { readonly item: TrayItem; readonly ghost: HTMLElement; readonly caption: HTMLElement } | null = null;

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
  }

  /** Starts dragging one of the person's items or the Ring from the tray. */
  startItem(item: TrayItem, event: PointerEvent): void {
    if (this.flow.show.kind !== 'planning' || event.button !== 0 || this.unit !== null) return;
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
    if (wasUnit && this.flow.inGame) this.scene.showPlanning(this.flow.me(), true, this.flow.planningRing());
  }

  private pressUnit(event: PointerEvent): void {
    if (this.flow.show.kind !== 'planning' || event.button !== 0 || this.item !== null) return;
    const place = this.unitPlaceAt(event.clientX, event.clientY);
    const unit = place === null ? null : unitAt(this.flow.me(), place);
    if (place === null || unit === null) return;
    // No text selection while dragging.
    event.preventDefault();
    this.unit = { unit, from: place };
    this.begin();
  }

  private begin(): void {
    this.scene.cameraControls = false;
    suppressTips(true);
    toggle(document.body, 'grabbing', true);
  }

  private end(): void {
    this.scene.cameraControls = true;
    this.scene.markPlace(null);
    this.scene.markUnit(null);
    this.shop.selling(null);
    show(this.hint, false);
    suppressTips(false);
    toggle(document.body, 'grabbing', false);
  }

  private move(event: PointerEvent): void {
    const { clientX: x, clientY: y } = event;
    if (this.item !== null) {
      this.item.ghost.style.transform = `translate(${x}px, ${y}px)`;
      const to = this.overView(x, y) ? this.unitPlaceAt(x, y) : null;
      const target = to === null ? null : unitAt(this.flow.me(), to);
      const result = to === null ? null : this.flow.check(this.itemAction(this.item.item, to));
      this.scene.markPlace(to, result?.ok ?? true);
      this.scene.markUnit(result?.ok === true && target !== null ? target.id : null);
      setText(this.item.caption, target === null ? 'Drop on a unit' : result!.ok ? `Give to ${UNITS[target.unitId].name}` : result!.reason);
      toggle(this.item.ghost, 'refused', result !== null && !result.ok);
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
    const { clientX: x, clientY: y } = event;
    if (this.item !== null) {
      const { item, ghost } = this.item;
      this.item = null;
      ghost.remove();
      this.end();
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
    this.scene.showPlanning(this.flow.me(), true, this.flow.planningRing());
  }

  /** The grab cursor over the person's own units while planning. */
  private hover(x: number, y: number): void {
    const canGrab = this.flow.show.kind === 'planning' && this.overView(x, y) && this.unitPlaceAt(x, y) !== null;
    toggle(this.view, 'can-grab', canGrab);
  }

  private itemAction(item: TrayItem, to: Place): Action {
    return item === 'ring' ? { type: 'ring', to } : { type: 'equip', item, to };
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

  /** The place of the person's unit under the mouse: its pawn, or else the hex or bench tile. */
  private unitPlaceAt(clientX: number, clientY: number): Place | null {
    const id = this.scene.planningUnitAt(clientX, clientY);
    const p = this.flow.me();
    const pawn = id === null ? null : placeOf(p, id);
    if (pawn !== null) return pawn;
    const point = this.scene.groundPoint(clientX, clientY);
    const place = point === null ? null : placeAtPoint(point);
    return place !== null && unitAt(p, place) !== null ? place : null;
  }
}
