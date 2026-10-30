# Game Spec

Implementation spec for the game around the fights: the shop, the economy, the rounds and the bots. It turns `design.md` sections 6, 8 and 9 into exact behaviour. This is step 3 of the build order (`design.md` section 11): a whole game, playable alone against 7 bots.

- `design.md` is the source of truth for game rules and content. This spec adds the implementation detail and the defaults needed to build it.
- Every number here is a *placeholder* to be tuned during balancing. Keep numbers in data files, not in logic.

---

## 1. Scope

**In scope**

- A whole game for 2 to 8 players, from round 1-1 to the last player standing.
- The shared unit pool, the shop, the bench, board placement, merging and selling.
- Items: components from the Council and PvE rounds, given to units, where two combine into an item (section 7.7).
- Gifts of Lothlórien: offers, rerolls, picks and every Gift's effect outside the fight (section 9.10). The sim runs the ones that act in the fight (`sim-spec.md` section 12.5).
- The One Ring: its arrival, Corruption, bearers and exits (section 9.11). The sim runs it in fights (`sim-spec.md` section 12.6).
- Rings of Power: their copies, arrival at Councils, the Seven's gold, and their fate with the One Ring (section 9.12). The sim runs the Three and the Nine in fights (`sim-spec.md` section 12.7).
- Gold, interest, streaks, XP and levels.
- The round schedule, the Council of Elrond, PvE rounds, matchmaking, ghost fights, player damage, elimination and placement.
- Placeholder PvE monsters and loot (`design.md` section 12 leaves them open).
- Bots that play a whole game, and a headless runner for balance runs.
- A client screen to play a game against 7 bots (section 12).

**Out of scope (later)**

- **Server, lobbies and networking** (build order step 4, [`server-spec.md`](server-spec.md)). The game layer is turn-based and knows nothing about time; the client or server that drives it runs the timers.
- The other parked features (`design.md` section 13).

---

## 2. Defaults set by this spec

These are not in `design.md` yet. They were chosen to remove ambiguity and can be changed.

| Topic | Default |
|---|---|
| Players | 2 to 8 seats, numbered from 0. Bots and people are interchangeable |
| Starting state | 100 HP, 0 gold, level 1, 0 XP, nothing owned |
| When income is paid | At the start of every PvP and PvE round. Council rounds pay nothing |
| Interest | Counted on the gold held at the start of the round, before that round's income |
| Win and streak gold | Paid at the end of each PvP fight |
| Streaks | Only PvP fights count, ghost fights included. A draw counts as a loss for both players. PvE fights leave streaks unchanged |
| Buying XP | Allowed from level 3 until level 9 |
| Units in shops | Out of the pool until bought or replaced |
| Sold out costs | A shop slot only rolls costs that have copies left |
| Shop lock | Stays on until the player turns it off. Rerolling still works while locked |
| Merged unit | Takes the place of a copy on the board if there is one, otherwise the lowest bench slot |
| Board below the level | Before a fight, bench units fill the free board places |
| Council options | 9 units from the pool, each with a random item component. Unit costs depend on the stage |
| Council with a full bench | A picked unit that can't go on the bench or merge is sold at once |
| Council pick time | 15 seconds for a person's pick in the client |
| Stage 1 damage | No stage damage. Surviving monsters still deal their damage |
| PvE loot | Given in full whether the player wins or loses |
| Matchmaking | The pairing with the fewest repeats of recent opponents, searched in a seeded order |
| Several eliminations in one round | Higher HP after the damage places higher, then higher HP before it, then a seeded draw |
| Eliminated players | Their units go back to the pool; their items are lost |
| Items held | No limit on the items a player holds off their units |
| Giving items | During planning, to units on the bench or the board |
| A merge with more than 3 items | The kept copy's items first, then the others' in the order the copies are found; the rest go back to the player |
| Gift offers | Rolled from each player's own Gift generator, so one player's rerolls don't change another's offer |
| A Gift offer left unpicked | When planning ends, the player gets one of the three at random |
| Gift units with no room | Sold at once, like a Council unit |
| Rings of Power at a Council | On the last two options that don't bring the One Ring |
| An eliminated player's Rings of Power | Back to the supply, while their other items are lost |

---

## 3. Package layout

The game layer is pure, deterministic game logic, so it lives in `packages/sim` next to the combat, under the same rules (`sim-spec.md` sections 3 and 4).

