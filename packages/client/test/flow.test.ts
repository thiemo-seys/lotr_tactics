import { TIMERS, type ClientMessage, type FightRecord, type Host, type LobbyView, type MatchView, type RoundRecord, type ServerMessage } from '@lotr-tactics/server';
import { simulateCombat, type CombatEvent, type Team } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { LocalConnection } from '../src/connection.js';
import { yourFight, yourTeam } from '../src/fights.js';
import { PlayFlow, ordinal, outcomeText, standings, type FlowHooks } from '../src/flow.js';
import { traitRows } from '../src/traits.js';

/** A host whose clock only moves when the test moves it. */
function fakeHost(): Host & { time: number } {
  let tokens = 0;
  return { time: 0, now() { return this.time; }, random: () => 0.5, token: () => `token-${++tokens}` };
}

/** Lets the messages queued as microtasks arrive. */
const flush = () => new Promise((done) => setTimeout(done, 0));

/** A flow that records what it asks of the page. */
function recorded(send: (message: ClientMessage) => void = () => {}) {
  const calls = { sent: [] as ClientMessage[], fights: [] as Team[], menus: [] as string[], joined: [] as string[] };
  const hooks: FlowHooks = {
    send: (message) => {
      calls.sent.push(message);
      send(message);
    },
    fight: (_, team) => calls.fights.push(team),
    menu: (message) => calls.menus.push(message),
    joined: (code) => calls.joined.push(code),
  };
  return { flow: new PlayFlow(hooks), calls };
}

const lobby = (started: boolean): LobbyView => ({
  code: 'ABCDE',
  host: 0,
  started,
  seats: [{ kind: 'person', name: 'Ann', connected: true }, { kind: 'person', name: 'Bo', connected: false }],
});

