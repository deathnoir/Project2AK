import { z } from 'zod'

/**
 * The extraction contract.
 *
 * Two representations of the same shape, deliberately: a JSON Schema that goes
 * to the model as a structured-output constraint, and a Zod schema that
 * validates what comes back. The model's output is constrained, not trusted —
 * a schema violation should surface as "extraction failed, here's the manual
 * form with your image attached", never as a NaN in a ledger.
 *
 * Note what the JSON Schema does NOT contain: numeric minimum/maximum and
 * string length constraints. Structured outputs reject them, so those live in
 * the Zod layer only.
 */

export const TRANSACTION_TYPES = [
  'payment',
  'transfer_out',
  'transfer_in',
  'cash_in',
  'cash_out',
  'refund',
] as const

export const IMAGE_KINDS = [
  'ewallet_receipt',
  'bank_confirmation',
  'store_receipt',
  'transaction_history',
  'bnpl_payment',
  'unknown',
] as const

export const confidenceSchema = z.object({
  amount: z.number().min(0).max(1),
  date: z.number().min(0).max(1),
  merchant: z.number().min(0).max(1),
})

export const extractedTransactionSchema = z.object({
  /** Integer centavos. Never floats — ₱450.00 is 45000, not 450.0. */
  amount_centavos: z.number().int(),
  currency: z.string(),
  /** YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** HH:MM, 24-hour, or null when the receipt doesn't print one. */
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  merchant: z.string().nullable(),
  /** The dedup key. Every PH e-wallet and bank confirmation prints one. */
  reference_no: z.string().nullable(),
  source_account_hint: z.string().nullable(),
  type: z.enum(TRANSACTION_TYPES),
  /** Convenience/InstaPay fees, split off so the merchant expense stays clean. */
  fee_centavos: z.number().int().nullable(),
  confidence: confidenceSchema,
})

export const extractionSchema = z.object({
  /** An array because a transaction-history screenshot contains many rows. */
  transactions: z.array(extractedTransactionSchema),
  image_kind: z.enum(IMAGE_KINDS),
  notes: z.string().nullable(),
})

export type ExtractedTransaction = z.infer<typeof extractedTransactionSchema>
export type Extraction = z.infer<typeof extractionSchema>

/**
 * The JSON Schema handed to the model. Kept in lockstep with the Zod schema
 * above by the `extraction schema stays in lockstep` test.
 */
export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['transactions', 'image_kind', 'notes'],
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'amount_centavos',
          'currency',
          'date',
          'time',
          'merchant',
          'reference_no',
          'source_account_hint',
          'type',
          'fee_centavos',
          'confidence',
        ],
        properties: {
          amount_centavos: {
            type: 'integer',
            description:
              'Total amount in centavos as an integer. ₱450.00 is 45000. Never a float.',
          },
          currency: { type: 'string', description: 'ISO code, e.g. PHP.' },
          date: { type: 'string', description: 'Transaction date as YYYY-MM-DD.' },
          time: {
            type: ['string', 'null'],
            description: 'Transaction time as HH:MM in 24-hour form, or null.',
          },
          merchant: {
            type: ['string', 'null'],
            description:
              'Merchant or counterparty exactly as printed, including branch. Null if absent.',
          },
          reference_no: {
            type: ['string', 'null'],
            description:
              'Reference / transaction / confirmation number exactly as printed. Null if absent.',
          },
          source_account_hint: {
            type: ['string', 'null'],
            description:
              'Which wallet, bank, or credit line this came from, as named on the image.',
          },
          type: { type: 'string', enum: [...TRANSACTION_TYPES] },
          fee_centavos: {
            type: ['integer', 'null'],
            description:
              'Separately-printed convenience or transfer fee in centavos, excluded from amount_centavos. Null if none.',
          },
          confidence: {
            type: 'object',
            additionalProperties: false,
            required: ['amount', 'date', 'merchant'],
            properties: {
              amount: { type: 'number', description: '0 to 1.' },
              date: { type: 'number', description: '0 to 1.' },
              merchant: { type: 'number', description: '0 to 1.' },
            },
          },
        },
      },
    },
    image_kind: { type: 'string', enum: [...IMAGE_KINDS] },
    notes: {
      type: ['string', 'null'],
      description: 'Anything ambiguous a human should check. Null when nothing is.',
    },
  },
} as const

/** Below this on amount, the review screen opens the manual form instead. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7
/** At or above this on every field, confirming is one tap with no edits. */
export const HIGH_CONFIDENCE_THRESHOLD = 0.9

export function isHighConfidence(t: ExtractedTransaction): boolean {
  return (
    t.confidence.amount >= HIGH_CONFIDENCE_THRESHOLD &&
    t.confidence.date >= HIGH_CONFIDENCE_THRESHOLD
  )
}

export function needsManualFallback(t: ExtractedTransaction): boolean {
  return t.confidence.amount < LOW_CONFIDENCE_THRESHOLD
}