```
packages/sim/src/
  data/
    economy.ts      income, interest, streaks, XP, levels, shop odds, pool sizes
    rounds.ts       round schedule, stage damage, Council costs
    monsters.ts     PvE monsters and their abilities
    pve.ts          PvE boards and loot
    items.ts        item components and combined items
    gifts.ts        Gifts of Lothlórien
    ring.ts         the One Ring
  game/
    game.ts         createGame, actions, advancing rounds
    rules.ts        whether a player may take an action now, and why not
    pool.ts         the shared pool and shop rolls
    player.ts       bench, board, merging, gold and XP for one player
    places.ts       bench slots and board places, and finding units by place or id
    matchmaking.ts  pairing players and ghosts
    council.ts      Council of Elrond options and pick order
    ring.ts         the One Ring's state: offered, held, borne, corrupted, stolen, destroyed
    ring-supply.ts  the Rings of Power not in anyone's hands
  bots/
    bot.ts          a bot that plays one seat
    autopilot.ts    bots driving a game: Council picks, planning in a rotating order, whole games
  test/
packages/sim/scripts/
  balance.ts        runs many bot games and prints statistics
```

---

## 4. Determinism

- The section 4 rules of `sim-spec.md` apply to the game layer too.
- The game is a function of its config and the ordered list of calls made on it. Replaying the same calls gives the same game, so a server can be authoritative and a client can follow along.
- Randomness comes from seeded generators, each with its own stream so that one choice can't shift another:
  - each player's **shop generator**, used only for that player's shop rolls, so one player's rerolls don't change what another player's shop rolls;
  - the **game generator**, for matchmaking, fight seeds, Council options, their Rings of Power and pick order, loot, automatic Council picks and placement ties;
  - each player's **Gift generator**, for that player's Gift offers, rerolls, automatic picks and the random rewards of their Gifts.
- Each stream's seed is `deriveSeed(seed, stream)`, a fixed integer hash of the game seed and the stream number: 0 for the game generator, 1 + seat for shop generators, 20 + seat for Gift generators. Bots use streams from 100 upwards for their own choices.
- A fight's seed is a 32-bit integer drawn from the game generator.

---

## 5. Players

Each player has:

- **HP:** starts at 100. At 0 or below the player is eliminated.
- **Gold, level and XP.** XP counts towards the next level.
- **Streak:** a signed count of consecutive PvP results: +3 after three wins in a row, −2 after two losses.
- **Bench:** 9 slots.
- **Board:** the player's half, in their own perspective (`sim-spec.md` section 5): columns 0–6, rows 0–3, row 3 at the front. At most `level` units.
- **Shop:** 5 slots and a lock.
- **Items:** the items they hold that aren't on a unit, in the order they got them: components, combined items and Rings of Power.
- **Gifts:** the Gifts they have picked, in order; their current Gift offer, if any, and whether they have rerolled it; and the free rerolls left this round (section 9.10).
- **Recent opponents:** the last 3 players they fought, for matchmaking.
- **Placement:** set when they are eliminated or win.

An owned unit is a unit id, a star level, a game-wide numeric id and the items it holds (section 7.7). The numeric id lets a client follow a unit as it moves or merges.

---

## 6. Pool and shop

### 6.1 Pool

The pool holds the copies of each unit (`design.md` section 8). The number of copies is conserved: pool + shops + Council options + owned units (a 2★ is 3 copies, a 3★ is 9) always adds up to the starting pool.

### 6.2 Rolling a shop

A shop roll fills 5 slots in order. For each slot, using the player's shop generator:

1. **Cost:** take the odds of the player's level (`design.md` section 8) for the costs that still have copies in the pool. Draw one number and pick a cost by those weights. If no cost has weight, the slot stays empty.
2. **Unit:** draw one number and pick a unit of that cost, weighted by its copies in the pool, going through units in data order.
3. Take that copy out of the pool.

### 6.3 Refreshing

- **At the start of every PvP and PvE round,** each player's shop is refreshed for free unless it is locked. First every refreshing player's unbought units go back to the pool, then the shops are rolled in seat order.
- **Reroll:** costs 2 gold, or uses one of the player's free rerolls for the round if they have one (Second Breakfast). The unbought units go back to the pool and the shop is rolled again.
- **Shop odds:** a shop rolls with the odds of the player's level, or of one level higher per Mirror of Galadriel, up to level 9.
- **Lock:** a locked shop skips the free refresh. The lock stays on until the player turns it off.

---

## 7. Bench, board and merging

### 7.1 Buying

Buying a shop slot needs a unit in it, enough gold for its cost, and either a free bench slot or a merge that the new copy completes. The gold is paid, the slot is emptied and the unit is gained.

### 7.2 Gaining a unit

When a player gains a 1★ unit (by buying it or from the Council):