describe('the play flow', () => {
  it('joins a lobby, shows it until the game starts, and goes back to the menu when told', () => {
    const { flow, calls } = recorded();
    flow.receive({ type: 'joined', code: 'ABCDE', seat: 1, token: 't' }, 0);
    expect([flow.you, calls.joined]).toEqual([1, ['ABCDE']]);
    flow.receive({ type: 'lobby', lobby: lobby(false) }, 0);
    expect(flow.show.kind).toBe('lobby');
    expect([flow.seatName(0), flow.seatName(1), flow.seatName(5)]).toEqual(['Ann', 'You', 'Seat 6']);
    flow.receive({ type: 'refused', request: 'start', reason: 'Only the host can start the game.' }, 0);
    expect(flow.lobbyMessage).toBe('Only the host can start the game.');
    flow.receive({ type: 'lobby', lobby: lobby(true) }, 0);
    expect(flow.show.kind).toBe('lobby');
    flow.receive({ type: 'refused', request: 'act', reason: 'Not enough gold.' }, 0);
    expect(calls.menus).toEqual([]);
    flow.receive({ type: 'left', reason: 'You left the lobby.' }, 0);
    flow.receive({ type: 'left', reason: 'You joined this game from somewhere else.' }, 0);
    flow.receive({ type: 'refused', request: 'join', reason: 'That lobby is full.' }, 0);
    expect(calls.menus).toEqual(['', 'You joined this game from somewhere else.', 'That lobby is full.']);
  });

  it('sends only picks in a Council, and nothing outside the game', () => {
    const { flow, calls } = recorded();
    flow.act({ type: 'reroll' });
    flow.show = { kind: 'council' };
    flow.act({ type: 'reroll' });
    flow.act({ type: 'pick', option: 2 });
    flow.show = { kind: 'planning' };
    flow.act({ type: 'reroll' });
    expect(calls.sent).toEqual([
      { type: 'act', action: { type: 'pick', option: 2 } },
      { type: 'act', action: { type: 'reroll' } },
    ]);
  });

  it('goes straight to the results of a round with no fight of yours, as when only your ghost fought', () => {
    const { flow, calls } = recorded();
    const fight = (kind: FightRecord['kind'], home: number, away: number | null): FightRecord => ({
      kind,
      home,
      away,
      input: { seed: 1, stage: 2, teams: { A: [], B: [] } },
      result: { outcome: 'A', survivors: { A: [], B: [] }, finalTick: 0 },
    });
    const round: RoundRecord = { stage: 2, round: 1, fights: [fight('pvp', 1, 2), fight('ghost', 3, 0)], damage: [], eliminated: [], places: [] };
    flow.receive({ type: 'round', round }, 5000);
    expect(flow.show).toEqual({ kind: 'results', round, until: 5000 + TIMERS.results * 1000 });
    expect(calls.fights).toEqual([]);
  });

  it('plays an offline game: your fight from your side, then the results, then Ready once while still in', async () => {
    const host = fakeHost();
    let connection: LocalConnection | null = null;
    const { flow, calls } = recorded((message) => connection!.send(message));
    // The last view from planning, which the HUD keeps showing while the fight plays.
    let planned: MatchView | null = null;
    const message = (m: ServerMessage) => {
      if (m.type === 'state' && m.state.step.kind === 'planning') planned = m.state;
      flow.receive(m, host.time);
    };
    connection = new LocalConnection(5, { message, closed: () => {} }, { host, autoUpdate: false });
    await flush();
    expect([flow.show.kind, flow.you, flow.inGame]).toEqual(['planning', 0, true]);
    expect(flow.secondsLeft(host.time)).toBe(Math.ceil(flow.state!.step.ms! / 1000));

    let rounds = 0;
    let readies = 0;
    for (let i = 0; i < 3000 && flow.show.kind !== 'over'; i++) {
      const { show } = flow;
      if (show.kind === 'council') {
        host.time += flow.state!.step.ms!;
        connection.update();
      } else if (show.kind === 'planning') {
        flow.ready();
      } else if (show.kind === 'fight') {
        rounds++;
        expect(calls.fights.at(-1)).toBe(yourTeam(show.fight, 0));
        expect(show.fight).toBe(yourFight(show.round, 0));
        // The fight step's view has the fights' outcome in it, but the HUD shows HP, streaks and
        // places as they were planned; the rest is live, since the person can shop.
        const shown = flow.shownView();
        expect([shown.me.hp, shown.me.streak, shown.me.placement]).toEqual([planned!.me.hp, planned!.me.streak, planned!.me.placement]);
        expect(shown.players.map((p) => [p.hp, p.streak, p.placement])).toEqual(planned!.players.map((p) => [p.hp, p.streak, p.placement]));
        expect([shown.me.gold, shown.me.shop, shown.me.bench]).toEqual([flow.state!.me.gold, flow.state!.me.shop, flow.state!.me.bench]);
        expect(flow.shownView()).toBe(shown);
        expect([planned!.stage, planned!.round]).toEqual([show.round.stage, show.round.round]);
        expect([flow.state!.stage, flow.state!.round, flow.state!.phase]).toEqual([show.round.stage, show.round.round, 'fight']);
        expect(flow.canShop).toBe(flow.state!.me.placement === null);
        expect(flow.trackedTeam().board).toBe(show.fight.input.teams[yourTeam(show.fight, 0)]);
        // The result isn't told before the fight has played.
        expect(flow.outcome(show.round.stage, show.round.round)).toBeNull();
        const outcomes = flow.outcomesShown;
        flow.update(1000, host.time);
        expect(flow.show.kind).toBe('results');
        expect(flow.shownView()).toBe(flow.state);
        expect(flow.trackedTeam()).toBe(flow.me());
        expect(flow.outcome(show.round.stage, show.round.round)).toBe(flow.results(show.round, false).outcome);
        // The stage tracker is drawn again with it.
        expect(flow.outcomesShown).toBe(outcomes + 1);
      } else if (show.kind === 'results') {
        const results = flow.results(show.round, false);
        expect([results.stage, results.round]).toEqual([show.round.stage, show.round.round]);
        expect(['Victory', 'Defeat', 'Draw', 'No fight']).toContain(results.outcome);
        expect(results.taken).toBe(show.round.damage.find((d) => d.seat === 0)?.amount ?? 0);
        const before = calls.sent.length;
        flow.update(0, show.until - 1);
        expect(flow.show.kind).toBe('results');
        flow.update(0, show.until);
        expect(flow.show.kind).toBe('waiting');
        const sent = calls.sent.slice(before);
        expect(sent).toEqual(flow.me().placement === null ? [{ type: 'ready' }] : []);
        readies += sent.length;
      } else if (show.kind === 'waiting') {
        // Out of the game, nobody waits for the person: the step runs out.
        host.time += flow.state!.step.ms ?? 0;
        connection.update();
      }
      await flush();
    }
    expect(flow.show.kind).toBe('over');
    expect(flow.me().placement).not.toBeNull();
    expect(rounds).toBeGreaterThan(5);
    expect(readies).toBeGreaterThan(5);
    connection.close();
  });
});

