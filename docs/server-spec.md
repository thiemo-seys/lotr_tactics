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

- Accounts, ranking, the ranked queue, parties and friends: specified in [`accounts-spec.md`](accounts-spec.md), which changes parts of this spec (its section 12). Its first two steps are built: guest accounts in Postgres, seats by account, and history and stats for private lobbies; then Google sign-in, claimed accounts' unique names and deleting accounts. This spec describes the server as it is now, with those changes.
- A public list of lobbies.
- Saving games. Lobbies live in memory, so a restart ends every game. `accounts-spec.md` section 10 drains the server instead, so games in progress finish before a restart.
- Several server processes.
- Watching other players' fights in the client. Their boards can be looked at in a Council and in planning (`game-spec.md` section 12), from the views, which include them.
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
| Idle lobbies | After 60 seconds with nobody connected, a lobby that hasn't started closes, and a started one plays its game out with bots, reports it and closes |
| Hidden information | Other players' shops, shop locks, XP and Gift offers, the pool and the seed |
| Names | People's come from their accounts (`accounts-spec.md` section 6.3). Bots are named Bot 1, Bot 2 and so on, in seat order |
| Seats | Belong to accounts. One lobby and one connection per account |
| Offline games | The same match runner in the browser, with one person and 7 bots, and no server |

---

## 3. Package layout

`packages/server`, the third package in `design.md` section 10. Everything except `server.ts`, `main.ts` and `src/node/` uses neither Node nor the DOM, so the client can run it in the browser for offline games. ESLint enforces this: no Node, `ws` or `pg` imports, nothing from `./node/`, and no `process`, `Buffer`, `Date` or timers outside them. Time and randomness come in through a `Host` object (section 4). The Node-only `src/node/` folder has the database, sessions, Google sign-in, the HTTP API and recording results (`accounts-spec.md` section 3).

```
packages/server/
  src/
    index.ts       the browser-safe entry, imported by the client as @lotr-tactics/server
    config.ts      timers and limits
    host.ts        the Host interface: time and randomness
    players.ts     the Player a connection carries, and account names
    accounts.ts    what the account API answers with: profiles, history, stats, the sign-in's result
    protocol.ts    message types, and checking messages from clients
    view.ts        what a seat sees of the game and of a round
    results.ts     a finished match's result, with final boards
    match.ts       one game: steps, timers, bots and Ready votes
    lobby.ts       one lobby: seats, host, start, connections
    lobbies.ts     every lobby on a server: codes, joining, connections by account, closing idle lobbies
    server.ts      the Node server: HTTP, static files, the API and WebSockets
    main.ts        reads the settings, migrates the database and starts the server
    node/          Node only: db.ts, store.ts, sessions.ts, google.ts, api.ts, record.ts (accounts-spec.md section 3)
  migrations/      plain SQL, applied in order at start-up
  scripts/db.ts    `pnpm db`: a Postgres container for development
  test/
```

- The server needs Postgres (`accounts-spec.md` section 3). `pnpm db` starts one for development, which `pnpm dev` and `pnpm start` use unless `DATABASE_URL` is set.
- `pnpm dev` runs the client's Vite server and the game server together. Vite passes `/ws`, `/api` and `/auth` on to the game server.
- `pnpm start` builds the client, then runs the server, which serves `packages/client/dist`, the API and `/ws` on one port (`PORT`, default 8080).
- The server runs TypeScript directly with `tsx`, like the balance runner.

---

## 4. Host

The browser-safe code gets time and randomness from a `Host`:

```ts
interface Host {
  now(): number;       // milliseconds, from any fixed start
  random(): number;    // [0, 1), for lobby codes and game seeds
}
```

- The Node server uses `performance.now` and `crypto.randomInt`. An offline game uses `performance.now` and `Math.random`.
- Nothing has its own timers. The owner calls `update()` about every 100 ms, which runs anything whose time has come. Tests use a fake host and move its clock forward.
- A game's seed comes from `random`. It is never sent to clients.
- There is no `token`: seats belong to accounts (`accounts-spec.md` section 12).

---

## 5. Match runner

`Match` runs one `Game` for 8 seats. Each seat is a person or a bot. Each seat also has a `Bot` (`game-spec.md` section 11), which plays it while no connected person is in it.

### 5.1 Steps

The match is always in one step:

