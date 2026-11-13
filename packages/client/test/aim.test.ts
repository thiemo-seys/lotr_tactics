import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AIM_YAWS, aimOf } from '../src/aim.js';

// Which way archers' models shoot (docs/viewer-spec.md section 5, Facing): the client's table against AIM_YAW in the
// models' scripts, which CI can't build, so a script changed without the table fails here.

const UNITS_DIR = new URL('../art/units/', import.meta.url);

/** AIM_YAW in a model's script, or null if it sets none. */
function scriptAim(name: string): number | null {
  const match = /^AIM_YAW = (-?\d+(?:\.\d+)?)/m.exec(readFileSync(new URL(`${name}.py`, UNITS_DIR), 'utf8'));
  return match === null ? null : Number(match[1]);
}

const SCRIPTS = readdirSync(UNITS_DIR)
  .filter((file) => file.endsWith('.py'))
  .map((file) => file.slice(0, -3));

describe('AIM_YAWS', () => {
  it("holds each 1★ and 3★ model's AIM_YAW from its script, and each gear model its 1★ model's", () => {
    const expected: Record<string, number> = {};
    for (const name of SCRIPTS) {
      if (name.endsWith('-2')) continue;
      const aim = scriptAim(name);
      if (aim === null) continue;
      expected[name] = aim;
      if (!name.endsWith('-3') && SCRIPTS.includes(`${name}-2`)) expected[`${name}-2`] = scriptAim(`${name}-2`) ?? aim;
    }
    expect(Object.keys(expected).length).toBeGreaterThan(0);
    expect(AIM_YAWS).toEqual(expected);
  });

  it('is in radians, and 0 for a model that shoots straight ahead', () => {
    expect(aimOf('legolas')).toBeCloseTo((50 * Math.PI) / 180);
    expect(aimOf('gimli')).toBe(0);
  });
});
