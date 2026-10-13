// Church packages (migration 0116): what a VERIFIED church puts in front of
// its own members. Free discovery (the church, its page, its claim) is typed
// in `types/index.ts` and untouched.
//
// Row shapes mirror the tables; the RPC payload shapes mirror what
// `my_church_today` and `church_participation_7d` return. Online-only, like
// every other church store.

/** Mirrors `floor_n` in `church_participation_7d` — keep them in sync. */
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

export interface ChurchVerseRow {
  id: string
  church_id: string
  /** Citation form, "John 3:16" / "1 John 4:19-20". */
  verse_reference: string
  verse_text: string
  pastor_note: string | null
  /** yyyy-mm-dd */
  starts_on: string
  ends_on: string | null
  created_by: string | null
  created_at: string
}

/** What a church admin sends; the rest is defaulted server-side. */
export type ChurchVerseInsert = Pick<ChurchVerseRow, 'church_id' | 'verse_reference' | 'verse_text' | 'starts_on'> &
  Partial<Pick<ChurchVerseRow, 'pastor_note' | 'ends_on'>>

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

/** `my_church_today(p_local_date)` */
export interface ChurchToday {
  church_id: string | null
  church_name?: string | null
  verified: boolean
  giving_url?: string | null
  /** Null unless the church is verified and a verse covers the date. */
  verse: {
    id: string
    reference: string
    text: string
    pastor_note: string | null
    starts_on: string
    ends_on: string | null
  } | null
  /** Live ones only, newest first, at most five. Empty unless verified. */
  announcements: Array<Pick<ChurchAnnouncementRow, 'id' | 'message' | 'expires_at' | 'created_at'>>
}

/**
 * `church_participation_7d(p_church_id, p_local_date)` — leadership only.
 * Below PARTICIPATION_FLOOR distinct players the counts are null and
 * `floored` is true: a small church's totals would name people.
 */
export type ChurchParticipation =
  | { ok: false; reason: 'not_leadership' }
  | {
      ok: true
      from: string
      to: string
      members: number
      active_players: number | null
      completions: number | null
      floored: boolean
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
