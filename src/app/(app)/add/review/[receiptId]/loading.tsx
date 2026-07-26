import { Card, CardHeader, Screen, ScreenTitle } from '@/components/ui/primitives'

/**
 * Shown while the receipt is being read.
 *
 * The share target hands off here immediately, so this is the first thing the
 * user sees after the share sheet closes. It states what's happening rather
 * than spinning, because "reading the receipt" is a several-second wait and a
 * bare spinner reads as a hang.
 */
export default function ReviewLoading() {
  return (
    <Screen>
      <ScreenTitle>Review</ScreenTitle>
      <Card>
        <CardHeader title="Reading the receipt" hint="A few seconds" />
        <div className="space-y-3 p-4">
          <div className="h-40 w-full animate-pulse rounded-[6px] bg-paper-sunk" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-paper-sunk" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-paper-sunk" />
          <p className="pt-1 text-sm text-ink-45">
            The image is already saved. If it can&rsquo;t be read you&rsquo;ll get the manual
            form with the receipt attached — nothing is lost either way.
          </p>
        </div>
      </Card>
    </Screen>
  )
}
