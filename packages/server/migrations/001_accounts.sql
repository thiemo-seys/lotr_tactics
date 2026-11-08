-- Accounts, sessions and match history (docs/accounts-spec.md section 5). Later steps add the
-- ranked ratings and friends in migrations of their own.

create table accounts (
  id            uuid primary key,
  name          text not null,
  name_key      text not null,              -- the name folded for comparison (section 6.3)
  google_sub    text unique,                -- null for a guest
  created_at    timestamptz not null default now(),
  seen_at       timestamptz not null default now(),
  renamed_at    timestamptz
);
create unique index accounts_claimed_name on accounts (name_key) where google_sub is not null;
create index accounts_guest_seen on accounts (seen_at) where google_sub is null;

create table sessions (
  hash          bytea primary key,          -- SHA-256 of the cookie's secret
  account_id    uuid not null references accounts on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index sessions_account on sessions (account_id);
create index sessions_expiry on sessions (expires_at);

create table matches (
  id            uuid primary key,
  kind          text not null check (kind in ('ranked', 'private')),
  season        int,                        -- ranked only
  started_at    timestamptz not null,
  ended_at      timestamptz not null,
  rounds        int not null                -- the stage and round it ended on, as stage * 10 + round
);
create index matches_ended on matches (ended_at desc, id desc);

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
