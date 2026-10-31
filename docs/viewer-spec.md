# Fight Viewer Spec

A browser tool that runs one fight with `packages/sim` and plays it back in 3D. It is for watching fights while the sim and the numbers are tuned, and it is the first piece of the game client. It replays the sim's events; it never changes the fight.

## 1. Scope

**In scope**

- Pick both boards from presets, plus seed and stage, and run the fight.
- Play it back at 30 ticks per second with pause, single-step and speed control.
- Show the board, units, health, shields, mana, attacks, projectiles, abilities, statuses, deaths and the result.
- A readable event log.

**Out of scope (later)**

- Placing units by drag and drop, the shop and the rest of a round.
- Real models, animation rigs and sound.
- Networking. The viewer runs the sim itself, as the game client will (`sim-spec.md` section 14).

---

## 2. Package

- `packages/client`: Vite, Three.js and TypeScript, using `@lotr-tactics/sim` from the workspace, and the browser-safe part of `@lotr-tactics/server` for the play page.
- `pnpm dev` serves it; `pnpm build` writes a static build to `packages/client/dist`. CI builds it too.
- The client may use the DOM, time APIs and all of `Math`. The sim's determinism rules don't apply, because the client only displays the fight.
- Layout:

```
packages/client/
  index.html       the fight viewer
  play.html        the play page (game-spec.md section 12)
  src/
    main.ts        viewer page setup, controls, URL state
    play.ts        play page setup: connections, keys, the frame loop, and which panels show
    flow.ts        the play page's steps from the game's messages, what it sends back, the timer and a round's results (no Three.js, no DOM)
    connection.ts  offline and WebSocket connections to a game (server-spec.md section 10)
    fights.ts      which fight in a round is the person's
    boards.ts      preset and random boards
    layout.ts      hex and bench positions, and finding the place under a point
    playback.ts    stepping the fight and what to draw at a moment (no Three.js, no DOM)
    scene.ts       Three.js scene, units, the planning view, and the marker where a drag would drop
    units.ts       names and sizes of units, monsters and summons
    items.ts       item and Ring of Power colours, and what each item is and does, from the item data
    gifts.ts       Gift tiers and effects from the Gift data
    ring.ts        the One Ring's tier and effects at a Corruption
    traits.ts      what each trait does at each breakpoint, and the trait tracker's rows from the sim's count
    tips.ts        what each tooltip says: items, rings, Gifts, traits, units and actions
    hud.ts         the HUD's stats, streak, timer and One Ring status
    players.ts     the players list's rows
    icons.ts       the icon set, and the icon for each trait, component, Gift tier, round type and status
    log.ts         event log text
    style.css      the design system and both pages' styles
    ui/            DOM pieces both pages use
      dom.ts       building elements and icons, `rebuild`, and disabled buttons that still say why
      tooltip.ts   the tooltip card: when it shows, where, and following what it describes
      tip-card.ts  a tooltip's contents
      chips.ts     item and ring chips, trait badges and costs
      labels.ts    the overlay above each unit
    play/          the play page's parts
      hud-bar.ts      the HUD
      shop-bar.ts     Buy XP, Reroll and Lock, the shop's unit cards, the items, Ready, and selling
      side-panels.ts  the trait tracker, and the players list with the person's Gifts
      panels.ts       the Council, the Gift offer, a round's results, the end, and the fight's banner
      menu.ts         the menu and the lobby screen
      drag.ts         dragging units and items, and what the drop would do
  test/
```

- flow.ts, playback.ts and the modules from units.ts to log.ts use neither Three.js nor the DOM, so they are tested (section 7). scene.ts and the modules in ui/ and play/ draw what those work out, and are checked in a browser.
- **Look:** both pages share one design system in style.css: a deep slate background with gold accents; tokens for colours, spacing, radii, shadows and motion; buttons (primary, secondary, ghost, danger and icon-only), fields, panels and chips. Headings use Cinzel and everything else Inter, both bundled from `@fontsource` packages, so the built client needs nothing from the network. Text has a contrast of at least 4.5:1, focus shows a gold ring, and motion stops when the system asks for reduced motion.
- **Icons:** inline SVGs from icons.ts, all drawn on one 24-unit grid with a rounded stroke in `currentColor`. Each trait and item component has its own icon, keyed by its id, so a new one fails the typecheck until it has an icon. Icons next to text are hidden from screen readers; buttons with only an icon have a label.
- **Tooltips:** hovering or focusing anything with a tip shows one card for it (ui/tooltip.ts), laid out from tips.ts: an icon, name and subtitle, a recipe, stats, effects, a trait's breakpoints, a key, and a hint or the reason a button can't be used. It stays on screen, follows chips on moving units, never takes the mouse, and hides while something is dragged. Buttons that can't be used now are marked `aria-disabled` rather than disabled, so they can still say why.

