import { describe, expect, it } from 'vitest';
import { checkName, localPlayer, nameKey } from '../src/players.js';

describe('account names', () => {
  it('are trimmed, without control characters, and 3 to 20 characters long', () => {
    expect(checkName('  Gandalf\u0007 the Grey  ')).toEqual({ name: 'Gandalf the Grey', key: 'gandalfthegrey' });
    expect(checkName('Al')).toHaveProperty('error');
    expect(checkName(' \n ')).toHaveProperty('error');
    expect(checkName('x'.repeat(20))).toHaveProperty('name');
    expect(checkName('x'.repeat(21))).toHaveProperty('error');
    // Counted in characters, not UTF-16 units.
    expect(checkName('𝔊'.repeat(20))).toHaveProperty('name');
  });

  it("allow letters and digits of any script, spaces and ' - _ ., but not two spaces in a row", () => {
    for (const name of ["Sam O'Gamgee", 'Éowyn-2', 'Фродо_Б.', 'ミナス ティリス', 'नमस्ते']) expect(checkName(name)).toHaveProperty('name');
    for (const name of ['Sam  Gamgee', 'Sam!', '<script>', 'a bc', 'emoji 🙂']) expect(checkName(name)).toHaveProperty('error');
  });

  it('keep the forms of bot and guest names for them', () => {
    for (const name of ['Bot 3', 'bot3', 'GUEST 1234', 'Guest0001']) expect(checkName(name)).toHaveProperty('error');
    for (const name of ['Botany', 'Guest', 'Bot', 'Guesthouse 2']) expect(checkName(name)).toHaveProperty('name');
  });

  it('compare by key: NFKC, lowercased, without spaces', () => {
    expect(nameKey('Sam Gamgee')).toBe(nameKey('samgamgee'));
    expect(nameKey('ＳＡＭ')).toBe('sam');
    expect(nameKey('ﬁre')).toBe('fire');
  });

  it('give the offline player no account', () => {
    expect(localPlayer()).toEqual({ id: 'local', name: 'You', claimed: false, rating: null });
  });
});
