import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isLeaderLookId, type LeaderLookId } from '@/features/church/pricing'
import type { AvatarSpec } from '@/types'

// A church's leader look as its congregation and its visitors see it (0146,
// `church_leader_look`). 0136 stored the look and only ever read it back to
// the leader who chose it; this is the read the church's own surfaces use —
// the pastor's note, the live notice and the churchyard.
//
// Online-only, inherited rather than chosen: a look lives on `church_admins`,
// and a keyless LOCAL build has no church and no leadership to wear one. The
// server is public (anon + authenticated) because the yard is on the church's
// public page; with no client, or a server without 0146, every reader gets
// null and every surface draws nothing — never a placeholder figure.
//
// What comes back is one face and nothing else: the look, a delivered https
// custom url, and the leader's tone / hair / figure for the drawn fallback.
// No name, no id — the server never sends either.

export type ChurchLeaderLook = {
  look: LeaderLookId
  customArtUrl: string | null
  /** Only the three keys the figure reads; never the leader's whole character. */
  spec: AvatarSpec
}

// Three surfaces can ask about the same church on one screen (the yard and the
// notice on your church tab), so one request per church, shared.
const cache = new Map<string, Promise<ChurchLeaderLook | null>>()

async function load(churchId: string): Promise<ChurchLeaderLook | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('church_leader_look', { p_church_id: churchId })
  if (error || !data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (!isLeaderLookId(d.look)) return null
  const art = typeof d.art_url === 'string' && d.art_url.startsWith('https://') ? d.art_url : null
  const key = (v: unknown) => (typeof v === 'string' && /^[a-z]{1,16}$/.test(v) ? v : undefined)
  return {
    look: d.look,
    customArtUrl: d.look === 'custom' ? art : null,
    spec: {
      skin: key(d.skin) ?? 'sand',
      hair: key(d.hair),
      figure: d.figure === 'fem' ? 'fem' : 'masc',
      robe: 'linen',
      armor: {},
    },
  }
}

export function fetchChurchLeaderLook(churchId: string): Promise<ChurchLeaderLook | null> {
  let p = cache.get(churchId)
  if (!p) {
    // A failed read is not remembered, so the next screen asks again.
    p = load(churchId).catch(() => null)
    p.then((r) => { if (!r) cache.delete(churchId) })
    cache.set(churchId, p)
  }
  return p
}

/** Forget a church's look — the leader just changed it in "Your look". */
export function forgetChurchLeaderLook(churchId: string) {
  cache.delete(churchId)
}

/** The church's leader look, or null while loading / when there is none. */
export function useChurchLeaderLook(churchId: string | null | undefined): ChurchLeaderLook | null {
  const [look, setLook] = useState<ChurchLeaderLook | null>(null)
  useEffect(() => {
    setLook(null)
    if (!churchId) return
    let alive = true
    void fetchChurchLeaderLook(churchId).then((r) => { if (alive) setLook(r) })
    return () => { alive = false }
  }, [churchId])
  return look
}
