-- Google sign-in and claimed accounts' unique names (docs/accounts-spec.md sections 6.2 and 6.3).
--
-- A claimed account whose name another claimed account already holds, or whose name is kept for
-- guests ("Guest 0427"), as when a guest claims with it, needs a new name. Until it renames it
-- holds no name: the unique index leaves it out, and guests may take the name.

alter table accounts add column needs_name boolean not null default false;

drop index accounts_claimed_name;
create unique index accounts_claimed_name on accounts (name_key) where google_sub is not null and not needs_name;
