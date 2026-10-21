import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { todayLocalDate } from '@/lib/date'
import { fetchWeek } from '@/store/churchAdmin'
import { useJuice } from '@/juice/useJuice'

// One line on a VERIFIED church's own card, for its leadership only: how many
// of the next seven days will play the global verse because nobody set one.
//
// It is a fact about the church's SCHEDULE, never about a person — the same
// kind of number as "this church has 3 players". It renders nothing when the
// week is covered, when the read fails, and for everybody who isn't leadership
// (the caller only mounts it for `isAdmin && verified`, and `church_verse_for`
// refuses anybody else server-side anyway). Tapping it opens the planner.
//
// When today's verse is filed under a series (0123) it leads with that —
// "This week: Advent" — and stays up even once the week is covered, because
// it is the one line that tells leadership what the congregation is in.
export function WeekGapLine({ churchId }: { churchId: string }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const [unset, setUnset] = useState<number | null>(null)
  const [series, setSeries] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchWeek(churchId, todayLocalDate()).then((r) => {
      if (!alive || !r.ok) return
      setUnset(r.data.filter((w) => !w.verse).length)
      setSeries(r.data[0]?.verse?.series ?? null)
    })
    return () => { alive = false }
  }, [churchId])

  if (!unset && !series) return null
  return (
    <button
      className="pill"
      onClick={() => { juice.select?.(); navigate(`/church/${churchId}/admin`) }}
      style={{ width: '100%', marginTop: 8, fontSize: 12.5, fontWeight: 700, textAlign: 'left', whiteSpace: 'normal', lineHeight: 1.4 }}
    >
      {series && <>📖 This week: <b>{series}</b>.{unset ? ' ' : ' Plan ahead →'}</>}
      {!!unset && (series ? '' : '📅 ')}
      {!!unset && (unset === 7
        ? 'No verse is set for the next 7 days — your members get the global verse.'
        : `${unset} of the next 7 days ${unset === 1 ? 'uses' : 'use'} the global verse. Plan the week →`)}
    </button>
  )
}