describe("while the person's fight plays", () => {
  const state = (kind: 'planning' | 'fight' | 'council', stage: number, round: number, hp: number, gold = 10) =>
    ({
      stage,
      round,
      step: { kind, ms: 30000 },
      council: null,
      me: { seat: 0, hp, gold, streak: 0, placement: null, board: [null], gifts: [] },
      players: [{ seat: 0, hp, gold, streak: 0, placement: null }],
      ready: [],
    }) as unknown as MatchView;
  const record = (home: number, away: number): RoundRecord => ({
    stage: 2,
    round: 1,
    fights: [
      {
        kind: 'pvp',
        home,
        away,
        input: {
          seed: 3,
          stage: 2,
          teams: { A: [{ unitId: 'sam', star: 1, col: 3, row: 0, items: [] }], B: [{ unitId: 'gimli', star: 2, col: 3, row: 0, items: ['blade'] }] },
          gifts: { A: [], B: ['shire-folk'] },
        },
        result: { outcome: 'B', survivors: { A: [], B: [{ unitId: 'gimli', star: 2 }] }, finalTick: 90 },
      },
    ],
    damage: [{ seat: 0, amount: 7 }],
    eliminated: [],
    places: [],
  });

  it('show the HUD and players list from the planning it was fought from, then the latest once it ends', () => {
    const { flow } = recorded();
    const planning = state('planning', 2, 1, 100);
    flow.receive({ type: 'state', state: state('planning', 2, 1, 100) }, 0);
    flow.receive({ type: 'state', state: planning }, 10);
    expect(flow.shownView()).toBe(planning);
    flow.receive({ type: 'round', round: record(0, 1) }, 20);
    // The fight step's views have the fight's damage in them, and the person shops: 4 gold spent.
    flow.receive({ type: 'state', state: state('fight', 2, 1, 93) }, 20);
    expect(flow.canShop).toBe(true);
    const later = state('fight', 2, 1, 93, 6);
    flow.receive({ type: 'state', state: later }, 30);
    expect(flow.show.kind).toBe('fight');
    expect([flow.shownView().me.hp, flow.shownView().players[0]!.hp]).toEqual([100, 100]);
    expect(flow.shownView().me.gold).toBe(6);
    flow.skip(40);
    expect(flow.canShop).toBe(true);
    expect(flow.show.kind).toBe('results');
    expect(flow.shownView()).toBe(later);
    // The next round's planning.
    const next = state('planning', 2, 2, 93);
    flow.receive({ type: 'state', state: next }, 5000);
    expect(flow.shownView()).toBe(next);
  });

  it('send shop actions while the fights play, until the next step, but no picks', () => {
    const { flow, calls } = recorded();
    flow.receive({ type: 'state', state: state('planning', 2, 1, 100) }, 0);
    flow.receive({ type: 'round', round: record(0, 1) }, 10);
    flow.receive({ type: 'state', state: state('fight', 2, 1, 93) }, 10);
    flow.act({ type: 'reroll' });
    flow.act({ type: 'pick', option: 0 });
    flow.skip(20);
    flow.act({ type: 'buyXp' });
    // A Council comes next: no more shopping.
    flow.receive({ type: 'state', state: state('council', 2, 2, 93) }, 5000);
    expect(flow.canShop).toBe(false);
    flow.act({ type: 'reroll' });
    expect(calls.sent).toEqual([
      { type: 'act', action: { type: 'reroll' } },
      { type: 'act', action: { type: 'buyXp' } },
    ]);
  });

  it('show the latest view when the page never saw the planning, as on joining mid-fight', () => {
    const { flow } = recorded();
    flow.receive({ type: 'round', round: record(0, 1) }, 0);
    const fight = state('fight', 2, 2, 93);
    flow.receive({ type: 'state', state: fight }, 0);
    expect(flow.show.kind).toBe('fight');
    expect(flow.shownView()).toBe(fight);
    // A planning view from an earlier round isn't the one this fight came from.
    const { flow: other } = recorded();
    other.receive({ type: 'state', state: state('planning', 1, 4, 100) }, 0);
    other.receive({ type: 'round', round: record(0, 1) }, 0);
    other.receive({ type: 'state', state: fight }, 0);
    expect(other.shownView()).toBe(fight);
  });

  it("track the traits of the person's side in the fight, with its Gifts, and otherwise their board", () => {
    const { flow } = recorded();
    flow.you = 1;
    const planning = state('planning', 2, 1, 100);
    flow.receive({ type: 'state', state: planning }, 0);
    expect(flow.trackedTeam()).toBe(planning.me);
    const round = record(0, 1);
    flow.receive({ type: 'round', round }, 10);
    // Knocked out in it, the person's board would be empty in the views that follow.
    flow.receive({ type: 'state', state: state('fight', 2, 2, -3) }, 10);
    const team = flow.trackedTeam();
    expect(team.board).toBe(round.fights[0]!.input.teams.B);
    expect(team.gifts).toEqual(['shire-folk']);
    // The same each frame, so the tracker isn't drawn again.
    expect(flow.trackedTeam()).toBe(team);
  });
});

