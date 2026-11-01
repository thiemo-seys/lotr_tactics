# Art Style Guide

How every unit, monster and summon looks, so that models built one at a time still look like one game. Sections 2 and 3 are the rules every model follows, section 4 how classes show, section 5 a sheet for each origin, section 6 monsters and summons, section 7 effects and section 8 the interface.

- **Colours and sizes** are in `packages/client/art/style.json`. The Blender scripts and the client (`src/art-style.ts`) both read it, and tests check it against sections 3.3, 3.4 and 8 (section 11). This guide names colours by material, such as `cloth-yellow`; the file has the values.
- **Who keeps it:** the low-poly artist builds to this guide and updates it with the models. `design.md` decides who the units are; this guide decides how they look.
- **Sources:** the books, as `design.md` section 14 asks. Section 9 lists film designs to stay clear of.
- **Now:** no models exist yet. Every unit is still a pawn in its team's colour (`viewer-spec.md` section 4), and the scene takes its team colours from `style.json`.
- Heights, base sizes and triangle budgets are *(placeholder)* until the first models are in the game.

---

## 1. The look

Painted tabletop miniatures in low poly. Each unit is a chunky, faceted, flat-shaded figure on a round base, with a big head, big hands and big props, so it reads at 60 to 80 pixels tall from the game's camera. The factions wear earthy, muted colours; the team colour is the brightest cloth on the board.

---

## 2. How a model reads

A player reads a unit in this order. Each layer has its own channel:

| Order | Layer | Shown by | Never by |
|---|---|---|---|
| 1 | Team | The `team` material, on the base rim and the team cloth (section 3.3) | Any other colour close to a team colour |
| 2 | Size | Height and base: normal, mounted, Large or small (section 3.1) | |
| 3 | Origin | Proportions, palette and shapes (section 5) | Team colour |
| 4 | Class | The class's prop and pose (section 4) | Colour |
| 5 | Unit | One hook of its own: headgear, a prop, a colour block, a companion or a pose | A hook another unit of its origin has |

A unit must be recognisable without its label. Units of the same origin and class must differ in outline, not only in colour.

---

## 3. Shared rules

### 3.1 Sizes

Heights run from the ground to the top of the head or headgear, base included, in game units (1 game unit is 1 Blender unit; the pawn is 1.35). Heads are drawn big so faces and headgear read.

| Who | Height | Head | Build |
|---|---|---|---|
| Men (Gondor, Rohan) | 1.35 | 0.26 | The reference: upright, shoulders 0.5 wide |
| Elves | 1.45 | 0.24 | Slim and long-legged, shoulders 0.4 wide |
| Istari | 1.6 with a hat | 0.25 | Robed to the ground, a slight stoop |
| Dwarves | 1.0 | 0.28 | 1.3 times a Man's width, short legs, low and planted |
| Hobbits | 0.85 | 0.3 | Round, short legs, big bare feet |
| Orcs | 1.15 | 0.28 | Hunched, long arms, short bowed legs |
| Nazgûl | 1.5 | Hood | Tall and thin, no legs showing |
| Mounted units | About 1.5 | | Rider seated on a mount at most 1.5 long |
| Large units and monsters | About 2 to 2.5 | | Sections 5 and 6 |
| Small summons | 0.8 | | The Orc grunt |

Each origin's height is in `style.json` (`origins.<id>.height`). The exceptions are in section 5: Gollum crouches at 0.6, the Uruk-hai stand at 1.4, and Saruman wears no hat.

**Size classes** set the base and the triangle budget (`style.json` `sizes`):

| Class | Who | Base radius | Triangles *(placeholder)* |
|---|---|---|---|
| Normal | Units and monsters on foot | 0.4 | 800 |
| Mounted | Riders, and Wargs | 0.62 | 1,100 |
| Large | Large units and monsters (`design.md` section 4) | 0.82 | 2,000 |
| Small | The Orc grunt | 0.3 | 500 |

- Models are built at their final size. Once they replace the pawns, the client stops scaling Large units and summons.
- A normal figure stays within 0.7 of its centre, props included; mounts and Large units within 1.2. The next hex's base starts 1.33 away, so neighbours never overlap.
- The model faces −Y in Blender, which is +Z in the game, and its origin is the centre of its base, on the ground.

### 3.2 Bases

Every model stands on a round base 0.09 high: a 0.06 rim in `team` around a top in the shared `base` colour (`style.json` `base`). The figure stands on the top.

The base shows the team from every side, for every model, whether a person, a beast or a pool of water, and its size shows the size class.

### 3.3 Team colour

