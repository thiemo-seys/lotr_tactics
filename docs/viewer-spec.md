# Fight Viewer Spec

A browser tool that runs one fight with `packages/sim` and plays it back in 3D. It is for watching fights while the sim and the numbers are tuned, and it is the first piece of the game client. It replays the sim's events; it never changes the fight.

## 1. Scope

**In scope**

- Pick both boards from presets, plus seed and stage, and run the fight.
- Play it back at 30 ticks per second with pause, single-step and speed control.
- Show the board, units, health, shields, mana, attacks, projectiles, abilities, statuses, deaths and the result.
- Each unit as its own model for its star level (section 4), playing its clips from the fight's events if it is rigged (section 5).
- A readable event log.
- A damage meter (section 8).

**Out of scope (later)**

- Placing units by drag and drop, the shop and the rest of a round.
- Models for monsters and summons, and sound.
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
  art/             the models' and arenas' Blender scripts, the rig kit, the clip library and the clash check (art/README.md, sections 3 and 4)
  public/models/   one .glb per unit and star level (<id>, <id>-2, <id>-3), built from art/ and committed, which both pages load
  public/arenas/   one .glb per arena, built from art/arenas/ and committed (section 3, Arena)
  src/
    main.ts        viewer page setup, controls, URL state
    play.ts        play page setup: connections, keys, the frame loop, and which panels show
    flow.ts        the play page's steps from the game's messages, what it sends back, the timer, a round's results, what the HUD shows while a fight plays, and whose board is on screen (no Three.js, no DOM)
    connection.ts  offline and WebSocket connections to a game (server-spec.md section 10)
    fights.ts      which fight in a round is the person's
    boards.ts      preset and random boards
    layout.ts      hex and bench positions, and finding the place under a point
    playback.ts    stepping the fight, what to draw at a moment, and what each unit has done, for animation.ts (no Three.js, no DOM)
    animation.ts   which clip each unit plays at a display time, and how far into it (no Three.js, no DOM)
    drawing.ts     when the scene draws a frame, and when pawns swap for their models (no Three.js, no DOM)
    frame-cap.ts   which of the browser's frames run while the frame rate is capped (no Three.js, no DOM)
    models.ts      loading the models, each file once, and a copy for each unit with its own materials and clips
    stars.ts       which model, scale, label height and colours a star level gets (no Three.js, no DOM)
    look.ts        the camera's views and limits, the arena, lights, fog, blur, grade and the tiles' stone pattern (no Three.js, no DOM)
    arena.ts       loading the arena
    post.ts        the blur, grade and vignette laid over each frame
    tiles.ts       the stone pattern on the board's hexes, in their shader
    scene.ts       Three.js scene, units as models or pawns, playing their clips, the planning view, the marker where a drag would drop, and the unit under the pointer
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
      frame-cap.ts   the button that caps the frame rate, and remembering the choice
    play/          the play page's parts
      hud-bar.ts      the HUD
      shop-bar.ts     Buy XP, Reroll and Lock, the shop's unit cards, the items, Ready, and selling
      side-panels.ts  the trait tracker, and the players list with the person's Gifts
      viewing-bar.ts  the bar over another player's board, and the way back to the person's own
      panels.ts       the Council, the Gift offer, a round's results, the end, and the fight's banner
      menu.ts         the menu and the lobby screen
      drag.ts         dragging units and items, and what the drop would do
  test/