describe('round results', () => {
  const fight = (home: number, away: number, outcome: 'A' | 'B' | 'draw'): FightRecord => ({
    kind: 'pvp',
    home,
    away,
    input: { seed: 1, stage: 3, teams: { A: [], B: [] } },
    result: { outcome, survivors: { A: [], B: [] }, finalTick: 0 },
  });

  /** A flow in seat 1 of a game whose players have these placements. */
  function inGame(placements: (number | null)[], mePlacement: number | null = null) {
    const { flow } = recorded();
    flow.you = 1;
    flow.lobby = { code: 'ABCDE', host: 0, started: true, seats: placements.map((_, i) => ({ kind: 'bot', name: `Bot ${i}`, connected: false })) };
    flow.state = {
      players: placements.map((placement, seat) => ({ seat, placement })),
      me: { placement: mePlacement },
    } as unknown as MatchView;
    return flow;
  }

  it('list the person first, then by damage, with knockouts and their places from the round', () => {
    // Players a round knocks out are placed only when its fight step ends, so the places come from the round.
    const flow = inGame([null, null, null, null, null]);
    const round: RoundRecord = {
      stage: 3,
      round: 2,
      fights: [fight(0, 1, 'A'), fight(2, 3, 'B')],
      damage: [
        { seat: 4, amount: 9 },
        { seat: 2, amount: 12 },
        { seat: 1, amount: 6 },
        { seat: 0, amount: 6 },
      ],
      eliminated: [2, 4],
      places: [7, 8],
    };
    const results = flow.results(round, false);
    expect(results).toMatchObject({ stage: 3, round: 2, type: 'pvp', outcome: 'Defeat', taken: 6, waiting: false });
    expect(results.rows).toEqual([
      { seat: 1, name: 'You', you: true, damage: 6, knockedOut: null },
      { seat: 2, name: 'Bot 2', you: false, damage: 12, knockedOut: 7 },
      { seat: 4, name: 'Bot 4', you: false, damage: 9, knockedOut: 8 },
      { seat: 0, name: 'Bot 0', you: false, damage: 6, knockedOut: null },
    ]);
  });

  it('say when there was no fight of yours, and wait only while you are in', () => {
    const round: RoundRecord = { stage: 3, round: 2, fights: [fight(2, 3, 'draw')], damage: [], eliminated: [], places: [] };
    expect(inGame([null, null, null, null]).results(round, true)).toMatchObject({ outcome: 'No fight', taken: 0, rows: [], waiting: true });
    expect(inGame([null, 4, null, null], 4).results(round, true).waiting).toBe(false);
    expect(inGame([null, null, null, null]).results({ ...round, fights: [fight(1, 3, 'draw')] }, false).outcome).toBe('Draw');
  });
});

