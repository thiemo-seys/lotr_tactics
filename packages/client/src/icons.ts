// The client's icons (docs/viewer-spec.md section 2): one set of inline SVGs drawn on a 24-unit
// grid in one style, a rounded 1.8-unit stroke in `currentColor` with a light fill on the main
// shape, plus which icon stands for each trait, item component, Gift tier, round type and status.
// The mappings are keyed by the sim's ids, so a new trait or component fails the typecheck until it
// has an icon. No Three.js or DOM, so it can be tested.

import type { ComponentId, GiftTier, RoundType, TraitId } from '@lotr-tactics/sim';

// Shapes with class "f" get a light fill and shapes with class "s" a solid one (style.css).
const HEART = 'M12 20.3C6.9 17 3.5 13.6 3.5 9.6 3.5 6.8 5.6 4.7 8.2 4.7c1.6 0 3 .8 3.8 2.1.8-1.3 2.2-2.1 3.8-2.1 2.6 0 4.7 2.1 4.7 4.9 0 4-3.4 7.4-8.5 10.7z';
const SHIELD = 'M12 2.8l7.5 2.8v5.8c0 4.7-3.1 8.2-7.5 9.8-4.4-1.6-7.5-5.1-7.5-9.8V5.6z';
const EYE = 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z';
/** A ring band seen from above at an angle, centred at y = 0. */
const band = (y: number) =>
  `<path class="f" fill-rule="evenodd" d="M3.5 ${y}a8.5 5.4 0 1 0 17 0 8.5 5.4 0 1 0-17 0zm3.1-.5a5.4 2.9 0 1 0 10.8 0 5.4 2.9 0 1 0-10.8 0z"/>` +
  `<path d="M3.5 ${y}v1.6c0 3 3.8 5.4 8.5 5.4s8.5-2.4 8.5-5.4V${y}"/>`;

