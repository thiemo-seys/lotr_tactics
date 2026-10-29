// Timers and limits for matches, lobbies and the server (docs/server-spec.md).
// All numbers are placeholders. Durations are in seconds.

export const TIMERS = {
  /** A Council group's turn to pick. */
  councilPick: 15,
  /** docs/design.md section 9. */
  planning: 30,
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
  /** How long a lobby stays open with nobody connected. */
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
