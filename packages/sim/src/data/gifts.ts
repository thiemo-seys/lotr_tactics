// Gifts of Lothlórien (docs/design.md section 9). The ones that act in a fight are in
// docs/sim-spec.md section 12.5, the rest in docs/game-spec.md section 9.10. All numbers are
// placeholders until balancing. Percentages are whole numbers and durations are in seconds.

import type { ItemStats } from './items.js';
import type { TraitId } from './traits.js';
import type { Cost } from './units.js';

export type GiftTier = 'silver' | 'gold' | 'mithril';

export type GiftId =
  | 'bilbos-purse'
  | 'second-breakfast'
  | 'pocketses'
  | 'road-goes-ever-on'
  | 'beorns-honey'
  | 'swift-as-the-wind'
  | 'shield-wall'
  | 'high-ground'
  | 'lore-of-the-wise'
  | 'gandalfs-fireworks'
  | 'smaugs-hoard'
  | 'treasure-of-erebor'
  | 'elven-smiths'
  | 'muster-of-rohan'
  | 'hands-of-the-king'
  | 'last-alliance'
  | 'light-of-valinor'
  | 'guard-of-the-citadel'
  | 'quiver-of-lorien'
  | 'horse-lords'
  | 'burglars-contract'
  | 'captains-horn'
  | 'wizards-hat'
  | 'arkenstone'
  | 'celebrimbors-forge'
  | 'mirror-of-galadriel'
  | 'fellowship'
  | 'horn-of-helm'
  | 'march-of-the-ents'
  | 'wisdom-of-the-istari'
  | 'return-of-the-king'
  | 'shire-folk'
  | 'elven-kinship'
  | 'sons-of-durin'
  | 'men-of-the-west'
  | 'eorlingas'
  | 'order-of-wizards'
  | 'pits-of-isengard'
  | 'ringwraiths-call';

/** What a Gift does in a fight, for the team that has it. Missing fields do nothing. */
export interface GiftCombat {
  /** Which of the team's units get `stats`: every one, or those placed in the front or back row. */
  readonly who?: 'all' | 'front' | 'back';
  readonly stats?: ItemStats;
  /** Extra starting mana, capped at max mana. */
  readonly startMana?: number;
  readonly startShield?: { readonly amount: number; readonly seconds: number };
  /** Healing every second, as a percent of max Health. */
  readonly regenPct?: number;
  /** A damage amp for every unit of the team. */
  readonly damageAmpPct?: number;
  /** A damage amp for every unit of the team, for each distinct origin among its units. */
  readonly damageAmpPctPerOrigin?: number;
  /** Stuns every enemy at combat start. */
  readonly stunEnemiesSeconds?: number;
  /** One more unit towards a trait, if the team has it. */
  readonly crest?: TraitId;
}

/** What a Gift does outside fights, for the player who has it. Missing fields do nothing. */
export interface GiftEconomy {
  /** Given when picked. */
  readonly gold?: number;
  readonly components?: number;
  readonly combinedItems?: number;
  readonly units?: { readonly cost: Cost; readonly count: number };
  /** Lasting. */
  readonly xpPerRound?: number;
  readonly freeRerollsPerRound?: number;
  readonly maxInterest?: number;
  /** Shops roll with the odds of this many levels higher. */
  readonly shopLevels?: number;
}

export interface GiftDef {
  readonly name: string;
  readonly tier: GiftTier;
  readonly combat?: GiftCombat;
  readonly economy?: GiftEconomy;
}

/** The rounds that offer Gifts, keyed by "stage-round", and the tier they offer. */
export const GIFT_ROUNDS: Readonly<Record<string, GiftTier>> = { '2-1': 'silver', '3-2': 'gold', '4-2': 'mithril' };

export const GIFT_OFFER = {
  options: 3,
  rerolls: 1,
  /** An offer holds at most this many crests. */
  maxCrests: 1,
} as const;

const crest = (name: string, tier: GiftTier, trait: TraitId): GiftDef => ({ name, tier, combat: { crest: trait } });

