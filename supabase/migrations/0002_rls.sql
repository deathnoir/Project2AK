-- Project2AK — row level security.
--
-- Single user, but RLS is not optional: it is what makes the anon key safe to
-- ship to a browser. Every table gets the same policy, `auth.uid() = user_id`,
-- and the storage bucket is scoped the same way.

alter table profiles            enable row level security;
alter table accounts            enable row level security;
alter table categories          enable row level security;
alter table receipts            enable row level security;
alter table recurring_rules     enable row level security;
alter table transactions        enable row level security;
alter table transfers           enable row level security;
alter table budgets             enable row level security;
alter table savings_goals       enable row level security;
alter table account_statements  enable row level security;
alter table net_worth_items     enable row level security;
alter table net_worth_values    enable row level security;
alter table no_spend_goals      enable row level security;

-- profiles keys on user_id directly rather than a separate owner column.
create policy profiles_select on profiles for select using (auth.uid() = user_id);
create policy profiles_insert on profiles for insert with check (auth.uid() = user_id);
create policy profiles_update on profiles for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy profiles_delete on profiles for delete using (auth.uid() = user_id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'receipts', 'recurring_rules', 'transactions',
    'transfers', 'budgets', 'savings_goals', 'account_statements',
    'net_worth_items', 'net_worth_values', 'no_spend_goals'
  ] loop
    execute format(
      'create policy %1$s_select on %1$s for select using (auth.uid() = user_id)', t);
    execute format(
      'create policy %1$s_insert on %1$s for insert with check (auth.uid() = user_id)', t);
    execute format(
      'create policy %1$s_update on %1$s for update using (auth.uid() = user_id) '
      'with check (auth.uid() = user_id)', t);
    execute format(
      'create policy %1$s_delete on %1$s for delete using (auth.uid() = user_id)', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- storage --

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Path shape is receipts/{user_id}/{uuid}.jpg, so the first path segment is
-- the owner. storage.foldername() returns that as element 1.
create policy receipts_storage_select on storage.objects for select
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy receipts_storage_insert on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy receipts_storage_update on storage.objects for update
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy receipts_storage_delete on storage.objects for delete
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
