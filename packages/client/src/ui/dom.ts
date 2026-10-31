// Small DOM helpers shared by the viewer and the play page: building elements, icons as elements,
// replacing children only when what they show changes, and buttons that say why they are disabled.

import { iconSvg, type IconName } from '../icons.js';

type Child = Node | string | null | undefined | false;

/** An element with a class and children; strings become text. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className !== '') element.className = className;
  for (const child of children) if (child !== null && child !== undefined && child !== false) element.append(child);
  return element;
}

const parsed = new Map<IconName, SVGSVGElement>();

/** An icon as an inline SVG, hidden from screen readers. Each icon is parsed once and then cloned. */
export function icon(name: IconName, className = ''): SVGSVGElement {
  let svg = parsed.get(name);
  if (svg === undefined) {
    const template = document.createElement('template');
    template.innerHTML = iconSvg(name);
    svg = template.content.firstElementChild as SVGSVGElement;
    parsed.set(name, svg);
  }
  const copy = svg.cloneNode(true) as SVGSVGElement;
  if (className !== '') copy.classList.add(...className.split(' '));
  return copy;
}

/** Fills `<span data-icon="name">` placeholders in static HTML with their icons. */
export function fillIcons(root: ParentNode): void {
  for (const slot of root.querySelectorAll<HTMLElement>('[data-icon]')) {
    slot.replaceWith(icon(slot.dataset.icon as IconName, slot.className));
  }
}

/** Replaces an element's children only when what they show has changed, so clicks aren't lost. */
export function rebuild(target: HTMLElement, key: string, build: () => Node[]): void {
  if (target.dataset.key === key) return;
  target.dataset.key = key;
  target.replaceChildren(...build());
}

/** Sets an element's text if it differs. */
export function setText(element: Element, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

/** Shows or hides an element, touching the DOM only on a change. */
export function show(element: HTMLElement, visible: boolean): void {
  if (element.hidden === visible) element.hidden = !visible;
}

/** Toggles a class, touching the DOM only on a change. */
export function toggle(element: Element, name: string, on: boolean): void {
  if (element.classList.contains(name) !== on) element.classList.toggle(name, on);
}

/**
 * Enables or disables a button. A disabled button stays focusable and hoverable, so its tooltip
 * can say why; clicks on it do nothing (see `blockDisabledClicks`).
 */
export function setEnabled(button: HTMLElement, enabled: boolean): void {
  const value = enabled ? 'false' : 'true';
  if (button.getAttribute('aria-disabled') !== value) button.setAttribute('aria-disabled', value);
}

export function isEnabled(button: Element): boolean {
  return button.getAttribute('aria-disabled') !== 'true';
}

/** Stops clicks on buttons marked disabled with `setEnabled` before their own handlers see them. */
export function blockDisabledClicks(): void {
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target.closest('[aria-disabled="true"]') : null;
      if (target === null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true },
  );
}

/** A keyboard key as a hint next to a button's label. */
export function kbd(key: string): HTMLElement {
  return el('kbd', '', key);
}