export const GIFTS: { readonly [K in GiftId]: GiftDef } = {
  'bilbos-purse': { name: "Bilbo's Purse", tier: 'silver', economy: { gold: 12 } },
  'second-breakfast': { name: 'Second Breakfast', tier: 'silver', economy: { freeRerollsPerRound: 1 } },
  pocketses: { name: 'Pocketses', tier: 'silver', economy: { components: 2 } },
  'road-goes-ever-on': { name: 'The Road Goes Ever On', tier: 'silver', economy: { xpPerRound: 2 } },
  'beorns-honey': { name: "Beorn's Honey", tier: 'silver', combat: { stats: { health: 120 } } },
  'swift-as-the-wind': { name: 'Swift as the Wind', tier: 'silver', combat: { stats: { attackSpeedPct: 10 } } },
  'shield-wall': { name: 'Shield Wall', tier: 'silver', combat: { who: 'front', stats: { armor: 20, magicResist: 20 } } },
  'high-ground': { name: 'High Ground', tier: 'silver', combat: { who: 'back', stats: { attackDamagePct: 15 } } },
  'lore-of-the-wise': { name: 'Lore of the Wise', tier: 'silver', combat: { stats: { abilityPower: 15 } } },
  'gandalfs-fireworks': { name: "Gandalf's Fireworks", tier: 'silver', combat: { startMana: 15 } },

  'smaugs-hoard': { name: "Smaug's Hoard", tier: 'gold', economy: { gold: 25 } },
  'treasure-of-erebor': { name: 'Treasure of Erebor', tier: 'gold', economy: { maxInterest: 3 } },
  'elven-smiths': { name: 'Elven-smiths', tier: 'gold', economy: { combinedItems: 1 } },
  'muster-of-rohan': { name: 'Muster of Rohan', tier: 'gold', economy: { units: { cost: 3, count: 2 } } },
  'hands-of-the-king': { name: 'Hands of the King', tier: 'gold', combat: { regenPct: 1 } },
  'last-alliance': { name: 'The Last Alliance', tier: 'gold', combat: { damageAmpPct: 8 } },
  'light-of-valinor': { name: 'Light of Valinor', tier: 'gold', combat: { startShield: { amount: 200, seconds: 8 } } },
  'guard-of-the-citadel': crest('Guard of the Citadel', 'gold', 'guardian'),
  'quiver-of-lorien': crest('Quiver of Lórien', 'gold', 'archer'),
  'horse-lords': crest('Horse-lords', 'gold', 'rider'),
  'burglars-contract': crest("Burglar's Contract", 'gold', 'burglar'),
  'captains-horn': crest("Captain's Horn", 'gold', 'captain'),
  'wizards-hat': crest("Wizard's Hat", 'gold', 'sorcerer'),

  arkenstone: { name: 'The Arkenstone', tier: 'mithril', economy: { gold: 40 } },
  'celebrimbors-forge': { name: "Celebrimbor's Forge", tier: 'mithril', economy: { combinedItems: 2 } },
  'mirror-of-galadriel': { name: 'Mirror of Galadriel', tier: 'mithril', economy: { shopLevels: 1 } },
  fellowship: { name: 'The Fellowship', tier: 'mithril', combat: { damageAmpPctPerOrigin: 4 } },
  'horn-of-helm': { name: 'Horn of Helm Hammerhand', tier: 'mithril', combat: { stunEnemiesSeconds: 1.5 } },
  'march-of-the-ents': {
    name: 'March of the Ents',
    tier: 'mithril',
    combat: { stats: { health: 300, armor: 30, magicResist: 30 } },
  },
  'wisdom-of-the-istari': { name: 'Wisdom of the Istari', tier: 'mithril', combat: { stats: { abilityPower: 30 }, startMana: 20 } },
  'return-of-the-king': { name: 'Return of the King', tier: 'mithril', economy: { units: { cost: 5, count: 1 } } },
  'shire-folk': crest('Shire Folk', 'mithril', 'hobbit'),
  'elven-kinship': crest('Elven Kinship', 'mithril', 'elf'),
  'sons-of-durin': crest('Sons of Durin', 'mithril', 'dwarf'),
  'men-of-the-west': crest('Men of the West', 'mithril', 'gondor'),
  eorlingas: crest('Eorlingas', 'mithril', 'rohan'),
  'order-of-wizards': crest('Order of Wizards', 'mithril', 'istari'),
  'pits-of-isengard': crest('Pits of Isengard', 'mithril', 'orc'),
  'ringwraiths-call': crest("Ringwraiths' Call", 'mithril', 'nazgul'),
};

export const GIFT_IDS = Object.keys(GIFTS) as GiftId[];
