import { describe, it, expect } from 'vitest'
import { num, fmt, avg, avgLogPh, calculateTest, isShipmentArchived } from './calculations'

describe('Math and Calculations Utilities', () => {
  describe('num()', () => {
    it('safely parses valid numbers', () => {
      expect(num(42)).toBe(42)
      expect(num('42')).toBe(42)
      expect(num('3.14')).toBe(3.14)
    })

    it('returns NaN for invalid values', () => {
      expect(num('abc')).toBeNaN()
      expect(num(undefined)).toBeNaN()
      expect(num(null)).toBe(0) // Number(null) is 0 in JS
    })
  })

  describe('fmt()', () => {
    it('formats finite numbers to standard decimal format', () => {
      expect(fmt(3.14159)).toBe('3.14')
      expect(fmt(3.1)).toBe('3.1')
      expect(fmt(3)).toBe('3')
    })

    it('returns dash for non-finite numbers', () => {
      expect(fmt(NaN)).toBe('-')
      expect(fmt(Infinity)).toBe('-')
    })
  })

  describe('avg()', () => {
    it('calculates average of numbers', () => {
      expect(avg([1, 2, 3, 4])).toBe(2.5)
      expect(avg([5])).toBe(5)
    })

    it('ignores non-finite numbers', () => {
      expect(avg([1, NaN, 3, NaN])).toBe(2)
    })

    it('returns NaN for empty list or only NaNs', () => {
      expect(avg([])).toBeNaN()
      expect(avg([NaN])).toBeNaN()
    })
  })

  describe('avgLogPh()', () => {
    it('calculates logarithmic pH average correctly', () => {
      expect(avgLogPh([7.0, 7.0])).toBe(7.0)
      expect(avgLogPh([6.0, 7.0])).toBeCloseTo(6.26, 2)
      expect(avgLogPh([5.0, 6.0, 7.0])).toBeCloseTo(5.43, 2)
    })

    it('ignores non-finite numbers', () => {
      expect(avgLogPh([6.0, NaN, 7.0, NaN])).toBeCloseTo(6.26, 2)
    })

    it('returns NaN for empty list or only NaNs', () => {
      expect(avgLogPh([])).toBeNaN()
      expect(avgLogPh([NaN])).toBeNaN()
    })
  })

  describe('calculateTest()', () => {
    it('returns empty results for unknown test IDs', () => {
      const res = calculateTest('unknown_test', [])
      expect(res.complete).toBe(false)
      expect(res.label).toBe('-')
    })

    it('calculates qualitative (pass/fail) tests based on the last row', () => {
      let res = calculateTest('labeling_packaging', [
        { pass: 'Pass', reason: 'Looks good' }
      ])
      expect(res.complete).toBe(true)
      expect(res.label).toBe('Pass')
      expect(res.note).toBe('Looks good')

      res = calculateTest('labeling_packaging', [
        { pass: 'Pass', reason: 'Looks good' },
        { pass: 'Fail', reason: 'Damaged box' }
      ])
      expect(res.complete).toBe(true)
      expect(res.label).toBe('Fail')
      expect(res.note).toBe('Damaged box')
    })

    it('calculates weight test using net directly or gross - tare', () => {
      // Net directly
      let res = calculateTest('weight', [{ net: '5.5' }])
      expect(res.complete).toBe(true)
      expect(res.average).toBe(5.5)

      // Gross and Tare
      res = calculateTest('weight', [{ gross: '10.5', tare: '5.0' }])
      expect(res.complete).toBe(true)
      expect(res.average).toBe(5.5)

      // Average of multiple weight replicates
      res = calculateTest('weight', [
        { gross: '10.5', tare: '5.0' },
        { net: '6.5' }
      ])
      expect(res.complete).toBe(true)
      expect(res.average).toBe(6.0) // (5.5 + 6.5) / 2
    })

    it('calculates volume based on weight and specific gravity (derived)', () => {
      const batchResults = {
        weight: [{ net: '10.0' }],
        specific_gravity: [{ value: '1.25' }]
      }
      const res = calculateTest('volume', [], batchResults)
      expect(res.complete).toBe(true)
      expect(res.average).toBe(8.0) // 10.0 / 1.25
      expect(res.label).toBe('8 ml')
    })

    it('calculates vacuum converting inHg to mmHg', () => {
      const res = calculateTest('vacuum', [{ hg: '10' }])
      expect(res.complete).toBe(true)
      expect(res.average).toBe(254) // 10 * 25.4
    })

    it('calculates pH and formats as pH of X.XX', () => {
      const res1 = calculateTest('ph', [{ value: '5.5' }])
      expect(res1.complete).toBe(true)
      expect(res1.average).toBe(5.5)
      expect(res1.label).toBe('pH of 5.5')

      const res2 = calculateTest('ph', [{ value: '6.0' }, { value: '7.0' }])
      expect(res2.complete).toBe(true)
      expect(res2.average).toBeCloseTo(6.26, 2)
      expect(res2.label).toBe('pH of 6.26')
    })

    it('calculates acidity with Citric acid constant', () => {
      const res = calculateTest('acidity', [{ volume: '5.0', mass: '10.0', acid: '0.64' }])
      expect(res.complete).toBe(true)
      expect(res.average).toBeCloseTo(0.32) // (5 * 0.64) / 10
    })

    it('calculates multiple results like filling_coating', () => {
      const res = calculateTest('filling_coating', [
        { external: '2.0', internal: '3.0', total: '10.0' }
      ])
      expect(res.complete).toBe(true)
      expect(res.label).toBe('Coating %: 20% / Filling %: 30%')
    })
  })

  describe('isShipmentArchived()', () => {
    it('returns false if shipment is null, has no batches, or empty batches list', () => {
      expect(isShipmentArchived(null)).toBe(false)
      expect(isShipmentArchived({})).toBe(false)
      expect(isShipmentArchived({ batches: [] })).toBe(false)
    })

    it('returns false if any batch in shipment is not approved', () => {
      const shipment = {
        batches: [
          { id: 'b1', approved_at: '2026-06-19T12:00:00Z' },
          { id: 'b2', approved_at: null }
        ]
      }
      expect(isShipmentArchived(shipment)).toBe(false)
    })

    it('returns false if all batches approved but within 24-hour grace period', () => {
      const now = new Date()
      // approved 12 hours ago
      const recentApproval = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString()
      
      const shipment = {
        batches: [
          { id: 'b1', approved_at: recentApproval }
        ]
      }
      expect(isShipmentArchived(shipment)).toBe(false)
    })

    it('returns true if all batches approved and latest approval is older than 24 hours', () => {
      const now = new Date()
      // approved 25 hours ago
      const oldApproval = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString()
      // approved 30 hours ago
      const olderApproval = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString()

      const shipment = {
        batches: [
          { id: 'b1', approved_at: olderApproval },
          { id: 'b2', approved_at: oldApproval }
        ]
      }
      expect(isShipmentArchived(shipment)).toBe(true)
    })
  })
})
