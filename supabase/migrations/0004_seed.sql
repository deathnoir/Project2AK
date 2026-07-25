-- Project2AK — new-user bootstrap.
--
-- A profile and a starting category set are created on signup so the setup
-- wizard has something to edit rather than a blank page. The wizard is where
-- accounts and opening balances get entered; categories arrive pre-populated
-- because "what do I call my categories" is a worse first question than
-- "which of these do I not need".

create or replace function seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into categories (user_id, "group", name, due_day, sort_order, rollover_enabled)
  values
    (p_user_id, 'income',        'Salary',            null, 10,  false),
    (p_user_id, 'income',        'Other Income',      null, 20,  false),

    (p_user_id, 'bills',         'Mortgage',            28, 100, true),
    (p_user_id, 'bills',         'Electricity',          2, 110, true),
    (p_user_id, 'bills',         'Water',               26, 120, true),
    (p_user_id, 'bills',         'Internet',            30, 130, true),
    (p_user_id, 'bills',         'Phone',             null, 140, true),
    (p_user_id, 'bills',         'Association Dues',  null, 150, true),

    (p_user_id, 'subscriptions', 'Netflix',             12, 200, true),
    (p_user_id, 'subscriptions', 'Disney+',              8, 210, true),
    (p_user_id, 'subscriptions', 'Spotify',           null, 220, true),

    (p_user_id, 'expenses',      'Groceries',         null, 300, true),
    (p_user_id, 'expenses',      'Eating Out',        null, 310, true),
    (p_user_id, 'expenses',      'Transport',         null, 320, true),
    (p_user_id, 'expenses',      'Household',         null, 330, true),
    (p_user_id, 'expenses',      'Health',            null, 340, true),
    (p_user_id, 'expenses',      'Clothing',          null, 350, true),
    (p_user_id, 'expenses',      'Personal Care',     null, 360, true),
    (p_user_id, 'expenses',      'Gifts',             null, 370, true),
    -- Bank Fees exists so a GCash convenience fee can be split off the
    -- merchant expense as a linked child and still be queryable.
    (p_user_id, 'expenses',      'Bank Fees',         null, 380, true),
    (p_user_id, 'expenses',      'Miscellaneous',     null, 390, true),

    -- Interest and fees on borrowing ARE an expense — the cost of using
    -- someone else's money. Seeded by default so the debt flow has somewhere
    -- correct to post from day one.
    (p_user_id, 'debt',          'Finance Charges',   null, 400, true),

    (p_user_id, 'savings',       'Emergency Fund',    null, 500, true),
    (p_user_id, 'savings',       'Christmas',         null, 510, true),
    (p_user_id, 'savings',       'Yearly Car Expenses', null, 520, true)
  on conflict do nothing;
end;
$$;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (user_id) values (new.id) on conflict do nothing;
  perform seed_default_categories(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
