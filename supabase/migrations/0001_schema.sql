-- Project2AK — core schema
--
-- Conventions that hold everywhere in this database:
--
--   MONEY is bigint centavos. Never numeric, never float. numeric is exact in
--   Postgres but crosses into JavaScript as a string or a float and drifts.
--   Format at the display layer only.
--
--   TRANSACTIONS ARE SIGNED against the account they post to. Income and
--   refunds are positive; expenses and finance charges are negative. This is
--   what makes `opening_balance + sum(amount)` the whole balance story, and
--   what makes a BNPL purchase (negative, on a credit account) produce the
--   right liability with no special-casing.
--
--   BUDGETS ARE UNSIGNED magnitudes, because "₱5,000 for groceries" is how a
--   person thinks. v_budget_vs_actual flips the sign of actuals per category
--   group so the two are comparable.
--
--   SOFT DELETE everywhere mutable: deleted_at, created_at, updated_at.
--   Financial data where you can't answer "why did this number change" gets
--   abandoned.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums ----

create type account_type as enum ('bank', 'ewallet', 'cash', 'credit', 'loan');
create type tracking_mode as enum ('itemized', 'statement_only');
create type category_group as enum
  ('income', 'bills', 'subscriptions', 'expenses', 'savings', 'debt');
create type recurrence as enum ('monthly', 'yearly', 'every_n_months');
create type receipt_status as enum
  ('pending', 'extracted', 'confirmed', 'failed', 'duplicate');
create type image_kind as enum
  ('ewallet_receipt', 'bank_confirmation', 'store_receipt',
   'transaction_history', 'bnpl_payment', 'unknown');
create type savings_kind as enum ('goal', 'sinking');

-- ------------------------------------------------------------- helpers ----

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------- profiles ----

create table profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  currency     text        not null default 'PHP',
  locale       text        not null default 'en-PH',
  active_year  int         not null default extract(year from now())::int,
  week_start   int         not null default 1,  -- 0 = Sunday, 1 = Monday
  -- Days of the month salary lands. PH semi-monthly is typically {15, 30}.
  -- 31 clamps to the last day of a short month.
  payday_days  int[]       not null default '{15,30}',
  setup_done   boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint week_start_valid check (week_start between 0 and 6),
  constraint payday_days_valid check (
    array_length(payday_days, 1) between 1 and 6
    and payday_days <@ (select array(select generate_series(1, 31)))
  )
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ------------------------------------------------------------- accounts ----

-- An account is "a place where a running balance lives" — not necessarily
-- money you own. Positive is money you have, negative is money you owe.
-- The UI never says "Accounts"; it says "Money I have" / "Money I owe".
create table accounts (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  name                     text not null,
  type                     account_type not null,
  opening_balance_centavos bigint not null default 0,
  opening_date             date not null default current_date,
  is_active                boolean not null default true,
  sort_order               int not null default 0,

  -- Credit terms. A "debt" is just an account with a negative balance, so
  -- these live here rather than in a second `debts` concept.
  apr                      numeric(6,3),
  late_fee_centavos        bigint,
  due_day                  int,
  credit_limit_centavos    bigint,
  tracking_mode            tracking_mode not null default 'itemized',

  -- Closure is the milestone, not payoff. A credit line at ₱0 is not
  -- finished — the balance hitting zero is exactly when the operator invites
  -- you to use it again.
  closed_at                timestamptz,
  closure_confirmed        boolean not null default false,
  closure_note             text,

  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint due_day_valid check (due_day is null or due_day between 1 and 31),
  constraint apr_sane check (apr is null or (apr >= 0 and apr <= 1000)),
  constraint closure_needs_date check (not closure_confirmed or closed_at is not null)
);

create trigger accounts_updated_at
  before update on accounts
  for each row execute function set_updated_at();

create index accounts_user_idx on accounts (user_id) where deleted_at is null;

-- ----------------------------------------------------------- categories ----

create table categories (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  "group"          category_group not null,
  name             text not null,
  due_day          int,
  sort_order       int not null default 0,
  rollover_enabled boolean not null default true,
  is_archived      boolean not null default false,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint category_due_day_valid check (due_day is null or due_day between 1 and 31)
);

create trigger categories_updated_at
  before update on categories
  for each row execute function set_updated_at();

create unique index categories_user_name_key
  on categories (user_id, lower(name)) where deleted_at is null;
create index categories_user_idx on categories (user_id) where deleted_at is null;

-- ------------------------------------------------------------- receipts ----

