// Helpers for the paged COA archive and the on-demand test-result loading.
//
// These used to live inline in ManagerView/TechnicianView, where the browser
// held every shipment, batch and test result in memory. The database now does
// the filtering and paging (search_coa_archive / get_active_shipments), so the
// shapes below are the seam between what those functions return and what the
// screens already render.

/**
 * Build the `batch_id:test_id -> replicates` map the screens read from.
 * Rows are the raw test_results records for the batches currently in view.
 */
export function mergeResults(existing, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return existing || {}
  const next = { ...(existing || {}) }
  rows.forEach(row => {
    if (!row || row.batch_id == null || !row.test_id) return
    next[`${row.batch_id}:${row.test_id}`] = row.replicates
  })
  return next
}

/**
 * Every batch id inside a list of shipments. Used to load exactly the results the
 * active shipments need, and nothing else.
 */
export function collectBatchIds(shipments) {
  if (!Array.isArray(shipments)) return []
  const ids = []
  shipments.forEach(s => {
    ;(s?.batches || []).forEach(b => {
      if (b?.id) ids.push(b.id)
    })
  })
  return [...new Set(ids)]
}

/**
 * Group the flat archive rows returned by search_coa_archive back into the
 * shipment-with-batches shape the archive tabs render, preserving the server's
 * newest-first ordering.
 */
export function groupArchiveRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return []
  const order = []
  const byShipment = new Map()

  rows.forEach(row => {
    const shipment = row?.shipment
    if (!shipment || !row?.id) return
    if (!byShipment.has(shipment.id)) {
      byShipment.set(shipment.id, { ...shipment, matchingBatches: [] })
      order.push(shipment.id)
    }
    // The nested shipment is kept on the batch: the COA header reads
    // batch.shipment.supplier directly.
    byShipment.get(shipment.id).matchingBatches.push({ ...row, shipment })
  })

  return order.map(id => byShipment.get(id))
}

/**
 * Page metadata for the archive controls. `total` is the number of matching COAs
 * reported by the database, not the number of rows on this page.
 */
export function pageWindow(page, pageSize, total) {
  const size = Math.max(1, pageSize || 20)
  const count = Math.max(0, total || 0)
  const totalPages = Math.max(1, Math.ceil(count / size))
  const current = Math.min(Math.max(1, page || 1), totalPages)
  const from = count === 0 ? 0 : (current - 1) * size + 1
  const to = Math.min(count, current * size)
  return {
    page: current,
    pageSize: size,
    total: count,
    totalPages,
    from,
    to,
    hasPrev: current > 1,
    hasNext: current < totalPages,
  }
}

/**
 * Locate a batch across the active shipments and the loaded archive page, so the
 * COA print and PDF paths can still resolve a batch that lives outside the
 * active set.
 */
export function findBatch(shipmentLists, batchId) {
  if (!batchId) return null
  for (const shipments of shipmentLists || []) {
    for (const s of shipments || []) {
      for (const b of s?.batches || []) {
        if (b?.id === batchId) return { batch: b, shipment: s }
      }
      for (const b of s?.matchingBatches || []) {
        if (b?.id === batchId) return { batch: b, shipment: s }
      }
    }
  }
  return null
}