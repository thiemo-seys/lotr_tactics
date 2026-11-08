// Time and randomness for the browser-safe server code (docs/server-spec.md section 4).

export interface Host {
  /** Milliseconds, from any fixed start. */
  now(): number;
  /** A number in [0, 1), for lobby codes, seats and game seeds. */
  random(): number;
}
