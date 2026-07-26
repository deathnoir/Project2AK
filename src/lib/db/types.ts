/**
 * Database types.
 *
 * Hand-maintained to mirror supabase/migrations. If you change a migration,
 * change this file in the same commit — it is the only thing standing between
 * a renamed column and a runtime `undefined`.
 *
 * Every `*_centavos` field is a signed integer count of centavos. See
 * `src/lib/money.ts` for the sign convention; the short version is that
 * transactions are signed against the account they post to, and budgets are
 * unsigned magnitudes.
 */

export type AccountType = 'bank' | 'ewallet' | 'cash' | 'credit' | 'loan'
export type TrackingMode = 'itemized' | 'statement_only'
export type CategoryGroup =
  | 'income'
  | 'bills'
  | 'subscriptions'
  | 'expenses'
  | 'savings'
  | 'debt'
export type Recurrence = 'monthly' | 'yearly' | 'every_n_months'
export type ReceiptStatus = 'pending' | 'extracted' | 'confirmed' | 'failed' | 'duplicate'
export type ImageKind =
  | 'ewallet_receipt'
  | 'bank_confirmation'
  | 'store_receipt'
  | 'transaction_history'
  | 'bnpl_payment'
  | 'unknown'
export type SavingsKind = 'goal' | 'sinking'

/** Accounts the user owns money in. Never labelled "Accounts" in the UI. */
export const LIQUID_TYPES: readonly AccountType[] = ['bank', 'ewallet', 'cash']
/** Accounts the user owes money on. Carry negative balances. */
export const LIABILITY_TYPES: readonly AccountType[] = ['credit', 'loan']

export type Profile = {
  user_id: string
  currency: string
  locale: string
  active_year: number
  week_start: number
  payday_days: number[]
  setup_done: boolean
  created_at: string
  updated_at: string
}

