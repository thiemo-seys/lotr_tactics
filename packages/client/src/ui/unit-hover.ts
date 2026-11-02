// Hovering a unit in the 3D view shows its card (docs/game-spec.md section 12, docs/viewer-spec.md
// section 4): its stats and what its ability does, above its label. A fighting unit's card follows
// its Health and mana as the fight goes on.

import type { FightScene, UnitPick } from '../scene.js';
import type { Tip } from '../tips.js';
import { pointTip } from './tooltip.js';

/** Shows the card `tipFor` gives for the unit under the pointer in `view`, while `canHover` allows. */
export function hoverUnits(view: HTMLElement, scene: FightScene, tipFor: (pick: UnitPick) => Tip | null, canHover: () => boolean = () => true): void {
  view.addEventListener('pointermove', (event) => {
    // Not on touch, and not while a mouse button is held, such as to turn the camera or drag.
    const pick = event.pointerType === 'touch' || event.buttons !== 0 || !canHover() ? null : scene.unitAt(event.clientX, event.clientY, event.target);
    if (pick === null) pointTip(null);
    else pointTip(pick.label, () => tipFor(pick), pick.kind === 'fight');
  });
  view.addEventListener('pointerleave', () => pointTip(null));
}