- **Where:** the `team` material goes on the base rim and on the model's **team cloth**: a cloak, cape, mantle, war-cloth, saddle-cloth or drape that shows from above, from behind, and at the shoulders from the front. Each origin's sheet names it.
- **How much:** about a quarter to a third of what the camera sees, from either side. Cloaks end above the knee; Captains' capes reach the calf. The person sees their own units from behind, so from behind the head, headgear, props and legs keep their origin's colours.
- **Nothing else looks like a team colour.** A material with a CIELAB chroma of 30 or more keeps at least 25° of hue from both team colours. Greys, dull browns and dull, dark reds are fine. Glows (section 3.5) are exempt, as they are small.
- The client recolours `team`. In Blender previews it is team A's blue.

The team colours (`style.json` `team`) are blue `#4a90d9` for the near side, which is always the person's, and red `#d9534f` for the far side (`game-spec.md` section 12).

### 3.4 Colour

- **Palettes:** a model's materials come from its origin's palette, or its monster family's, plus the shared `base` and `shadow`. A unit may borrow colours from one other palette where the books tie it there, such as Merry's Rohan green and gold; its row in section 5 says so.
- **Value:** the board is dark (CIELAB lightness about 25), so a figure's big shapes are mid to light. Dark palettes (the Nazgûl, the Dark Lord, Gondor's sable, Orc iron) are lifted to a lightness of 10 or more, so their facets show, and each carries a light accent: grey hands and pale eyes, ember seams, white emblems, sallow skin. Only `shadow` is darker.
- **Few colours:** three to five colour areas per figure, besides team and skin. Neighbouring areas differ clearly in lightness, so they stay apart at 60 pixels.
- **Signature:** each origin has one colour that is its own, in its interface colour (section 8) and on its models: Shire yellow waistcoats, Rohan's green, Gondor's white wings, the Nazgûl's pale light.

### 3.5 Materials

- One material per colour, named exactly as in the palette: `skin`, `cloth-green`, `steel`. The shared names are `team`, `base` and `shadow`, and no other palette uses them.
- Blender's Base Color takes linear values, so convert each hex from sRGB, for example with `mathutils.Color(...).from_srgb_to_scene_linear()`.
- **Glows** are the materials whose names start with `glow`. They are emissive: the emission colour is the base colour, at strength 1. They are only for light: the eyes of the Shadow, staff-lights, the Elendilmir, Sting, ember seams, Morgul blades and fire. Keep them under a tenth of what the camera sees; the Balrog, made of fire, is the exception. The client may brighten them when the unit casts.
- No textures and no vertex colours.

### 3.6 Shapes and geometry

- **Faceted low poly:** flat shading, hard edges, no bevels or subdivision. Cylinders of 5 to 8 sides, icosphere heads at subdivision 0 or 1, big flat planes.
- **Big props:** shields, bows, staffs and weapons at about 1.5 times life size. Nothing is thinner than 0.035, bowstrings and spear shafts included, or it flickers at game size.
- **Triangles on the outline:** spend them on the head, headgear, shoulders and props. Hidden faces get few.
- **Faces:** a few facets. Eyes are `shadow` or `glow` facets; mouths show only when open (Orcs, the Cave Troll).
- **Poses:** one still pose per class (section 4.1). Movement is done in code.

---

## 4. Classes

### 4.1 Silhouettes

Every class has members from both sides, so a class shows by its outline, never by colour.

| Class | Must show | Also | Pose |
|---|---|---|---|
| Guardian | A shield on the arm, at least 0.4 of the unit's height | Heavy shoulders, a helm | Wide, square stance |
| Archer | A bow at least 0.7 of the unit's height, held out to the side, and a quiver on the back | | Weight back, bow arm forward |
| Rider | A mount: a horse, a warg or a black horse | A spear or blade; the saddle-cloth is team cloth | Seated, the mount facing forward |
| Burglar | A short blade held low, and a forward crouch | A hood up, where the origin wears hoods | Low, leaning in |
| Captain | A cape to the calf, and a rallying sign held high: a banner, a horn or a raised weapon | A crest, crown or circlet | Upright, chest out |
| Sorcerer | A robe to the ground, and a glowing focus above the shoulder: a staff-head, a light in the hand, or a flame | | Upright, focus raised |

- A unit with two classes shows its first class's must-show, and its second class's in a smaller form. Théoden rides (Rider) with a banner on his lance (Captain); the Witch-king rides with pale fire in his free hand (Sorcerer).
- Large units may leave the class prop out, since size and origin carry them. Treebeard carries no shield.
- Pippin throws stones: a raised throwing arm with a big stone, and a satchel of stones where the quiver would be.