```

- flow.ts, playback.ts, animation.ts, drawing.ts, frame-cap.ts, stars.ts, look.ts and the modules from units.ts to log.ts use neither Three.js nor the DOM, so they are tested (section 7). models.ts and arena.ts, which load the models and the arena, post.ts and tiles.ts, and scene.ts and the modules in ui/ and play/, which draw what those work out, are checked in a browser.
- **Look:** both pages share one design system in style.css: a deep slate background with gold accents; tokens for colours, spacing, radii, shadows and motion; buttons (primary, secondary, ghost, danger and icon-only), fields, panels and chips. Headings use Cinzel and everything else Inter, both bundled from `@fontsource` packages, so the built client needs nothing from the network. Text has a contrast of at least 4.5:1, focus shows a gold ring, and motion stops when the system asks for reduced motion.
- **Icons:** inline SVGs from icons.ts, all drawn on one 24-unit grid with a rounded stroke in `currentColor`. Each trait and item component has its own icon, keyed by its id, so a new one fails the typecheck until it has an icon. Icons next to text are hidden from screen readers; buttons with only an icon have a label.
- **Tooltips:** hovering or focusing anything with a tip shows one card for it (ui/tooltip.ts), laid out from tips.ts: an icon, name and subtitle, a recipe, stats, effects, a trait's breakpoints, a key, and a hint or the reason a button can't be used. It stays on screen, follows chips on moving units, never takes the mouse, and hides while something is dragged. Buttons that can't be used now are marked `aria-disabled` rather than disabled, so they can still say why.

---

## 3. Board and camera

- **Board:** pointy-top hexes, odd-r offset, matching `sim-spec.md` section 5.
  - Board offset (col, row) sits at `x = √3 × (col + 0.5 × (row mod 2))`, `z = 1.5 × row`, centred on the board.
  - Each hex is a stone tile with a bevelled top edge, its top at 0, set in the arena's dark mortar, which shows in the gaps between them. Each is worn stone (tiles.ts): its colour mottled and grained, crossed by a few hairline cracks, darker and chipped towards its edges, with a border carved in from them and pale scuffs, each tile different, worked out in the shader so it needs no image and stays sharp at any zoom (the strengths in look.ts). The tiles are a little translucent (72% opaque), so the paving under them shows through and the board sits in the arena; they are drawn before anything else translucent, such as a fading unit or the drop marker.
  - Team A's half (rows 0–3) and team B's (rows 4–7) are different stone: the half of the side drawn near in pale sandstone, and the other in a darker, redder stone. Each half alternates two shades by column.
  - The bench's tiles are square, of a darker stone, set into the paving in front of the near side.
- **Camera:** starts behind the near side's back row, looking across the board. The mouse orbits, pans and zooms, within limits (look.ts) that keep it looking down into the arena and never past its edge: at most 60° from straight down, 8 to 24 units from what it looks at, and that point panned along the ground at most 5 from the board's centre. Every view the scene starts with is within them. A double click on the board, off the units, puts the camera back where it started. The camera stays where the person puts it: nothing else moves it, from fight to fight or between planning and fights. The play page starts it higher and further back, so the bench in front of the board fits too (`game-spec.md` section 12).
  - A fight with team B as the near side is drawn turned half round, so that side stands on the near, pale half. The board is symmetric under the turn.

### Arena

The board stands in an arena, as a lens with a shallow focus would see it: the board and bench sharp, the ruins round them softer the further away they are, the whole in warm, close browns, so the units and their health bars are what stand out. Today there is one, the ruins (`art/arenas/ruins.py`): a court of old Gondor gone to grass, its paving round and under the board, with frames of mortar along the hexes' edges, ringed by rubble and grass, with broken columns, tumbled drums, walls fallen to rubble and the plinths of two fallen kings beyond, on all four sides, since the camera looks from behind either team's back row.

- **Build:** Blender 4.5 LTS, one Python script per arena in `packages/client/art/arenas/`, with what arenas share in `art/arena.py`, exported as glTF binary to `public/arenas/<id>.glb` and committed, as the models are. Faceted like the models (section 4): low-segment shapes, chunky squared stone, shaded flat, no textures. Ambient occlusion is baked into its vertex colours, so corners, gaps and the feet of things are darker. It is exported without normals, and the viewer shades every face flat.
- **Room for the game:** nothing in the court round the board and the bench (|x| < 8.6, |z| < 9.6) stands higher than 0.3, a pebble or a tuft of grass, and nothing under a hex reaches its top. Nothing in the band round the court (|x| < 10.6, |z| < 11.2) stands higher than 1.2, so the cameras over either back row see past it. Taller things stand beyond.
- **Budget** *(placeholder)*: 48,000 triangles.
- **Lights:** a warm sky over a brown ground, and a warm, low sun from the near left (look.ts).
- **Fog:** the background is a dark brown, and the fog fades into it from 39 to 85 units from the camera, so the paving never ends at an edge. It starts past the furthest unit, on the board or the bench, from anywhere the camera can go, so it never dims a unit.
- **Over each frame** (post.ts): the scene is drawn into a multisampled texture with its depth, then
  - blurred, across and then down, by how far each pixel is along the ground from what the camera looks at: none within 10.5, growing smoothly to 8 CSS pixels at 20 and beyond, and on the background. The whole board and bench are within 10.5 of each view's starting point. Pixels in focus count for little in the blur round them, so units don't smear into it.
  - graded, in display colours: warmer, a little less saturated and more contrasted; the board and units get 35% of it, so the livery and health bars stay true, and the rest of the arena all of it, as the blur grows.
  - darkened towards the corners by a vignette, to 58% at the furthest.
- **In the viewer** (arena.ts): both pages load the arena once, in the background, and draw a frame when it arrives. It never moves, and nothing picks it with the pointer. If it is missing or fails to load, the board stands on the background colour.

---

## 4. Units

- **Body:** the unit's model for its star level (Models and Star levels below), standing on its tile, with its `team` material in its livery colour (Livery below). A unit looks the same on either side. Its health bar, green for the near side and red for the far side, is what tells the sides apart, helped by the border of its name plate, red for the far side, and the rings of its casts, blue for the near side and red for the far side (section 5). `public/models/` is listed when the client is built, so a missing model is never requested. Monsters and summons, which have no models yet, and any unit whose model is missing or still loading, are low-poly pawns in one stone colour, the same on both sides. Large pawns are drawn bigger; summons other than the Eye's Nazgûl are smaller and have no name.
- **Overlay** above each unit (ui/labels.ts):
  - a name plate with its star badge, one icon for the star level (icons.ts): the Star of Elendil, a four-pointed bronze star at 1★, an eight-pointed silver star round a dark setting at 2★, and a gold sunburst of sixteen points with a white gem and a soft glow at 3★; summons have no badge, and those without a name no plate. The same badge, one per copy, marks the copies a person owns on the shop's cards and in a trait's tooltip
  - its items as chips, each naming its effect when hovered, and the One Ring with its Corruption on the Ring's bearer
  - a health bar, green for the near side's units and red for the far side's, framed in its star level's colour, bronze at 1★, silver at 2★ and gold with a soft glow at 3★ (a summon's frame is plain), with a tick for every 250 Health and a heavier one for every 1000, and the shield drawn after it
  - a mana bar
  - icons for stun, stun immunity and untargetable, in a row on top, so the name and bars don't move when one comes or goes
  - Its bottom edge sits at the label height (Star levels below), so it grows upwards, and it holds still through planning and fights. A winner's rises as `victory` fades in, if it has to, to clear its victory pose.
  - It only writes to the page when a value has changed, and allocates nothing otherwise.
- **Hovering** a unit, its model or its pawn as the last frame drew them (a rigged model in its pose then), or an item chip on its label, shows its card above its label (ui/unit-hover.ts, from scene.ts's `unitAt`): its name, star level, cost and traits, its current Health, shield and mana, its current stats, and its ability with the mana it costs and what it does, written from the ability's steps with the numbers the sim's `abilityValue` gives at its star level and Ability Power (abilities.ts). The card follows the fight a few times a second. Monsters are named as monsters and summons as summons. A dying unit can't be hovered, so the pointer finds the unit behind it. Hovering changes nothing in the 3D scene, so it draws no frame.
- **Facing:** each unit faces its target, except while a step or dash moves it, when it faces the way it is going. It turns from one to the other over 3 ticks (section 5, Animation). Only the model or pawn turns.
- **Untargetable:** the unit is drawn faded.
- **Death:** the unit plays its `death` clip, if its model has one, and halfway through it starts to sink and fade out, over half a second of fight time.

### Models

Each unit, monster and summon gets its own model in the **Faceted** art style, chosen from a study that built Gimli in five styles (`packages/client/art/style-study/`, with the comparison in its `results/`). The roster's 36 units have their models, one for each star level (`packages/client/art/`, whose README lists them), with Gimli (`art/units/gimli.py`) as the reference model. Monsters and summons have none yet.

- **Look:** classic low-poly. Every form is built from low-segment shapes and hand-placed vertices and shaded flat, so the facets show. No smooth shading, bevels or textures.
- **Proportions:** grounded and heroic, with each people's own build: Hobbits short and round, Dwarves stocky, Elves tall and slim, Orcs hunched, Nazgûl hooded and faceless, Istari robed. Heads and hands are a little big, so they read at game size.
- **Heights,** to the top of the head, hood, helm or hat brim (weapons, crests and a hat's point go higher): Hobbits 0.88, Dwarves 1.15, Orcs about 1.2 as they stoop and Uruk-hai about 1.4, Men 1.42, Istari 1.45, Elves 1.48 and Nazgûl 1.55.
- **Large units** are built at their full size, Treebeard and Sauron about 2.1 to 2.4 tall, so the viewer doesn't enlarge their models as it does their pawns (Star levels below).
- **Riders** ride: the Rohirrim and the Nazgûl on horses, and Sharku on a warg. The horse is shared (`art/mounts.py`); its back is at about 0.72 and its rider's head at about 1.6.
- **Size:** a model, with its weapons and mount, stays within 0.94 of its centre, the radius the hexes are drawn with.
- **Colour:** a muted, earthy palette in which the livery is the only saturated part. Steel is a light grey with a metalness of 0.15 or less, because the scene has no environment map and metal would draw dark.
- **Livery:** on parts every model has, seen from the front, from behind and from above, in a material named `team` that the viewer gives the unit's livery colour, the same on both sides. Gimli's are his hood, cape and shield face. The material keeps its name, and its colour in the `.glb` (the authoring blue in `kit.py`), since the viewer recolours it, so the models need no rebuild. It should stand out from the rest of the model, which a near-black livery on dark robes doesn't.
  - Each unit wears its faction's (origin's) colour or one of its own, a shade of its faction's or another. `src/livery.json` holds them, naming each unit's faction or giving its colour, and the client (`livery.ts`) and the art tools (`art/board.mjs`, `art/preview.py`) all read it, so a model is reviewed in the colour it is played in.
  - The factions' colours: Hobbits hearth red `#a35a33`, Gondor steel blue-grey `#5d6a7c`, Rohan green `#3f6b3a`, Orcs bile olive `#6b6a2c`, Elves Lórien silver `#8c9590`, Dwarves Durin blue `#3f5d8a`, Nazgûl black `#25252a`, the Ent moss green `#4f6b3a` and the Dark Lord dark ember red `#591f16`. Each of the Istari has his own: Radagast brown `#7a5530`, Saruman white `#c9c6be` and Gandalf grey `#8a8c8e`.
