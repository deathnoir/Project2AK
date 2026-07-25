# Project2AK — working notes

Single-user personal finance PWA. Philippines, PHP. Next.js App Router + Supabase.

Read `README.md` first — it carries the reasoning. This file is the short version plus the
things that will bite you.

## Commands

```sh
npm run dev
npm run typecheck     # tsc --noEmit
npm test              # vitest run
npm run build
npx supabase db push  # apply migrations
```

## Non-negotiables

- **Money is `bigint` centavos.** No floats, no `numeric`, no decimal strings in logic.
  Format only via `src/lib/money.ts` or `<Amount>`.
- **Transactions are signed** against the account they post to: expense negative, income
  positive. Budgets are unsigned magnitudes.
- **Balances are derived** from `v_account_balances`. Never write a balance to a column.
- **Transfers are neither income nor expense.** `transfers` table, positive amount, no
  category.
- **Soft delete.** Set `deleted_at`; every read filters `.is('deleted_at', null)`.
- **RLS on everything.** Set `user_id` on every insert. Views are `security_invoker`.
- **Pending rows** (`is_pending = true`) are excluded from balances and actuals by the
  views. Never auto-confirm one.

## Layout

```
supabase/migrations/   0001 schema · 0002 RLS+storage · 0003 views · 0004 seed
src/lib/               money, dates, cn, env, db/{types,schema}, supabase/*,
                       extraction/*, image/*, domain/*
src/components/        nav, service-worker, pending-queue, ui/{amount,primitives}
src/app/(app)/         authenticated shell: dashboard, add, transactions, budget,
                       debt, settings
src/app/login|setup|auth/  unauthenticated routes
src/server/actions/    'use server' mutations, one file per area
tests/                 vitest, pure logic only
```

`src/lib/db/types.ts` and `src/lib/db/schema.ts` are hand-maintained mirrors of the
migrations. **Change a migration, change them in the same commit** — they are the only
thing between a renamed column and a runtime `undefined`.

## Design

Only these tokens (`src/app/globals.css`): `bg-paper`, `bg-paper-sunk`, `text-ink`,
`text-ink-70`, `text-ink-45`, `text-ink-25`, `border-rule`, `border-rule-strong`,
`text-jade`, `bg-jade-soft`, `text-rose`, `bg-rose-soft`.

**Colour encodes sign only.** Any other hue is a defect. No category colours, no icon
sets, no gradients.

Figures use `.figure` (tabular monospace, right-aligned) or `<Amount>` — never a bare
formatted string, or columns stop lining up.

## UI language

Never label the balances split "Accounts" — that word implies ownership and reads wrong for
a BNPL tab. It is always **"Money I have"** and **"Money I owe"**. `accounts` stays the
internal table name.

## Things that look like bugs and aren't

- A BNPL purchase is **one** transaction on the credit account, not three installments.
- An installment payment is a **transfer**, so it appears in no expense category.
- The Debt screen defaults to **smallest balance first**, not highest APR — closing whole
  accounts fastest is worth more than the interest saved.
- An account at ₱0 shows **"Open — close this"** in warning state, not as a success.
- The 2AK line on the dashboard renders nothing when no goal is tagged. That is deliberate.