### 4.2 Props by origin

The same prop takes each origin's shapes and palette:

| Origin | Shields | Bows | Blades | Banners, mounts and foci |
|---|---|---|---|---|
| Hobbit | A pot lid | Thrown stones | Short and bright: swords to a hobbit | |
| Elf | | Very long and pale, recurved | Long leaf-shaped knives | A light held in the hand |
| Dwarf | Round and iron-rimmed, or square | | Broad axes, war-hammers, mattocks | A banner of Durin's emblem |
| Gondor | Tall and round-bottomed, sable with the White Tree | Long, of dark wood | Long and straight | The King's standard, the Horn of Gondor |
| Rohan | Round and green, with a gold rim and boss | | Long spears, swords | Horses, the banner of the white horse, horns |
| Istari | | | | Staffs a head taller than the wizard, lit at the head |
| Orc | Crude black planks with the badge | Short, of black horn | Notched, broad or curved | Wargs, crude standards with the badge |
| Nazgûl | | | Long and pale; the Morgul-knife | Black horses, pale fire |
| Ent | | | | |
| Dark Lord | | | A great mace | The Eye in his helm |

---

## 5. Origins

Each sheet covers the same points: who they are, body, shapes, palette (`origins.<id>.palette` in `style.json`), team cloth, what is never team-coloured, motifs and gear, then a row for each unit with its hook.

### 5.1 Hobbit

*Shire yellow.* Small, round, barefoot folk of the Shire, fond of bright yellow and green. Homely rather than martial: their gear looks borrowed or improvised.

- **Body:** 0.85 tall. A big round head with brown curls, slightly pointed ears and no beard; a round belly; short legs; big bare feet with curly hair on top. From the camera the feet and curls are the tell, so make them big.
- **Shapes:** round: domes, circles, round buttons and shoulders, curls as lumps.
- **Palette:** `cloth-yellow` waistcoats, the signature; `cloth-green` jackets; `cloth-brown` breeches; `linen` shirts; `brass` buttons and buckles; `leather` packs and belts; `skin`; `hair`, for curls and feet; `steel` blades and the mithril shirt; `stone` for thrown stones; `skin-grey` for Gollum; `glow` for Sting's gleam and Gollum's eyes.
- **Team cloth:** a short hooded travelling cloak, hood down unless the unit's row says otherwise. Gollum wears a loincloth.
- **Never team:** feet, curls, waistcoats.
- **Motifs:** round brass buttons, patches and pockets; the round green door with a brass knob in the middle, which is the interface glyph.
- **Gear:** oversized for them: packs, pans, rope, and blades that are swords to a hobbit.

| Unit | Class | Hook |
|---|---|---|
| Sam | Guardian | The broadest hobbit; a pot lid for a shield, and a pack with a pan and a coil of rope |
| Merry | Burglar | Hood up, a barrow-blade; a tunic in Rohan's `cloth-green` and `gold`, borrowed, as he was esquire of the Mark |
| Pippin | Archer | A raised arm with a big stone and a satchel of stones; a tunic in Gondor's `sable` and `silver`, borrowed, as he wore the Tower's livery |
| Frodo | Burglar | Hood down, dark hair, the mithril shirt showing at the chest; Sting with a `glow` edge |
| Bilbo | Burglar | No hood; a yellow waistcoat with big brass buttons; a lumpy sack of treasure over one shoulder, coins at its mouth |
| Gollum | Burglar | On all fours at 0.6 tall: thin limbs, long fingers, `skin-grey`, big pale `glow` eyes; no weapon |

### 5.2 Elf

*Starlight.* The Firstborn: tall, slender and ageless; the grey of Lórien, silver and white, the gold of the mallorn; leaves and stars.

- **Body:** 1.45 tall, slim and long-legged; long hair down the back; no beards; a light, upright stance.
- **Shapes:** long tapering lines and leaf curves: cloaks narrowing to a point, leaf-shaped blades and clasps, upswept tips, crescent bows.
- **Palette:** `cloth-grey`, Lórien's grey-green, for tunics and hoods; `cloth-white` robes; `cloth-green` and `cloth-brown`, Mirkwood's colours; `silver` mail, circlets and clasps; `gold` mallorn trims and leaf brooches; `wood` pale bows; `leather`; `skin`; hair in `hair-gold`, `hair-dark`, `hair-brown` or `hair-pale`; `glow`, white starlight.
- **Team cloth:** a long, narrow cloak, ending above the knee in a point. The books' grey cloaks of Lórien become team-coloured, so the grey moves to tunics and hoods.
- **Never team:** hair, silver, leaf brooches.
- **Motifs:** the mallorn leaf, in brooches and blades; stars; crescents.
- **Gear:** long bows nearly as tall as the elf; long knives; light silver mail, never heavy plate.

