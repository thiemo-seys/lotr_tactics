# Combat Simulation Spec

Implementation spec for the `sim` package's combat simulation. It turns the rules in [`design.md`](design.md) (sections 4, 5 and 7) into exact behaviour.

- `design.md` is the source of truth for game rules and content. This spec adds the implementation detail and the defaults needed to build it.
- Every number here is a *placeholder* to be tuned during balancing. Keep numbers in data files, not in logic.

---

## 1. Scope

**In scope for the first milestone**

- Simulating one fight between two boards, from placement to result.
- Hex board, movement, targeting, basic attacks, crit and dodge, damage, mana, abilities, statuses.
- All 16 traits and all 36 unit abilities.
- Star levels.
- Determinism and a per-tick event log for rendering.
- Headless tests.

**Out of scope (later milestones)**

- Shop, economy, levels and rounds (`design.md` sections 8–9). These will also live in `sim`, but not yet.
- Items: not designed yet. Keep an empty `items` field on placed units and an on-hit hook, but implement no items.
- PvE enemies: not designed yet. A PvE round is just a board of monster units, so the sim needs nothing special beyond the Large tag.
- Rendering (`client`) and networking (`server`).

---

## 2. Defaults set by this spec

These are not in `design.md` yet. They were chosen to remove ambiguity and can be changed.

| Topic | Default |
|---|---|
| Hex layout | Odd-r offset grid, 7 columns × 8 rows |
| Action order | Units act one at a time in a fixed order; which team goes first alternates every tick |
| Movement | 15 ticks per hex; position updates at the start of the step |
| Projectiles | Ranged attacks only; 12 hexes per second |
| Mana from damage taken | 6% of post-reduction damage taken, rounded down, max 15 per hit |
| Cast time | 15 ticks; ability effects apply at the start of the cast |
| Dashes and leaps | Instant in the sim (the renderer animates them); unit is busy for 9 ticks after |
| Overtime | +10% damage per full second of overtime |
| Attack Speed limits | Minimum 0.2, maximum 5.0 |
| Dodge limit | Maximum 60% |
| Orc grunts | Health 300 + 100 per stage after 1; Attack Damage 30 + 10 per stage after 1 |
| Random generator | mulberry32 |

---

## 3. Package and tooling

- TypeScript monorepo; this milestone only creates `packages/sim`.
- Tooling: pnpm workspaces, TypeScript `strict`, ES modules, Vitest, and ESLint, which enforces the section 4 rules in `packages/sim/src`.
- `sim` has **no runtime dependencies** and uses no DOM or Node APIs, so the same code runs in the browser and on the server.
- Suggested layout:

```
packages/sim/
  src/
    hex.ts            coordinates, distance, neighbours, lines, cones, mirroring
    rng.ts            seeded random generator
    types.ts          shared types such as Team and Star
    data/
      rules.ts        combat numbers not tied to a unit or trait (timing, mana, limits, ability scaling)
      templates.ts    stat templates
      traits.ts       trait definitions and numbers
      units.ts        unit definitions and abilities
    combat/
      combat.ts       createCombat / step / result
      stats.ts        stat derivation and modifiers
      targeting.ts
      movement.ts
      damage.ts
      abilities.ts    ability executor (selectors and effects)
      traits.ts       trait hooks
      events.ts       event types
    index.ts
  test/
```

---

## 4. Determinism rules

The server runs the fight with authority, and the client replays it from the same input, so both must produce identical results.

- Never use `Math.random`, `Date`, `performance.now` or anything time-based. Use only the seeded generator.
- In game logic, use only `+ - * /`, `Math.floor/ceil/round/trunc/min/max/abs/sqrt` and `Math.imul`. Do **not** use `Math.sin/cos/tan/atan2/exp/log/pow` (their results can differ between JavaScript engines).
- Every sort must have a complete tie-break, so no two items ever compare as equal.
- Iterate units in the defined action order (section 6.3), never in an incidental order.
- Round damage, healing and shields to whole numbers when they are applied.
- Mana is always a whole number (section 10.1).
- Data stores percentages and multipliers as whole-number percents: 25 for 25%, 180 for ×1.8, 70 for 0.7 D. Formulas multiply the whole numbers and divide once at the end. A result that should be exactly x.5 then is exactly x.5 and rounds as it would by hand; with decimals such as 1.15 it can come out as x.4999… and round down.

