import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { todayLocalDate } from '@/lib/date'
import { fetchWeek } from '@/store/churchAdmin'
import { useJuice } from '@/juice/useJuice'

// The one door from the GAME into the Church Office (2026-11-12).
//
// A leader's church tab used to be the member's tab with the tools spliced in:
// a "Leadership tools" button and a "No church verse is live…" line sat inside
// the yard card between the XP bar and the landscaping shelf, so the thing a
// church pays for read as one more widget in a game. Now the church tab is
// exactly what a member sees, and this slim bar at the very top is the only
// leadership thing on it. What used to be printed here as a sentence (open
// days in the week ahead) is a single gold dot — the sentence lives on the
// Office's Home, where there is something to do about it.
//
// Leadership only (the caller mounts it for `isAdmin`); the week read is a
// verified church's and fails closed to no dot.
export function OfficeBar({ churchId, churchName, verified }: { churchId: string; churchName: string; verified: boolean }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!verified) return
    let alive = true
    fetchWeek(churchId, todayLocalDate()).then((r) => {
      if (!alive || !r.ok) return
      setOpen(r.data.some((w) => !w.verse || w.verse.status === 'draft'))
    })
    return () => { alive = false }
  }, [churchId, verified])

  return (
    <button
      type="button"
      data-office-bar
      onClick={() => { juice.select?.(); navigate(`/church/${churchId}/admin`) }}
      aria-label={`Open the Church Office for ${churchName}${open ? ' — something to plan' : ''}`}
      className="card"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px',
        textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', minWidth: 0,
        borderColor: 'var(--edge)',
      }}
    >
      <span aria-hidden style={{ fontSize: 18, flexShrink: 0 }}>🗝️</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.35 }}>
        <span className="dim">You lead {churchName}</span>
        <b style={{ display: 'block', fontSize: 14.5 }}>Open the Church Office →</b>
      </span>
      {open && (
        <span
          aria-hidden
          style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--gold)', flexShrink: 0, boxShadow: '0 0 8px rgba(255,210,63,0.6)' }}
        />
      )}
    </button>
  )
}
