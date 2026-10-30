import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { useJuice } from '@/juice/useJuice'
import { useChurchVerse, fetchChurchFeed, fetchChurchWeek, type ChurchWeek, type FeedEvent } from '@/store/churchVerse'
import { SeriesTrail } from './SeriesTrail'
import { ChurchAssetCard } from './ChurchAssetCard'
import { useMyChurchAssets } from '@/store/churchAssets'
import type { ChurchExtras } from '@/types/churchPackages'
import type { Church } from '@/types'
import { LeaderBeside } from './LeaderBeside'
import { MyGroupCard } from './MyGroupCard'
import { tickAutopilot } from './admin/autopilot'

// The member's church, as a PLACE PEOPLE ARE (0128) — the top of the Church tab
// for a member of a VERIFIED church, between the churchyard and Give:
//
//   1. The leader's live announcement. (A "You're in {name}" card used to lead
//      here; the yard directly above already names the church and its head
//      count, so it said the same thing twice and was cut.)
//   3. Today's church verse, with its series drawn as the run of days it is
//      (`SeriesTrail`, 0130) — its own lane, played at /play/church, never in
//      place of the daily drop. On a day with no church verse the series still
//      shows, so a series reads as one connected thing rather than as drops.
//   3a. "You lead a small group" (0151, `MyGroupCard`) — only for a group
//       leader: their group's names and the week's discussion questions.
//   3b. "This week in {name}" (0130): church TOTALS for the board's week —
//      how many played the church verse and the daily verse. Under five comes
//      back null, and a card with nothing past that is not drawn at all.
//   4. What the congregation has been doing (`church_feed`): who played the
//      drop or the church verse and how they scored, who gave, who joined,
//      what leadership posted. Scores are shown — the owner's call.
//
// A "Compete" card closed this column (links to the board below, the Battle
// tab and worldwide ranks); all three were one scroll or one tab away, so it
// was cut — a member's reason to open this tab is the church, not a menu.

// An unverified church gets none of this and the tab reads exactly as before:
// the richer layer is the verified one, like every church package feature.
export function ChurchLife({ church, extras }: { church: Church; extras: ChurchExtras | null }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const verse = useChurchVerse((s) => s.today)
  const series = useChurchVerse((s) => s.series)
  // Approved graphics (0133). The server returns only approved, fresh cards for
  // today's approved verse, its series and the live notice, so nothing is
  // filtered here — an empty list is the ordinary case.
  const cards = useMyChurchAssets((s) => s.assets)
  const loadCards = useMyChurchAssets((s) => s.load)
  const loadVerse = useChurchVerse((s) => s.load)
  const [feed, setFeed] = useState<FeedEvent[] | null>(null)
  const [more, setMore] = useState(false)
  const [week, setWeek] = useState<ChurchWeek | null>(null)

  const verified = !!extras?.verified

  // Autopilot (0152) has no cron: a leader opening their church tab is one of
  // the visits that notices a passed cutoff. The server decides everything —
  // a church without the package, or before the cutoff, changes nothing.
  useEffect(() => {
    if (verified && extras?.isAdmin) tickAutopilot(church.id)
  }, [verified, extras?.isAdmin, church.id])

  useEffect(() => {
    if (!verified) return
    void loadVerse()
    void loadCards()
    let alive = true
    fetchChurchFeed(church.id, 40).then((f) => { if (alive) setFeed(f) })
    fetchChurchWeek(church.id).then((w) => { if (alive) setWeek(w) })
    return () => { alive = false }
  }, [verified, church.id, loadVerse, loadCards])

  if (!verified) return null

  const go = (to: string) => { juice.select?.(); navigate(to) }
  const shown = feed ? (more ? feed : feed.slice(0, 6)) : null
  const p = verse?.progress
  const verseCard = cards.find((c) => c.kind === 'verse_card') ?? null
  const seriesCard = cards.find((c) => c.kind === 'series_header') ?? null
  // A notice card stands in for the notice only while it is the SAME notice.
  const noticeCard = cards.find((c) => c.kind === 'announcement') ?? null
  // The series is the member's church's; a stale one from another church
  // (switched churches this session) is not drawn.
  const arc = series && series.churchId === church.id ? series : null

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {/* The live notice, with the church's leader standing beside it when
          leadership has chosen a look (0146) — the words alone otherwise. */}
      {extras?.announcement && noticeCard && (
        <div className="card" style={{ padding: 8 }}>
          {/* The card carries its own "From {church}" and "Posted {date}". */}
          <LeaderBeside churchId={church.id} size={40} align="flex-end">
            <ChurchAssetCard kind="announcement" templateId={noticeCard.templateId} payload={noticeCard.payload} />
          </LeaderBeside>
        </div>
      )}
      {extras?.announcement && !noticeCard && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <LeaderBeside churchId={church.id} size={40}>
            <Eyebrow>From {church.name}</Eyebrow>
            <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.45, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
              {extras.announcement.message}
            </p>
            <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>{ago(extras.announcement.createdAt)}</div>
          </LeaderBeside>
        </div>
      )}

      {verse && (
        <button
          className="card"
          onClick={() => go('/play/church')}
          style={{ padding: '12px 14px', textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer', width: '100%' }}
        >
          {seriesCard && (
            <div style={{ marginBottom: 10 }}>
              <ChurchAssetCard kind="series_header" templateId={seriesCard.templateId} payload={seriesCard.payload} />
            </div>
          )}
          {verseCard && (
            <div style={{ marginBottom: 10, maxWidth: 320 }}>
              <ChurchAssetCard kind="verse_card" templateId={verseCard.templateId} payload={verseCard.payload} />
            </div>
          )}
          <Eyebrow>Today’s church verse{verse.series && !arc ? ` · ${verse.series}` : ''}</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <b style={{ flex: 1, minWidth: 0, fontSize: 16 }}>{verse.reference}</b>
            <span style={{ fontSize: 13, fontWeight: 800, color: verse.played ? 'var(--mint)' : 'var(--gold)', flexShrink: 0 }}>
              {verse.played ? `${verse.played.correct}/${verse.played.total} ✓` : 'Play →'}
            </span>
          </div>
          {arc ? (
            <div style={{ marginTop: 10 }}><SeriesTrail series={arc} /></div>
          ) : p && p.total > 0 ? (
            <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>
              Day {p.soFar} of {p.total} · you’ve played {p.played}
            </div>
          ) : null}
        </button>
      )}

      {!verse && arc && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <Eyebrow>Your church’s series</Eyebrow>
          <div style={{ marginTop: 8 }}><SeriesTrail series={arc} /></div>
          <button
            onClick={() => go('/play')}
            className="faint"
            style={{ margin: '8px 0 0', padding: 0, fontSize: 12, textAlign: 'left', cursor: 'pointer', textDecoration: 'underline' }}
          >
            No church verse today — today’s verse is on the Play tab.
          </button>
        </div>
      )}

      {/* A group leader's own group and the week's discussion questions (0151); nothing for anybody else. */}
      <MyGroupCard churchId={church.id} />

      {week && <WeekCard name={church.name} week={week} />}

      <div className="card" style={{ padding: '12px 14px' }}>
        <Eyebrow>What your church has been up to</Eyebrow>
        {!shown && <div className="skeleton" style={{ height: 90, borderRadius: 12, marginTop: 8 }} />}
        {shown && shown.length === 0 && (
          <p className="dim" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
            Quiet so far. Play today’s verse and you’ll be the first thing here.
          </p>
        )}
        {shown && shown.length > 0 && (
          <div style={{ display: 'grid', gap: 2, marginTop: 6 }}>
            {shown.map((e, i) => <FeedRow key={`${e.kind}-${e.at}-${i}`} e={e} />)}
          </div>
        )}
        {feed && feed.length > 6 && (
          <button
            onClick={() => setMore((m) => !m)}
            style={{ marginTop: 6, padding: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-dim)', cursor: 'pointer' }}
          >
            {more ? 'Show less' : `Show all ${feed.length}`}
          </button>
        )}
      </div>

    </div>
  )
}

