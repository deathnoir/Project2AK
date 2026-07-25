# Project2AK

Personal finance for one person, in the Philippines, replacing a Google Sheets budget
tracker.

**Stack:** Next.js (App Router, TypeScript) on Vercel · Supabase (Postgres, Auth, Storage,
RLS) · Tailwind · Recharts
**Auth:** magic link, one user, RLS-scoped. No sharing, no multi-tenancy.
**Devices:** Android phone for daily entry, desktop for review. One responsive codebase,
installable PWA, no native app. iOS is explicitly out of scope.

---

## The bet

This app lives or dies on entry friction, not on features. Every abandoned budget tracker
had great reports and nobody logging transactions by week three.

Every scoping decision follows from that. Features that reduce entry friction ship in v1.
Features that only display data already entered ship in v1.1 — read-only value is
worthless if nobody's entering data.

**Success metric:** transactions logged in week 8 ≥ transactions logged in week 1.

---

## Getting started

```sh
cp .env.example .env.local     # fill in Supabase URL + anon key
npm install
npx supabase db push           # or: npx supabase start && npx supabase db reset
npm run dev
```

`ANTHROPIC_API_KEY` is optional. Without it, capture, storage, and manual entry all still
work — the review screen drops straight to the manual form with the image attached.

```sh
npm run typecheck
npm test
npm run build
```

---

## Conventions that are load-bearing

Read these before changing anything. Each one is a bug the spreadsheet had.

### Money is `bigint` centavos

Never `numeric`, never float. `numeric` is exact in Postgres but crosses into JavaScript
as a string or a float and drifts. Format at the display layer only, through
`src/lib/money.ts` or the `<Amount>` component.

### Transactions are signed against the account they post to

Expenses and finance charges are **negative**; income and refunds are **positive**. That
makes `opening_balance + Σ(transactions) + transfers_in − transfers_out` the whole balance
story, with no special cases — and it is why a BNPL purchase produces the right liability
without anyone thinking about it.

Budgets, by contrast, are **unsigned magnitudes**, because "₱5,000 for groceries" is how a
person thinks. `v_budget_vs_actual` flips the sign of actuals per category group so the
two compare directly.

### Balances are derived, never typed

The spreadsheet's hand-typed balances drifted from its logged transactions within weeks.
Every balance in this app comes out of `v_account_balances`. If you find yourself writing
a balance to a column, you have found a bug.

### Transfers are not income or expense

A transfer is one row with `from_account_id` and `to_account_id` and no category. Salary →
savings, BNPL installment payment, cash withdrawal. They must never land in an expense
total.

### Soft delete, everywhere

`deleted_at`, `created_at`, `updated_at` on every mutable table. Financial data where you
can't answer "why did this number change" gets abandoned. Cheap now, impossible to
retrofit.

### Derived logic lives in SQL

The spreadsheet had formula rows 8,000+ characters wide that broke whenever a row was
inserted. Rollover, safe-to-spend, budget-vs-actual, debt progress, and net worth are all
views in `supabase/migrations/0003_views.sql`. Don't recompute them in TypeScript.

---

## Two things that look wrong and aren't

### BNPL lines are accounts, not categories

REVI, BillEase, Spay, TiktokPay and Atome are each an `account` of type `credit` carrying a
negative balance — the same treatment a credit card gets. Double-entry falls out for free:

| Action | Entry | Effect |
|---|---|---|
| Buy ₱6,000 on Atome, 3× ₱2,000 | One transaction: −₱6,000, Clothing, account = Atome | Liability −₱6,000 at purchase. Expense lands in the correct month |
| Pay an installment | Transfer: bank → Atome | Cash down, liability down. **Not an expense** |
| Atome charges ₱300 in fees | Transaction: −₱300, Finance Charges, account = Atome | **Is** an expense — the cost of borrowing |

Consequences worth stating, because they look wrong at first glance:

- Installment payments never appear in any expense category. The expense already happened
  at purchase.
- The full liability appears the day you commit to it, not spread across the schedule.
- Buying on BNPL is *one* entry, not three. Fewer rows than the spreadsheet, not more.

