# Accounts Spec

Implementation spec for player accounts: who a person is across visits, signing in with Google, match history and stats, the ranked queue with its ratings and leaderboard, parties and friends. It builds on online play (`server-spec.md`), which it changes where section 12 says so. This is step 6 of the build order (`design.md` section 11).

**Built so far: steps 1 and 2.** Step 1 is guest accounts, Postgres, seats by account, and match history and stats for private-lobby games. Step 2 is the server's side of Google sign-in, claimed accounts' unique names and deleting accounts. Together: sections 3 to 6, 9 without ranked, 11 for the requests and messages marked built, 12 without the queue and draining, 14 for guests (the menu's account, the account panel without deleting, the profile with history and final boards, guest marks, `replaced`, `signedOut` and reconnecting), and 15 without draining. The rest is still to build: the client's screens for step 2 (Sign in with Google and its result, a new name when `needsName` asks for one, deleting; section 14), parties and the queue (7), rating and points (8), draining (10), friends, and the client's screens for them (14).

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
| Database | Postgres 17, through the `pg` package. One database for the server, set by `DATABASE_URL`. The server needs it to start; there is no fallback |
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
    accounts.ts       browser-safe: what the account API answers with (sections 6.2, 9.3, 9.4), for the page too
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
      sessions.ts     cookies and sessions
      google.ts       the Google sign-in flow
      api.ts          the HTTP API (section 11.1)
      social.ts       friends and presence
      record.ts       writing results, ratings and points
  migrations/
    001_accounts.sql  and so on, plain SQL applied in order at start-up
  scripts/
    db.ts             `pnpm db`: a Postgres 17 container for development
  test/
```

- **The server always needs Postgres.** Without `DATABASE_URL`, `main.ts` stops with a message saying what to set and how to start a local database. If it can't reach the database or a migration fails, it stops too.
- **For development**, `pnpm db` starts a Postgres 17 container, `lotr-tactics-db`, on `127.0.0.1:5433` with user, password and database `lotr`, its data in the `lotr-tactics-db` volume. It is safe to run again: it starts the container if it is stopped, leaves it if it runs, and waits until it takes connections. `pnpm dev` and `pnpm start` use it unless `DATABASE_URL` is set (they pass `--dev-db` to `main.ts`; the Docker image doesn't, so a deploy without `DATABASE_URL` stops).
- Offline games against bots need neither the server nor a database.
- In `pnpm dev`, Vite passes `/api` and `/auth` on to the game server, as it does `/ws` (`server-spec.md` section 3). The page's origin there is Vite's, `http://localhost:5173`, so that is the `PUBLIC_URL` for the `Origin` check and Google's redirect (section 6.2); `pnpm dev` makes it the default (it passes `--vite` to `main.ts`).
- Google sign-in is off unless `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; with only one of them, the server says so as it starts. The client hides the button when it's off (`AccountView.googleEnabled`, in `GET /api/me` and `hello`).

### Settings

Read from the environment by `main.ts`:

| Variable | Use |
|---|---|
| `DATABASE_URL` | Postgres connection string, such as `postgres://lotr:secret@db:5432/lotr` |
| `PUBLIC_URL` | The site's own origin, such as `https://tactics.example.com`. Used for Google's redirect, the `Origin` check and whether cookies are `Secure`. Defaults to `http://localhost:<PORT>`, or `http://localhost:5173` in `pnpm dev` |
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
- An offline game's `LocalConnection` makes a `Player` with id `local` (`LOCAL_PLAYER_ID`), the name You and `claimed: false` (`localPlayer()`), and its lobby reports no results: its `Lobbies` has no `onResult`. It has no account, so it is not a guest either: `isGuest(player)` is true only for an account that isn't claimed, and `SeatView.guest` comes from it, so the page needs no special case for You.
- `Client` also has an optional `close()`, which `Lobbies` calls on a connection it replaces (section 6.1).
- `players.ts` also has the name rules of section 6.3, `checkName` and `nameKey`, so the client can check a name before sending it.
- When `record.ts` changes a rating, `api.ts` a name, or `google.ts` claims an account, the Node side updates the `Player` objects of the account's live connection (`Lobbies.updatePlayer`), so the queue and lobby views stay current: a claim takes the guest mark off the person's seat at once.

---

## 5. Storage

Postgres, with plain SQL migrations in `packages/server/migrations/`, applied in name order inside one transaction each at start-up, and recorded in a `schema_migrations` table (`name`, `applied_at`). A migration that fails stops the server. An advisory lock keeps two servers from migrating at once. The first migration, `001_accounts.sql`, makes `accounts`, `sessions`, `matches` and `match_seats`, with indexes for clean-up and history as well as the ones below. A migration once deployed is never edited: the next, `002_google.sql`, adds `needs_name` and makes the unique index on names leave out accounts that need a new name (section 6.3). `ratings`, `friends` and `friend_requests` come in later migrations with the steps that use them.

```sql
create table accounts (
  id            uuid primary key,
  name          text not null,
  name_key      text not null,              -- the name folded for comparison (section 6)
  google_sub    text unique,                -- null for a guest
  needs_name    boolean not null default false,   -- claimed, but must pick a new name (section 6.3); 002_google.sql
  created_at    timestamptz not null default now(),
  seen_at       timestamptz not null default now(),
  renamed_at    timestamptz
);
create unique index accounts_claimed_name on accounts (name_key) where google_sub is not null and not needs_name;

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

- `store.ts` defines a `Store` interface with one async method per use (find a session, create a guest, claim, rename, record a match, read history, and so on), implemented by `PgStore`. Tests that need a store that fails use a fake of the interface. Nothing outside `src/node/` imports `pg`. Times that rules depend on (session expiry, renewal, seen, clean-up) are passed in, so tests can set them.
- A match and its ratings are recorded in one transaction (section 9.2).
- **Clean-up**, at start-up and once an hour: expired sessions, and guests not seen for 90 days, which deletes their history rows' links (the seats stay, as "Deleted player", for the other people in those games). A seat's `name` is set to "Deleted player" (`DELETED_NAME` in `accounts.ts`) when its account is deleted, since a null `account_id` alone can't tell a deleted person from a bot. A match left with no seat linked to an account, which nobody can see any more, is deleted with it. An account is seen whenever its session is used (`/api/me`, other API requests and the WebSocket upgrade).
- **A game that ends after one of its people was deleted** is still recorded: that seat is written with no link and the name "Deleted player", so the others' result isn't lost to the foreign key.
- **Backups:** `README.md` gains a `pg_dump` line to run from cron, and how to restore.

---

## 6. Identity, sessions and names

### 6.1 Guests and sessions

- The play page calls `GET /api/me` before it opens the WebSocket. With no valid session cookie, the server makes a guest account and a session, sets the cookie, and returns the account.
- **The cookie:** `lt_session`, 32 random bytes in base64url, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `PUBLIC_URL` is https, for 180 days. The database stores only its SHA-256. A session used more than a day after it was last renewed (its expiry less 180 days) gets 180 more days; an HTTP response that renews it sets the cookie again with the new `Max-Age`. The WebSocket upgrade renews it in the database only, and the next `/api/me` renews the cookie.
- **The WebSocket** at `/ws` is on the same origin, so its upgrade request carries the cookie. `server.ts` checks the session, and the `Origin` header against `PUBLIC_URL`, before upgrading. Either failing gets HTTP 401 or 403 and no socket. The page then calls `/api/me` again and retries once.
- **Rate limit:** at most 10 new guests an hour from one address (with `TRUST_PROXY`, the first address in `X-Forwarded-For`). Kept in memory only.
- **One connection per account:** a new WebSocket for an account closes the older one with `{ type: 'replaced' }`, and the seat or queue place moves to the new one. The seat moves without being disconnected, so its bot doesn't step in: the new connection gets `hello`, then `joined`, `lobby` and, in a game, the `round` and `state`, as after a `rejoin`. A seat in a game that is over doesn't move; it is disconnected.
- **Sign out everywhere** also closes the account's WebSocket, if it has one, after sending it `{ type: 'signedOut', reason: 'everywhere' }`, so the page can say "You were signed out" rather than that the connection was lost. The seat is disconnected, as when a connection drops, so its bot plays it. The page doesn't reconnect: it has no session, and Try again gets a new guest.
- **Sign out** deletes the session and clears the cookie. The page then gets a new guest. **Sign out everywhere** deletes all the account's sessions.

### 6.2 Signing in with Google

OpenID Connect's authorization code flow with PKCE, asking only for the `openid` scope, in `node/google.ts` with Node's `fetch` and `crypto` and no other package.

1. `GET /auth/google` makes a `state`, a `nonce` and a PKCE verifier (32 random bytes each, in base64url), keeps all three in a short-lived cookie, and redirects (303) to Google's authorization endpoint with `client_id`, `redirect_uri = PUBLIC_URL + /auth/google/callback`, `response_type=code`, `scope=openid`, the `state`, the `nonce`, `code_challenge` (the verifier's SHA-256 in base64url) with `code_challenge_method=S256`, and `prompt=select_account`, so a person with several Google accounts picks one.
   - **The cookie:** `lt_google`, holding `state.nonce.verifier`, `HttpOnly`, `SameSite=Lax` (so it comes back on Google's redirect, a top-level navigation), `Path=/auth/google` (so only the callback gets it), `Secure` when `PUBLIC_URL` is https, for `GOOGLE.stateSeconds` (600, 10 minutes). The callback always clears it. A second sign-in started meanwhile replaces it, and the first one's callback fails.
   - No session is needed to start. It works whether or not Google sign-in is configured: when it isn't, both routes send the browser straight back with `unavailable`.
2. `GET /auth/google/callback`:
   - **Checks `state`** against the cookie's, in constant time (`timingSafeEqual`). A missing cookie or a different `state` fails, before anything is sent to Google. This is what stops another site from signing the browser in to an account of its own.
   - **`error=access_denied`** from Google, when the person says no, gives `cancelled`; any other `error`, or no `code`, gives `failed`.
   - **Swaps the code for tokens** at Google's token endpoint: a form `POST` with `grant_type=authorization_code`, the `code`, the same `redirect_uri`, `client_id`, `client_secret` and the `code_verifier`, waiting at most `GOOGLE.timeoutSeconds` (10).
   - **Reads the ID token.** It comes straight from Google over TLS, so its signature needs no separate check (OpenID Connect Core 3.1.3.7), but its claims are checked: `iss` is `https://accounts.google.com` or `accounts.google.com`; `aud` is the client id (or contains it, with `azp` the client id when there are several); `exp` is still to come; `nonce` is the cookie's; and `sub` is a string of 1 to 255 characters. Any of these failing gives `failed`.
3. With the `sub`:
   - **No account has that `sub`:** the current guest becomes claimed with it. Its history and name stay. If the guest's name is held by a claimed account, or is a guest's name of the form "Guest 0427", the account needs a new name (`needsName`, section 6.3) before ranked or friends work. A browser with no session, or whose account is already claimed with another Google account, gets a new account instead, made as a guest and claimed at once, which needs a name since it has a guest's.
   - **An account already has it:** the browser signs in to that account. The guest account is not merged; it is left to be cleaned up (section 5). The page says so if the guest had played games, from `guestGames`.
   - **Two sign-ins at once with one new Google account** both try to claim; the unique `google_sub` lets one through, and the other signs in to the account it claimed.
   - Either way, **a new session replaces the browser's**: its old session is deleted, even when it was the guest just claimed, so a cookie from before the claim can't reach the claimed account.
   - A guest who claims while in a lobby, in another tab, loses the guest mark there at once (section 4).
4. Redirects (303) back to `/play.html#signin=<outcome>`, setting the new session's cookie: `claimed`, `signedin` (with `&guestGames=<n>` when the guest left behind had played `n` online games), `cancelled`, `failed` or `unavailable`. `SignInOutcome`, `signInHash` and `readSignIn` in `accounts.ts` are the page's way to read it. The page starts sign-in by going to `/auth/google` (`GOOGLE_SIGN_IN_PATH`) as a whole page, not with `fetch`, and loads its account with `GET /api/me` as usual on the way back. A page that leaves for Google in a lobby or game drops its connection there, as a reload does.

- **Logs** never hold a code, a token, the secret or a cookie. A failure logs only what went wrong: a `state` that didn't match, the token endpoint's status with Google's error code (such as `invalid_grant`), or which claim of the ID token was wrong.
- **Testing:** the authorization and token endpoints, and the issuers, can be set in `GoogleConfig` (`ServerOptions.google`), so tests run a fake Google on localhost. `main.ts` always uses Google's.
- A claimed account can't be unlinked from Google; it can be deleted.
- Google's client id and secret are made in Google Cloud Console, with `PUBLIC_URL/auth/google/callback` as an allowed redirect. For `pnpm dev`, also `http://localhost:5173/auth/google/callback`. `README.md` gets the steps.

### 6.3 Names

- 3 to 20 characters after trimming, with control characters removed. Letters and digits of any script, spaces, and `' - _ .`. No two spaces in a row.
- **Comparing:** the `name_key` is the name in Unicode NFKC, lowercased, with spaces removed. Two names with the same key are the same name.
- **Claimed accounts' names are unique** by key. **Guests** can take any name no claimed account holds, and two guests can share one. Everywhere a name is shown, a guest's carries a small guest mark.
- New guests are named "Guest" and 4 random digits with a space between, such as "Guest 0427", which needn't be unique.
- **Renaming:** a claimed account can rename once every 7 days. A guest can rename freely. A name freed by a rename is free at once. `renamed_at` is set on every rename, and counts only for claimed accounts: claiming clears it, so renames as a guest don't count, and the first rename after claiming is free. The limit is checked in the same `update` that renames, so two renames at once can't both get through.
- **Holding a name:** a claimed account holds its name, and the partial unique index on `name_key` keeps any other claimed account from holding it too, two claims for one name at once included: the second is told the name is taken (`'taken'` from the store, "That name is taken." from the API). A guest renaming checks that no claimed account holds the name, and a rename or claim takes a transaction-scoped advisory lock on the name's key, after the account's row lock, so a guest can't take a name in the moment a claim takes it.
- **Needing a new name:** a guest who claims with a name a claimed account holds, or with a guest's name such as "Guest 0427", is claimed with `needs_name` set. Such an account holds no name, so the index leaves it out and guests may take its name, and it shows as it is meanwhile. `AccountView.needsName` tells the page, which asks for a new name. Its rename is allowed at once, whatever `renamed_at` says, clears `needs_name`, and from then the account holds its name and the 7-day limit applies. Ranked and friends (`queue`, `partyInvite`, `POST /api/friends/request` and the rest), when they are built, are refused for it with "Choose a new name first.".
- Bots keep their names (`server-spec.md` section 7). People can't take a name of the form "Bot n" or "Guest" with digits: one whose key is `bot` or `guest` followed by digits only.
- "Letters and digits of any script" are Unicode letters (with their combining marks) and decimal digits. Lengths count characters (code points), not UTF-16 units.
- `cleanName` in `lobby.ts` cleans the name that `create` and `join` carry, and they lose it (section 11.2). People's names come from their accounts, checked when they are set. Bots' names are made in the lobby view, not by `cleanName`.

### 6.4 Deleting an account

- From the account panel, after typing the account's name to confirm: `POST /api/me/delete { confirm }`, where `confirm` is compared with the account's name as names are compared, by key (section 6.3), so case and spaces don't matter. A wrong or missing `confirm` is 400.
- Deletes the account, its sessions, ratings, friends and requests (all `on delete cascade`). In other people's histories its seats stay with the name "Deleted player" and no link. Matches nobody else with an account was in go too. Its name is free at once, and its Google account, signing in again, makes a new account.
- Only possible while the account is not in a game, the queue or a party of 2: while it has a seat in a lobby whose game isn't over (one it hasn't left), whether started or not, it is refused with 409 and "You have a seat in lobby CODE. Leave it before deleting the account.". Leaving a started game for good frees the account, as in section 12.
- Its WebSocket, if it has one, gets `{ type: 'signedOut', reason: 'deleted' }` and is closed, before the delete so it can't take a seat meanwhile, and again after, in case one opened. The response clears the session cookie, and the page then gets a new guest from `GET /api/me`.
- A game that ends after the account was deleted, from a seat it took in that moment, is still recorded (section 5).

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
  ringBearer: UnitId | null;   // the unit that wore the One Ring in that fight, if any
}
```

- The board is the one the seat fought its last fight with: in the round it went out, or the last round for the winner. The game empties a seat's board when it places it (`game-spec.md` section 9.9, step 6), so `match.ts` can't read it then. Instead it reads each round's boards from that round's fights' input (`RoundReport`): the home seat's team A, and the away seat's team B in a PvP fight (a ghost fight's team B is a copy, and PvE's is monsters). It does this after `fight()` on the timers, and for each round's report when the bots play the rest at once (`server-spec.md` section 5.1, Everyone out). Its levels come from the state just after the round's planning.
- **Playing out during planning:** the round's planning has already been done, by bots on entering it and for people's seats when their bots took over. So the round is fought as it stands before the bots play the rest, and nobody plans twice. A game played out at once is the game its timers would have given.
- `units` are in the order the fight placed them. A trait's `tier` is 1 at its first breakpoint, 2 at its second and so on, and `traits` are sorted by `count`, most first, then by id. `ringBearer` is the unit that wore the One Ring in that fight: the one placed with the Ring's Corruption, which is not always the Ring's bearer after the fight, since Gollum can steal it then.
- `Match` takes an `over` callback, called once when its game ends, from which `Lobby` builds the result; `durationMs` runs from the start to then.
- Offline games and games that don't finish report nothing. A game cut short by a restart is voided: nothing is written for it.

### 9.2 Recording

- `record.ts` writes the match and its seats, with the match's `ended_at` when the result arrives and `started_at` that less `durationMs`. For a ranked game, in the same transaction, it reads the people's ratings for the season with `select ... for update`, runs section 8, and writes ratings, points and the before and after values on the seats.
- A failed write is retried 3 times, after 1, 2 and 4 seconds, then logged with the whole result as JSON, so it can be replayed by hand.

### 9.3 Stats

Worked out from `match_seats` by SQL when asked for, not stored:

- games, wins, top-4 rate and average place, for ranked and for all online games;
- the 5 units most often on the final board, the 5 traits most often active, and how often the person bore the One Ring;
- points, rank and placement games left, for ranked.

Each unit and trait counts once a game, most games first, then by id. Built so far, without the ranked parts, in `accounts.ts`, which the page imports too:

```ts
interface Stats {
  all: { games: number; wins: number; top4Rate: number; averagePlace: number | null };  // top4Rate 0 and averagePlace null with no games
  units: { unit: UnitId; games: number }[];
  traits: { trait: TraitId; games: number }[];
  ringGames: number;                                     // games in which the person bore the One Ring
}
```

### 9.4 History

- `GET /api/history?account=<id>&before=<match id>` gives 20 matches at a time, newest first: kind, date, place, points change, the final board, and the other 7 seats' names, places and boards.
- Anyone can see a claimed account's profile and history. A guest's are shown only to the guest. To anyone else, a guest is 404, as an unknown account is.
- `account` defaults to the asker. `before` must be a match id (400 if it isn't one); an unknown one gives no matches. Newest first is by `ended_at`, then by id. The response, in `accounts.ts` with `ProfileView` (`GET /api/profile`):

```ts
interface HistoryPage { matches: HistoryMatch[] }
interface HistoryMatch {
  id: string;
  kind: 'ranked' | 'private';
  startedAt: string; endedAt: string;      // ISO 8601
  lastRound: { stage: number; round: number };
  seat: number;                            // the account's own seat
  seats: HistorySeat[];                    // all 8, in seat order
}
interface HistorySeat {
  seat: number;
  account: string | null;                  // null for a bot or a deleted account
  name: string;
  guest: boolean;
  place: number;
  left: boolean;
  board: FinalBoard;
  pointsBefore: number | null;             // ranked people only
  pointsAfter: number | null;
}
```

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

JSON over HTTP from `api.ts`, on the same port. Every request that changes anything must have an `Origin` header matching `PUBLIC_URL` and a valid session. Every other request apart from `GET /api/me` needs a valid session too. Bodies are at most 4 KB, and an empty body counts as `{}`. Built so far: `/api/me`, `/api/me/name`, `/api/signout`, `/api/me/delete`, `/api/profile`, `/api/history`, and `/auth/google` with its callback (in `google.ts`; they are page navigations, not JSON, and need neither an `Origin` nor a session).

| Request | Does |
|---|---|
| `GET /api/me` | The asker's account (`AccountView`), making a guest if there is no session |
| `POST /api/me/name` `{ name }` | Renames, and returns the `AccountView`; or the reason it can't, with 400: a name the rules refuse, "That name is taken.", or "You can rename once every 7 days." |
| `POST /api/signout` | Section 6.1. `{ everywhere: true }` for every device. Returns `{ ok: true }` and clears the cookie |
| `POST /api/me/delete` `{ confirm }` | Section 6.4; `confirm` is the account's name. Returns `{ ok: true }` and clears the cookie; 409 while the account has a seat in a lobby |
| `GET /auth/google`, `GET /auth/google/callback` | Section 6.2: redirects to Google, then back to `/play.html#signin=<outcome>` |
| `GET /api/profile?account=<id>` | `{ id, name, guest, stats }` (section 9.3) |
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
  canRename: boolean;          // false within 7 days of a claimed account's last rename, unless needsName
  needsName: boolean;          // claimed, with a name another claimed account holds or a guest's: it must rename (section 6.3)
  googleEnabled: boolean;      // sign-in is configured on this server
}
```

- Errors are `{ error: string }`, with 400 for bad input, 401 without a session, 403 for a wrong `Origin`, 404 for an unknown account, 409 for a request that can't be done now (deleting while in a lobby), and 429 when rate limited.
- At most 60 requests a minute from one session, `GET /api/me` included.

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
  | { type: 'replaced' }                         // section 6.1
  | { type: 'signedOut'; reason: 'everywhere' | 'deleted' };   // sections 6.1 and 6.4; the connection then closes

interface QueueView { waitedSeconds: number; queued: number }
interface PartyView { leader: string; members: { id: string; name: string }[] }
interface PartyInvite { from: string; name: string; expiresInSeconds: number }
interface FriendRef { id: string; name: string }
interface FriendPresence { id: string; name: string; status: 'online' | 'queue' | 'lobby' | 'game' }
```

