import { parseBatchNumber } from './batchParser'
import { addIncubationDays } from './calculations'

function uuidv4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Build batch rows straight from the dynamically rendered shipment form rows,
// deriving incubation exit dates from the template + intake date.
export function buildBatchRowsFromForm(form, { isNew, shipmentId, template, intakeDate, existingBatches }) {
  return Array.from(form.querySelectorAll('.batch-form-row')).map(row => {
    const numInput = row.querySelector('[name="batch_number"]').value
    const parsed = parseBatchNumber(numInput)
    const prodDate = row.querySelector('[name="production_date"]').value || (parsed.valid ? parsed.date : null)
    const expDate = row.querySelector('[name="expiration_date"]').value || null

    // Batch-level incubation details
    const u36 = Number(row.querySelector('[name="units_36"]')?.value || 0)
    const u55 = Number(row.querySelector('[name="units_55"]')?.value || 0)
    const exit36 = u36 && template?.incubation_36 ? addIncubationDays(intakeDate, template.incubation_36) : null
    const exit55 = u55 && template?.incubation_55 ? addIncubationDays(intakeDate, template.incubation_55) : null

    const batchId = row.dataset.id
    const existingBatch = isNew ? null : (existingBatches || []).find(b => b.id === batchId)

    return {
      id: batchId || uuidv4(),
      shipment_id: shipmentId,
      number: numInput ? numInput.trim() : null,
      production_date: prodDate,
      expiration_date: expDate,
      units_36: u36,
      units_55: u55,
      exit_36: exit36,
      exit_55: exit55,
      is_manually_unlocked: existingBatch ? existingBatch.is_manually_unlocked : false,
      incubation_exited_at: existingBatch ? existingBatch.incubation_exited_at : null,
      incubation_removed_early_at: existingBatch ? existingBatch.incubation_removed_early_at : null,
      incubation_early_acknowledged_at: existingBatch ? existingBatch.incubation_early_acknowledged_at : null
    }
  })
}

// Delete bulk-removed batches, then upsert the active batch rows. Guards the
// degenerate case where every batch row was removed (an empty `in ()` clause
// would generate invalid SQL).
export async function persistShipmentBatches(supabase, shipmentId, isNew, batchRows) {
  if (!isNew) {
    const activeIds = batchRows.map(r => r.id).filter(Boolean)
    if (activeIds.length > 0) {
      await supabase
        .from('batches')
        .delete()
        .eq('shipment_id', shipmentId)
        .not('id', 'in', `(${activeIds.join(',')})`)
    } else {
      await supabase
        .from('batches')
        .delete()
        .eq('shipment_id', shipmentId)
    }
  }

  const { error: batchesError } = await supabase
    .from('batches')
    .upsert(batchRows)
  if (batchesError) throw batchesError
}