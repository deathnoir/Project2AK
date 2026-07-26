# Deploying Project2AK

Vercel + Supabase. Roughly 20 minutes, most of it waiting for a Supabase
project to provision.

Do Supabase first — Vercel needs two values from it.

---

## 1. Supabase

**Create the project.** [supabase.com/dashboard](https://supabase.com/dashboard) →
New project. Pick **Southeast Asia (Singapore)**: it's the closest region to
Manila, and every page in this app is server-rendered against the database, so
the round trip is on the critical path for the number you look at most.

Save the database password somewhere. You need it once, in the next step.

**Apply the migrations.**

```sh
npx supabase login
npx supabase link --project-ref <your-project-ref>   # from the dashboard URL
npx supabase db push
```

That creates the 13 tables, 10 views, the RLS policies, the private `receipts`
storage bucket, and the trigger that seeds a profile and starting categories on
signup. Confirm with:

```sh
npx supabase db push --dry-run     # should report nothing left to apply
```

**Point auth at the deployment.** Dashboard → Authentication → URL
Configuration:

- **Site URL** — `https://your-app.vercel.app`
- **Redirect URLs** — add `https://your-app.vercel.app/auth/callback`

Magic links fail with a redirect error if the callback isn't on that list. Add
`http://localhost:3000/auth/callback` too if you'll run it locally.

**Close the door behind you.** This is a single-user app. Sign in once on the
deployed site so your account exists, then Dashboard → Authentication →
Sign In / Providers → turn **off** "Allow new users to sign up". RLS already
means a stranger who signs up sees only their own empty ledger, but there's no
reason to leave it open.

**Copy two values** from Project Settings → API:

- Project URL
- `anon` / `public` key

The anon key is safe in the browser bundle — every table is RLS-scoped to
`auth.uid()`, which is exactly why RLS is not optional here. Never put the
`service_role` key in this project; it bypasses RLS entirely.

---

## 2. Vercel

Import the repo, then set environment variables (Settings → Environment
Variables) **before** the first deploy:

| Variable | Value | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from above | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key from above | All |
| `NEXT_PUBLIC_SITE_URL` | `https://your-app.vercel.app` | Production |
| `ANTHROPIC_API_KEY` | your key | All |

`NEXT_PUBLIC_SITE_URL` matters more than it looks. Behind Vercel's proxy the
request's own origin can resolve to an internal host, which sends a
freshly-authenticated user to a URL that doesn't exist — and it presents as an
auth bug rather than a config one. Set it in Production and nothing is guessed.
Leave it unset on Preview so each preview deployment uses its own URL.

`ANTHROPIC_API_KEY` is optional. Without it the app still works end to end:
capture, upload, storage and manual entry are unaffected, and the review screen
drops straight to the manual form with the image already attached.

Deploy. Then go back to Supabase and make sure the Site URL and redirect URL
match the domain Vercel actually gave you.

---

## 3. First run

1. Open the site, enter your email, click the link.
2. The setup wizard asks for the places your money sits, your categories, and
   your paydays. Opening balances are as of today — there's no back-history to
   reconcile against.
3. **Install it to your home screen.** Android will offer this, and the app
   prompts on the Add screen. This is not optional decoration: a Web Share
   Target only registers for an installed PWA, so without it the fastest path
   in the app — screenshot a GCash receipt, share, done — simply doesn't exist,
   and there's nothing to tell you why.
4. Screenshot a receipt, share it to Project2AK, confirm the draft.

---

## Things worth knowing

**Serverless timeouts.** Receipt extraction is a vision call and routinely
takes longer than the 10 seconds a function gets by default. The review page
declares `maxDuration = 60` and the export route `maxDuration = 300`. On Hobby
the ceiling is 60s, so a very large export can be cut short — the JSON and CSV
formats are small and unaffected. Pro raises it to 300s.

The share target itself does **not** call the model; it uploads, redirects, and
lets the review screen extract. Doing it inline meant staring at the share sheet
for the whole round trip and risking a timeout that loses the receipt.

**Recurring rules generate on dashboard load**, not on a cron. A partial unique
index on `(recurring_rule_id, date)` makes that idempotent. No scheduled job to
configure, and no bill that only appears once a job has run.

**Storage.** Receipts are downscaled to 1568px / JPEG q0.8 in the browser before
upload, so they land around 200–400 KB. Supabase's free tier gives 1 GB, which
is a few thousand receipts.

**Backups.** Free-tier Supabase does not back up on a schedule you'd want to
rely on for this. `/api/export` returns everything — CSV per table, a JSON dump,
and every receipt image — so pull one occasionally and put it somewhere else.

---

## If something's wrong

| Symptom | Cause |
|---|---|
| Magic link → "That link didn't work" | Callback URL missing from the Supabase redirect allowlist |
| Redirected somewhere odd after sign-in | `NEXT_PUBLIC_SITE_URL` unset in Production |
| Every screen shows ₱0.00 | Setup didn't complete — no account means nowhere for a transaction to post |
| Share sheet has no Project2AK | Not installed to the home screen; the share target only registers for an installed PWA |
| Review always shows the manual form | `ANTHROPIC_API_KEY` unset, or extraction failed — the page states which |
| Receipt thumbnails don't load | Storage policies missing; re-run `npx supabase db push` |