- **Role:** shows in the silhouette: shields for Guardians, bows for Archers, staffs for Sorcerers, mounts for Riders, hoods and daggers for Burglars, banners or capes for Captains.
- **Budget** *(placeholder)*: about 800 triangles for a unit, 1,200 for a mounted unit and 2,000 for a Large unit or monster.
- **Build:** Blender 4.5 LTS, one Python script per model in `packages/client/art/`, exported as glTF binary. 1 Blender unit is 1 game unit, the origin is the centre of the model's footprint on the ground, and a model faces +Z in the game (−Y in Blender). One mesh per model, with colour from materials named after what they are; a rigged model adds its armature (Rigs and clips below). No model shows the One Ring or a Ring of Power, since any unit can carry them.
- **In the viewer** (models.ts), in fights and on the planning board and bench:
  - Both pages load every unit's 1★ model once, in the background. A unit's 2★ and 3★ models load once the unit is drawn: its own level's and the next one's, so a unit that is upgraded has its model sooner. Each file loads once.
  - Until a unit's model has loaded, or if it is missing, the unit is a pawn, so a model never breaks a fight. A unit that died as a pawn stays one, so it sinks and fades once.
  - Rigged or static, at any star level: a model with a rig and all seven clips plays them (section 5, Animation). Any other is drawn still, a rigged model without all seven included. Today the 1★ and 2★ models are rigged and the 3★ static; the client assumes neither.
  - Models that load together, or that waited together for their shader, replace pawns at most 3 units a frame, so no frame stalls setting them all up.
  - Before a model is drawn, the scene compiles the shader it needs from a copy of the first model to load that needs it, for the texture the scene is drawn into (section 3, Arena), since three.js builds a different program for it than for the canvas. One shader serves every rigged model, skinned on the GPU, and one every static model, while their materials are all of one kind. It compiles in the background where the browser can, for up to 3 seconds, or else a frame ahead. Until its shader is ready a unit is a pawn, even if its model has loaded; then the pawns swap for their models as they do when models load.
  - Each unit gets its own copy, which shares geometry and clips with the other copies but has its own materials: `team` in its livery colour, `trim` for its star level, and every material able to fade without a new shader, for untargetable and dying units.
  - When the views are rebuilt (planning gives way to a fight, a fight to planning, a restart, a drop), each copy taken off goes to the next view of the same unit at the same star level, on either side, unfaded and posed afresh, rather than being copied again. Copies not taken up are disposed of once the next frame is drawn.
  - A rigged model's meshes get bounds that hold every pose of its clips: a sphere round the column `reach` from its centre and as high as its `attack`, `cast` and `victory` reach, with 10% to spare, so hovering finds a part in any pose.
  - A full board, 9 units a side plus summons, stays smooth:
    - A frame is drawn only when something on screen changes: the fight's display time, planning units idling (not under reduced motion, when `idle` holds still), the camera, the size, the units, a dragged unit or the marker. A WebGL context restored after it was lost clears the canvas, as a resize does, so the frame is drawn again.
    - On frames between ticks the client's own code allocates nothing and writes to the page only what has changed. Three.js and the sim's ticks still allocate.
    - What is removed is disposed of.

