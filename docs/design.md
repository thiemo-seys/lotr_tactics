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
| Game length | About 30 minutes |
| Max level | 9 |

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

About 32 units across 5 cost tiers. Trait assignments and abilities are not yet defined (see section 12).

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

## 7. Combat rules

All numbers are *(placeholder)*.

### Board and timing

- Each side is 7 hexes wide and 4 rows deep, so the arena is 7 × 8. Each player has a bench of 9.
- Each player sees their own side at the bottom; the opponent's side is mirrored.
- The simulation runs at 30 ticks per second.
- A fight lasts 30 seconds, then 15 seconds of overtime in which all damage ramps up. If both sides still have units at the end, both players lose the round.

### Stats

| Stat | Meaning | Typical 1★ value |
|---|---|---|
| Health | | 500–1000 |
| Attack Damage | Damage per basic attack | 40–80 |
| Attack Speed | Attacks per second | 0.6–0.9 |
| Range | In hexes; 1 = melee | 1–4 |
| Armor | Reduces physical damage | 20–60 |
| Magic Resist | Reduces magic damage | 20–60 |
| Ability Power | Multiplier on ability numbers | 100 for every unit |
| Mana | Starting / maximum | 0/60 to 40/120 |
| Crit Chance | Chance for a basic attack to crit | 25% |
| Crit Damage | Damage multiplier on a crit | 140% |
| Dodge | Chance to avoid a basic attack | 0% |

**Star levels:** a 2★ unit has 1.8× the Health and Attack Damage of a 1★; a 3★ has 1.8× those of a 2★. Ability numbers are listed separately for each star level.

### Damage

- **Physical** damage is reduced by Armor, **magic** damage by Magic Resist, **true** damage is not reduced.
- Damage taken = damage × 100 / (100 + resist). 100 resist halves the damage; each extra point is worth a bit less.
- Basic attacks deal physical damage. Each ability states its damage type; its numbers are multiplied by Ability Power / 100.

### Critical strikes and dodge

- **Crit:** a basic attack has Crit Chance to deal Crit Damage. Abilities cannot crit unless an item or trait says so.
- **Dodge:** a unit has Dodge chance to avoid a basic attack completely. A dodged attack deals no damage and triggers no on-hit effects. The attacker still gains mana; the defender gains none. Abilities cannot be dodged.
- Both rolls use the fight's seeded random generator, so every fight replays identically.

### Mana and abilities

- A unit gains 10 mana per basic attack.
- When hit, a unit gains mana equal to a share of the damage taken, capped per hit.
- At full mana, the unit casts its ability instead of its next basic attack, then mana resets to 0. No mana is gained while casting.
- Abilities are built from shared building blocks: damage (single target, area, line), stun, slow, shield, heal, dash, summon and buff. Most abilities are data combining these; the few that don't fit get custom code.

### Targeting

- A unit targets the nearest enemy by hex distance. Ties are broken by a fixed order.
- It keeps that target until the target dies or becomes untargetable.
- Traits and abilities can override the default, e.g. Burglars target the farthest enemy, and the Hobbit rule makes enemies prefer other targets while a non-Hobbit ally is adjacent.

### Movement

- If its target is out of range, a unit moves one hex at a time along the shortest free path to the nearest hex within range.
- Only one unit can stand on a hex. A unit claims the next hex when it starts moving into it.
- All units move at one hex per 0.5 seconds. The Rider charge is the exception.
- Units act in a fixed order each tick, which keeps the simulation deterministic.

### Attacks

- Attacks fire on a timer set by Attack Speed.
- Melee hits land instantly. Ranged attacks fire a projectile and the damage lands when it arrives; a projectile whose target has died is wasted.
- Resolution order for a basic attack: dodge roll → crit roll → resist reduction → damage → mana gain.

---

## 8. Economy

All numbers are *(placeholder)*.

### Gold

- **Base income:** 2 / 2 / 3 gold in rounds 1-2 to 1-4, 4 gold at 2-1, then 5 gold every round.
- **Interest:** +1 gold for every 10 gold held, up to +5 at 50 gold.
- **Streaks** (win or loss):

  | Streak | Bonus gold |
  |---|---|
  | 2–3 | +1 |
  | 4 | +2 |
  | 5 or more | +3 |

- **Winning a PvP round:** +1 gold.
- **Selling a unit:** refunds the full cost of every copy in it.

### Shop

- 5 units per shop. It refreshes for free each round and can be locked to carry over to the next round.
- A reroll costs 2 gold.
- Buying a third copy merges it immediately, even if the bench is full.

