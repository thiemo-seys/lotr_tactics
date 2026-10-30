# Server Spec

Implementation spec for online play: lobbies, a server that runs games authoritatively, and bots in the seats people don't fill. This is step 4 of the build order (`design.md` section 11).

- `design.md` is the source of truth for game rules. `game-spec.md` defines the game the server runs; this spec only adds who plays each seat, when things happen, and what goes over the network.
- Every timer and limit here is a *placeholder*. They live in `packages/server/src/config.ts`, not in logic.

---

## 1. Scope

**In scope**

- Lobbies of 8 seats that people create and join with a code. When the host starts, bots take the empty seats.
- The match runner: it runs one game on the server (`createGame` from `game-spec.md` section 10), with the timers, the bots and the Ready votes.
- What each player is allowed to see, and the messages between client and server.
- Disconnecting and rejoining. A bot plays the seat while its person is away.
- A Node server: WebSockets, plus the built client served from the same port.
- The play page gains a menu, a lobby screen and online games. Offline games against 7 bots run the same match runner in the browser.

**Out of scope (later)**

- Accounts, ranking, a public list of lobbies and a matchmaking queue.
- Saving games. Lobbies live in memory, so a restart ends every game.
- Several server processes, and hosting and deployment.
- Watching other players' fights in the client. Their boards can be scouted during a Council or planning (`game-spec.md` section 12), since views already include them.
- Chat and emotes.

---

## 2. Defaults set by this spec

These are not in `design.md` yet. They were chosen to remove ambiguity and can be changed.

| Topic | Default |
|---|---|
| Transport | Plain WebSockets (the `ws` package) with JSON messages, at `/ws` on the page's own origin |
| Lobby size | 8 seats. Bots take the empty seats when the game starts |
| Joining | With a 5-character code, or a link to `play.html#lobby=CODE`. No public lobby list |
| Host | The person who created the lobby. If the host leaves before the start, the person in the lowest seat becomes host |
| Starting | The host starts with 1 to 8 people. Nobody can join after the start |
| Council turn | 15 seconds for each group, as in the offline game. Bots pick at once |
| Planning | 30 seconds (`design.md` section 9), or 45 in a round with a Gift offer. It ends early once every connected person still in the game is Ready |
| Fight step | The round's longest fight, plus 1 second, 4 seconds of results and 2 seconds of slack. It ends early once every connected person still in the game has finished watching |
| Disconnecting | The seat's bot plays it until the person rejoins |
| Leaving a game | The seat's bot plays it for the rest of the game |
| Everyone out | Once every person is out, the rest of the game plays out at once |
| Idle lobbies | Closed after 60 seconds with nobody connected |
| Hidden information | Other players' shops, shop locks, XP and Gift offers, the pool and the seed |
| Names | 1 to 20 characters. Bots are named Bot 1, Bot 2 and so on, in seat order |
| Offline games | The same match runner in the browser, with one person and 7 bots, and no server |

---

## 3. Package layout

`packages/server`, the third package in `design.md` section 10. Everything except `server.ts` and `main.ts` uses neither Node nor the DOM, so the client can run it in the browser for offline games. ESLint enforces this: no Node or `ws` imports and no `process`, `Buffer`, `Date` or timers outside those two files. Time and randomness come in through a `Host` object (section 4).

```
packages/server/
  src/
    index.ts       the browser-safe entry, imported by the client as @lotr-tactics/server
    config.ts      timers and limits
    host.ts        the Host interface: time and randomness
    protocol.ts    message types, and checking messages from clients
    view.ts        what a seat sees of the game and of a round
    match.ts       one game: steps, timers, bots and Ready votes
    lobby.ts       one lobby: seats, host, start, connections
    lobbies.ts     every lobby on a server: codes, joining, closing idle lobbies
    server.ts      the Node server: HTTP, static files and WebSockets
    main.ts        reads PORT and starts the server
  test/
```

- `pnpm dev` runs the client's Vite server and the game server together. Vite passes `/ws` on to the game server.
- `pnpm start` builds the client, then runs the server, which serves `packages/client/dist` and `/ws` on one port (`PORT`, default 8080).
- The server runs TypeScript directly with `tsx`, like the balance runner.

---

## 4. Host

The browser-safe code gets time and randomness from a `Host`:

```ts
interface Host {
  now(): number;       // milliseconds, from any fixed start
  random(): number;    // [0, 1), for lobby codes and game seeds
  token(): string;     // an unguessable string, for rejoining
}
```

- The Node server uses `performance.now`, `crypto.randomInt` and `crypto.randomUUID`. An offline game uses `performance.now`, `Math.random` and `crypto.randomUUID`.
- Nothing has its own timers. The owner calls `update()` about every 100 ms, which runs anything whose time has come. Tests use a fake host and move its clock forward.
- A game's seed comes from `random`. It is never sent to clients.

---

## 5. Match runner

`Match` runs one `Game` for 8 seats. Each seat is a person or a bot. Each seat also has a `Bot` (`game-spec.md` section 11), which plays it while no connected person is in it.

