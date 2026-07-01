import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''


if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) are missing. Please configure them in your .env file.'
  )
}
if (import.meta.env.DEV && !supabaseServiceKey) {
  console.warn(
    'Supabase service role key (VITE_SUPABASE_SERVICE_ROLE_KEY) is missing. Seeding functions will fall back to anon client, which may fail due to RLS.'
  )
}

// Ensure singleton instances across Vite Hot Module Replacement (HMR) in development
const globalRef = typeof window !== 'undefined' ? window : globalThis

if (!globalRef.__supabaseClient) {
  globalRef.__supabaseClient = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder'
  )
}

if (!globalRef.__supabaseAdminClient) {
  globalRef.__supabaseAdminClient = supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: 'sb-admin-override-token'
        }
      })
    : globalRef.__supabaseClient
}

// regular client for app usage (anon key)
export const supabase = globalRef.__supabaseClient

// admin client for privileged operations (e.g., seeding, wiping data)
export const supabaseAdmin = globalRef.__supabaseAdminClient