// Church totals for the week, nothing per person. A count under the floor is
// null and simply not drawn — "2 of you played" in a congregation of six points
// at two people. With nothing to show past the head count it says one warm line.
function WeekCard({ name, week }: { name: string; week: ChurchWeek }) {
  // The head count is already on the yard above, so it is not a tile here; a
  // card whose only tile would be that number is not drawn at all. Every
  // congregation under five players is in that state, so it is the usual one.
  const tiles: { value: string; label: string }[] = []
  if (week.verseDays > 0) tiles.push({ value: String(week.verseDays), label: week.verseDays === 1 ? 'church verse day' : 'church verse days' })
  if (week.versePlayers != null) tiles.push({ value: week.versePlayers.toLocaleString(), label: 'played the church verse' })
  if (week.dropPlayers != null) tiles.push({ value: week.dropPlayers.toLocaleString(), label: 'played the daily verse' })
  if (week.versePlayers == null && week.dropPlayers == null) return null
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <Eyebrow>This week in {name}</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(tiles.length, 4)}, minmax(0, 1fr))`, gap: 8, marginTop: 8 }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1.1 }}>{t.value}</div>
            <div className="faint" style={{ fontSize: 11, lineHeight: 1.3 }}>{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FeedRow({ e }: { e: FeedEvent }) {
  const who = e.username ?? 'Someone'
  let what: string
  switch (e.kind) {
    case 'church_verse':
      what = `played the church verse${e.detail ? ` (${e.detail})` : ''} — ${e.correct}/${e.total}, ${(e.score ?? 0).toLocaleString()} pts`
      break
    case 'drop':
      what = `played today’s drop — ${e.correct}/${e.total}, ${(e.score ?? 0).toLocaleString()} pts`
      break
    case 'gave':
      what = `gave ${(e.points ?? 0).toLocaleString()} to the church`
      break
    case 'joined':
      what = 'joined the church'
      break
    case 'notice':
      what = `posted: “${e.detail ?? ''}”`
      break
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid var(--stroke)', minWidth: 0 }}>
      <Avatar emoji={e.avatarEmoji ?? '🙂'} character={e.avatarCharacter ?? undefined} username={e.username ?? undefined} size={30} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
        <b>{who}</b> {what}
      </span>
      <span className="faint" style={{ fontSize: 11, flexShrink: 0 }}>{ago(e.at)}</span>
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="faint" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

export function ago(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const m = Math.max(0, Math.round((Date.now() - t) / 60_000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  return `${d}d`
}