### 5.1 Steps

The match is always in one step:

| Step | Ends | Then |
|---|---|---|
| `council` | When every member of the current group has picked, or after 15 seconds, when `advance()` picks for anyone who hasn't | The next group's `council` turn, or `planning` |
| `planning` | After 30 seconds, or 45 if anyone has a Gift offer when it starts, or once every connected person still in the game is Ready. It ends with `advance()`, which runs the fights | `fight` |
| `fight` | After the round's longest fight, plus 1, 4 and 2 seconds (section 2), or once every connected person still in the game has finished watching | The game's next phase: `council` or `planning` |
| `over` | When the lobby closes | |

- **Entering a step:**
  - **Council:** bots in the current group pick at once. If that completes the group, the next group starts.
  - **Planning:** bots plan, in an order that rotates by one seat each round, as in the offline game.
- **Early ends:** a step ends early only if at least one connected person still in the game counts towards it. With nobody connected, steps run on their timers.
- **Ready** applies to the current step and resets when the next one starts. In planning it means "end planning". In a fight step it means "I've finished watching". It can't be taken back.
- **During a fight step** the game has already moved on to the next round, so it refuses every action until the next step starts. This includes paying income and rolling shops.
- **Everyone out:** once every seat with a person is out, the bots play the rest of the game at once, and the match goes to `over`.

### 5.2 Seats

- A seat with a person is played by that person while they are connected.
- **Disconnecting** passes the seat to its bot from that moment. If the seat is in planning, the bot plans at once. If it's the seat's Council turn, the bot picks at once.
- **Rejoining** gives the seat back from that moment. Anything the bot did stays.
- **Leaving** during a game gives the seat to its bot for good. The person's token stops working.
- Seats keep the numbers they had in the lobby. Each bot has the seed and the seat, so a match with the same seed and the same people's actions plays out the same way.

### 5.3 Fight step length

- A fight lasts `finalTick / TICKS_PER_SECOND` seconds.
- The step length is the round's longest fight, plus 1 second for the finished fight to stay on screen, plus 4 seconds of results, plus 2 seconds of slack for slow connections.

---

## 6. Views

Each seat gets its own view of the game. The server never sends the seed or the pool.

```ts
interface MatchView {
  you: number;                 // the seat this view is for
  step: StepView;
  stage: number;
  round: number;
  type: RoundType;
  phase: Phase;
  me: PlayerView;              // the receiver's own player, in full
  players: PublicPlayer[];     // everyone, in seat order, including the receiver
  council: CouncilState | null;
  ring: RingView;              // the One Ring, which everyone sees (game-spec.md section 9.11)
  ready: number[];             // seats that are Ready in this step
}

interface StepView {
  kind: 'council' | 'planning' | 'fight' | 'over';
  ms: number | null;           // milliseconds left when sent, or null for over
}

type PublicPlayer = Omit<PlayerView, 'shop' | 'shopLocked' | 'xp' | 'giftOffer' | 'giftRerolled'>;
```

- A round is sent as a `RoundRecord`. This is a `RoundReport` whose fight results leave out their events, which are long and can be replayed from the input. A client replays a fight with `createCombat(fight.input)`.
- `ms` counts from when the message was sent, so clients don't need clocks that agree with the server.

---

## 7. Lobbies

- **Codes:** 5 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, which leaves out characters that look alike. Codes are not case-sensitive and are unique among open lobbies.
- **Seats:** 8, numbered 0 to 7. A person joining takes the lowest free seat. Leaving before the start frees the seat.
- **Names:** trimmed, with control characters removed, and cut to 20 characters. An empty name becomes "Player n", where n is the seat plus 1.
- **Tokens:** each person in a lobby gets a token when they join. `rejoin` with the code and the token gives them their seat back on a new connection. If the seat is still connected somewhere else, that older connection is told so and dropped.
- **Start:** only the host can start, before the game has started. Empty seats become bots, named Bot 1, Bot 2 and so on, in seat order.
- **One lobby per connection:** a connection that is in a lobby has to leave before it can create or join another.
- **Closing:** a lobby closes 60 seconds after its last person disconnects or leaves. A lobby whose game is over closes as soon as nobody is connected.
- **Limits:** at most 200 open lobbies on a server.

---

## 8. Protocol

JSON text messages over one WebSocket.

**Client to server**

```ts
type ClientMessage =
  | { type: 'create'; name: string }
  | { type: 'join'; code: string; name: string }
  | { type: 'rejoin'; code: string; token: string }
  | { type: 'start' }
  | { type: 'leave' }
  | { type: 'act'; action: Action }      // game-spec.md section 10
  | { type: 'ready' };
```

**Server to client**

