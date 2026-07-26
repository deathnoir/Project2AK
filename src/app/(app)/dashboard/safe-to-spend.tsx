import { Amount } from '@/components/ui/amount'
import { formatDate } from '@/lib/dates'
import type { BeneficiaryTotal, SafeToSpend } from '@/lib/db/types'

/**
 * The largest number on the screen.
 *
 * Nobody wakes up asking about variance to budget. They ask "can I afford this
 * right now" — and answering it needs account balances, known recurring bills,
 * and their due dates projected forward, which is the thing a spreadsheet
 * structurally cannot do.
 */
export function SafeToSpendPanel({
  data,
  beneficiary,
}: {
  data: SafeToSpend | null
  beneficiary: BeneficiaryTotal | null
}) {
  if (!data) return null

  return (
    <section className="border-b border-rule pb-6">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-45">
        Safe to spend
      </p>

      <div className="mt-1">
        <Amount centavos={data.safe_to_spend_centavos} size="hero" tone="auto" />
      </div>

      <p className="mt-2 text-sm text-ink-45">
        After <Amount centavos={data.committed_centavos} size="sm" tone="none" absolute />{' '}
        already committed, until payday on {formatDate(data.next_payday)}
        {data.days_to_payday > 0 ? ` — ${data.days_to_payday} day${data.days_to_payday === 1 ? '' : 's'} away` : ''}.
      </p>

      <TwoAkLine beneficiary={beneficiary} />
    </section>
  )
}

/**
 * The 2AK line.
 *
 * The savings this app exists to build are for Amirah Kristine and Asher Kian.
 * The daily work is logging ₱200 jeepney fares; the point is what accumulates
 * behind that. This is the only place in the app where the point is stated
 * rather than the mechanics — small type, no illustration, no progress ring.
 * The number carries it.
 *
 * When nothing is tagged this renders nothing. An empty-state prompt inviting
 * the user to "set up a goal for your kids" would cheapen it.
 */
function TwoAkLine({ beneficiary }: { beneficiary: BeneficiaryTotal | null }) {
  if (!beneficiary || beneficiary.saved_centavos === 0) return null

  const change = beneficiary.change_this_month_centavos

  return (
    <p className="mt-4 text-sm text-ink-70">
      <span className="text-ink-45">For {beneficiary.beneficiary}</span>{' '}
      <Amount centavos={beneficiary.saved_centavos} size="sm" tone="none" />
      {change !== 0 ? (
        <>
          {' '}
          <span className="text-ink-45">this month</span>{' '}
          <Amount centavos={change} size="sm" signed />
        </>
      ) : null}
    </p>
  )
}
