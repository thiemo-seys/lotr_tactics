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
| Roster | Sandbox: good and evil characters can share a board; 36 units in the first set |
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
| Special items | Rings of Power | The Three, the Seven and the Nine, from the Council of Elrond, with the One Ring above them. |

---

## 4. Traits

Each unit has one origin and one or two classes. All numbers are *(placeholder)*; where a cell lists several values, they apply at each breakpoint in turn.

### Origins

| Origin | Units | Breakpoints | Effect |
|---|---|---|---|
| Hobbit | 6 | 2/4/6 | Enemies target other units first while a non-Hobbit ally is next to the Hobbit. Hobbits gain +150 / +350 / +600 Health |
| Elf | 4 | 2/4 | Elves gain +20% / +45% Attack Speed, plus 20% Dodge at 4 |
| Dwarf | 3 | 2/3 | Dwarves gain +30 / +60 Armor and deal +20% / +40% damage to Large units |
| Gondor | 4 | 2/4 | All front-row allies gain +20 / +45 Armor and Magic Resist |
| Rohan | 5 | 2/4 | Each time a Rohan unit falls, the other Rohan units gain +10% / +25% Attack Speed (stacks) |
| Istari | 3 | 2/3 | Istari gain +3 / +6 mana once per second |
| Orc | 6 | 2/4/6 | 1 / 2 / 4 Orc grunts spawn at combat start; grunts get stronger each stage |
| Nazgûl | 3 | 2/3 | Enemies within 2 hexes of a Nazgûl attack 15% / 30% slower |
| Ent (unique) | 1 | 1 | Treebeard is Large and regenerates 2% max Health per second |
| Dark Lord (unique) | 1 | 1 | Sauron is Large; your Orcs and Nazgûl deal +15% damage |

### Classes

Every class has members from both sides.

| Class | Units | Breakpoints | Effect |
|---|---|---|---|
| Guardian | 8 | 2/4/6 | Guardians start combat with a 200 / 400 / 700 shield for 8 seconds |
| Archer | 6 | 2/4/6 | Archers gain +3% / +6% / +10% Attack Speed per attack, up to 15 stacks |
| Rider | 6 | 2/4/6 | Riders charge their target at combat start, dealing 100 / 220 / 400 bonus physical damage on arrival |
| Burglar | 6 | 2/4/6 | Burglars leap to the enemy backline at combat start, target the farthest enemy, and gain +20% / +45% / +75% Crit Damage |
| Captain | 6 | 2/4/6 | Allies next to a Captain deal +10% / +20% / +35% damage |
| Sorcerer | 6 | 2/4/6 | Sorcerers gain +20 / +45 / +80 Ability Power |

### Large

A unit tag for Treebeard, Sauron and the big PvE enemies (Cave Troll, Watcher in the Water, Mûmak, Balrog). Large units take up one hex like every other unit. Dwarves deal bonus damage to Large units.

---

## 5. Units

36 units across 5 cost tiers. Ability damage is physical unless marked as magic. D, S and H in the ability text are explained under *Ability values* below. All ability numbers are *(placeholder)*.

### 1-cost

| Unit | Origin | Class | Ability |
|---|---|---|---|
| Sam | Hobbit | Guardian | **Loyal:** shields himself and the nearest ally for 0.6 S each |
| Merry | Hobbit | Burglar | **Barrow-blade:** stabs the target for 1.0 D and lowers its Armor and Magic Resist by 30% for 4s |
| Pippin | Hobbit | Archer | **Stone toss:** a stone that bounces between 3 enemies up to 3 hexes apart, 0.7 D each |
| Beregond | Gondor | Guardian | **Shield bash:** damages the target for 1.0 D and stuns it for 1s |
| Háma | Rohan | Guardian | **Doorward:** gains +30 Armor for 5s and a 0.8 S shield |
| Grishnákh | Orc | Burglar | **Sneak:** dashes to the lowest-health enemy and stabs it for 1.2 D |
| Sharku | Orc | Rider | **Warg bite:** damages the target for 1.0 D; it attacks 30% slower for 3s |
| Gorbag | Orc | Archer | **Volley:** 3 quick arrows at the target, 0.4 D each |

