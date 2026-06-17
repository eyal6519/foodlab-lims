import { describe, it, expect } from 'vitest'
import { calculateTest, TESTS } from './calculations'

describe('LIMS Math & Calculation Engine Tests', () => {
  
  // 1. Weight Test
  it('correctly calculates Net Weight from direct net or gross/tare', () => {
    const testId = 'weight'
    const rows = [
      { gross: 120, tare: 20 }, // net = 100
      { net: 100 }             // net = 100 directly
    ]
    const res = calculateTest(testId, rows)
    expect(res.average).toBe(100) // Avg net weight
    expect(res.complete).toBe(true)
  })

  // 1b. Volume Test (Calculated Test)
  it('correctly derives Volume from Weight and Specific Gravity averages', () => {
    const testId = 'volume'
    const batchResults = {
      weight: [
        { gross: 120, tare: 20 }, // net = 100
        { net: 100 }             // net = 100
      ],
      specific_gravity: [
        { value: 1.2 }
      ]
    }
    const res = calculateTest(testId, [], batchResults)
    expect(res.average).toBeCloseTo(83.33, 2) // 100 / 1.2
    expect(res.complete).toBe(true)
  })

  // 2. Vacuum Test (inHg to mmHg)
  it('correctly converts inHg to mmHg and averages results', () => {
    const testId = 'vacuum'
    const rows = [
      { hg: 10 }, // 10 * 25.4 = 254 mmHg
      { hg: 20 }  // 20 * 25.4 = 508 mmHg
    ]
    const res = calculateTest(testId, rows)
    expect(res.average).toBe(381) // Avg of 254 and 508
    expect(res.complete).toBe(true)
  })

  // 3. pH range constraints
  it('enforces pH values strictly between 0 and 14', () => {
    const testId = 'ph'
    const validRows = [{ value: 7.2 }]
    const invalidRows = [{ value: 15.5 }] // Outside 0-14, should return NaN

    const validRes = calculateTest(testId, validRows)
    const invalidRes = calculateTest(testId, invalidRows)

    expect(validRes.average).toBe(7.2)
    expect(Number.isNaN(invalidRes.average)).toBe(true)
  })

  // 4. Acidity formula and constants
  it('correctly calculates acidity using Citric Acid constant (0.64)', () => {
    const testId = 'acidity'
    const rows = [
      { volume: 5.0, mass: 10.0, acid: '0.64' } // (5 * 0.64) / 10 = 0.32
    ]
    const res = calculateTest(testId, rows)
    expect(res.average).toBe(0.32)
    expect(res.complete).toBe(true)
  })

  // 5. Peroxides in Oil
  it('correctly calculates peroxides with a factor of 10', () => {
    const testId = 'peroxides'
    const rows = [
      { volume: 2.5, mass: 5.0 } // (2.5 * 10) / 5 = 5.0
    ]
    const res = calculateTest(testId, rows)
    expect(res.average).toBe(5.0)
  })

  // 6. Aqueous Layer with checkbox sum
  it('calculates aqueous layer dividing volume by the sum of SELECTED samples only', () => {
    const testId = 'aqueous_layer'
    const rows = [
      { volume: 10, sample: 5, selected: true },  // Selected
      { volume: 10, sample: 15, selected: false }, // Not selected
      { volume: 10, sample: 5, selected: true }   // Selected
    ]
    // Denominator = 5 + 5 = 10
    // Volume = 10 (first valid volume)
    // Value = (10 / 10) * 100 = 100
    const res = calculateTest(testId, rows)
    expect(res.average).toBe(100)
    expect(res.complete).toBe(true)
  })

  // 7. Paprika Color ASTA (requires 2 replicates)
  it('calculates paprika color ASTA and honors min replicates count', () => {
    const testId = 'paprika_asta'
    const singleRow = [
      { mass: 100, absorption: 0.5 } // 0.5 * 1640 / 100 = 8.2
    ]
    const doubleRow = [
      { mass: 100, absorption: 0.5 }, // 8.2
      { mass: 100, absorption: 0.5 }  // 8.2
    ]

    const singleRes = calculateTest(testId, singleRow)
    const doubleRes = calculateTest(testId, doubleRow)

    expect(singleRes.average).toBe(8.2)
    expect(singleRes.complete).toBe(false) // Needs 2 replicates

    expect(doubleRes.average).toBe(8.2)
    expect(doubleRes.complete).toBe(true) // Has 2 replicates
  })

  // 8. Tuna Chunk (requires at least 5 replicates)
  it('enforces a minimum of 5 replicates for Chunk Percentage in Tuna', () => {
    const testId = 'tuna_chunk'
    const fourRows = [
      { chunk: 40, total: 100 },
      { chunk: 40, total: 100 },
      { chunk: 40, total: 100 },
      { chunk: 40, total: 100 }
    ]
    const fiveRows = [...fourRows, { chunk: 40, total: 100 }]

    const fourRes = calculateTest(testId, fourRows)
    const fiveRes = calculateTest(testId, fiveRows)

    expect(fourRes.average).toBe(40)
    expect(fourRes.complete).toBe(false) // Awaiting min 5

    expect(fiveRes.average).toBe(40)
    expect(fiveRes.complete).toBe(true) // Has min 5
  })
})