- `LobbyView` gains `ranked: boolean`, and its `host` becomes `number | null`, null in a ranked lobby, and each `SeatView` gains `player: string | null` (the account id for people, for links to profiles) and `guest: boolean` (false for bots and empty seats).
- Built so far: `create`, `join` and `rejoin` without names and tokens, `hello`, `replaced`, `signedOut`, and the `LobbyView` and `SeatView` changes, with `ranked` always false. The queue, party, friends, `ranked` and `notice` messages come with their steps.
- `signedOut` is sent to the account's connection when it signs out everywhere or is deleted, just before the server closes it. Its seat is disconnected, as when a connection drops. The page doesn't reconnect, since its session has gone, and says why online play is unavailable; Try again gets a new guest.
- `SeatView.guest` is false for the offline player, who has no account (section 4).
- `hello`'s `game` is the lobby the account has a seat in that it hasn't left and whose game isn't over, whether it has started or not, so a page can rejoin a lobby it was waiting in too.
- Presence is only sent to friends. Offline friends are left out of `friends`; `GET /api/friends` lists everyone.

---

## 12. Changes to online play

- **Seats** (`lobby.ts`): a member is a player id, a name and a connection. `rejoin` gives a seat back to a connection with the same player id; another account gets "You have no seat in that lobby." A `rejoin` from the connection that already has the seat sends it the seat again. The per-lobby tokens and `Host.token` go. The client keeps only the lobby code in session storage, for reconnecting; after a reload or on another device, `hello` says which game the account is in, and the page rejoins it.
- **One lobby per account:** an account in a lobby, game or queue can't create, join or queue elsewhere ("You already have a seat in lobby CODE."). Leaving a started game for good (`leave`) frees the account, as does its game ending.
- **Replaced connections:** the older connection gets `replaced` (section 6.1) instead of `left`, which `server-spec.md` section 8 sends when a seat rejoins from another connection.
- **Lobby kinds:** `private` (made with `create`, as now) and `ranked` (made by the queue). Private lobbies keep everything in `server-spec.md` section 7, and guests can play them.
- **Idle started lobbies:** instead of closing 60 seconds after the last person disconnects (`server-spec.md` section 7), a lobby whose game has started then plays the rest of its game out at once with bots, as when everyone is out (`server-spec.md` section 5.1), reports its result and closes. Until then, people can still rejoin. Disconnected people's places count, as in section 7.3. Only a restart voids a game. A lobby that hasn't started still closes after the 60 seconds.
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

