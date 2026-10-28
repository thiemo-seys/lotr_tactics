# LOTR Tactics — Design Document

A browser-based, multiplayer auto battler in the style of Teamfight Tactics, featuring characters from The Lord of the Rings.

Status: early design. Numbers marked *(placeholder)* are starting points for tuning, not final values.

---

## 1. Pillars

- **Familiar core loop.** Keep the TFT structure players already know; the LOTR theme lives in the units, traits, items and round flavour.
- **Sandbox Middle-earth.** Any character can fight alongside any other. Origins keep the races distinct; classes cross the good/evil line so mixed comps (Rohan + Nazgûl Riders) happen naturally.
- **Multiplayer-ready, bots-first.** Every system is built so bots and humans are interchangeable. Bots make the game playable alone, fill empty seats and run balance simulations.

---

## 2. Settled decisions

| Topic | Decision |
|---|---|
| Format | TFT-style: 8-player lobby, shared unit pool |
| Board | Hex grid |
| Unit upgrades | Merging: 3 copies of a 1★ make a 2★; 3 copies of a 2★ make a 3★ |
| Story transformations | No (units do not evolve into other characters) |
| Roster | Sandbox: good and evil characters can share a board |
| Platform | Browser |
| Rendering | Three.js |
| Art style | Low-poly 3D models |
| Lobby size | 8 players |

---

## 3. Core loop

Taken from TFT largely unchanged:

- Shop of 5 units each round; reroll for gold.
- Buy XP to level up; level sets how many units can be on the board.
- Interest on saved gold; bonus gold for win and loss streaks.
- Mix of PvE and PvP rounds; losing a PvP round costs player HP.
- Last player standing wins.

### LOTR flavour on top

| System | LOTR name | Notes |
|---|---|---|
| PvE rounds | — | Wargs, Moria goblins, Cave Troll; the Balrog as a late boss. Drop item components. |
| Shared draft carousel | Council of Elrond | Lowest-HP player picks first. |
| Augment picks | Gifts of Lothlórien | Offered at set stages. |

---

## 4. Traits

Each unit has one origin and one or two classes. Breakpoints are *(placeholder)*.

### Origins

| Origin | Effect idea |
|---|---|
| Hobbit | Enemies target other units first while a non-Hobbit ally is adjacent |
| Elf | Attack speed; dodge chance at the top breakpoint |
| Dwarf | Armor; bonus damage against large units (Trolls, Ents) |
| Gondor | Front-row allies gain armor (shield wall) |
| Rohan | When a Rohan ally falls, the others gain attack speed |
| Istari | Mana regeneration (only 3 wizards exist) |
| Orc | Extra Orc grunts spawn at combat start |
| Uruk-hai | Immune to stuns early in combat |
| Nazgûl | Fear aura that slows enemy attacks |

### Classes

Classes deliberately include members from both sides.

| Class | Effect idea | Example members |
|---|---|---|
| Rider | Charge in a line at combat start | Théoden, Éomer, Witch-king, Warg-rider |
| Archer | Range; attack speed that ramps up | Legolas, Haldir, Lurtz |
| Guardian | Shield at combat start | Gimli, Boromir, Shagrat |
| Captain | Buffs adjacent allies | Aragorn, Gothmog |
| Sorcerer | Ability power | Gandalf, Saruman, Witch-king |
| Burglar | Leaps to the enemy backline | Gollum, Grishnákh, Bilbo |

---

## 5. Roster sketch

About 32 units across 5 cost tiers. Trait assignments and abilities are not yet defined (see section 9).

| Cost | Units |
|---|---|
| 1 | Sam, Merry, Pippin, Háma, Grishnákh, Gorbag |
| 2 | Frodo, Faramir, Haldir, Gamling, Lurtz, Shagrat, Gollum |
| 3 | Legolas, Gimli, Boromir, Éomer, Uglúk, Khamûl, Bilbo |
| 4 | Aragorn, Théoden, Éowyn, Elrond, Saruman, Gothmog |
| 5 | Gandalf, Galadriel, Witch-king, Sauron, Treebeard |

---

## 6. Items

Six components instead of TFT's nine, giving 21 combined items.

**Components:** Blade, Bow, Mail, Cloak, Lembas, Staff

**Example combinations:**

| Recipe | Item |
|---|---|
| Blade + Blade | Andúril |
| Blade + Cloak | Sting |
| Mail + Cloak | Mithril Shirt |
| Staff + Cloak | Phial of Galadriel |

The remaining 17 combinations and all item effects are not yet defined.

---

## 7. Technical architecture

### Monorepo (TypeScript)

