import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''
console.log('Supabase config at runtime:', { supabaseUrl, supabaseAnonKey, supabaseServiceKey });

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) are missing. Please configure them in your .env file.'
  )
}
if (!supabaseServiceKey) {
  console.warn(
    'Supabase service role key (VITE_SUPABASE_SERVICE_ROLE_KEY) is missing. Seeding functions will fall back to anon client, which may fail due to RLS.'
  )
}

// regular client for app usage (anon key)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

// admin client for privileged operations (e.g., seeding, wiping data)
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase // fallback to anon client if service key not provided
