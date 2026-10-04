import { describe, it, expect } from 'vitest'
import { persistShipmentBatches } from './shipmentPersistence'

function createMockSupabase() {
  const calls = { deleteFilter: [], upserts: [] }
  const supabase = {
    from: () => {
      const makeDelete = () => {
        let eqPos
        const chain = {
          eq: (col, val) => {
            eqPos = { col, val }
            return chain
          },
          not: (col, op, expr) => {
            eqPos.not = { col, op, expr }
            return chain
          },
          then: undefined,
        }
        chain.then = (resolve) => {
          calls.deleteFilter.push(eqPos)
          resolve({ error: null })
        }
        chain['delete'] = makeDelete
        return chain
      }
      return {
        delete: makeDelete,
        upsert: (rows) => {
          calls.upserts.push(rows)
          return { then: (resolve) => resolve({ error: null }) }
        },
      }
    },
  }
  return { supabase, calls }
}

describe('persistShipmentBatches', () => {
  it('deletes all shipment rows (no id exclusion) when every batch row was removed', async () => {
    const { supabase, calls } = createMockSupabase()
    await persistShipmentBatches(supabase, 'ship-1', false, [])
    const del = calls.deleteFilter[0]
    expect(del).toEqual({ col: 'shipment_id', val: 'ship-1', not: undefined })
    expect(calls.upserts).toEqual([[]])
  })

  it('excludes surviving ids from the delete when rows remain', async () => {
    const { supabase, calls } = createMockSupabase()
    const rows = [{ id: 'b1' }, { id: 'b2' }]
    await persistShipmentBatches(supabase, 'ship-2', false, rows)
    const del = calls.deleteFilter[0]
    expect(del).toEqual({ col: 'shipment_id', val: 'ship-2', not: { col: 'id', op: 'in', expr: '(b1,b2)' } })
    expect(calls.upserts).toEqual([rows])
  })

  it('skips the delete entirely for brand-new shipments', async () => {
    const { supabase, calls } = createMockSupabase()
    const rows = [{ id: 'b1' }]
    await persistShipmentBatches(supabase, 'ship-3', true, rows)
    expect(calls.deleteFilter).toEqual([])
    expect(calls.upserts).toEqual([rows])
  })

  it('rethrows upsert failures', async () => {
    const supabase = {
      from: () => ({
        delete: () => ({ eq: () => ({ then: (resolve) => resolve({ error: null }) }) }),
        upsert: () => ({ then: (resolve) => resolve({ error: new Error('boom') }) }),
      }),
    }
    await expect(persistShipmentBatches(supabase, 'ship-4', true, [])).rejects.toThrow('boom')
  })
})