### 2-cost

| Unit | Origin | Class | Ability |
|---|---|---|---|
| Frodo | Hobbit | Burglar | **Slip away:** untargetable for 2s, then strikes the target with Sting for 1.3 D |
| Haldir | Elf | Archer | **Lórien volley:** an arrow at each of the 3 nearest enemies, 0.7 D each |
| Faramir | Gondor | Archer | **Ranger's shot:** a heavy shot at the farthest enemy for 1.5 D |
| Gamling | Rohan | Rider | **Horn of the Hornburg:** allies within 2 hexes gain +30% Attack Speed for 4s |
| Balin | Dwarf | Captain | **Lord of Moria:** shields himself and adjacent allies for 0.6 S each |
| Lurtz | Orc | Archer | **Piercing arrow:** 1.0 D to every enemy in a line through the target, up to the board edge |
| Radagast | Istari | Sorcerer | **Flock:** 0.8 D magic damage to the target and enemies next to it; enemies hit attack 25% slower for 3s |
| Ringwraith | Nazgûl | Burglar | **Black Breath:** 1.0 D magic damage to the target and a 1.5s stun |

### 3-cost

| Unit | Origin | Class | Ability |
|---|---|---|---|
| Bilbo | Hobbit | Burglar | **Riddles in the Dark:** stuns the target for 2s and stabs it for 1.0 D |
| Gollum | Hobbit | Burglar | **My precious:** 3 bites at the target, 0.4 D each, healing for 50% of the damage dealt |
| Gimli | Dwarf | Guardian | **And my axe!:** 0.9 D to all adjacent enemies, and gains a 0.6 S shield |
| Boromir | Gondor | Captain | **Horn of Gondor:** allies within 2 hexes gain +25 Armor and Magic Resist for 5s; he gains a 1.0 S shield |
| Éomer | Rohan | Rider | **Spear thrust:** 1.0 D to every enemy in a 4-hex line through the target |
| Éowyn | Rohan | Guardian | **Shieldmaiden:** gains a 0.6 S shield, then strikes the target for 1.2 D; double damage against Nazgûl |
| Uglúk | Orc | Guardian | **Bred for war:** gains a 1.0 S shield and can't be stunned for 4s |
| Khamûl | Nazgûl | Rider | **Shadow ride:** charges through a 3-hex line for 0.9 D magic damage; enemies hit attack 25% slower for 3s |

### 4-cost

| Unit | Origin | Class | Ability |
|---|---|---|---|
| Legolas | Elf | Archer | **Flurry:** 5 arrows at the target, 0.3 D each; each can crit |
| Elrond | Elf | Sorcerer | **Healer of Rivendell:** heals the 2 allies with the lowest Health % for 1.0 H and gives them +30 Magic Resist for 4s |
| Aragorn | Gondor | Captain | **Andúril:** strikes the target for 1.3 D; allies within 2 hexes gain +25% Attack Damage for 4s |
| Théoden | Rohan | Rider, Captain | **Forth Eorlingas!:** rides through a 3-hex line; 1.0 D and a 1s stun to enemies hit |
| Dáin | Dwarf | Guardian | **Iron Hills:** slams the ground; 0.9 D and a 1.5s stun to adjacent enemies |
| Saruman | Istari | Sorcerer | **Fire of Orthanc:** 1.2 D magic explosion on the farthest enemy and its neighbours |
| Gothmog | Orc | Captain | **Unleash the Orcs:** summons 2 Orc grunts; Orcs within 2 hexes gain +25% Attack Damage for 5s |

### 5-cost

