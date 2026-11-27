import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { ITEMS, type ItemId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { itemArtUrl, oneRingArtUrl } from '../src/item-art.js';
import type { RingTier } from '../src/ring.js';

// The item chips' art (docs/viewer-spec.md section 2, Item art): SVGs in public/items, written by
// art/items/items.mjs from the design picked for each item, and committed.

const ART = new URL('../public/items/', import.meta.url);
const IDS = Object.keys(ITEMS) as ItemId[];
const TIERS: readonly RingTier[] = ['Gift', 'Burden', 'Grip', 'Betrayal'];
const FILES = [...IDS.map((id) => `${id}.svg`), ...TIERS.map((tier) => `one-ring-${tier.toLowerCase()}.svg`)];

/** Checks a file is a standalone SVG on the 64-unit grid whose every `url(#…)` names an id it holds. */
function expectArt(name: string): void {
  const file = new URL(name, ART);
  expect(existsSync(file), `public/items/${name}`).toBe(true);
  const svg = readFileSync(file, 'utf8');
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64" /);
  expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids, `${name} refers to #${ref}`).toContain(ref);
}

describe('item art', () => {
  it.each(IDS)('%s has its art', (id) => expectArt(`${id}.svg`));

  it.each(TIERS)('the One Ring has its art at %s', (tier) => expectArt(`one-ring-${tier.toLowerCase()}.svg`));

  it('differs from item to item and from tier to tier', () => {
    const contents = FILES.map((name) => readFileSync(new URL(name, ART), 'utf8'));
    expect(new Set(contents).size).toBe(FILES.length);
  });

  it('holds nothing but the art the chips ask for', () => {
    expect(readdirSync(ART).sort()).toEqual([...FILES].sort());
  });

  it('is found by item id and by tier', () => {
    expect(itemArtUrl('anduril')).toMatch(/items\/anduril\.svg$/);
    expect(itemArtUrl('ring-of-the-nine')).toMatch(/items\/ring-of-the-nine\.svg$/);
    expect(oneRingArtUrl('Betrayal')).toMatch(/items\/one-ring-betrayal\.svg$/);
  });
});
