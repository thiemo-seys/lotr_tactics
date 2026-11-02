import { describe, expect, it } from 'vitest';
import { BASE, HEX_RADIUS, modelCandidates, modelLabelHeight, pickModel, pipOffsets, starColour, starScale } from '../src/stars.js';

describe('picking a model for a star level', () => {
  it('tries the book model, then the gear model, then the unit model', () => {
    expect(modelCandidates('frodo', 3)).toEqual(['frodo-3', 'frodo-2', 'frodo']);
    expect(modelCandidates('frodo', 2)).toEqual(['frodo-2', 'frodo']);
    expect(modelCandidates('frodo', 1)).toEqual(['frodo']);
  });

  it('falls back to the level below when a model does not exist yet', () => {
    const available = new Set(['frodo', 'frodo-3', 'aragorn', 'aragorn-2']);
    expect(pickModel('frodo', 2, available)).toBe('frodo');
    expect(pickModel('frodo', 3, available)).toBe('frodo-3');
    expect(pickModel('aragorn', 3, available)).toBe('aragorn-2');
    expect(pickModel('aragorn', 1, available)).toBe('aragorn');
  });

  it('never uses a higher star level than the unit has', () => {
    expect(pickModel('frodo', 1, new Set(['frodo-2', 'frodo-3']))).toBeNull();
    expect(pickModel('frodo', 2, new Set(['frodo-3']))).toBeNull();
  });

  it('gives no model for a unit without files', () => {
    expect(pickModel('gimli', 3, new Set(['frodo']))).toBeNull();
  });
});

describe('star scale', () => {
  it('draws 1★ models unscaled, whatever their reach', () => {
    expect(starScale(1, 0.5)).toBe(1);
    expect(starScale(1, 0.93)).toBe(1);
  });

  it('draws 2★ and 3★ models 10% bigger when they fit', () => {
    expect(starScale(2, 0.6)).toBeCloseTo(1.1, 10);
    expect(starScale(3, 0.6)).toBeCloseTo(1.1, 10);
  });

  it('never grows a model past the hex', () => {
    const reach = 0.91; // a Rider's horse
    expect(starScale(3, reach)).toBeCloseTo(HEX_RADIUS / reach, 10);
    expect(starScale(3, reach) * reach).toBeCloseTo(HEX_RADIUS, 10);
    expect(starScale(2, reach)).toBeLessThan(1.04);
  });

  it('never shrinks a model that already reaches past the hex', () => {
    expect(starScale(2, 1.2)).toBe(1);
    expect(starScale(3, HEX_RADIUS)).toBe(1);
  });
});

describe('label height', () => {
  it('sits 1.8 above the base, times the scale', () => {
    expect(modelLabelHeight(1, 1.4, false)).toBeCloseTo(BASE.height + 1.8, 10);
    expect(modelLabelHeight(1.1, 1.4, false)).toBeCloseTo(BASE.height + 1.98, 10);
  });

  it('ignores a small model top, and the top of a unit that is not Large', () => {
    expect(modelLabelHeight(1, 3, false)).toBeCloseTo(BASE.height + 1.8, 10);
    expect(modelLabelHeight(1, 1.2, true)).toBeCloseTo(BASE.height + 1.8, 10);
  });

  it('sits 0.3 above a Large model that is taller', () => {
    expect(modelLabelHeight(1, 2.3, true)).toBeCloseTo(BASE.height + 2.6, 10);
    expect(modelLabelHeight(1.05, 2.3, true)).toBeCloseTo(BASE.height + 2.3 * 1.05 + 0.3, 10);
  });
});

describe('star colours and pips', () => {
  it('colours trim and rim iron or plain, silver and gold', () => {
    expect([1, 2, 3].map((s) => starColour('trim', s as 1 | 2 | 3))).toEqual([0x6b6f74, 0xc9ced4, 0xc4a04a]);
    expect([1, 2, 3].map((s) => starColour('rim', s as 1 | 2 | 3))).toEqual([0x4b4f55, 0xc9ced4, 0xc4a04a]);
    expect([1, 2, 3].map((s) => starColour('pip', s as 1 | 2 | 3))).toEqual([0xb8b2a6, 0xc9ced4, 0xc4a04a]);
  });

  it('has one pip per star, centred on the edge', () => {
    for (const star of [1, 2, 3] as const) {
      const offsets = pipOffsets(star);
      expect(offsets).toHaveLength(star);
      expect(offsets.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 10);
    }
  });
});