1. If they already own two 1★ copies, on the bench or the board, the three merge (7.3).
2. Otherwise it goes to the lowest free bench slot.
3. If the bench is full, a Council unit is sold at once (7.5). A purchase can't get here because of the check in 7.1.

### 7.3 Merging

- Three copies of a unit at the same star level merge into one copy a star higher. 3★ units don't merge.
- **Where the merged unit goes:** the place of the copy on the board if there is one (lowest row, then lowest column, in the player's perspective, if there are two), otherwise the lowest bench slot holding a copy. It keeps that copy's numeric id.
- The other copies are removed. Their items go to the merged unit as if given to it (section 7.7), one by one in order, copy by copy in the order the copies were found; any it can't take go back to the player's items.
- If the merge makes a third copy at the new star level, those merge too.
- Because merges happen at once, a player never owns three copies of a unit at the same 1★ or 2★ level.

### 7.4 Moving

- A move takes a unit from a bench slot or board place to another. If the destination holds a unit, the two swap.
- Moving a bench unit to an empty board place needs fewer than `level` units on the board.

### 7.5 Selling

Selling a unit gives back its cost for each copy in it (1, 3 or 9 copies) and returns those copies to the pool. Its items go back to the player's items, in the order it held them.

### 7.6 Filling the board

Before each fight, if a player has fewer than `level` units on the board and units on the bench, bench units move to the board, lowest bench slot first, until the board is full or the bench is empty. Each takes the first free place in this order: row 3 to row 0, and in each row the columns 3, 2, 4, 1, 5, 0, 6.

### 7.7 Items

Items are in `design.md` section 6 and `data/items.ts`.

- **Getting items:** Council picks and PvE loot add components, and Council picks Rings of Power, to the end of the player's items (sections 9.6, 9.7 and 9.12).
- **Giving an item** to a unit on the bench or the board, during planning:
  1. If the item is a component and the unit holds a lone component, the two combine into the recipe's item, which takes the lone component's place in the unit's items.
  2. Otherwise the unit must hold fewer than 3 items, and the item goes at the end of them. A Ring of Power can't go to a unit that already wears one.
  3. The item leaves the player's items.
- Combined items and Rings of Power never combine, and nothing combines off a unit.
- Items move with their unit. Only selling the unit takes them off (7.5).
- A fight's input lists each board unit's items in order (section 9.4).

---

## 8. Gold, XP and levels

### 8.1 Income

At the start of every PvP and PvE round, in this order:

1. **Interest:** 1 gold per 10 gold held, up to 5, or 3 more with Treasure of Erebor.
2. **Base income:** 2 at 1-2, 2 at 1-3, 3 at 1-4, 4 at 2-1, then 5.

### 8.2 Fight gold

At the end of each PvP fight:

- The winner gets 1 gold.
- Both players update their streak, then each gets the streak bonus for its length (`design.md` section 8): 1 gold at 2–3, 2 at 4, 3 at 5 or more. A win after losses starts a new win streak at 1, and the other way round.

### 8.3 XP and levels

- **Automatic levels:** level 2 at the start of 1-2 and level 3 at the start of 2-1. Before level 3 there is no XP.
- **Passive XP:** 2 XP at the start of every PvP and PvE round from stage 2 onwards, after the automatic level.
- **Buying XP:** 4 XP for 4 gold, from level 3 until level 9.
- **Levelling up:** while XP is at least the amount needed for the next level (`design.md` section 8), subtract it and go up a level. At level 9 any extra XP is lost.

---

## 9. Rounds

### 9.1 Schedule

From `design.md` section 9:

- Stage 1: 1-1 Council, then 1-2 to 1-4 PvE.
- Stage 2 and later: PvP, PvP, PvP, Council, PvP, PvP, PvE.

The game starts at 1-1 and goes on until at most one player is left.

### 9.2 Round start

At the start of a PvP or PvE round, the One Ring gains Corruption if it has a bearer (9.11). Then, for every living player in seat order:

1. the automatic level (8.3)
2. income (8.1)
3. passive XP (8.3), plus 2 for The Road Goes Ever On
4. free rerolls for the round, from Second Breakfast (9.10)

Then the shops refresh (6.3). In a Gift round, every living player then gets a Gift offer, in seat order (9.10). Then planning begins.

A Council round sets up the Council instead (9.6).

### 9.3 Planning

During planning, living players act in any order: buy, sell, reroll, buy XP, lock, move, give items, and pick or reroll a Gift offer. When the driver ends planning (the timer runs out, or every person is ready), unpicked Gift offers are picked at random (9.10) and the fights run.

### 9.4 Fights

1. Every living player's board is filled from the bench (7.6). Then a Ring without a bearer equips itself (9.11).
2. **PvE round:** each living player fights the round's monsters. The player is team A.
3. **PvP round:** players are paired (9.5). In each pair the first player is team A.
4. Fights run in pairing order with `simulateCombat`. Each gets a new seed from the game generator, and the current stage as its stage. Units carry their items, and each team its Gifts; a ghost carries copies of its owner's. While a player holds the One Ring, every fight gets its Corruption as `oneRingCorruption`, for the Nine (9.12).

### 9.5 Matchmaking

- With an odd number of living players, one of them fights a **ghost**: a copy of another living player's board. The ghost is team B, and its owner is not affected by the fight.
- **Pairing:**
  1. Shuffle the living players with the game generator (Fisher–Yates).
  2. A **repeat** is a pair where either player is among the other's recent opponents, or a ghost fight against the board of a recent opponent.
  3. Go through the possible pairings in the shuffled order and keep the first with the fewest repeats, stopping at the first with none. The first player in the order is paired with each later one in turn, then the next unpaired player, and so on; the first of each pair is team A. With an odd count, every choice of who fights a ghost is tried, starting from the last in the order, and for each, every choice of whose ghost, in order.
  4. Eight players have only 105 pairings, so the search is cheap, and it always finds a pairing with no repeats when there is one.
- After the fights, each player adds the opponent they fought to their recent opponents, ghost owners included, keeping the last 3.

### 9.6 Council of Elrond

- **Options:** 9, rolled at the start of the Council with the game generator. Each is a 1★ unit and an item component; the One Ring (9.11) and Rings of Power (9.12) can take the component's place.
  - The cost is drawn evenly from the stage's costs, skipping costs with no copies left. The unit is then picked as in 6.2 and taken out of the pool.
  - The component is drawn evenly from the six.

  | Stage | 1 | 2 | 3 | 4 | 5+ |
  |---|---|---|---|---|---|
  | Unit costs | 1 | 1–2 | 2–3 | 3–4 | 3–5 |

- **Pick order:**
  - At 1-1, all players pick at once: one group.
  - Later, living players are sorted by HP, lowest first, with ties in a seeded order, and pick in groups of two in that order.
- **Picking:** a player in the current group who hasn't picked takes any option still there. The unit is gained (7.2) and the component or Ring of Power goes to their items. When everyone in the group has picked, the next group's turn begins.
- **Running out of time:** when the driver ends a group's turn, everyone in it who hasn't picked gets a random option still there, other than the One Ring's (9.11). Someone with only the Ring's option left gets nothing.
- After the last group, unpicked options' units go back to the pool, their Rings of Power to the supply (9.12), and the next round starts.

### 9.7 PvE rounds

- Each PvE round has a fixed board of monsters (`data/pve.ts`). Monsters are units for the sim with no traits and no cost (9.8).
- **Loot:** every living player gets the round's loot, whether they win or lose. Components are drawn evenly from the six with the game generator.

  | Round | Monsters | Loot |
  |---|---|---|
  | 1-2 | 2 Moria goblins | 1 component |
  | 1-3 | 2 Moria goblins, 1 goblin archer | 1 component |
  | 1-4 | 2 Moria goblins, 2 goblin archers | 1 component, 2 gold |
  | 2-7 | 4 Wargs | 1 component, 2 gold |
  | 3-7 | Cave Troll, 2 Moria goblins, 2 goblin archers | 2 components |
  | 4-7 | Watcher in the Water, 2 Wargs | 2 components, 2 gold |
  | 5-7 | Mûmak, 3 goblin archers | 2 components, 4 gold |
  | 6-7 on | The Balrog, 4 Moria goblins | 2 components, 4 gold |

### 9.8 Monsters

1★ stats; star multipliers don't apply because monsters are always 1★. All have Ability Power 100, Crit Chance 25%, Crit Damage 140% and Dodge 0%.

| Monster | Large | Health | Attack Damage | Attack Speed | Range | Armor | Magic Resist | Mana |
|---|---|---|---|---|---|---|---|---|
| Moria goblin | | 350 | 35 | 0.70 | 1 | 15 | 15 | — |
| Goblin archer | | 280 | 35 | 0.70 | 3 | 10 | 10 | — |
| Warg | | 600 | 50 | 0.85 | 1 | 25 | 25 | — |
| Cave Troll | yes | 2400 | 110 | 0.55 | 1 | 40 | 30 | 0 / 80 |
| Watcher in the Water | yes | 3200 | 120 | 0.60 | 2 | 40 | 40 | 0 / 70 |
| Mûmak | yes | 4500 | 150 | 0.50 | 1 | 60 | 40 | 0 / 80 |
| The Balrog | yes | 6000 | 180 | 0.70 | 2 | 60 | 60 | 0 / 70 |

- **The Balrog** gains 25% Health and Attack Damage for each stage after 6.
- Abilities use the building blocks of `sim-spec.md` section 10. Their values scale like a unit of the given cost:

  | Monster | Cost for scaling | Ability |
  |---|---|---|
  | Cave Troll | 3 | **Smash:** 1.0 D and a 1s stun to adjacent enemies |
  | Watcher in the Water | 4 | **Tentacles:** 0.8 D to the target and enemies next to it, and a 1.5s stun |
  | Mûmak | 4 | **Trample:** rides through a 3-hex line; 1.0 D and a 1s stun to enemies hit |
  | The Balrog | 5 | **Whip of flame:** 1.2 D magic damage in a 6-hex cone and a 1s stun |

- Each surviving monster counts as a 1★ unit for player damage.
- `sim-spec.md` gets the monsters when they are added to the sim.

### 9.9 Results

After all the round's fights:

1. **PvP:** fight gold and streaks (8.2) for both players. A ghost fight does this for the real player only.
2. **Damage:** a player who loses a fight, or draws one, takes stage damage plus 1, 2 or 3 for each surviving enemy unit at 1★, 2★ or 3★ (`design.md` section 9). Stage damage at stage 1 is 0. In a PvP draw both players take damage. A ghost owner takes none.
3. **Loot** on PvE rounds (9.7), then **the Seven's gold** (9.12), for players above 0 HP.
4. **The One Ring:** Hobbit fights, then stealing (9.11).
5. **Recent opponents** (9.5).
6. **Eliminations:** every player at 0 HP or below is eliminated. Their bench, board and shop go back to the pool, their Rings of Power to the supply (9.12), and their other items are lost. They take the lowest places still free, ordered by higher HP after the damage, then higher HP before it, then a seeded draw. A Ring they held waits for the next Council (9.11).
7. **Game over:** if one player is left, they place first. If none are left, the places from step 5 cover everyone. Otherwise the next round starts.

### 9.10 Gifts of Lothlórien

Gifts are in `design.md` section 9 and `data/gifts.ts`.

- **Offers:** in a Gift round (2-1 Silver, 3-2 Gold, 4-2 Mithril), each living player gets 3 Gifts of the round's tier, drawn with their Gift generator from the tier's Gifts they don't have. Each draw is even among those left; once a crest is drawn, the other crests are left out of that offer.
- **Reroll:** once per offer, during planning, the player can replace all three with three new ones, drawn the same way from the tier's Gifts other than the three shown. If too few are left, the draw takes what there is.
- **Picking:** during planning, the player takes one of the three. The offer is gone, and the Gift is added to their Gifts. A Gift that gives something right away gives it now:
  - **gold, components, combined items or XP**, as the Gift says. Components and combined items are drawn evenly with the Gift generator.
  - **units:** each is drawn like a Council unit (section 9.6) of the Gift's cost, and gained (7.2). If no copies of that cost are left, the next lower cost with copies is used. A unit with no room is sold at once.
- **Automatic pick:** when planning ends, before the fights, a player who still has an offer gets one of the three at random, drawn with their Gift generator.
- **Lasting Gifts** change the rules above: free rerolls (6.3), shop odds (6.3), interest (8.1) and XP each round (9.2).
- **In the fight:** every fight's input lists each team's Gifts (`sim-spec.md` section 12.5). A ghost has its owner's Gifts; monsters have none.
- An eliminated player's Gifts and offer are gone.

### 9.11 The One Ring

Rules from `design.md` section 9, numbers in `data/ring.ts`. The game has one Ring. It is **waiting** for a Council, **offered** in one, **held** by a player, or **destroyed**. It has a Corruption, a holder and a bearer while held, and two counts: rounds borne by Hobbits, and fights fought by Hobbit bearers.

- **Arrival:** when a Council starts from stage 3 on (3-4 is the first) and the Ring is waiting, the last option carries the Ring instead of a component. If a copy of Bilbo is in the pool, the option's rolled unit goes back to the pool and a Bilbo is taken instead; otherwise the option keeps its unit.
- **Picking it:** the unit is gained as usual (7.2), and the picker holds the Ring. The bearer is the picker's Bilbo, if they now own one (the first in the order of 7.3: board, then bench), otherwise no unit.
- **Left over:** if the Ring's option is still there after the last group, the Ring waits for the next Council.
- **Giving it:** during planning, the holder's `ring` action makes the unit at a place the bearer, on the bench or the board.
- **Corruption:** at the start of each PvP and PvE round (9.2), if the Ring has a bearer, its Corruption rises by 1. For a Hobbit bearer, the Hobbit round count rises instead, and Corruption only when that count is even. At 10 the Ring is Consumed.
- **Equipping itself:** before the fights, after the boards fill (9.4), a held Ring with no bearer goes to a random unit on the holder's board, drawn with the game generator. With an empty board it stays unworn.
- **In fights:** if the bearer is on the board, its placement has `ring` set to the Corruption (`sim-spec.md` section 12.6). A ghost of the holder's board carries it too.
- **After the fights** (9.9, step 4):
  1. **Hobbit fights:** if the bearer was on the board of a fight of the holder's own, not a ghost of their board, and is a Hobbit, the count rises by 1.
  2. **Stolen:** for a PvP fight between the holder and another player, if a Gollum is among the other player's survivors, that player holds the Ring. The bearer is their first Gollum on the board, in fill order (7.6). Corruption and counts are kept.
- **Selling** the bearer leaves the Ring with no bearer. **Merging:** if the bearer is one of the copies that merge, the merged unit bears it.
- **Destroying:** during planning, the holder's `destroyRing` action works while the bearer is a Hobbit and Hobbit bearers have fought at least 3 fights. The holder gains 30 gold and a random combined item, drawn with the game generator, and the Ring is destroyed for the rest of the game. The Three and the Nine go with it (9.12).
- **Consumed:** the bearer is removed: its copies go back to the pool and its items to the holder. The Ring waits for the next Council with no Corruption and both counts at 0.
- **Eliminated holder:** the Ring waits for the next Council, keeping its Corruption and counts.
- `GameState.ring` shows the Ring to everyone: its state, holder, bearer (the owned unit's id), Corruption and Hobbit fights.

### 9.12 Rings of Power

Rules from `design.md` section 9. The rings are items in `data/items.ts`, with their copies; the Council numbers are in `data/rounds.ts`.

- **Supply:** the game starts with every copy of every ring in its supply: each of the Three once, 7 Rings of the Seven and 9 Rings of the Nine. A ring is in the supply, on a Council option, in a player's items or on an owned unit, and the copies always add up, until the One Ring is destroyed.
- **Arrival:** when a Council starts from stage 2 on (2-4 is the first), the last 2 options that don't bring the One Ring (9.11) each carry a Ring of Power instead of their component, while the supply has any. Each ring is drawn with the game generator, weighted by its copies in the supply, and taken out of it.
- **Picking** one gives the ring to the picker's items (9.6). An unpicked one goes back to the supply.
- **Wearing:** given like any item (7.7), at most one per unit. It moves, merges and sells like any item; a merge that would put a second Ring of Power on a unit sends it to the player's items.
- **The Seven:** after the fights (9.9, step 3), each player above 0 HP gains 1 gold for each Ring of the Seven on a unit on their board, or 2 if that unit is a Dwarf.
- **In fights:** the Three and the Nine act through the units' items (`sim-spec.md` section 12.7). While the One Ring is held, every fight gets its Corruption (9.4).
- **The One destroyed** (9.11): every ring of the Three and the Nine leaves the game, from players' items and owned units alike, and the supply keeps none of them. Later Councils draw only Rings of the Seven.
- **Eliminated players:** their rings, worn or not, go back to the supply (9.9, step 6).

---

## 10. API

```ts
interface GameConfig {
  seed: number;      // 32-bit integer
  players: number;   // 2–8
}

type Place = { bench: number } | { col: number; row: number };   // board places in the player's own perspective

type Action =
  | { type: 'buy'; slot: number }          // shop slot 0–4
  | { type: 'sell'; from: Place }
  | { type: 'move'; from: Place; to: Place }
  | { type: 'reroll' }
  | { type: 'buyXp' }
  | { type: 'lock'; locked: boolean }
  | { type: 'equip'; item: number; to: Place }   // index into the player's items
  | { type: 'gift'; option: number }       // Gift offer option 0–2
  | { type: 'rerollGifts' }
  | { type: 'ring'; to: Place }            // the holder gives the One Ring to the unit there
  | { type: 'destroyRing' }
  | { type: 'pick'; option: number };      // Council option 0–8

type ActionResult = { ok: true } | { ok: false; reason: string };

interface Game {
  readonly state: GameState;                 // read-only: round, phase, players, pool, Council
  act(seat: number, action: Action): ActionResult;
  advance(): RoundReport | null;             // ends planning, or the current Council group's turn
  isOver(): boolean;
}

interface RoundReport {
  stage: number;
  round: number;
  fights: FightReport[];
  damage: { seat: number; amount: number }[];
  eliminated: number[];
}

interface FightReport {
  kind: 'pvp' | 'ghost' | 'pve';
  home: number;            // seat of team A
  away: number | null;     // seat of team B, the ghost's owner, or null for PvE
  input: CombatInput;      // enough to replay the fight with createCombat
  result: CombatResult;
}

function createGame(config: GameConfig): Game;   // throws on an invalid config
```

- `state.phase` is `council`, `planning` or `over`.
- An action that isn't allowed returns `ok: false` with a reason and changes nothing. A client can send an action that was valid a moment ago, so this is not an error.
- `advance()` returns a report when it ends planning, and `null` when it ends a Council group's turn.
- A client replays a fight from its report with `createCombat(report.input)`.

---

## 11. Bots

- A bot plays one seat through `act`, like a person. It has its own seeded generator, so a game with the same seed and the same bots plays out the same way.
- **Planning:**
  - **Economy:** keep gold above a floor that rises by stage (about 10, 20, 30, 50 from stage 2), and spend what is above it.
  - **Levels:** buy XP towards a target level for the stage (about 4 at 2-1, 5 at 2-5, 6 at 3-2, 7 at 4-1, 8 at 5-1).
  - **Buying:** prefer units that complete a pair or a merge, then units of the bot's two focus traits, then higher costs.
  - **Rolling:** at the target level from stage 4, or when below 40 HP, reroll with the gold above a lower floor.
  - **Selling:** when the bench is full, sell the least useful unit that isn't part of a pair.
  - **Board:** the strongest units up to the level, by cost and star. Guardians at the front, Riders, Captains and Burglars behind them, Archers and Sorcerers at the back.
- **Focus traits:** chosen at 2-1 from the units the bot owns, with a seeded preference so bots in one lobby play different comps.
- **Items:** after arranging its board, the bot gives each of its items, in order, to a board unit by the item's role:
  - Blades and Bows to its **attacker**: the strongest board unit that isn't a Guardian or a Sorcerer.
  - Staffs to its **caster**: the strongest Sorcerer, otherwise the attacker.
  - Mail, Cloaks and Lembas to its **tank**: the strongest Guardian, otherwise the strongest unit in the front row.
  - A combined item has the role of its first component, in the order Blade, Bow, Mail, Cloak, Lembas, Staff.
  - If that unit can't take the item, the next strongest board unit that can; if none can, the bot keeps it.
- **Council:** the option that completes a pair or merge, then one of its focus traits, then the highest cost. A Ring of Power adds 40 to an option's score.
- **Rings of Power:** given with the other items, in order. Each ring prefers a board unit of its kin, an Elf or Istari for the Three and a Dwarf for the Seven; otherwise Narya and the Nine go to the attacker, Nenya and the Seven to the tank, and Vilya to the caster.
- **The One Ring:** in a Council, a bot at or below 60 HP wants the Ring's option over any other; above it, it never takes the Ring. A bot holding the Ring gives it to a Hobbit on its board if it has one, otherwise to its attacker (section 11, Items), whenever the Ring has no bearer on the board. It destroys the Ring as soon as it can, unless it has a ring of the Three or the Nine.
- **Gifts:** at the start of planning, a bot with an offer scores each Gift: a crest of one of its focus traits highest, then combat Gifts, then economy Gifts, which it values more while its HP is high. It rerolls once if no option scores well enough, then takes the best, the first if tied. The scores are in `data/bots.ts`.
- **Balance runner:** `pnpm balance [games] [first seed]` (`scripts/balance.ts`) plays many 8-bot games and prints the game length, PvE win rates by round, and for each stage the players alive and eliminated, with the living players' average HP, level and gold after planning in its first round. Then the average placement, top-4 rate and win rate of each unit, active trait and item on players' final boards, each Gift, and each pair of focus traits.
- The numbers bots play by are in `data/bots.ts`. They tune the bots, not the game.

---

## 12. Client: playing against bots

The play page, `play.html` in `packages/client`, next to the fight viewer (`viewer-spec.md`), which links to it. Offline, the person plays seat 0 and bots play the rest. The page also plays online games; `server-spec.md` section 10 covers the menu, lobbies and how the page follows the server.

- **Running the game:** the match runner from `packages/server` (`server-spec.md` section 5), in the page for offline games. Bots pick in a Council as soon as it's their group's turn, and plan at the start of planning, in a rotating order. Once the person is out, the rest of the game plays out at once.
- **Planning view:** the person's half of the board and their bench, a row of 9 tiles in front of it, in 3D. An HTML overlay with the round, a timer, HP, gold, level, XP and the board count, the shop, the buy XP, reroll and lock buttons, the person's items and a Ready button.
- **Drag and drop** moves units between the bench and the board, swapping with a unit already there; dropping a unit on the shop bar sells it. Dragging one of the person's items onto a unit gives it to that unit.
- **Items** show on each unit's label, in planning and in fights, and each item names its effect when hovered.
- **Keys:** D rerolls, F buys XP, Space is Ready.
- **Players list:** every player's HP, level and place.
- **Council:** the options as cards with their components or Rings of Power and who took them; the person picks one when it's their group's turn.
- **Rings of Power** show like other items, as chips in the ring's colours, each naming its effect when hovered.
- **The One Ring:** the Ring's Council option shows the Ring instead of a component. The holder sees the Ring's Corruption and tier in the HUD, and a Destroy button when they can destroy it. The Ring is a chip among the person's items, which they drag onto a unit to make it the bearer. The bearer's label shows the Ring and its Corruption, in planning and in fights, and the players list marks the holder.
- **Gifts:** during planning with an offer, a panel shows the three Gifts with their tier and effect, and a Reroll button until it is used. The person's Gifts are listed by the players list, each naming its effect when hovered.
- **Fights:** the person's fight plays back with the viewer's playback, at 1×, 2× or 4×, and can be skipped; the others run headless. When the person is team B, the camera starts on their side. The person's units are always blue.
- **Results:** for a few seconds after each fight, the damage everyone took and who was knocked out.
- **End:** the person's place and the final standings, with a New game button.
- **Timers:** 30 seconds of planning (`design.md` section 9), or 45 with a Gift offer, ended early by Ready; 15 seconds for the person's Council pick, after which they get a random option. The match runner keeps them, offline as online.
- **Seed:** from the URL (`play.html#seed=7`), which starts an offline game straight away, or random from the menu's Play against bots.

---

## 13. Tests and acceptance criteria

**Pool and shop**
- Copies are conserved through buying, selling, rerolling, merging, Councils and eliminations.
- Shop odds over many rolls match the level's odds, and sold out costs are skipped.
- Shops don't refresh while locked.

**Bench, board and merging**
- Merging on buying, including with a full bench and when copies are on the board, and two levels of merge from one purchase.
- Where the merged unit goes.
- Refunds for 1★, 2★ and 3★ units.
- Moves, swaps and the level limit; filling the board before a fight.

**Items**
- Giving components and items, combining, the 3-item limit, and giving to bench units.
- Items going back to the player on selling, and moving to the merged unit on merging, with the extras going back.
- Fights get the board units' items; eliminated players' items are gone.

**Gifts**
- Offers in the Gift rounds only, of the right tier, never repeating a held Gift, with at most one crest.
- One reroll, picking, the automatic pick, and each Gift's reward: gold, components, combined items, units (and their fallback cost), XP, free rerolls, shop odds, interest and XP per round.
- Fights get both teams' Gifts.

**The One Ring**
- Arrival at 3-4 with Bilbo, automatic picks skipping it, and coming back when nobody takes it.
- Corruption by round, every other round for Hobbits; Consumed at 10; equipping itself; giving and moving it; selling and merging the bearer.
- Hobbit fights, destroying it and its reward, stealing by a surviving Gollum, and the holder's elimination.

**Rings of Power**
- Two at each Council from 2-4, drawn from the supply, never on the One Ring's option; unpicked ones back to the supply.
- One per unit, when given and when merging; the Seven's gold, double on a Dwarf; the One's Corruption in every fight while it is held.
- The Three and the Nine gone everywhere when the One is destroyed; an eliminated player's rings back to the supply; copies conserved throughout.

**Economy**
- Income by round, interest steps and the cap, win and streak gold.
- XP and levels: automatic levels, passive XP, buying XP, carrying over and the cap at 9.

**Rounds**
- The schedule for stages 1 to 3.
- Matchmaking avoids the last 3 opponents when it can, and an odd count gives exactly one ghost fight.
- Player damage, draws, ghost owners taking no damage, and PvE losses.
- Eliminations, places for players eliminated together, and the end of the game.
- Council groups in HP order, picks, automatic picks, and selling a unit that doesn't fit.
- Every PvE board is valid sim input; loot is given win or lose.

**Determinism**
- The same seed and the same calls give the same game; compare a hash of every round report.
- A full 8-bot game is the same twice.

**Bots and performance**
- 8 bots finish a game. Every place from 1 to 8 is given out once, and games end around stage 6 on average.
- A full 8-bot game takes under 2 seconds in Node.