### Levels

- Buy 4 XP for 4 gold. From stage 2 on, gain 2 XP every round.
- Start at level 1; reach level 2 at round 1-2 and level 3 at round 2-1 automatically.
- Level is the number of units allowed on the board. Maximum level is 9.

| Level | XP to reach | 1-cost | 2-cost | 3-cost | 4-cost | 5-cost |
|---|---|---|---|---|---|---|
| 1–2 | — | 100% | | | | |
| 3 | — | 75% | 25% | | | |
| 4 | 6 | 55% | 30% | 15% | | |
| 5 | 10 | 45% | 33% | 20% | 2% | |
| 6 | 20 | 30% | 40% | 25% | 5% | |
| 7 | 36 | 19% | 35% | 35% | 10% | 1% |
| 8 | 48 | 18% | 25% | 32% | 22% | 3% |
| 9 | 76 | 10% | 20% | 25% | 35% | 10% |

The cost columns are the odds that a shop slot shows a unit of that cost.

### Unit pool

Copies of each unit in the shared pool:

| Cost | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Copies | 22 | 20 | 17 | 10 | 9 |

A 3★ needs 9 copies, so a 3★ 5-cost takes every copy in the game.

With 6–7 units per cost tier (TFT has about 13), a specific unit appears in the shop about twice as often as in TFT, making 3★ units easier and contested units more common. This is accepted for the first version; the fix is a larger roster (see section 13).

---

## 9. Round structure

### Stages

**Stage 1:**

- 1-1: Council of Elrond
- 1-2 to 1-4: PvE

**Stage 2 onwards** (7 rounds per stage):

| Round | Type |
|---|---|
| x-1 | PvP |
| x-2 | PvP |
| x-3 | PvP |
| x-4 | Council of Elrond |
| x-5 | PvP |
| x-6 | PvP |
| x-7 | PvE |

### Council of Elrond

- At 1-1 everyone picks at once.
- Later Councils: players pick in pairs, lowest HP first.
- Every Council unit carries an item component.

### Gifts of Lothlórien

- Offered at 2-1, 3-2 and 4-2.
- Choose 1 of 3, with one reroll per pick.

### PvE rounds

| Round | Enemy |
|---|---|
| Stage 1 | Moria goblins |
| 2-7 | Wargs |
| 3-7 | Cave Troll |
| 4-7 | Watcher in the Water |
| 5-7 | Mûmak |
| 6-7 onwards | The Balrog, stronger each time |

PvE rounds drop item components and gold.

### Player HP and damage

- Every player starts with 100 HP. At 0 HP a player is eliminated; the last player standing wins.
- Damage for losing a fight = stage damage + the winner's surviving units.

  | Stage | 2 | 3 | 4 | 5 | 6 | 7+ |
  |---|---|---|---|---|---|---|
  | Stage damage | 2 | 5 | 8 | 10 | 12 | 17 |

  Each surviving enemy unit adds 1 damage at 1★, 2 at 2★ and 3 at 3★.
- On a timeout, both players take damage as if they had lost.

### Matchmaking

- A player doesn't face anyone from their last 3 fights if another opponent is available.
- With an odd number of players alive, one player fights a ghost copy of another player's board. The ghost's owner takes no damage from that fight.

### Timers

- Planning phase: 30 seconds.
- Fight: 30 seconds plus 15 seconds of overtime.
- Target game length: about 30 minutes; most games end around stage 6.

---

## 10. Technical architecture

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

## 11. Build order

1. `sim`: hex grid, movement, targeting, attacks, mana and abilities, with headless tests
2. Three.js viewer that replays a fight from two boards plus a seed
3. Shop, bench and economy, playable alone against 7 bots
4. Server lobbies, with bots filling empty seats
5. Content: traits, items, and later the parked features

---

## 12. Still to define

1. **Unit sheets:** origin, class(es), stats and ability for each unit
2. **Trait numbers:** breakpoints and effect values
3. **Items:** effects for all 21 combined items
4. **Gifts of Lothlórien:** the list of augments
5. **PvE enemies:** stats and loot tables

---

## 13. Parked for later

### Larger roster

Grow from about 32 units to about 45–50 (9–10 per cost tier) so that specific units appear in the shop about as often as in TFT.

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

## 14. Notes

- **IP:** fine as a free fan project. Selling it would require a licence from Middle-earth Enterprises. Keep mechanics independent of names so they could be swapped out if needed.