| Unit | Origin | Class | Ability |
|---|---|---|---|
| Gandalf | Istari | Sorcerer | **You shall not pass:** 1.0 D magic damage to enemies within 2 hexes of the target, and a 2s stun |
| Galadriel | Elf | Sorcerer | **Light of the Eldar:** shields all allies for 0.5 S; 0.8 D magic damage to enemies within 3 hexes |
| Witch-king | Nazgûl | Rider, Sorcerer | **Morgul mace:** leaps next to the enemy with the most health; 1.0 D magic damage to adjacent enemies, and they attack 30% slower for 3s. **Passive:** takes 50% less damage from Gondor and Rohan units, except Éowyn |
| Treebeard | Ent | Guardian | **Boulder:** throws a boulder at the largest group of enemies; 1.0 D and a 1.5s stun to a hex and its neighbours |
| Sauron | Dark Lord | Captain | **Sweep:** mace swing in a 6-hex cone; 1.2 D and a 1s stun to enemies hit |

### Ability values

Ability numbers are multiples of three base values *(placeholder)*:

| Token | Meaning | Base |
|---|---|---|
| D | Damage | 200 |
| S | Shield | 250 |
| H | Heal | 200 |

- Value = multiple × base × cost factor × star factor × Ability Power / 100.
  - Cost factor: 1 + 0.25 per cost above 1 (1.0 / 1.25 / 1.5 / 1.75 / 2.0).
  - Star factor: 1 / 1.5 / 2.25 at 1★ / 2★ / 3★.
- Example at 100 Ability Power: Beregond's 1.0 D at 1★ is 200 damage before resists; Gandalf's 1.0 D at 3★ is 200 × 2.0 × 2.25 = 900.
- Durations, stun lengths and buff sizes don't scale with star level.
- Ability shields last 4 seconds unless stated otherwise.

### Stat templates

Each unit uses the template of its first class. Values are for a 1★, 1-cost unit *(placeholder)*.

| Role | Classes | Health | Attack Damage | Attack Speed | Range | Armor / Magic Resist | Mana (start/max) |
|---|---|---|---|---|---|---|---|
| Tank | Guardian | 650 | 45 | 0.60 | 1 | 40 | 30/90 |
| Fighter | Rider, Captain | 600 | 55 | 0.70 | 1 | 30 | 0/60 |
| Skirmisher | Burglar | 500 | 55 | 0.80 | 1 | 20 | 0/50 |
| Archer | Archer | 450 | 50 | 0.75 | 4 | 15 | 0/60 |
| Caster | Sorcerer | 450 | 35 | 0.65 | 4 | 15 | 20/70 |

- Each cost step above 1 adds +15% Health and Attack Damage and +5 Armor and Magic Resist.
- Each unit can be adjusted by up to ±10% for character (e.g. a tankier Gimli, a faster Legolas).
- Star multipliers from section 7 apply on top.

---

## 6. Items

Six components instead of TFT's nine, giving 21 combined items. All numbers are *(placeholder)*.

### Components

| Component | Stat |
|---|---|
| Blade | +15% Attack Damage |
| Bow | +15% Attack Speed |
| Mail | +20 Armor |
| Cloak | +20 Magic Resist |
| Lembas | +150 Health |
| Staff | +15 Ability Power |

### Combined items

A combined item gives the stats of both its components, plus its effect.

