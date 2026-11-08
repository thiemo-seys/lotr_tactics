# Accounts Spec

Implementation spec for player accounts: who a person is across visits, signing in with Google, match history and stats, the ranked queue with its ratings and leaderboard, parties and friends. It builds on online play (`server-spec.md`), which it changes where section 12 says so. This is step 6 of the build order (`design.md` section 11).

- `design.md` is the source of truth for the rules of ranked play (`design.md` section 10, Accounts and ranked play). This spec adds the implementation detail and the defaults needed to build it.
- Every number here is a *placeholder*. They live in `packages/server/src/config.ts`, not in logic.
- Accounts are built for a small group of friends first, but nothing here should need rework when the server opens to the public. What is left for then is in section 13.

---

## 1. Scope

**In scope**

- **Identity:** every visitor gets a guest account at once, with no sign-up, kept in a cookie. The account follows them through lobbies, games and reconnects.
- **Google sign-in** to claim an account, so it works on other devices and can't be lost by clearing cookies.
- **Names:** claimed accounts have unique names. Guests have names that only claimed accounts reserve (section 6.3).
- **Match history and stats** for online games: ranked games and private lobbies.
- **The ranked queue:** solo or with one friend, filler bots after a wait, a hidden OpenSkill rating for matchmaking and visible points for the leaderboard.
- **Friends:** requests, presence, and invites to lobbies and parties.
- **Account deletion.**
- **Draining the server** on a deploy, so games in progress can finish.
- **Postgres** for everything that lasts, with a Postgres container in `compose.yaml`.
- The play page's account panel, profile, history, leaderboard, ranked queue, party and friends.

**Out of scope (later)**

- Saving games in progress across a restart (`server-spec.md` section 1). Draining (section 10) stands in for it.
- Seasons. Ratings and points are kept per season (section 8.6) so they can be added without moving data, but there is only season 1.
- Cosmetics, progression and rewards.
- Other sign-in methods (email, passkeys, Discord).
- Chat, a public list of lobbies, and spectating.
- The work before going public (section 13): name filtering, reporting, a privacy policy page.

**Offline games** against 7 bots run in the browser, and the server can't check their results. They don't count for anything on an account, and need no account.

---

## 2. Defaults set by this spec

These are not in `design.md` yet. They were chosen to remove ambiguity and can be changed.

| Topic | Default |
|---|---|
| Database | Postgres 17, through the `pg` package. One database for the server, set by `DATABASE_URL` |
| Guest accounts | Made on the first visit, with no sign-up. Kept in an `HttpOnly` cookie |
| Sign-in | Google (OpenID Connect, `openid` scope only). Only Google's subject id (`sub`) is stored, never an email |
| Sessions | A random secret in the cookie, stored hashed. 180 days, renewed on use |
| Names | 3 to 20 characters. Unique among claimed accounts, ignoring case. Guests can use any name a claimed account doesn't hold |
| One connection per account | A new connection replaces the older one, which is told so |
| Ranked | Claimed accounts only. Solo or a party of 2 |
| Ranked lobby | 8 people, or after 75 seconds in the queue, at least 2 people from different parties with bots in the other seats |
| Rating | OpenSkill (Weng-Lin, Plackett-Luce), hidden, for matchmaking |
| Points | Visible on the leaderboard: from +40 for 1st to -40 for 8th, moved towards the hidden rating, never below 0 |
| What counts | Ranked: rating, points, history and stats. Private lobbies: history and stats. Offline: nothing |
| Leaving | A bot plays the seat, and the seat's final place counts for its person |
| Friends | Claimed accounts only. At most 100 friends and 20 pending requests |
| Guests | Deleted, with their history, after 90 days unseen |
| Restarts | The server drains: no new lobbies or queueing, games in progress finish, for up to 45 minutes |
| Not stored | Emails, IP addresses, passwords |

---

## 3. Package layout

All of it is in `packages/server`. What touches the database, HTTP, cookies or Google is Node-only, in a new `src/node/` folder that ESLint treats like `server.ts` and `main.ts`. ESLint's browser-safe rule also gains `pg` and `src/node/` among the imports it refuses. The rest stays browser-safe and synchronous, as in `server-spec.md` section 3, so offline games run unchanged and the logic can be tested with a fake host.