---

## 3. Board and camera

- **Board:** pointy-top hexes, odd-r offset, matching `sim-spec.md` section 5.
  - Board offset (col, row) sits at `x = √3 × (col + 0.5 × (row mod 2))`, `z = 1.5 × row`, centred on the board.
  - Team A's half (rows 0–3) and team B's (rows 4–7) are tinted differently.
- **Camera:** behind team A's back row, looking across the board. The mouse orbits, pans and zooms.

---

## 4. Units

- **Body:** a low-poly pawn in its team's colour. Large units are drawn bigger. Summons are smaller and have no name.
- **Overlay** above each unit (ui/labels.ts):
  - a name plate with star pips: one bronze pip at 1★, two silver at 2★ and three gold at 3★; summons have no pips, and those without a name no plate
  - its items as chips, each naming its effect when hovered, and the One Ring with its Corruption on the Ring's bearer
  - a health bar with a tick for every 250 Health and a heavier one for every 1000, and the shield drawn after it
  - a mana bar
  - icons for stun, stun immunity and untargetable
  - It only writes to the page when a value has changed, and allocates nothing otherwise.
- **Facing:** each unit turns towards its target.
- **Untargetable:** the unit is drawn faded.
- **Death:** the unit sinks and fades out over half a second of fight time.

---

## 5. Playback

- The viewer creates the fight with `createCombat` and calls `step()` once per tick, at 30 ticks per second times the speed.
- **Display time** is the last tick processed plus the fraction of the next one, so motion is smooth between ticks.
- **What is drawn at a display time:**
  - **Positions:** a `move` is interpolated from `from` to `to` between its tick and `arriveTick`. A `dash` takes 4 ticks.
  - **Projectiles:** a ranged `attack` fires from the attacker's position at that moment and flies to the target, landing on `hitTick`.
  - **Melee attacks:** a short lunge towards the target.
  - **Numbers:** `damage` and `heal` rise above the target and fade over 24 ticks.
    - Physical damage is orange, magic blue, true white; heals are green.
    - Crits are bigger. Absorbed damage is shown separately.
  - **Casts:** a ring on the ground and the ability's name above the caster, in a gold pill.
- Health, shields, mana and statuses come from `combat.state`, which is the state after the last processed tick.
- At the end, a banner shows the result and the final tick, in gold for a win and grey for a draw.

---

## 6. Controls

- **Fight:** team A board, team B board, seed, stage, and a New fight button.
  - Presets: duel, tanks, archers, mixed, full, items (all 21 combined items), ring (a One Ring bearer), rings (the Three, the Seven and the Nine), traits.
  - Random: 7 units with star levels from 1 to 3 and up to 3 random items each, placed at random on their half, from the seed and the team.
- **Playback:**
  - Play/pause, an icon button that the space bar also toggles.
  - Step one tick, an icon button, also ArrowRight or `.`.
  - Restart, an icon button.
  - Speed: a segmented control of 0.25×, 0.5×, 1×, 2× and 4×.
  - The current tick, time and overtime.
- **URL:** the fight settings are kept in the URL hash, for example `#a=full&b=traits&seed=3&stage=2`, so a fight can be shared and reloaded.
- **Event log:** one line per event except moves, with unit names, newest last, coloured by the kind of event, with casts, deaths and the end marked.

---

## 7. Tests

The parts without Three.js are tested with Vitest:
- the hex layout;
- random boards, which are valid and the same for the same seed;
- playback timing, interpolated positions and projectiles;
- the event log text;
- item and Ring of Power colours and descriptions, Gift descriptions, and the One Ring's;
- the icons: every trait, item component, Gift tier, round type and label status has one, each trait and component its own;
- trait text and the trait tracker's rows;
- tooltip content, the HUD's values, the players list's rows, a round's results and the timer.

The Three.js scene and the pages are checked by building them and looking at them in a browser.
