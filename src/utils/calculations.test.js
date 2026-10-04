import { describe, it, expect } from 'vitest'
import { num, fmt, avg, avgLogPh, calculateTest, isShipmentArchived, isTestLocked, isPendingReviewBatch, getPendingReviewBatches, addIncubationDays, getEffectiveExitDate } from './calculations'

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

    it('returns true if all batches approved (regardless of approval age)', () => {
      const now = new Date()
      // approved 12 hours ago
      const recentApproval = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString()
      
      const shipment = {
        batches: [
          { id: 'b1', approved_at: recentApproval }
        ]
      }
      expect(isShipmentArchived(shipment)).toBe(true)
    })
  })

  describe('isTestLocked()', () => {
    const templateWithInc = {
      requires_incubation: true,
      incubation_36: 10,
      incubation_55: 5
    }

    const templateNoInc = {
      requires_incubation: false
    }

    // Dynamic dates keep these tests valid no matter when they run.
    const today = () => new Date().toISOString().slice(0, 10)
    const dayOffset = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    it('returns false if template does not require incubation', () => {
      const batch = { units_36: 1, units_55: 1, exit_36: '2026-07-10', exit_55: '2026-07-05' }
      expect(isTestLocked('ph_36', batch, templateNoInc)).toBe(false)
      expect(isTestLocked('ph_55', batch, templateNoInc)).toBe(false)
    })

    it('returns false if batch is manually unlocked or fully exited', () => {
      const batchUnlocked = {
        units_36: 1,
        units_55: 1,
        exit_36: '2026-07-10',
        exit_55: '2026-07-05',
        is_manually_unlocked: true
      }
      const batchExited = {
        units_36: 1,
        units_55: 1,
        exit_36: '2026-07-10',
        exit_55: '2026-07-05',
        incubation_exited_at: '2026-06-25T12:00:00Z'
      }

      expect(isTestLocked('ph_36', batchUnlocked, templateWithInc)).toBe(false)
      expect(isTestLocked('ph_55', batchExited, templateWithInc)).toBe(false)
    })

    it('locks 36°C tests if exit_36 is in the future', () => {
      const batch = {
        units_36: 1,
        exit_36: dayOffset(10) // future
      }
      expect(isTestLocked('ph_36', batch, templateWithInc)).toBe(true)
      expect(isTestLocked('vacuum_36', batch, templateWithInc)).toBe(true)
    })

    it('unlocks 36°C tests if exit_36 is in the past or today', () => {
      const batchPast = {
        units_36: 1,
        exit_36: dayOffset(-10) // past
      }
      const batchToday = {
        units_36: 1,
        exit_36: today() // today
      }
      expect(isTestLocked('ph_36', batchPast, templateWithInc)).toBe(false)
      expect(isTestLocked('vacuum_36', batchToday, templateWithInc)).toBe(false)
    })

    it('locks 36°C tests if batch has no units in 36°C chamber', () => {
      const batch = {
        units_36: 0,
        units_55: 1,
        exit_55: '2026-06-20'
      }
      expect(isTestLocked('ph_36', batch, templateWithInc)).toBe(true)
    })

    it('locks 55°C tests if batch has no units in 55°C chamber', () => {
      const batch = {
        units_36: 1,
        units_55: 0,
        exit_36: dayOffset(-10)
      }
      expect(isTestLocked('ph_55', batch, templateWithInc)).toBe(true)
    })

    it('unlocks 36°C tests when the template requires no 36°C incubation', () => {
      const templateNoInc36 = { requires_incubation: true, incubation_36: 0, incubation_55: 5 }
      const batch = {
        units_36: 0,
        units_55: 1,
        exit_55: dayOffset(-10)
      }
      expect(isTestLocked('ph_36', batch, templateNoInc36)).toBe(false)
      expect(isTestLocked('vacuum_36', batch, templateNoInc36)).toBe(false)

      // Legacy rows may carry units without a matching exit date; still unlocked.
      const batchWithStrayUnits = { units_36: 1, exit_36: null }
      expect(isTestLocked('ph_36', batchWithStrayUnits, templateNoInc36)).toBe(false)
      expect(isTestLocked('vacuum_36', batchWithStrayUnits, templateNoInc36)).toBe(false)
    })

    it('unlocks 55°C tests when the template requires no 55°C incubation', () => {
      const templateNoInc55 = { requires_incubation: true, incubation_36: 5, incubation_55: 0 }
      const batch = {
        units_36: 1,
        units_55: 0,
        exit_36: dayOffset(-10)
      }
      expect(isTestLocked('ph_55', batch, templateNoInc55)).toBe(false)
      expect(isTestLocked('vacuum_55', batch, templateNoInc55)).toBe(false)

      const batchWithStrayUnits = { units_55: 1, exit_55: null }
      expect(isTestLocked('ph_55', batchWithStrayUnits, templateNoInc55)).toBe(false)
      expect(isTestLocked('vacuum_55', batchWithStrayUnits, templateNoInc55)).toBe(false)
    })

    it('derives a missing 36°C exit date from intake_date so the batch cannot lock forever', () => {
      const batchNoExit = { units_36: 0, units_55: 0, exit_36: null, exit_55: null }
      const intakePast = dayOffset(-20)

      // Incubation window elapsed since intake -> unlocked despite the missing field.
      expect(isTestLocked('ph_36', batchNoExit, templateWithInc, intakePast)).toBe(false)
      expect(isTestLocked('vacuum_36', batchNoExit, templateWithInc, intakePast)).toBe(false)
      expect(isTestLocked('ph_55', batchNoExit, templateWithInc, intakePast)).toBe(false)
      expect(isTestLocked('vacuum_55', batchNoExit, templateWithInc, intakePast)).toBe(false)

      // Still inside the incubation window -> locked.
      expect(isTestLocked('ph_36', batchNoExit, templateWithInc, dayOffset(-2))).toBe(true)
      expect(isTestLocked('vacuum_55', batchNoExit, templateWithInc, dayOffset(-2))).toBe(true)

      // No intake date to derive from -> locked, as before.
      expect(isTestLocked('ph_36', batchNoExit, templateWithInc)).toBe(true)
      expect(isTestLocked('vacuum_55', batchNoExit, templateWithInc)).toBe(true)
    })

    it('getEffectiveExitDate prefers the stored date and falls back to intake_date', () => {
      const stored = { exit_36: '2026-01-01', exit_55: '2026-01-02' }
      expect(getEffectiveExitDate(stored, templateWithInc, '2026-05-01', '36')).toBe('2026-01-01')
      expect(getEffectiveExitDate(stored, templateWithInc, '2026-05-01', '55')).toBe('2026-01-02')

      const missing = { units_36: 0, exit_36: null, exit_55: null }
      expect(getEffectiveExitDate(missing, templateWithInc, '2026-05-01', '36'))
        .toBe(addIncubationDays('2026-05-01', 10))
      expect(getEffectiveExitDate(missing, templateWithInc, '2026-05-01', '55'))
        .toBe(addIncubationDays('2026-05-01', 5))

      // Nothing to derive from.
      expect(getEffectiveExitDate(missing, templateWithInc, null, '36')).toBeNull()
      expect(getEffectiveExitDate(missing, { incubation_36: 0 }, '2026-05-01', '36')).toBeNull()
      expect(getEffectiveExitDate(missing, templateWithInc, 'not-a-date', '36')).toBeNull()
    })

    it('locks 55°C tests if exit_55 is in the future', () => {
      const batch = {
        units_55: 1,
        exit_55: dayOffset(10)
      }
      expect(isTestLocked('ph_55', batch, templateWithInc)).toBe(true)
      expect(isTestLocked('vacuum_55', batch, templateWithInc)).toBe(true)
    })

    it('unlocks 55°C tests if exit_55 is in the past or today', () => {
      const batchPast = {
        units_55: 1,
        exit_55: dayOffset(-10)
      }
      const batchToday = {
        units_55: 1,
        exit_55: today()
      }
      expect(isTestLocked('ph_55', batchPast, templateWithInc)).toBe(false)
      expect(isTestLocked('vacuum_55', batchToday, templateWithInc)).toBe(false)
    })

    it('returns false for before-incubation tests or other tests', () => {
      const batch = {
        units_36: 1,
        units_55: 1,
        exit_36: '2026-07-10',
        exit_55: '2026-07-05'
      }
      expect(isTestLocked('ph_before', batch, templateWithInc)).toBe(false)
      expect(isTestLocked('vacuum_before', batch, templateWithInc)).toBe(false)
      expect(isTestLocked('weight', batch, templateWithInc)).toBe(false)
    })
  })

  describe('new pH tests calculations', () => {
    it('calculates logarithmic pH average correctly for ph_before, ph_36, and ph_55', () => {
      const resBefore = calculateTest('ph_before', [{ value: '6.0' }, { value: '7.0' }])
      expect(resBefore.complete).toBe(true)
      expect(resBefore.average).toBeCloseTo(6.26, 2)
      expect(resBefore.label).toBe('pH of 6.26')

      const res36 = calculateTest('ph_36', [{ value: '5.0' }, { value: '6.0' }])
      expect(res36.complete).toBe(true)
      expect(res36.average).toBeCloseTo(5.26, 2)
      expect(res36.label).toBe('pH of 5.26')

      const res55 = calculateTest('ph_55', [{ value: '7.4' }])
      expect(res55.complete).toBe(true)
      expect(res55.average).toBe(7.4)
      expect(res55.label).toBe('pH of 7.4')
    })
  })

  describe('isPendingReviewBatch()', () => {
    it('returns false for a missing batch', () => {
      expect(isPendingReviewBatch(null)).toBe(false)
      expect(isPendingReviewBatch(undefined)).toBe(false)
    })

    it('returns true only when submitted and neither approved nor sent for retest', () => {
      expect(isPendingReviewBatch({ id: 'b1', submitted_at: '2026-06-19T10:00:00Z' })).toBe(true)
      expect(isPendingReviewBatch({ id: 'b2', submitted_at: '2026-06-19T10:00:00Z', approved_at: null })).toBe(true)
    })

    it('returns false when the lab has not submitted results yet', () => {
      expect(isPendingReviewBatch({ id: 'b1', submitted_at: null })).toBe(false)
      expect(isPendingReviewBatch({ id: 'b2' })).toBe(false)
    })

    it('returns false once the manager approved the batch', () => {
      expect(isPendingReviewBatch({
        id: 'b1',
        submitted_at: '2026-06-19T10:00:00Z',
        approved_at: '2026-06-19T12:00:00Z'
      })).toBe(false)
    })

    it('returns false once the manager requested a retest', () => {
      expect(isPendingReviewBatch({
        id: 'b1',
        submitted_at: '2026-06-19T10:00:00Z',
        retest_requested_at: '2026-06-19T12:00:00Z'
      })).toBe(false)
    })
  })

  describe('getPendingReviewBatches()', () => {
    const submitted = { id: 'b1', submitted_at: '2026-06-19T10:00:00Z' }
    const approved = { id: 'b2', submitted_at: '2026-06-19T10:00:00Z', approved_at: '2026-06-19T12:00:00Z' }
    const retest = { id: 'b3', submitted_at: '2026-06-19T10:00:00Z', retest_requested_at: '2026-06-19T12:00:00Z' }
    const draft = { id: 'b4', submitted_at: null }

    it('returns an empty list for non-array or empty input', () => {
      expect(getPendingReviewBatches(null)).toEqual([])
      expect(getPendingReviewBatches(undefined)).toEqual([])
      expect(getPendingReviewBatches([])).toEqual([])
    })

    it('returns only submitted, unapproved, non-retest batches', () => {
      const shipments = [{ id: 's1', supplier: 'Acme', batches: [submitted, approved, retest, draft] }]
      const pending = getPendingReviewBatches(shipments)
      expect(pending).toHaveLength(1)
      expect(pending[0].id).toBe('b1')
    })

    it('attaches the parent shipment to each returned batch', () => {
      const shipment = { id: 's1', supplier: 'Acme', template_id: 't1', batches: [submitted] }
      const pending = getPendingReviewBatches([shipment])
      expect(pending[0].shipment).toBe(shipment)
      expect(pending[0].shipment.supplier).toBe('Acme')
    })

    it('ignores shipments with no batches array', () => {
      expect(getPendingReviewBatches([{ id: 's1' }, { id: 's2', batches: null }])).toEqual([])
    })

    it('excludes batches belonging to fully approved (archived) shipments', () => {
      const archived = { id: 's1', batches: [approved] }
      expect(getPendingReviewBatches([archived])).toEqual([])
    })

    it('counts batches across shipments, which is what the dashboard metric reports', () => {
      const shipments = [
        { id: 's1', batches: [submitted, draft] },
        { id: 's2', batches: [approved, { id: 'b5', submitted_at: '2026-06-20T10:00:00Z' }] }
      ]
      expect(getPendingReviewBatches(shipments)).toHaveLength(2)
    })
  })
})
