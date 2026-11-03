# Fight Viewer Spec

A browser tool that runs one fight with `packages/sim` and plays it back in 3D. It is for watching fights while the sim and the numbers are tuned, and it is the first piece of the game client. It replays the sim's events; it never changes the fight.

## 1. Scope

**In scope**

- Pick both boards from presets, plus seed and stage, and run the fight.
- Play it back at 30 ticks per second with pause, single-step and speed control.
- Show the board, units, health, shields, mana, attacks, projectiles, abilities, statuses, deaths and the result.
- A readable event log.
- A damage meter (section 8).

**Out of scope (later)**

- Placing units by drag and drop, the shop and the rest of a round.
- Models for monsters and summons, animation rigs and sound.
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
    models.ts      loading unit models, dressing a copy per unit, and the base under it
    stars.ts       which model, scale, label height and colours a star level gets (no Three.js, no DOM)
    units.ts       names and sizes of units, monsters and summons
    items.ts       item and Ring of Power colours, and what each item is and does, from the item data
    gifts.ts       Gift tiers and effects from the Gift data
    ring.ts        the One Ring's tier and effects at a Corruption
    traits.ts      what each trait does at each breakpoint, and the trait tracker's rows from the sim's count
    tips.ts        what each tooltip says: items, rings, Gifts, traits, units and actions
    abilities.ts   what an ability does, in words, from its steps and the sim's ability values
    hud.ts         the HUD's stats, streak, timer, One Ring status and stage tracker
    shop.ts        how a shop card marks a unit the person already has
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
      unit-hover.ts  the card for the unit under the pointer in the 3D view
    play/          the play page's parts
      hud-bar.ts      the HUD
      shop-bar.ts     Buy XP, Reroll and Lock, the shop's unit cards, the items, Ready, and selling
      side-panels.ts  the trait tracker, and the players list with the person's Gifts
      panels.ts       the Council, the Gift offer, a round's results, the end, and the fight's banner
      menu.ts         the menu and the lobby screen
      drag.ts         dragging units and items, and what the drop would do
  test/