```
packages/server/
  src/
    players.ts        browser-safe: the Player a connection carries (section 4)
    queue.ts          browser-safe: parties and the ranked queue (section 7)
    rating.ts         browser-safe: OpenSkill and points (section 8)
    results.ts        browser-safe: a finished match's result (section 9.1)
    lobby.ts          changed: seats belong to players (section 12)
    lobbies.ts        changed: ranked lobbies, results, draining (section 12)
    protocol.ts       changed: new messages (section 11)
    config.ts         changed: ACCOUNTS, NAMES, RANKED, SOCIAL, DRAIN
    server.ts         changed: sessions on upgrade, the HTTP API, draining
    main.ts           changed: reads the new settings
    node/
      db.ts           the Postgres pool and migrations
      store.ts        the Store interface and PgStore (section 5)
      memory-store.ts MemoryStore, for tests and for `pnpm dev` without Postgres
      sessions.ts     cookies and sessions
      google.ts       the Google sign-in flow
      api.ts          the HTTP API (section 11.1)
      social.ts       friends and presence
      record.ts       writing results, ratings and points
  migrations/
    001_accounts.sql  and so on, plain SQL applied in order at start-up
  test/
```

- `pnpm dev` and `pnpm start` use Postgres when `DATABASE_URL` is set, and otherwise a `MemoryStore` with a warning in the log, so the game runs with no database for a quick try. Nothing lasts across a restart without Postgres.
- In `pnpm dev`, Vite passes `/api` and `/auth` on to the game server, as it does `/ws` (`server-spec.md` section 3). The page's origin there is Vite's, `http://localhost:5173`, so that is the `PUBLIC_URL` to set for the `Origin` check and Google's redirect (section 6.2).
- Google sign-in is off unless `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. The client hides the button when it's off (section 11.2, `hello`).

### Settings

Read from the environment by `main.ts`:

| Variable | Use |
|---|---|
| `DATABASE_URL` | Postgres connection string, such as `postgres://lotr:secret@db:5432/lotr` |
| `PUBLIC_URL` | The site's own origin, such as `https://tactics.example.com`. Used for Google's redirect, the `Origin` check and whether cookies are `Secure`. Defaults to `http://localhost:<PORT>` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The Google OAuth client. Secrets go in `.env`, which is not committed |
| `TRUST_PROXY` | `1` behind Caddy, so `X-Forwarded-For` is used for rate limits |

---

## 4. Players

The browser-safe code never sees sessions, cookies or the database. A connection carries a `Player`, which `server.ts` looks up when the WebSocket opens:

```ts
interface Player {
  readonly id: string;        // the account id; 'local' in an offline game
  name: string;               // display name, kept current after a rename
  claimed: boolean;           // signed in with Google
  rating: Rating | null;      // the hidden ranked rating (section 8.1), null until loaded or for guests
}

interface Rating {
  readonly mu: number;
  readonly sigma: number;
}

interface Client {            // lobby.ts, changed
  readonly player: Player;
  send(message: ServerMessage): void;
}
```

- Lobby seats belong to a player id, not a token (section 12). Rejoining a game is by account, from any device.
- An offline game's `LocalConnection` makes a `Player` with id `local`, the name You and `claimed: false`, and its lobby reports no results.
- When `record.ts` changes a rating, or `api.ts` a name, the Node side updates the `Player` objects of the account's live connection, so the queue and lobby views stay current.

---

## 5. Storage

Postgres, with plain SQL migrations in `packages/server/migrations/`, applied in order inside one transaction each at start-up, and recorded in a `schema_migrations` table. A migration that fails stops the server.

