import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const schemaSql = readFileSync(resolve(root, 'schema.sql'), 'utf8')

function extractColumns(table, sql) {
  const cols = new Set()

  // Columns declared inside `create table [if not exists] <table> ( ... );`
  const createRe = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`,
    'i'
  )
  const createMatch = sql.match(createRe)
  if (createMatch) {
    for (const rawLine of createMatch[1].split('\n')) {
      const line = rawLine.replace(/--.*$/, '').trim()
      const m = line.match(/^([a-z_][a-z_0-9]*)\s+/i)
      if (m) cols.add(m[1].toLowerCase())
    }
  }

  // Columns added to an existing table via `alter table <table> add column ...`
  const alterRe = new RegExp(
    `alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:public\\.)?${table}\\s+add\\s+(?:column\\s+)?(?:if\\s+not\\s+exists\\s+)?([a-z_][a-z_0-9]*)\\s`,
    'gi'
  )
  for (const m of sql.matchAll(alterRe)) cols.add(m[1].toLowerCase())

  return cols
}

const batchColumns = extractColumns('batches', schemaSql)

// Every one of these is read or written by the app against `public.batches`.
// If a column is absent from schema.sql the Data API rejects the request with
// PGRST204 at runtime, which is exactly the bug this suite exists to prevent.
const requiredBatchColumns = [
  'id',
  'shipment_id',
  'number',
  'production_date',
  'expiration_date',
  'approved_at',
  'submitted_at',
  'retest_requested_at',
  'retest_reason',
  'units_36',
  'units_55',
  'exit_36',
  'exit_55',
  'is_manually_unlocked',
  'incubation_exited_at',
  'incubation_removed_early_at',
  'incubation_early_acknowledged_at',
  'created_at'
]

describe('Database schema contract', () => {
  describe('public.batches', () => {
    it.each(requiredBatchColumns)('declares the %s column', (column) => {
      expect(batchColumns.has(column)).toBe(true)
    })

it('declares submitted_at alongside the other batch columns', () => {
      // Regression: submitted_at was previously stranded below the RLS policy
      // block at the end of schema.sql, where applying the file skipped it.
      const lines = schemaSql.split('\n')
      const submittedAtLine = lines.findIndex(l =>
        /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?batches\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?submitted_at/i.test(l)
      )
      const batchesRlsLine = lines.findIndex(l =>
        /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?batches\s+enable\s+row\s+level\s+security/i.test(l)
      )

      expect(submittedAtLine).toBeGreaterThan(-1)
      expect(batchesRlsLine).toBeGreaterThan(-1)
      expect(submittedAtLine).toBeLessThan(batchesRlsLine)
    })
  })
})