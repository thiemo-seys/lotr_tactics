import { describe, expect, it } from 'vitest';
import { readSignIn, signInHash } from '../src/accounts.js';

describe("the sign-in's result in the page's address", () => {
  it('round-trips, with the games of a guest left behind', () => {
    expect(signInHash({ outcome: 'claimed', guestGames: 0 })).toBe('signin=claimed');
    expect(signInHash({ outcome: 'signedin', guestGames: 3 })).toBe('signin=signedin&guestGames=3');
    expect(readSignIn('#signin=claimed')).toEqual({ outcome: 'claimed', guestGames: 0 });
    expect(readSignIn('#signin=signedin&guestGames=3')).toEqual({ outcome: 'signedin', guestGames: 3 });
    for (const outcome of ['cancelled', 'failed', 'unavailable'] as const) expect(readSignIn(`signin=${outcome}`)).toEqual({ outcome, guestGames: 0 });
  });

  it('ignores anything else', () => {
    expect(readSignIn('')).toBeNull();
    expect(readSignIn('#lobby=ABCDE')).toBeNull();
    expect(readSignIn('#signin=hacked')).toBeNull();
    expect(readSignIn('#signin=signedin&guestGames=-2')).toEqual({ outcome: 'signedin', guestGames: 0 });
    expect(readSignIn('#signin=claimed&guestGames=4')).toEqual({ outcome: 'claimed', guestGames: 0 });
  });
});