| Unit | Class | Hook |
|---|---|---|
| Haldir | Archer | The plainest elf: Lórien grey with the hood up, `hair-pale` showing, the longest bow |
| Legolas | Archer | Mirkwood green and brown, `hair-brown` loose, his bow drawn; two long knives crossed on his back |
| Elrond | Sorcerer | A silver-grey robe; `hair-dark` under a silver circlet; one hand raised with Vilya's light, a `gold` ring with a `glow` for its stone |
| Galadriel | Sorcerer | A white robe flaring at the hem; `hair-gold` to the waist; a light cupped in both hands above her head, the brightest glow of the Elves |

### 5.3 Dwarf

*Forge copper.* Durin's folk: short, stocky and proud, with long beards and mail to the knee; axes and mattocks, gold and runes.

- **Body:** 1.0 tall but 1.3 times a Man's width. A big wedge of beard from chin to belt, forked or plaited and tucked into the belt; short thick legs and heavy boots; a low centre of mass.
- **Shapes:** squares, wedges and horizontal bands: blocky helms, banded rims, chevron and diamond runes. No curve without a corner.
- **Palette:** `steel` mail; `iron` helms and rims; `copper` fittings, the signature; `gold` rune bands, crowns and beard clasps; `cloth-brown` tunics; `leather`; `wood` hafts; `skin`; beards in `beard-brown`, `beard-white` or `beard-grey`.
- **Team cloth:** a hooded mantle on the shoulders, the hood down behind the helm. Captains add a cape.
- **Never team:** beards, metal.
- **Motifs:** Durin's emblem, an anvil and hammer under a crown with seven stars; angular runes; gold beard clasps.
- **Gear:** broad axes, war-hammers and mattocks; round iron-rimmed shields; mail to the knee.

| Unit | Class | Hook |
|---|---|---|
| Balin | Captain | `beard-white` and a gold circlet; a cape to the calf; a banner of Durin's emblem, gold on iron, held high |
| Gimli | Guardian | `beard-brown` and a plain pointed iron helm; a round iron-rimmed shield and a broad axe raised |
| Dáin | Guardian | Older, `beard-grey` forked into his belt; a helm with a gold crown band, as King under the Mountain; a tall square shield and a war-hammer |

### 5.4 Gondor

*Citadel white.* The Men of the West: the stone of the White City and the White Tree, liveries of sable and silver, high helms with the wings of sea-birds, long swords; rangers of Ithilien in green and brown.

- **Body:** 1.35, the reference: upright, broad-shouldered, dark-haired.
- **Shapes:** tall verticals and symmetry: straight drapes, high helms with white wings, the branching of the Tree.
- **Palette:** `sable`, Gondor's black livery; `silver` helms and mail; `white` for the Tree and the wings; `steel` blades; `leather`; `cloth-green` and `cloth-brown` for the rangers; `ivory` for the Horn of Gondor; `skin`; `hair`; `glow` for the Elendilmir.
- **Team cloth:** a cloak from the shoulders, ending above the knee; Captains' capes reach the calf. The tabard stays sable with the Tree.
- **Never team:** helms and wings, the sable tabard, the White Tree.
- **Motifs:** the White Tree under seven stars and a high crown; sea-bird wings.
- **Gear:** long straight swords; tall shields with rounded bottoms, sable with the Tree; long bows of dark wood for the rangers.

| Unit | Class | Hook |
|---|---|---|
| Beregond | Guardian | A guard of the Citadel: a high silver helm with white wings, a sable tabard with the Tree, a tall sable shield |
| Faramir | Archer | A ranger of Ithilien: hood up in `cloth-green`, a `cloth-brown` jerkin, a long dark bow; a small White Tree on the chest is his only silver |
| Boromir | Captain | Bare-headed; the Horn of Gondor, `ivory` tipped with silver, raised high; a long sword; a cape to the calf |
| Aragorn | Captain | The king returning: the Elendilmir, a `glow` star on his brow; Andúril, long and bright; the King's standard on a pole, the Tree, stars and crown on sable; a ranger's `cloth-green` under the silver |

### 5.5 Rohan

*Mark green.* The Horse-lords: tall and fair, with long braided hair; green and gold; horses, spears, round shields and horns; the white horse on green.