| Recipe | Item | Effect |
|---|---|---|
| Blade + Blade | Andúril | Each kill gives +15% Attack Damage for the rest of the fight |
| Blade + Bow | Black Arrow | Deals 30% more damage to enemies with more max Health than the holder |
| Blade + Mail | Orcrist | The first time Health falls below 50%: untargetable for 1s and +40% Attack Speed for the rest of the fight |
| Blade + Cloak | Sting | +25% Crit Chance; the holder's abilities can crit |
| Blade + Lembas | Herugrim | The first time Health falls below 50%: a shield of 30% of max Health for 5s and +30% Attack Damage for the rest of the fight |
| Blade + Staff | Glamdring | Heals for 20% of all damage the holder deals |
| Bow + Bow | Bow of the Galadhrim | Each basic attack also fires at another enemy in range, for 50% damage |
| Bow + Mail | Grond | Each basic attack gives +5% Attack Speed for the rest of the fight, up to 20 times |
| Bow + Cloak | Miruvor | Can't be stunned for the first 15 seconds |
| Bow + Lembas | King's Banner | At combat start, the holder and adjacent allies gain +20% Attack Speed for the rest of the fight |
| Bow + Staff | Palantír | Each basic attack gives 5 more mana |
| Mail + Mail | Oakenshield | A basic attack that hits the holder deals 30% of its damage back to the attacker as magic damage |
| Mail + Cloak | Mithril Shirt | Takes 15% less damage; crits against the holder deal normal damage |
| Mail + Lembas | Dragon-helm | Every second, deals magic damage equal to 2% of the holder's max Health to adjacent enemies |
| Mail + Staff | Star of Elendil | At combat start, the holder and adjacent allies gain a 300 shield for 8 seconds |
| Cloak + Cloak | Elven Cloak | Regenerates 2% of max Health every second |
| Cloak + Lembas | Elven Rope | At combat start, stuns the enemy farthest from the holder for 3s |
| Cloak + Staff | Phial of Galadriel | Enemies within 2 hexes of the holder have 30% less Magic Resist |
| Lembas + Lembas | Ent-draught | +300 Health |
| Lembas + Staff | Athelas | After each cast, heals the ally with the lowest Health % for 200 |
| Staff + Staff | Wizard's Staff | +40 Ability Power |

### Rules

- PvE rounds and the Council of Elrond give components (section 9). A player keeps them until they give them to a unit.
- A unit holds up to 3 items. Giving a component to a unit that already holds a lone component combines the two into the recipe's item, so a unit never holds more than one lone component.
- Items can't be taken off a unit. Selling the unit gives its items back to the player.
- When copies merge, the merged unit gets their items. Any beyond 3 go back to the player.
- Units on the bench keep their items; only units on the board fight with them.
- Summons and PvE monsters carry no items.
- Two copies of an item on one unit both work.
- Item numbers don't scale with Ability Power or star level.
- An eliminated player's items are lost.
- Rings of Power (section 9) are items too, with a few rules of their own.

---

## 7. Combat rules

All numbers are *(placeholder)*.

### Board and timing

- Each side is 7 hexes wide and 4 rows deep, so the arena is 7 × 8. Each player has a bench of 9.
- Each player sees their own side at the bottom; the opponent's side is mirrored.
- The simulation runs at 30 ticks per second.
- A fight lasts 30 seconds, then 15 seconds of overtime in which all damage ramps up. If both sides still have units at the end, both players lose the round.
- A side with no units on the board loses the fight at once. If neither side has units, both players lose the round.

### Stats

| Stat | Meaning | Typical 1★ value |
|---|---|---|
| Health | | 500–1000 |
| Attack Damage | Damage per basic attack | 40–80 |
| Attack Speed | Attacks per second | 0.6–0.9 |
| Range | In hexes; 1 = melee | 1–4 |
| Armor | Reduces physical damage | 20–60 |
| Magic Resist | Reduces magic damage | 20–60 |
| Ability Power | Multiplier on ability damage, shields and heals | 100 for every unit |
| Mana | Starting / maximum | 0/60 to 40/120 |
| Crit Chance | Chance for a basic attack to crit | 25% |
| Crit Damage | Damage multiplier on a crit | 140% |
| Dodge | Chance to avoid a basic attack | 0% |

**Star levels:** a 2★ unit has 1.8× the Health and Attack Damage of a 1★; a 3★ has 1.8× those of a 2★. Ability values grow 1.5× per star level (section 5).

### Damage

- **Physical** damage is reduced by Armor, **magic** damage by Magic Resist, **true** damage is not reduced.
- Damage taken = damage × 100 / (100 + resist). 100 resist halves the damage; each extra point is worth a bit less.
- Basic attacks deal physical damage. Each ability states its damage type; its damage, shield and heal values scale with Ability Power (section 5).

### Healing

- Healing can't raise a unit's Health above its max Health; any excess is lost.

### Critical strikes and dodge