### Rigs and clips

Every unit's 1★ model is rigged and carries its own animations, which the viewer plays (section 5, Animation). Its 2★ gear model is rigged too, with the 1★ model's rig: the same bones and clips (Star levels below). `docs/animation-plan.md` tells how they were rigged and checked. The 3★ book models are static for now. Gimli's is the reference rig (`art/units/gimli.py`), and each people has a reference of its own that the others follow (`art/README.md`).

- **Rigid skinning:** a model is one skinned mesh on one armature. Every vertex follows exactly one bone with weight 1, so parts move as solid pieces, like the facets they're built from. Where pieces meet they overlap, so nothing has to stretch. A vertex may follow another bone on purpose, such as the middle of a bowstring following the hand that draws it.
- **Rest pose as built:** bones sit at the joints of the model as it stands, after `lean()`, `turn()` and `stoop()`, and clips turn them from there. Nothing is rebuilt in a T-pose, but a part that has to bend is built as two that overlap where it bends, such as Gimli's legs, a thigh and a shin, and his mail, a skirt on his hips and a chest on his spine.
- **Bones,** with fixed names (the budget is a placeholder):
  - Every model has these 16, named for the model's own left (`_l`, +X in Blender) and right (`_r`): `root`, on the ground at the origin and the parent of the rest; `hips`; `spine`; `head`; `upper_arm_l`, `forearm_l`, `hand_l`; `upper_arm_r`, `forearm_r`, `hand_r`; `thigh_l`, `shin_l`, `foot_l`; `thigh_r`, `shin_r`, `foot_r`. Weapons, shields and staffs follow the hand that holds them.
  - A model may add bones of its own, in lower case with digits and underscores, named after what they move, such as `cape`, `beard`, `tail` or `robe_2` (`art/README.md`). The roster's models have these:
    - `cape`, hanging from `spine`;
    - `beard` and `hair`, a long beard or long hair, and Treebeard's `leaves`, hanging from `head`;
    - `robe`, the part of a robe or long coat below the knees, hanging from `root`, so it hangs upright as the legs stride under it;
    - `string` and `arrow`, an archer's bowstring and nocked arrow, hanging from the bow hand, for an archer built at the draw;
    - `stone`, `bird` and `boulder`, which a hand throws or lets fly, hanging from that hand.
  - A rider and its mount are one model on one armature, and the rider's `hips` hang from the mount's body. The mount's bones are named `mount_…`: `mount_body` (hanging from `root`); `mount_neck` and `mount_head` on it, and `mount_tail`; and for each leg, `fore` and `hind` on its left (`_l`) and right (`_r`), an upper leg from the body, a lower leg and a foot, such as `mount_fore_upper_l`, `mount_fore_lower_l` and `mount_fore_foot_l`. The horse has these 16, and Sharku's warg adds `mount_jaw`.
  - At most 24 bones on foot, 32 for a Large unit and 40 for a mounted one.
