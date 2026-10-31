// Rich tooltips (docs/game-spec.md section 12, docs/viewer-spec.md section 4): one card that shows
// what an element's `Tip` says while the mouse is over it or it has keyboard focus. It sits above
// or below the element and stays on screen, follows elements that move, such as chips on unit
// labels in a fight, never takes the mouse, and stays hidden while something is dragged.

import type { Tip } from '../tips.js';

type Source = Tip | (() => Tip | null);

const sources = new WeakMap<Element, Source>();
/** Space kept between the card and the element, and the edges of the window. */
const GAP = 8;

let card: HTMLElement | null = null;
let render: (tip: Tip) => Node[] = () => [];
let current: Element | null = null;
let suppressed = false;
/** Where the element was when the card was last placed, so a still element costs no layout. */
const last = { left: NaN, top: NaN, width: NaN, height: NaN };

/** Gives an element a tooltip, or takes it away. A function is asked for the tip each time it shows. */
export function setTip(element: Element, tip: Source | null): void {
  if (tip === null) {
    if (!sources.has(element)) return;
    sources.delete(element);
    element.removeAttribute('data-tip');
    if (current === element) hideTip();
    return;
  }
  sources.set(element, tip);
  if (!element.hasAttribute('data-tip')) element.setAttribute('data-tip', '');
  // A tip changed under the mouse shows its new content.
  if (current === element) open(element);
}

/** Starts showing tooltips, drawn by `draw`. Call once per page. */
export function initTooltips(draw: (tip: Tip) => Node[]): void {
  render = draw;
  card = document.createElement('div');
  card.id = 'tooltip';
  card.className = 'tip-card';
  card.setAttribute('role', 'tooltip');
  card.hidden = true;
  document.body.append(card);

  document.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    const target = tipTarget(event.target);
    if (target === current) return;
    if (target === null) hideTip();
    else open(target);
  });
  document.addEventListener('pointerout', (event) => {
    if (current === null) return;
    const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (to === null || !current.contains(to)) hideTip();
  });
  document.addEventListener('focusin', (event) => {
    const target = tipTarget(event.target);
    if (target !== null && (target as HTMLElement).matches(':focus-visible')) open(target);
  });
  document.addEventListener('focusout', () => hideTip());
  document.addEventListener('pointerdown', () => hideTip(), { capture: true });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideTip();
  });
  window.addEventListener('scroll', () => hideTip(), { capture: true, passive: true });
}

/** No tooltips while `on`, such as during a drag. */
export function suppressTips(on: boolean): void {
  suppressed = on;
  if (on) hideTip();
}

export function hideTip(): void {
  if (current !== null) current.removeAttribute('aria-describedby');
  current = null;
  last.left = NaN;
  if (card !== null && !card.hidden) card.hidden = true;
}

/** Once a frame: follows an element that moved, and hides the card if the element is gone. */
export function updateTip(): void {
  if (current === null || card === null) return;
  if (!current.isConnected || current.getClientRects().length === 0) {
    hideTip();
    return;
  }
  place(current, card);
}

function tipTarget(target: EventTarget | null): Element | null {
  if (suppressed || !(target instanceof Element)) return null;
  const element = target.closest('[data-tip]');
  return element !== null && sources.has(element) ? element : null;
}

function open(element: Element): void {
  if (card === null || suppressed) return;
  const source = sources.get(element);
  const tip = typeof source === 'function' ? source() : (source ?? null);
  if (tip === null) {
    hideTip();
    return;
  }
  if (current !== null && current !== element) current.removeAttribute('aria-describedby');
  current = element;
  element.setAttribute('aria-describedby', 'tooltip');
  card.className = `tip-card${tip.tone === undefined ? '' : ` tone-${tip.tone}`}`;
  card.replaceChildren(...render(tip));
  card.hidden = false;
  last.left = NaN;
  place(element, card);
}

/** Above the element if it fits, otherwise below, and always inside the window. */
function place(element: Element, tip: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  if (rect.left === last.left && rect.top === last.top && rect.width === last.width && rect.height === last.height) return;
  last.left = rect.left;
  last.top = rect.top;
  last.width = rect.width;
  last.height = rect.height;
  const { width, height } = tip.getBoundingClientRect();
  const left = Math.max(GAP, Math.min(window.innerWidth - width - GAP, rect.left + rect.width / 2 - width / 2));
  const above = rect.top - height - GAP;
  const below = rect.bottom + GAP;
  const top = above >= GAP ? above : below + height <= window.innerHeight - GAP ? below : Math.max(GAP, window.innerHeight - height - GAP);
  tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}