Over the life of that purchase you record ₱6,300 of expense, correctly split between the
thing and the cost of financing it.

### Closure is the milestone, not payoff

A credit line at ₱0 is not finished — the credit is available again, and the balance
hitting zero is exactly when the operator invites you to use it. An account at ₱0 with
`closed_at IS NULL` renders as **"Open — close this"** in warning state, not as a success.
The Debt screen's headline count is *accounts closed*, not amount paid.

The default payoff order is **smallest balance first** — not for motivation, but because it
clears and closes whole accounts fastest, and a closed account is permanently one fewer
line of credit. The avalanche comparison is offered, not defaulted to.

---

## Receipt capture

SMS parsing is dead in PH — GCash and Maya moved to in-app push notifications — so the
input is images.

```
capture → downscale → upload → extract → review → commit
```

The **Web Share Target** is the primary path: screenshot the GCash receipt, share, pick
Project2AK. Two taps, never leaves the flow. It only registers once the PWA is installed to
the home screen, which is why the install prompt is not optional decoration.

Images are downscaled client-side to 1568px long edge, JPEG q0.8, before upload — vision
models downscale above this anyway, so doing it locally saves bandwidth, storage, and
tokens.

**Never auto-commit.** The review screen shows a pre-filled draft; when confidence is high,
confirming is one tap. Extraction failure is never a dead end: the user lands in the manual
form with the image already attached.

Reference numbers are the dedup defence — every PH e-wallet and bank confirmation prints
one, enforced by a partial unique index. On collision the app says "Already logged on
24 Jul" with a link, rather than erroring.

Images are kept permanently and linked to the transaction. It's the audit trail: "why is
there a ₱4,500 charge on the 12th" is answerable by looking at it. They're in the export.

---

## Screens

Five, plus settings. Thirteen was too many for one person to maintain.

| # | Screen | Job |
|---|---|---|
| 1 | **Dashboard** | Safe-to-spend (largest element), account balances, pending recurring to confirm, bills due this week, no-spend widget, YTD strip |
| 2 | **Add** | Capture or manual. Amount pad first, then category, then account. Defaults to today + last-used account. ≤3 taps |
| 3 | **Transactions** | Full log. Filter by month/category/account, inline edit, receipt thumbnail, bulk actions |
| 4 | **Budget** | 12 months × category grid. Allocation bar, rollover, copy month → rest of year |
| 5 | **Debt** | Balances, derived payments, payoff comparison, due-date calendar |
| — | **Settings** | Accounts, categories, recurring rules, savings goals, net worth items, reconciliation, export |

Cut from the spreadsheet: credit score tracking (no consumer-accessible unified bureau
score in PH makes monthly tracking meaningful), no-spend as a full screen (a widget
instead — it's gamification, not information), yearly actuals as its own grid (a filter on
Transactions), annual review as a separate screen (the YTD strip on Dashboard).

---

## Design

Ledger aesthetic for the working surfaces. Ink navy chrome `#10182B` on paper `#FBFAF7`,
hairline rules `#E3E0D8`. Figures in tabular monospace (IBM Plex Mono), right-aligned, so
columns scan like a bank statement. UI text in Instrument Sans.

**Colour encodes sign only** — jade `#0E7C66` positive, rose `#B4304A` negative. No
decorative colour anywhere. If you reach for a third hue, something has gone wrong.

The signature element is the zero-based allocation bar on Budget: a single horizontal bar
that fills as each peso is assigned and turns jade only at *exactly* zero left to budget.

### The 2AK line

Safe-to-spend is the largest number on the dashboard because it answers the daily
question. Directly beneath it, one quiet line: the combined balance of the goals tagged for
the kids, and its change this month. Small type, no illustration, no progress ring — the
number carries it.

The savings this app exists to build are for Amirah Kristine and Asher Kian. The daily work
is logging ₱200 jeepney fares; the point is what accumulates behind that. It's the only
place in the app where the point is stated rather than the mechanics — leave it alone.

---

## Non-goals for v1

Bank sync / open banking · multi-currency · shared households · native mobile app ·
investment performance tracking · bill negotiation or advice features.

**v1.1:** savings screen, net worth screen, review charts.