export const ICONS = {
  // Player stats and the HUD
  hp: `<path class="f" d="${HEART}"/>`,
  damage: `<path class="f" d="${HEART}"/><path d="M12 6.8l-1.7 3.5 3 1.9-2.1 3.8"/>`,
  gold: '<ellipse class="f" cx="12" cy="7" rx="7.5" ry="3.2"/><path d="M4.5 7v4.6c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2V7M4.5 11.6v4.8c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2v-4.8"/>',
  coin: '<circle class="f" cx="12" cy="12" r="8.5"/><path d="M12 7.4l1.12 3.06 3.25.12-2.56 2.01.89 3.13L12 13.9l-2.7 1.82.89-3.13-2.56-2.01 3.25-.12z"/>',
  level: '<path d="M6.5 12.5L12 7l5.5 5.5M6.5 18L12 12.5l5.5 5.5"/>',
  'level-up': '<circle class="f" cx="12" cy="12" r="9"/><path d="M12 16.5v-9M8 11.5l4-4 4 4"/>',
  timer: '<path d="M6.5 3.5h11M6.5 20.5h11M7.8 3.5c0 4.2 4.2 5.4 4.2 8.5s-4.2 4.3-4.2 8.5M16.2 3.5c0 4.2-4.2 5.4-4.2 8.5s4.2 4.3 4.2 8.5"/><path class="s" d="M9.2 20.5c.5-1.9 2.8-3.2 2.8-3.2s2.3 1.3 2.8 3.2z"/>',
  board: '<path class="f" d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z"/>',
  'streak-win':
    '<path class="f" d="M12 21c-3.9 0-6.5-2.7-6.5-6.3 0-3.2 2-5 3.2-7.2.4 1.6 1.2 2.6 2.2 3C11 7.2 12.6 4.5 15.2 3c-.6 3 .8 5 2.1 7 .9 1.4 1.2 2.9 1.2 4.4 0 3.8-2.6 6.6-6.5 6.6z"/><path d="M12 21c-1.7 0-2.9-1.2-2.9-2.9 0-1.8 1.3-2.7 2-4.2.4 1 1 1.5 1.6 1.7.6.8 1.8 1.5 1.8 2.8 0 1.5-1.1 2.6-2.5 2.6z"/>',
  'streak-loss':
    '<path d="M12 21V3M12 6.4L9.86 4.6M12 6.4l2.14-1.8M4.21 16.5l15.58-9M16.85 9.2l.49-2.76M16.85 9.2l2.63.96M4.21 7.5l15.58 9M16.85 14.8l2.63-.96M16.85 14.8l.49 2.76M12 17.6l2.14 1.8M12 17.6l-2.14 1.8M7.15 14.8l-.49 2.76M7.15 14.8l-2.63-.96M7.15 9.2l-2.63.96M7.15 9.2l-.49-2.76"/>',
  // Rounds
  council: '<circle cx="12" cy="4.8" r="2.4"/><circle cx="5" cy="8" r="2.1"/><circle cx="19" cy="8" r="2.1"/><path class="f" d="M2.5 14.6c0-2 4.3-3.6 9.5-3.6s9.5 1.6 9.5 3.6-4.3 3.6-9.5 3.6-9.5-1.6-9.5-3.6z"/><path d="M12 18.2v2.8M8.5 21h7"/>',
  pvp: '<path d="M4.5 4.5L15 15M12.5 17.5l5-5M15.5 15.5l4 4M19.5 4.5L9 15M6.5 12.5l5 5M8.5 15.5l-4 4"/>',
  pve: '<path d="M8.5 3c1.8 4.2 1.4 10.2-2.6 17.5M13.4 3c1.8 4.6 1.2 11.6-2.9 18.5M18.4 3.5c1.6 4.2 1 10.1-2.8 16.5"/>',
  // Shop and planning
  reroll: '<path d="M19.6 10A8 8 0 0 0 5.7 6.9L4.5 8.3M4.4 14a8 8 0 0 0 13.9 3.1l1.2-1.4"/><path d="M4.5 3.8v4.5H9M19.5 20.2v-4.5H15"/>',
  lock: '<rect class="f" x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7M12 14.5v2.5"/>',
  unlock: '<rect class="f" x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.8a4 4 0 0 1 7.8-1.3M12 14.5v2.5"/>',
  ready: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  volcano: '<path class="f" d="M2.5 20.5l5.6-9.5h2.1l1.8 2.2 1.8-2.2h2.1l5.6 9.5z"/><path d="M9.6 7.6c-.9-1.3-.4-3 1-3.7M14.4 7.6c.9-1.3.4-3-1-3.7M12 6.3V2.8"/>',
  // Fights and playback
  play: '<path class="f" d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.3-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z"/>',
  pause: '<rect class="f" x="6" y="4.5" width="4" height="15" rx="1.2"/><rect class="f" x="14" y="4.5" width="4" height="15" rx="1.2"/>',
  step: '<path class="f" d="M5.5 5.5v13l9.5-6.5z"/><path d="M18.5 5.5v13"/>',
  skip: '<path class="f" d="M3.5 5.5v13l7.5-6.5zM11 5.5v13l7.5-6.5z"/><path d="M20.5 5.5v13"/>',
  speed: '<path class="f" d="M3 6v12l8.5-6zM12 6v12l8.5-6z"/>',
  restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9"/>',
  log: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle class="s" cx="4.8" cy="6.5" r="1.1"/><circle class="s" cx="4.8" cy="12" r="1.1"/><circle class="s" cx="4.8" cy="17.5" r="1.1"/>',
  viewer: `<path d="${EYE}"/><circle class="f" cx="12" cy="12" r="3"/>`,
  // Results
  knockout:
    '<path class="f" d="M12 3c-4.7 0-8 3.3-8 7.6 0 2.6 1.2 4.5 3 5.6V19a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 19v-2.8c1.8-1.1 3-3 3-5.6C20 6.3 16.7 3 12 3z"/><circle class="s" cx="9" cy="11.5" r="1.8"/><circle class="s" cx="15" cy="11.5" r="1.8"/><path d="M10.5 20.5V18M13.5 20.5V18"/>',
  medal: '<path d="M8 2.8l2.8 6.4M16 2.8l-2.8 6.4"/><circle class="f" cx="12" cy="15" r="6"/><path d="M12 12.1l.71 1.93 2.05.07-1.62 1.27.56 1.98L12 16.2l-1.7 1.15.56-1.98-1.62-1.27 2.05-.07z"/>',
  trophy:
    '<path class="f" d="M7 3.5h10v5.5a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.5V7A3.5 3.5 0 0 0 8 10.5M17 5.5h2.5V7a3.5 3.5 0 0 1-3.5 3.5M12 14v3.5M8.5 20.5h7M9.5 20.5c0-1.7 1.1-3 2.5-3s2.5 1.3 2.5 3"/>',
  // People and lobbies
  leave: '<path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10"/><path d="M14.5 16.5L19 12l-4.5-4.5M19 12H9.5"/>',
  link: '<path d="M10 13.5a4.2 4.2 0 0 0 6 .3l2.8-2.8a4.2 4.2 0 0 0-6-6L11.3 6.4"/><path d="M14 10.5a4.2 4.2 0 0 0-6-.3l-2.8 2.8a4.2 4.2 0 0 0 6 6l1.5-1.4"/>',
  host: '<path class="f" d="M4.5 17.5L3.5 8l4.8 3.6L12 5l3.7 6.6L20.5 8l-1 9.5z"/><path d="M5 20.5h14"/>',
  bot: '<rect class="f" x="4.5" y="8" width="15" height="11.5" rx="3"/><path d="M12 8V5.2M2.5 12.5V16M21.5 12.5V16"/><circle class="s" cx="12" cy="4" r="1.2"/><circle class="s" cx="9.2" cy="13.5" r="1.4"/><circle class="s" cx="14.8" cy="13.5" r="1.4"/>',
  person: '<circle class="f" cx="12" cy="8" r="4"/><path class="f" d="M4.5 20.5c.6-4 3.6-6.5 7.5-6.5s6.9 2.5 7.5 6.5z"/>',
  connected: '<circle class="s" cx="12" cy="12" r="3"/><path d="M7.4 7.4a6.5 6.5 0 0 0 0 9.2M16.6 7.4a6.5 6.5 0 0 1 0 9.2M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8"/>',
  away: '<path class="f" d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z"/>',
  empty: '<circle cx="12" cy="8" r="4" stroke-dasharray="2.5 2.2"/><path d="M4.5 20.5c.6-4 3.6-6.5 7.5-6.5s6.9 2.5 7.5 6.5" stroke-dasharray="2.5 2.2"/>',
  alert: '<circle class="f" cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.4v.1"/>',
  // The One Ring and the Rings of Power
  'one-ring': `${band(13)}<path class="s" d="M19.5 1.9Q20 4 22.1 4.5Q20 5 19.5 7.1Q19 5 16.9 4.5Q19 4 19.5 1.9z"/>`,
  'ring-of-power': `${band(15)}<path class="s" d="M12 2.5l2.6 3.2L12 9 9.4 5.7z"/>`,
  // Gift tiers
  'tier-silver': '<path class="f" d="M12 3.5l6.5 8.5-6.5 8.5-6.5-8.5z"/><path d="M5.5 12h13M12 3.5L9.6 12l2.4 8.5 2.4-8.5z"/>',
  'tier-gold': '<path class="f" d="M7 4.5h10l4 5L12 20.5 3 9.5z"/><path d="M3 9.5h18M9.6 4.5L8 9.5l4 11 4-11-1.6-5"/>',
  'tier-mithril':
    '<path class="f" d="M12 2.5l1.38 6.17 5.34-3.39-3.39 5.34L21.5 12l-6.17 1.38 3.39 5.34-5.34-3.39L12 21.5l-1.38-6.17-5.34 3.39 3.39-5.34L2.5 12l6.17-1.38-3.39-5.34 5.34 3.39z"/>',
  // Statuses on unit labels
  stun: '<path d="M10.7 12A1.3 1.3 0 0 1 13.3 12 2.6 2.6 0 0 1 8.1 12 3.9 3.9 0 0 1 15.9 12 5.2 5.2 0 0 1 5.5 12" transform="translate(1.3 .6)"/><path class="s" d="M19.5 2.4Q19.9 4.1 21.6 4.5Q19.9 4.9 19.5 6.6Q19.1 4.9 17.4 4.5Q19.1 4.1 19.5 2.4z"/>',
  'stun-immune': `<path class="f" d="${SHIELD}"/><path d="M8.8 12.2l2.3 2.3 4.3-4.6"/>`,
  untargetable: `<path d="${EYE}"/><circle cx="12" cy="12" r="2.8"/><path d="M4 20.5L20 3.5"/>`,
  // Origins
  hobbit: '<path d="M2.5 20.5h19"/><circle class="f" cx="12" cy="12.5" r="8"/><path d="M12 4.5v16M7.5 6.3v13.5M16.5 6.3v13.5"/><circle class="s" cx="12" cy="12.8" r="1.5"/>',
  elf: '<path class="f" d="M12 21.5c-4.8-2.8-6.8-7.3-5.4-11.6C7.9 6 12 2.5 12 2.5s4.1 3.5 5.4 7.4c1.4 4.3-.6 8.8-5.4 11.6z"/><path d="M12 21.5v-14M12 12.5l-2.6-2.2M12 16l2.8-2.4"/>',
  dwarf: '<path d="M12 21.5V3.5"/><path class="f" d="M12 6.8C10 5 7.4 4.4 5 5c.6 2.7.6 5.4 0 8.1 2.4.6 5-.1 7-1.8zM12 6.8c2-1.8 4.6-2.4 7-1.8-.6 2.7-.6 5.4 0 8.1-2.4.6-5-.1-7-1.8z"/>',
  gondor:
    '<path d="M12 21V8.5M9 21h6M12 15c-1.7-1.9-4.2-2.6-6.8-2.2M12 15c1.7-1.9 4.2-2.6 6.8-2.2M12 11.4c-1.3-1.6-3.2-2.3-5.3-2.1M12 11.4c1.3-1.6 3.2-2.3 5.3-2.1"/><circle class="s" cx="12" cy="4.6" r="1.2"/><circle class="s" cx="7.6" cy="5.4" r="1"/><circle class="s" cx="16.4" cy="5.4" r="1"/>',
  rohan:
    '<path class="f" d="M10.8 21c-.1-2.6.4-4.6 1.6-6.4-2 .9-4.5 1.3-6.5.3-1.1-.6-1.6-1.6-1.3-2.6.5-1.8 3-3.6 5.6-6.5l2.6-2.6.7-2.2 1.2 2.1c4 .7 6.4 4.1 6.4 8.9V21z"/><path d="M15.3 7.5c1.4 1.4 2.3 3.6 2.3 6.5"/><circle class="s" cx="10.6" cy="8.8" r="1"/>',
  istari: '<path class="f" d="M3.5 19.2c2.8 1.4 14.2 1.4 17 0-1.3-1.2-3.2-1.9-5-2.3L12.7 3.6c-.2-.7-1.2-.7-1.4 0L8.5 16.9c-1.8.4-3.7 1.1-5 2.3z"/><path d="M8.7 15.5c2.2.7 4.4.7 6.6 0"/>',
  orc: '<path class="f" d="M5.8 8.6C5.8 5.3 8.6 3 12 3s6.2 2.3 6.2 5.6v4.2c0 4.5-2.8 8.2-6.2 8.2s-6.2-3.7-6.2-8.2z"/><path d="M5.8 9.5L2.5 7.8l3.3 4.7M18.2 9.5l3.3-1.7-3.3 4.7M8.3 9.8l2.7 1.3M15.7 9.8L13 11.1M9.4 18.4l-.8-3.9M14.6 18.4l.8-3.9"/>',
  nazgul:
    '<path class="f" d="M12 2.2c-3.3 2.2-7 5.4-7 10.3v8c2.4-.8 4.6-.8 7 0 2.4-.8 4.6-.8 7 0v-8c0-4.9-3.7-8.1-7-10.3z"/><path d="M8.6 14c0-3 1.5-5 3.4-5s3.4 2 3.4 5v2.6c-2.3-.6-4.5-.6-6.8 0z"/><circle class="s" cx="10.6" cy="12.7" r=".8"/><circle class="s" cx="13.4" cy="12.7" r=".8"/>',
  ent: '<path class="f" d="M7.6 15a4 4 0 0 1-1.2-7.7 5.7 5.7 0 0 1 11.2 0A4 4 0 0 1 16.4 15z"/><path d="M12 21v-6M12 18.2l-2.6-2M12 16.6l2.4-1.6M8.5 21h7"/><circle class="s" cx="10" cy="9.8" r="1"/><circle class="s" cx="14" cy="9.8" r="1"/>',
  'dark-lord':
    '<path class="f" d="M2 12c2.8-4.4 6.2-6.6 10-6.6s7.2 2.2 10 6.6c-2.8 4.4-6.2 6.6-10 6.6S4.8 16.4 2 12z"/><path class="s" d="M12 7.4c.9 1.3 1.4 2.9 1.4 4.6s-.5 3.3-1.4 4.6c-.9-1.3-1.4-2.9-1.4-4.6s.5-3.3 1.4-4.6z"/><path d="M12 1.8v1.4M5.6 3.5l.9 1.2M18.4 3.5l-.9 1.2"/>',
  // Classes
  guardian: `<path class="f" d="${SHIELD}"/><circle cx="12" cy="11.6" r="2.6"/>`,
  archer: '<circle cx="10" cy="14" r="7"/><circle class="f" cx="10" cy="14" r="3"/><path d="M10 14l9.5-9.5M19.5 4.5l-3.4.5M19.5 4.5l-.5 3.4M21.3 2.7l-1.8 1.8"/>',
  rider:
    '<path class="f" d="M7.2 20.5H4.5l.7-4.4C3.8 14.5 3 12.4 3 10.2 3 5.9 7 3 12 3s9 2.9 9 7.2c0 2.2-.8 4.3-2.2 5.9l.7 4.4h-2.7l-.5-4.7c1.3-1.4 2-3.3 2-5.4 0-2.9-2.9-5-6.3-5s-6.3 2.1-6.3 5c0 2.1.7 4 2 5.4z"/><circle class="s" cx="5.6" cy="9.4" r=".7"/><circle class="s" cx="18.4" cy="9.4" r=".7"/><circle class="s" cx="8.4" cy="5.8" r=".7"/><circle class="s" cx="15.6" cy="5.8" r=".7"/>',
  burglar:
    '<path class="f" d="M2.5 10.2c0-1.6 1.1-2.7 2.7-2.7 2 0 4 1 6.8 1s4.8-1 6.8-1c1.6 0 2.7 1.1 2.7 2.7 0 3.6-2 6.6-5 6.6-2 0-3-1.6-4.5-1.6s-2.5 1.6-4.5 1.6c-3 0-5-3-5-6.6z"/><path class="s" d="M5.8 11.6c.9-1 2.6-1.1 3.6-.1-.9 1-2.7 1.1-3.6.1zM14.6 11.5c1-1 2.7-.9 3.6.1-.9 1-2.7.9-3.6-.1z"/>',
  captain: '<path d="M6 21.5V2.5"/><path class="f" d="M6 3.5h12.5l-3 4.3 3 4.2H6"/>',
  sorcerer:
    '<path class="f" d="M10 3Q11.5 9 17.5 10.5Q11.5 12 10 18Q8.5 12 2.5 10.5Q8.5 9 10 3z"/><path class="f" d="M18.5 13.9Q19.2 16.8 22.1 17.5Q19.2 18.2 18.5 21.1Q17.8 18.2 14.9 17.5Q17.8 16.8 18.5 13.9z"/><path class="s" d="M18.5 2.8Q18.95 4.55 20.7 5Q18.95 5.45 18.5 7.2Q18.05 5.45 16.3 5Q18.05 4.55 18.5 2.8z"/>',
  // Item components
  blade: '<path class="f" d="M12 2.5l2.2 2.6V15H9.8V5.1z"/><path d="M7 15h10M12 15v4.2"/><circle cx="12" cy="20.6" r="1.3"/>',
  bow: '<path class="f" d="M7 2.8c6 2.3 9.5 5.6 9.5 9.2S13 18.9 7 21.2c4.2-2.8 6.3-5.9 6.3-9.2S11.2 5.6 7 2.8z"/><path d="M7 2.8v18.4"/>',
  mail: '<path class="f" d="M8.5 3.5L4 6.2l1.8 4.6 1.7-.8v10.5h9V10l1.7.8L20 6.2l-4.5-2.7c-.6 1.5-1.9 2.4-3.5 2.4s-2.9-.9-3.5-2.4z"/><path d="M10 12.5l2 1.5 2-1.5M10 16l2 1.5 2-1.5"/>',
  cloak: '<path class="f" d="M12 2.8c-2.6 0-4.3 2.1-4.3 4.7L4 20.8c2.6.9 5.3 1 8 .2 2.7.8 5.4.7 8-.2L16.3 7.5c0-2.6-1.7-4.7-4.3-4.7z"/><path d="M9.5 10c1.6.9 3.4.9 5 0M12 13v7.8"/><circle class="s" cx="12" cy="11.3" r="1.1"/>',
  lembas: '<rect class="f" x="4" y="4" width="16" height="16" rx="3"/><path d="M8 16c.5-4.5 3.5-7.5 8-8-.5 4.5-3.5 7.5-8 8zM8 16l8-8"/>',
  staff: '<path d="M8.5 21.5l5.6-12.8"/><circle class="f" cx="15.6" cy="5.8" r="3.3"/><path d="M12.4 2.9c.6-.6 1.3-.9 2.1-1M19.6 7.7c.3-.6.4-1.3.4-2"/>',
  // Other
  brooch: '<circle class="f" cx="12" cy="12" r="9"/><path d="M12 18.5c-3-1.8-4.2-4.6-3.4-7.3.8-2.4 3.4-4.7 3.4-4.7s2.6 2.3 3.4 4.7c.8 2.7-.4 5.5-3.4 7.3zM12 18.5V9.5"/>',
} as const satisfies Record<string, string>;