| Step | Ends | Then |
|---|---|---|
| `council` | When every member of the current group has picked, or after 15 seconds, when `advance()` picks for anyone who hasn't | The next group's `council` turn, or `planning` |
| `planning` | After 30 seconds, or 45 if anyone has a Gift offer when it starts, or once every connected person still in the game is Ready. It ends with `fight()`, which runs the fights | `fight`; after the start round (1-1), which has no fights, the runner advances at once to the next `planning`, with no `round` message |
| `fight` | After the round's longest fight, plus 1, 4 and 2 seconds (section 2), or once every connected person still in the game has finished watching | The game's next phase: `council` or `planning` |
| `over` | When the lobby closes | |

- **Entering a step:**
  - **Council:** bots in the current group pick at once. If that completes the group, the next group starts.
  - **Planning:** bots plan, in an order that rotates by one seat each round, as in the offline game.
- **Early ends:** a step ends early only if at least one connected person still in the game counts towards it. With nobody connected, steps run on their timers.
- **Ready** applies to the current step and resets when the next one starts. In planning it means "end planning". In a fight step it means "I've finished watching". It can't be taken back.
- **During a fight step** the game is in its fight phase (`game-spec.md` section 9.4): people can shop and use their bench, and the game's rules refuse anything that touches the board. Planning ends with `fight()`, and the fight step with `advance()`, which pays the fights' gold and loot and starts the next round: its income, and new shops.
- **Everyone out:** once every seat with a person is out, the bots play the rest of the game at once, and the match goes to `over`. A lobby whose people have all been away for 60 seconds does the same (section 7).
- **Over:** the match calls its `over` callback once, from which the lobby reports the result (`accounts-spec.md` section 9.1). The match keeps each seat's board from its latest fight for it.

### 5.2 Seats

- A seat with a person is played by that person while they are connected.
- **Disconnecting** passes the seat to its bot from that moment. If the seat is in planning, the bot plans at once. If it's the seat's Council turn, the bot picks at once.
- **Rejoining** gives the seat back from that moment. Anything the bot did stays.
- **Leaving** during a game gives the seat to its bot for good. The person can't rejoin it.
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

Names come from accounts and seats belong to accounts (`accounts-spec.md` section 12). Later, the queue makes ranked lobbies alongside these private ones.

- **Codes:** 5 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, which leaves out characters that look alike. Codes are not case-sensitive and are unique among open lobbies.
- **Seats:** 8, numbered 0 to 7. A person joining takes the lowest free seat. Leaving before the start frees the seat.
- **Names:** each person's comes from their account, and the lobby shows a rename at once. The rules for names are in `accounts-spec.md` section 6.3.
- **Seats by account:** a seat belongs to the account that joined. `rejoin` with the code gives it back on a new connection of that account. If the seat is still connected somewhere else, that older connection gets `replaced` and is dropped.
- **One connection per account:** `Lobbies.connect` greets a new connection with `hello`. If the account already has a connection, the older one gets `replaced` and is closed, and its seat moves to the new one at once (`accounts-spec.md` section 6.1).
- **Start:** only the host can start, before the game has started. Empty seats become bots, named Bot 1, Bot 2 and so on, in seat order.
- **One lobby per account:** a connection that is in a lobby has to leave before it can create or join another, and an account with a seat in a lobby whose game isn't over can't create or join another from any connection.
- **Closing:** a lobby that hasn't started closes 60 seconds after its last person disconnects, or as soon as everyone has left. A started lobby with nobody connected for 60 seconds plays its game out with bots and reports it (`accounts-spec.md` section 12). A lobby whose game is over closes as soon as nobody is connected.
- **Results:** `Lobbies` takes `onResult` in its options, and each lobby calls it once when its game ends, with a `MatchResult` (`accounts-spec.md` section 9.1). The Node server records it; an offline game passes none, so nothing is reported.
- **Limits:** at most 200 open lobbies on a server.

---

## 8. Protocol

JSON text messages over one WebSocket. The HTTP API next to it is in `accounts-spec.md` section 11.1, and the messages still to come with ranked play and friends in its section 11.2.

**Client to server**

```ts
type ClientMessage =
  | { type: 'create' }                   // names come from accounts
  | { type: 'join'; code: string }
  | { type: 'rejoin'; code: string }     // the seat must belong to this account
  | { type: 'start' }
  | { type: 'leave' }
  | { type: 'act'; action: Action }      // game-spec.md section 10
  | { type: 'ready' };
```

