import type { Question } from '@/types'

// Church packages (0116, reshaped by 0119): what a VERIFIED church puts in front of
// its own members. Free discovery (the church, its page, its claim) is typed
// in `types/index.ts` and untouched.
//
// Row shapes mirror the tables; the RPC payload shapes mirror what
// `my_church_today` and `get_church_participation` return. Online-only, like
// every other church store.

/** Mirrors `floor_n` in `get_church_participation` (0119) — keep them in sync. */
export const PARTICIPATION_FLOOR = 5

/** `churches.verified` / `churches.logo_url`, public on the row. */
export interface ChurchPackageFields {
  verified: boolean
  /** https only — enforced by a check constraint. */
  logo_url: string | null
}

export type ChurchRole = 'admin' | 'member'

/**
 * `church_members` VIEW, derived from `profiles.church_id` + `church_admins`.
 * Only rows for churches the caller leads. Deliberately carries no play data.
 */
export interface ChurchMemberRow {
  user_id: string
  church_id: string
  role: ChurchRole
  joined_at: string | null
}

/**
 * `church_verses` (0119): one verse per church per day, with its own five
 * questions. RLS on with no policy — read through `get_effective_verse`
 * (members) and `church_verse_for` (leadership), written by `set_church_verse`.
 */
export interface ChurchVerseRow {
  church_id: string
  /** yyyy-mm-dd, unique per church. */
  drop_date: string
  /** Citation form, "John 3:16" / "1 John 4:19-20". */
  reference: string
  text: string
  /** Exactly five, normalised to the client `Question` shape (no `bonus`). */
  questions: Question[]
  created_by: string | null
  created_at: string
}

export interface ChurchAnnouncementRow {
  id: string
  church_id: string
  /** 1-280 chars. */
  message: string
  expires_at: string | null
  created_by: string | null
  created_at: string
}

export type ChurchAnnouncementInsert = Pick<ChurchAnnouncementRow, 'church_id' | 'message'> &
  Partial<Pick<ChurchAnnouncementRow, 'expires_at'>>

/** `my_church_today(p_local_date)` — the banner and giving link (the verse moved to `get_effective_verse`). */
export interface ChurchToday {
  church_id: string | null
  church_name?: string | null
  verified: boolean
  giving_url?: string | null
  /** Live ones only, newest first, at most five. Empty unless verified. */
  announcements: Array<Pick<ChurchAnnouncementRow, 'id' | 'message' | 'expires_at' | 'created_at'>>
}

/**
 * `get_church_participation(p_church_id, p_days, p_local_date)` — verified
 * leadership only. Every number is null when it would be under
 * PARTICIPATION_FLOOR (zero included): in a small group a total names people.
 * No per-member rows, ever.
 */
export interface ChurchParticipation {
  days: number
  from: string
  to: string
  members: number | null
  players: number | null
  plays: number | null
  avg_score: number | null
  pct_played_today: number | null
  streaks: { s1: number | null; s2_6: number | null; s7: number | null }
}

/** One row of `church_directory` (0117). Public. */
export interface ChurchDirectoryRow {
  id: string
  name: string
  city: string | null
  region: string | null
  /** The published tagline, or null. */
  tagline: string | null
  verified: boolean
  logo_url: string | null
  members: number
}

/** `church_extras(church)` (0117) — what the profile adds. Public. */
export interface ChurchExtras {
  verified: boolean
  logoUrl: string | null
  /** Only while verified. Whether a BUILD may show it: `givingLinkVisible()`. */
  givingUrl: string | null
  announcement: { id: string; message: string; createdAt: string } | null
  isMember: boolean
  isAdmin: boolean
}
