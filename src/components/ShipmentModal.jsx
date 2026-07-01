import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, XCircle } from 'lucide-react'
import { parseBatchNumber } from '../utils/batchParser'
import { useLanguage } from '../context/LanguageContext'

export default function ShipmentModal({ templates, initialShipment, onSave, onClose, isSaving }) {
  const { t } = useLanguage()
  const [batches, setBatches] = useState([{ rowId: 'row-0', number: '', production_date: '', expiration_date: '', units_36: 0, units_55: 0 }])
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialShipment?.template_id || '')
  const [latestAddedRowId, setLatestAddedRowId] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (initialShipment) {
      if (initialShipment.batches) {
        setBatches(initialShipment.batches.map((b, idx) => ({
          ...b,
          rowId: b.id || `row-${idx}`,
          units_36: b.units_36 || 0,
          units_55: b.units_55 || 0
        })))
      }
      setSelectedTemplateId(initialShipment.template_id || '')
    } else {
      setSelectedTemplateId('')
      setBatches([{ rowId: 'row-0', number: '', production_date: '', expiration_date: '', units_36: 0, units_55: 0 }])
    }
  }, [initialShipment])

  useEffect(() => {
    if (latestAddedRowId && scrollRef.current) {
      // Small timeout to ensure DOM has rendered the new row
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth'
          })
        }
      }, 50)
    }
  }, [batches.length, latestAddedRowId])

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
  const requiresInc = selectedTemplate ? (selectedTemplate.requires_incubation !== false) : true
  const hasInc36 = requiresInc && selectedTemplate && (selectedTemplate.incubation_36 || 0) > 0
  const hasInc55 = requiresInc && selectedTemplate && (selectedTemplate.incubation_55 || 0) > 0

  const addBatchRow = () => {
    const newRowId = `row-${Date.now()}`
    setBatches([...batches, { rowId: newRowId, number: '', production_date: '', expiration_date: '', units_36: 0, units_55: 0 }])
    setLatestAddedRowId(newRowId)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm">
      <form
        onSubmit={onSave}
        className="bg-slate-900 border-0 sm:border border-slate-800 rounded-none sm:rounded-3xl w-full max-w-2xl h-full sm:h-auto sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 className="text-lg font-bold text-white">
            {initialShipment ? t('shipment.title.edit') : t('shipment.title.new')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('shipment.field.product')}</label>
              <select
                name="template_id"
                required
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              >
                <option value="">{t('shipment.field.product_placeholder')}</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('shipment.field.supplier')}</label>
              <input
                type="text"
                name="supplier"
                required
                defaultValue={initialShipment?.supplier || ''}
                placeholder={t('shipment.field.supplier_placeholder')}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('shipment.field.intake_date')}</label>
              <input
                type="date"
                name="intake_date"
                required
                defaultValue={initialShipment?.intake_date || new Date().toISOString().slice(0, 10)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('shipment.field.packaging')}</label>
              <input
                type="text"
                name="size"
                defaultValue={initialShipment?.size || ''}
                placeholder={t('shipment.field.packaging_placeholder')}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
          </div>

          <div className="border-t border-slate-800 pt-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-350 uppercase tracking-widest">{t('shipment.batches.heading')}</h3>
              <button
                type="button"
                disabled={isSaving}
                onClick={addBatchRow}
                className={`flex items-center gap-1 px-3 py-1 bg-slate-950 border border-slate-800 hover:border-slate-700 text-[10px] font-bold text-slate-300 hover:text-white rounded-lg transition-all ${
                  isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('shipment.batches.add')}</span>
              </button>
            </div>

            <div className="space-y-3">
              {batches.map((batch, idx) => {
                const isNewRow = batch.rowId === latestAddedRowId
                return (
                  <div
                    key={batch.rowId || idx}
                    data-id={batch.id || ''}
                    className={`batch-form-row px-0 py-4 sm:p-4 bg-transparent sm:bg-slate-950/40 border-0 sm:border border-slate-800 rounded-none sm:rounded-2xl flex flex-col sm:flex-row gap-4 relative pt-8 sm:pt-6 transition-all ${
                      isNewRow ? 'animate-flash-green' : ''
                    }`}
                  >
                    <div className="absolute top-2 left-3 text-[9px] text-slate-650 font-bold uppercase">
                      {t('shipment.batch.label').replace('{n}', idx + 1)}
                    </div>

                    {batches.length > 1 && (
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => removeBatchRow(idx)}
                        className={`absolute top-2 right-2 p-1.5 bg-slate-800/40 hover:bg-red-950/40 border border-slate-800 hover:border-red-500/30 text-slate-400 hover:text-red-400 rounded-lg transition-all ${
                          isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <div className="flex-1 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('shipment.field.batch_number')}</label>
                          <input
                            type="text"
                            name="batch_number"
                            value={batch.number || ''}
                            onChange={(e) => handleBatchValChange(idx, 'number', e.target.value)}
                            placeholder={t('shipment.field.batch_number_placeholder')}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('shipment.field.prod_date')}</label>
                          <input
                            type="date"
                            name="production_date"
                            value={batch.production_date || ''}
                            onChange={(e) => handleBatchValChange(idx, 'production_date', e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('shipment.field.exp_date')}</label>
                          <input
                            type="date"
                            name="expiration_date"
                            value={batch.expiration_date || ''}
                            onChange={(e) => handleBatchValChange(idx, 'expiration_date', e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none"
                          />
                        </div>
                      </div>

                      {(hasInc36 || hasInc55) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-900/60 pt-3">
                          {hasInc36 ? (
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-450 uppercase tracking-wider">{t('shipment.field.incubation_36')}</label>
                              <input
                                type="number"
                                name="units_36"
                                min="0"
                                value={batch.units_36 || 0}
                                onChange={(e) => handleBatchValChange(idx, 'units_36', Number(e.target.value))}
                                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none"
                              />
                            </div>
                          ) : (
                            <input type="hidden" name="units_36" value="0" />
                          )}
                          {hasInc55 ? (
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-455 uppercase tracking-wider">{t('shipment.field.incubation_55')}</label>
                              <input
                                type="number"
                                name="units_55"
                                min="0"
                                value={batch.units_55 || 0}
                                onChange={(e) => handleBatchValChange(idx, 'units_55', Number(e.target.value))}
                                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none"
                              />
                            </div>
                          ) : (
                            <input type="hidden" name="units_55" value="0" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-850 flex justify-end gap-3 bg-slate-900/95 backdrop-blur-md sticky bottom-0 z-10">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className={`px-5 py-2 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition-all ${
              isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            {t('shipment.btn.cancel')}
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className={`px-6 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            {isSaving ? (
              <>
                <span className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                <span>{t('mgr.settings.saving') || 'Saving...'}</span>
              </>
            ) : (
              t('shipment.btn.save')
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