export type Account = {
  id: string
  user_id: string
  name: string
  type: AccountType
  opening_balance_centavos: number
  opening_date: string
  is_active: boolean
  sort_order: number
  apr: number | null
  late_fee_centavos: number | null
  due_day: number | null
  credit_limit_centavos: number | null
  tracking_mode: TrackingMode
  closed_at: string | null
  closure_confirmed: boolean
  closure_note: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type Category = {
  id: string
  user_id: string
  group: CategoryGroup
  name: string
  due_day: number | null
  sort_order: number
  rollover_enabled: boolean
  is_archived: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type Receipt = {
  id: string
  user_id: string
  storage_path: string
  status: ReceiptStatus
  image_kind: ImageKind | null
  raw_extraction: unknown | null
  error: string | null
  duplicate_of: string | null
  created_at: string
  updated_at: string
}

export type RecurringRule = {
  id: string
  user_id: string
  name: string
  category_id: string | null
  account_id: string
  amount_centavos: number | null
  frequency: Recurrence
  interval_months: number
  day_of_month: number
  month_of_year: number | null
  next_run: string
  end_date: string | null
  is_active: boolean
  to_account_id: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type Transaction = {
  id: string
  user_id: string
  date: string
  detail: string
  amount_centavos: number
  category_id: string | null
  account_id: string
  note: string | null
  reference_no: string | null
  receipt_id: string | null
  parent_id: string | null
  recurring_rule_id: string | null
  is_pending: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type Transfer = {
  id: string
  user_id: string
  date: string
  amount_centavos: number
  from_account_id: string
  to_account_id: string
  note: string | null
  reference_no: string | null
  receipt_id: string | null
  recurring_rule_id: string | null
  is_pending: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type Budget = {
  id: string
  user_id: string
  category_id: string
  year: number
  month: number
  amount_centavos: number
  is_paid: boolean
  created_at: string
  updated_at: string
}

export type SavingsGoal = {
  id: string
  user_id: string
  category_id: string
  account_id: string | null
  kind: SavingsKind
  goal_amount_centavos: number | null
  starting_amount_centavos: number
  monthly_amount_centavos: number | null
  target_date: string | null
  beneficiary: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type AccountStatement = {
  id: string
  user_id: string
  account_id: string
  month: string
  statement_balance_centavos: number
  note: string | null
  reconciled_at: string | null
  created_at: string
  updated_at: string
}

export type NetWorthItem = {
  id: string
  user_id: string
  name: string
  is_liability: boolean
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type NetWorthValue = {
  id: string
  user_id: string
  item_id: string
  month: string
  amount_centavos: number
  created_at: string
  updated_at: string
}

export type NoSpendGoal = {
  id: string
  user_id: string
  year: number
  month: number
  goal_days: number
  created_at: string
  updated_at: string
}

// ------------------------------------------------------------------ views --

export type AccountBalance = {
  account_id: string
  user_id: string
  name: string
  type: AccountType
  is_active: boolean
  sort_order: number
  opening_date: string
  opening_balance_centavos: number
  apr: number | null
  due_day: number | null
  late_fee_centavos: number | null
  credit_limit_centavos: number | null
  tracking_mode: TrackingMode
  closed_at: string | null
  closure_confirmed: boolean
  closure_note: string | null
  transactions_centavos: number
  transfers_in_centavos: number
  transfers_out_centavos: number
  balance_centavos: number
  is_liquid: boolean
  is_liability: boolean
  needs_closing: boolean
}

export type MonthlyActual = {
  user_id: string
  category_id: string
  year: number
  month: number
  net_centavos: number
  txn_count: number
}

export type BudgetVsActual = {
  user_id: string
  category_id: string
  category_group: CategoryGroup
  category_name: string
  rollover_enabled: boolean
  is_archived: boolean
  due_day: number | null
  sort_order: number
  year: number
  month: number
  budget_centavos: number
  is_paid: boolean
  actual_centavos: number
  txn_count: number
  rollover_in_centavos: number
  available_centavos: number
  remaining_centavos: number
  variance_centavos: number
}

export type SafeToSpend = {
  user_id: string
  next_payday: string
  days_to_payday: number
  liquid_centavos: number
  committed_centavos: number
  safe_to_spend_centavos: number
}

export type SavingsProgress = {
  goal_id: string
  user_id: string
  category_id: string
  account_id: string | null
  category_name: string
  kind: SavingsKind
  beneficiary: string | null
  goal_amount_centavos: number | null
  monthly_amount_centavos: number | null
  target_date: string | null
  saved_centavos: number
  remaining_centavos: number | null
  percent_complete: number | null
  months_remaining: number | null
}

export type BeneficiaryTotal = {
  user_id: string
  beneficiary: string
  saved_centavos: number
  change_this_month_centavos: number
}

export type DebtProgress = {
  account_id: string
  user_id: string
  name: string
  type: AccountType
  apr: number | null
  due_day: number | null
  late_fee_centavos: number | null
  credit_limit_centavos: number | null
  tracking_mode: TrackingMode
  closed_at: string | null
  closure_confirmed: boolean
  closure_note: string | null
  needs_closing: boolean
  owed_centavos: number
  derived_balance_centavos: number
  statement_balance_centavos: number | null
  statement_month: string | null
  statement_gap_centavos: number | null
  payments_centavos: number
  charges_centavos: number
  percent_paid: number | null
  avg_monthly_payment_centavos: number
  months_to_payoff: number | null
}

export type Reconciliation = {
  account_id: string
  user_id: string
  name: string
  type: AccountType
  is_liquid: boolean
  is_liability: boolean
  derived_centavos: number
  statement_balance_centavos: number | null
  statement_month: string | null
  reconciled_at: string | null
  delta_centavos: number | null
}

export type NoSpendDay = {
  user_id: string
  day: string
  year: number
  month: number
  spent_centavos: number
  is_no_spend: boolean
  is_elapsed: boolean
}

export type NetWorthMonth = {
  user_id: string
  month: string
  accounts_centavos: number
  manual_centavos: number
  net_worth_centavos: number
}

// ------------------------------------------------------------ row shapes --

type Insert<T, Generated extends keyof T> = Omit<T, Generated> & Partial<Pick<T, Generated>>
type TimeStamps = 'id' | 'created_at' | 'updated_at'

export type AccountInsert = Insert<Account, TimeStamps | 'deleted_at'>
export type CategoryInsert = Insert<Category, TimeStamps | 'deleted_at'>
export type TransactionInsert = Insert<Transaction, TimeStamps | 'deleted_at'>
export type TransferInsert = Insert<Transfer, TimeStamps | 'deleted_at'>
export type BudgetInsert = Insert<Budget, TimeStamps>
export type ReceiptInsert = Insert<Receipt, TimeStamps>
export type RecurringRuleInsert = Insert<RecurringRule, TimeStamps | 'deleted_at'>
export type SavingsGoalInsert = Insert<SavingsGoal, TimeStamps | 'deleted_at'>
export type AccountStatementInsert = Insert<AccountStatement, TimeStamps>
