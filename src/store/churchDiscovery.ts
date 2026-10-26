import { supabase } from '@/lib/supabase'

// A church leader on their own player card (0149) — the read the card makes,
// and the one write a player can make from it.
//
// `player_card_church` answers for a leader of a VERIFIED church only (a free
// claim or an unverified church is null) with the church's id and name and the
// face its public page already shows: the building's level and skin, the
// tagline, the "This week" line. No member count, no XP, nothing ranked.
//
// "Inquire" is one short note per player per church (`send_church_join_inquiry`),
// for a signed-in player who has no church; leadership reads it on its own
// dashboard. Online-only, inherited from the church store: an inquiry needs a
// real congregation on the other end, and a guest is walled before it.

export interface CardChurch {
  id: string
  name: string
  level: number
  skin: string | null
  tagline: string | null
  thisWeek: string | null
}

/** The verified church this player leads, or null (not a leader, unverified, offline, older server). */
export async function fetchCardChurch(username: string): Promise<CardChurch | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('player_card_church', { p_username: username })
  if (error || !data) return null
  const d = data as Record<string, unknown>
  if (typeof d.church_id !== 'string' || typeof d.church_name !== 'string') return null
  return {
    id: d.church_id,
    name: d.church_name,
    level: Math.max(1, Number(d.level) || 1),
    skin: typeof d.skin === 'string' ? d.skin : null,
    tagline: typeof d.tagline === 'string' && d.tagline.trim() ? d.tagline : null,
    thisWeek: typeof d.this_week === 'string' && d.this_week.trim() ? d.this_week : null,
  }
}

export const INQUIRY_MAX = 280

export type InquiryResult = { ok: true } | { ok: false; reason: string }

export async function sendJoinInquiry(churchId: string, note: string): Promise<InquiryResult> {
  if (!supabase) return { ok: false, reason: 'unavailable' }
  const { data, error } = await supabase.rpc('send_church_join_inquiry', { p_church_id: churchId, p_note: note })
  if (error) return { ok: false, reason: 'unavailable' }
  const d = data as { ok?: boolean; reason?: string } | null
  return d?.ok ? { ok: true } : { ok: false, reason: String(d?.reason ?? 'unavailable') }
}

/** Whether this player already asked this church (one note per church, ever). */
export async function fetchMyInquiry(churchId: string): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.rpc('my_church_join_inquiry', { p_church_id: churchId })
  return !error && (data as { sent?: boolean } | null)?.sent === true
}