- **Body:** 1.35 and strong; long fair braids; older men bearded.
- **Shapes:** flowing horizontals and curves: horse-tail crests streaming back, braids, round shields with bosses, gold discs, curved horns.
- **Palette:** `cloth-green`, the signature, and `cloth-green-dark`; `gold` shields, helms and trims; `white` for the horse emblem and crests; `leather`; `steel`; `wood`; `skin`; `hair-fair`, `hair-white` and `hair-grey`; horses in `horse-bay`, `horse-white` and `horse-dun`.
- **Team cloth:** a cloak ending above the knee, and the saddle-cloth on a horse.
- **Never team:** green tunics, gold, fair hair, the white horse.
- **Motifs:** the white horse on green; horse heads; sun-discs; knotwork.
- **Gear:** long spears; round green shields with a gold rim and boss; swords; horns; helms with gold cheek-plates.

| Unit | Class | Hook |
|---|---|---|
| Háma | Guardian | The doorward: a round shield with the white horse, a spear held upright, a helm with gold cheek-plates |
| Gamling | Rider | An old rider on a `horse-dun`, with a `hair-grey` beard and a horn raised |
| Éomer | Rider | On a `horse-bay`, his long spear couched; a white horse-tail crest streaming from his helm |
| Éowyn | Guardian | Bare-headed, long `hair-fair` loose; dressed in white and gold; a round shield and a sword |
| Théoden | Rider, Captain | The king on a `horse-white`: a gold crown-helm, a golden shield and `hair-white`; the banner of the white horse on his lance; a cape to the calf |

### 5.6 Istari

*Wizard violet.* The Wizards: old men in long robes, with long beards, tall headgear and tall staffs, each robed in his own colour. Their power shows as light at the staff's head.

- **Body:** a robe to the ground, so no legs show; 1.6 tall with a hat. Long beards to the belt; a slight stoop.
- **Shapes:** cones and A-lines: pointed hats, cone-shaped robes, wedges of beard, the upright staff.
- **Palette:** robes in `robe-grey`, `robe-white` or `robe-brown`; `hat-grey` for Gandalf's hat, the books' blue kept dull so it never reads as team blue; `silver`, his scarf; `beard-white` and `beard-grey`; `skin`; `wood` staffs, and `wood-pale` for Saruman's; `prism-rose`, `prism-green` and `prism-violet` for Saruman's many colours; `feather` for Radagast's birds; `glow`, the violet-white staff-light.
- **Team cloth:** a cloak over the shoulders, ending above the knee; the robe below keeps the wizard's colour.
- **Never team:** robes, hats, beards, staffs.
- **Violet** is a game convention for wizardry, not a colour from the books. It appears only in the interface and the staff-light; the robes keep the wizards' own colours.
- **Gear:** a staff a head taller than the wizard, lit at the head.

| Unit | Class | Hook |
|---|---|---|
| Radagast | Sorcerer | All brown, with a wide-brimmed hat; birds on his shoulder and his staff |
| Saruman | Sorcerer | A white robe with a few `prism-*` facets that catch the light; no hat, so he stands 1.5, with a tall standing collar behind long white hair; a pale staff with a faceted head |
| Gandalf | Sorcerer | A grey robe, a tall pointed `hat-grey` hat with a wide brim, a silver scarf and a long white beard; a gnarled staff with the brightest light |

### 5.7 Orc

*Sallow.* The soldiery of the Shadow: hunched, long-armed and crook-legged, sallow or swart; black iron, crude mail, notched blades and horn bows; each wearing its master's badge.

- **Body:** 1.15, hunched: head forward and low, shoulders high, arms to the knee, short bowed legs. Uruk-hai stand upright at 1.4, broad, with thick legs and big hands.
- **Shapes:** jagged and lopsided: notches, spikes, saw-tooth edges, mismatched plates. Nothing symmetric.
- **Palette:** `skin-sallow` for Mordor and Morgul orcs and `skin-swart` for the Uruk-hai; `iron-black` and `iron`; `rust`; `leather`; `rag`; `bone`; `wood`; `horn` for bows; `fur` and `fur-dark` for wargs; badges in `badge-white`, `badge-eye` and `badge-moon`.
- **Team cloth:** a ragged war-cloth hanging from the belt, front and back, and a rag over the shoulders.
- **Never team:** skin, iron, the badge.
- **Badges,** on shields and helms, one master per orc:

  | Master | Orcs | Badge | Material |
  |---|---|---|---|
  | Isengard | Uglúk, Lurtz, Sharku | The White Hand on black, and an S-rune on the helm | `badge-white` |
  | Mordor | Grishnákh | The Eye, with a black slit | `badge-eye` |
  | Minas Morgul | Gorbag, Gothmog | The Moon with a face of death | `badge-moon` |

  The books' Red Eye is drawn amber, as the Eye itself is described (yellow, rimmed with fire), so it never reads as team red. Orc grunts wear no badge.
