// What a seat sees of the game and of a round (docs/server-spec.md section 6). Views are plain
// copies, so they can be sent or kept while the game goes on.

import type { CombatInput, CombatResult, CouncilState, GameState, Phase, PlayerView, RoundReport, RoundType } from '@lotr-tactics/sim';

export type StepKind = 'council' | 'planning' | 'fight' | 'over';

export interface StepView {
  readonly kind: StepKind;
  /** Milliseconds left when the view was made, or null when the game is over. */
  readonly ms: number | null;
}

/** What every player sees of a player. */
export type PublicPlayer = Omit<PlayerView, 'shop' | 'shopLocked' | 'xp'>;

export interface MatchView {
  /** The seat this view is for. */
  readonly you: number;
  readonly step: StepView;
  readonly stage: number;
  readonly round: number;
  readonly type: RoundType;
  readonly phase: Phase;
  /** The receiver's own player, in full. */
  readonly me: PlayerView;
  /** Everyone, in seat order, including the receiver. */
  readonly players: readonly PublicPlayer[];
  readonly council: CouncilState | null;
  /** Seats that are Ready in this step. */
  readonly ready: readonly number[];
}

/** A fight as sent: the result without its events, which a client replays from the input. */
export interface FightRecord {
  readonly kind: 'pvp' | 'ghost' | 'pve';
  readonly home: number;
  readonly away: number | null;
  readonly input: CombatInput;
  readonly result: Omit<CombatResult, 'events'>;
}

export interface RoundRecord extends Omit<RoundReport, 'fights'> {
  readonly fights: readonly FightRecord[];
}

export function publicPlayer(p: PlayerView): PublicPlayer {
  return {
    seat: p.seat,
    hp: p.hp,
    gold: p.gold,
    level: p.level,
    streak: p.streak,
    bench: [...p.bench],
    board: [...p.board],
    items: [...p.items],
    recentOpponents: [...p.recentOpponents],
    placement: p.placement,
  };
}

export function fullPlayer(p: PlayerView): PlayerView {
  return { ...publicPlayer(p), xp: p.xp, shop: [...p.shop], shopLocked: p.shopLocked };
}

export function matchView(
  state: GameState,
  you: number,
  step: StepView,
  ready: Iterable<number>,
): MatchView {
  const council = state.council;
  return {
    you,
    step,
    stage: state.stage,
    round: state.round,
    type: state.type,
    phase: state.phase,
    me: fullPlayer(state.players[you]!),
    players: state.players.map(publicPlayer),
    council:
      council === null
        ? null
        : {
            options: council.options.map((o) => ({ unitId: o.unitId, component: o.component, pickedBy: o.pickedBy })),
            groups: council.groups.map((g) => [...g]),
            group: council.group,
          },
    ready: [...ready].sort((a, b) => a - b),
  };
}

export function roundRecord(report: RoundReport): RoundRecord {
  return {
    stage: report.stage,
    round: report.round,
    fights: report.fights.map((f) => ({
      kind: f.kind,
      home: f.home,
      away: f.away,
      input: f.input,
      result: { outcome: f.result.outcome, survivors: f.result.survivors, finalTick: f.result.finalTick },
    })),
    damage: report.damage,
    eliminated: report.eliminated,
  };
}
