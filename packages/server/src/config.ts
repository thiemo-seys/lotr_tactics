// Timers and limits for matches, lobbies and the server (docs/server-spec.md), and for accounts
// (docs/accounts-spec.md).
// All numbers are placeholders. Durations are in seconds.

export const TIMERS = {
  /** A Council group's turn to pick. */
  councilPick: 15,
  /** docs/design.md section 9. */
  planning: 30,
  /** Extra planning time when someone has a Gift offer to choose from. */
  giftOffer: 15,
  /** How long a finished fight stays on screen before the results. */
  fightHold: 1,
  /** How long the results stay on screen. */
  results: 4,
  /** Extra time in a fight step for slow connections. */
  slack: 2,
} as const;

export const LOBBY = {
  seats: 8,
  codeLength: 5,
  /** Leaves out I, L, O, 0 and 1, which look alike. */
  codeAlphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  nameLength: 20,
  maxLobbies: 200,
  /**
   * How long a lobby stays open with nobody connected. A lobby whose game has started then plays
   * the rest of it out with bots and reports its result (docs/accounts-spec.md section 12).
   */
  idleSeconds: 60,
} as const;

export const SERVER = {
  port: 8080,
  /** How often lobbies run their timers. */
  updateSeconds: 0.1,
  maxMessageBytes: 4096,
  /** A connection that sends more than this many messages in `rateSeconds` is closed. */
  rateMessages: 100,
  rateSeconds: 5,
  /** Connections that don't answer a ping within this time are dropped. */
  pingSeconds: 30,
} as const;

/** Account names (docs/accounts-spec.md section 6.3). */
export const NAMES = {
  minLength: 3,
  maxLength: 20,
  /** How often a claimed account can rename. */
  renameDays: 7,
} as const;

/** Accounts, sessions and the HTTP API (docs/accounts-spec.md sections 5, 6 and 11.1). */
export const ACCOUNTS = {
  /** How long a session lasts, and how long a renewal gives it. */
  sessionDays: 180,
  /** A session used this long after it was last renewed is renewed. */
  renewAfterDays: 1,
  /** New guests from one address in an hour. */
  guestsPerHour: 10,
  /** Guests not seen for this long are deleted. */
  guestDays: 90,
  /** How often expired sessions and old guests are cleaned up. */
  cleanUpMinutes: 60,
  /** API requests from one session in a minute. */
  apiPerMinute: 60,
  maxBodyBytes: 4096,
  /** Matches in one page of history. */
  historyPage: 20,
  /** Units and traits listed in a profile's stats. */
  topCount: 5,
  /** Attempts to write a match's result before it is logged instead. */
  recordAttempts: 4,
} as const;