- **Gear:** short broad swords, cleavers and curved notched blades; black horn bows; crude plank shields; whips for captains.

| Unit | Class | Hook |
|---|---|---|
| Grishnákh | Burglar | Mordor: arms nearly to the ground, the lowest crouch of the orcs, two long knives; the Eye on his shoulder |
| Sharku | Rider | An Isengard wolf-rider on a `fur` warg with a war-cloth saddle; a crude curved blade |
| Gorbag | Archer | Morgul: hunched, a short horn bow, the Moon on a crude helm |
| Lurtz | Archer | Uruk-hai: tall and upright, a huge black bow and black-feathered arrows; the S-rune on his helm |
| Uglúk | Guardian | The Uruk-hai captain and the biggest orc: a big black shield with the White Hand, a short broad sword |
| Gothmog | Captain | Morgul's lieutenant: heavy `iron-black` armour, a cape to the calf, a tall crude standard of the Moon on his back, a whip |

### 5.8 Nazgûl

*Corpse-light.* The Ringwraiths: tall, cloaked and hooded in black, with no face, only a pale gleam of eyes; grey, haggard hands; pale blades; black horses. The Witch-king wears a crown on a head unseen.

- **Body:** 1.5 tall; robes to the ground in ragged points; thin arms with grey hands; a tall peaked hood over an empty `shadow` void with two small `glow` eyes.
- **Shapes:** tall tapering points and tatters: the hood's peak, a hem of ragged triangles, the crown's points, long blades.
- **Palette:** `robe`, black lifted so its facets show, with `robe-tatter` for every other tatter; `hands`, grey; `steel` for pale blades and the crown; `iron`; `horse`, the black horses; `glow`, the pale corpse-light of eyes, Morgul blades and pale fire; `glow-eye`, amber, for the Eye's Nazgûl only.
- **Team cloth:** a mantle over the shoulders and upper back, open at the throat, and the saddle-cloth on a horse. The hood and the robe below stay black.
- **Never team:** the hood, the face void, the black robe.
- **Read:** the darkest figures on the board, outlined by their mantle and lit only by their eyes and blades.
- **Gear:** long pale swords, the Morgul-knife, the Witch-king's mace; black horses.

| Unit | Class | Hook |
|---|---|---|
| Ringwraith | Burglar | On foot and leaning in, a Morgul-knife with a `glow` edge held low |
| Khamûl | Rider | The Black Easterling on a black horse: a curved sword, and layered plates showing under the robe |
| Witch-king | Rider, Sorcerer | On a black horse; a pale `steel` crown floating above the empty hood; a mace in one hand and pale fire held up in the other |

### 5.9 Ent

*Ent green.* Treebeard: man-shaped and troll-tall, with a grey-green hide like bark, no neck, a long face with a sweeping grey beard, twiggy at the roots and mossy at the tips, deep eyes with a green light, and seven-toed feet.

- **Body:** Large, 2.4 tall: a trunk of a body; a tall head straight on the shoulders; long arms with branch fingers; feet like roots.
- **Shapes:** trunks, roots and bark plates: upright columns, root flares, a beard of twigs, branch fingers, bark as faceted panels.
- **Palette:** `bark` and `bark-dark`; `wood` for fresh wood and fingers; `moss` for the beard's tips; `beard`; `stone` for his boulder; `glow`, the green light of his eyes.
- **Team cloth:** small clusters of leaves on his head and shoulders, not a crown of foliage.
- **Never team:** bark, beard.

| Unit | Class | Hook |
|---|---|---|
| Treebeard | Guardian | Large, with no shield: his trunk is the wall |

### 5.10 Dark Lord

*Eye amber.* Sauron, in a form of our own: a towering king of black iron, with the heat of Orodruin glowing in his seams, the Eye in his helm and the One Ring on his hand.

- **Body:** Large, 2.3 tall; broad and heavy, wedge-shouldered; a closed helm with the Eye as a burning slit; a crown of broad, flame-shaped points with ember tips, not thin spikes (section 9).
- **Shapes:** a towering crown and molten seams: heavy layered plates with `glow` cracks between them; a massive mace.
- **Palette:** `iron`, black iron; `basalt` for stone-like plates; `cloth`, a dark under-robe; `gold`, the One Ring; `glow`, the ember seams; `glow-eye`, the Eye.
- **Team cloth:** a cape to the calf, open at the front.
- **Never team:** armour, crown, the Eye.

