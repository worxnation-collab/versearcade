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

/**
 * The signed-in user's id from the LOCAL session — no network. Reads use this
 * rather than `auth.getUser()`, which is a server round trip that every store
 * load used to sit behind (a full extra wave on a slow phone). It is not a
 * security check and nothing here treats it as one: RLS and `auth.uid()` in
 * every RPC still decide what the token may see. A stale id just reads nothing.
 */
export async function sessionUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}