- **Crit:** a basic attack has Crit Chance to deal Crit Damage. Abilities cannot crit unless an item or trait says so.
- **Dodge:** a unit has Dodge chance to avoid a basic attack completely. A dodged attack deals no damage and triggers no on-hit effects. The attacker still gains mana; the defender gains none. Abilities cannot be dodged.
- Both rolls use the fight's seeded random generator, so every fight replays identically.

### Mana and abilities

- A unit gains 10 mana per basic attack.
- When hit, a unit gains mana equal to a share of the damage taken, rounded down and capped per hit.
- Mana is always a whole number.
- At full mana, the unit casts its ability instead of its next basic attack, even if its target is out of range, then mana resets to 0. No mana is gained while casting.
- Untargetable units can't be hit by enemy abilities either.
- Abilities are built from shared building blocks. Most abilities are data combining these; the few that don't fit get custom code.
  - **Shapes:** single target, area, line, cone, bounce
  - **Effects:** damage (including multi-hit), stun, slow, shield, heal, buff, debuff (lower Armor / Magic Resist), untargetable, dash, summon
  - **Passives:** always-on effects such as the Witch-king's damage reduction

### Targeting

- A unit targets the nearest enemy by hex distance. Ties are broken by a fixed order.
- It keeps that target until the target dies or becomes untargetable.
- Active traits and some abilities override the default. With the Burglar trait, Burglars target the farthest enemy. With the Hobbit trait, enemies prefer other targets while a non-Hobbit ally is next to a Hobbit. Without their trait, Burglars and Hobbits follow the default rules.

### Movement

- If its target is out of range, a unit moves one hex at a time along the shortest free path to the nearest hex within range.
- Only one unit can stand on a hex. A unit claims the next hex when it starts moving into it.
- All units move at one hex per 0.5 seconds. The Rider charge is the exception.
- Units act one at a time each tick, in an order set by their starting position and the fight's seeded random generator. This keeps the simulation deterministic, and fair to both sides when their units act on the same tick.

### Attacks

- Attacks fire on a timer set by Attack Speed.
- Melee hits land instantly. Ranged attacks fire a projectile and the damage lands when it arrives; a projectile whose target has died is wasted. A projectile still lands if its attacker has died.
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

With 5–8 units per cost tier (TFT has about 13), a specific unit appears in the shop about twice as often as in TFT, making 3★ units easier and contested units more common. This is accepted for the first version; the fix is a larger roster (see section 13).

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
- Every Council unit carries an item component, except two from 2-4 on, which carry a Ring of Power, and Bilbo when he brings the One Ring.

### Gifts of Lothlórien

Gifts are augments: lasting bonuses each player picks for themselves. All numbers are *(placeholder)*.

- Offered at the start of planning in 2-1 (Silver), 3-2 (Gold) and 4-2 (Mithril). Each player gets their own offer of 3 Gifts of that tier.
- Choose 1 of 3. One reroll per offer replaces all three.
- An offer holds at most one crest. A player never gets a Gift they already have.
- If planning ends before a player picks, they get one of their three at random.
- Gifts last the rest of the game. Planning lasts longer in rounds with an offer.
- **Your units** means the units on your board when a fight starts, not summons. **Front row** and **back row** are the rows they start in.
- A **crest** counts one more unit towards a trait, as long as at least one unit on your board has it.

**Silver (2-1)**

| Gift | Effect |
|---|---|
| Bilbo's Purse | Gain 12 gold |
| Second Breakfast | Your first reroll each round is free |
| Pocketses | Gain 2 random item components |
| The Road Goes Ever On | Gain 2 more XP every round |
| Beorn's Honey | Your units gain +120 Health |
| Swift as the Wind | Your units gain +10% Attack Speed |
| Shield Wall | Your front-row units gain +20 Armor and Magic Resist |
| High Ground | Your back-row units gain +15% Attack Damage |
| Lore of the Wise | Your units gain +15 Ability Power |
| Gandalf's Fireworks | Your units start combat with 15 more mana |

**Gold (3-2)**

