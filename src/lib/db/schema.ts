/**
 * The `Database` generic the Supabase client is parameterised on.
 *
 * Assembled from the row interfaces in ./types rather than generated, so that
 * `supabase.from('transactions').select()` is typed without a codegen step in
 * the loop. Views are exposed read-only, which is exactly what they are.
 */
import type {
  Account,
  AccountBalance,
  AccountStatement,
  BeneficiaryTotal,
  Budget,
  BudgetVsActual,
  Category,
  DebtProgress,
  MonthlyActual,
  NetWorthItem,
  NetWorthMonth,
  NetWorthValue,
  NoSpendDay,
  NoSpendGoal,
  Profile,
  Receipt,
  Reconciliation,
  RecurringRule,
  SafeToSpend,
  SavingsGoal,
  SavingsProgress,
  Transaction,
  Transfer,
} from './types'

/**
 * Insert shapes are `Partial<Row>` plus `user_id` where the table has one.
 *
 * Requiredness is the database's job — nearly every column has a default, and
 * mirroring each one here would be a second source of truth that drifts. What
 * this type still buys is the part that matters: an unknown or renamed column
 * is rejected at compile time, and every value is checked against its column's
 * type. `user_id` stays mandatory because omitting it doesn't fail loudly, it
 * fails as an RLS rejection at runtime.
 */
type Insertable<Row> = Row extends { user_id: string }
  ? Partial<Row> & { user_id: string }
  : Partial<Row>

type Table<Row> = {
  Row: Row
  Insert: Insertable<Row>
  Update: Partial<Row>
  Relationships: []
}

type View<Row> = { Row: Row; Relationships: [] }

/**
 * Declared as a type alias, not an interface: only aliases get the implicit
 * index signature that satisfies postgrest-js's `GenericSchema` constraint.
 * As an interface, every query silently resolves to `never`.
 */
export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>
      accounts: Table<Account>
      categories: Table<Category>
      receipts: Table<Receipt>
      recurring_rules: Table<RecurringRule>
      transactions: Table<Transaction>
      transfers: Table<Transfer>
      budgets: Table<Budget>
      savings_goals: Table<SavingsGoal>
      account_statements: Table<AccountStatement>
      net_worth_items: Table<NetWorthItem>
      net_worth_values: Table<NetWorthValue>
      no_spend_goals: Table<NoSpendGoal>
    }
    Views: {
      v_account_balances: View<AccountBalance>
      v_monthly_actuals: View<MonthlyActual>
      v_budget_vs_actual: View<BudgetVsActual>
      v_safe_to_spend: View<SafeToSpend>
      v_savings_progress: View<SavingsProgress>
      v_beneficiary_totals: View<BeneficiaryTotal>
      v_debt_progress: View<DebtProgress>
      v_reconciliation: View<Reconciliation>
      v_no_spend_days: View<NoSpendDay>
      v_net_worth_monthly: View<NetWorthMonth>
    }
    // Must satisfy GenericFunction (Args/Returns), so an empty record of
    // `never` is rejected and takes the whole schema down with it.
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>
    Enums: Record<string, string>
    CompositeTypes: Record<string, Record<string, unknown>>
  }
}
