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

type Table<Row, Generated extends keyof Row = never> = {
  Row: Row
  Insert: Omit<Row, Generated> & Partial<Pick<Row, Generated>>
  Update: Partial<Row>
  Relationships: []
}

type View<Row> = { Row: Row; Relationships: [] }

type Stamps = 'id' | 'created_at' | 'updated_at'
type SoftStamps = Stamps | 'deleted_at'

export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile, 'created_at' | 'updated_at'>
      accounts: Table<Account, SoftStamps>
      categories: Table<Category, SoftStamps>
      receipts: Table<Receipt, Stamps>
      recurring_rules: Table<RecurringRule, SoftStamps>
      transactions: Table<Transaction, SoftStamps>
      transfers: Table<Transfer, SoftStamps>
      budgets: Table<Budget, Stamps>
      savings_goals: Table<SavingsGoal, SoftStamps>
      account_statements: Table<AccountStatement, Stamps>
      net_worth_items: Table<NetWorthItem, SoftStamps>
      net_worth_values: Table<NetWorthValue, Stamps>
      no_spend_goals: Table<NoSpendGoal, Stamps>
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
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
