# Glossary

The words `design.md` and the specs use, each with one meaning. Section 11 lists the words that are only clear with a qualifier, and how to say each.

- A term means what it says here in every doc. A doc that uses a term another way, or a section 11 word without its qualifier, has a bug.
- This file defines words. It doesn't restate rules or numbers: those stay in `design.md` and the specs, which the "Defined in" column points to.
- Names of content (units, traits, items, Gifts, rings, monsters) are in `design.md` sections 4 to 9 and are not repeated here.

---

## 1. Game and rounds

| Term | Meaning | Defined in |
|---|---|---|
| Game | One match for 2 to 8 players, from round 1-1 until at most one player is left. | `game-spec.md` 1, 9.1 |
| Stage | A group of rounds. Stage 1 has three rounds; every later stage has seven. | `design.md` 9 |
| Round | One entry in the schedule, named *stage-number*, such as 2-4. Each round is a PvP round, a PvE round or a Council round. | `design.md` 9 |
| PvP round | A round in which players fight each other's boards, or a ghost. | `design.md` 9; `game-spec.md` 9.4 |
| PvE round | A round in which every living player fights the same board of monsters. | `game-spec.md` 9.7 |
| Council round, Council | A round of the Council of Elrond: players pick from shared options in pairs, lowest HP first, with no fight. | `game-spec.md` 9.6 |
| Gift round | A PvP or PvE round whose planning starts with a Gift offer (2-1, 3-2 and 4-2). | `game-spec.md` 9.10 |
| Planning | The part of a PvP or PvE round before the fights, when players can take every action. | `game-spec.md` 9.3 |
| Fight phase | The part of a round after the fights have run and before the driver advances. Players can act only on their bench, shop, items and XP. | `game-spec.md` 9.4 |
| Phase | Which part of a round the game is in: `council`, `planning`, `fight` (the fight phase) or `over` once the game has ended (`Phase` in `game/game.ts`). The match steps have the same names. | `game-spec.md` 9.3, 9.4 |
| Fight | One battle between two teams, run by the sim from start to result. *Combat* means the same thing, in code names (`createCombat`, `CombatInput`). | `sim-spec.md` 6, 13 |
| Outcome | How a fight ends: team A wins, team B wins, or a draw. | `sim-spec.md` 13 |
| Draw (outcome) | A fight that ends with neither team winning: both teams are still alive after overtime, or neither team placed any units. Both players take damage. | `sim-spec.md` 13; `game-spec.md` 9.9 |
| Ghost, ghost fight | A copy of another living player's board, fought by the odd player out in a PvP round. The ghost is always team B. | `game-spec.md` 9.5 |
| Ghost owner | The player whose board a ghost copies. The ghost fight doesn't affect them. | `game-spec.md` 9.5 |
| Pairing | Matching living players into fights for a PvP round. | `game-spec.md` 9.5 |
| Repeat | A pairing of two players where either is among the other's recent opponents. | `game-spec.md` 9.5 |
| Recent opponents | The last 3 players a player has fought, ghost owners included. | `game-spec.md` 5, 9.5 |
| HP | A **player's** life total. Not the same as a unit's Health. | `design.md` 9 |
| Player damage | The HP a player loses for losing a fight, or drawing one: stage damage plus a number for each surviving enemy unit. | `design.md` 9; `game-spec.md` 9.9 |
| Stage damage | The part of player damage set by the stage. | `design.md` 9 |
| Survivor | A non-summon unit, monsters included, still alive at the end of a fight. Survivors count towards player damage. | `sim-spec.md` 13 |
| Streak | A signed count of a player's PvP results in a row: positive for wins, negative for losses. | `game-spec.md` 5, 8.2 |
| Knocked out | A player that this round's fights have brought to 0 HP or below. They are eliminated when the fight phase ends. | `game-spec.md` 9.4, 9.9 |
| Eliminated | Out of the game, with a final placement. | `game-spec.md` 9.9 |
| Final place | A player's final rank, from 1st to 8th (`placement` in code). See *placement* in section 11. | `game-spec.md` 5, 9.9 |
| Driver | Whatever calls the game's actions and ends planning: the server's match runner, the balance runner or a test. | `game-spec.md` 9.3 |

