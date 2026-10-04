import { describe, it, expect } from 'vitest'
import { mergeResults, collectBatchIds, groupArchiveRows, pageWindow, findBatch } from './archiveQuery'

describe('mergeResults()', () => {
  it('keys replicates by batch and test', () => {
    const map = mergeResults({}, [
      { batch_id: 'b1', test_id: 'ph', replicates: [{ value: '6.2' }] },
      { batch_id: 'b1', test_id: 'weight', replicates: [{ net: '145.000' }] },
    ])
    expect(Object.keys(map).sort()).toEqual(['b1:ph', 'b1:weight'])
    expect(map['b1:ph']).toEqual([{ value: '6.2' }])
  })

  it('returns the existing map untouched when there is nothing to merge', () => {
    const existing = { 'b1:ph': [{ value: '6.2' }] }
    expect(mergeResults(existing, [])).toBe(existing)
    expect(mergeResults(existing, null)).toBe(existing)
  })

  it('overwrites a single test without disturbing the rest of the batch', () => {
    const first = mergeResults({}, [{ batch_id: 'b1', test_id: 'ph', replicates: [{ value: '6.1' }] }])
    const second = mergeResults(first, [{ batch_id: 'b1', test_id: 'ph', replicates: [{ value: '6.2' }] }])
    expect(second['b1:ph']).toEqual([{ value: '6.2' }])
    expect(Object.keys(second)).toHaveLength(1)
  })

  it('skips malformed rows instead of writing junk keys', () => {
    const map = mergeResults({}, [null, { test_id: 'ph', replicates: [] }, { batch_id: 'b1' }])
    expect(map).toEqual({})
  })
})

describe('collectBatchIds()', () => {
  it('flattens and de-duplicates batch ids', () => {
    const ids = collectBatchIds([
      { batches: [{ id: 'b1' }, { id: 'b2' }] },
      { batches: [{ id: 'b2' }, { id: 'b3' }] },
    ])
    expect(ids).toEqual(['b1', 'b2', 'b3'])
  })

  it('tolerates shipments without batches', () => {
    expect(collectBatchIds([{ id: 's1' }, { batches: null }, null])).toEqual([])
    expect(collectBatchIds(null)).toEqual([])
  })
})

describe('groupArchiveRows()', () => {
  const rows = [
    { id: 'b3', approved_at: '2026-10-02T00:00:00Z', shipment: { id: 's2', supplier: 'Acme' } },
    { id: 'b2', approved_at: '2026-10-01T00:00:00Z', shipment: { id: 's1', supplier: 'Globex' } },
    { id: 'b1', approved_at: '2026-09-30T00:00:00Z', shipment: { id: 's1', supplier: 'Globex' } },
  ]

  it('regroups flat rows into shipments with matchingBatches', () => {
    const grouped = groupArchiveRows(rows)
    expect(grouped.map(g => g.id)).toEqual(['s2', 's1'])
    expect(grouped[1].matchingBatches.map(b => b.id)).toEqual(['b2', 'b1'])
  })

  it('keeps each batch pointing back at its shipment for the COA header', () => {
    const grouped = groupArchiveRows(rows)
    expect(grouped[1].matchingBatches[0].shipment.id).toBe('s1')
  })

  it('returns an empty list when the page came back empty', () => {
    expect(groupArchiveRows([])).toEqual([])
    expect(groupArchiveRows(null)).toEqual([])
  })

  it('drops rows with no shipment instead of rendering a broken COA', () => {
    expect(groupArchiveRows([{ id: 'b9' }])).toEqual([])
  })
})

describe('pageWindow()', () => {
  it('describes the first page', () => {
    expect(pageWindow(1, 20, 45)).toEqual({
      page: 1, pageSize: 20, total: 45, totalPages: 3, from: 1, to: 20,
      hasPrev: false, hasNext: true,
    })
  })

  it('describes a middle page', () => {
    expect(pageWindow(2, 20, 45)).toMatchObject({ from: 21, to: 40, hasPrev: true, hasNext: true })
  })

  it('describes the last, partial page', () => {
    expect(pageWindow(3, 20, 45)).toMatchObject({ from: 41, to: 45, hasPrev: true, hasNext: false })
  })

  it('handles an empty result set', () => {
    expect(pageWindow(1, 20, 0)).toMatchObject({ from: 0, to: 0, totalPages: 1, hasNext: false, hasPrev: false })
  })

  it('clamps a page number past the end instead of rendering nothing', () => {
    expect(pageWindow(9, 20, 25)).toMatchObject({ page: 2, from: 21, to: 25 })
  })
})

describe('findBatch()', () => {
  const active = [{ id: 's1', batches: [{ id: 'b1' }] }]
  const archive = [{ id: 's2', matchingBatches: [{ id: 'b9' }] }]

  it('finds a batch in the active shipments', () => {
    expect(findBatch([active], 'b1')).toEqual({ batch: { id: 'b1' }, shipment: active[0] })
  })

  it('finds a batch on the loaded archive page', () => {
    expect(findBatch([active, archive], 'b9')).toEqual({ batch: { id: 'b9' }, shipment: archive[0] })
  })

  it('returns null for a batch that is nowhere on screen', () => {
    expect(findBatch([active, archive], 'b404')).toBeNull()
    expect(findBatch([], 'b1')).toBeNull()
    expect(findBatch([active], null)).toBeNull()
  })
})