| Unit | Class | Hook |
|---|---|---|
| Sauron | Captain | Large; the Eye burning in his helm; a mace raised; the One Ring on his hand |

---

## 6. Monsters and summons

### 6.1 Monsters

Each monster belongs to one family, with its own palette (`style.json` `monsters`). In a game, monsters fight on the far side, so they show red; their team colour is the base rim and any cloth they wear.

| Family | Monsters | Look |
|---|---|---|
| Moria | Moria goblin, Goblin archer, Cave Troll, Watcher in the Water, the Balrog | The dark under the mountains: cave-pale skin, rust, rags and torchlight; shadow and flame for the Balrog. Palette: `skin`, `rag`, `iron`, `rust`, `leather`, `wood`, `hide`, `hide-belly`, `stone`, `tentacle`, `water`, `smoke`, `ash`, `glow`, `glow-hot` |
| The Wild | Warg | Grey-black wolves with bristling fur and yellow eyes. Palette: `fur`, `fur-dark`, `fur-light`, `bone`, `glow` |
| Harad | Mûmak | Grey hide and ivory; the Haradrim's scarlet, dulled, and gold; the black serpent. Palette: `hide`, `hide-dark`, `ivory`, `cloth-red`, `cloth-black`, `gold`, `wood`, `leather` |

| Monster | Size | Look |
|---|---|---|
| Moria goblin | Normal, 0.95 | Crouched, with cave-pale `skin` and big ears; rags for team cloth; a curved blade |
| Goblin archer | Normal, 0.95 | The goblin with a short bow and a quiver |
| Warg | Mounted, 1.0 at the shoulder | A big wolf with a bristling spine and `glow` eyes; no saddle, so the base rim is its only team colour |
| Cave Troll | Large, 2.0 | Hunched, with dark greenish scales (`hide`) and a paler belly; flat feet with no toes; a stone maul; a loincloth for team cloth. No chains |
| Watcher in the Water | Large, 1.6 | A pool of dark `water` on its base, the body under the surface; many pale-green, wet arms of different heights, with fingers at the tips |
| Mûmak | Large, 2.3 | A grey hill on legs like trees: ears like sails, a long trunk, two tusks, small eyes; a war-tower on its back, its drapes the team cloth, trimmed in gold, with the black serpent on dulled scarlet above |
| The Balrog | Large, 2.5 | A man-shaped mass of `smoke` and `ash`, with no horns; a streaming mane of fire; a sword of fire (`glow-hot`) in the right hand and a whip of many thongs in the left; wings of shadow as broad, ragged planes |

### 6.2 Summons

A summon uses the palette of its origin in the sim's data (`SUMMONS`).

| Summon | Size | Look |
|---|---|---|
| Orc grunt | Small, 0.8 | The plainest orc: no badge, a cleaver, a war-cloth for team cloth |
| Eye's Nazgûl | Normal, 1.5 | A Ringwraith on foot whose eyes glow amber (`glow-eye`), not pale: the Eye looking for its Ring |

---

## 7. Effects

How effects look. What they show still comes from the events (`viewer-spec.md` section 5).

- **Arrows:** a shaft in the archer's `wood`, or `horn` for Orcs, fletched in the lightest cloth of its palette; Orc arrows are fletched black. Pippin's stone is `stone`.
- **Ability effects** take the caster's `glow` colour: violet-white for the Istari, white for the Elves, pale green for the Nazgûl, ember for the Dark Lord and the Balrog. Units without a glow use white.
- **Cast rings** stay in the caster's team colour, so whose cast it is stays clear.
- **Numbers** keep their colours: physical damage orange, magic blue, true white, heals green (`viewer-spec.md` section 5).

---

## 8. Interface

Each origin has a colour and a glyph for its name in the interface: trait lists, unit cards and tooltips (`style.json` `origins.<id>.ui`). Classes have a glyph but no colour; they use the text colour.

| Origin | Colour | Name | Echoes | Glyph |
|---|---|---|---|---|
| Hobbit | `#ecc14a` | Shire yellow | `cloth-yellow` | A round door with a knob in the middle |
| Elf | `#a9d8e6` | Starlight | `silver`, `glow` | A mallorn leaf |
| Dwarf | `#d9977c` | Forge copper | `copper` | An anvil and hammer |
| Gondor | `#e3e6ea` | Citadel white | `white` | The White Tree |
| Rohan | `#62b86c` | Mark green | `cloth-green` | A running horse |
| Istari | `#b79ff0` | Wizard violet | `glow` | A pointed hat |
| Orc | `#a8a23a` | Sallow | `skin-sallow` | A notched cleaver |
| Nazgûl | `#c8e0b4` | Corpse-light | `glow` | An empty hood |
| Ent | `#7fd0b4` | Ent green | `glow` | A gnarled trunk |
| Dark Lord | `#f59f1f` | Eye amber | `glow-eye` | The lidless Eye |

