import React, { useState, useEffect } from 'react'
import { Plus, Trash2, XCircle } from 'lucide-react'
import { parseBatchNumber } from '../utils/batchParser'

export default function ShipmentModal({ templates, initialShipment, onSave, onClose }) {
  const [batches, setBatches] = useState([{ number: '', production_date: '', expiration_date: '' }])
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialShipment?.template_id || '')

  useEffect(() => {
    if (initialShipment) {
      if (initialShipment.batches) {
        setBatches(initialShipment.batches)
      }
      setSelectedTemplateId(initialShipment.template_id || '')
    } else {
      setSelectedTemplateId('')
      setBatches([{ number: '', production_date: '', expiration_date: '' }])
    }
  }, [initialShipment])

  const addBatchRow = () => {
    setBatches([...batches, { number: '', production_date: '', expiration_date: '' }])
  }

  const removeBatchRow = (idx) => {
    if (batches.length <= 1) return
    setBatches(batches.filter((_, i) => i !== idx))
  }

  const handleBatchValChange = (idx, field, value) => {
    const updated = [...batches]
    updated[idx] = {
      ...updated[idx],
      [field]: value
    }

    // Auto production date calculation if editing batch number
    if (field === 'number') {
      const parsed = parseBatchNumber(value)
      if (parsed.valid) {
        updated[idx].production_date = parsed.date
      }
    }

    setBatches(updated)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <form
        onSubmit={onSave}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 className="text-lg font-bold text-white">{initialShipment ? 'Edit Shipment' : 'Log New Shipment'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product</label>
              <select
                name="template_id"
                required
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              >
                <option value="">-- Select Product --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Supplier</label>
              <input
                type="text"
                name="supplier"
                required
                defaultValue={initialShipment?.supplier || ''}
                placeholder="Supplier Name"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Intake Date</label>
              <input
                type="date"
                name="intake_date"
                required
                defaultValue={initialShipment?.intake_date || new Date().toISOString().slice(0, 10)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Packaging Size / Unit</label>
              <input
                type="text"
                name="size"
                defaultValue={initialShipment?.size || ''}
                placeholder="e.g. 140 g, 960 g, 1 L"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
          </div>

          {(() => {
            const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
            const requiresInc = selectedTemplate ? (selectedTemplate.requires_incubation !== false) : true
            const hasInc36 = requiresInc && selectedTemplate && (selectedTemplate.incubation_36 || 0) > 0
            const hasInc55 = requiresInc && selectedTemplate && (selectedTemplate.incubation_55 || 0) > 0

            if (!hasInc36 && !hasInc55) {
              return (
                <>
                  <input type="hidden" name="units_36" value="0" />
                  <input type="hidden" name="units_55" value="0" />
                </>
              )
            }

            return (
              <div className="border-t border-slate-800 pt-6 space-y-4">
                <h3 className="text-xs font-bold text-slate-350 uppercase tracking-widest">Incubation Units Count</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {hasInc36 ? (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Units incubated at 36°C</label>
                      <input
                        type="number"
                        name="units_36"
                        min="0"
                        defaultValue={initialShipment?.units_36 || 0}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                      />
                    </div>
                  ) : (
                    <input type="hidden" name="units_36" value="0" />
                  )}
                  {hasInc55 ? (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Units incubated at 55°C</label>
                      <input
                        type="number"
                        name="units_55"
                        min="0"
                        defaultValue={initialShipment?.units_55 || 0}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
                      />
                    </div>
                  ) : (
                    <input type="hidden" name="units_55" value="0" />
                  )}
                </div>
              </div>
            )
          })()}

          <div className="border-t border-slate-800 pt-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-350 uppercase tracking-widest">Batches</h3>
              <button
                type="button"
                onClick={addBatchRow}
                className="flex items-center gap-1 px-3 py-1 bg-slate-950 border border-slate-800 hover:border-slate-700 text-[10px] font-bold text-slate-300 hover:text-white rounded-lg transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Batch</span>
              </button>
            </div>

            <div className="space-y-3">
              {batches.map((batch, idx) => {
                return (
                  <div
                    key={idx}
                    data-id={batch.id || ''}
                    className="batch-form-row p-4 bg-slate-950/40 border border-slate-800 rounded-2xl flex items-end gap-4 relative pt-6"
                  >
                    <div className="absolute top-2 left-3 text-[9px] text-slate-600 font-bold uppercase">
                      Batch #{idx + 1}
                    </div>

                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Batch Number (YY-JJJ)</label>
                        <input
                          type="text"
                          name="batch_number"
                          value={batch.number || ''}
                          onChange={(e) => handleBatchValChange(idx, 'number', e.target.value)}
                          placeholder="e.g. 26-168"
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Production Date</label>
                        <input
                          type="date"
                          name="production_date"
                          value={batch.production_date || ''}
                          onChange={(e) => handleBatchValChange(idx, 'production_date', e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Expiration Date</label>
                        <input
                          type="date"
                          name="expiration_date"
                          value={batch.expiration_date || ''}
                          onChange={(e) => handleBatchValChange(idx, 'expiration_date', e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    {batches.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBatchRow(idx)}
                        className="p-2 bg-slate-800 border border-slate-850 hover:border-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-850 flex justify-end gap-3 bg-slate-900/30">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-teal-500 hover:bg-teal-400 text-slate-955 text-xs font-bold rounded-xl transition-all"
          >
            Save Log
          </button>
        </div>
      </form>
    </div>
  )
}