- **Clips:** a rigged model's `.glb` holds exactly these animations, by name, at 30 frames a second, one frame per tick, each starting at frame 0:

| Clip | When it plays (section 5) | How | Length *(placeholder)* | What it shows |
|---|---|---|---|---|
| `idle` | when nothing else applies | loops | 1.5 to 3 s | breathing and a small shift of weight, weapon ready |
| `move` | stepping or dashing | loops, one cycle per hex step | 0.4 to 1 s | a run, two footfalls a cycle, in the air with the legs apart a quarter of the way through, the stride a dash holds |
| `attack` | from each basic attack | once | 0.4 to 0.9 s | the blow lands, or the shot leaves, 0.1 s (3 ticks) in, then it recovers |
| `cast` | from each cast | once | 0.3 to 0.8 s | its ability, at its height 0.1 to 0.2 s in |
| `stun` | while stunned | loops | 0.5 to 1.5 s | dazed: swaying, weapon lowered |
| `death` | from its death | once | 0.3 to 0.5 s | falls, ending low and still inside its hex |
| `victory` | the winners, after the end | once, then holds | 0.5 to 1 s | weapon raised |

- Each clip fits the unit: the attack swings, thrusts, shoots or throws its own weapon, and the cast fits its ability (`design.md` section 5). A looping clip ends where it starts.
- A clip turns bones. It moves the hips, or a rider's `mount_body`, and the bones of a model's own that it places: `robe`, `string`, `arrow`, `stone`, `bird` and `boulder`. It has no track for a bone that stays at rest all through it, and none moves `root`, since the viewer places the model.
- The sim emits an attack when it lands and has no wind-up, so the blow comes early in `attack`, where the lunge (section 5) is at its height.
- `attack` and `cast` start at full weight, without a fade (section 5), so their first frame is seen: an attack's is its wind-up, the weapon drawn back.
- **Limits** *(placeholders)*: a rigged unit's `.glb` stays under 200,000 bytes, or 300,000 for a Rider or a Large unit. A rigged gear model may have 12.5% more, as its triangle budget does (Star levels below): 225,000 bytes, or 337,500. The model should stay inside its hex (Size above) and above the ground in every frame, and end its `death` low. Between frames, as the viewer shows them (section 5), it should stay inside its hex too, and no more than 0.01 under the ground, since a foot rolling on the ground dips a few millimetres there, which the board hides. `finish()` warns when one doesn't.
- **Build:** the kit builds the skeleton from joints a script gives, binds each part to a bone as it is made, and builds the clips from a shared library, from which a script picks a style for each clip or adds its own. `finish()` checks the bones, the binding and the clips, and the export keeps builds reproducible and writes the model's `reach` into its armature's extras (Star levels below). A model without a rig builds exactly as before. `art/clash.py` checks a rigged model for what its hands carry passing through its head or chest.

### Star levels

A unit's star level shows four ways at once, chosen from a study of Frodo, Aragorn and Éomer on the board (`packages/client/art/star-study/`, with the comparison in its `results/`). Each is for units with a model; a unit drawn as a pawn shows its stars in its label only.

