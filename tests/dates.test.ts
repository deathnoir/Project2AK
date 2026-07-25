import { describe, expect, it } from 'vitest'
import {
  addMonths,
  clampedDay,
  daysBetween,
  formatRelativeDay,
  monthsBetween,
  nextOccurrence,
  nextPayday,
  today,
} from '@/lib/dates'

describe('today', () => {
  it('reports the Manila date, not the UTC one', () => {
    // 23:00 UTC on 24 July is already 07:00 on 25 July in Manila. A server in
    // UTC doing toISOString().slice(0,10) would file every early-morning
    // jeepney fare against the previous day.
    const utcEvening = new Date('2026-07-24T23:00:00Z')
    expect(today(utcEvening)).toBe('2026-07-25')

    const utcMidday = new Date('2026-07-25T04:00:00Z')
    expect(today(utcMidday)).toBe('2026-07-25')
  })
})

describe('clampedDay', () => {
  it('lands a 31st rule on the last day of a short month', () => {
    expect(clampedDay(2026, 1, 31)).toBe('2026-01-31')
    expect(clampedDay(2026, 2, 31)).toBe('2026-02-28')
    expect(clampedDay(2028, 2, 31)).toBe('2028-02-29') // leap year
    expect(clampedDay(2026, 11, 31)).toBe('2026-11-30')
  })
})

describe('nextPayday', () => {
  it('finds the next semi-monthly payday', () => {
    expect(nextPayday([15, 30], '2026-07-01')).toBe('2026-07-15')
    expect(nextPayday([15, 30], '2026-07-15')).toBe('2026-07-30')
    expect(nextPayday([15, 30], '2026-07-30')).toBe('2026-08-15')
  })

  it('crosses the month boundary and clamps February', () => {
    expect(nextPayday([30], '2026-02-01')).toBe('2026-02-28')
    expect(nextPayday([15, 30], '2026-01-31')).toBe('2026-02-15')
  })

  it('still answers when the profile has no payday configured', () => {
    expect(nextPayday([], '2026-07-25')).toBe('2026-08-25')
  })
})

describe('nextOccurrence', () => {
  const monthly = {
    frequency: 'monthly' as const,
    interval_months: 1,
    day_of_month: 28,
    month_of_year: null,
    next_run: '2026-01-28',
  }

  it('advances one month at a time', () => {
    expect(nextOccurrence(monthly, '2026-01-28')).toBe('2026-02-28')
  })

  it('catches a dormant rule up rather than firing once for a long-past date', () => {
    // A rule last run in January, first opened in June, should point at the
    // next real occurrence — not at February.
    expect(nextOccurrence(monthly, '2026-06-10')).toBe('2026-06-28')
  })

  it('clamps a 31st rule through February', () => {
    const rule = { ...monthly, day_of_month: 31, next_run: '2026-01-31' }
    expect(nextOccurrence(rule, '2026-01-31')).toBe('2026-02-28')
  })

  it('steps by the interval for every-N-months', () => {
    const quarterly = {
      frequency: 'every_n_months' as const,
      interval_months: 3,
      day_of_month: 5,
      month_of_year: null,
      next_run: '2026-01-05',
    }
    expect(nextOccurrence(quarterly, '2026-01-05')).toBe('2026-04-05')
    expect(nextOccurrence(quarterly, '2026-05-01')).toBe('2026-07-05')
  })

  it('pins yearly rules to their month', () => {
    const yearly = {
      frequency: 'yearly' as const,
      interval_months: 12,
      day_of_month: 12,
      month_of_year: 12,
      next_run: '2026-12-12',
    }
    expect(nextOccurrence(yearly, '2026-12-12')).toBe('2027-12-12')
  })
})

describe('spans', () => {
  it('measures days between calendar dates', () => {
    expect(daysBetween('2026-07-25', '2026-07-30')).toBe(5)
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1)
    expect(daysBetween('2026-07-30', '2026-07-25')).toBe(-5)
  })

  it('adds months with clamping', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15')
  })

  it('enumerates months inclusively', () => {
    expect(monthsBetween('2026-01-15', '2026-04-02')).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ])
  })
})

describe('formatRelativeDay', () => {
  it('names the days a person names', () => {
    expect(formatRelativeDay('2026-07-25', '2026-07-25')).toBe('Today')
    expect(formatRelativeDay('2026-07-24', '2026-07-25')).toBe('Yesterday')
    expect(formatRelativeDay('2026-07-26', '2026-07-25')).toBe('Tomorrow')
    expect(formatRelativeDay('2026-07-01', '2026-07-25')).toBe('1 Jul')
    expect(formatRelativeDay('2025-12-31', '2026-07-25')).toBe('31 Dec 2025')
  })
})