| Gift | Effect |
|---|---|
| Smaug's Hoard | Gain 25 gold |
| Treasure of Erebor | Interest can reach 3 gold more |
| Elven-smiths | Gain a random combined item |
| Muster of Rohan | Gain two random 3-cost units |
| Hands of the King | Your units regenerate 1% of max Health every second |
| The Last Alliance | Your units deal 8% more damage |
| Light of Valinor | At combat start, your units gain a 200 shield for 8 seconds |
| Guard of the Citadel | Crest: Guardian |
| Quiver of Lórien | Crest: Archer |
| Horse-lords | Crest: Rider |
| Burglar's Contract | Crest: Burglar |
| Captain's Horn | Crest: Captain |
| Wizard's Hat | Crest: Sorcerer |

**Mithril (4-2)**

| Gift | Effect |
|---|---|
| The Arkenstone | Gain 40 gold |
| Celebrimbor's Forge | Gain 2 random combined items |
| Mirror of Galadriel | Your shop rolls with the odds of one level higher |
| The Fellowship | Your units deal 4% more damage for each different origin among them |
| Horn of Helm Hammerhand | At combat start, all enemies are stunned for 1.5 seconds |
| March of the Ents | Your units gain +300 Health and +30 Armor and Magic Resist |
| Wisdom of the Istari | Your units gain +30 Ability Power and start combat with 20 more mana |
| Return of the King | Gain a random 5-cost unit |
| Shire Folk | Crest: Hobbit |
| Elven Kinship | Crest: Elf |
| Sons of Durin | Crest: Dwarf |
| Men of the West | Crest: Gondor |
| Eorlingas | Crest: Rohan |
| Order of Wizards | Crest: Istari |
| Pits of Isengard | Crest: Orc |
| Ringwraiths' Call | Crest: Nazgûl |

### The One Ring

One per lobby. Its power grows the longer it is worn, but so do its drawbacks. All numbers are *(placeholder)*.

- **Arrival:** from the 3-4 Council of Elrond on, one option is Bilbo carrying the Ring instead of an item component. Lowest-HP players pick first as usual, and nobody is forced to take it: a pick made because time ran out never takes the Ring. If nobody takes it, it comes back at the next Council.
- **Bearer:** the holder gives the Ring to one of their units during planning and can move it to another. It doesn't use an item slot. If the Ring has no bearer when a fight starts, it equips itself on a random unit on the board.
- **Base power:** the bearer is invisible (cannot be targeted) for the first 3 seconds of each fight.
- **Corruption** rises by 1 at the start of each round the Ring has a bearer. Hobbit bearers gain it only every other round. Each point gives the bearer +10% damage, and the drawbacks stack:

  | Corruption | Tier | Damage | Drawback added |
  |---|---|---|---|
  | 1–3 | Gift | +10% to +30% | None |
  | 4–6 | Burden | +40% to +60% | Stretched thin: −5% max Health per point above 3 |
  | 7–8 | Grip | +70% to +80% | "Mine!": allies' heals and shields don't reach the bearer |
  | 9 | Betrayal | +90% | Attacks its nearest ally, and can't cast, for the first 3 seconds of each fight |
  | 10 | Consumed | — | The bearer is lost; the Ring returns to the next Council |

- **Sam:** if Sam is next to the bearer when a fight starts, its drawbacks act as if Corruption were 2 lower. The damage bonus doesn't change.
- **Corruption belongs to the Ring,** not the unit. Moving the Ring or selling the bearer doesn't reset it; selling the bearer leaves the Ring with the player, unworn.
- **The Eye:** in a fight against the holder's board, ghost fights included, the other side gets the Eye's Nazgûl. It is a summon that appears next to the bearer, sees through the invisibility and attacks the bearer first. It has 500 Health and 40 Attack Damage, plus 100 and 10 per point of Corruption.
- **Exits:**
  - *Destroyed:* once Hobbits have carried it through 3 fights, a Hobbit bearer can throw it into Mount Doom during planning. The holder gains 30 gold and a random combined item, and the Ring is gone for the rest of the game, taking the Three and the Nine with it (see Rings of Power).
  - *Stolen:* if an opponent's Gollum survives a fight against the holder, he takes the Ring, Corruption kept. Ghost fights don't count, since the ghost's owner isn't there.
  - *Consumed:* at 10 Corruption the bearer is lost (its items go back to the player), and the Ring returns to the next Council with no Corruption.
  - If the holder is eliminated, the Ring returns to the next Council with its Corruption.