describe('the timer', () => {
  it('counts down from the time its step started with, and starts again with each step and Council group', () => {
    const { flow } = recorded();
    const state = (kind: 'council' | 'planning', ms: number, group = 0) =>
      ({ stage: 2, round: 1, step: { kind, ms }, council: kind === 'council' ? { group } : null, me: { placement: null } }) as unknown as MatchView;
    flow.receive({ type: 'state', state: state('council', 15000) }, 0);
    expect([flow.secondsLeft(0), flow.timerShare(0)]).toEqual([15, 1]);
    expect([flow.secondsLeft(5000), flow.timerShare(6000)]).toEqual([10, 0.6]);
    // A later state of the same turn keeps the turn's length.
    flow.receive({ type: 'state', state: state('council', 9000) }, 6000);
    expect(flow.timerShare(6000)).toBe(0.6);
    flow.receive({ type: 'state', state: state('council', 15000, 1) }, 7000);
    expect(flow.timerShare(7000)).toBe(1);
    flow.receive({ type: 'state', state: state('planning', 45000) }, 8000);
    expect([flow.secondsLeft(8000 + 44001), flow.timerShare(8000 + 22500), flow.timerShare(8000 + 60000)]).toEqual([1, 0.5, 0]);
  });
});

describe('the Council', () => {
  it('waits only for the others in the group picking now who have not picked yet', () => {
    const { flow } = recorded();
    const option = (pickedBy: number | null) => ({ unitId: 'sam', item: 'blade', ring: false, pickedBy });
    const council = (picks: (number | null)[], groups: number[][], group: number) =>
      ({ council: { options: picks.map(option), groups, group } }) as unknown as MatchView;
    expect(flow.councilWaiting()).toEqual([]);
    // Seats 1 and 3 have picked, and you are seat 0.
    flow.state = council([1, null, 3, null], [[0, 1, 2, 3, 4]], 0);
    expect(flow.councilWaiting()).toEqual([2, 4]);
    // Only the group picking now counts.
    flow.state = council([0, null, null], [[0, 5], [6, 7]], 1);
    expect(flow.councilWaiting()).toEqual([6, 7]);
    flow.state = { council: null } as unknown as MatchView;
    expect(flow.councilWaiting()).toEqual([]);
  });
});

