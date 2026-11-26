import { existsSync, readFileSync } from 'node:fs';
import { UNITS, type UnitId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { portraitUrl } from '../src/portraits.js';

// The units' portraits on the shop's unit cards (docs/viewer-spec.md section 4, Portraits): WebP
// images in public/portraits, rendered from the 1★ models by art/portraits/ and committed.

const PORTRAITS = new URL('../public/portraits/', import.meta.url);
/** Each portrait's width and height in pixels, as art/portraits/portraits.mjs renders it. */
const SIZE = 384;

/** A WebP file's width and height, from its first chunk, or null if it isn't a WebP. */
function webpSize(file: Buffer): { width: number; height: number } | null {
  if (file.toString('latin1', 0, 4) !== 'RIFF' || file.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = file.toString('latin1', 12, 16);
  // An extended file, as one with transparency is: its canvas size, less one, in 24 bits each.
  if (chunk === 'VP8X') return { width: file.readUIntLE(24, 3) + 1, height: file.readUIntLE(27, 3) + 1 };
  // A lossy file: 14 bits each after the frame's start code.
  if (chunk === 'VP8 ') return { width: file.readUInt16LE(26) & 0x3fff, height: file.readUInt16LE(28) & 0x3fff };
  // A lossless file: 14 bits each, less one, after its signature byte.
  if (chunk === 'VP8L') {
    const bits = file.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

describe('portraits', () => {
  it.each(Object.keys(UNITS) as UnitId[])('%s has a square WebP portrait', (id) => {
    const file = new URL(`${id}.webp`, PORTRAITS);
    expect(existsSync(file), `public/portraits/${id}.webp`).toBe(true);
    expect(webpSize(readFileSync(file))).toEqual({ width: SIZE, height: SIZE });
  });

  it('are found by unit id, or not at all for a unit without one', () => {
    expect(portraitUrl('aragorn')).toMatch(/portraits\/aragorn\.webp$/);
    expect(portraitUrl('aragorn', new Set())).toBeNull();
    expect(portraitUrl('frodo', new Set(['frodo']))).toMatch(/portraits\/frodo\.webp$/);
  });
});