**Built so far, for guests:** the menu's account, the account panel without deleting, the profile with stats, history and final boards, guest marks, `replaced` with Use here, `signedOut` (online play unavailable, with why), and reconnecting by account. The page's types for the API's answers are the server's, from `accounts.ts`. Each of the rest comes with its step, and nothing of it is shown before then, not even disabled: Sign in with Google, a new name when `needsName` asks, Ranked, the leaderboard, the queue, the party, friends, deleting, notices and the ranked game over. The server's side of signing in, names and deleting is built (sections 6.2 to 6.4).

- **Menu:**
  - The name field goes. In its place, the account's name with the guest mark, a pencil to rename, and Sign in with Google for guests (hidden if `googleEnabled` is false), a link to `/auth/google` that leaves the page.
  - **Back from Google**, the page reads `#signin=` with `readSignIn` and clears it from the address, and says how it went: claimed ("You're signed in with Google. Your games are kept."), signed in to an existing account (and, with `guestGames`, that the guest's games stay with the guest, which is lost), cancelled, failed (try again), or unavailable.
  - **A new name:** while `needsName` is true, the menu says the name is taken by another player (or kept for guests) and opens the rename field, and Ranked and Friends wait for it.
  - Play against bots, Create lobby and Join stay.
  - **Ranked**, for claimed accounts: Find game, or Find game with your party. Guests see it disabled, with "Sign in with Google to play ranked."
  - Buttons for Profile, Leaderboard and Friends, and for the account panel.
- **Loading the account:** the menu waits for `GET /api/me`, up to 8 seconds. If it fails (no answer, or an answer that isn't the API, as from a page served without the game server), the menu has no account, Profile or Account, offers Play against bots, and says online play is unavailable and why, with Try again, which asks again.
- **Online play connects at page start:** once the account has loaded, the page opens the WebSocket while the menu is on screen, so `hello` can put the person back into their game after a reload or on another device (`server-spec.md` section 10, Reconnecting). Create and Join work once `hello` has arrived; until then they say the page is connecting. An offline game closes the WebSocket, so `hello` can't take the person out of it, and going back to the menu opens it again.
- **One lobby per account:** the page follows the lobby the account has a seat in, from `hello`'s `game`, `joined`, `left` and a refused `rejoin`. While it has one, Create and Join send `rejoin` for it instead, so they take the person back rather than being refused (section 12).
- **Renaming:** the pencil turns the name into a field, with Save and Cancel; Enter saves and Escape cancels. The page checks the name with `checkName` (section 6.3) before sending it, keeping the same name sends nothing, and the server's reason shows under the field when it refuses. The new name shows on the menu, in the account panel and on the person's own profile; the server renames them in their lobby.
- **Queue:** while queued, a bar over the menu shows the wait and how many are queued, with Cancel. When matched, the page goes straight into the game.
- **Party:** a small panel on the menu with the party's members, Invite (by name or from friends) and Leave. Invites arrive as a toast with Accept and Decline.
- **Friends panel:** friends with presence, requests in and out, Add by name, and for each friend Invite to party, Invite to lobby (while in a private lobby) and View profile. Lobby invites arrive as a toast with Join.
- **Profile:** opened from the menu's Profile button, in place of the menu, with Back (Escape too).
  - The name with its guest mark, points and rank, and the stats (section 9.3) as tiles: games, wins, top-4 rate, average place, and games bearing the One Ring, with a dash for the rates before any game; then the most played units, as portraits (their origin's icon on their cost's colour), and the most played traits, each with its number of games.
  - The history, newest first, 20 matches at a time with Load more while the last page was full (through `before`). A match's row shows the place with a medal for the top three, the kind, the round it ended on, when it ended (today, yesterday, or the date), how long it took, Left if the person left before the end, the points change in a ranked game, and the units of their final board.
  - A row opens to all 8 final boards, by place: the place, the name with its guest mark and Left, the level, the active traits as badges in the trait tracker's tones with their counts, and the units, strongest first (by star level, then cost, then name), each with its star badge, its items as chips, and the One Ring on the unit that wore it in that fight. Units, items and traits have their usual tooltips. The board of the profile's owner is marked. Units, items and traits the game no longer has are left out.
  - The names of other people with accounts open their profiles on top, and Back returns to the one before. Bots and deleted accounts ("Deleted player") have no link. Someone else's history is asked for only once their profile has loaded. A 404 shows in the profile: for someone shown as a guest, that a guest's profile and history are shown only to them; otherwise, that the player has no profile to show.
- **Leaderboard:** the top 100 and your own rank.
- **Account panel:** opened from the menu's Account button, in place of the menu. The name in a field with Save, what kind of account it is (a guest's lives in the browser's cookies, and signing out or clearing them loses it and its history), sign out, sign out everywhere, and delete account, which asks for the account's name to be typed, closes the page's WebSocket first as signing out does, and shows the server's reason when refused (such as a seat in a lobby). Signing out asks first, and for a guest says they can't sign back in. The page closes its WebSocket, which belongs to the old account, signs out, gets a new guest from `GET /api/me`, connects again and says who the person is now. A page elsewhere that was signed out everywhere loses its connection and says online play is unavailable; Try again gives it a new guest.
- **In a game:** the players list and lobby cards show guest marks, and so do the game-over standings, for people other than the person (whose row says You). An offline game's You has no account and no mark. Ranked games show "Ranked" in the HUD.
- **Game over** of a ranked game shows the points change once `ranked` arrives.
- **Notices** (`notice`, `replaced`) show as a banner at the top of the page. On `replaced`, the page goes back to the menu, doesn't reconnect, and its banner says the game is open in another tab or on another device, with Use here, which connects again: the server moves the seat to the new connection and `hello` names the game, so the page goes straight back in. Create and Join wait for Use here meanwhile. The banner doesn't show over an offline game.
- **Reconnecting** works as in `server-spec.md` section 10, but rejoins by account instead of a token. A `round` the page is already showing, which a rejoin from the same page sends again, doesn't start its fight over.
- The logic for these screens (queue status, the party, presence, formatting history) goes in modules without the DOM, as the play page's others do: `account.ts` (the API as the page calls it, and the account and online play as the page knows them) and `profile.ts` (stats, history, final boards, and moving between profiles), drawn by `play/account.ts` and `play/profile.ts`.

---

## 15. Deployment

- The `Dockerfile` copies `packages/server/migrations` into the image, next to `src`, which is all it copies of the server now. The image needs `DATABASE_URL`, and stops without it.
- `compose.yaml` gains a `db` service, `postgres:17`, with a `pg_data` volume, a health check, and its password from `POSTGRES_PASSWORD` in `.env`. Its port is not opened on the host. The `game` service gets `DATABASE_URL`, `PUBLIC_URL=https://${DOMAIN}`, `TRUST_PROXY=1` and the Google settings from `.env`, depends on `db` being healthy, and has the 50-minute `stop_grace_period`.
- The Caddyfile needs no change: `/api/*` and `/auth/*` go to the game like everything else. Caddy sets `X-Forwarded-For`.
- `README.md`, Deploying: the new `.env` values, making the Google client, and backups.
- CI starts a `postgres:17` service for the tests that need it (section 16), with `DATABASE_URL` set for `pnpm test`. The image smoke test runs the image with a `postgres:17` container beside it on a Docker network, and checks `/play.html` and `/api/me`.

---

## 16. Tests and acceptance criteria

**Browser-safe, with a fake host**
- **Queue:** 8 people make a full lobby at once. Parties are never split. The rating spread grows with the wait. After 75 seconds, 2 solo people get a lobby with 6 bots. A party of 2 alone, or 1 person alone, keeps waiting. `unqueue` and disconnects remove the party. Guests and people in a lobby are refused.
- **Parties:** invite, accept, decline, expiry, only one invite out at a time, only claimed and free people, only the leader queues.
- **Rating:** a 1st place gains and an 8th loses. Bots' rating doesn't change. Party members are rated separately. The same input gives the same output. Points never go below 0 and follow the rating over a run of games.
- **Results:** a finished private game and a finished ranked game report 8 seats with places 1 to 8 and final boards. A leaver's seat reports their place. A started lobby with nobody connected plays out and reports its result. Offline games report nothing.
- **Seats by account:** rejoin with the same player id works from a new connection, and with another id is refused. One lobby per account.
- **Draining:** create, join and queue are refused, lobbies that haven't started close, running games finish, and `running` reaches 0.

**Node side, against `PgStore` (skipped with a clear message when `DATABASE_URL` isn't set; CI sets it). Each test file works in a schema of its own, made and dropped by the test, so files can run at once against one database.**
- Migrations apply on an empty database and are a no-op the second time.
- Guests, sessions (stored hashed, renewed, expired), sign-out and sign-out everywhere.
- Names: unique among claimed accounts ignoring case and NFKC, guests sharing a name, a guest who can't claim with a taken name until they rename, the 7-day rename limit.
- Claiming with a new `sub`, and signing in to an existing one.
- Recording a ranked match updates ratings, points and seats in one transaction, and a failure in the middle leaves nothing.
- Deleting an account keeps other people's history with "Deleted player".
- Friends: request, accept, decline, remove, a mutual request accepting itself, the limits.

**Server** (against Postgres, so skipped likewise without `DATABASE_URL`)
- The WebSocket upgrade is refused without a session or with a wrong `Origin`.
- Two guests play a private lobby game to the end, after which both have it in `/api/history`.
- Google's endpoints faked (`test/google.test.ts`): the callback with a wrong `state`, or without its cookie, is refused before Google is asked; a new `sub` claims the guest with its history and a new session; an existing `sub` signs in to its account; a person saying no is `cancelled`; ID tokens with the wrong `aud`, `iss`, `nonce` or `exp` are refused; `needsName` after claiming with a held name, and the 7-day limit; deleting refused in a lobby, and done with `signedOut` and "Deleted player".
- Two clients with claimed accounts queue, wait out the filler timer, play a ranked game to the end, and both see the points change.

**Client**
- In a browser: a guest renames, plays a private lobby game, and sees it in their history with its final boards. A reload mid-game puts them back in, and a second tab takes the game until the first uses it here. Once the queue is built, Ranked is disabled for the guest.