### Random generator

mulberry32, seeded with the combat's 32-bit `seed`:

```ts
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

A roll succeeds when `rng() < chance`. Currently only dodge and crit use the generator.

---

## 5. Board and coordinates

### Layout

- 7 columns × 8 rows, odd-r offset (odd rows are shifted half a hex to the right).
- Team A holds board rows 0–3; team B holds board rows 4–7. Rows 3 and 4 are the front lines.

### Placement input

Each team places units in its **own perspective**: column 0–6 from left to right, row 0 = back row, row 3 = front row.

| Team | Own (col, row) → board (col, row) |
|---|---|
| A | (c, r) → (c, r) |
| B | (c, r) → (6 − c, 7 − r) |

The B mapping is a 180° rotation of the hex grid, so adjacency and distances are preserved and both sides are exact mirrors.

### Axial coordinates

Use axial (q, r) internally for maths:

- offset → axial: `q = col − (row − (row & 1)) / 2`, `r = row`
- axial → offset: `col = q + (r − (r & 1)) / 2`, `row = r`
- distance: `(|dq| + |dr| + |dq + dr|) / 2`
- neighbour directions, in order: `(+1, 0), (+1, −1), (0, −1), (−1, 0), (−1, +1), (0, +1)`

### Perspective rule

**All geometric choices are made in the acting team's own perspective.** For team B, convert positions into its mirrored coordinates, make the choice, then convert back. This applies to:

- tie-breaks
- neighbour order in pathfinding
- facing direction
- lines and cones

As a result, a board fighting its own mirror image behaves identically on both sides.

### Tie-break order

When candidates tie, prefer in this order:

1. lower row, then lower column, in the acting team's perspective
2. lower unit `slot` (section 6.3)

---

## 6. Time and tick loop

### 6.1 Timing

- 30 ticks per second. Data stores durations in seconds; convert with `Math.round(seconds × 30)`.
- Normal time: ticks 0–899 (30 s). Overtime: ticks 900–1349 (15 s).
- If the fight hasn't ended after tick 1349, the outcome is a draw.

### 6.2 Tick 0: combat start

Tick 0 only sets up the fight; units start acting at tick 1.

1. Create units with derived stats (section 7), including static trait bonuses.
2. **Gondor:** front-row bonus for allies in their team's row 3.
3. **Guardian:** shields.
4. **Orc:** spawn grunts.
5. **Burglar:** leaps, in action order.
6. **Rider:** charges, in action order.

### 6.3 Action order

- Each unit has a **slot**: its rank within its team.
  - Initial units are ranked by own-perspective row (front first), then by column.
  - Summons get the next free slot when they spawn.
- Each tick, units act sorted by (slot, team). On even ticks team A goes first within each slot; on odd ticks team B goes first.
- Each unit also has a unique numeric `id` for identity and events.

### 6.4 Each tick (from tick 1)

1. **Expire** statuses and shields whose `expiresTick` is the current tick.
2. **Resolve the queue:** projectiles and delayed effects due this tick, ordered by due tick, then by creation order.
3. **Regeneration**, on ticks 30, 60, 90, …: Istari mana and Ent health (section 12).
4. **Act:** each living unit in action order. A unit that is stunned or busy (moving, casting, recovering from a dash) does nothing. Otherwise:
   1. If mana ≥ max mana: cast its ability (section 10).
   2. Else make sure it has a target (section 8).
   3. If the target is in range: basic attack when its cooldown is ready (section 9).
   4. Else: move one step (section 11).
5. **End check:** after every death, check whether a team has no living units left (section 13).

---

## 7. Units and stats

### 7.1 Unit definitions

From `design.md` section 5. Use plain ASCII ids:

`sam, merry, pippin, beregond, hama, grishnakh, sharku, gorbag, frodo, haldir, faramir, gamling, balin, lurtz, radagast, ringwraith, bilbo, gollum, gimli, boromir, eomer, eowyn, ugluk, khamul, legolas, elrond, aragorn, theoden, dain, saruman, gothmog, gandalf, galadriel, witch-king, treebeard, sauron`

Plus the summon `orc-grunt`.

Each definition holds:

- id, display name, cost
- origin and classes
- template: the role of its first class
- `large` flag: Treebeard and Sauron. Large units take up one hex like every other unit.
- optional stat tweaks, for the per-unit ±10% from `design.md` (none are set yet)
- ability

### 7.2 Stat templates

1★ values for a 1-cost unit:

| Template | Classes | Health | Attack Damage | Attack Speed | Range | Armor | Magic Resist | Mana start / max |
|---|---|---|---|---|---|---|---|---|
| Tank | Guardian | 650 | 45 | 0.60 | 1 | 40 | 40 | 30 / 90 |
| Fighter | Rider, Captain | 600 | 55 | 0.70 | 1 | 30 | 30 | 0 / 60 |
| Skirmisher | Burglar | 500 | 55 | 0.80 | 1 | 20 | 20 | 0 / 50 |
| Archer | Archer | 450 | 50 | 0.75 | 4 | 15 | 15 | 0 / 60 |
| Caster | Sorcerer | 450 | 35 | 0.65 | 4 | 15 | 15 | 20 / 70 |

Every unit also has Ability Power 100, Crit Chance 25%, Crit Damage 140% and Dodge 0%.

### 7.3 Deriving base stats

- **Health and Attack Damage:** template × (1 + 0.15 × (cost − 1)) × 1.8^(star − 1). Round to whole numbers.
  - Compute 1.8^(star − 1) as a lookup `[1, 1.8, 3.24]`, not with `Math.pow`.
- **Armor and Magic Resist:** template + 5 × (cost − 1).
- **Attack Speed, Range and Mana:** taken from the template unchanged.
- Apply stat tweaks last, before rounding.

### 7.4 Final stats with modifiers

| Stat | Formula |
|---|---|
| Max Health | base + flat bonuses (e.g. Hobbit) |
| Attack Damage | base × (1 + sum of % bonuses) |
| Attack Speed | base × (1 + sum of % bonuses) × (1 − strongest slow), clamped to 0.2–5.0 |
| Armor / Magic Resist | (base + flat bonuses) × (1 − strongest reduction) |
| Ability Power | 100 + flat bonuses |
| Crit Chance | 25% + bonuses, max 100% |
| Crit Damage | 140% + bonuses |
| Dodge | 0% + bonuses, max 60% |

Units start each fight at full health.

### 7.5 Orc grunt

A summon with:

- Orc origin, no classes, no ability, no mana
- Health 300 + 100 × (stage − 1)
- Attack Damage 30 + 10 × (stage − 1)
- Attack Speed 0.7, range 1, Armor and Magic Resist 20

Grunts don't count toward traits and don't count as survivors for player damage. They do count as living units for ending the fight, and they receive the Dark Lord bonus.

---

## 8. Targeting

### Choosing a target

- **Default:** the nearest targetable enemy by hex distance, with the tie-break from section 5.
- **Burglars:** the farthest targetable enemy.
- **Hobbit rule:**
  - While choosing, enemies skip any Hobbit that currently has a non-Hobbit ally next to it.
  - If every candidate would be skipped, ignore the rule.

### Keeping a target

A unit keeps its target until the target dies or becomes untargetable.

### Unreachable targets

If a unit can't find a path to any hex within range of its target, it switches to the nearest enemy it can reach. If it can't reach any enemy, it waits.

### Abilities

Abilities that dash to a specific enemy (Grishnákh, the Witch-king) make that enemy the caster's new target.

---

## 9. Basic attacks

- **In range:** hex distance to the target ≤ Range.
- **Cooldown:**
  - The first attack is ready at tick 1.
  - After each attack, the next one is ready at `now + 30 / AttackSpeed` ticks.
  - Keep this as a fraction and compare with `≥`.
- **When an attack fires:**
  - The attacker gains 10 mana.
  - Archers gain a stack (section 12).
- **Melee (Range 1):** resolves immediately.
- **Ranged (Range ≥ 2):**
  - Fires a projectile that resolves at `now + ceil(distance × 30 / 12)`.
  - If the target is dead or untargetable on arrival, the projectile is wasted.

### Resolving a hit

1. **Dodge:** if the target's Dodge > 0, roll. On success, emit `dodge` and stop. The attack deals no damage and triggers no on-hit effects.
2. **Crit:** roll against Crit Chance. On success, multiply the damage by Crit Damage.
3. **Damage:** run the damage pipeline (section 9.1) with the attacker's Attack Damage as physical damage.
4. **Defender mana:** the defender gains mana from the damage it took.

### 9.1 Damage pipeline

The same pipeline is used for attacks, abilities and trait damage.

```
raw        = attack: AttackDamage × (crit ? CritDamage : 1)
             ability: value (section 10.2, already includes Ability Power) × ability-specific multiplier (e.g. Éowyn ×2 vs Nazgûl)
             trait (Rider charge): flat value