create table receipts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  storage_path   text not null,
  status         receipt_status not null default 'pending',
  image_kind     image_kind,
  raw_extraction jsonb,
  error          text,
  -- Set when status = 'duplicate', pointing at the transaction already logged.
  duplicate_of   uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger receipts_updated_at
  before update on receipts
  for each row execute function set_updated_at();

create index receipts_user_status_idx on receipts (user_id, status, created_at desc);

-- --------------------------------------------------------- recurring -------

-- A rule generates a PENDING transaction on its due date. The user confirms,
-- edits, or skips it. Never auto-commits: an unconfirmed bill that silently
-- posted is worse than one that didn't.
create table recurring_rules (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  category_id      uuid references categories(id) on delete set null,
  account_id       uuid not null references accounts(id) on delete cascade,
  -- Null amount means "same as last time" — resolved from history at generation.
  amount_centavos  bigint,
  frequency        recurrence not null default 'monthly',
  interval_months  int not null default 1,
  day_of_month     int not null,
  month_of_year    int,
  next_run         date not null,
  end_date         date,
  is_active        boolean not null default true,

  -- Installment plans and BNPL payments are transfers, not expenses: cash
  -- down, liability down. A rule with to_account_id set generates a transfer.
  to_account_id    uuid references accounts(id) on delete set null,

  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint rule_day_valid check (day_of_month between 1 and 31),
  constraint rule_month_valid check (month_of_year is null or month_of_year between 1 and 12),
  constraint rule_interval_valid check (interval_months between 1 and 60),
  -- A rule is either a categorised expense/income or a transfer, never both.
  constraint rule_is_expense_or_transfer check (
    (to_account_id is null and category_id is not null)
    or (to_account_id is not null and category_id is null)
  ),
  constraint rule_transfer_distinct check (
    to_account_id is null or to_account_id <> account_id
  )
);

create trigger recurring_rules_updated_at
  before update on recurring_rules
  for each row execute function set_updated_at();

create index recurring_rules_due_idx
  on recurring_rules (user_id, next_run) where is_active and deleted_at is null;

-- --------------------------------------------------------- transactions ----

create table transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  date              date not null,
  detail            text not null default '',
  -- SIGNED. Negative = money left the account (expense, finance charge,
  -- BNPL purchase). Positive = money arrived (income, refund).
  amount_centavos   bigint not null,
  category_id       uuid references categories(id) on delete set null,
  account_id        uuid not null references accounts(id) on delete cascade,
  note              text,
  reference_no      text,
  receipt_id        uuid references receipts(id) on delete set null,
  -- Fees (GCash convenience, InstaPay) are linked children categorised to
  -- Bank Fees, so the merchant expense stays clean and fee totals stay
  -- queryable.
  parent_id         uuid references transactions(id) on delete cascade,
  recurring_rule_id uuid references recurring_rules(id) on delete set null,
  -- Generated by a recurring rule and awaiting confirmation.
  is_pending        boolean not null default false,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint amount_nonzero check (amount_centavos <> 0),
  constraint no_self_parent check (parent_id is null or parent_id <> id)
);

create trigger transactions_updated_at
  before update on transactions
  for each row execute function set_updated_at();

-- Screenshots get uploaded twice. Reference numbers are the defence — every
-- PH e-wallet and bank confirmation prints one.
create unique index transactions_reference_key
  on transactions (user_id, reference_no)
  where reference_no is not null and deleted_at is null;

create index transactions_user_date_idx
  on transactions (user_id, date desc) where deleted_at is null;
create index transactions_account_idx
  on transactions (account_id) where deleted_at is null;
create index transactions_category_month_idx
  on transactions (user_id, category_id, date) where deleted_at is null;
create index transactions_pending_idx
  on transactions (user_id, date) where is_pending and deleted_at is null;
-- Merchant autocomplete + deterministic category inference.
create index transactions_detail_prefix_idx
  on transactions (user_id, lower(detail) text_pattern_ops) where deleted_at is null;
-- Duplicate-rule generation guard.
create unique index transactions_rule_occurrence_key
  on transactions (recurring_rule_id, date)
  where recurring_rule_id is not null and deleted_at is null;

-- ------------------------------------------------------------ transfers ----

-- Transfers move money between two accounts and must NEVER count as income or
-- expense. One row, two accounts, no category. Covers salary → savings, BNPL
-- payment, cash withdrawal.
create table transfers (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  date            date not null,
  amount_centavos bigint not null,
  from_account_id uuid not null references accounts(id) on delete cascade,
  to_account_id   uuid not null references accounts(id) on delete cascade,
  note            text,
  reference_no    text,
  receipt_id      uuid references receipts(id) on delete set null,
  recurring_rule_id uuid references recurring_rules(id) on delete set null,
  is_pending      boolean not null default false,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint transfer_amount_positive check (amount_centavos > 0),
  constraint transfer_accounts_distinct check (from_account_id <> to_account_id)
);