- **Label:** the name plate shows the star badge, and in fights the health bar is framed bronze, silver or gold for the star level (section 4, overlay). This is where the board shows star level at a glance; there is no stand under the model.
- **Model:** a 2★ unit uses its gear model and a 3★ unit its book model, falling back to the level below when one doesn't exist yet. A gear or book model with a rig and all seven clips plays them as a 1★ model does; today the gear models are rigged and the book models static.
  - **Gear** (`<id>-2.glb`): the 1★ model with one piece added that reads at game size, such as shoulder plates, a helm or a mantle. Aragorn's is steel shoulder plates. It is the rigged 1★ model with the piece on, each part of the piece bound to the bone it moves with. It keeps the 1★ model's rig, so it has the same bones and clips and moves as the 1★ model does (`art/README.md`, Gear models).
  - **Book moment** (`<id>-3.glb`): the unit as itself at its height in the books, drawn from the books and not the films, and still recognisably the same unit: Frodo in the mithril coat, Aragorn as King Elessar with the winged crown and Arwen's standard, Éomer as Éomer King with the royal banner. It need not keep the 2★ piece.
  - **Budgets** *(placeholder)*: a gear model has 12.5% more triangles than its unit's budget (900, 1,350 for a mounted unit, 2,250 for a Large one), and a book model 25% more (1,000, 1,500 and 2,500). Both keep every other rule in this section, the hex included.
- **Size:** 2★ and 3★ models are drawn 10% bigger *(placeholder)*, but never past the hex: the scale is the smaller of 1.1 and 0.94 divided by the model's reach from its centre, and never below 1. A model that plays its clips takes its reach from its armature's glTF extras: `reach`, the furthest any frame of any clip takes it from its centre, on frames or between them, which the rig kit writes (`art/rig.py`), so its clips stay in the hex. A static model's reach is measured as it stands. Large models start from 1, not the pawns' 1.35.
  - So a rigged gear model grows only as far as its clips leave room. Most clips come near the hex's edge, so 28 of the 36 gear models hardly grow: by about 2% at most, and the Riders and Large units by under 1%. The other 8 have clips that reach less, and grow the full 10%: Bilbo's, Frodo's, Gollum's, Pippin's and Sam's, and Elrond's, Galadriel's and Gandalf's (`art/README.md`, Gear models).
  - A Rider's book model, which is static, grows 4 to 10%, since its horse already reaches 0.85 to 0.91 as it stands.
- **No base:** a model stands straight on its tile, as a pawn does. The star study's stand with a coloured rim and pips was dropped on 4 November 2026 for the label's framed health bar, which reads better from the camera.
- **Trim:** buckles, clasps, sword fittings and similar parts use a material named `trim`, which the viewer colours iron at 1★, silver at 2★ and muted gold at 3★, whatever its colour in the model.
- **Colours** *(placeholder)*: iron `#6b6f74`; silver `#c9ced4`; gold `#c4a04a`, for the trim. Gold stays muted, so the livery is still the only saturated part.
- **Label height:** the label's bottom edge rises with the model: 1.8 above the ground, times the model's scale, or 0.3 above a Large model's top if that is higher. It sits higher still if it must, to clear by 0.15 *(placeholder)* the highest point the model reaches as it stands or in its `attack` and `cast` clips, times its scale; for a static model, that is its top.
  - The height is worked out once, as the model loads, with each clip posed on every frame and halfway to the next. The label holds still at it through planning and fights.
  - A winner's rises as `victory` fades in, to clear the highest point of its victory pose the same way, if it doesn't already.
  - A pawn's label sits 1.8 above the ground, times the pawn's scale.
- **No glow:** a star level never shows as an aura or light, which would read as an ability's effect.

---

## 5. Playback

- The viewer creates the fight with `createCombat` and calls `step()` once per tick, at 30 ticks per second times the speed.
- **Display time** is the last tick processed plus the fraction of the next one, so motion is smooth between ticks.
- **What is drawn at a display time:**
  - **Positions:** a `move` is interpolated from `from` to `to` between its tick and `arriveTick`. A `dash` takes 4 ticks.
  - **Projectiles:** a ranged `attack` fires from the attacker's position at that moment. Its projectile leaves 3 ticks later, as the shooter's `attack` clip looses the shot (section 4), or a tick before it lands if that is sooner, and flies to the target, landing on `hitTick`.
    - It flies from the shooter's chest to the target's, so it strikes a Hobbit and an Ent alike. A model's chest is 0.85 of the height of its `head` bone as it stands, which sits at the neck. A model without one, such as a static one, takes its unit's 1★ model's, since a gear or book model keeps its build, or else 0.69 of its height. Either is times the model's scale, above the ground. A pawn's is 0.9, scaled with the pawn.
  - **Melee attacks:** a short lunge towards the target.
  - **Numbers:** `damage` and `heal` rise from just above the target's label and fade over 24 ticks.
    - Physical damage is orange, magic blue, true white; heals are green.
    - Crits are bigger. Absorbed damage is shown separately.
  - **Casts:** a ring on the ground and the ability's name above the caster's label, in a gold pill.
- Health, shields, mana and statuses come from `combat.state`, which is the state after the last processed tick.
- At the end, a banner shows the result and the final tick, in gold for a win and grey for a draw.

### Animation

Which clip (section 4, Rigs and clips) each unit's model plays, and how far into it, is worked out in animation.ts from the fight's events. It follows display time, so pausing, single steps and the speed control move animation as they move everything else, and the frame rate changes nothing. The sim needs no changes: the events already say all of it.