**Server to client**

```ts
type ServerMessage =
  | { type: 'hello'; me: AccountView; game: { code: string } | null }   // first message; game if the account has a seat in a lobby whose game isn't over
  | { type: 'joined'; code: string; seat: number }   // after create, join or rejoin
  | { type: 'lobby'; lobby: LobbyView }      // whenever seats, the host or connections change
  | { type: 'state'; state: MatchView }      // whenever the game, the step or Ready votes change
  | { type: 'round'; round: RoundRecord }    // when a round with fights ends its planning, just before the fight step's state
  | { type: 'left'; reason: string }         // the connection is no longer in a lobby
  | { type: 'refused'; request: ClientMessage['type'] | 'unknown'; reason: string }   // 'unknown' for a malformed message
  | { type: 'replaced' }                     // the account connected somewhere else, which took over; this connection closes
  | { type: 'signedOut'; reason: 'everywhere' | 'deleted' };   // the account was signed out everywhere or deleted; this connection closes

interface LobbyView {
  code: string;
  host: number | null;         // seat of the host; null in a ranked lobby
  ranked: boolean;             // false until the ranked queue is built
  started: boolean;
  seats: SeatView[];           // 8, in seat order
}

interface SeatView {
  kind: 'empty' | 'person' | 'bot';
  name: string;                // '' for an empty seat
  connected: boolean;          // false for bots and empty seats
  player: string | null;       // the person's account id; null for bots and empty seats
  guest: boolean;              // a person without a claimed account; false for bots and empty seats
}
```

`AccountView` is in `accounts-spec.md` section 11.1. `guest` is false for the offline player, who has no account. Fields a client sends beyond these, such as the old `name` and `token`, are ignored.

- Anything the client sends that isn't allowed gets `refused` with a reason, and changes nothing. Examples: a message that doesn't match `ClientMessage`, an unknown code, a full or started lobby, `start` from someone who isn't the host, or an action the game refuses.
- `act` is refused outside the `council` and `planning` steps, and from seats that are out.
- After `joined`, the server sends `lobby`. Once the game has started, it also sends `state`, and during a fight step, the `round` first. A person who rejoins mid-fight can therefore play the fight from the start.
- `left` is sent after `leave`. `replaced` is sent when the account's seat or connection moves to another connection. `signedOut` is sent when the account signs out everywhere or is deleted (`accounts-spec.md` sections 6.1 and 6.4); the seat is disconnected, so its bot plays it, and the page doesn't reconnect.
- On a reconnect, `hello` comes first. If it names a game the page doesn't know, the page sends `rejoin` with its code.

---

## 9. Server process

- An HTTP server on `PORT` (default 8080). It serves the files in `packages/client/dist` if they exist, answers `/api/*` (`accounts-spec.md` section 11.1) and `/auth/google` with its callback (section 6.2), and upgrades `/ws` to a WebSocket.
- **Settings:** `PORT`, `DATABASE_URL` (required), `PUBLIC_URL`, `TRUST_PROXY`, and `GOOGLE_CLIENT_ID` with `GOOGLE_CLIENT_SECRET`, without which Google sign-in is off (`accounts-spec.md` section 3). Start-up applies the migrations, and stops with a message if there is no database.
- **The upgrade** needs an `Origin` header matching `PUBLIC_URL` (403 otherwise) and a valid session cookie (401 otherwise). The connection carries the account's `Player`.
- Finished games are recorded in Postgres (`accounts-spec.md` section 9.2), and expired sessions and old guests are cleaned up at start-up and every hour.
- `lobbies.update()` runs every 100 ms.
- **Limits:**
  - Messages are at most 4 KB.
  - A connection that sends more than 100 messages in 5 seconds is closed.
  - Connections are pinged every 30 seconds and dropped if they don't answer.
