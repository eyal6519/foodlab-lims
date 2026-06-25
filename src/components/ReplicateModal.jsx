import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, AlertTriangle, Check } from 'lucide-react'
import { num } from '../utils/calculations'
import { useLanguage } from '../context/LanguageContext'

function formatLabelWithUnit(label) {
  if (typeof label !== 'string') return label
  const match = label.match(/(.*?)(\(.*?\))(.*)/)
  if (match) {
    return (
      <>
        {match[1]}
        <span className="normal-case">{match[2]}</span>
        {match[3]}
      </>
    )
  }
  return label
}

export default function ReplicateModal({ test, initialRows, onSave, onClose, batchNumber }) {
  const { t } = useLanguage()
  const [rows, setRows] = useState([{}])
  const [warnings, setWarnings] = useState([])

  useEffect(() => {
    if (initialRows && initialRows.length > 0) {
      setRows(initialRows)
    } else {
      setRows([createEmptyRow()])
    }
  }, [initialRows, test])

  function createEmptyRow() {
    const row = {}
    test.fields.forEach(f => {
      row[f.id] = f.type === 'checkbox' ? false : f.type === 'select' ? f.options[0][0] : ''
    })
    return row
  }

  const handleAddFieldVal = (index, fieldId, value) => {
    const newRows = [...rows]
    const updatedRow = {
      ...newRows[index],
      [fieldId]: value
    }

    // Auto-calculate Net Weight if modifying Gross/Tare and both are present
    if (test.id === 'weight') {
      if (fieldId === 'gross' || fieldId === 'tare') {
        const grossNum = num(updatedRow.gross)
        const tareNum = num(updatedRow.tare)
        if (Number.isFinite(grossNum) && Number.isFinite(tareNum)) {
          updatedRow.net = String(grossNum - tareNum)
        }
      }
    }

    newRows[index] = updatedRow
    setRows(newRows)
    validateRowData(newRows)
  }

  const addReplicate = () => {
    if (test.single && rows.length >= 1) return
    if (test.max && rows.length >= test.max) return
    setRows([...rows, createEmptyRow()])
  }

  const removeReplicate = (index) => {
    if (rows.length <= 1) return
    const newRows = rows.filter((_, i) => i !== index)
    setRows(newRows)
    validateRowData(newRows)
  }

  const validateRowData = (currentRows) => {
    const list = []
    currentRows.forEach((row, i) => {
      const repNum = i + 1

      // pH physical validations
      if (test.id === 'ph' && row.value !== '') {
        const v = num(row.value)
        if (v < 0 || v > 14 || Number.isNaN(v)) {
          list.push(t('rep.validation.ph_range').replace('{n}', repNum))
        }
      }

      // Negative checks for physical values
      test.fields.forEach(f => {
        if (f.type === 'number' && row[f.id] !== '') {
          const v = num(row[f.id])
          if (v < 0) {
            list.push(t('rep.validation.no_negative').replace('{n}', repNum).replace('{label}', f.label))
          }
        }
      })
    })

    // Replicate count validations
    if (test.min && currentRows.length < test.min) {
      list.push(t('rep.validation.min_reps').replace('{n}', test.min).replace('{c}', currentRows.length))
    }
    if (test.max && currentRows.length > test.max) {
      list.push(t('rep.validation.max_reps').replace('{n}', test.max).replace('{c}', currentRows.length))
    }

    setWarnings(list)
  }

  const handleSave = () => {
    // Perform final validation check before allowing save
    validateRowData(rows)

    // Check if there are blocking physical errors (like pH out of range)
    const hasBlockingError = warnings.some(w => w.includes('must be') || w.includes('cannot be') || w.includes('חייב') || w.includes('לא יכול'))
    if (hasBlockingError) {
      alert(t('rep.alert.fix_errors'))
      return
    }

    onSave(rows)
  }

  const isAddDisabled = test.single || (test.max && rows.length >= test.max)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-bottom border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div>
            <h2 className="text-lg font-bold text-white">{test.name}</h2>
            <p className="text-xs text-slate-400 mt-1">
              {t('rep.modal.batch_label')} <span className="font-semibold text-teal-400">{batchNumber}</span> {t('rep.modal.blind_entry')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Validation Box */}
          {warnings.length > 0 && (
            <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4" />
                <span>{t('rep.modal.warnings_title')}</span>
              </div>
              <ul className="list-disc list-inside text-xs text-amber-200 space-y-1 pl-1">
                {warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Replicates List */}
          <div className="space-y-4">
            {rows.map((row, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-2xl flex items-end gap-4 relative group hover:border-slate-800 transition-all duration-200"
              >
                <div className="absolute top-2 left-3 text-[10px] text-slate-600 font-bold">
                  {t('rep.replicate.label').replace('{n}', idx + 1)}
                </div>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  {test.fields.map(field => {
                    const value = row[field.id] ?? ''

                    if (field.type === 'select') {
                      return (
                        <div key={field.id} className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {formatLabelWithUnit(field.label)}
                          </label>
                          <select
                            value={value}
                            onChange={(e) => handleAddFieldVal(idx, field.id, e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 transition-all duration-200"
                          >
                            {field.options.map(([optVal, optLabel]) => (
                              <option key={optVal} value={optVal}>
                                {optLabel}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    }

                    if (field.type === 'passfail') {
                      return (
                        <div key={field.id} className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {formatLabelWithUnit(field.label)}
                          </label>
                          <select
                            value={value}
                            onChange={(e) => handleAddFieldVal(idx, field.id, e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 transition-all duration-200"
                          >
                            <option value="">{t('rep.select.default')}</option>
                            <option value="Pass">{t('rep.select.pass')}</option>
                            <option value="Fail">{t('rep.select.fail')}</option>
                          </select>
                        </div>
                      )
                    }

                    if (field.type === 'checkbox') {
                      return (
                        <div key={field.id} className="flex items-center h-10 pt-4">
                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!value}
                              onChange={(e) => handleAddFieldVal(idx, field.id, e.target.checked)}
                              className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-teal-600 focus:ring-teal-500/50"
                            />
                            <span>{field.label}</span>
                          </label>
                        </div>
                      )
                    }

                    return (
                      <div key={field.id} className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {formatLabelWithUnit(field.label)}
                        </label>
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          step="any"
                          value={value}
                          onChange={(e) => handleAddFieldVal(idx, field.id, e.target.value)}
                          placeholder={t('rep.input.placeholder')}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 transition-all duration-200"
                        />
                      </div>
                    )
                  })}
                </div>

                {rows.length > 1 && (
                  <button
                    onClick={() => removeReplicate(idx)}
                    className="p-2 bg-slate-800/40 hover:bg-red-950/40 border border-slate-800 hover:border-red-500/30 text-slate-400 hover:text-red-400 rounded-xl transition-all duration-200"
                    aria-label={t('rep.replicate.remove')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Replicate Constraints Hint */}
          <div className="text-[11px] text-slate-500 font-medium">
            {test.single && t('rep.hint.single')}
            {test.min && t('rep.hint.min').replace('{n}', test.min)}
            {test.max && t('rep.hint.max').replace('{n}', test.max)}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-850 flex justify-between items-center bg-slate-900/30">
          {!isAddDisabled ? (
            <button
              onClick={addReplicate}
              className="flex items-center gap-1.5 px-4 py-2 border border-slate-800 hover:border-slate-700 bg-slate-950 hover:bg-slate-900 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              <span>{t('rep.btn.add_replicate')}</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition-all"
            >
              {t('rep.btn.cancel')}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-6 py-2 bg-teal-500 hover:bg-teal-400 active:scale-[0.98] text-xs font-bold text-slate-950 rounded-xl transition-all duration-200"
            >
              <Check className="w-4 h-4" />
              <span>{t('rep.btn.save')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