| Class | Glyph |
|---|---|
| Guardian | A shield |
| Archer | A drawn bow |
| Rider | A horseshoe |
| Burglar | A dagger |
| Captain | A banner |
| Sorcerer | A staff with a star |

- Origin colours are for text and glyphs on the dark panels and cards, with a contrast of at least 4.5 to 1.
- They stay apart from each other (a CIEDE2000 difference of 10 or more) and from the team colours (15 or more), so a trait never looks like a team. Blue and red mean the teams, in the interface as on the board.
- Cost borders, item chips, Gift tiers and damage numbers keep their own colours (`style.css`, `items.ts`).

---

## 9. Not from the films

`design.md` section 14 keeps this a fan project drawn from the books. Where a film design is well known, stay clear of it:

| Avoid | Do instead |
|---|---|
| Sauron's spiked plate armour and spiked helm | Black iron with ember seams, a closed helm with the Eye, a crown of broad flame-shaped points |
| A horned Balrog with cracks of lava and bat wings | Smoke and shadow, a mane of fire, wings as ragged planes of shadow, a sword of fire and a whip of many thongs |
| Uruk-hai with the White Hand painted on their faces | The White Hand on black shields and an S-rune on the helm |
| The films' Lurtz and Sharku, who aren't in the books | A book Uruk-hai archer, and a wolf-rider of Isengard |
| The films' Gothmog and his deformed face | A heavily armoured lieutenant of Morgul with the Moon standard |
| The films' Gollum, pale with big blue eyes | Dark, thin and damp, with pale glowing eyes |
| Legolas's platinum hair; Haldir's armour at Helm's Deep | Brown hair in Mirkwood's colours; Haldir in Lórien grey |
| Sam's frying pan as a weapon | A pot lid as a shield |
| A cave troll in chains and a shackle | Dark green scales, feet with no toes and a stone maul |
| Mûmakil with four tusks | Two tusks and a war-tower of our own |
| Saruman's dark staff with a claw at its head | A pale staff with a faceted head |
| Any people's armour, helms and costumes from the films | Shapes from section 5, built from the books' descriptions |

Don't copy designs from other games either, and don't download models or textures (`.claude/agents/low-poly-artist.md`).

---

## 10. Adding content

**A unit:**
1. Take its origin's sheet: body, palette, team cloth.
2. Give it its class's must-show (section 4.1), in its origin's style (section 4.2).
3. Give it one hook that no other unit of its origin has.
4. Add its row to its origin's table in section 5.
5. Build it within its budget, and look at it from the game's camera next to the other units of its origin.

**An origin:** write a sheet like those in section 5; add `origins.<id>` to `style.json` with an interface colour, a height and a palette; and add its colour and glyph to section 8. The typecheck fails until the origin has a style, and the tests check its colours.

**A monster:** add it to a family's `members` in `style.json`, or make a new family with its own palette, and add its row to section 6.

---

## 11. Tests

`packages/client/test/art-style.test.ts` checks `style.json`:

- every origin has a style, and every monster is in exactly one family;
- colours are hex, and only the shared palette has `team`, `base` and `shadow`;
- section 3.3: every material with a chroma of 30 or more, apart from glows, keeps 25° of hue from both team colours;
- section 3.4: every material apart from `shadow` has a lightness of 10 or more;
- section 8: each origin's colour has a contrast of at least 4.5 on the panels and cards, a difference of at least 10 from the others and at least 15 from the team colours.

Once models exist, a test also checks that every unit, monster and summon has one (`.claude/agents/low-poly-artist.md`).

---

## 12. Still to decide

**Star levels:** how a 2★ or 3★ unit looks different from a 1★.

1. **Bands on the base** *(recommended)*: a `star` band on the base's rim, which the client colours: none at 1★, silver at 2★, gold at 3★. It works for every model with no extra modelling, and the base is already where players look for the team.
2. **Size:** 2★ drawn 5% bigger and 3★ 10% bigger. Free, but hard to see, and it crowds the hex.
3. **Extra parts:** a crown, a better weapon or a longer cape at 3★. The strongest read, but it doubles the modelling for 45 models.