amplified  = raw × (1 + sum of damage amps) × overtime
reduced    = physical: amplified × 100 / (100 + Armor)
             magic:    amplified × 100 / (100 + MagicResist)
             true:     amplified
final      = Math.round(reduced × (1 − target's damage reduction)), at least 0
```

- **Damage amps** add together:
  - Captain adjacency
  - Dark Lord
  - Dwarf against a Large target
- **Overtime** = 1 + 0.1 × floor((tick − 900) / 30) during overtime, otherwise 1.
- **Target's damage reduction:** the Witch-king's passive (50% against Gondor and Rohan sources other than Éowyn).
- **Shields** absorb `final` first, earliest-expiring shield first. The rest comes off Health.
- **Defender mana gain:**
  - `Math.floor(final × 6 / 100)`, where `final` is absorbed plus health damage, capped at 15 per hit.
  - Nobody gains mana from any source while casting.
- **Death:** at Health ≤ 0 the unit dies immediately.
  - Its hex is freed.
  - Emit `death` and run on-death hooks (Rohan).

### 9.2 Healing

- Applies to every heal: `heal`, `healFromDamage` and Ent regeneration.
- Round to a whole number when applied (section 4), then cap at max Health. Anything above max Health is lost.
- The `heal` event's `amount` is the Health actually restored. Emit no event if that is 0.

---

## 10. Mana and abilities

### 10.1 Casting

- Mana is always a whole number: start and max values, +10 per attack, damage mana rounded down (section 9.1) and Istari mana in whole amounts (section 12.3).
- Mana is capped at max mana; anything beyond is lost.
- **When mana ≥ max:** at its action step, a unit that isn't stunned or busy casts.
  - Mana resets to 0.
  - The ability's effects resolve immediately.
  - The unit is then busy for 15 ticks.
- **Missing target:** if the ability uses the current target and the unit has none, it first picks one (section 8).
- **Delayed steps** go into the queue (section 6.4), for example Frodo's strike.

### 10.2 Ability values

From `design.md` section 5. Each ability number in the table in section 10.5 is a multiple of one of three base values:

| Token | Meaning | Base |
|---|---|---|
| D | Damage | 200 |
| S | Shield | 250 |
| H | Heal | 200 |

- Value = multiple × base × cost factor × star factor × AbilityPower / 100.
  - Cost factor = 1 + 0.25 × (cost − 1).
  - Star factor = `[1, 1.5, 2.25]` for 1★ / 2★ / 3★.
- Ability Power is applied here only; the damage pipeline (section 9.1) does not apply it again.
- Durations, stun lengths and buff sizes do **not** scale with star level.
- Ability damage can't crit unless the ability says so.
- Ability shields last 4 seconds unless stated otherwise.

### 10.3 Building blocks

Model abilities as data: a list of steps, each with a **selector** (who or where) and **effects** (what happens). Only use custom code for something that genuinely doesn't fit.

**Selectors**

- `self`
- `target`
- `farthestEnemy`
- `lowestHealthEnemy`: lowest current Health
- `highestHealthEnemy`: highest current Health
- `nearestEnemies(n)`
- `nearestAlly`: excludes self
- `lowestHealthPctAllies(n)`
- `allAllies`
- `alliesWithin(r, origin?)`: includes self; with an origin, only allies of that origin (Gothmog)
- `adjacentAllies`
- `adjacentEnemies`
- `enemiesWithin(r)`: around self
- `area(r)`: around the selected hex or unit
- `line(n | edge)`
- `cone`
- `bounce(n, jump)`
- `bestClusterHex(r)`

**Effects**

- `damage(mult, type, hits = 1, canCrit = false)`
- `stun(s)`
- `slow(pct, s)`: reduces Attack Speed
- `shield(mult, s = 4)`
- `heal(mult)` and `healFromDamage(pct)`: capped at max Health (section 9.2)
- `buff(stat, amount, s)`
- `reduce(stats, pct, s)`: lowers Armor and/or Magic Resist
- `untargetable(s)`
- `stunImmune(s)`
- `dashAdjacentTo(unit)`
- `dashThroughLine`: with a `line(n)` selector, after the step's other effects (section 10.4)
- `summon(unitId, count)`: placed like Orc trait grunts (section 12.3), each on a free hex next to the caster on its own half, otherwise the nearest free hex on its own half. A summon with no free hex on its own half doesn't appear.
- `delay(s, steps)`: a step of its own that runs `steps` after `s` seconds, through the queue

**Passives:** always-on rules attached to the unit (the Witch-king).

### 10.4 Geometry definitions

All of these are computed in the caster's perspective (section 5).

**Line**
- Draw the hex line from the caster towards the target and extend it past the target.
- Use cube linear interpolation: step `i` of `N` is the rounded cube coordinate of `lerp(C, T', i / N)`.
  - `T' = C + (T − C) × k` with `k = ceil(16 / distance)`.
  - Add a small fixed nudge (`+1e-6, +2e-6, −3e-6`) before rounding.
- Take the hexes after the caster in order:
  - `line(n)` takes the first `n`, including any off the board (they hold no units).
  - `line(edge)` takes every hex that is on the board. A line running along the board's jagged side edge can step off the board and back on, so an off-board hex is skipped rather than ending the line.

**Facing direction**
- The neighbour direction whose hex is closest to the target.
- Ties go to the earlier direction in perspective order.

**Cone**
- With caster `C` and facing direction `f`, the cone is 6 hexes:
  - at distance 1: `C + Df`, `C + D(f−1)`, `C + D(f+1)`
  - at distance 2: `C + 2·Df`, `C + Df + D(f−1)`, `C + Df + D(f+1)`

**Bounce(n, jump)**
- Hits the current target first.
- Each next hit is the nearest enemy not yet hit within `jump` hexes of the last enemy hit.
- Stops after `n` hits or when no enemy is in range.

**bestClusterHex(r)**
- Every hex on the board, scored by the number of living enemies within `r`.
- The highest score wins. Ties go to the hex closest to the caster's target, then the section 5 tie-break.

**dashAdjacentTo(unit)**
- Move instantly to the free hex next to that unit that is closest to the caster.
- If none is free, move to the nearest free hex to that unit.
- If nothing is free, stay.

**dashThroughLine(n)**
- Hit every enemy on the first `n` line hexes.
- Then move to the farthest free hex among them, or stay if none is free.

**Free hex:** on the board, with no living unit on it and not claimed by a moving unit.

### 10.5 Ability parameters

The same numbers as `design.md` section 5, written as selectors and effects.

| Unit | Steps |
|---|---|
| **Sam** | `self` and `nearestAlly`: shield 0.6 S |
| **Merry** | `target`: damage 1.0 D physical; reduce Armor and Magic Resist by 30% for 4s |
| **Pippin** | `bounce(3, 3)` from target: damage 0.7 D physical each |
| **Beregond** | `target`: damage 1.0 D physical; stun 1s |
| **Háma** | `self`: shield 0.8 S; +30 Armor for 5s |
| **Grishnákh** | `lowestHealthEnemy`: dash next to it; damage 1.2 D physical |
| **Sharku** | `target`: damage 1.0 D physical; slow 30% for 3s |
| **Gorbag** | `target`: damage 0.4 D physical × 3 hits |
| **Frodo** | `self`: untargetable 2s; after 2s, `target`: damage 1.3 D physical |
| **Haldir** | `nearestEnemies(3)`: damage 0.7 D physical each |
| **Faramir** | `farthestEnemy`: damage 1.5 D physical |
| **Gamling** | `alliesWithin(2)`: +30% Attack Speed for 4s |
| **Balin** | `self` and `adjacentAllies`: shield 0.6 S each |
| **Lurtz** | `line(edge)` through target: damage 1.0 D physical to each enemy |
| **Radagast** | `area(1)` around target: damage 0.8 D magic; slow 25% for 3s |
| **Ringwraith** | `target`: damage 1.0 D magic; stun 1.5s |
| **Bilbo** | `target`: stun 2s; damage 1.0 D physical |
| **Gollum** | `target`: damage 0.4 D physical × 3 hits; heal self for 50% of the damage dealt |
| **Gimli** | `adjacentEnemies`: damage 0.9 D physical; `self`: shield 0.6 S |
| **Boromir** | `alliesWithin(2)`: +25 Armor and Magic Resist for 5s; `self`: shield 1.0 S |
| **Éomer** | `line(4)` through target: damage 1.0 D physical |
| **Éowyn** | `self`: shield 0.6 S; `target`: damage 1.2 D physical, ×2 against Nazgûl-origin targets |
| **Uglúk** | `self`: shield 1.0 S; stun immunity for 4s |
| **Khamûl** | `dashThroughLine(3)`: damage 0.9 D magic; slow 25% for 3s |
| **Legolas** | `target`: damage 0.3 D physical × 5 hits; each hit can crit |
| **Elrond** | `lowestHealthPctAllies(2)`: heal 1.0 H; +30 Magic Resist for 4s |
| **Aragorn** | `target`: damage 1.3 D physical; `alliesWithin(2)`: +25% Attack Damage for 4s |
| **Théoden** | `dashThroughLine(3)`: damage 1.0 D physical; stun 1s |
| **Dáin** | `adjacentEnemies`: damage 0.9 D physical; stun 1.5s |
| **Saruman** | `area(1)` around `farthestEnemy`: damage 1.2 D magic |
| **Gothmog** | `summon(orc-grunt, 2)` (placement in section 10.3); Orc-origin `alliesWithin(2)`: +25% Attack Damage for 5s |
| **Gandalf** | `area(2)` around target: damage 1.0 D magic; stun 2s |
| **Galadriel** | `allAllies`: shield 0.5 S; `enemiesWithin(3)`: damage 0.8 D magic |
| **Witch-king** | `highestHealthEnemy`: dash next to it; `adjacentEnemies`: damage 1.0 D magic; slow 30% for 3s. **Passive:** takes 50% less damage from Gondor- and Rohan-origin sources, except Éowyn |
| **Treebeard** | `area(1)` around `bestClusterHex(1)`: damage 1.0 D physical; stun 1.5s |
| **Sauron** | `cone`: damage 1.2 D physical; stun 1s |

---

## 11. Movement

- A unit out of range of its target moves one hex per step. Each step takes 15 ticks, and the unit is busy for that time.
- **Pathfinding:**
  - Breadth-first search over free hexes from the unit's hex.
  - Neighbours are visited in perspective direction order.
  - The goal is the first hex found, at the smallest depth, that is within Range of the target.
  - The unit steps to the first hex on that path.
- **Claiming:** when a step starts, the unit's position becomes the destination immediately. The old hex is freed and the new hex is occupied, so two units can never move onto the same hex. The renderer animates over the 15 ticks.
- **Re-planning:** the path is recomputed at every step, because targets move.
- **No path:** see section 8.

---

## 12. Statuses and traits

### 12.1 Statuses

| Status | Rule |
|---|---|
| Stun | No moving, attacking or casting. A new stun extends the current one only if it lasts longer. A move already in progress completes. |
| Stun immunity | New stuns are ignored. |
| Slow | Only the strongest active slow applies. |
| Armor / Magic Resist reduction | Only the strongest active reduction per stat applies. |
| Buff | Buffs add together; each has its own duration. |
| Shield | Separate instances, each with its own amount and expiry. |
| Untargetable | Can't be chosen as a target. Enemies currently targeting it drop it and choose again. Projectiles at it are wasted. |

### 12.2 Trait counting

- At tick 0, count **distinct unit ids** per trait among non-summon units. Each unit counts once per trait however many copies are on the board.
- The highest breakpoint reached is active.
- Trait values do not scale with Ability Power.

### 12.3 Trait behaviour

Numbers are from `design.md` section 4. Where a trait lists several values, they apply at each breakpoint in turn.

| Trait | When | Behaviour |
|---|---|---|
| Hobbit | Tick 0; targeting | Hobbits gain flat max Health. The targeting rule is in section 8. |
| Elf | Static | Elves gain Attack Speed %; at 4, also +20% Dodge. |
| Dwarf | Static; damage | Dwarves gain flat Armor and a damage amp against Large targets. |
| Gondor | Tick 0 | All allies standing in their team's row 3 gain flat Armor and Magic Resist for the whole fight. |
| Rohan | On death | When a non-summon Rohan unit dies, every other living Rohan ally gains a permanent Attack Speed % buff (stacks). |
| Istari | Every 30 ticks | Istari gain the trait's mana per second in one go, on ticks 30, 60, 90, … A unit that is casting on that tick gets none. |
| Orc | Tick 0 | Spawn 1 / 2 / 4 grunts. Spread them round-robin across Orc units in slot order, each on a free hex next to that Orc on its own half. Otherwise use the nearest free hex on its own half. |
| Nazgûl | Continuous | Enemies within 2 hexes of any living Nazgûl are slowed. It doesn't stack with itself; the strongest-slow rule applies. |
| Ent | Every 30 ticks | Treebeard heals 2% of max Health. He is Large. |
| Dark Lord | Damage | Allies with Orc or Nazgûl origin, including grunts, get a +15% damage amp. Sauron is Large. |
| Guardian | Tick 0 | Guardians gain a shield that lasts 8 seconds. |
| Archer | On attack | Each basic attack an Archer fires gives it an Attack Speed % stack for the rest of the fight, up to 15 stacks. |
| Rider | Tick 0 | Each Rider picks its target (nearest enemy), dashes next to it and deals the bonus physical damage. This trait damage can't crit or be dodged. The Rider is then busy for 9 ticks. |
| Burglar | Tick 0; targeting | Each Burglar dashes next to the farthest enemy and is busy for 9 ticks. Burglars gain Crit Damage and use farthest-enemy targeting. |
| Captain | Damage | A unit that deals damage while standing next to an allied Captain (not itself) gets the damage amp. Several Captains don't stack. |
| Sorcerer | Static | Sorcerers gain flat Ability Power. |

---

## 13. End of combat and result

- After every death, if a team has no living units (summons count), the fight ends immediately and the other team wins. Nothing else is processed.
- If tick 1349 finishes with both teams alive, the outcome is a draw. Both players take damage outside the sim.
- **The result contains:**
  - the outcome: `A`, `B` or `draw`
  - for each team, the surviving **non-summon** units with unit id and star level (the round system uses this for player damage)
  - the final tick
  - the event log

---

## 14. API

```ts
type Team = 'A' | 'B';

interface PlacedUnit {
  unitId: string;
  star: 1 | 2 | 3;
  col: number;        // 0–6, own perspective
  row: number;        // 0 = back, 3 = front, own perspective
  items: string[];    // empty for now
}

interface CombatInput {
  seed: number;       // 32-bit integer
  stage: number;      // affects Orc grunt stats
  teams: { A: PlacedUnit[]; B: PlacedUnit[] };
}

interface CombatResult {
  outcome: Team | 'draw';
  survivors: { A: { unitId: string; star: number }[]; B: { unitId: string; star: number }[] };
  finalTick: number;
  events: CombatEvent[];
}

interface Combat {
  readonly tick: number;
  readonly state: CombatState;   // units, positions, health, mana, statuses (read-only for the renderer)
  step(): CombatEvent[];         // advance one tick, return that tick's events
  isOver(): boolean;
  result(): CombatResult;
}

function createCombat(input: CombatInput): Combat;
function simulateCombat(input: CombatInput): CombatResult;   // runs to the end
```

The client creates the same combat and calls `step()` once per tick, reading `state` for health and mana bars and using events for animations.

### Events

Every event has a `tick`.

| Event | Fields |
|---|---|
| `spawn` | unit, unitId, team, hex, star, summon |
| `move` | unit, from, to, arriveTick |
| `dash` | unit, from, to |
| `attack` | unit, target, ranged, hitTick |
| `dodge` | unit (defender), source |
| `damage` | source, target, amount, absorbed, type, crit, kind (`attack`, `ability` or `trait`) |
| `heal` | source, target, amount |
| `shield` | source, target, amount, expiresTick |
| `cast` | unit, ability |
| `status` | target, status, expiresTick, value |
| `death` | unit |
| `end` | outcome |

---

## 15. Tests and acceptance criteria

**Hex maths**
- Offset ↔ axial conversion, distance and neighbours.
- The B mirror mapping is a rotation: it preserves adjacency and distance.
- Lines and cones produce the expected hexes.

**Movement**
- Pathing around blockers.
- No two units on one hex.
- Switching target when the current target is unreachable; waiting when nothing is reachable.

**Targeting**
- Nearest enemy, with tie-breaks.
- Hobbit rule, including the fallback when every candidate is skipped.
- Burglar farthest-enemy targeting.
- Choosing again after the target becomes untargetable.

**Attacks and damage**
- Attack cooldown timing.
- Projectile travel and wasted projectiles.
- Resolution order (dodge → crit → reduction → damage → mana).
- Armor and Magic Resist formula; damage amps; overtime multiplier; shields absorbing first; Witch-king reduction.

**Mana**
- Gain per attack and per hit, including rounding down and the cap.
- Istari gain mana only on ticks 30, 60, 90, …, and none if they are casting on that tick.
- No gain while casting.
- Casting at full mana, resetting to 0, busy for 15 ticks.

**Stars and stats**
- Derived stats for a sample unit at each star level match section 7.

**Traits**
- Each trait at each breakpoint.
- Duplicate units count once; summons don't count.

**Abilities**
- Ability values for a sample unit at each star level match section 10.2, and extra Ability Power scales them once (+80 Ability Power → ×1.8).
- Healing stops at max Health, and the `heal` event reports only the Health restored.
- Gothmog's grunts go next to him on his own half, fall back to the nearest free hex on his half, and don't appear when his half is full.
- One scripted scenario per unit, checking targets, damage and statuses.

**End of combat**
- A team wipe ends the fight immediately.
- Draw at the time limit.
- Survivor list excludes summons.

**Determinism**
- The same input gives an identical event log; compare a hash of the log.
- A different seed can give a different result when crits or dodges are involved.

**Fairness**
- A board fighting its own mirror wins close to 50% over 1,000 seeds.

**Performance**
- A 9 v 9 fight to completion should take well under 10 ms in Node, so bots can run thousands of games for balancing.
