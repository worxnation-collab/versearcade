import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured } from './config'

// If env vars are absent we return null and the whole app runs in LOCAL mode
// (progress persisted to Capacitor Preferences / localStorage). This means you
// can play the full daily loop immediately, before any backend is wired.
// A database request with no network used to take ~7s to fail: postgrest-js
// retries a GET whose fetch THREW three times, sleeping 1s, 2s and 4s, so every
// screen on a phone in airplane mode sat on its spinner before showing what the
// device already had. This answers a failed fetch to /rest/v1/ at once with a
// 599 — a status postgrest does not retry — and a body `isNetworkFailure`
// (lib/outbox.ts) recognises. A real server error (503 schema reload, 520) is
// still a real response and still retried, and auth and functions are left on
// the plain fetch: the auth client's own refresh handling is not ours to cut.
const fastFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init)
  } catch (e) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const aborted = (e as { name?: string })?.name === 'AbortError'
    if (aborted || !url.includes('/rest/v1/')) throw e
    return new Response(
      JSON.stringify({ message: 'Failed to fetch: no network', code: 'NETWORK', details: null, hint: null }),
      { status: 599, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      {
        global: { fetch: fastFetch },
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