```ts
type ServerMessage =
  | { type: 'joined'; code: string; seat: number; token: string }   // after create, join or rejoin
  | { type: 'lobby'; lobby: LobbyView }      // whenever seats, the host or connections change
  | { type: 'state'; state: MatchView }      // whenever the game, the step or Ready votes change
  | { type: 'round'; round: RoundRecord }    // when planning ends, just before the fight step's state
  | { type: 'left'; reason: string }         // the connection is no longer in a lobby
  | { type: 'refused'; request: ClientMessage['type'] | 'unknown'; reason: string };   // 'unknown' for a malformed message

interface LobbyView {
  code: string;
  host: number;                // seat of the host
  started: boolean;
  seats: SeatView[];           // 8, in seat order
}

interface SeatView {
  kind: 'empty' | 'person' | 'bot';
  name: string;                // '' for an empty seat
  connected: boolean;          // false for bots and empty seats
}
```

- Anything the client sends that isn't allowed gets `refused` with a reason, and changes nothing. Examples: a message that doesn't match `ClientMessage`, an unknown code, a full or started lobby, `start` from someone who isn't the host, or an action the game refuses.
- `act` is refused outside the `council` and `planning` steps, and from seats that are out.
- After `joined`, the server sends `lobby`. Once the game has started, it also sends `state`, and during a fight step, the `round` first. A person who rejoins mid-fight can therefore play the fight from the start.
- `left` is sent after `leave`, when the lobby closes, and when the same seat rejoins from another connection.

---

## 9. Server process

- An HTTP server on `PORT` (default 8080). It serves the files in `packages/client/dist` if they exist, and upgrades `/ws` to a WebSocket.
- `lobbies.update()` runs every 100 ms.
- **Limits:**
  - Messages are at most 4 KB.
  - A connection that sends more than 100 messages in 5 seconds is closed.
  - Connections are pinged every 30 seconds and dropped if they don't answer.
- A dropped connection counts as a disconnect (section 5.2).
- SIGINT and SIGTERM close the server, which ends every game.

---

## 10. Client

The play page (`game-spec.md` section 12) talks to a `Connection`. The connection sends `ClientMessage`s and delivers `ServerMessage`s, either from a WebSocket or from a match running in the page. The page shows only what the messages tell it. `session.ts` is replaced by the connections.

- **Menu**, shown when `play.html` opens without a hash:
  - a name field, remembered in local storage;
  - Play against bots;
  - Create lobby;
  - Join, with a code field.
- **Links:**
  - `play.html#seed=7` starts an offline game with that seed straight away, as before.
  - `play.html#lobby=CODE` opens the menu with the code filled in.
- **Lobby screen:**
  - the code, and a button that copies the join link;
  - the 8 seats, with names, the host and who is connected;
  - Start, for the host only;
  - Leave.
- **The game** works as it does offline, but it follows the server's steps and timers:
  - Ready sends `ready` and shows how many others are still planning.
  - After a fight and its results, the client sends `ready` and waits for the next step. Skipping the fight brings the results forward.
  - If the next step starts before the client has finished showing the fight, it moves on to the new step at once.
  - Names come from the lobby. The players list shows bots, and people who are disconnected.
- **Offline:** a `LocalConnection` creates a lobby in the page, with one person called You, and starts it at once. Its host uses the browser's clock. With nobody else in the game, Ready and skipping end steps at once, so it plays like the old offline game.
- **Reconnecting:**
  - The client keeps the code and token in session storage.
  - If the WebSocket closes during a game, the client reconnects after 1, 2, 4 and 8 seconds and rejoins.
  - Reloading the page rejoins too.
  - If the lobby is gone, the client returns to the menu with a message.
- **Game over:** the final standings with names, and Back to menu. A person who is out sees their place and the live standings until the game ends.

---

## 11. Known limits

- **Fight seeds:** these come from the game generator (`game-spec.md` section 4). Someone with enough patience could search the 2³² seeds and predict shops. This is accepted for now. A fix is to draw fight seeds from a separate secret seed.
- **Clients are trusted to watch fights honestly:** a client can send `ready` at once. This only shortens the wait for everyone, which the timers allow anyway.

---

## 12. Tests and acceptance criteria

**Match**
- Steps and their timers with a fake host: a Council turn, planning, the fight step, and the next round.
- Planning ends early when every connected person is Ready, and not when nobody is connected.
- Actions are refused during a fight step.
- Bots act for empty seats and for disconnected people, and stop when the person rejoins.
- Once every person is out, the game finishes at once with places 1 to 8 given out.
- A match with one person who is always Ready plays to the end.

**Views**
- A view hides other players' shops, shop locks, XP and Gift offers, the pool and the seed.
- Round records leave out events, and replaying a fight's input gives the recorded result.

**Lobbies and protocol**
- Creating, joining, the lowest free seat, a full lobby, unknown codes, joining after the start, and codes that ignore case.
- The host passing on, starting by the host only, and bots taking the empty seats.
- Rejoining with a token, a wrong token, and dropping the older connection.
- Idle lobbies closing.
- Malformed messages are refused without changing anything.

**Server**
- Two WebSocket clients on a real server join one lobby, start, and see the same Council.

**Client**
- An offline game through `LocalConnection` reaches its end.
- In a browser, two pages play the first rounds of a game in one lobby with no console errors.