## 2. Players, the shop and owned units

| Term | Meaning | Defined in |
|---|---|---|
| Player | One of a game's 2 to 8 participants, identified by their seat. A player is played by a person or a bot. | `game-spec.md` 5 |
| Person | A human player. | `server-spec.md` 5 |
| Bot | A program that plays a seat. Bots and people are interchangeable. | `game-spec.md` 11 |
| Pool | The shared supply of unit copies that shops and Councils draw from. | `game-spec.md` 6.1 |
| Copy | One of a unit's instances, at any star level, as in three copies merging. Counted against the pool, a copy is one unit's worth: a 1★ unit is 1 copy, a 2★ is 3 and a 3★ is 9, and the total is always the same. See section 11. | `game-spec.md` 6.1, 7.3 |
| Shop | A player's 5 shop slots, with a lock. | `game-spec.md` 6 |
| Roll (shop) | Filling every shop slot from the pool. | `game-spec.md` 6.2 |
| Refresh | The free roll at the start of a PvP or PvE round. A locked shop isn't refreshed. | `game-spec.md` 6.3 |
| Reroll (shop) | A paid roll, or one of the player's free ones. | `game-spec.md` 6.3 |
| Lock | Keeps a shop's units through the next refresh, until the player turns it off. | `game-spec.md` 6.3 |
| Bench | A player's 9 bench slots for units that aren't on the board. | `game-spec.md` 5 |
| Board (player's) | The player's half of the grid, in their own perspective, holding at most `level` units. See section 11. | `game-spec.md` 5 |
| Board place | A (column, row) on a player's board. | `game-spec.md` 7.4 |
| Owned unit | A unit a player has on their bench or board: a unit id, a star level, a numeric id and its items. Waiting units aren't owned units. | `game-spec.md` 5, 7.2 |
| Waiting units | Units a player gained with no room on the bench. They wait, oldest first, for a free slot or a merge, and don't fight. | `game-spec.md` 7.2 |
| Gain (a unit) | To receive a 1★ unit by buying it, from the starting kit, a Council or a Gift: it merges, goes on the bench, or waits. | `game-spec.md` 7.2 |
| Merge | Three copies of a unit at the same star level becoming one copy a star higher. | `game-spec.md` 7.3 |
| Star level | 1★, 2★ or 3★. | `design.md` 7 |
| Level (player) | A player's level, from 1 to 9: the number of units they may have on the board, and the shop odds they roll with. See section 11. | `design.md` 8 |
| XP | Experience points towards the next level. | `game-spec.md` 8.3 |
| Income | The gold paid at the start of each PvP and PvE round: interest, then base income. | `game-spec.md` 8.1 |
| Interest | Gold paid for the gold a player holds, up to a cap. | `game-spec.md` 8.1 |
| Fight gold | Win and streak gold from a PvP fight, paid when the fight phase ends. | `game-spec.md` 8.2 |
| Loot | What a PvE round gives every living player: components and sometimes gold. | `game-spec.md` 9.7 |
| Starting kit | The 1★ unit and the item component each player is given before 1-1. | `game-spec.md` 9.1 |
| Filling the board | Before each fight, bench units moving onto the board up to the player's level. | `game-spec.md` 7.6 |

## 3. Board, positions and geometry

| Term | Meaning | Defined in |
|---|---|---|
| Hex | One cell of the grid. Only one unit can stand on a hex. | `sim-spec.md` 5 |
| Board (fight's) | The whole grid of a fight, 7 columns by 8 rows, both halves. See section 11. | `sim-spec.md` 5 |
| Half | One team's 4 rows of the board: rows 0–3 for team A, 4–7 for team B. | `sim-spec.md` 5 |
| Team | A or B: one of the two sides in a fight. In a PvP fight, the first player of the pair is team A; in a PvE fight, the player is. | `sim-spec.md` 5; `game-spec.md` 9.4 |
| Own perspective | A team's own view of the board: columns 0–6 from left to right, row 0 at the back and row 3 at the front. Every geometric choice is made in the acting team's own perspective. | `sim-spec.md` 5 |
| Board coordinates | Positions on the whole board, as team A sees it. Team B's own positions are mirrored into them. | `sim-spec.md` 5 |
| Front row, back row | A team's row 3 and row 0 in its own perspective, where its units are placed. | `sim-spec.md` 5, 12.5 |
| Placement (unit) | A unit as it is put on the board for a fight: unit id, star level, column, row, items, and the One Ring's Corruption on its bearer (`PlacedUnit`). See section 11. | `sim-spec.md` 14 |
| Distance | Hex distance between two hexes. | `sim-spec.md` 5 |
| Adjacent, next to | At distance 1. The docs use both, with the same meaning. | `sim-spec.md` 5 |
| Neighbours | The 6 hexes adjacent to a hex, in a fixed direction order. | `sim-spec.md` 5 |
| Within *n* hexes | At distance *n* or less. | `sim-spec.md` 10.3 |
| In range | At a distance no greater than the unit's Range from its target. | `sim-spec.md` 9 |
| Free hex | A hex on the board with no living unit on it, not claimed by a moving or dashing unit, nor by a dash still winding up. | `sim-spec.md` 10.4 |
| Claim | To reserve a hex for a move or dash so that no other unit can take it. A moving unit stands on the hex it has claimed. An ability's dash claims its destination at the cast, while the caster stays on its own hex until the release. | `sim-spec.md` 10.4, 10.6, 11 |
| Tie-break | The fixed order that settles ties: lower row, then lower column in the acting team's perspective, then lower action slot. | `sim-spec.md` 5 |
| Facing direction | The neighbour direction closest to the target, used for cones. | `sim-spec.md` 10.4 |
| Line | Hexes on a straight hex line from the caster through its target and beyond it. | `sim-spec.md` 10.4 |
| Cone | The 6 hexes in front of the caster in its facing direction. | `sim-spec.md` 10.4 |
| Area | A hex and every hex within *r* of it. | `sim-spec.md` 10.3 |
| Bounce | A chain of hits, each on the nearest enemy not yet hit within a jump of the last. | `sim-spec.md` 10.4 |
| Large | A tag for Treebeard, Sauron and the big monsters. Large units still take up one hex. | `design.md` 4 |

## 4. Time and acting

| Term | Meaning | Defined in |
|---|---|---|
| Tick | The sim's time step, a thirtieth of a second. | `sim-spec.md` 6.1 |
| Tick 0, combat start | The tick that only sets up the fight. Units start acting at tick 1. | `sim-spec.md` 6.2 |
| Normal time | Ticks 0 to 899. | `sim-spec.md` 6.1 |
| Overtime | Ticks 900 to 1349, in which all damage ramps up. | `sim-spec.md` 6.1, 9.1 |
| Every second | On ticks 30, 60, 90 and so on. | `sim-spec.md` 6.4 |
| Action slot | A unit's rank within its team, which sets its place in the action order. Called *slot* in the specs and code. See section 11. | `sim-spec.md` 6.3 |
| Action order | The order units act in each tick: by action slot, with the team the generator picks first for that tick going first within each slot. | `sim-spec.md` 6.3 |
| Act | A unit's turn in the tick: cast, find a target, attack or move. | `sim-spec.md` 6.4 |
| Busy | Unable to act because the unit is moving, winding up, dashing or recovering. A busy unit isn't stunned. | `sim-spec.md` 6.4, 10.6 |
| Queue | Everything due on a later tick, such as blows, projectiles, landings, dash departures and delayed steps, resolved at the start of that tick in a fixed order. | `sim-spec.md` 6.4 |
| Due | Scheduled in the queue for a given tick. | `sim-spec.md` 6.4 |
| Living | Alive: Health above 0. A living unit counts towards a fight going on, summons included. | `sim-spec.md` 9.1, 13 |
| Move | One hex of movement, taking 15 ticks, and the verb for it. The unit claims the hex as it starts. See *step* in section 11. | `sim-spec.md` 11 |
| Seeded generator | The fight's or game's random number generator (mulberry32), started from a seed. Each game-layer stream has its own generator. | `sim-spec.md` 4; `game-spec.md` 4 |
| Roll (chance) | One draw from the generator against a chance, such as a dodge or crit roll. It succeeds when `rng() < chance`. | `sim-spec.md` 4 |

## 5. Stats, attacks and damage

| Term | Meaning | Defined in |
|---|---|---|
| Health | A **unit's** life. Max Health is its cap. Not the same as a player's HP. | `design.md` 7 |
| Stat template | The base stats of a role (Tank, Fighter, Skirmisher, Archer, Caster), taken from a unit's first class. | `design.md` 5; `sim-spec.md` 7.2 |
| Resist | Armor or Magic Resist. | `design.md` 7 |
| Basic attack | An attack made on the Attack Speed timer: a blow for melee units, a projectile for ranged ones. | `sim-spec.md` 9 |
| Fire (an attack) | The moment a basic attack starts, when the cooldown is ready. Mana and stacks are gained then. | `sim-spec.md` 9 |
| Cooldown | The time until a unit's next basic attack. Once it has passed, the cooldown is up. | `sim-spec.md` 9 |
| Blow | A melee basic attack's hit, landing a fixed time after the attack fires. | `sim-spec.md` 9 |
| Projectile | Something flying to its target, such as an arrow, stone or bolt. It follows its target and lands when it arrives. | `sim-spec.md` 9, 10.6 |
| Hit | A blow, projectile or ability hit arriving at its target, when dodge, crit and damage are worked out. | `sim-spec.md` 9 |
| Land | For a blow, projectile or ability, to reach its target and take effect. | `sim-spec.md` 9, 10.6 |
| Wasted | A basic attack's blow or projectile that doesn't land. A melee blow is wasted if, when it lands, the attacker or target has died, or the target has become untargetable or left the attacker's Range. A projectile is wasted only if its target is dead or untargetable on arrival: it still lands if its attacker has died. See *wasted, missed, dodged* in section 11. | `sim-spec.md` 9 |
| Dodge | A successful dodge roll: the basic attack deals no damage and triggers no on-hit effects. Abilities can't be dodged. | `sim-spec.md` 9 |
| Crit | A successful crit roll: the damage is multiplied by Crit Damage. | `sim-spec.md` 9 |
| On hit | Effects triggered by a basic attack hitting, such as the Oakenshield's. | `sim-spec.md` 9 |
| Damage type | Physical (reduced by Armor), magic (reduced by Magic Resist) or true (not reduced). | `design.md` 7; `sim-spec.md` 9.1 |
| Damage kind | Where damage came from: `attack`, `ability`, `trait` or `item`. | `sim-spec.md` 14 |
| Damage pipeline | The fixed sequence every damage goes through: raw, amplified, reduced, final. | `sim-spec.md` 9.1 |
| Damage amp | A percent increase to damage dealt. Amps add together. | `sim-spec.md` 9.1 |
| Damage reduction | A percent decrease to damage taken, applied after resists. Reductions add together, up to 100%. See *reduction* in section 11. | `sim-spec.md` 9.1 |
| Absorbed | The part of damage a shield takes instead of Health. | `sim-spec.md` 9.1 |
| Source | The unit that deals damage, a heal or a status. | `sim-spec.md` 14 |
| Kill | Dealing the damage that brings a unit's Health to 0 or below. | `sim-spec.md` 12.4 |
| Mana | What fills towards an ability. Always a whole number, capped at max mana. | `sim-spec.md` 10.1 |
| Full mana | Mana at or above max mana. The unit casts at its next act. | `sim-spec.md` 10.1 |
| Heal | Restoring Health, never above max Health. | `sim-spec.md` 9.2 |
| Stack | One instance of a bonus that builds up, such as an Archer's or a Grond's Attack Speed. | `design.md` 4, 6 |

## 6. Abilities

| Term | Meaning | Defined in |
|---|---|---|
| Ability | A unit's spell or special move, cast at full mana. | `design.md` 5 |
| Cast | The tick a unit at full mana starts its ability: mana resets to 0, and targets and areas are chosen and locked. | `sim-spec.md` 10.1, 10.6 |
| Caster | The unit casting an ability. | `sim-spec.md` 10 |
| Wind-up | The time between the cast and the release. The caster is busy and stays on its hex. | `sim-spec.md` 10.6 |
| Release | The end of the wind-up: strikes land, projectiles and lobs leave, and dashes and charges set off. | `sim-spec.md` 10.6 |
| Delivery | How an ability reaches enemies: `strike`, `projectile` or `lob`. Dashes and charges are strikes timed by their movement. | `sim-spec.md` 10.5, 10.6 |
| Strike | A delivery whose effects land at the release, or as the dash or charge before them arrives. | `sim-spec.md` 10.6 |
| Lob | A delivery that lands on its locked hexes a fixed time after the release, whatever the distance. | `sim-spec.md` 10.6 |
| Dash | Fast movement to a chosen hex, from an ability or a trait at tick 0. The umbrella term for leaps and charges too. | `sim-spec.md` 10.4 |
| Charge | (1) An ability's ride along a line, striking each enemy on it as it reaches them (`dashThroughLine`). (2) A Rider's dash next to its target at tick 0. See section 11. | `sim-spec.md` 10.6, 12.3 |
| Leap | A Burglar's dash next to its target at tick 0. See section 11. | `sim-spec.md` 12.3 |
| Set off | To start a dash or charge: the unit's hex becomes the destination. | `sim-spec.md` 10.4 |
| Arrive | To finish a dash. What waits on the dash lands then. | `sim-spec.md` 10.6 |
| Caster's part | The cast up to the release, the dash's arrival, the charge's last hex or the last hit, whichever comes last. | `sim-spec.md` 10.6 |
| Recovery | The short time after the caster's part during which the caster is still busy. | `sim-spec.md` 10.6 |
| Ready (unit) | The tick a caster or dasher acts again, after its recovery. See section 11. | `sim-spec.md` 10.6 |
| Ability step | One part of an ability: a selector and its effects. See *step* in section 11. | `sim-spec.md` 10.3 |
| Selector | What an ability step picks at the cast: a unit selector or a hex selector. | `sim-spec.md` 10.3 |
| Unit selector | A selector that locks units, which the ability step reaches wherever they now stand. | `sim-spec.md` 10.3 |
| Hex selector | A selector that locks hexes, reaching the units standing on them when the ability step lands. | `sim-spec.md` 10.3 |
| Lock | To fix, at the cast, the units or hexes an ability step will reach. | `sim-spec.md` 10.3, 10.6 |
| Effect | What a step does to each unit it reaches: damage, stun, slow, shield, heal, buff, reduction, untargetable, stun immunity, dash, summon or delay. | `sim-spec.md` 10.3 |
| Reach | For an ability step, to arrive at a locked unit or hex and apply its effects. | `sim-spec.md` 10.6 |
| Missed | A locked unit that an ability step doesn't reach, because it has died or, for an enemy, become untargetable, or because it stepped out of a locked hex. See section 11. | `sim-spec.md` 10.6 |
| Multi-hit | A damage effect with several hits, 3 ticks apart: Volley, Flurry and My precious. | `sim-spec.md` 10.6 |
| Struck, loosed | A multi-hit's hit leaving the caster: struck for a blow, loosed for an arrow. | `sim-spec.md` 10.6 |
| Delayed step | A step that runs a set time after the release, and selects when it runs. | `sim-spec.md` 10.6 |
| Aims | What a `cast` event says each ability step locked and when it lands, so the client can show it. | `sim-spec.md` 14 |
| Passive | An always-on rule attached to a unit (the Witch-king's). | `sim-spec.md` 10.3 |
| D, S, H | The base values for ability damage, shields and heals. An ability's number is a multiple of one. | `design.md` 5; `sim-spec.md` 10.2 |
| Cost factor, star factor | The multipliers that scale an ability's value by the unit's cost and star level. | `sim-spec.md` 10.2 |
| Summon | A unit created during a fight: Orc grunts and the Eye's Nazgûl. Summons don't count towards traits or as survivors. Also the effect that creates one. | `sim-spec.md` 7.5, 10.3, 12.6 |
| Monster | A unit on a PvE board: no traits, always 1★, stats given directly. | `sim-spec.md` 7.6; `game-spec.md` 9.8 |

## 7. Statuses

| Term | Meaning | Defined in |
|---|---|---|
| Status | A timed state on a unit: stun, stun immunity, slow, reduction, buff or untargetable. Shields follow their own rules. | `sim-spec.md` 12.1 |
| Stun | No moving, attacking or casting. Moves, wind-ups, dashes and charges already under way still finish. | `sim-spec.md` 12.1 |
| Stun immunity | New stuns are ignored. | `sim-spec.md` 12.1 |
| Slow | Lower Attack Speed. Only the strongest slow applies. | `sim-spec.md` 12.1 |
| Reduction (Armor, Magic Resist) | A status lowering Armor or Magic Resist by a percent. Only the strongest of each applies. See section 11. | `sim-spec.md` 12.1 |
| Buff | A timed stat bonus. Buffs add together. | `sim-spec.md` 12.1 |
| Fight-long | Lasting until the fight ends, with no expiry tick. | `sim-spec.md` 12.4 |
| Shield | An amount that absorbs damage before Health, with its own expiry. | `sim-spec.md` 12.1 |
| Untargetable | Can't be chosen as a target or hit by enemy abilities, and blows and projectiles at it are wasted. | `sim-spec.md` 12.1 |
| Targetable | Not untargetable, as the attacker's side sees it. The One Ring's bearer is targetable to the Eye's Nazgûl, and an ally to its bearer in Betrayal. | `sim-spec.md` 9 |
| Invisible | The One Ring's untargetability on its bearer at the start of a fight. The Eye's Nazgûl sees through it. | `design.md` 9; `sim-spec.md` 12.6 |
| Expiry | The tick a status or shield is removed: at the start of that tick. | `sim-spec.md` 12.1 |
| Continuous effect | An effect on units within a radius of a living source, updated every tick: the Nazgûl slow, the Phial of Galadriel and Narya. Called *auras* in code (`combat/modifiers.ts`). | `sim-spec.md` 12.3, 12.4, 12.7 |

## 8. Traits

| Term | Meaning | Defined in |
|---|---|---|
| Trait | An origin or a class, with bonuses at breakpoints. | `design.md` 4 |
| Origin | A unit's race or faction trait. Each unit has one. | `design.md` 4 |
| Class | A unit's role trait. Each unit has one or two. | `design.md` 4 |
| Unique trait | An origin with one unit and one breakpoint: Ent and Dark Lord. | `design.md` 4 |
| Count (trait) | The number of distinct unit ids on a team with the trait, plus one for each crest. A unit id also has Nazgûl if any copy of it on the board wears a Ring of the Nine. Summons and monsters don't count. | `sim-spec.md` 12.2 |
| Breakpoint | A count at which a trait's bonus starts or grows. | `design.md` 4 |
| Active | A trait whose count has reached its first breakpoint. | `sim-spec.md` 12.2 |
| Trait level | Which of a trait's breakpoints is active. See *level* in section 11. | `sim-spec.md` 12.2, 14 |
| Crest | A Gift that counts as one more unit towards a trait, as long as the team has at least one unit with it. | `design.md` 9; `sim-spec.md` 12.2 |
| Orc grunt | The Orc trait's and Gothmog's summon. | `sim-spec.md` 7.5 |

## 9. Items, Gifts and rings

| Term | Meaning | Defined in |
|---|---|---|
| Item | A component, a combined item or a Ring of Power. A unit holds up to 3. | `design.md` 6 |
| Component | One of the six basic items. | `design.md` 6 |
| Combined item | An item made from two components by a recipe. | `design.md` 6 |
| Recipe | The pair of components that makes a combined item. | `design.md` 6 |
| Lone component | A component on a unit that hasn't yet combined. A unit never holds more than one. | `design.md` 6 |
| Holder (item) | The unit that holds an item. See section 11. | `sim-spec.md` 12.4 |
| Player's items | The items a player holds that aren't on a unit. | `game-spec.md` 5, 7.7 |
| Give (an item) | To move an item from the player's items onto a unit. Only selling the unit takes it off again. | `game-spec.md` 7.7 |
| Gift | One of the Gifts of Lothlórien: a lasting bonus a player picks. | `design.md` 9 |
| Tier (Gift) | Silver, Gold or Mithril. See *tier* in section 11. | `design.md` 9 |
| Offer | The 3 Gifts of a tier a player chooses between. | `game-spec.md` 9.10 |
| Pick | To take one option: a Gift from an offer, or a unit from a Council. | `game-spec.md` 9.6, 9.10 |
| Automatic pick | A random pick made for a player who hasn't picked when time runs out. It never takes the One Ring. | `game-spec.md` 9.6, 9.10 |
| The One Ring, the Ring | The single Ring per game that grows stronger and more dangerous the longer it is worn. | `design.md` 9 |
| Holder (One Ring) | The player who has the One Ring. See section 11. | `game-spec.md` 9.11 |
| Bearer | The unit that wears the One Ring, or a Ring of Power. | `design.md` 9; `sim-spec.md` 12.6, 12.7 |
| Ring state | Where the One Ring is: waiting for a Council, offered in one, held by a player, or destroyed. | `game-spec.md` 9.11 |
| Corruption | The One Ring's counter, rising in the rounds it has a bearer, every other round for a Hobbit bearer. It belongs to the Ring, not the unit. | `design.md` 9; `game-spec.md` 9.11 |
| Corruption tier | One of the bands of Corruption: Boon, Burden, Grip, Betrayal and Consumed. | `design.md` 9 |
| Drawback level | The Corruption the drawbacks act at: the Corruption, or 2 lower with Sam next to the bearer. See *level* in section 11. | `sim-spec.md` 12.6 |
| Equip itself | A held Ring with no bearer going to a random unit on the holder's board before the fights. | `game-spec.md` 9.11 |
| The Eye's Nazgûl | The summon the other team gets in a fight against the One Ring's bearer. | `sim-spec.md` 12.6 |
| Destroyed, stolen, consumed | The ways the One Ring leaves a holder: thrown into Mount Doom, taken by an opponent's surviving Gollum, or eating its bearer at full Corruption. | `design.md` 9; `game-spec.md` 9.11 |
| Ring of Power | One of the Three, the Seven or the Nine: an item that takes an item slot, never combines, and at most one per unit. The One Ring is not a Ring of Power. | `design.md` 9 |
| Wear | To hold a ring as an item (for a Ring of Power) or bear it (for the One Ring). | `design.md` 9 |
| Kin | The origins a Ring of Power favours: Elf and Istari for the Three, Dwarf for the Seven. | `design.md` 9 |
| Supply | The Rings of Power not on a Council option, in a player's items or on a unit. | `game-spec.md` 9.12 |

## 10. Online play and the client

| Term | Meaning | Defined in |
|---|---|---|
| Lobby | A group of 8 seats that people join with a code before a game. | `server-spec.md` 7 |
| Lobby host | The person who created the lobby and can start it. See *host* in section 11. | `server-spec.md` 2 |
| `Host` | The interface that gives the browser-safe server code its time and randomness. See section 11. | `server-spec.md` 4 |
| Seat | One of a lobby's or game's player positions, numbered from 0. A person or a bot plays it. | `server-spec.md` 5.2 |
| Match runner, match | What runs one game online or offline: its steps, timers, bots and Ready votes (`Match`). | `server-spec.md` 5 |
| Match step | What the match is in: `council`, `planning`, `fight` or `over`. See *step* in section 11. | `server-spec.md` 5.1 |
| Ready (vote) | A person's vote to end the current match step early. See section 11. | `server-spec.md` 5.1 |
| View | What one seat is sent of the game, without the hidden information. | `server-spec.md` 6 |
| Arena (client) | The scenery round the board in the viewer, such as the ruins. See section 11. | `viewer-spec.md` 3 |
| Model | A unit's 3D model for its star level. | `viewer-spec.md` 4 |
| Pawn | A placeholder shape drawn for monsters, summons and units whose model is missing or still loading. | `viewer-spec.md` 4 |
| Livery | The colour a unit's `team` material is painted: its faction's or its own, the same on both sides. | `viewer-spec.md` 4 |

---

## 11. Words to qualify

Each of these words has more than one meaning, so the docs always say it as the second column does. Bare words not listed here mean what sections 1 to 10 say.

| Word | How to say it |
|---|---|
| **slot** | A **bench slot**, **shop slot** or **item slot**. A unit's rank in the action order is its **action slot** (`slot` in code), and the order it sets is **action-slot order**. |
| **step** | **Move** for one hex of movement, and as the verb (the event is `move`). **Ability step** for a part of an ability; in `sim-spec.md` sections 10.3 to 10.6 and the aims, *step* alone means one. **Match step** for `council`, `planning`, `fight` or `over`; in `server-spec.md` section 5, *step* alone means one. Otherwise *step* is a numbered step of a list, such as the tick loop's (`sim-spec.md` 6.4). |
| **level** | Bare *level* is a player's level. Otherwise **star level**, **trait level** or **drawback level**. |
| **placement** | A unit put on the board for a fight (`PlacedUnit`). A player's rank is their **final place**, though the code calls it `placement`. |
| **board** | In a fight, the whole 7 × 8 grid; one team's part of it is its **half**. In the game layer, **a player's board** is their half. The **arena** is only the scenery round the board. |
| **charge** | An ability's ride along a line (`dashThroughLine`). The Rider trait's dash next to its target at tick 0 is a **Rider charge**. |
| **leap** | Only a Burglar's dash at tick 0. An ability that moves its caster next to a unit **dashes**. |
| **wasted, missed, dodged** | **Wasted** for a basic attack's blow or projectile that doesn't land, **missed** for a locked unit or hex an ability step doesn't reach, **dodged** for a successful dodge roll. |
| **reduction** | A **damage reduction** (the Witch-king's passive, the Mithril Shirt), or an **Armor reduction** or **Magic Resist reduction** (a status). What Armor and Magic Resist do to damage in the pipeline is **resists**. |
| **range, radius, reach** | **In range** for a target within the unit's Range. **Within *n* hexes**, or **within its radius**, for an area or a continuous effect. *Reach* is a verb: an ability step, heal or shield arriving at a unit, or a unit able to get within range of an enemy. |
| **holder, bearer** | An item's **holder** is the unit holding it. The One Ring's **holder** is the player who has it. The unit wearing the One Ring or a Ring of Power is its **bearer**, never its holder. |
| **tier** | **Cost tier**, **Gift tier** (Silver, Gold, Mithril) or **Corruption tier** (Boon to Consumed). |
| **ready** | A unit is **ready** when it can act again after a cast or dash (`readyTick`). An attack's **cooldown is up**. A person's **Ready vote** is capitalised. |
| **host** | The **lobby host** is a person. **`Host`**, in code format, is the interface for time and randomness. |
| **unit, id** | A **unit id** names a unit's definition, such as `gimli`. An **owned unit** is one a player has, with its own numeric id. A unit in a fight has a **fight id**. Where it matters, say whether summons and monsters count. |
| **fight, combat** | **Fight** in prose. *Combat* only in code names and the phrase *combat start*. |

These stay as they are, since the context always tells them apart: **copy** (a unit a player owns at any star level, or a unit's worth of the pool, so a 2★ unit is 3 copies), **lock** (the shop lock, or an ability step fixing what it will reach at the cast), **roll** (a shop roll, or a roll against a chance), **draw** (a fight's outcome, or a random draw), **Health** and **HP** (a unit's and a player's), and **invisible** (only the One Ring's untargetability) and **untargetable** (everything else).