describe("other players' boards", () => {
  /** A flow in seat 1, in a step of this kind, with players whose placements are these. */
  function viewing(kind: 'council' | 'planning' | 'over', placements: (number | null)[]) {
    const { flow } = recorded();
    flow.you = 1;
    flow.state = {
      step: { kind, ms: 30000 },
      players: placements.map((placement, seat) => ({ seat, placement, board: [], bench: [] })),
      me: { placement: placements[1] },
      ring: { state: 'held', holder: 3, bearer: 42, corruption: 5, hobbitFights: 0 },
    } as unknown as MatchView;
    flow.show = { kind };
    return flow;
  }

  it('shows another player still in, and the person\'s own again with their seat, null or a fight', () => {
    const flow = viewing('planning', [null, null, null, 8]);
    expect([flow.canViewBoards, flow.viewed()]).toEqual([true, null]);
    flow.viewBoard(2);
    expect(flow.viewed()).toBe(flow.state!.players[2]);
    // Someone who is out has nothing left to show, so the view stays where it was.
    expect(flow.canViewBoard(3)).toBe(false);
    flow.viewBoard(3);
    expect(flow.viewed()?.seat).toBe(2);
    flow.viewBoard(0);
    expect(flow.viewed()?.seat).toBe(0);
    flow.viewBoard(1);
    expect(flow.viewed()).toBeNull();
    flow.viewBoard(2);
    flow.viewBoard(null);
    expect(flow.viewed()).toBeNull();
    // A seat that isn't in the game.
    flow.viewBoard(9);
    expect(flow.viewed()).toBeNull();

    // The round's fights bring the person's own board back for the next step.
    flow.viewBoard(2);
    const round: RoundRecord = { stage: 2, round: 1, fights: [], damage: [], eliminated: [], places: [] };
    flow.receive({ type: 'round', round }, 0);
    expect([flow.canViewBoards, flow.viewed()]).toEqual([false, null]);
    flow.show = { kind: 'planning' };
    expect(flow.viewed()).toBeNull();
  });

  it("starts planning after a Council on the person's own board, and keeps the view through later states of a step", () => {
    const flow = viewing('council', [null, null, null]);
    const state = (kind: 'council' | 'planning', round: number): MatchView => ({ ...flow.state!, round, step: { kind, ms: 30000 }, council: null });
    flow.receive({ type: 'state', state: state('council', 4) }, 0);
    flow.viewBoard(2);
    // A later state of the Council, such as another group's turn.
    flow.receive({ type: 'state', state: state('council', 4) }, 1000);
    expect(flow.viewed()?.seat).toBe(2);
    // The Council is over and the next round's planning starts, with no fights between them.
    flow.receive({ type: 'state', state: state('planning', 5) }, 2000);
    expect([flow.show.kind, flow.viewed()]).toEqual(['planning', null]);
    flow.viewBoard(2);
    flow.receive({ type: 'state', state: state('planning', 5) }, 3000);
    expect(flow.viewed()?.seat).toBe(2);
  });

  it('can be looked at in a Council too, but not once the game is over for the person', () => {
    const council = viewing('council', [null, null, null]);
    council.viewBoard(2);
    expect(council.viewed()?.seat).toBe(2);
    const over = viewing('over', [null, 3, null]);
    over.viewBoard(2);
    expect([over.canViewBoards, over.viewed()]).toEqual([false, null]);
  });

  it('goes back to the person\'s board when the player looked at is knocked out', () => {
    const flow = viewing('planning', [null, null, null]);
    flow.viewBoard(2);
    flow.state = { ...flow.state!, players: flow.state!.players.map((p) => (p.seat === 2 ? { ...p, placement: 3 } : p)) };
    expect(flow.viewed()).toBeNull();
  });

  it("knows where the One Ring is on any player's board", () => {
    const flow = viewing('planning', [null, null, null, null]);
    expect(flow.ringOf(3)).toEqual({ bearer: 42, corruption: 5 });
    expect([flow.ringOf(2), flow.planningRing()]).toEqual([null, null]);
  });

  it('shows the boards and traits of the bots in an offline game, as the game has them', async () => {
    const host = fakeHost();
    let connection: LocalConnection | null = null;
    const { flow } = recorded((message) => connection!.send(message));
    connection = new LocalConnection(7, { message: (m) => flow.receive(m, host.time), closed: () => {} }, { host, autoUpdate: false });
    await flush();
    let looked = 0;
    let activeTraits = 0;
    for (let i = 0; i < 3000 && flow.show.kind !== 'over' && looked < 6; i++) {
      const { show } = flow;
      if (show.kind === 'planning') {
        looked++;
        for (const p of flow.state!.players) {
          flow.viewBoard(p.seat);
          const viewed = flow.viewed();
          if (p.seat === flow.you || p.placement !== null) {
            expect(viewed).toBeNull();
            continue;
          }
          expect(viewed).toEqual(p);
          activeTraits += traitRows(viewed!.board, viewed!.gifts).filter((row) => row.level !== null).length;
        }
        flow.ready();
      } else if (show.kind === 'fight') {
        expect(flow.viewed()).toBeNull();
        flow.update(1000, host.time);
      } else if (show.kind === 'results') {
        flow.update(0, show.until);
      } else {
        host.time += flow.state!.step.ms ?? 0;
        connection.update();
      }
      await flush();
    }
    expect(looked).toBe(6);
    expect(activeTraits).toBeGreaterThan(0);
    connection.close();
  });
});

