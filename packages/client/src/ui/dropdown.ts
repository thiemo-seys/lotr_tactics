// A button that opens and closes a list under it, such as the play page's menu in the top bar. A
// click outside the list, Escape, or choosing a link or button in it closes it again; a toggle in
// it (a button with aria-pressed) leaves it open, so the person sees the toggle change. An Escape
// that closes it does nothing else.

import { show } from './dom.js';

export function dropdown(button: HTMLElement, list: HTMLElement): void {
  const open = () => !list.hasAttribute('hidden');
  const set = (shown: boolean) => {
    show(list, shown);
    button.setAttribute('aria-expanded', String(shown));
  };
  button.addEventListener('click', (event) => {
    set(!open());
    // A click with the mouse doesn't keep the keyboard, so the space bar keeps its job on the page.
    if (event.detail > 0) button.blur();
  });
  list.addEventListener('click', (event) => {
    const item = (event.target as Element).closest('a, button');
    if (item !== null && !item.hasAttribute('aria-pressed')) set(false);
  });
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Node;
    if (open() && !list.contains(target) && !button.contains(target)) set(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !open()) return;
    // Closing the menu is all this Escape does: the page's own Escape, back to the person's board
    // from another player's, listens on the window, after the document.
    event.stopPropagation();
    set(false);
    button.focus();
  });
}