```

- flow.ts, playback.ts, stars.ts and the modules from units.ts to log.ts use neither Three.js nor the DOM, so they are tested (section 7). scene.ts, models.ts and the modules in ui/ and play/ draw what those work out, and are checked in a browser.
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

- **Body:** the unit's model (below; `public/models/` lists them when the client is built, so a missing one is never requested), with its `team` material in its team's colour. A unit without a model, or whose model hasn't loaded, is a low-poly pawn in its team's colour; Large pawns are drawn bigger. Summons are smaller and have no name.
- **Overlay** above each unit (ui/labels.ts):
  - a name plate with star pips: one bronze pip at 1★, two silver at 2★ and three gold at 3★; summons have no pips, and those without a name no plate
  - its items as chips, each naming its effect when hovered, and the One Ring with its Corruption on the Ring's bearer
  - a health bar with a tick for every 250 Health and a heavier one for every 1000, and the shield drawn after it
  - a mana bar
  - icons for stun, stun immunity and untargetable
  - It only writes to the page when a value has changed, and allocates nothing otherwise.
- **Hovering** a unit, its model or pawn, shows its card above its label (ui/unit-hover.ts): its name, star level, cost and traits, its current Health, shield and mana, its current stats, and its ability with the mana it costs and what it does, written from the ability's steps with the numbers the sim's `abilityValue` gives at its star level and Ability Power (abilities.ts). The card follows the fight a few times a second. Monsters are named as monsters and summons as summons.
- **Facing:** each unit turns towards its target.
- **Untargetable:** the unit is drawn faded.
- **Death:** the unit sinks and fades out over half a second of fight time.

### Models

Each unit, monster and summon gets its own model in the **Faceted** art style, chosen from a study that built Gimli in five styles (`packages/client/art/style-study/`, with the comparison in its `results/`). The roster's 36 units have their models (`packages/client/art/`, whose README lists them), with Gimli (`art/units/gimli.py`) as the reference model. Monsters and summons have none yet.

- **Look:** classic low-poly. Every form is built from low-segment shapes and hand-placed vertices and shaded flat, so the facets show. No smooth shading, bevels or textures.
- **Proportions:** grounded and heroic, with each people's own build: Hobbits short and round, Dwarves stocky, Elves tall and slim, Orcs hunched, Nazgûl hooded and faceless, Istari robed. Heads and hands are a little big, so they read at game size.
- **Heights,** to the top of the head, hood, helm or hat brim (weapons, crests and a hat's point go higher): Hobbits 0.88, Dwarves 1.15, Orcs about 1.2 as they stoop and Uruk-hai about 1.4, Men 1.42, Istari 1.45, Elves 1.48 and Nazgûl 1.55.
- **Large units** are built at their full size, Treebeard and Sauron about 2.1 to 2.4 tall, so the viewer draws their models unscaled, unlike their pawns.
- **Riders** ride: the Rohirrim and the Nazgûl on horses, and Sharku on a warg. The horse is shared (`art/mounts.py`); its back is at about 0.72 and its rider's head at about 1.6.
- **Size:** a model, with its weapons and mount, stays within 0.94 of its centre, the radius the hexes are drawn with.
- **Colour:** a muted, earthy palette in which the team colour is the only saturated part. Steel is a light grey with a metalness of 0.15 or less, because the scene has no environment map and metal would draw dark.
- **Team colour:** on parts every model has, seen from the front, from behind and from above, in a material named `team` that the viewer recolours. Gimli's are his hood, cape and shield face.
- **Role:** shows in the silhouette: shields for Guardians, bows for Archers, staffs for Sorcerers, mounts for Riders, hoods and daggers for Burglars, banners or capes for Captains.
- **Budget** *(placeholder)*: about 800 triangles for a unit, 1,200 for a mounted unit and 2,000 for a Large unit or monster.
- **Build:** Blender 4.5 LTS, one Python script per model in `packages/client/art/`, exported as glTF binary. 1 Blender unit is 1 game unit, the origin is the centre of the model's base on the ground, and a model faces +Z in the game (−Y in Blender). One object per model, with colour from materials named after what they are. No model shows the One Ring or a Ring of Power, since any unit can carry them.

### Star levels

A unit's star level shows four ways at once, chosen from a study of Frodo, Aragorn and Éomer on the board (`packages/client/art/star-study/`, with the comparison in its `results/`). Each is for units with a model; a unit drawn as a pawn shows its stars in its label only.

- **Label:** the name plate keeps its star pips (section 4, overlay).
- **Model:** a 2★ unit uses its gear model and a 3★ unit its book model, falling back to the level below when one doesn't exist yet.
  - **Gear** (`<id>-2.glb`): the 1★ model with one piece added that reads at game size, such as shoulder plates, a helm or a mantle. Aragorn's is steel shoulder plates.
  - **Book moment** (`<id>-3.glb`): the unit as itself at its height in the books, drawn from the books and not the films, and still recognisably the same unit: Frodo in the mithril coat, Aragorn as King Elessar with the winged crown and Arwen's standard, Éomer as Éomer King with the royal banner. It need not keep the 2★ piece.
  - **Budgets** *(placeholder)*: a gear model has 12.5% more triangles than its unit's budget (900, 1,350 for a mounted unit, 2,250 for a Large one), and a book model 25% more (1,000, 1,500 and 2,500). Both keep every other rule in this section, the hex included.
- **Size:** 2★ and 3★ models are drawn 10% bigger *(placeholder)*, but never past the hex: the scale is the smaller of 1.1 and 0.94 divided by the model's reach from its centre, and never below 1. Riders, whose horses already reach about 0.91, grow only about 3%. Large models start from 1, not the pawns' 1.35.
- **Base:** each unit with a model stands on a low hexagonal stand, 0.05 tall with a radius of 0.8, in dark stone, lined up with its tile. The model stands on top of it.
  - Its rim is plain stone at 1★, silver at 2★ and muted gold at 3★.
  - Pips on the edge towards the other team's half count the stars: one, two or three small diamonds in pale stone, silver and gold.
  - Summons and monsters have no base.
- **Trim:** buckles, clasps, sword fittings and similar parts use a material named `trim`, which the viewer colours iron at 1★, silver at 2★ and muted gold at 3★, whatever its colour in the model.
- **Colours** *(placeholder)*: iron `#6b6f74`; silver `#c9ced4`; gold `#c4a04a`; plain stone rim `#4b4f55`, stand `#3d3a35` and pale pips `#b8b2a6`. Gold stays muted, so the team colour is still the only saturated part.
- **Label height:** the label rises with the model: 1.8 above the base, times the model's scale, or 0.3 above a Large model's top if that is higher.
- **No glow:** a star level never shows as an aura or light, which would read as an ability's effect.

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
  - Presets: duel, tanks, archers, mixed, full, items (all 21 combined items), ring (a One Ring bearer), rings (the Three, the Seven and the Nine), stars (Frodo, Aragorn and Éomer at 1★, 2★ and 3★, for star levels on models), traits.
  - Random: 7 units with star levels from 1 to 3 and up to 3 random items each, placed at random on their half, from the seed and the team.
