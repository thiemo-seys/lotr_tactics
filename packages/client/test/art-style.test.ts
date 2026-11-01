import { MONSTERS, TRAITS } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { ART_STYLE, type Palette } from '../src/art-style.js';
import { contrast, deltaE, hueGap, lab, lch } from './colour.js';

/** The interface's panels and cards (style.css), where origin colours are drawn. */
const PANELS = ['#1b2029', '#232a36'];

const ORIGINS = Object.entries(TRAITS)
  .filter(([, trait]) => trait.kind === 'origin')
  .map(([id]) => id);

/** Every palette, by the origin or monster family it belongs to. */
const PALETTES: readonly (readonly [string, Palette])[] = [
  ['shared', ART_STYLE.shared],
  ...Object.entries(ART_STYLE.origins).map(([id, style]) => [id, style.palette] as const),
  ...Object.entries(ART_STYLE.monsters).map(([id, family]) => [id, family.palette] as const),
];

const MATERIALS = PALETTES.flatMap(([owner, palette]) => Object.entries(palette).map(([name, hex]) => ({ owner, name, hex })));

const UI = Object.entries(ART_STYLE.origins).map(([id, style]) => ({ id, hex: style.ui }));

describe('colour maths', () => {
  it('matches published reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    const red = lch('#ff0000');
    expect([red.l, red.c, red.h].map((v) => Math.round(v * 10) / 10)).toEqual([53.2, 104.6, 40]);
    // Pairs 1, 7 and 17 of Sharma, Wu and Dalal's CIEDE2000 test data.
    expect(deltaE({ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 })).toBeCloseTo(2.0425, 4);
    expect(deltaE({ l: 50, a: 0, b: 0 }, { l: 50, a: -1, b: 2 })).toBeCloseTo(2.3669, 4);
    expect(deltaE({ l: 50, a: 2.5, b: 0 }, { l: 73, a: 25, b: -18 })).toBeCloseTo(27.1492, 4);
  });
});

describe('art style (docs/art-style.md)', () => {
  it('styles every origin and puts every monster in exactly one family', () => {
    expect(Object.keys(ART_STYLE.origins).sort()).toEqual([...ORIGINS].sort());
    const members = Object.values(ART_STYLE.monsters).flatMap((family) => family.members);
    expect(members.sort()).toEqual(Object.keys(MONSTERS).sort());
  });

  it('writes colours as lower-case hex', () => {
    const colours = [...MATERIALS, ...UI, ...Object.values(ART_STYLE.team).map((hex) => ({ hex }))];
    expect(colours.filter(({ hex }) => !/^#[0-9a-f]{6}$/.test(hex))).toEqual([]);
  });

  it('names materials in lower case, leaving team, base and shadow to the shared palette', () => {
    const own = MATERIALS.filter(({ owner }) => owner !== 'shared');
    expect(own.filter(({ name }) => !/^[a-z]+(-[a-z]+)*$/.test(name) || ['team', 'base', 'shadow'].includes(name))).toEqual([]);
  });

  it('keeps every saturated material 25° of hue from both team colours (section 3.3)', () => {
    const teamHues = Object.values(ART_STYLE.team).map((hex) => lch(hex).h);
    const clashes = MATERIALS.filter(({ name, hex }) => {
      const { c, h } = lch(hex);
      return !name.startsWith('glow') && c >= 30 && teamHues.some((team) => hueGap(h, team) < 25);
    });
    expect(clashes).toEqual([]);
  });

  it('keeps every material above black apart from shadow (section 3.4)', () => {
    expect(MATERIALS.filter(({ name, hex }) => name !== 'shadow' && lch(hex).l < 10)).toEqual([]);
  });

  it('gives each origin an interface colour that reads on the panels (section 8)', () => {
    const faint = UI.flatMap(({ id, hex }) => PANELS.filter((panel) => contrast(hex, panel) < 4.5).map((panel) => `${id} on ${panel}`));
    expect(faint).toEqual([]);
  });

  it('keeps the interface colours apart from each other and from the team colours (section 8)', () => {
    const close: string[] = [];
    UI.forEach((x, i) => {
      for (const y of UI.slice(i + 1)) if (deltaE(lab(x.hex), lab(y.hex)) < 10) close.push(`${x.id} and ${y.id}`);
      for (const [team, hex] of Object.entries(ART_STYLE.team)) if (deltaE(lab(x.hex), lab(hex)) < 15) close.push(`${x.id} and team ${team}`);
    });
    expect(close).toEqual([]);
  });
});