```sql
create table accounts (
  id            uuid primary key,
  name          text not null,
  name_key      text not null,              -- the name folded for comparison (section 6)
  google_sub    text unique,                -- null for a guest
  created_at    timestamptz not null default now(),
  seen_at       timestamptz not null default now(),
  renamed_at    timestamptz
);
create unique index accounts_claimed_name on accounts (name_key) where google_sub is not null;

create table sessions (
  hash          bytea primary key,          -- SHA-256 of the cookie's secret
  account_id    uuid not null references accounts on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

create table matches (
  id            uuid primary key,
  kind          text not null check (kind in ('ranked', 'private')),
  season        int,                        -- ranked only
  started_at    timestamptz not null,
  ended_at      timestamptz not null,
  rounds        int not null                -- the stage and round it ended on, as stage * 10 + round
);

create table match_seats (
  match_id      uuid not null references matches on delete cascade,
  seat          int not null,
  account_id    uuid references accounts on delete set null,   -- null for a bot or a deleted account
  name          text not null,              -- as shown in that game
  place         int not null,
  left_game     boolean not null,
  board         jsonb not null,             -- section 9.1
  rating_before jsonb,                      -- ranked people only
  rating_after  jsonb,
  points_before int,
  points_after  int,
  primary key (match_id, seat)
);
create index match_seats_account on match_seats (account_id, match_id);

create table ratings (
  account_id    uuid not null references accounts on delete cascade,
  season        int not null,
  mu            double precision not null,
  sigma         double precision not null,
  points        int not null,
  games         int not null,
  primary key (account_id, season)
);
create index ratings_board on ratings (season, points desc);

create table friends (                       -- one row each way once accepted
  account_id    uuid not null references accounts on delete cascade,
  friend_id     uuid not null references accounts on delete cascade,
  since         timestamptz not null default now(),
  primary key (account_id, friend_id)
);

create table friend_requests (
  from_id       uuid not null references accounts on delete cascade,
  to_id         uuid not null references accounts on delete cascade,
  sent_at       timestamptz not null default now(),
  primary key (from_id, to_id)
);
```

- `store.ts` defines a `Store` interface with one async method per use (find a session, create a guest, claim, rename, record a match, read history, and so on), implemented by `PgStore` and `MemoryStore`. Nothing outside `src/node/` imports `pg`.
- A match and its ratings are recorded in one transaction (section 9.2).
- **Clean-up**, once an hour: expired sessions, and guests not seen for 90 days, which deletes their history rows' links (the seats stay, as "Deleted player", for the other people in those games).
- **Backups:** `README.md` gains a `pg_dump` line to run from cron, and how to restore.

---

## 6. Identity, sessions and names

### 6.1 Guests and sessions

- The play page calls `GET /api/me` before it opens the WebSocket. With no valid session cookie, the server makes a guest account and a session, sets the cookie, and returns the account.
- **The cookie:** `lt_session`, 32 random bytes in base64url, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `PUBLIC_URL` is https, for 180 days. The database stores only its SHA-256. A session used more than a day after it was last renewed gets 180 more days.
- **The WebSocket** at `/ws` is on the same origin, so its upgrade request carries the cookie. `server.ts` checks the session, and the `Origin` header against `PUBLIC_URL`, before upgrading. Either failing gets HTTP 401 or 403 and no socket. The page then calls `/api/me` again and retries once.
- **Rate limit:** at most 10 new guests an hour from one address (with `TRUST_PROXY`, the first address in `X-Forwarded-For`). Kept in memory only.
- **One connection per account:** a new WebSocket for an account closes the older one with `{ type: 'replaced' }`, and the seat or queue place moves to the new one.
- **Sign out** deletes the session and clears the cookie. The page then gets a new guest. **Sign out everywhere** deletes all the account's sessions.

### 6.2 Signing in with Google

OpenID Connect's authorization code flow with PKCE, asking only for the `openid` scope.

1. `GET /auth/google` makes a `state` and a PKCE verifier, keeps both in a short-lived `HttpOnly` cookie (10 minutes), and redirects to Google with `redirect_uri = PUBLIC_URL + /auth/google/callback`.
2. `GET /auth/google/callback` checks `state`, swaps the code for tokens at Google's token endpoint with the verifier and the client secret, and reads the ID token. The ID token comes straight from Google over TLS, so its signature needs no separate check, but `iss`, `aud` and `exp` are checked.
3. With the `sub`:
   - **No account has that `sub`:** the current guest becomes claimed with it. Its history and name stay. If the guest's name is held by a claimed account, the page asks for a new one (section 6.3) before ranked or friends work.
   - **An account already has it:** the browser signs in to that account. A new session replaces the guest's. The guest account is not merged; it is left to be cleaned up (section 5). The page says so if the guest had played games.