| Package | Responsibility |
|---|---|
| `sim` | Pure, deterministic game and combat logic. No rendering or networking. |
| `server` | Node; lobbies and authoritative game state (Colyseus or plain WebSockets). |
| `client` | Vite + Three.js renderer; HTML/CSS overlay for shop, bench and gold. |

### Deterministic combat

- The server runs each fight authoritatively and sends only the two boards plus a random seed.
- The client replays the same simulation to animate the fight, so no per-frame network sync is needed.
- Requirements: fixed tick rate, seeded random number generator, stable iteration order.

### Rendering

- Angled camera similar to TFT.
- Hexes drawn as instanced meshes.
- Placeholder chess-piece units until low-poly models exist.

### Bots

Built from day one to:

- fill empty lobby seats,
- make the game playable alone,
- run thousands of headless games to test balance.

---

## 8. Build order

1. `sim`: hex grid, movement, targeting, attacks, mana and abilities, with headless tests
2. Three.js viewer that replays a fight from two boards plus a seed
3. Shop, bench and economy, playable alone against 7 bots
4. Server lobbies, with bots filling empty seats
5. Content: traits, items, and later the parked features

---

## 9. Still to define

1. **Combat rules:** stat list, targeting, movement on hexes, mana and abilities, damage formula
2. **Economy numbers:** gold income, interest cap, streak bonuses, reroll and XP costs, leveling curve, shop odds per level, copies of each unit in the pool
3. **Round structure:** stage layout, when PvE, Council and Gifts rounds happen, player HP lost after a defeat
4. **Unit sheets:** origin, class(es) and ability for each unit
5. **Items:** effects for all 21 combined items

---

## 10. Parked for later

These are deliberately left out of the base game and will be revisited once it is well defined.

### The One Ring

One per lobby. Its power grows the longer it is worn, but so do its drawbacks.

- **Arrival:** at a mid-game Council of Elrond, carried by Bilbo. Lowest-HP player picks first; nobody is forced to take it.
- **Base power:** the bearer is invisible (cannot be targeted) for the first 3 seconds of each combat.
- **Corruption curve** *(placeholder numbers)*: Corruption rises by 1 at the start of each turn the Ring is worn. Each point gives +10% damage. Drawbacks stack.

  | Corruption | Tier | Damage | Drawback added |
  |---|---|---|---|
  | 1–3 | Gift | +10% to +30% | None |
  | 4–6 | Burden | +40% to +60% | Stretched thin: −5% max health per point above 3 |
  | 7–8 | Grip | +70% to +80% | "Mine!": cannot be healed or shielded by allies |
  | 9 | Betrayal | +90% | Attacks its own team for the first 3 seconds of combat |
  | 10 | Consumed | — | Bearer is lost; Ring returns to the next Council |

- **Rules:**
  - Corruption belongs to the Ring, not the unit; swapping bearers does not reset it.
  - Selling the bearer returns the Ring to the bench with its Corruption unchanged.
  - If the Ring is on the bench at combat start, it equips itself on a random unit.
  - Hobbit bearers gain Corruption only every other turn.
- **The Eye:** each opponent who fights the holder gets a Nazgûl that sees through the invisibility and attacks the bearer first. It grows stronger the longer the Ring is held.
- **Exits:**
  - *Destroyed:* once a Hobbit has carried it through 3 combats, it can be thrown into Mount Doom during a shop phase for a large reward.
  - *Stolen:* if an opponent's Gollum is alive at the end of a fight against the holder, he takes the Ring (Corruption kept).
  - *Consumed:* Corruption reaches 10.
- **Optional:** Sam adjacent to the bearer makes drawbacks act as if Corruption were 2 lower.
- **Open questions:** Is Betrayal at 9 too harsh? Should Consumed take the unit or only the Ring? Include Sam?

### Rings of Power

An item family with the One Ring at the top:

- **The Three** (Narya, Nenya, Vilya): support rings (attack-speed aura, shield, healing); stronger on Elves and Istari.
- **The Seven:** economy rings; the bearer generates gold each round.
- **The Nine:** the bearer gains the Nazgûl trait (an emblem).
- **Tie-in:** while the One exists, bearers of the Nine get stronger; when it is destroyed, the Three fade and bearers of the Nine lose the Nazgûl trait.

### Bonds

Small bonuses for named pairs on top of traits: Frodo + Sam, Merry + Pippin, Legolas + Gimli, Boromir + Faramir, Théoden + Éowyn. Legolas + Gimli could start as rivals (kill-count contest) and become friends after a few fights together.

---

## 11. Notes

- **IP:** fine as a free fan project. Selling it would require a licence from Middle-earth Enterprises. Keep mechanics independent of names so they could be swapped out if needed.