describe('the damage meter', () => {
  it('follows each of your fights as it plays, then has the whole of it through the results and waiting, even when skipped', async () => {
    const host = fakeHost();
    let connection: LocalConnection | null = null;
    const { flow } = recorded((message) => connection!.send(message));
    connection = new LocalConnection(5, { message: (m) => flow.receive(m, host.time), closed: () => {} }, { host, autoUpdate: false });
    await flush();
    /** The whole of each of the person's fights so far, as the meter had it after the fight. */
    const recaps: (readonly CombatEvent[])[] = [];
    let waitedAfterFight = false;
    // The meter after a fight: the last fight's recap if this round had one of the person's fights, otherwise nothing.
    const expectRecap = (round: RoundRecord) => {
      if (yourFight(round, 0) === null) expect(flow.meterFight()).toBeNull();
      else expect(flow.meterFight()!.events).toBe(recaps.at(-1));
    };
    for (let i = 0; i < 3000 && !(recaps.length >= 2 && waitedAfterFight); i++) {
      const { show } = flow;
      if (show.kind === 'council') {
        expect(flow.meterFight()).toBeNull();
        host.time += flow.state!.step.ms ?? 0;
        connection.update();
      } else if (show.kind === 'waiting') {
        expectRecap(show.round);
        if (yourFight(show.round, 0) !== null) waitedAfterFight = true;
        host.time += flow.state!.step.ms ?? 0;
        connection.update();
      } else if (show.kind === 'planning') {
        expect(flow.meterFight()).toBeNull();
        flow.ready();
      } else if (show.kind === 'fight') {
        flow.update(0.2, host.time);
        expect(flow.meterFight()).toEqual({ events: show.playback.combat.events, team: yourTeam(show.fight, 0) });
        expect(show.playback.combat.isOver()).toBe(false);
        flow.skip(host.time);
        const recap = flow.meterFight()!;
        expect(recap.team).toBe(yourTeam(show.fight, 0));
        expect(recap.events).toEqual(simulateCombat(show.fight.input).events);
        expect(recap.events.at(-1)?.type).toBe('end');
        // A new recap for each fight, not the last one's.
        if (recaps.length > 0) expect(recap.events).not.toBe(recaps.at(-1));
        recaps.push(recap.events);
        // Worked out once.
        expect(flow.meterFight()!.events).toBe(recap.events);
      } else if (show.kind === 'results') {
        expectRecap(show.round);
        flow.update(0, show.until);
        // Waiting, until the game's answer to Ready arrives.
        const waiting = flow.show;
        expect(waiting.kind).toBe('waiting');
        if (waiting.kind === 'waiting') {
          expectRecap(waiting.round);
          if (yourFight(waiting.round, 0) !== null) waitedAfterFight = true;
        }
      }
      await flush();
    }
    expect(recaps.length).toBeGreaterThanOrEqual(2);
    expect(waitedAfterFight).toBe(true);
    connection.close();
  });
});

describe('results', () => {
  it('name outcomes for the team played, order standings and write places', () => {
    expect([outcomeText('A', 'A'), outcomeText('B', 'A'), outcomeText('draw', 'B')]).toEqual(['Victory', 'Defeat', 'Draw']);
    const players = [
      { seat: 0, placement: 3, hp: -4 },
      { seat: 1, placement: null, hp: 20 },
      { seat: 2, placement: 2, hp: 0 },
      { seat: 3, placement: null, hp: 60 },
    ];
    expect(standings(players).map((p) => p.seat)).toEqual([3, 1, 2, 0]);
    expect([1, 2, 3, 4, 11].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th']);
  });
});