create trigger transfers_updated_at
  before update on transfers
  for each row execute function set_updated_at();

create index transfers_user_date_idx
  on transfers (user_id, date desc) where deleted_at is null;
create index transfers_from_idx on transfers (from_account_id) where deleted_at is null;
create index transfers_to_idx on transfers (to_account_id) where deleted_at is null;
create unique index transfers_rule_occurrence_key
  on transfers (recurring_rule_id, date)
  where recurring_rule_id is not null and deleted_at is null;

-- -------------------------------------------------------------- budgets ----

create table budgets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  category_id     uuid not null references categories(id) on delete cascade,
  year            int not null,
  month           int not null,
  -- Unsigned magnitude: what you intend to spend (or earn, for income).
  amount_centavos bigint not null default 0,
  is_paid         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint budget_month_valid check (month between 1 and 12),
  constraint budget_year_valid check (year between 2000 and 2200),
  constraint budget_amount_nonnegative check (amount_centavos >= 0),
  unique (category_id, year, month)
);

create trigger budgets_updated_at
  before update on budgets
  for each row execute function set_updated_at();

create index budgets_user_period_idx on budgets (user_id, year, month);

-- ------------------------------------------------------- savings goals -----

create table savings_goals (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  category_id               uuid not null references categories(id) on delete cascade,
  -- Resolves the salary-to-savings open question by supporting both shapes.
  -- Set account_id and the goal tracks a dedicated savings account, so a
  -- salary → savings transfer keeps account balances honest. Leave it null
  -- and the goal tracks contributions budgeted to its category, which is how
  -- a sinking fund naturally works.
  account_id                uuid references accounts(id) on delete set null,
  -- goal: accumulates to a target, then done (emergency fund, wedding).
  -- sinking: fills, gets spent, refills (Christmas, yearly car expenses).
  -- A sinking fund at ₱0 in January is the cycle working, not a failure.
  kind                      savings_kind not null default 'goal',
  goal_amount_centavos      bigint,
  starting_amount_centavos  bigint not null default 0,
  monthly_amount_centavos   bigint,
  target_date               date,
  -- The 2AK line: goals tagged with a beneficiary sum into one quiet line
  -- under safe-to-spend. Untagged goals behave exactly as before.
  beneficiary               text,
  deleted_at                timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (category_id)
);

create trigger savings_goals_updated_at
  before update on savings_goals
  for each row execute function set_updated_at();

-- --------------------------------------------------- account statements ----

-- One table, two jobs: monthly reconciliation for bank accounts, and balance
-- history for credit accounts. The gap between the derived balance and what
-- the statement says is unlogged interest or fees — bookable as an adjustment.
create table account_statements (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  account_id                  uuid not null references accounts(id) on delete cascade,
  -- First day of the statement month.
  month                       date not null,
  -- Signed, same convention as balances: negative on a credit account.
  statement_balance_centavos  bigint not null,
  note                        text,
  reconciled_at               timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint statement_month_is_first_of_month check (extract(day from month) = 1),
  unique (account_id, month)
);

create trigger account_statements_updated_at
  before update on account_statements
  for each row execute function set_updated_at();

-- ------------------------------------------------------------ net worth ----

-- Non-cash assets only: pension, property, investments not transacted through
-- the app. Everything else is derived from account balances.
create table net_worth_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  is_liability boolean not null default false,
  sort_order   int not null default 0,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger net_worth_items_updated_at
  before update on net_worth_items
  for each row execute function set_updated_at();

create table net_worth_values (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  item_id         uuid not null references net_worth_items(id) on delete cascade,
  month           date not null,
  amount_centavos bigint not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint nw_month_is_first_of_month check (extract(day from month) = 1),
  unique (item_id, month)
);

create trigger net_worth_values_updated_at
  before update on net_worth_values
  for each row execute function set_updated_at();

-- ------------------------------------------------------- no-spend goals ----

create table no_spend_goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  year       int not null,
  month      int not null,
  goal_days  int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ns_month_valid check (month between 1 and 12),
  constraint ns_goal_valid check (goal_days between 0 and 31),
  unique (user_id, year, month)
);

create trigger no_spend_goals_updated_at
  before update on no_spend_goals
  for each row execute function set_updated_at();

-- The receipts.duplicate_of FK is added last, after transactions exists.
alter table receipts
  add constraint receipts_duplicate_of_fkey
  foreign key (duplicate_of) references transactions(id) on delete set null;
