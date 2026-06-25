import React, { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Trash2, AlertTriangle, Check, Info } from 'lucide-react'
import { TESTS, testMap, calculateTest, num } from '../utils/calculations'
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

export default function BatchTestingPage({ batch, shipment, templates, initialResults, onSave, onClose }) {
  const { t } = useLanguage()
  const [testData, setTestData] = useState({})
  const [warnings, setWarnings] = useState({})
  const [isDirty, setIsDirty] = useState(false)
  const [batchTare, setBatchTare] = useState('')
  const [subtractTare, setSubtractTare] = useState(true)

  const template = templates.find(t => t.id === shipment.template_id)
  const enabledTests = template
    ? template.tests.filter(tid => {
        const t = TESTS.find(x => x.id === tid)
        return t && !t.isCalculated
      })
    : []

  // Initialize replicates state
  useEffect(() => {
    const initialData = {}
    const initialWarnings = {}

    enabledTests.forEach(testId => {
      const test = TESTS.find(t => t.id === testId)
      if (!test) return

      const existing = initialResults[`${batch.id}:${testId}`]
      if (existing && existing.length > 0) {
        initialData[testId] = existing
      } else {
        initialData[testId] = [createEmptyRow(test)]
      }
      initialWarnings[testId] = validateTestRows(test, initialData[testId])
    })

    setTestData(initialData)
    setWarnings(initialWarnings)
    setIsDirty(false)

    // Derive batchTare
    const weightReps = initialResults[`${batch.id}:weight`] || []
    if (weightReps.length > 0) {
      const firstWithTare = weightReps.find(r => r.tare)
      if (firstWithTare) {
        setBatchTare(firstWithTare.tare)
      } else {
        setBatchTare('')
      }
      
      // Look at the first replicate with gross/net/tare to see if net = gross - tare or gross = net + tare.
      // Actually, since both are mathematically equal, we can default to subtractTare = true.
      // But if there's gross and tare and net, they match. Let's keep it as true by default.
      setSubtractTare(true)
    } else {
      setBatchTare('')
      setSubtractTare(true)
    }
  }, [batch.id, templates, initialResults])

  function createEmptyRow(test) {
    const row = {}
    test.fields.forEach(f => {
      row[f.id] = f.type === 'checkbox' ? false : f.type === 'select' ? f.options[0][0] : ''
    })
    return row
  }

  const validateTestRows = (test, rows) => {
    const list = []
    rows.forEach((row, i) => {
      const repNum = i + 1

      // pH physical validations
      if (test.id === 'ph' && row.value !== '') {
        const v = num(row.value)
        if (v < 0 || v > 14 || Number.isNaN(v)) {
          list.push(t('batch.validation.ph_range').replace('{n}', repNum))
        }
      }

      // Negative checks for physical values
      test.fields.forEach(f => {
        if (f.type === 'number' && row[f.id] !== '') {
          const v = num(row[f.id])
          if (v < 0) {
            list.push(t('batch.validation.no_negative').replace('{n}', repNum).replace('{label}', f.label))
          }
        }
      })
    })

    // Replicate count validations
    if (test.min && rows.length < test.min) {
      list.push(t('batch.validation.min_reps').replace('{n}', test.min).replace('{c}', rows.length))
    }
    if (test.max && rows.length > test.max) {
      list.push(t('batch.validation.max_reps').replace('{n}', test.max).replace('{c}', rows.length))
    }

    return list
  }

  const recalculateWeightNets = (rows, tareVal, shouldSubtract) => {
    const defaultTare = num(tareVal)
    return rows.map(row => {
      const measuredNum = shouldSubtract ? num(row.gross) : num(row.net)

      if (Number.isFinite(measuredNum)) {
        if (shouldSubtract) {
          const calculatedNet = Number.isFinite(defaultTare)
            ? String(Number((measuredNum - defaultTare).toFixed(4)))
            : ''
          return {
            ...row,
            gross: String(measuredNum),
            tare: tareVal,
            net: calculatedNet
          }
        } else {
          const calculatedGross = Number.isFinite(defaultTare)
            ? String(Number((measuredNum + defaultTare).toFixed(4)))
            : String(measuredNum)
          return {
            ...row,
            net: String(measuredNum),
            tare: tareVal,
            gross: calculatedGross
          }
        }
      } else {
        return {
          ...row,
          gross: '',
          tare: tareVal,
          net: ''
        }
      }
    })
  }

  const handleBatchTareChange = (newTare) => {
    setBatchTare(newTare)
    setIsDirty(true)
    if (testData.weight) {
      const updatedRows = recalculateWeightNets(testData.weight, newTare, subtractTare)
      const updatedTestData = {
        ...testData,
        weight: updatedRows
      }
      setTestData(updatedTestData)

      const test = TESTS.find(t => t.id === 'weight')
      if (test) {
        const testWarnings = validateTestRows(test, updatedRows)
        setWarnings(prev => ({
          ...prev,
          weight: testWarnings
        }))
      }
    }
  }

  const handleSubtractTareToggle = (newValue) => {
    setSubtractTare(newValue)
    setIsDirty(true)
    if (testData.weight) {
      const updatedRows = recalculateWeightNets(testData.weight, batchTare, newValue)
      const updatedTestData = {
        ...testData,
        weight: updatedRows
      }
      setTestData(updatedTestData)

      const test = TESTS.find(t => t.id === 'weight')
      if (test) {
        const testWarnings = validateTestRows(test, updatedRows)
        setWarnings(prev => ({
          ...prev,
          weight: testWarnings
        }))
      }
    }
  }

  const handleAddFieldVal = (testId, index, fieldId, value) => {
    const test = TESTS.find(t => t.id === testId)
    if (!test) return

    setIsDirty(true)
    const newRows = [...(testData[testId] || [])]
    let updatedRow = {
      ...newRows[index],
      [fieldId]: value
    }

    if (testId === 'weight') {
      const defaultTare = num(batchTare)
      if (subtractTare) {
        const grossNum = num(value)
        updatedRow.gross = value
        updatedRow.tare = batchTare
        if (Number.isFinite(grossNum)) {
          updatedRow.net = Number.isFinite(defaultTare)
            ? String(Number((grossNum - defaultTare).toFixed(4)))
            : ''
        } else {
          updatedRow.net = ''
        }
      } else {
        const netNum = num(value)
        updatedRow.net = value
        updatedRow.tare = batchTare
        if (Number.isFinite(netNum)) {
          updatedRow.gross = Number.isFinite(defaultTare)
            ? String(Number((netNum + defaultTare).toFixed(4)))
            : String(netNum)
        } else {
          updatedRow.gross = ''
        }
      }
    }

    newRows[index] = updatedRow
    const updatedTestData = {
      ...testData,
      [testId]: newRows
    }
    setTestData(updatedTestData)

    // Validate
    const testWarnings = validateTestRows(test, newRows)
    setWarnings(prev => ({
      ...prev,
      [testId]: testWarnings
    }))
  }

  const addReplicate = (testId) => {
    const test = TESTS.find(t => t.id === testId)
    if (!test) return

    const currentRows = testData[testId] || []
    if (test.single && currentRows.length >= 1) return
    if (test.max && currentRows.length >= test.max) return

    setIsDirty(true)
    const updatedRows = [...currentRows, createEmptyRow(test)]
    const updatedTestData = {
      ...testData,
      [testId]: updatedRows
    }
    setTestData(updatedTestData)

    const testWarnings = validateTestRows(test, updatedRows)
    setWarnings(prev => ({
      ...prev,
      [testId]: testWarnings
    }))
  }

  const removeReplicate = (testId, index) => {
    const test = TESTS.find(t => t.id === testId)
    if (!test) return

    const currentRows = testData[testId] || []
    if (currentRows.length <= 1) return

    setIsDirty(true)
    const updatedRows = currentRows.filter((_, i) => i !== index)
    const updatedTestData = {
      ...testData,
      [testId]: updatedRows
    }
    setTestData(updatedTestData)

    const testWarnings = validateTestRows(test, updatedRows)
    setWarnings(prev => ({
      ...prev,
      [testId]: testWarnings
    }))
  }

  const handleSave = () => {
    // Perform validation across all tests
    const allWarnings = {}
    let hasBlockingError = false

    enabledTests.forEach(testId => {
      const test = TESTS.find(t => t.id === testId)
      if (!test) return

      const rows = testData[testId] || []
      const testWarnings = validateTestRows(test, rows)
      if (testWarnings.length > 0) {
        allWarnings[testId] = testWarnings
        if (testWarnings.some(w => w.includes('must be') || w.includes('cannot be') || w.includes('חייב') || w.includes('לא יכול'))) {
          hasBlockingError = true
        }
      }
    })

    setWarnings(allWarnings)

    if (hasBlockingError) {
      alert(t('batch.alert.fix_errors'))
      return
    }

    // Prepare array of test results to save
    const upsertPayload = []

    enabledTests.forEach(testId => {
      const test = TESTS.find(t => t.id === testId)
      if (!test) return

      const rows = testData[testId] || []

      // Clean empty fields but keep checkboxes
      const cleanRows = rows.map(row => {
        const cleaned = {}
        Object.entries(row).forEach(([k, v]) => {
          cleaned[k] = v === '' ? null : v
        })
        return cleaned
      })

      // Determine if the test actually has entered data or was already saved
      const isTestEmpty = (rList, tDef) => {
        return rList.every(row => {
          return tDef.fields.every(f => {
            const val = row[f.id]
            if (f.type === 'checkbox') return !val
            if (f.type === 'select') return true // select option default doesn't count
            return val === '' || val === null || val === undefined
          })
        })
      }

      const hasInitial = !!initialResults[`${batch.id}:${testId}`]
      const isEmpty = isTestEmpty(rows, test)

      if (hasInitial || !isEmpty) {
        upsertPayload.push({
          batch_id: batch.id,
          test_id: testId,
          replicates: cleanRows
        })
      }
    })

    onSave(upsertPayload)
  }

  const handleBackClick = () => {
    if (isDirty) {
      if (window.confirm(t('batch.confirm.unsaved'))) {
        onClose()
      }
    } else {
      onClose()
    }
  }

  // Count progress
  const enteredTestsCount = enabledTests.filter(testId => {
    const rows = testData[testId] || []
    const test = TESTS.find(t => t.id === testId)
    if (!test) return false
    
    // Check if the rows contain actual entered data
    const isTestEmpty = (rList, tDef) => {
      return rList.every(row => {
        return tDef.fields.every(f => {
          const val = row[f.id]
          if (f.type === 'checkbox') return !val
          if (f.type === 'select') return true
          return val === '' || val === null || val === undefined
        })
      })
    }
    return !isTestEmpty(rows, test)
  }).length

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-32">
      {/* Page Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 px-6 py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackClick}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-xl transition-all duration-200 cursor-pointer"
            title={t('batch.page.back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold tracking-tight">{t('batch.page.title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('batch.page.batch_label')} <span className="font-semibold text-teal-400">{batch.number || t('common.unnamed_batch')}</span> {t('batch.page.spec_label')} <span className="font-semibold text-slate-200">{template?.name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-slate-950/60 px-4 py-2 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300">
            {t('batch.page.progress')} <span className="text-teal-400 font-bold">{enteredTestsCount}</span> / {enabledTests.length} {t('batch.page.tests_entered')}
          </div>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-teal-500 hover:bg-teal-400 active:scale-[0.98] text-xs font-bold text-slate-950 rounded-xl transition-all duration-200 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{t('batch.btn.save')}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 mt-8 space-y-8">
        {/* Batch Info Card */}
        <section className="p-6 bg-slate-900 border border-slate-800 rounded-3xl grid grid-cols-1 md:grid-cols-3 gap-6 shadow-xl">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('batch.info.product_supplier')}</span>
            <p className="text-sm font-semibold text-white">{template?.name || t('tech.batch.unknown_product')}</p>
            <p className="text-xs text-slate-400">{t('batch.info.supplier')} {shipment.supplier}</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('batch.info.dates')}</span>
            <p className="text-xs text-slate-300">{t('batch.info.intake')} <strong className="text-white">{shipment.intake_date}</strong></p>
            <p className="text-xs text-slate-350">
              {t('batch.info.production')} <strong className="text-slate-200">{batch.production_date || '-'}</strong> {t('batch.info.expiration')} <strong className="text-slate-200">{batch.expiration_date || '-'}</strong>
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('batch.info.incubation')}</span>
            <p className="text-xs text-slate-300">
              {t('batch.info.incubation_units')} <strong className="text-white">{batch.units_36 || 0}</strong> | 55°C: <strong className="text-white">{batch.units_55 || 0}</strong>
            </p>
            {(batch.exit_36 || batch.exit_55) && (
              <p className="text-[10px] text-slate-450 mt-0.5">
                {t('batch.info.exits')} {batch.exit_36 || '-'} | 55°C: {batch.exit_55 || '-'}
              </p>
            )}
          </div>
        </section>

        {/* Tests List */}
        <div className="space-y-6">
          {enabledTests.map(testId => {
            const test = TESTS.find(t => t.id === testId)
            if (!test) return null

            const rows = testData[testId] || []
            const testWarnings = warnings[testId] || []
            const isAddDisabled = test.single || (test.max && rows.length >= test.max)

            // Calculate test preview
            const batchResults = {}
            enabledTests.forEach(tid => {
              batchResults[tid] = testData[tid] || []
            })
            const calcPreview = calculateTest(testId, rows, batchResults)

            return (
              <section
                key={testId}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-lg space-y-6"
              >
                {/* Test Card Header */}
                <div className="flex justify-between items-start gap-4 pb-4 border-b border-slate-800/60">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      {test.name}
                      {test.unit && (
                        <span className="text-xs text-slate-400 font-normal">({test.unit})</span>
                      )}
                    </h3>
                    <div className="flex gap-4 mt-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {t('batch.test.replicates_label')} {rows.length}
                        {test.min && ` ${t('batch.test.min').replace('{n}', test.min)}`}
                        {test.max && ` ${t('batch.test.max').replace('{n}', test.max)}`}
                      </span>
                    </div>
                  </div>

                  {/* Calculated Value Preview */}
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">{t('batch.test.calc_result')}</span>
                    <span className={`text-sm font-bold ${calcPreview.complete ? 'text-teal-400' : 'text-slate-400'}`}>
                      {calcPreview.label}
                    </span>
                  </div>
                </div>

                {/* Warnings Banner */}
                {testWarnings.length > 0 && (
                  <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                      <AlertTriangle className="w-4 h-4" />
                      <span>{t('batch.validation.title')}</span>
                    </div>
                    <ul className="list-disc list-inside text-xs text-amber-200 space-y-1 pl-1">
                      {testWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Default Batch Tare & Subtraction Switch */}
                {testId === 'weight' && (
                  <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-6 w-full md:w-auto">
                      <div className="flex flex-col gap-1.5 w-full sm:w-44">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {t('batch.weight.tare_label')}
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={batchTare}
                          onChange={(e) => handleBatchTareChange(e.target.value)}
                          placeholder={t('batch.weight.tare_placeholder')}
                          className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 transition-all duration-200"
                        />
                      </div>

                      <div className="flex items-center gap-3 pt-4 sm:pt-0">
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-350 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={subtractTare}
                            onChange={(e) => handleSubtractTareToggle(e.target.checked)}
                            className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-teal-600 focus:ring-teal-500/50 cursor-pointer"
                          />
                          <span>{t('batch.weight.subtract_toggle')}</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Replicates Table / Form fields */}
                <div className="space-y-4">
                  {rows.map((row, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-slate-950/40 border border-slate-850 rounded-2xl flex flex-col relative group hover:border-slate-800 transition-all duration-200 pt-8"
                    >
                      <div className="absolute top-2 left-3 text-[9px] text-slate-600 font-bold tracking-wider">
                        {t('batch.replicate.label').replace('{n}', idx + 1)}
                      </div>

                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeReplicate(testId, idx)}
                          className="absolute top-2 right-2 p-1.5 bg-slate-850 border border-slate-800 hover:border-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-all cursor-pointer"
                          aria-label={t('batch.replicate.remove')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <div className="flex-1 pt-1">
                        {testId === 'weight' ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {subtractTare ? t('batch.weight.gross_label') : t('batch.weight.net_label')}
                              </label>
                              <input
                                type="number"
                                step="any"
                                value={subtractTare ? (row.gross ?? '') : (row.net ?? '')}
                                onChange={(e) => handleAddFieldVal(testId, idx, subtractTare ? 'gross' : 'net', e.target.value)}
                                placeholder={subtractTare ? t('batch.weight.gross_placeholder') : t('batch.weight.net_placeholder')}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 transition-all duration-200"
                              />
                            </div>
                            
                            <div className="h-10 flex items-center">
                              <div className="px-4 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-[11px] font-mono text-slate-350 w-full select-none">
                                {t('batch.weight.calc_gross')} <span className="text-white font-bold">{row.gross || '-'}</span>g | 
                                {t('batch.weight.calc_tare')} <span className="text-amber-400/80 font-bold">{row.tare || '0'}</span>g | 
                                {t('batch.weight.calc_net')} <span className="text-teal-400 font-bold">{row.net || '-'}</span>g
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
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
                                      onChange={(e) => handleAddFieldVal(testId, idx, field.id, e.target.value)}
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
                                      onChange={(e) => handleAddFieldVal(testId, idx, field.id, e.target.value)}
                                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 transition-all duration-200"
                                    >
                                      <option value="">{t('batch.select.default')}</option>
                                      <option value="Pass">{t('batch.select.pass')}</option>
                                      <option value="Fail">{t('batch.select.fail')}</option>
                                    </select>
                                  </div>
                                )
                              }

                              if (field.type === 'checkbox') {
                                return (
                                  <div key={field.id} className="flex items-center h-10 pt-4">
                                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-350 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={!!value}
                                        onChange={(e) => handleAddFieldVal(testId, idx, field.id, e.target.checked)}
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
                                    onChange={(e) => handleAddFieldVal(testId, idx, field.id, e.target.value)}
                                    placeholder={t('batch.input.placeholder')}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 transition-all duration-200"
                                  />
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions per test */}
                <div className="flex justify-between items-center pt-2">
                  {!isAddDisabled ? (
                    <button
                      onClick={() => addReplicate(testId)}
                      className="flex items-center gap-1.5 px-4 py-2 border border-slate-800 hover:border-slate-700 bg-slate-950 hover:bg-slate-900 text-xs font-bold text-slate-350 hover:text-white rounded-xl transition-all duration-200 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('batch.btn.add_replicate')}</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="text-[10px] text-slate-500 font-medium italic">
                    {test.single && t('batch.hint.single')}
                    {test.min && t('batch.hint.min').replace('{n}', test.min)}
                    {test.max && t('batch.hint.max').replace('{n}', test.max)}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </main>

      {/* Sticky Bottom Actions Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur border-t border-slate-800 py-4 px-4 sm:px-6 flex sm:justify-end gap-3 z-20">
        <button
          onClick={handleBackClick}
          className="flex-1 sm:flex-none px-6 py-2.5 border border-slate-800 hover:border-slate-750 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition-all duration-200 cursor-pointer"
        >
          {t('batch.btn.cancel')}
        </button>
        <button
          onClick={handleSave}
          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-8 py-2.5 bg-teal-500 hover:bg-teal-400 active:scale-[0.98] text-xs font-bold text-slate-950 rounded-xl shadow-lg shadow-teal-500/10 transition-all duration-200 cursor-pointer"
        >
          <Check className="w-4 h-4" />
          <span>{t('batch.btn.save')}</span>
        </button>
      </footer>
    </div>
  )
}