export type IconName = keyof typeof ICONS;

/** Each trait's icon, on shop cards, unit cards and the trait tracker. */
export const TRAIT_ICONS: Readonly<Record<TraitId, IconName>> = {
  hobbit: 'hobbit',
  elf: 'elf',
  dwarf: 'dwarf',
  gondor: 'gondor',
  rohan: 'rohan',
  istari: 'istari',
  orc: 'orc',
  nazgul: 'nazgul',
  ent: 'ent',
  'dark-lord': 'dark-lord',
  guardian: 'guardian',
  archer: 'archer',
  rider: 'rider',
  burglar: 'burglar',
  captain: 'captain',
  sorcerer: 'sorcerer',
};

/** Each item component's icon; a combined item shows both of its components'. */
export const COMPONENT_ICONS: Readonly<Record<ComponentId, IconName>> = {
  blade: 'blade',
  bow: 'bow',
  mail: 'mail',
  cloak: 'cloak',
  lembas: 'lembas',
  staff: 'staff',
};

export const GIFT_TIER_ICONS: Readonly<Record<GiftTier, IconName>> = {
  silver: 'tier-silver',
  gold: 'tier-gold',
  mithril: 'tier-mithril',
};

export const ROUND_ICONS: Readonly<Record<RoundType, IconName>> = { council: 'council', pvp: 'pvp', pve: 'pve' };

/** The statuses a unit's label shows, in order. */
export const STATUS_ICONS = { stun: 'stun', stunImmune: 'stun-immune', untargetable: 'untargetable' } as const satisfies Record<string, IconName>;

/** An icon as SVG markup, hidden from screen readers: the text next to it says what it means. */
export function iconSvg(name: IconName): string {
  return `<svg class="icon icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}
