import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured } from './config'

// If env vars are absent we return null and the whole app runs in LOCAL mode
// (progress persisted to Capacitor Preferences / localStorage). This means you
// can play the full daily loop immediately, before any backend is wired.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    )
  : null

export const isOnline = () => supabase !== null
