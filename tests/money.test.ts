import { describe, expect, it } from 'vitest'
import {
  formatCentavos,
  formatCompact,
  parseAmount,
  pesosToCentavos,
  splitEvenly,
  sumCentavos,
  toCentavos,
} from '@/lib/money'

describe('parseAmount', () => {
  it('reads what a human types, including pasted bank formatting', () => {
    expect(parseAmount('450')).toBe(45000)
    expect(parseAmount('450.00')).toBe(45000)
    expect(parseAmount('₱1,234.56')).toBe(123456)
    expect(parseAmount('PHP 1,234.56')).toBe(123456)
    expect(parseAmount(' 1 234.56 ')).toBe(123456)
    expect(parseAmount('.5')).toBe(50)
  })

  it('handles every way a negative gets written', () => {
    expect(parseAmount('-500')).toBe(-50000)
    expect(parseAmount('500-')).toBe(-50000)
    expect(parseAmount('(500)')).toBe(-50000)
    expect(parseAmount('−500')).toBe(-50000) // U+2212
    expect(parseAmount('₱(1,234.56)')).toBe(-123456)
  })

  it('returns null rather than guessing, so empty and zero stay distinct', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('   ')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('12.34.56')).toBeNull()
    expect(parseAmount('1e5')).toBeNull()
    expect(parseAmount('0')).toBe(0)
  })

  it('rounds sub-centavo input rather than truncating it', () => {
    expect(parseAmount('1.005')).toBe(101)
    expect(parseAmount('1.004')).toBe(100)
  })
})

describe('formatCentavos', () => {
  it('uses a true minus sign so negatives align in a tabular column', () => {
    const negative = formatCentavos(-45000)
    expect(negative).toBe('−₱450.00')
    expect(negative).not.toContain('-') // ASCII hyphen would break alignment
  })

  it('groups thousands and always shows centavos by default', () => {
    expect(formatCentavos(123456789)).toBe('₱1,234,567.89')
    expect(formatCentavos(0)).toBe('₱0.00')
    expect(formatCentavos(45000, { cents: false })).toBe('₱450')
    expect(formatCentavos(45000, { symbol: false })).toBe('450.00')
  })

  it('can force a sign or drop one', () => {
    expect(formatCentavos(45000, { signed: true })).toBe('+₱450.00')
    expect(formatCentavos(0, { signed: true })).toBe('₱0.00')
    expect(formatCentavos(-45000, { absolute: true })).toBe('₱450.00')
  })
})

describe('formatCompact', () => {
  it('shortens for dense grids without inventing precision', () => {
    expect(formatCompact(50000)).toBe('₱500')
    expect(formatCompact(120000)).toBe('₱1.2k')
    expect(formatCompact(4500000)).toBe('₱45k')
    expect(formatCompact(140000000)).toBe('₱1.4M')
    expect(formatCompact(-120000)).toBe('−₱1.2k')
  })
})

describe('splitEvenly', () => {
  it('splits ₱6,000 into three exact installments', () => {
    const parts = splitEvenly(600000, 3)
    expect(parts).toEqual([200000, 200000, 200000])
    expect(sumCentavos(parts)).toBe(600000)
  })

  it('never loses a centavo to rounding', () => {
    const parts = splitEvenly(10000, 3)
    expect(sumCentavos(parts)).toBe(10000)
    expect(parts).toEqual([3334, 3333, 3333])
  })

  it('carries the sign onto every part', () => {
    expect(sumCentavos(splitEvenly(-10000, 3))).toBe(-10000)
    expect(splitEvenly(100, 0)).toEqual([])
  })
})

describe('coercion', () => {
  it('survives bigint columns arriving as strings', () => {
    expect(toCentavos('45000')).toBe(45000)
    expect(toCentavos(null)).toBe(0)
    expect(toCentavos(undefined)).toBe(0)
    expect(toCentavos('nonsense')).toBe(0)
  })

  it('converts pesos without float drift', () => {
    expect(pesosToCentavos(1234.56)).toBe(123456)
    expect(pesosToCentavos(-0.1)).toBe(-10)
    expect(pesosToCentavos(19.99)).toBe(1999)
  })
})