- **What a unit plays** at display time `t`, in ticks: the first of these that applies.
  1. **Dead:** `death`, from its `death` event.
  2. **Won:** `victory`, from the `end` event, for the living units of the winning team. Nobody plays it after a draw. It lasts at most a second (section 4), so it has played out by the time the viewer stops, a second after the end, and before the play page shows the results, after the second the finished fight stays on screen (`server-spec.md` section 5.3).
  3. **Stunned:** `stun`, from the tick a stun starts until its `expiresTick`, from the `status` events. A stun that starts while another lasts, or on the tick it ends, carries it on without restarting. An `attack` or `cast` on a tick a stun starts on plays out first, and `stun` shows once its clip ends: a stunned unit can't act, so the action came before the stun on that tick.
  4. **Acting or moving,** whichever started last, or the action if they started on the same tick:
     - an action: `attack` from the unit's latest `attack` event, or `cast` from its latest `cast` event, until the clip ends. More attacks on the same tick, such as the Bow of the Galadhrim's, are one action: the clip plays once, from that tick, with a projectile for each ranged attack. A cast on the same tick as an attack would win, though the sim never has one, since a unit acts once a tick (`sim-spec.md` section 6.4).
     - a step: `move` from the `move` event's tick to its `arriveTick`, one whole cycle per step, so a step that follows a step runs on without a seam. A dash plays `move` held at a quarter of its length, a stride in mid-air, for the dash's 4 ticks.
  5. **Otherwise:** `idle`.
- **How far into the clip,** in seconds, with a tick 1/30 s:
  - `death`, `victory`, `attack` and `cast`: the time since the event, held on the last frame once the clip ends.
  - `stun`: the time since the stun started, wrapped at the clip's length.
  - `move`: the step's progress from its tick to `arriveTick` times the clip's length.
  - `idle`: `t` / 30 + 0.37 × the unit's id in the fight (its index in `combat.state.units`), wrapped at the clip's length, so units don't breathe together and a unit going back to idle picks up where it would have been.
  - Between two of a clip's frames, Three.js turns each bone the short way round from its turn on one to its turn on the next, and moves a bone the clip moves in a straight line. A bone that turns far in one frame, as an arm does in a blow, swings what hangs from it round in an arc, so the art checks these poses too (section 4, Limits).
- **Fades:** when the clip changes, the new one fades in over 3 ticks, its weight rising evenly from 0 to 1, while the one before carries on as it would have (a loop looping, a one-shot clip held on its last frame). Before the fight starts, every unit counts as playing `idle`.
  - **Cuts:** `attack` and `cast` start at full weight on their event's tick, and so does a dash's held `move`, so their first frames are seen: an attack's wind-up, the leap. An action that comes back after a stun or step hid it fades in as usual.
  - An action that restarts its own clip cuts back to the start without a fade, and a step that follows a step runs on without one.
- **Death:** a unit with a `death` clip plays it, and halfway through the clip it starts to sink and fade out, over half a second, so it is fading by the time another unit can step into its hex. One without starts sinking at once, as before. A `death` clip lasts at most half a second (section 4), so a unit that dies on the last tick has finished its clip and its fade within the second of afterglow the viewer runs after the fight.
- **Melee attacks** still lunge, and the blow lands at the lunge's height.
- **Facing,** for models and pawns alike, as an angle about the vertical like `facing()` in playback.ts gives:
  - while a step or dash moves the unit, from its tick until it arrives, the way it goes, from its `from` hex to its `to` hex;
  - otherwise towards its target in `combat.state`, from the unit's `position()` to the target's, without the lunge;
  - over the first 3 ticks of a step or dash it turns evenly, the shorter way round, from the way it faced: the way the step before went if one ended on that tick, or else towards its target. Over the first 3 ticks after one ends it turns the same way from the way it went to its target;
  - with nowhere to face (no target, or the target in the same place), and once dead, it keeps the way it last faced.
- **Planning:** on the planning board and bench, units play `idle` in real time, staggered by 0.37 s × their id.
- **Reduced motion:** when the system asks for it, `idle` and `stun` hold their first frame. `move`, `attack`, `cast`, `death` and `victory` still play, since they show what happens.
- **Static models,** such as today's 3★ ones, **and pawns** have no clips, and are drawn as before: turning, lunging, fading and sinking.
- **API,** which the tests use:

```ts
export const CLIPS = ['idle', 'move', 'attack', 'cast', 'stun', 'death', 'victory'] as const;
export type ClipName = (typeof CLIPS)[number];
/** Each clip's length in seconds, from the unit's model. */
export type ClipLengths = Readonly<Record<ClipName, number>>;
/** How long a fade between two clips lasts, in ticks. */
export const FADE_TICKS = 3;

export interface Pose {
  readonly clip: ClipName;
  /** Seconds into `clip`. */
  readonly time: number;
  /** The clip fading out, and how far into it; null when not fading. */
  readonly from: { readonly clip: ClipName; readonly time: number } | null;
  /** The weight of `clip`: from 0 to 1 over a fade, 1 otherwise. `from` has the rest. */
  readonly weight: number;
}

export interface PoseOptions {
  /** Display time in ticks: the playback's own by default. Any time up to it works. */
  readonly time?: number;
  /** Reduced motion: `idle` and `stun` hold their first frame. */
  readonly still?: boolean;
}

/** What a unit plays at a display time in a fight. */
export function fightPose(playback: Playback, unit: number, lengths: ClipLengths, options?: PoseOptions): Pose;

/** What a unit plays on the planning board or bench, `seconds` of real time in, staggered by `key`, the unit's id. */
export function planningPose(lengths: ClipLengths, seconds: number, key: number, still?: boolean): Pose;

/**
 * The way a living unit faces at the playback's display time (Facing above), given its target in
 * `combat.state`: an angle about the vertical, as `facing()` gives. null when it has nowhere to face
 * or is dead, and the scene keeps the way it faced.
 */
export function fightFacing(playback: Playback, unit: number, target: number | null): number | null;

/**
 * How long after its death a unit starts to sink and fade out, in seconds: half its `death` clip,
 * or 0 for a model or pawn without clips.
 */
export function sinkDelay(lengths: ClipLengths | null): number;
```

- `Playback.deathProgress(unit, time?, delaySeconds = 0)` is 0 until `delaySeconds` after the unit's death, then rises to 1 over the 15 ticks of the sink and fade. The scene passes the unit's `sinkDelay`.

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
- **Frame rate:** both pages run a frame whenever the browser offers one, as many a second as the screen shows. A 30 fps toggle (an icon button in the play page's top bar, next to Log in the viewer) caps them at 30 a second (frame-cap.ts), to spare the GPU and the battery; the browser remembers the choice, for both pages. The cap skips whole frames and the next frame run counts their time, so display time still follows the clock: fights play at the same speed and timers run the same either way. Frames come on a steady grid, a little early allowed, so a 60 Hz screen gets every other frame, and after a long gap the grid starts afresh rather than catching up. It is off by default.
- **Event log:** one line per event except moves, with unit names, newest last, coloured by the kind of event, with casts, deaths and the end marked.

---

## 7. Tests

The parts without Three.js are tested with Vitest:
- the hex layout;
- random boards, which are valid and the same for the same seed;
- playback timing, interpolated positions and projectiles, and that frames between ticks keep the same lists of effects and events, so they allocate nothing;
- the frame rate cap: every frame while off; 30 a second while on at 60, 120 and 144 Hz, on a steady grid, with frames a little early or late; a frame up to 2 ms early runs; every frame of a slower screen; no burst after a long gap; switching on and off from the next frame;
- when the scene draws a frame (a fight as its display time moves, planning while a unit idles and motion isn't reduced, otherwise only after a change), and that pawns swap for their models only once a shader is ready, at most 3 a frame, and again as more load;
- which clip each unit plays at a display time and how far into it, fades and cuts, an action before a stun on the same tick, reduced motion, planning's `idle`, dying units' fade from halfway through their clip (`sinkDelay`), and which way units face as they step, dash and turn back (section 5, Animation);
- the 1★ model files: every unit has one, a single mesh with a `team` material on it, and every one is rigged: one skinned mesh with the 16 bones within the budget, `root` at the origin with every bone below it, exactly the seven clips at their lengths keyed on whole frames, loops that end where they start, one bone per vertex, under its size (section 4, Rigs and clips), and its `reach` in its armature's extras (section 4, Star levels);
- the arena file: within its budget, with its baked occlusion and no normals; the court round the board and bench clear, the band round it low, and nothing under a hex reaching its top (section 3, Arena);
- the camera: every view starts within the limits, the fog never reaches a unit on the board or the bench, and the whole board and bench are in focus from each view's starting point (look.ts);
- the 2★ gear model files: every unit's is rigged, with the same checks as a 1★ model's rig but under a gear model's size, and has its 1★ model's bones, each hanging from the same one, and clips as long (section 4, Star levels);
- the event log text;
- the damage meter's rows: totals and parts per tab, summons in their owner's row, the Eye's Nazgûl in its own, order and ties;
- item and Ring of Power colours and descriptions, Gift descriptions, and the One Ring's;
- the icons: every trait, item component, Gift tier, round type and label status has one, each trait and component its own;
- trait text and the trait tracker's rows;
- tooltip content, the HUD's values, the players list's rows, a round's results and the timer, and what the HUD, the players list and the trait tracker show while the person's fight plays;
- the model a star level uses, falling back to the level below, its scale within the hex, and its label height: 1.8 above the ground, clear of the attack and cast clips, and a winner's rise to clear its victory pose (stars.ts);
- what an ability does in words (abilities.ts), how a shop card marks a unit the person has (shop.ts), the stage tracker's rounds (hud.ts), and that a round's result reaches the stage tracker only once its results have been shown (flow.ts).

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