### Rings of Power

An item family with the One Ring at the top. All numbers are *(placeholder)*.

- **Arrival:** from the 2-4 Council of Elrond on, two options at each Council carry a Ring of Power instead of an item component. Each is drawn at random from the rings left, so a ring with more copies left comes up more often.
- **Copies:** each of the Three once, 7 Rings of the Seven and 9 Rings of the Nine. A ring nobody picks at a Council, or that an eliminated player had, can come up again.
- **Wearing:** a Ring of Power is an item. The player gives it to a unit, where it takes one of the 3 item slots and stays like any other item (section 6). It never combines. A unit can wear only one Ring of Power; the One Ring doesn't count, as it takes no slot.
- **Kin:** the Three are 50% stronger on an Elf or an Istari, and the Seven give double on a Dwarf.

| Ring | Family | Effect |
|---|---|---|
| Narya, the Ring of Fire | The Three | The bearer and allies within 2 hexes gain +20% Attack Speed (+30% on an Elf or Istari) |
| Nenya, the Ring of Adamant | The Three | At combat start and every 6 seconds, the bearer and allies within 2 hexes gain a 120 shield for 6 seconds (180 on an Elf or Istari) |
| Vilya, the Ring of Air | The Three | Every 2 seconds, the ally with the lowest Health % heals 80 (120 on an Elf or Istari) |
| Ring of the Seven | The Seven | After each PvP or PvE round, gain 1 gold if the bearer is on your board (2 on a Dwarf) |
| Ring of the Nine | The Nine | The bearer is a Nazgûl as well as its own origin: it counts towards the Nazgûl trait and gets everything Nazgûl get, from the trait's slow to Sauron's bonus and Éowyn's double damage. While a player holds the One Ring, the bearer also deals 5% more damage per point of the One Ring's Corruption |

- **The One and the rest:** when the One Ring is destroyed in Mount Doom, the Three fade and the Nine are undone. Every one of them leaves the game, from units and players alike, and no Council offers them again. The Seven are untouched. Destroying the Ring is a blow to everyone who wears the Three or the Nine, the destroyer included.

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
| `server` | Node; lobbies and authoritative game state over plain WebSockets. |
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

1. `sim`: hex grid, movement, targeting, attacks, mana and abilities, with headless tests (spec: [`sim-spec.md`](sim-spec.md))
2. Three.js viewer that replays a fight from two boards plus a seed (spec: [`viewer-spec.md`](viewer-spec.md))
3. Shop, bench and economy, playable alone against 7 bots (spec: [`game-spec.md`](game-spec.md))
4. Server lobbies, with bots filling empty seats (spec: [`server-spec.md`](server-spec.md))
5. Content: traits, items, and later the parked features

---

## 12. Still to define

1. **PvE enemies:** stats and loot tables (placeholders in [`game-spec.md`](game-spec.md) section 9)

All numbers marked *(placeholder)* will be tuned during balancing.

---

## 13. Parked for later

These are deliberately left out of the base game and will be revisited once it is well defined.

### Larger roster

Grow from 36 units to about 45–50 (9–10 per cost tier) so that specific units appear in the shop about as often as in TFT.

### Bonds

Small bonuses for named pairs on top of traits: Frodo + Sam, Merry + Pippin, Legolas + Gimli, Boromir + Faramir, Théoden + Éowyn. Legolas + Gimli could start as rivals (kill-count contest) and become friends after a few fights together.

---

## 14. Notes

- **IP:** fine as a free fan project. Selling it would require a licence from Middle-earth Enterprises. Keep mechanics independent of names so they could be swapped out if needed.
