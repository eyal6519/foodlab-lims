import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const schemaPath = join(root, 'schema.sql')
const fixPath = join(root, 'supabase-security-fix.sql')
const schema = readFileSync(schemaPath, 'utf8')
const fixSql = readFileSync(fixPath, 'utf8')

const withoutComments = schema
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')

function bodyOf(name) {
  const match = withoutComments.match(
    new RegExp(
      `create(?:\\s+or\\s+replace)?\\s+function\\s+${name}\\s*\\([\\s\\S]*?returns[\\s\\S]*?(?:\\$\\$\\s*language[^;]*;|\\$body\\$[\\s\\S]*?\\$body\\$;)`,
      'i'
    )
  )
  return match ? match[0] : null
}

const definerFunctions = [
  'public\\.handle_new_user',
  'public\\.check_batch_approval_auth',
  'public\\.admin_create_user',
  'public\\.admin_delete_user',
  'public\\.is_manager',
  'public\\.get_db_size_bytes',
]

describe('Schema security hardening', () => {
  describe('SECURITY DEFINER functions pin their search_path', () => {
    it.each(definerFunctions)('%s is SECURITY DEFINER with an explicit search_path', (name) => {
      const body = bodyOf(name)
      expect(body, `definition for ${name} not found in schema.sql`).not.toBeNull()
      expect(body).toMatch(/security\s+definer/i)
      expect(body).toMatch(/set\s+search_path\s*=\s*public/i)
    })

    it('no SECURITY DEFINER function is left without a pinned search_path', () => {
      const declared = [...withoutComments.matchAll(/create(?:\s+or\s+replace)?\s+function\s+([\w.]+)/gi)].map(
        (m) => m[1].replace(/\./g, '\\.')
      )
      expect(declared.length).toBeGreaterThan(0)

      const unpinned = declared.filter((name) => {
        const body = bodyOf(name)
        if (!body || !/security\s+definer/i.test(body)) return false
        return !/set\s+search_path\s*=\s*public/i.test(body)
      })

      expect(unpinned).toEqual([])
    })

    // Regression: two functions declared `security definer` in their signature
    // and again on the closing `$$` line, which Postgres rejects with 42601
    // "conflicting or redundant options". Each option may appear only once.
    it('never declares the same option twice in one function', () => {
      const duplicated = [...withoutComments.matchAll(/create(?:\s+or\s+replace)?\s+function\s+([\w.]+)/gi)]
        .map((m) => m[1])
        .filter((name) => {
          const body = bodyOf(name)
          if (!body) return false
          return (body.match(/security\s+definer/gi) || []).length > 1
        })

      expect(duplicated).toEqual([])
    })
  })

  describe('EXECUTE privileges', () => {
    const anonRevoked = [
      'public\\.handle_new_user\\(\\)',
      'public\\.check_batch_approval_auth\\(\\)',
      'public\\.admin_create_user\\(text, text, text, text\\)',
      'public\\.admin_delete_user\\(uuid\\)',
      'public\\.get_db_size_bytes\\(\\)',
      'public\\.is_manager\\(\\)',
    ]

    it.each(anonRevoked)('anon cannot EXECUTE %s', (signature) => {
      const pattern = new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+${signature}\\s+from\\s+anon`, 'i')
      expect(withoutComments).toMatch(pattern)
    })

    it('trigger functions are not callable over the API by signed-in users', () => {
      expect(withoutComments).toMatch(
        /revoke\s+execute\s+on\s+function\s+public\.handle_new_user\(\)\s+from\s+authenticated/i
      )
      expect(withoutComments).toMatch(
        /revoke\s+execute\s+on\s+function\s+public\.check_batch_approval_auth\(\)\s+from\s+authenticated/i
      )
    })

    const granted = [
      'public\\.admin_create_user\\(text, text, text, text\\)',
      'public\\.admin_delete_user\\(uuid\\)',
      'public\\.get_db_size_bytes\\(\\)',
      'public\\.is_manager\\(\\)',
    ]

    it.each(granted)('authenticated retains EXECUTE on %s', (signature) => {
      const pattern = new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${signature}\\s+to\\s+authenticated`, 'i')
      expect(withoutComments).toMatch(pattern)
    })
  })

  describe('admin_create_user access control', () => {
    const body = bodyOf('public\\.admin_create_user')

    it('does not skip authorization when the profiles table is empty', () => {
      expect(body).not.toMatch(/if\s+exists\s*\(\s*select\s+1\s+from\s+public\.profiles\s*\)\s+then/i)
    })

    it('gates on the service role rather than on table emptiness', () => {
      expect(body).toMatch(/auth\.role\(\)\s*<>\s*'service_role'/i)
    })

    it('still requires a manager role for non-service-role callers', () => {
      expect(body).toMatch(/role\s*=\s*'manager'/i)
    })
  })

  describe('stale overload cleanup', () => {
    it('drops the legacy 3-argument admin_create_user', () => {
      expect(withoutComments).toMatch(
        /drop\s+function\s+if\s+exists\s+public\.admin_create_user\(text,\s*text,\s*text\)/i
      )
    })
  })

  describe('script is re-runnable', () => {
    // Regression: applying schema.sql to a database that already had policies
    // failed with 42710 "policy already exists". Several create policy blocks
    // dropped a differently-named legacy policy but not the one being created.
    const created = [...withoutComments.matchAll(/create\s+policy\s+"([^"]+)"/gi)].map((m) => m[1])
    const dropped = new Set(
      [...withoutComments.matchAll(/drop\s+policy\s+if\s+exists\s+"([^"]+)"/gi)].map((m) => m[1])
    )

    it('finds policies to create', () => {
      expect(created.length).toBeGreaterThan(0)
    })

    it.each(created)('drops "%s" before creating it', (policyName) => {
      expect(dropped.has(policyName)).toBe(true)
    })
  })

  describe('supabase-security-fix.sql (live DB apply script)', () => {
    it('pins search_path via ALTER FUNCTION for every hardening target', () => {
      expect(fixSql).toMatch(/alter\s+function\s+%s\s+set\s+search_path\s*=\s*public,\s*extensions/i)
      for (const def of [
        'public.handle_new_user()',
        'public.check_batch_approval_auth()',
        'public.admin_create_user(text, text, text, text)',
        'public.admin_delete_user(uuid)',
        'public.get_db_size_bytes()',
        'public.is_manager()'
      ]) {
        expect(fixSql).toMatch(new RegExp(def.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      }
    })

    it('revokes anon EXECUTE from every non-trigger SECURITY DEFINER function', () => {
      for (const sig of [
        'public.admin_create_user(text, text, text, text)',
        'public.admin_delete_user(uuid)',
        'public.get_db_size_bytes()',
        'public.is_manager()'
      ]) {
        const pattern = new RegExp(
          `revoke\\s+execute\\s+on\\s+function\\s+${sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+from\\s+anon`,
          'i'
        )
        expect(fixSql).toMatch(pattern)
      }
    })

    // In Supabase the grants live on the PUBLIC pseudo-role; only a REVOKE
    // from PUBLIC actually clears the advisor's anon check. Regression guard
    // for the first run that revoked only `anon` and left all rows standing.
    it('revokes PUBLIC EXECUTE from every SECURITY DEFINER function', () => {
      for (const sig of [
        'public.handle_new_user()',
        'public.check_batch_approval_auth()',
        'public.admin_create_user(text, text, text, text)',
        'public.admin_delete_user(uuid)',
        'public.get_db_size_bytes()',
        'public.is_manager()'
      ]) {
        const pattern = new RegExp(
          `revoke\\s+execute\\s+on\\s+function\\s+${sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+from\\s+public`,
          'i'
        )
        expect(fixSql).toMatch(pattern)
      }
    })

    it('drops the stale 3-argument overload', () => {
      expect(fixSql).toMatch(
        /drop\s+function\s+if\s+exists\s+public\.admin_create_user\(text,\s*text,\s*text\)/i
      )
    })

    it('the apply script mirrors the grants in schema.sql', () => {
      const grantsInSchema = [...schema.matchAll(/grant\s+execute\s+on\s+function\s+([\s\S]*?)\s+to\s+authenticated/gi)]
        .map((m) => m[1].replace(/\s+/g, ' ').trim())
      for (const grant of grantsInSchema) {
        const pattern = new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+${grant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+to\\s+authenticated`,
          'i'
        )
        expect(fixSql, `apply script should grant authenticated on ${grant}`).toMatch(pattern)
      }
    })
  })
})