4. Redirects back to `/play.html`.

- A claimed account can't be unlinked from Google; it can be deleted.
- Google's client id and secret are made in Google Cloud Console, with `PUBLIC_URL/auth/google/callback` as an allowed redirect. For `pnpm dev`, also `http://localhost:5173/auth/google/callback`. `README.md` gets the steps.

### 6.3 Names

- 3 to 20 characters after trimming, with control characters removed. Letters and digits of any script, spaces, and `' - _ .`. No two spaces in a row.
- **Comparing:** the `name_key` is the name in Unicode NFKC, lowercased, with spaces removed. Two names with the same key are the same name.
- **Claimed accounts' names are unique** by key. **Guests** can take any name no claimed account holds, and two guests can share one. Everywhere a name is shown, a guest's carries a small guest mark.
- New guests are named "Guest" and 4 random digits, which needn't be unique.
- **Renaming:** a claimed account can rename once every 7 days. A guest can rename freely. A name freed by a rename is free at once.
- Bots keep their names (`server-spec.md` section 7). People can't take a name of the form "Bot n" or "Guest" with digits.
- `cleanName` in `lobby.ts` cleans the name that `create` and `join` carry, and they lose it (section 11.2). People's names come from their accounts, checked when they are set. Bots' names are made in the lobby view, not by `cleanName`.

### 6.4 Deleting an account

- From the account panel, after typing the account's name to confirm.
- Deletes the account, its sessions, ratings, friends and requests. In other people's histories its seats stay with the name "Deleted player" and no link.
- Only possible while the account is not in a game, the queue or a party of 2.

---

## 7. Parties and the ranked queue

Browser-safe, in `queue.ts`, driven by `Lobbies.update()` with the host's clock.

### 7.1 Parties

- **Ranked only, for claimed accounts.** A party is 1 or 2 people. Everyone is a party of 1 until they invite someone.
- **Inviting** is by name, or from the friends list. The invited person must be claimed, online and not in a game, the queue or a party of 2. An invite lasts 60 seconds. A person has at most one invite out at a time.
- **In a game, party members are opponents** in separate seats, like everyone else. The party only decides that they queue and are matched together.
- Leaving, disconnecting for more than 30 seconds, or starting a game outside the party ends the party. Parties live in memory and end with a restart.
- Only the party's leader, the one who invited, can queue the party or leave the queue.

### 7.2 The queue

- **Joining:** a party joins with `queue`. Refused for guests, for anyone in a lobby or game, and while the server drains.
- **The queue checks every update**, oldest party first:
  - **A full lobby:** if 8 people can be taken from the queue, the oldest party and the parties closest to it in rating fill a lobby, in order of rating distance, without splitting a party. The rating gap allowed grows with the oldest party's wait: `RANKED.spread` (5) plus `RANKED.spreadPerSecond` (0.1) for each second, in ordinal. A party's rating is its members' average ordinal (section 8.1).
  - **Filler bots:** once the oldest party has waited `RANKED.fillSeconds` (75), and the queue holds at least 2 people who are not all in one party, everyone in the queue up to 8, oldest first without splitting a party, gets a lobby, and bots take the other seats.
  - A party of 2 alone in the queue keeps waiting, however long. So does a single person alone.
- **Matched:** the queue makes a ranked lobby with the people in random seats (from the host), sends each of them `joined` and starts the game at once. No host, no Start, nobody can join.
- **Leaving the queue** with `unqueue`, or by disconnecting for more than 30 seconds. A party member leaving takes the party out.
- Queue status goes to the party's members on joining and every 5 seconds: how long they've waited, and how many are in the queue.

### 7.3 Ranked games