- **Playback:**
  - Play/pause, an icon button that the space bar also toggles.
  - Step one tick, an icon button, also ArrowRight or `.`.
  - Restart, an icon button.
  - Speed: a segmented control of 0.25×, 0.5×, 1×, 2× and 4×.
  - The current tick, time and overtime.
- **URL:** the fight settings are kept in the URL hash, for example `#a=full&b=traits&seed=3&stage=2`, so a fight can be shared and reloaded.
- **Damage meter:** a Damage button next to Log opens and closes the meter (section 8), with a switch between teams A and B, since the viewer takes no side.
- **Event log:** one line per event except moves, with unit names, newest last, coloured by the kind of event, with casts, deaths and the end marked.

---

## 7. Tests

The parts without Three.js are tested with Vitest:
- the hex layout;
- random boards, which are valid and the same for the same seed;
- playback timing, interpolated positions and projectiles;
- the event log text;
- the damage meter's rows: totals and parts per tab, summons in their owner's row, the Eye's Nazgûl in its own, order and ties;
- item and Ring of Power colours and descriptions, Gift descriptions, and the One Ring's;
- the icons: every trait, item component, Gift tier, round type and label status has one, each trait and component its own;
- trait text and the trait tracker's rows;
- tooltip content, the HUD's values, the players list's rows, a round's results and the timer;
- the model a star level uses, falling back to the level below, its scale within the hex and its label height.

The Three.js scene and the pages are checked by building them and looking at them in a browser.

---

## 8. Damage meter

A panel on both pages, with one row per unit of a team, showing what it has done so far in the fight. It adds up the fight's events (`meter.ts`, without the DOM), so it follows playback and never changes the fight.

- **Tabs:** Dealt (`damage` events by source), Taken (by target), and Healing (`heal` and `shield` events by source).
- **Amounts:** in full: a damage event counts its whole `amount`, including what a shield absorbed and any overkill. A shield counts the amount it gave.
- **Summons** count for the unit that made them, the `spawn` event's `owner` (`sim-spec.md` section 14): an Orc for the Orc trait's grunts, the caster for an ability's. The Eye's Nazgûl has no owner and gets its own row.
- **Rows:** every unit of the team that has spawned, those that have done nothing too, most first, ties by unit id. Each row shows the unit's name, star level and total, and a bar as long as its share of the top total, split by damage type in the floating numbers' colours (physical orange, magic blue, true white), or into healing in green and shielding in silver. Dead units are dimmed. Hovering a row lists its parts.
- **Opening and closing:** a Damage button in the top bar opens and closes it, and so does the panel's close button. It starts closed. Whether it is open and which tab is picked are kept in the browser's local storage, shared by both pages.
- **Fight viewer:** at the top left, with a switch between teams A and B.
- **Play page** (`game-spec.md` section 12): at the bottom left, under the trait tracker. Only the person's own fight and team: the button shows while their fight plays and through its results, and the meter follows the fight as it plays, then shows all of it in the results, even if it was skipped. It isn't there in a Council or planning, or in a round when the person had no fight.
