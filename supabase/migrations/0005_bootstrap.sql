-- Project2AK — make new-user bootstrap recoverable.
--
-- 0004 seeds a profile and the starting categories from a trigger on
-- auth.users. That trigger fires exactly once, at signup, and only if it
-- already exists at that moment. Sign in to a project before the migrations
-- are applied — which is the normal order of events when you are setting the
-- thing up — and you get a user row with no profile and no categories, and
-- nothing will ever go back and fire it for you.
--
-- The app could not dig itself out of that. The setup wizard only UPDATEs
-- categories, so an empty set stays empty; and completeSetup UPDATEs profiles,
-- which matches zero rows and reports success, so setup_done never flips and
-- the layout redirects to /setup forever with no error shown.
--
-- Two changes: a function the signed-in user can call to bootstrap themselves,
-- and a backfill for anyone already stuck.

-- ------------------------------------------------------------- hardening --

-- seed_default_categories takes a user id and is SECURITY DEFINER, so with the
-- default PUBLIC execute grant any authenticated user could seed categories
-- into someone else's ledger. Signups are meant to be closed on this app and
-- the blast radius is junk rows rather than disclosure, but there is no reason
-- for it to be reachable from PostgREST at all — the trigger calls it as its
-- owner and is unaffected.
revoke execute on function seed_default_categories(uuid) from public;
revoke execute on function handle_new_user() from public;

-- --------------------------------------------------------------- recovery --

create or replace function bootstrap_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  insert into profiles (user_id) values (uid) on conflict do nothing;

  -- Only seed a genuinely fresh ledger. The unique index on categories is
  -- partial (where deleted_at is null), so a soft-deleted category does not
  -- block a re-insert — seeding unconditionally would resurrect every category
  -- the user had deliberately thrown away, as a duplicate live row.
  if not exists (select 1 from categories where user_id = uid) then
    perform seed_default_categories(uid);
  end if;
end;
$$;

revoke execute on function bootstrap_current_user() from public;
grant execute on function bootstrap_current_user() to authenticated;

-- --------------------------------------------------------------- backfill --

-- Repairs any user created before 0004 was applied. Same guard as above, so
-- it is safe to re-run and safe for users who are already set up.
do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    insert into profiles (user_id) values (u.id) on conflict do nothing;
    if not exists (select 1 from categories where user_id = u.id) then
      perform seed_default_categories(u.id);
    end if;
  end loop;
end;
$$;