- Played like any online game (`server-spec.md` section 5), with the same timers and bots.
- **Leaving or disconnecting:** the seat's bot plays it (`server-spec.md` section 5.2). The seat's final place counts for its person, whether they come back or not.
- **Bots** in ranked games, from filler seats or not, play as usual. They have a fixed rating for the update (section 8.2), and nothing about them is stored except their seat in the match.

---

## 8. Rating and points

Pure functions in `rating.ts`. They run once, on the server, when a ranked game ends, and are stored. Nothing replays them, so they aren't bound by the sim's determinism rules, but they are deterministic for the same input all the same, with seats in seat order.

### 8.1 Hidden rating (OpenSkill)

- **The model:** Weng-Lin with Plackett-Luce, as in the `openskill` package. Every seat is its own team of one, ranked by place. Party members are separate teams.
- **New accounts** start at `mu = 25`, `sigma = 25 / 3`, with `beta = 25 / 6` and `tau = 25 / 300` (the package's defaults).
- **The ordinal**, `mu - 3 * sigma`, is the single number used for matchmaking and for points.
- The rating is never shown to players. The profile shows points only.

### 8.2 Bots in the update

- Every bot seat takes part with a fixed rating, `RANKED.botMu` (25) and `RANKED.botSigma` (1), so beating a bot counts for a little, and finishing below one costs.
- The update's results for bots are thrown away.

### 8.3 Visible points

After the rating update, each person's points change by:

```
delta = base[place] + clamp(round((target - points) * convergence / 100), -cap, cap)
target = max(0, round((ordinal - zeroOrdinal) * pointsPerOrdinal))
points' = max(0, points + delta)
```

| Name | Default | Meaning |
|---|---|---|
| `base` | `[40, 30, 20, 10, -10, -20, -30, -40]` | By place, 1st to 8th |
| `convergence` | 10 | Percent of the gap to `target` closed each game |
| `cap` | 15 | Most the convergence can add or take away in one game |
| `zeroOrdinal` | 0 | The ordinal that maps to 0 points |
| `pointsPerOrdinal` | 40 | Points for each step of ordinal |

- Points start at 0. They follow the hidden rating over time, so the leaderboard rewards skill, not just games played.
- A person's first `RANKED.placementGames` (5) ranked games count as placement games: their points are shown on the profile, but the account is not on the leaderboard until they're done.

### 8.4 Leaderboard

- Claimed accounts with at least `placementGames` ranked games in the season, by points, then by ordinal, then by account creation time, then by id.
- `GET /api/leaderboard` gives the top 100 and the asker's own rank.

### 8.5 Showing a change

- The game-over screen of a ranked game shows each person's points before and after, which `record.ts` sends as `{ type: 'ranked', ... }` once the transaction commits (section 11.2).

### 8.6 Seasons

- `RANKED.season` is 1. Ratings and points are per season. A new season starts everyone at the defaults. Starting one is a config change and a restart. Nothing else about seasons is built yet.

---

## 9. History and stats

### 9.1 What a match reports

When a game ends, its lobby reports a `MatchResult` (browser-safe, `results.ts`) through `LobbiesOptions.onResult`:

```ts
interface MatchResult {
  kind: 'ranked' | 'private';
  durationMs: number;          // from the host's clock
  lastRound: { stage: number; round: number };
  seats: SeatResult[];         // all 8, in seat order
}

interface SeatResult {
  seat: number;
  player: string | null;       // the account id, null for a bot
  name: string;
  place: number;               // 1 to 8
  left: boolean;               // left the game for good
  board: FinalBoard;
}

interface FinalBoard {
  level: number;
  units: { unit: UnitId; star: Star; items: ItemId[] }[];   // the board, not the bench
  traits: { trait: TraitId; count: number; tier: number }[];  // active traits only
  ringBearer: UnitId | null;   // whoever wore the One Ring, if this seat had it
}
```

- The board is the one the seat fought its last fight with: in the round it went out, or the last round for the winner. The game empties a seat's board when it places it (`game-spec.md` section 9.9, step 6), so `match.ts` can't read it then. It keeps each living seat's board from the fight phase, before the `advance()` that places seats, and when the bots play the rest at once (`server-spec.md` section 5.1, Everyone out), from `Autopilot.playUntil`'s `afterPlanning` hook.
- Offline games and games that don't finish report nothing. A game cut short by a restart is voided: nothing is written for it.

### 9.2 Recording

- `record.ts` writes the match and its seats. For a ranked game, in the same transaction, it reads the people's ratings for the season with `select ... for update`, runs section 8, and writes ratings, points and the before and after values on the seats.
- A failed write is retried 3 times, then logged with the whole result as JSON, so it can be replayed by hand.

### 9.3 Stats

Worked out from `match_seats` by SQL when asked for, not stored:

- games, wins, top-4 rate and average place, for ranked and for all online games;
- the 5 units most often on the final board, the 5 traits most often active, and how often the person bore the One Ring;
- points, rank and placement games left, for ranked.

### 9.4 History

- `GET /api/history?account=<id>&before=<match id>` gives 20 matches at a time, newest first: kind, date, place, points change, the final board, and the other 7 seats' names, places and boards.
- Anyone can see a claimed account's profile and history. A guest's are shown only to the guest.

---

## 10. Draining

- **SIGTERM or SIGINT** start draining:
  - `create`, `join` and `queue` are refused with "The server is restarting for an update.", and the queue is emptied.
  - Lobbies that haven't started are closed, with `left` and that reason.
  - Every connection gets `{ type: 'notice', text }` saying so.
  - Games in progress play on. Once none is left, the server exits.
- After `DRAIN.maxSeconds` (2700, 45 minutes), or on a second signal, it exits at once. Games still running are voided.
- `compose.yaml` sets the game's `stop_grace_period` to 50 minutes, so Docker waits for it.
- `README.md`'s update steps say an update waits for running games, and how to force it (`docker compose kill game`).

---

## 11. Protocol

### 11.1 HTTP API

JSON over HTTP from `api.ts`, on the same port. Every request that changes anything must have an `Origin` header matching `PUBLIC_URL` and a valid session. Bodies are at most 4 KB.

| Request | Does |
|---|---|
| `GET /api/me` | The asker's account (`AccountView`), making a guest if there is no session |
| `POST /api/me/name` `{ name }` | Renames, with the reason if it can't |
| `POST /api/signout` | Section 6.1. `{ everywhere: true }` for every device |
| `POST /api/me/delete` `{ confirm }` | Section 6.4; `confirm` is the account's name |
| `GET /auth/google`, `GET /auth/google/callback` | Section 6.2 |
| `GET /api/profile?account=<id>` | Name, guest or not, stats (section 9.3) |
| `GET /api/history?account=<id>&before=<match id>` | Section 9.4 |
| `GET /api/leaderboard` | Section 8.4 |
| `GET /api/friends` | Friends with presence, and requests both ways |
| `POST /api/friends/request` `{ name }` | Sends a request, or accepts one from them if there is one |
| `POST /api/friends/accept` / `decline` / `remove` `{ account }` | |

```ts
interface AccountView {
  id: string;
  name: string;
  claimed: boolean;
  canRename: boolean;          // false within 7 days of a claimed account's last rename
  googleEnabled: boolean;      // sign-in is configured on this server
}
```

- Errors are `{ error: string }`, with 400 for bad input, 401 without a session, 403 for a wrong `Origin`, 404 for an unknown account, and 429 when rate limited.
- At most 60 requests a minute from one session.

### 11.2 WebSocket messages

The messages in `server-spec.md` section 8 change as follows.

**Client to server**

```ts
type ClientMessage =
  | { type: 'create' }                          // no name: it comes from the account
  | { type: 'join'; code: string }
  | { type: 'rejoin'; code: string }            // no token: the seat must belong to this account
  | { type: 'start' }
  | { type: 'leave' }
  | { type: 'act'; action: Action }
  | { type: 'ready' }
  | { type: 'queue' }                           // section 7.2
  | { type: 'unqueue' }
  | { type: 'partyInvite'; name: string }       // section 7.1
  | { type: 'partyAnswer'; from: string; accept: boolean }
  | { type: 'partyLeave' }
  | { type: 'lobbyInvite'; friend: string };    // invite a friend to your private lobby
```

**Server to client**, added:

```ts
type ServerMessage =
  | ...                                          // as in server-spec.md, with 'joined' losing its token
  | { type: 'hello'; me: AccountView; game: { code: string } | null }   // first message; game if the account has a seat in a running game
  | { type: 'queue'; status: QueueView | null }
  | { type: 'party'; party: PartyView | null; invites: PartyInvite[] }
  | { type: 'friends'; online: FriendPresence[]; requests: { in: FriendRef[]; out: FriendRef[] } }   // on connecting, and when presence or requests change
  | { type: 'lobbyInvite'; from: string; name: string; code: string }
  | { type: 'ranked'; seats: { seat: number; before: number; after: number }[] }   // section 8.5
  | { type: 'notice'; text: string }             // section 10
  | { type: 'replaced' };                        // section 6.1

interface QueueView { waitedSeconds: number; queued: number }
interface PartyView { leader: string; members: { id: string; name: string }[] }
interface PartyInvite { from: string; name: string; expiresInSeconds: number }
interface FriendRef { id: string; name: string }
interface FriendPresence { id: string; name: string; status: 'online' | 'queue' | 'lobby' | 'game' }
```

- `LobbyView` gains `ranked: boolean`, and its `host` becomes `number | null`, null in a ranked lobby, and each `SeatView` gains `player: string | null` (the account id for people, for links to profiles) and `guest: boolean`.
- Presence is only sent to friends. Offline friends are left out of `friends`; `GET /api/friends` lists everyone.

---

## 12. Changes to online play

- **Seats** (`lobby.ts`): a member is a player id, a name and a connection. `rejoin` gives a seat back to a connection with the same player id. The per-lobby tokens and `Host.token` go, and the client stops keeping the code and token in session storage. After a reload or on another device, `hello` says which game the account is in, and the page rejoins it.
- **One lobby per account:** an account in a lobby, game or queue can't create, join or queue elsewhere. Leaving a started game for good (`leave`) frees the account.
- **Replaced connections:** the older connection gets `replaced` (section 6.1) instead of `left`, which `server-spec.md` section 8 sends when a seat rejoins from another connection.
- **Lobby kinds:** `private` (made with `create`, as now) and `ranked` (made by the queue). Private lobbies keep everything in `server-spec.md` section 7, and guests can play them.
- **Idle started lobbies:** instead of closing 60 seconds after the last person disconnects (`server-spec.md` section 7), a lobby whose game has started plays the rest of its game out at once with bots, as when everyone is out (`server-spec.md` section 5.1), and reports its result. Disconnected people's places count, as in section 7.3. Only a restart voids a game.
- **Results:** `Lobbies` takes `onResult` in its options and calls it when a lobby's game ends (section 9.1).
- **Draining:** `Lobbies.drain()` (section 10), and `Lobbies.running` for how many games are still going.
- **Names** come from players, and are updated in the lobby view if a person renames while in it.

---

## 13. Before going public

Not built now, so the server can open up later:

- a short privacy page saying what is stored (section 2, Not stored) and how to delete an account;
- a name filter for slurs, and a way for an admin to rename an account;
- reporting a player;
- per-address limits on WebSocket connections;
- checking that the database's backups restore.

---

## 14. Client

The play page (`game-spec.md` section 12, `server-spec.md` section 10). The account is loaded with `GET /api/me` before the menu shows.

- **Menu:**
  - The name field goes. In its place, the account's name with the guest mark, a pencil to rename, and Sign in with Google for guests (hidden if `googleEnabled` is false).
  - Play against bots, Create lobby and Join stay.
  - **Ranked**, for claimed accounts: Find game, or Find game with your party. Guests see it disabled, with "Sign in with Google to play ranked."
  - Buttons for Profile, Leaderboard and Friends.
- **Queue:** while queued, a bar over the menu shows the wait and how many are queued, with Cancel. When matched, the page goes straight into the game.
- **Party:** a small panel on the menu with the party's members, Invite (by name or from friends) and Leave. Invites arrive as a toast with Accept and Decline.
- **Friends panel:** friends with presence, requests in and out, Add by name, and for each friend Invite to party, Invite to lobby (while in a private lobby) and View profile. Lobby invites arrive as a toast with Join.
- **Profile:** name, stats (section 9.3), points and rank, and the history, with each match opening to all 8 final boards. Names in a history link to those profiles.
- **Leaderboard:** the top 100 and your own rank.
- **Account panel:** rename, sign out, sign out everywhere, delete account.
- **In a game:** the players list and lobby cards show guest marks. Ranked games show "Ranked" in the HUD.
- **Game over** of a ranked game shows the points change once `ranked` arrives.
- **Notices** (`notice`, `replaced`) show as a banner. On `replaced`, the page offers Use here, which reconnects.
- **Reconnecting** works as in `server-spec.md` section 10, but rejoins by account instead of a token.
- The logic for these screens (queue status, the party, presence, formatting history) goes in modules without the DOM, as the play page's others do.

---

## 15. Deployment

- The `Dockerfile` copies `packages/server/migrations` into the image, next to `src`, which is all it copies of the server now.
- `compose.yaml` gains a `db` service, `postgres:17`, with a `pg_data` volume, a health check, and its password from `POSTGRES_PASSWORD` in `.env`. Its port is not opened on the host. The `game` service gets `DATABASE_URL`, `PUBLIC_URL=https://${DOMAIN}`, `TRUST_PROXY=1` and the Google settings from `.env`, depends on `db` being healthy, and has the 50-minute `stop_grace_period`.
- The Caddyfile needs no change: `/api/*` and `/auth/*` go to the game like everything else. Caddy sets `X-Forwarded-For`.
- `README.md`, Deploying: the new `.env` values, making the Google client, and backups.
- CI starts a `postgres:17` service for the tests that need it (section 16), and the image smoke test runs without `DATABASE_URL`, on a `MemoryStore`.

---

## 16. Tests and acceptance criteria

**Browser-safe, with a fake host**
- **Queue:** 8 people make a full lobby at once. Parties are never split. The rating spread grows with the wait. After 75 seconds, 2 solo people get a lobby with 6 bots. A party of 2 alone, or 1 person alone, keeps waiting. `unqueue` and disconnects remove the party. Guests and people in a lobby are refused.
- **Parties:** invite, accept, decline, expiry, only one invite out at a time, only claimed and free people, only the leader queues.
- **Rating:** a 1st place gains and an 8th loses. Bots' rating doesn't change. Party members are rated separately. The same input gives the same output. Points never go below 0 and follow the rating over a run of games.
- **Results:** a finished private game and a finished ranked game report 8 seats with places 1 to 8 and final boards. A leaver's seat reports their place. A started lobby with nobody connected plays out and reports its result. Offline games report nothing.
- **Seats by account:** rejoin with the same player id works from a new connection, and with another id is refused. One lobby per account.
- **Draining:** create, join and queue are refused, lobbies that haven't started close, running games finish, and `running` reaches 0.

**Node side, against Postgres (skipped with a clear message when `DATABASE_URL` isn't set; CI sets it)**
- Migrations apply on an empty database and are a no-op the second time.
- Guests, sessions (stored hashed, renewed, expired), sign-out and sign-out everywhere.
- Names: unique among claimed accounts ignoring case and NFKC, guests sharing a name, a guest who can't claim with a taken name until they rename, the 7-day rename limit.
- Claiming with a new `sub`, and signing in to an existing one.
- Recording a ranked match updates ratings, points and seats in one transaction, and a failure in the middle leaves nothing.
- Deleting an account keeps other people's history with "Deleted player".
- Friends: request, accept, decline, remove, a mutual request accepting itself, the limits.
- The same tests run against `MemoryStore`, so both stores behave alike.

**Server**
- The WebSocket upgrade is refused without a session or with a wrong `Origin`.
- Google's endpoints faked: the callback with a wrong `state` is refused, a new `sub` claims the guest.
- Two clients with claimed accounts queue, wait out the filler timer, play a ranked game to the end, and both see the points change.

**Client**
- In a browser: a guest renames, plays a private lobby game, and sees it in their history. Ranked is disabled for the guest.
