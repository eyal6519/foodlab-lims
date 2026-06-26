import React, { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Trash2, AlertTriangle, Check, Info, Lock } from 'lucide-react'
import { TESTS, testMap, calculateTest, num, isTestLocked, getTestDefinition } from '../utils/calculations'
import { useLanguage } from '../context/LanguageContext'

const TEST_FORMULAS = {
  weight: 'Net = Gross - Tare',
  volume: 'Volume = Weight / Specific Gravity',
  vacuum: 'Vacuum (mmHg) = Vacuum (inHg) * 25.4',
  vacuum_before: 'Vacuum (mmHg) = Vacuum (inHg) * 25.4',
  vacuum_36: 'Vacuum (mmHg) = Vacuum (inHg) * 25.4',
  vacuum_55: 'Vacuum (mmHg) = Vacuum (inHg) * 25.4',
  moisture_oven: 'Moisture % = ((Sample + Crucible - End) / Sample) * 100',
  acidity: 'Acidity % = (Titration Volume * Acid Constant) / Sample Mass',
  ash: 'Ash % = ((End Mass - Crucible Mass) / Sample Mass) * 100',
  acid_insoluble_ash: 'Acid-Insoluble Ash % = ((End Mass - Crucible Mass) / Sample Mass) * 100',
  sieving_size: 'Passed % = (Passed Mass / Sample Mass) * 100',
  salt: 'Salt % = (Silver Nitrate Volume * 0.585) / Sample Mass',
  aqueous_layer: 'Aqueous % = (Aqueous Volume / Denominator Mass) * 100',
  peroxides: 'Peroxides = (Thiosulfate Volume * 10) / Sample Mass',
  drip_loss: 'Drip Loss % = 100 - (100 * Defrost Mass / Initial Mass)',
  paprika_asta: 'ASTA Color = (Absorption * 1640) / Sample Mass (mg)',
  fat_separation: 'Fat Separation % = (Fat Mass * 100) / Total Mass',
  filling_coating: 'Coating % = (External / Total) * 100 | Filling % = (Internal / Total) * 100',
  tuna_chunk: 'Chunk % = (Chunk Mass / Total Mass) * 100',
  general_ratio: 'Ratio % = (Part / Whole) * 100'
}

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

  const customTests = template?.standards?._customTests || []
  const formattedCustomTests = customTests.map(ct => {
    const isRatio = ct.type === 'ratio'
    return {
      id: ct.id,
      name: ct.name,
      unit: ct.unit || (isRatio ? '%' : ''),
      standardsType: ct.standardsType || 'range',
      customFormula: isRatio
        ? t('batch.custom.formula_ratio')
        : null,
      fields: isRatio
        ? [
            { id: 'numerator_value', label: ct.numeratorLabel || t('batch.custom.sample_weight'), type: 'number' },
            { id: 'denominator_value', label: ct.denominatorLabel || t('batch.custom.measured_weight'), type: 'number' }
          ]
        : [
            { id: 'value', label: ct.valueLabel || t('batch.custom.value'), type: 'number' }
          ],
      calc: r => {
        if (isRatio) {
          const numVal = num(r.numerator_value)
          const denVal = num(r.denominator_value)
          if (denVal > 0 && Number.isFinite(numVal)) {
            return (numVal / denVal) * 100
          }
          return NaN
        } else {
          return num(r.value)
        }
      }
    }
  })

  const allTests = [...TESTS, ...formattedCustomTests]

  const enabledTests = template
    ? template.tests.filter(tid => {
        const t = allTests.find(x => x.id === tid)
        return t && !t.isCalculated
      })
    : []

  // Initialize replicates state
  useEffect(() => {
    const initialData = {}
    const initialWarnings = {}

    enabledTests.forEach(testId => {
      const test = allTests.find(t => t.id === testId)
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
      const isPhTest = test.id === 'ph' || test.id === 'ph_before' || test.id === 'ph_36' || test.id === 'ph_55'
      if (isPhTest && row.value !== '') {
        const v = num(row.value)
        if (v < 0 || v > 14 || Number.isNaN(v)) {
          list.push(t('batch.validation.ph_range').replace('{n}', repNum))
        }
      }

      // Negative checks for physical values (allowing down to -0.5 for weight/moisture error margins)
      const isMoistureOrWeight = test.id === 'moisture_device' || test.id === 'moisture_oven' || test.id === 'weight'
      test.fields.forEach(f => {
        if (f.type === 'number' && row[f.id] !== '') {
          const v = num(row[f.id])
          if (isMoistureOrWeight) {
            if (v < -0.5) {
              list.push(t('batch.validation.no_negative').replace('{n}', repNum).replace('{label}', f.label))
            }
          } else {
            if (v < 0) {
              list.push(t('batch.validation.no_negative').replace('{n}', repNum).replace('{label}', f.label))
            }
          }
        }
      })

      // Physical logic validations
      if (test.id === 'moisture_oven') {
        const sample = num(row.sample)
        const crucible = num(row.crucible)
        const end = num(row.end)
        if (Number.isFinite(sample) && Number.isFinite(crucible) && Number.isFinite(end)) {
          if (end > (sample + crucible)) {
            list.push(t('batch.validation.oven_moisture').replace('{n}', repNum).replace('{end}', end).replace('{start}', sample + crucible))
          }
        }
      }

      if (test.id === 'sieving_size') {
        const sample = num(row.sample)
        const passed = num(row.passed)
        if (Number.isFinite(sample) && Number.isFinite(passed)) {
          if (passed > sample) {
            list.push(t('batch.validation.sieving_size').replace('{n}', repNum).replace('{passed}', passed).replace('{sample}', sample))
          }
        }
      }

      if (test.id === 'tuna_chunk') {
        const chunk = num(row.chunk)
        const total = num(row.total)
        if (Number.isFinite(chunk) && Number.isFinite(total)) {
          if (chunk > total) {
            list.push(t('batch.validation.tuna_chunk').replace('{n}', repNum).replace('{chunk}', chunk).replace('{total}', total))
          }
        }
      }

      if (test.id === 'fat_separation') {
        const fat = num(row.fat)
        const total = num(row.total)
        if (Number.isFinite(fat) && Number.isFinite(total)) {
          if (fat > total) {
            list.push(t('batch.validation.fat_separation').replace('{n}', repNum).replace('{fat}', fat).replace('{total}', total))
          }
        }
      }

      if (test.id === 'general_ratio') {
        const part = num(row.part)
        const whole = num(row.whole)
        if (Number.isFinite(part) && Number.isFinite(whole)) {
          if (part > whole) {
            list.push(t('batch.validation.general_ratio').replace('{n}', repNum).replace('{part}', part).replace('{whole}', whole))
          }
        }
      }

      if (test.id === 'ash' || test.id === 'acid_insoluble_ash') {
        const crucible = num(row.crucible)
        const end = num(row.end)
        if (Number.isFinite(crucible) && Number.isFinite(end)) {
          if (end < crucible) {
            list.push(t('batch.validation.ash_crucible').replace('{n}', repNum).replace('{end}', end).replace('{crucible}', crucible))
          }
        }
      }

      if (test.id === 'drip_loss') {
        const before = num(row.before)
        const after = num(row.after)
        if (Number.isFinite(before) && Number.isFinite(after)) {
          if (after > before) {
            list.push(t('batch.validation.drip_loss').replace('{n}', repNum).replace('{after}', after).replace('{before}', before))
          }
        }
      }

      // Custom ratio test validation
      if (test.id.startsWith('custom_') && test.fields.some(f => f.id === 'numerator_value')) {
        const numVal = num(row.numerator_value)
        const denVal = num(row.denominator_value)
        if (Number.isFinite(numVal) && Number.isFinite(denVal)) {
          if (numVal > denVal) {
            list.push(t('batch.validation.custom_ratio').replace('{n}', repNum))
          }
        }
      }
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

      const test = allTests.find(t => t.id === 'weight')
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

      const test = allTests.find(t => t.id === 'weight')
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
    const test = allTests.find(t => t.id === testId)
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
    const test = allTests.find(t => t.id === testId)
    if (!test) return

    const currentRows = testData[testId] || []
    if (currentRows.length <= 1) return

    setIsDirty(true)
    const newRows = currentRows.filter((_, i) => i !== index)

    // Re-verify tare subtraction on all weight replicates to maintain consistency
    let updatedRows = newRows
    if (testId === 'weight') {
      updatedRows = recalculateWeightNets(newRows, batchTare, subtractTare)
    }

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

  const handlePassFailChange = (testId, fieldId, value) => {
    const test = allTests.find(t => t.id === testId)
    if (!test) return

    setIsDirty(true)
    const newRows = [...(testData[testId] || [])]
    const updatedRow = {
      ...newRows[0],
      [fieldId]: value
    }
    newRows[0] = updatedRow

    const updatedTestData = {
      ...testData,
      [testId]: newRows
    }
    setTestData(updatedTestData)

    const testWarnings = validateTestRows(test, newRows)
    setWarnings(prev => ({
      ...prev,
      [testId]: testWarnings
    }))
  }

  const handleCheckboxChange = (testId, fieldId, value) => {
    const test = allTests.find(t => t.id === testId)
    if (!test) return

    setIsDirty(true)
    const newRows = [...(testData[testId] || [])]
    const updatedRow = {
      ...newRows[0],
      [fieldId]: value
    }
    newRows[0] = updatedRow

    const updatedTestData = {
      ...testData,
      [testId]: newRows
    }
    setTestData(updatedTestData)

    const testWarnings = validateTestRows(test, newRows)
    setWarnings(prev => ({
      ...prev,
      [testId]: testWarnings
    }))
  }

  const handleSave = () => {
    const allWarnings = {}
    let hasBlockingError = false

    enabledTests.forEach(testId => {
      const rows = testData[testId] || []
      const test = allTests.find(t => t.id === testId)
      if (!test) return

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
      const test = allTests.find(t => t.id === testId)
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
    const test = allTests.find(t => t.id === testId)
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
              {t('batch.page.sub')
                .replace('{batch}', batch.number || t('common.unnamed_batch'))
                .replace('{product}', template?.name || t('tech.batch.unknown_product'))}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-teal-500/10 transition-all duration-250 cursor-pointer"
          >
            {t('batch.page.save')}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Batch Metadata Header info */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 grid grid-cols-1 sm:grid-cols-3 gap-6 shadow-lg">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('batch.info.supplier')}</span>
            <p className="text-sm font-bold text-white">{shipment.supplier}</p>
            {shipment.size && (
              <p className="text-xs text-slate-400 mt-0.5">
                {t('tech.batch.size').replace('{s}', shipment.size)}
              </p>
            )}
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
            const test = allTests.find(t => t.id === testId)
            if (!test) return null

            const isLocked = isTestLocked(testId, batch, template)
            const rows = testData[testId] || []
            const testWarnings = warnings[testId] || []
            const isAddDisabled = isLocked || test.single || (test.max && rows.length >= test.max)

            // Calculate days remaining and target date for lock notice
            let daysRemaining = 0
            const today = new Date().toISOString().slice(0, 10)
            const exitDate = testId.includes('36') ? batch.exit_36 : (testId.includes('55') ? batch.exit_55 : null)
            if (exitDate) {
              const diffTime = new Date(exitDate).getTime() - new Date(today).getTime()
              daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
            }

            // Calculate test preview
            const batchResults = {}
            enabledTests.forEach(tid => {
              batchResults[tid] = testData[tid] || []
            })
            const calcPreview = calculateTest(testId, rows, batchResults, test)

            return (
              <section
                key={testId}
                className={`bg-slate-900 border rounded-3xl p-6 shadow-lg space-y-6 transition-all duration-300 ${
                  isLocked ? 'border-slate-805/40 opacity-70 bg-slate-900/50' : 'border-slate-800'
                }`}
              >
                {/* Test Card Header */}
                <div className="flex justify-between items-start gap-4 pb-4 border-b border-slate-800/60">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      {isLocked && <Lock className="w-4 h-4 text-amber-500 shrink-0" />}
                      <span className={isLocked ? 'text-slate-400' : ''}>{test.name}</span>
                      {test.unit && (
                        <span className="text-xs text-slate-400 font-normal">({test.unit})</span>
                      )}
                    </h3>
                    <div className="flex flex-col gap-1 mt-1">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        {t('batch.test.replicates_label')} {rows.length}
                        {test.min && ` ${t('batch.test.min').replace('{n}', test.min)}`}
                        {test.max && ` ${t('batch.test.max').replace('{n}', test.max)}`}
                      </span>
                      {(TEST_FORMULAS[testId] || test.customFormula) && (
                        <span className="text-[10px] text-slate-450 font-semibold tracking-wide mt-0.5">
                          {t('batch.test.formula_label')} <span className="font-mono text-slate-350">{TEST_FORMULAS[testId] || test.customFormula}</span>
                        </span>
                      )}
                      {isLocked && (
                        <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider flex items-center gap-1">
                          {t('batch.test.locked')
                            .replace('{temp}', testId.includes('36') ? '36°C' : '55°C')
                            .replace('{date}', exitDate || '')
                            .replace('{days}', String(daysRemaining))}
                        </span>
                      )}
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
                {testWarnings.length > 0 && !isLocked && (
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
                  <div className="p-4 bg-slate-950/40 border border-slate-855 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-6 w-full md:w-auto">
                      <div className="flex flex-col gap-1.5 w-full sm:w-44">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {t('batch.weight.tare_label')}
                        </label>
                        <input
                          type="number"
                          step="any"
                          disabled={isLocked}
                          value={batchTare}
                          onChange={(e) => handleBatchTareChange(e.target.value)}
                          placeholder={t('batch.weight.tare_placeholder')}
                          className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 transition-all duration-200 disabled:opacity-50"
                        />
                      </div>

                      <div className="flex items-center gap-3 pt-4 sm:pt-0">
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-350 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            disabled={isLocked}
                            checked={subtractTare}
                            onChange={(e) => handleSubtractTareToggle(e.target.checked)}
                            className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-teal-600 focus:ring-teal-500/50 cursor-pointer disabled:opacity-50"
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

                      {rows.length > 1 && !isLocked && (
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
                                disabled={isLocked}
                                value={subtractTare ? (row.gross ?? '') : (row.net ?? '')}
                                onChange={(e) => handleAddFieldVal(testId, idx, subtractTare ? 'gross' : 'net', e.target.value)}
                                placeholder={subtractTare ? t('batch.weight.gross_placeholder') : t('batch.weight.net_placeholder')}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 transition-all duration-200 disabled:opacity-50"
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
                                      disabled={isLocked}
                                      onChange={(e) => handleAddFieldVal(testId, idx, field.id, e.target.value)}
                                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 transition-all duration-200 disabled:opacity-50"
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
                                      disabled={isLocked}
                                      onChange={(e) => handleAddFieldVal(testId, idx, field.id, e.target.value)}
                                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 transition-all duration-200 disabled:opacity-50"
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
                                        disabled={isLocked}
                                        checked={!!value}
                                        onChange={(e) => handleAddFieldVal(testId, idx, field.id, e.target.checked)}
                                        className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-teal-600 focus:ring-teal-500/50 disabled:opacity-50"
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
                                    disabled={isLocked}
                                    value={value}
                                    onChange={(e) => handleAddFieldVal(testId, idx, field.id, e.target.value)}
                                    placeholder={(() => {
                                      if (field.type !== 'number') return t('batch.input.placeholder')
                                      const lower = field.label.toLowerCase()
                                      if (lower.includes('weight') || lower.includes('mass') || lower.includes('crucible') || lower.includes('end') || lower.includes('passed') || lower.includes('chunk') || lower.includes('fat') || lower.includes('silver')) {
                                        return 'e.g. 10.000'
                                      }
                                      if (lower.includes('ph')) {
                                        return 'e.g. 6.50'
                                      }
                                      if (lower.includes('volume') || lower.includes('titration') || lower.includes('layer')) {
                                        return 'e.g. 12.5'
                                      }
                                      if (lower.includes('brix') || lower.includes('sugar') || lower.includes('defrost') || lower.includes('before') || lower.includes('after') || lower.includes('absorption') || lower.includes('defects') || lower.includes('size')) {
                                        return 'e.g. 15.0'
                                      }
                                      if (lower.includes('gravity')) {
                                        return 'e.g. 1.025'
                                      }
                                      if (lower.includes('vacuum') || lower.includes('hg')) {
                                        return 'e.g. 20.0'
                                      }
                                      return 'e.g. 5.0'
                                    })()}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 transition-all duration-200 disabled:opacity-50"
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
                    {test.min && !isLocked && t('batch.hint.min').replace('{n}', test.min)}
                    {test.max && !isLocked && t('batch.hint.max').replace('{n}', test.max)}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </div>

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
