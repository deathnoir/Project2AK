import 'server-only'

import Anthropic from '@anthropic-ai/sdk'
import { EXTRACTION_JSON_SCHEMA, extractionSchema, type Extraction } from './schema'
import { requireEnv } from '@/lib/env'
import { today } from '@/lib/dates'

/**
 * Vision extraction for receipt images.
 *
 * SMS parsing is dead in PH — GCash and Maya moved to in-app push
 * notifications — so the input is images: e-wallet confirmation screenshots,
 * bank transfer confirmations, BNPL payment confirmations, and photos of
 * physical store receipts.
 *
 * Runs as a server action rather than an Edge Function. Server action is
 * simpler and the latency budget is one image; the moment batch uploads want
 * background processing, this module is the only thing that has to move.
 */

const MODEL = 'claude-opus-5'

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

export interface ExtractionResult {
  ok: boolean
  extraction: Extraction | null
  raw: unknown
  error: string | null
}

function systemPrompt(todayDate: string): string {
  return [
    'You read Philippine payment receipts and return structured data. JSON only, no prose.',
    '',
    'Rules that matter more than they look:',
    '',
    '- Amounts are INTEGER CENTAVOS. ₱450.00 is 45000. ₱1,234.56 is 123456. Never emit a float.',
    '- amount_centavos is the amount that left (or entered) the account for the goods or',
    '  service itself. If the receipt prints a separate convenience fee, transfer fee, or',
    '  service charge, put that in fee_centavos and do NOT fold it into amount_centavos.',
    '  If the receipt only shows one combined total, put it all in amount_centavos and leave',
    '  fee_centavos null.',
    '- reference_no is copied character for character from the image. It is what stops the',
    '  same screenshot being logged twice, so a transcription slip is worse than a null.',
    '  If you cannot read every character with confidence, return null.',
    `- Dates are YYYY-MM-DD. Philippine receipts are usually DD/MM/YYYY or "24 Jul 2026".`,
    `  Today is ${todayDate}; a receipt with no year is from the most recent occurrence of`,
    '  that day that is not in the future.',
    '- A transaction-history screenshot contains many rows: return one array entry per row,',
    '  in the order they appear, and set image_kind to transaction_history.',
    '- type: payment for a purchase; transfer_out / transfer_in for money moved between',
    '  accounts or sent to a person; cash_in / cash_out for wallet top-ups and withdrawals;',
    '  refund for a reversal.',
    '- merchant is exactly as printed, including the branch ("Jollibee SM Dasmariñas").',
    '',
    'Confidence is per-field and honest. Score low when a figure is blurred, cropped, glare-',
    'covered, or ambiguous. A confident wrong amount is the single most expensive thing you',
    'can produce here: it lands in a ledger and quietly stays wrong. An unconfident one just',
    'means the human types it.',
    '',
    'If the image is not a payment receipt at all, return an empty transactions array with',
    'image_kind "unknown" and say so in notes.',
  ].join('\n')
}

/**
 * Extract transactions from one receipt image.
 *
 * Never throws for an extraction failure — the caller drops the user into the
 * manual entry form with the image already attached, so a failure has to be a
 * value, not an exception.
 */
export async function extractReceipt(
  imageBase64: string,
  mediaType: ImageMediaType,
  options: { todayDate?: string; signal?: AbortSignal } = {},
): Promise<ExtractionResult> {
  let client: Anthropic
  try {
    client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') })
  } catch (error) {
    return { ok: false, extraction: null, raw: null, error: messageOf(error) }
  }

  let raw: unknown = null
  try {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 8000,
        system: systemPrompt(options.todayDate ?? today()),
        // Receipt reading is perception, not deliberation. Low effort keeps
        // the user's wait short; the structured-output constraint is what
        // guarantees the shape, not thinking depth.
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: EXTRACTION_JSON_SCHEMA },
        },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: imageBase64 },
              },
              {
                type: 'text',
                text: 'Extract every transaction visible in this image.',
              },
            ],
          },
        ],
      },
      { signal: options.signal },
    )

    if (response.stop_reason === 'refusal') {
      return {
        ok: false,
        extraction: null,
        raw: null,
        error: 'The model declined to read this image.',
      }
    }

    if (response.stop_reason === 'max_tokens') {
      return {
        ok: false,
        extraction: null,
        raw: null,
        error: 'The image held more rows than one pass could return. Try cropping it.',
      }
    }

    const text = response.content.find((block) => block.type === 'text')?.text
    if (!text) {
      return { ok: false, extraction: null, raw: null, error: 'Empty response from the model.' }
    }

    raw = JSON.parse(text)
  } catch (error) {
    return { ok: false, extraction: null, raw, error: messageOf(error) }
  }

  const parsed = extractionSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      extraction: null,
      raw,
      // Keep the raw response even on a schema miss: it is often readable by a
      // human and it is the only evidence of what went wrong.
      error: `Extraction did not match the expected shape: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .join('; ')}`,
    }
  }

  return { ok: true, extraction: parsed.data, raw, error: null }
}

function messageOf(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return `Extraction service error (${error.status ?? 'network'}): ${error.message}`
  }
  if (error instanceof Error) return error.message
  return 'Unknown extraction error.'
}
