import { describe, it, expect } from 'vitest'
import { parseBatchNumber } from './batchParser'

describe('Julian Batch Number YY-JJJ Parser', () => {
  it('parses valid non-leap year dates correctly', () => {
    // 25-001 (Jan 1, 2025)
    let res = parseBatchNumber('25-001')
    expect(res.valid).toBe(true)
    expect(res.date).toBe('2025-01-01')

    // 25-365 (Dec 31, 2025)
    res = parseBatchNumber('25-365')
    expect(res.valid).toBe(true)
    expect(res.date).toBe('2025-12-31')

    // 25-060 (March 1, 2025 in a non-leap year)
    res = parseBatchNumber('25-060')
    expect(res.valid).toBe(true)
    expect(res.date).toBe('2025-03-01')
  })

  it('correctly handles leap year dates (e.g. year 2024)', () => {
    // 24-060 (Feb 29, 2024 in a leap year)
    let res = parseBatchNumber('24-060')
    expect(res.valid).toBe(true)
    expect(res.date).toBe('2024-02-29')

    // 24-366 (Dec 31, 2024)
    res = parseBatchNumber('24-366')
    expect(res.valid).toBe(true)
    expect(res.date).toBe('2024-12-31')
  })

  it('rejects invalid day bounds on leap vs non-leap years', () => {
    // 25-366 is invalid because 2025 is not a leap year
    let res = parseBatchNumber('25-366')
    expect(res.valid).toBe(false)
    expect(res.date).toBe('')

    // Day 0 is invalid
    res = parseBatchNumber('26-000')
    expect(res.valid).toBe(false)
    expect(res.date).toBe('')

    // Day 367 is invalid
    res = parseBatchNumber('26-367')
    expect(res.valid).toBe(false)
    expect(res.date).toBe('')
  })

  it('rejects badly formatted batch numbers', () => {
    expect(parseBatchNumber('').valid).toBe(false)
    expect(parseBatchNumber('abc').valid).toBe(false)
    expect(parseBatchNumber('26-12').valid).toBe(false)
    expect(parseBatchNumber('26-1234').valid).toBe(false)
    expect(parseBatchNumber('2-123').valid).toBe(false)
    expect(parseBatchNumber('26 - 123').valid).toBe(false)
  })
})