- A dropped connection counts as a disconnect (section 5.2).
- SIGINT and SIGTERM close the server, which ends every game, then the database pool. Draining comes later (`accounts-spec.md` section 10).
- **Deployment:** the `Dockerfile` builds the client and runs the server from its source with `tsx`, as the `node` user, on `PORT`. `compose.yaml` runs it with Postgres (`db`, with a `pg_data` volume and `POSTGRES_PASSWORD` from `.env`), passes it `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from `.env` when they are there, and puts it behind Caddy (`Caddyfile`), which serves HTTPS for the domain in `DOMAIN`, redirects HTTP, passes `/ws` through, compresses text and `.glb` models, and caches the hashed files in `/assets/` for a year. Only Caddy's ports 80 and 443 are open on the host. The steps are in `README.md`.

---

## 10. Client

`accounts-spec.md` section 14 changes the menu and reconnecting, and adds the account's screens.

The play page (`game-spec.md` section 12) talks to a `Connection`. The connection sends `ClientMessage`s and delivers `ServerMessage`s, either from a WebSocket or from a match running in the page. The page shows only what the messages tell it. `session.ts` is replaced by the connections.

- **Menu**, shown when `play.html` opens without a hash, once the account has loaded (`accounts-spec.md` section 14), over the board dimmed and blurred, under the game's title. The board is empty behind it and behind the lobby screen, since leaving a game clears it, so nothing there moves or is drawn. The menu has:
  - the account's name, with its guest mark and a pencil to rename;
  - Play against bots, the main button;
  - Create lobby;
  - Join, with a code field;
  - while online play is unavailable or connecting, a note saying so, with Try again when unavailable;
  - Profile and Account, which open the profile and the account panel in its place.
- **Links:**
  - `play.html#seed=7` starts an offline game with that seed straight away, as before.
  - `play.html#lobby=CODE` opens the menu with the code filled in.
- **Lobby screen:**
  - the code, large, and an icon button that copies the join link;
  - the 8 seats as cards, with names and icons for people, bots and empty seats, the host, and whether each person is connected or away;
  - Start, for the host only;
  - Leave.
- **The game** works as it does offline, but it follows the server's steps and timers:
  - Ready sends `ready` and shows how many others are still planning.
  - After a fight and its results, the client sends `ready` and waits for the next step. Skipping the fight brings the results forward. The person can shop until the next step starts.
  - If the next step starts before the client has finished showing the fight, it moves on to the new step at once.
  - Names come from the lobby, which has them from accounts. The players list shows bots, and people who are disconnected.
- **Offline:** a `LocalConnection` creates a lobby in the page, with one person called You (the `local` player, with no account), and starts it at once. It reports no result. Its host uses the browser's clock. With nobody else in the game, Ready and skipping end steps at once, so it plays like the old offline game.
- **Reconnecting:**
  - Before opening the WebSocket, the client calls `GET /api/me`, which makes a guest if the browser has no session. If the upgrade is refused, it calls it again and retries once.
  - The page opens the WebSocket as soon as the account has loaded and the menu is on screen, not only for Create or Join, and keeps it open on the menu, in lobbies and in online games. An offline game closes it, and going back to the menu opens it again.
  - The client keeps the lobby code in session storage, and rejoins it as the WebSocket opens.
  - If the WebSocket closes during a game, the client reconnects after 1, 2, 4 and 8 seconds and rejoins. If it closes on the menu, or reconnecting fails, online play is unavailable until Try again.
  - Reloading the page rejoins too, and so does a `hello` naming a game other than the one the page rejoined as it opened, after a reload, in another tab or on another device.
  - If the lobby is gone, the client returns to the menu with a message.
  - On `replaced`, the client goes back to the menu and doesn't reconnect, so two pages don't take the account from each other in turn. A banner says the game is open somewhere else, with Use here, which connects again and takes the seat back (`accounts-spec.md` section 14).
  - A `round` the page is already showing, as a rejoin sends it again, doesn't start its fight over.
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
- Rejoining by account, refusing another account, one lobby per account, and replacing the older connection.
- Idle lobbies closing, and idle started lobbies playing out and reporting.
- Results: 8 seats with places 1 to 8 and final boards, leavers' places, and nothing reported offline.
- Malformed messages are refused without changing anything.

**Server** (against Postgres; skipped with a message without `DATABASE_URL`)
- Two WebSocket clients on a real server join one lobby, play it to the end, and both find it in their history.
- The upgrade is refused without a session or with a wrong `Origin`; the API's guests, renames, sign-out and rate limits.
- Google sign-in against a fake Google on localhost, unique names, and deleting accounts (`accounts-spec.md` section 16).

**Client**
- An offline game through `LocalConnection` reaches its end.
- In a browser, two pages play the first rounds of a game in one lobby with no console errors.
