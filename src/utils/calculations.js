// Helper utility for parsing numbers safely
export function num(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

// Helper utility for formatting numbers to a readable decimal format
export function fmt(value, digits = 2) {
  return Number.isFinite(value)
    ? Number(value)
        .toFixed(digits)
        .replace(/\.?0+$/, '')
    : '-'
}

// Helper utility for calculating averages safely
export function avg(values) {
  const clean = values.filter(Number.isFinite)
  if (!clean.length) return NaN
  return clean.reduce((sum, v) => sum + v, 0) / clean.length
}

// Helper utility for calculating logarithmic pH averages safely
export function avgLogPh(values) {
  const clean = values.filter(Number.isFinite)
  if (!clean.length) return NaN
  const hConcs = clean.map(v => Math.pow(10, -v))
  const avgHConc = hConcs.reduce((sum, c) => sum + c, 0) / hConcs.length
  if (avgHConc <= 0) return NaN
  return -Math.log10(avgHConc)
}

export const TESTS = [
  {
    id: 'labeling_packaging',
    name: 'Labeling and Packaging',
    kind: 'qualitative',
    standardsType: 'none',
    fields: [
      { id: 'pass', label: 'Result', type: 'passfail' },
      { id: 'reason', label: 'Reasoning / Notes', type: 'text' }
    ]
  },
  {
    id: 'weight',
    name: 'Weight',
    unit: 'g',
    standardsType: 'min',
    max: 10,
    fields: [
      { id: 'gross', label: 'Gross weight (g) [Bruto]', type: 'number' },
      { id: 'tare', label: 'Tare weight (g)', type: 'number' },
      { id: 'net', label: 'Net weight (g)', type: 'number' }
    ],
    calc: r => {
      const netVal = num(r.net)
      if (Number.isFinite(netVal)) return netVal
      const grossVal = num(r.gross)
      const tareVal = num(r.tare)
      if (Number.isFinite(grossVal) && Number.isFinite(tareVal)) {
        return grossVal - tareVal
      }
      return NaN
    }
  },
  {
    id: 'volume',
    name: 'Volume',
    unit: 'ml',
    isCalculated: true,
    standardsType: 'min',
    fields: []
  },
  {
    id: 'vacuum',
    name: 'Vacuum',
    unit: 'mmHg',
    standardsType: 'min',
    fields: [{ id: 'hg', label: 'Vacuum (inHg)', type: 'number' }],
    calc: r => num(r.hg) * 25.4
  },
  {
    id: 'drained_weight',
    name: 'Drained Weight',
    unit: 'g',
    standardsType: 'min',
    fields: [{ id: 'value', label: 'Drained weight (g)', type: 'number' }],
    calc: r => num(r.value)
  },
  {
    id: 'ph',
    name: 'pH',
    unit: 'pH',
    standardsType: 'range',
    fields: [{ id: 'value', label: 'pH value', type: 'number' }],
    calc: r => {
      const v = num(r.value)
      return v >= 0 && v <= 14 ? v : NaN
    }
  },
  {
    id: 'moisture_device',
    name: 'Moisture (Drying Device)',
    unit: '%',
    standardsType: 'max',
    fields: [{ id: 'value', label: 'Moisture %', type: 'number' }],
    calc: r => num(r.value)
  },
  {
    id: 'moisture_oven',
    name: 'Moisture (Drying Oven)',
    unit: '%',
    standardsType: 'max',
    fields: [
      { id: 'sample', label: 'Sample mass (g)', type: 'number' },
      { id: 'crucible', label: 'Crucible mass (g)', type: 'number' },
      { id: 'end', label: 'End mass (g)', type: 'number' }
    ],
    calc: r => {
      const s = num(r.sample)
      const c = num(r.crucible)
      const e = num(r.end)
      if (s <= 0) return NaN
      return ((s + c - e) / s) * 100
    }
  },
  {
    id: 'brix',
    name: 'Soluble Solids (Brix)',
    unit: 'Brix',
    single: true,
    standardsType: 'range',
    fields: [{ id: 'value', label: 'Brix value', type: 'number' }],
    calc: r => num(r.value)
  },
  {
    id: 'acidity',
    name: 'Acidity',
    unit: '%',
    standardsType: 'range',
    fields: [
      { id: 'volume', label: 'Titration volume (ml)', type: 'number' },
      { id: 'mass', label: 'Sample mass (g)', type: 'number' },
      {
        id: 'acid',
        label: 'Acid constant',
        type: 'select',
        options: [
          ['0.64', 'Citric 0.64'],
          ['0.90', 'Lactic 0.90'],
          ['0.60', 'Acetic 0.60'],
          ['0.75', 'Tartaric 0.75'],
          ['0.47', 'Oleic 0.47']
        ]
      }
    ],
    calc: r => {
      const v = num(r.volume)
      const m = num(r.mass)
      const a = num(r.acid)
      if (m <= 0) return NaN
      return (v * a) / m
    }
  },
  {
    id: 'ash',
    name: 'Ash',
    unit: '%',
    standardsType: 'max',
    fields: [
      { id: 'crucible', label: 'Crucible mass (g)', type: 'number' },
      { id: 'sample', label: 'Sample mass (g)', type: 'number' },
      { id: 'end', label: 'Mass after burning (g)', type: 'number' }
    ],
    calc: r => {
      const c = num(r.crucible)
      const s = num(r.sample)
      const e = num(r.end)
      if (s <= 0) return NaN
      return ((e - c) / s) * 100
    }
  },
  {
    id: 'acid_insoluble_ash',
    name: 'Acid-Insoluble Ash (HCl)',
    unit: '%',
    standardsType: 'max',
    fields: [
      { id: 'crucible', label: 'Crucible mass (g)', type: 'number' },
      { id: 'sample', label: 'Sample mass (g)', type: 'number' },
      { id: 'end', label: 'Mass after burning (g)', type: 'number' }
    ],
    calc: r => {
      const c = num(r.crucible)
      const s = num(r.sample)
      const e = num(r.end)
      if (s <= 0) return NaN
      return ((e - c) / s) * 100
    }
  },
  {
    id: 'sieving_size',
    name: 'Sieving and Size',
    kind: 'multiResult',
    standardsType: 'range',
    fields: [
      { id: 'sample', label: 'Sample mass (g)', type: 'number' },
      { id: 'passed', label: 'Passed mass (g)', type: 'number' },
      { id: 'size', label: 'Size (mm)', type: 'number' }
    ],
    calc: r => {
      const s = num(r.sample)
      const p = num(r.passed)
      const sz = num(r.size)
      return {
        'Passed %': s > 0 ? (p / s) * 100 : NaN,
        'Size avg': sz
      }
    }
  },
  {
    id: 'salt',
    name: 'Salt',
    unit: '%',
    standardsType: 'range',
    fields: [
      { id: 'silver', label: 'Silver nitrate volume (ml)', type: 'number' },
      { id: 'mass', label: 'Sample mass (g)', type: 'number' }
    ],
    calc: r => {
      const v = num(r.silver)
      const m = num(r.mass)
      if (m <= 0) return NaN
      return (v * 0.585) / m
    }
  },
  {
    id: 'specific_gravity',
    name: 'Specific Gravity',
    single: true,
    standardsType: 'range',
    fields: [{ id: 'value', label: 'Specific gravity', type: 'number' }],
    calc: r => num(r.value)
  },
  {
    id: 'aqueous_layer',
    name: 'Aqueous Layer Volume',
    kind: 'aqueous',
    unit: 'ml/100g',
    standardsType: 'max',
    fields: [
      { id: 'volume', label: 'Aqueous volume (ml)', type: 'number' },
      { id: 'sample', label: 'Sample mass (g)', type: 'number' },
      { id: 'selected', label: 'Use in denominator', type: 'checkbox' }
    ]
  },
  {
    id: 'organoleptic',
    name: 'Organoleptic Evaluation',
    kind: 'qualitative',
    standardsType: 'none',
    fields: [
      { id: 'pass', label: 'Result', type: 'passfail' },
      { id: 'reason', label: 'Summary reference / notes', type: 'text' }
    ]
  },
  {
    id: 'peroxides',
    name: 'Peroxides in Oil',
    unit: 'meq/kg',
    standardsType: 'max',
    fields: [
      { id: 'volume', label: 'Thiosulfate volume (ml)', type: 'number' },
      { id: 'mass', label: 'Sample mass (g)', type: 'number' }
    ],
    calc: r => {
      const v = num(r.volume)
      const m = num(r.mass)
      if (m <= 0) return NaN
      return (v * 10) / m
    }
  },
  {
    id: 'drip_loss',
    name: 'Drip Loss in Fish (Ice %)',
    unit: '%',
    standardsType: 'max',
    fields: [
      { id: 'before', label: 'Mass before defrost (g)', type: 'number' },
      { id: 'after', label: 'Mass after defrost (g)', type: 'number' }
    ],
    calc: r => {
      const b = num(r.before)
      const a = num(r.after)
      if (b <= 0) return NaN
      return 100 - (100 * a) / b
    }
  },
  {
    id: 'water_activity',
    name: 'Water Activity (Aw)',
    single: true,
    unit: 'Aw',
    standardsType: 'max',
    fields: [{ id: 'value', label: 'Water activity', type: 'number' }],
    calc: r => num(r.value)
  },
  {
    id: 'paprika_asta',
    name: 'Paprika Color (ASTA)',
    unit: 'ASTA',
    min: 2,
    max: 2,
    standardsType: 'min',
    fields: [
      { id: 'mass', label: 'Sample mass (mg)', type: 'number' },
      { id: 'absorption', label: 'Absorption value', type: 'number' }
    ],
    calc: r => {
      const m = num(r.mass)
      const a = num(r.absorption)
      if (m <= 0) return NaN
      return (a * 1640) / m
    }
  },
  {
    id: 'fat_separation',
    name: 'Fat Separation',
    unit: '%',
    min: 2,
    max: 2,
    standardsType: 'max',
    fields: [
      { id: 'fat', label: 'Mass of fat (g)', type: 'number' },
      { id: 'total', label: 'Total mass (g)', type: 'number' }
    ],
    calc: r => {
      const f = num(r.fat)
      const t = num(r.total)
      if (t <= 0) return NaN
      return (f * 100) / t
    }
  },
  {
    id: 'oxygen_analyzer',
    name: 'Oxygen Analyzer',
    single: true,
    unit: '%',
    standardsType: 'max',
    fields: [{ id: 'value', label: 'Oxygen %', type: 'number' }],
    calc: r => num(r.value)
  },
  {
    id: 'filling_coating',
    name: 'Filling and Coating',
    kind: 'multiResult',
    max: 10,
    standardsType: 'range',
    fields: [
      { id: 'external', label: 'External mass (g)', type: 'number' },
      { id: 'internal', label: 'Internal mass (g)', type: 'number' },
      { id: 'total', label: 'Total mass (g)', type: 'number' }
    ],
    calc: r => {
      const e = num(r.external)
      const i = num(r.internal)
      const t = num(r.total)
      return {
        'Coating %': t > 0 ? (e / t) * 100 : NaN,
        'Filling %': t > 0 ? (i / t) * 100 : NaN
      }
    }
  },
  {
    id: 'salt_auto',
    name: 'Salt (Automatic Titrator)',
    single: true,
    unit: '%',
    standardsType: 'range',
    fields: [{ id: 'value', label: 'Salt %', type: 'number' }],
    calc: r => num(r.value)
  },
  {
    id: 'acidity_auto',
    name: 'Acidity (Automatic Titrator)',
    single: true,
    unit: '%',
    standardsType: 'range',
    fields: [{ id: 'value', label: 'Acidity %', type: 'number' }],
    calc: r => num(r.value)
  },
  {
    id: 'tuna_chunk',
    name: 'Chunk Percentage in Tuna',
    unit: '%',
    min: 5,
    standardsType: 'min',
    fields: [
      { id: 'chunk', label: 'Chunk mass (g)', type: 'number' },
      { id: 'total', label: 'Total mass (g)', type: 'number' }
    ],
    calc: r => {
      const c = num(r.chunk)
      const t = num(r.total)
      if (t <= 0) return NaN
      return (c / t) * 100
    }
  },
  {
    id: 'foreign_matter',
    name: 'Foreign Matter / Insects / Defects',
    kind: 'qualitative',
    standardsType: 'none',
    fields: [
      { id: 'pass', label: 'Result', type: 'passfail' },
      { id: 'reason', label: 'Notes', type: 'text' }
    ]
  },
  {
    id: 'general_ratio',
    name: 'General Ratio Test',
    unit: '%',
    custom: true,
    standardsType: 'range',
    fields: [
      { id: 'name', label: 'Result name', type: 'text' },
      { id: 'part', label: 'Part', type: 'number' },
      { id: 'whole', label: 'Whole', type: 'number' }
    ],
    calc: r => {
      const p = num(r.part)
      const w = num(r.whole)
      if (w <= 0) return NaN
      return (p / w) * 100
    }
  }
]

export const testMap = Object.fromEntries(TESTS.map(t => [t.id, t]))

// Master calculation runner
export function calculateTest(testId, rows = [], batchResults = {}) {
  const test = testMap[testId]
  if (!test) return { label: '-', average: NaN, complete: false, values: [] }

  // Special Volume derived calculation
  if (testId === 'volume') {
    const weightRows = batchResults['weight'] || []
    const sgRows = batchResults['specific_gravity'] || []
    
    const weightCalc = calculateTest('weight', weightRows, batchResults)
    const sgCalc = calculateTest('specific_gravity', sgRows, batchResults)
    
    const avgWeight = weightCalc.average
    const avgSG = sgCalc.average
    
    const value = (Number.isFinite(avgWeight) && Number.isFinite(avgSG) && avgSG > 0)
      ? avgWeight / avgSG
      : NaN
      
    return {
      label: Number.isFinite(value) ? `${fmt(value)} ml` : '-',
      average: value,
      complete: Number.isFinite(value),
      values: [value]
    }
  }

  // Special pH display format: "pH of x.xx"
  if (testId === 'ph') {
    const values = rows.map(r => test.calc(r)).filter(Number.isFinite)
    const average = avgLogPh(values)
    return {
      label: Number.isFinite(average) ? `pH of ${fmt(average)}` : '-',
      average,
      complete: values.length >= 1,
      values
    }
  }

  // 1. Qualitative (Pass/Fail)
  if (test.kind === 'qualitative') {
    const last = rows[rows.length - 1] || {}
    const passVal = last.pass || ''
    const hasResult = passVal === 'Pass' || passVal === 'Fail'
    return {
      label: passVal || '-',
      average: NaN,
      complete: hasResult,
      values: [],
      note: last.reason || last.summary || ''
    }
  }

  // 3. Aqueous Layer Volume
  if (test.kind === 'aqueous') {
    const selectedMass = rows
      .filter(r => r.selected)
      .reduce((sum, r) => sum + (num(r.sample) || 0), 0)

    const volumes = rows.map(r => num(r.volume)).filter(Number.isFinite)
    const firstVolume = volumes.length > 0 ? volumes[0] : NaN

    const value = selectedMass > 0 && Number.isFinite(firstVolume)
      ? (firstVolume / selectedMass) * 100
      : NaN

    return {
      label: Number.isFinite(value) ? `${fmt(value)} ml/100g` : '-',
      average: value,
      complete: Number.isFinite(value),
      values: [value]
    }
  }

  // 4. Multiple Results (e.g., Sieving/Size, Filling/Coating)
  if (test.kind === 'multiResult') {
    const buckets = {}
    rows.forEach(r => {
      const res = test.calc(r) || {}
      Object.entries(res).forEach(([k, v]) => {
        if (!buckets[k]) buckets[k] = []
        buckets[k].push(v)
      })
    })

    const labels = Object.entries(buckets)
      .map(([name, values]) => {
        const cleanVals = values.filter(Number.isFinite)
        const avgVal = avg(cleanVals)
        let unitSuffix = ''
        if (name.includes('%') || name.toLowerCase().includes('percentage')) {
          unitSuffix = '%'
        } else if (name.toLowerCase().includes('size')) {
          unitSuffix = ' mm'
        }
        return `${name}: ${fmt(avgVal)}${unitSuffix}`
      })

    const valueCount = Object.values(buckets)[0]?.filter(Number.isFinite).length || 0
    const required = test.min || 1
    const overallAvg = avg(Object.values(buckets).map(vList => avg(vList.filter(Number.isFinite))))

    return {
      label: labels.join(' / ') || '-',
      average: overallAvg,
      complete: labels.length > 0 && valueCount >= required,
      values: Object.values(buckets).flat().filter(Number.isFinite)
    }
  }

  // 5. General Single-Value Calculations
  const values = rows.map(r => test.calc(r)).filter(Number.isFinite)
  const requiredRows = test.min || 1

  return {
    label: values.length ? `${fmt(avg(values))}${test.unit ? ' ' + test.unit : ''}` : '-',
    average: avg(values),
    complete: values.length >= requiredRows,
    values
  }
}

// Shareable helper to determine if a test's data exists or is fully calculated
export function isTestEntered(testId, batchId, resultsMap) {
  const test = testMap[testId]
  if (!test) return false
  if (test.isCalculated) {
    if (testId === 'volume') {
      return (
        resultsMap[`${batchId}:weight`]?.length > 0 &&
        resultsMap[`${batchId}:specific_gravity`]?.length > 0
      )
    }
    return false
  }
  return resultsMap[`${batchId}:${testId}`]?.length > 0
}
