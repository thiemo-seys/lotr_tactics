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
