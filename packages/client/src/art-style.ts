// The art style's colours and sizes (docs/art-style.md), from art/style.json, which the Blender
// scripts that build the models read too. No Three.js or DOM, so it can be tested.

import type { OriginId, Team } from '@lotr-tactics/sim';
import style from '../art/style.json';

/** Material names and their colours, as sRGB hex. A model's materials are named after these. */
export type Palette = Readonly<Record<string, string>>;

/** The size classes of models (art-style.md section 3.1). */
export type SizeClass = 'normal' | 'mounted' | 'large' | 'small';

export interface OriginStyle {
  /** The origin's colour in the interface, for its name and glyph on dark panels. */
  readonly ui: string;
  /** How tall a unit of the origin stands, base included, in game units. */
  readonly height: number;
  readonly palette: Palette;
}

export interface MonsterFamily {
  /** Monster ids. The tests check that each monster belongs to exactly one family. */
  readonly members: readonly string[];
  readonly palette: Palette;
}

export interface ArtStyle {
  /** The team colours: the near side, which is always the person's, and the far side. */
  readonly team: Readonly<Record<Team, string>>;
  /** Materials every model may use: `base` (the top of its base) and `shadow` (hood voids). */
  readonly shared: Palette;
  /** Every model's base: its height and the width of the team-coloured rim. */
  readonly base: { readonly height: number; readonly rim: number };
  readonly sizes: Readonly<Record<SizeClass, { readonly radius: number; readonly triangles: number }>>;
  readonly origins: Readonly<Record<OriginId, OriginStyle>>;
  readonly monsters: Readonly<Record<string, MonsterFamily>>;
}

/** Typed against the sim's ids, so an origin without a style fails the typecheck. */
export const ART_STYLE: ArtStyle = style;
