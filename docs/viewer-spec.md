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
- Real models, animation rigs, sound and polish.
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
    play.ts        play page setup: menu, lobby, shop, Council, fights, drag and drop
    connection.ts  offline and WebSocket connections to a game (server-spec.md section 10)
    fights.ts      which fight in a round is the person's
    boards.ts      preset and random boards
    layout.ts      hex and bench positions, and finding the place under a point
    playback.ts    stepping the fight and what to draw at a moment (no Three.js, no DOM)
    scene.ts       Three.js scene, units, overlays, and the planning view
    units.ts       names and sizes of units, monsters and summons
    items.ts       item tags, colours and descriptions from the item data
    log.ts         event log text
    style.css
  test/
```

---

## 3. Board and camera

- **Board:** pointy-top hexes, odd-r offset, matching `sim-spec.md` section 5.
  - Board offset (col, row) sits at `x = √3 × (col + 0.5 × (row mod 2))`, `z = 1.5 × row`, centred on the board.
  - Team A's half (rows 0–3) and team B's (rows 4–7) are tinted differently.
- **Camera:** behind team A's back row, looking across the board. The mouse orbits, pans and zooms.

---

## 4. Units

- **Body:** a low-poly pawn in its team's colour. Large units are drawn bigger. Summons are smaller and have no name.
- **Overlay** above each unit:
  - name and star level
  - its items, if any, each naming its effect when hovered
  - a health bar with the shield drawn after it
  - a mana bar
  - tags for stun, stun immunity and untargetable
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
  - **Casts:** a ring on the ground and the ability's name above the caster.
- Health, shields, mana and statuses come from `combat.state`, which is the state after the last processed tick.
- At the end, a banner shows the result and the final tick.

---

## 6. Controls

- **Fight:** team A board, team B board, seed, stage, and a New fight button.
  - Presets: duel, tanks, archers, mixed, full, items (all 21 combined items), traits.
  - Random: 7 units with star levels from 1 to 3 and up to 3 random items each, placed at random on their half, from the seed and the team.
- **Playback:**
  - Play/pause, which the space bar also toggles.
  - Step one tick.
  - Restart.
  - Speed: 0.25×, 0.5×, 1×, 2× or 4×.
  - The current tick, time and overtime.
- **URL:** the fight settings are kept in the URL hash, for example `#a=full&b=traits&seed=3&stage=2`, so a fight can be shared and reloaded.
- **Event log:** one line per event except moves, with unit names, newest last.

---

## 7. Tests

The parts without Three.js are tested with Vitest:
- the hex layout;
- random boards, which are valid and the same for the same seed;
- playback timing, interpolated positions and projectiles;
- the event log text;
- item tags and descriptions.

The Three.js scene is checked by building the viewer and looking at it in a browser.
