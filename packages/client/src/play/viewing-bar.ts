// The bar over another player's board while the person looks at it (docs/game-spec.md section 12):
// whose board it is, what everyone can see of that player, and the way back to the person's own.

import type { PlayFlow } from '../flow.js';
import { plural } from '../hud.js';
import { textTip } from '../tips.js';
import { itemChip, ringChip } from '../ui/chips.js';
import { el, icon, kbd, rebuild } from '../ui/dom.js';
import { setTip } from '../ui/tooltip.js';

/** Draws the bar for the player being looked at; the page hides it while the person's own board is shown. */
export function renderViewingBar(bar: HTMLElement, flow: PlayFlow): void {
  const p = flow.viewed();
  if (p === null) return;
  const name = flow.seatName(p.seat);
  const bot = flow.lobby?.seats[p.seat]?.kind === 'bot';
  const ring = flow.ringOf(p.seat);
  // The Ring is among their items until they give it to a unit, whose label then shows it.
  const unworn = ring !== null && ring.bearer === null ? ring.corruption : null;
  const fielded = p.board.filter((u) => u !== null).length;
  rebuild(bar, JSON.stringify([p.seat, name, bot, p.hp, p.level, p.gold, fielded, p.items, unworn]), () => {
    const stat = (className: string, tip: string, ...children: (Node | string)[]) => {
      const pill = el('span', `viewing-stat ${className}`, ...children);
      setTip(pill, textTip(name, tip));
      return pill;
    };
    const back = el('button', 'btn btn-secondary btn-sm viewing-back', icon('leave'), 'Your board', kbd('Esc'));
    back.addEventListener('click', () => flow.viewBoard(null));
    setTip(back, textTip('Your board', 'Go back to your own board and traits.'));
    const items = [...(unworn === null ? [] : [ringChip(unworn, 'sm')]), ...p.items.map((id) => itemChip(id, 'sm'))];
    return [
      el('span', 'viewing-eyebrow', icon('viewer'), 'Viewing'),
      el('span', 'viewing-name', icon(bot ? 'bot' : 'person'), el('span', '', name)),
      el(
        'span',
        'viewing-stats',
        stat('hp', `${plural(Math.max(0, p.hp), 'HP', 'HP')} left.`, icon('hp'), String(Math.max(0, p.hp))),
        stat('level', `Level ${p.level}: ${fielded} of ${plural(p.level, 'unit')} on the board.`, el('b', 'level-badge', String(p.level)), `${fielded}/${p.level}`),
        stat('gold', `${plural(p.gold, 'gold', 'gold')}.`, icon('gold'), String(p.gold)),
      ),
      items.length === 0 ? null : el('span', 'viewing-items', ...items),
      back,
    ].filter((node): node is HTMLElement => node !== null);
  });
}
