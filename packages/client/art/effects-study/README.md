# Ability-effects study

How abilities, hits and statuses should look in fights, tried in two styles on five abilities with the game's arena, board, lights, grade and rigged models. Fights today feel flat: an ability's effects land on the tick it is cast, a dash takes 4 ticks, a cast shows only a ring and its name, and statuses other than stuns show only on the label. The user has agreed that abilities can get **wind-up and travel time in the sim**; this study is for choosing the **tone** of what is drawn. Audio comes later, once this is chosen.

**Status:** open, for the user to choose a style, or a mix (below).

The timelines here are scripted, not sim fights: they show the proposed timings before the sim has them.

## The two styles

| | Grounded | Punchy |
|---|---|---|
| Feel | the films: physical, warm, restrained | a readable auto battler: bright, bold, every hit sells |
| Projectiles | a wooden arrow with a faint streak; a fireball with smoke | a glowing arrow with a long gold streak; a big fireball with a thick trail |
| Wind-up | the cast clip, a modest glow at a staff or horn | the same, with the target hexes lit and pulsing, or an aim line |
| Impact | dust, debris, smoke, a scorch, light from the fire | additive bursts, shockwave rings, the hexes flashing, a screen flash |
| Hits | a short warm flash, a small push back | a white flash, a bigger push, squash and stretch, a draining chunk on the health bar |
| Big moments | no freeze, no shake | 80 ms hit-stop and a camera shake |
| Stuns | the stun clip, a few faint motes | gold stars circling the head |
| Buffs | a warm glint and a few rising motes | chevrons rising in the stats' colours, a lasting ring under the unit |
| Shields | a faint faceted shell | a bright faceted shell that pops in and ripples when hit |
| Numbers | small, rising | big, popping in |

Both keep the game's conventions: physical numbers orange, magic blue, absorbed grey, team colours on the health bars.

A mix is possible, since the knobs are separate (`STYLES` in `fx.ts`): for example the punchy style's telegraphs, hit flash and stun stars, which help reading a fight, with the grounded style's projectiles, impacts and no shake.

## The scenes

| Scene | Ability | Shape | What to look at |
|---|---|---|---|
| `ranger` | Faramir, Ranger's shot | one long projectile | the wind-up and the arrow crossing the board; the melee blows at the front |
| `fire` | Saruman, Fire of Orthanc | a lobbed area, a death | the telegraph, the arc, the blast, Faramir dying |
| `pass` | Gandalf, You shall not pass | a 2-hex burst and stun | the staff gathering light, the shockwave, four stuns |
| `charge` | Théoden, Forth Eorlingas! | a charge through a line | the charge taking time, units thrown aside and stunned |
| `horn` | Boromir, Horn of Gondor | buffs and a shield | the wave, the buffs, the shield taking two blows |

## Proposed timings for the sim

What the scenes use. All are placeholders, to go in `data/` and `docs/design.md` with the sim change.

| | Time |
|---|---|
| Wind-up, from `cast` to the effect | 0.35 to 0.6 s, by ability: 0.35 for a charge, 0.4 for a bow or horn, 0.5 to 0.6 for a spell |
| Ability projectiles | the sim's 12 hexes a second, as ranged attacks |
| A lobbed projectile | 0.75 s, whatever the distance |
| A charge | 0.5 s for 3 hexes (6 hexes a second), striking each unit as it reaches it |
| A melee blow | lands 0.22 s after the attack starts, at the strike in the clip (today it lands at once) |

## Files

- `index.html`, `study.ts`: the page. In `pnpm dev`, open `/art/effects-study/index.html#scene=fire&style=punchy`. It loops the scene in real time.
- `fx.ts`: the two styles and the effect pieces (bursts, glows, rings, hex marks, arrows, fireballs, shells, stun stars, chevrons, ribbons, numbers), each a pure function of the scene's time.
- `scenes.ts`: the five scenes.
- `record.mjs <out dir> [scene ...]`: records each scene in both styles at 30 frames a second, however fast the machine draws, and puts them side by side, with ffmpeg. `--stills=0.5,1.2` writes stills instead.
