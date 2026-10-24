import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { addDays } from '@/lib/date'
import { parseReference } from '@/lib/bibleProgress'
import {
  cleanLine,
  fetchDays,
  flaggedCount,
  GUIDANCE_MAX,
  resolvePassage,
  SCRIPTURE_CHARS_MAX,
  scriptureChars,
  SERIES_MAX,
  WEEK_DAYS_MAX,
  WEEK_DAYS_MIN,
  WEEK_PASSAGES_MAX,
  type VerseBackend,
  type WeekDay,
} from '@/store/churchAdmin'
import { AllowanceLine, ENGINE_REASONS, outcomeText, recoverLanded } from './weekRun'
import { TranscriptMeter, transcriptNote } from './transcript'

// "Draft a week from a sermon" — the Content Generation package's week (0129).
//
// One sermon (pasted transcript or notes), a series name and the passage(s) it
// preached → two to seven DRAFT days, one per date, each with its own verse
// focus inside those passages, five questions and a note. Nothing is live:
// every day is saved as a draft by the function and waits in `DraftReview` below the
// strip, where it is opened, edited, approved or discarded — one at a time or
// as the set.
//
// Rendered only when the backend carries `draftWeek` (the add-on). Three things
// it does before spending anything:
//   * It PLANS the dates first and says them out loud: the next N days from the
//     start that hold no live verse. A live day is never touched — it's skipped
//     and named — and an older draft on a planned day is replaced, also named.
//   * It fetches the scripture itself (`resolvePassage`), so the words on each
//     day are the Bible's and never the model's.
//   * It states the cost: one of the church's daily drafts per day, with what
//     is left once the engine has said (`AllowanceLine`).
// Since 0142 the FUNCTION saves the days, each on its planned date, and says
// which landed; this panel only re-reads. If no answer comes back at all, it
// looks at the planned dates before calling the run a failure (`recoverLanded`).

const REASONS: Record<string, string> = {
  ...ENGINE_REASONS,
  no_addon: 'Drafting a week is part of the Content Generation package, which this church doesn’t have.',
  not_verified: 'This isn’t available for your church right now.',
  not_leadership: 'Only this church’s leadership can draft.',
  needs_series: 'Give the week a series name.',
  needs_notes: 'Paste your sermon notes or a transcript, or at least a line on what to focus on.',
  bad_days: `Pick ${WEEK_DAYS_MIN} to ${WEEK_DAYS_MAX} days.`,
  bad_passages: 'One of those passages couldn’t be used — keep each inside one chapter, 40 verses at most.',
  bad_reference: 'That reference doesn’t look right — try “John 15:1-11” or “Psalm 23:1-6”.',
  passage_too_long: 'Keep each passage to 40 verses or fewer.',
  passage_unavailable: 'Couldn’t fetch the words of that passage — check your connection and try again.',
  draft_failed: 'Couldn’t draft a usable week from that — try again, or adjust the passages.',
  unavailable: 'Drafting isn’t available just now — check your connection and try again.',
}

interface Plan {
  dates: string[]
  /** Live days in the way, left alone. */
  skipped: string[]
  /** Planned days that already hold a draft, which this replaces. */
  replaces: string[]
}

export function WeekDraftPanel({
  churchId,
  backend,
  today,
  defaultSeries,
  onDrafted,
}: {
  churchId: string
  backend: VerseBackend
  today: string
  defaultSeries?: string
  /** After drafts were saved — reload the strip and open the first one. */
  onDrafted: (dates: string[]) => void
}) {
  const juice = useJuice()
  const [open, setOpen] = useState(false)
  const [series, setSeries] = useState(defaultSeries ?? '')
  const [refs, setRefs] = useState<string[]>([''])
  const [days, setDays] = useState(5)
  const [start, setStart] = useState(addDays(today, 1))
  const [transcript, setTranscript] = useState('')
  const [guidance, setGuidance] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [planErr, setPlanErr] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'fetching' | 'drafting' | 'checking'>('idle')
  // What the planned dates held before the run, for the no-reply recovery.
  const [before, setBefore] = useState<WeekDay[]>([])
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Plan the dates whenever the start or the length changes.
  useEffect(() => {
    if (!open) return
    let alive = true
    setPlan(null)
    setPlanErr(false)
    fetchDays(churchId, start, 42, backend).then((r) => {
      if (!alive) return
      if (!r.ok) return setPlanErr(true)
      setPlan(planDates(r.data, days))
      setBefore(r.data)
    })
    return () => { alive = false }
  }, [open, churchId, start, days, backend])

  const parsed = useMemo(() => refs.map((r) => (r.trim() ? parseReference(r.trim()) : null)), [refs])
  const refsOk = refs.some((r) => r.trim()) && refs.every((r, i) => !r.trim() || !!parsed[i])
  const notesOk = !!transcript.trim() || !!guidance.trim()
  const ready = !!cleanLine(series, SERIES_MAX) && refsOk && notesOk && !!plan && plan.dates.length === days && phase === 'idle'

  const run = async () => {
    if (!backend.draftWeek || !plan || !ready) return
    setMsg(null)
    setPhase('fetching')
    const wanted = refs.map((r) => r.trim()).filter(Boolean)
    const resolved = await Promise.all(wanted.map((r) => resolvePassage(r)))
    const bad = resolved.findIndex((r) => !r.ok)
    if (bad >= 0) {
      setPhase('idle')
      const r = resolved[bad] as { ok: false; reason: string }
      return setMsg({ ok: false, text: `${wanted[bad]}: ${REASONS[r.reason] ?? REASONS.unavailable}` })
    }
    const passages = resolved.map((r) => (r as { ok: true; data: { reference: string; verses: { n: number; text: string }[] } }).data)
    if (scriptureChars(passages) > SCRIPTURE_CHARS_MAX) {
      setPhase('idle')
      return setMsg({ ok: false, text: 'Those passages are longer than a week can draft from — trim them to the verses the sermon dwelt on.' })
    }

    // The function drafts AND saves, each day on its own planned date (0142).
    setPhase('drafting')
    const dates = plan.dates
    const r = await backend.draftWeek(churchId, { series, days, passages, transcript, guidance, dates })
    let saved: string[], refused: { date: string; reason: string }[] = [], missing: string[] = []
    let told = ''
    if (r.ok) {
      ;({ saved, refused, missing } = r.data)
      told = transcriptNote(transcript, r.data.transcriptUse, r.data.transcriptRead)
    } else if (r.reason === 'no_reply') {
      // No answer is not a failure yet: the drafts may have landed anyway.
      setPhase('checking')
      saved = await recoverLanded(churchId, backend, before, dates, () => mounted.current)
      if (!mounted.current) return
      if (!saved.length) { setPhase('idle'); return setMsg({ ok: false, text: REASONS.no_reply }) }
    } else {
      setPhase('idle')
      return setMsg({ ok: false, text: REASONS[r.reason] ?? REASONS.unavailable })
    }
    setPhase('idle')
    juice.select?.()
    setMsg({ ok: true, text: outcomeText(`Drafted “${cleanLine(series, SERIES_MAX)}”:`, saved, refused, missing) + told })
    setOpen(false)
    onDrafted(saved)
  }

  if (!backend.draftWeek) return null

  if (!open) {
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <button
          className="pill"
          onClick={() => { setOpen(true); setMsg(null) }}
          style={{ justifySelf: 'start', fontSize: 12.5, fontWeight: 800 }}
        >
          ✨ Draft a week from a sermon
        </button>
        {msg && <p style={{ margin: 0, fontSize: 12.5, color: msg.ok ? 'var(--mint)' : 'var(--coral)' }}>{msg.text}</p>}
      </div>
    )
  }

  const busy = phase !== 'idle'
  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 10, background: 'var(--card-raised)' }} aria-label="Draft a week from a sermon">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ flex: 1, fontSize: 14 }}>✨ Draft a week from a sermon</b>
        <button className="pill" onClick={() => setOpen(false)} disabled={busy} aria-label="Close">✕</button>
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
        Each day gets its own verse from the passages you name, five questions and a note — all saved as drafts your
        members can’t see until you approve them.
      </p>

      <label style={labelStyle}>
        Series name
        <input value={series} onChange={(e) => setSeries(e.target.value)} maxLength={SERIES_MAX} placeholder="Abiding (John 15)" autoCapitalize="words" />
      </label>

      <div style={{ display: 'grid', gap: 6 }}>
        <span style={labelStyle as React.CSSProperties}>The passage{refs.length > 1 ? 's' : ''} you preached</span>
        {refs.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={r}
              onChange={(e) => setRefs((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={i === 0 ? 'John 15:1-11' : 'Another passage (optional)'}
              autoCapitalize="words"
              autoCorrect="off"
              maxLength={40}
              aria-label={`Passage ${i + 1}`}
              style={{ flex: 1, minWidth: 0, borderColor: r.trim() && !parsed[i] ? 'var(--coral)' : undefined }}
            />
            {refs.length > 1 && (
              <button className="pill" onClick={() => setRefs((all) => all.filter((_, j) => j !== i))} aria-label={`Remove passage ${i + 1}`}>✕</button>
            )}
          </div>
        ))}
        {refs.length < WEEK_PASSAGES_MAX && (
          <button className="faint" onClick={() => setRefs((all) => [...all, ''])} style={{ justifySelf: 'start', padding: 0, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)', cursor: 'pointer' }}>
            + Add a passage
          </button>
        )}
        <span className="faint" style={{ fontSize: 11.5 }}>Each inside one chapter, up to 40 verses. The words come from the Berean Standard Bible.</span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ ...labelStyle, flex: '1 1 140px' }}>
          Starting
          <input type="date" value={start} min={today} max={addDays(today, 300)} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </label>
        <label style={{ ...labelStyle, flex: '1 1 100px' }}>
          Days
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {Array.from({ length: WEEK_DAYS_MAX - WEEK_DAYS_MIN + 1 }, (_, i) => WEEK_DAYS_MIN + i).map((n) => (
              <option key={n} value={n}>{n} days</option>
            ))}
          </select>
        </label>
      </div>

      <label style={labelStyle}>
        Sermon notes or a voice-memo transcript
        <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={6} placeholder="Paste the sermon, your notes, or the transcript of a voice memo…" style={{ resize: 'vertical' }} />
      </label>
      <TranscriptMeter value={transcript} />
      <label style={labelStyle}>
        What to focus on (optional)
        <input value={guidance} onChange={(e) => setGuidance(e.target.value)} maxLength={GUIDANCE_MAX} placeholder="Staying connected when life is busy" />
      </label>

      <PlanLine plan={plan} error={planErr} days={days} />

      {msg && <p style={{ margin: 0, fontSize: 12.5, color: msg.ok ? 'var(--mint)' : 'var(--coral)' }}>{msg.text}</p>}
      <Button variant="gold" full disabled={!ready} onClick={run}>
        {phase === 'fetching' ? 'Reading the passages…' : phase === 'drafting' ? `Drafting ${days} days — about a minute…` : phase === 'checking' ? 'Lost the connection — checking whether the drafts landed…' : `Draft ${days} days`}
      </Button>
      <span className="faint" style={{ fontSize: 11.5, marginTop: -4, lineHeight: 1.4 }}>
        {!notesOk ? 'Paste your notes or a focus line first. ' : ''}<AllowanceLine churchId={churchId} units={days} />
      </span>
    </div>
  )
}

function PlanLine({ plan, error, days }: { plan: Plan | null; error: boolean; days: number }) {
  if (error) return <p style={{ margin: 0, fontSize: 12, color: 'var(--coral)' }}>Couldn’t check the schedule — try again in a moment.</p>
  if (!plan) return <p className="faint" style={{ margin: 0, fontSize: 12 }}>Checking the schedule…</p>
  if (plan.dates.length < days) return <p style={{ margin: 0, fontSize: 12, color: 'var(--coral)' }}>There aren’t {days} open days in the next six weeks from that start.</p>
  return (
    <div style={{ fontSize: 12, lineHeight: 1.5 }}>
      <div>
        <b>Drafts go on</b> <span className="dim">{plan.dates.map(pretty).join(', ')}</span>
      </div>
      {plan.skipped.length > 0 && (
        <div className="dim">Left alone (already live): {plan.skipped.map(pretty).join(', ')}</div>
      )}
      {plan.replaces.length > 0 && (
        <div className="dim">Replaces an older draft on {plan.replaces.map(pretty).join(', ')}</div>
      )}
    </div>
  )
}

/** The next `n` dates with no LIVE verse; live ones are skipped, drafts are replaced. */
export function planDates(window: WeekDay[], n: number): Plan {
  const dates: string[] = []
  const skipped: string[] = []
  const replaces: string[] = []
  for (const w of window) {
    if (dates.length === n) break
    if (w.verse && w.verse.status !== 'draft') { skipped.push(w.date); continue }
    if (w.verse?.status === 'draft') replaces.push(w.date)
    dates.push(w.date)
  }
  return { dates, skipped, replaces }
}

// ---------------------------------------------------------------------------
// The drafts in the planner's window, by series — open one, or approve or
// discard the set. Base tier: a church whose add-on lapsed still reviews what
// it made. Approving the set approves exactly the dates listed here.
// ---------------------------------------------------------------------------
export function DraftReview({
  churchId,
  backend,
  week,
  selected,
  onOpen,
  onChanged,
}: {
  churchId: string
  backend: VerseBackend
  week: WeekDay[] | null
  selected: string
  onOpen: (date: string) => void
  onChanged: () => void
}) {
  const juice = useJuice()
  const [note, setNote] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const groups = useMemo(() => {
    const m = new Map<string, WeekDay[]>()
    for (const w of week ?? []) {
      if (w.verse?.status !== 'draft') continue
      const k = w.verse.series ?? ''
      m.set(k, [...(m.get(k) ?? []), w])
    }
    return [...m.entries()]
  }, [week])

  if (!backend.approveMany) return null
  if (!groups.length) return note ? <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mint)' }}>{note}</p> : null

  const approveAll = async (key: string, days: WeekDay[]) => {
    const id = `ok:${key}`
    if (armed !== id) { setArmed(id); return }
    setArmed(null)
    setBusy(id)
    setErr(null)
    const r = await backend.approveMany!(churchId, days.map((d) => d.date))
    setBusy(null)
    if (!r.ok) return setErr('Those didn’t approve — check your connection and try again.')
    juice.select?.()
    const n = r.data.approved.length
    // The server skips a day that still carries a ⚠ (0143), whatever this list showed.
    const held = r.data.flagged ?? []
    onChanged()
    setNote(
      `Approved ${n} day${n === 1 ? '' : 's'}${key ? ` of “${key}”` : ''}. ${n ? 'Each goes to your members on its day, beside the everyday verse.' : ''}` +
      (held.length ? ` ${held.map(weekday).join(', ')} still ${held.length === 1 ? 'has' : 'have'} a ⚠ to check and ${held.length === 1 ? 'was' : 'were'} left as a draft.` : ''),
    )
  }

  const discardAll = async (key: string, days: WeekDay[]) => {
    if (!backend.discard) return
    const id = `x:${key}`
    if (armed !== id) { setArmed(id); return }
    setArmed(null)
    setBusy(id)
    setErr(null)
    let n = 0
    for (const d of days) if ((await backend.discard(churchId, d.date)).ok) n++
    setBusy(null)
    onChanged()
    setNote(`Discarded ${n} draft${n === 1 ? '' : 's'}${key ? ` of “${key}”` : ''}. Those days are empty again.`)
  }

  // Reorder: two drafts trade dates by trading content, both saved as drafts
  // again. If the second write fails the first is put back, so a failed swap
  // never leaves one verse on two days. Needs the add-on (`saveDraft`).
  const swap = async (a: WeekDay, b: WeekDay) => {
    if (!backend.saveDraft || !a.verse || !b.verse) return
    const body = (v: NonNullable<WeekDay['verse']>) => ({ reference: v.reference, text: v.text, questions: v.questions, series: v.series ?? '', note: v.note ?? '' })
    setBusy(`swap:${a.date}`)
    setErr(null)
    setArmed(null)
    const first = await backend.saveDraft(churchId, a.date, body(b.verse), false)
    const second = first.ok ? await backend.saveDraft(churchId, b.date, body(a.verse), false) : first
    if (first.ok && !second.ok) await backend.saveDraft(churchId, a.date, body(a.verse), false)
    setBusy(null)
    if (!first.ok || !second.ok) return setErr('Those two days didn’t swap — check your connection and try again.')
    juice.select?.()
    onChanged()
  }

  const discardOne = async (d: WeekDay) => {
    if (!backend.discard) return
    const id = `one:${d.date}`
    if (armed !== id) { setArmed(id); return }
    setArmed(null)
    setBusy(id)
    setErr(null)
    const r = await backend.discard(churchId, d.date)
    setBusy(null)
    if (!r.ok) return setErr('That draft didn’t discard — check your connection and try again.')
    onChanged()
    setNote(`Discarded the draft for ${weekday(d.date)}. That day is empty again.`)
  }

  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 10, background: 'var(--card-raised)', borderStyle: 'dashed', borderColor: 'var(--edge)' }} aria-label="Drafts waiting for approval">
      <b style={{ fontSize: 13 }}>✎ Waiting for your approval</b>
      {groups.map(([key, days]) => (
        <div key={key || '—'} style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, overflowWrap: 'anywhere' }}>{key || 'No series'}</span>
          {days.map((d, i) => (
            <div
              key={d.date}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 4, alignItems: 'center',
                borderRadius: 10, background: d.date === selected ? 'var(--select)' : 'transparent',
              }}
            >
              <button
                onClick={() => onOpen(d.date)}
                aria-pressed={d.date === selected}
                style={{
                  display: 'grid', gridTemplateColumns: '72px minmax(0,1fr)', gap: 8, alignItems: 'baseline', minWidth: 0,
                  textAlign: 'left', padding: '6px 8px', borderRadius: 10, cursor: 'pointer', color: 'inherit', font: 'inherit',
                  background: 'transparent',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700 }}>{weekday(d.date)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{d.verse!.reference}</span>
                  {d.verse!.generated && <span className="dim" style={{ fontSize: 11 }}> · ✨ suggested</span>}
                  {flaggedCount(d.verse!.questions) > 0 && (
                    <span title="The draft answer may not match the passage. Please check." style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--gold)' }}>
                      {' '}· ⚠ {flaggedCount(d.verse!.questions)} to check
                    </span>
                  )}
                  {d.verse!.note && (
                    <span className="dim" style={{ display: 'block', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.verse!.note}</span>
                  )}
                </span>
              </button>
              <span style={{ display: 'flex', gap: 2, paddingRight: 4 }}>
                {backend.saveDraft && (
                  <>
                    <button className="pill" disabled={!!busy || i === 0} onClick={() => swap(days[i - 1], d)} aria-label={`Move ${d.verse!.reference} a day earlier`} style={rowBtn(i === 0)}>↑</button>
                    <button className="pill" disabled={!!busy || i === days.length - 1} onClick={() => swap(d, days[i + 1])} aria-label={`Move ${d.verse!.reference} a day later`} style={rowBtn(i === days.length - 1)}>↓</button>
                  </>
                )}
                {backend.discard && (
                  <button className="pill" disabled={!!busy} onClick={() => discardOne(d)} aria-label={`Discard the draft for ${weekday(d.date)}`} style={rowBtn(false)}>
                    {armed === `one:${d.date}` ? 'Discard?' : '✕'}
                  </button>
                )}
              </span>
            </div>
          ))}
          {(() => {
            // Approve all waits until no day in the set carries a ⚠: each one is
            // opened and approved (or edited, or marked "looks right") on its own.
            const toCheck = days.filter((d) => flaggedCount(d.verse?.questions) > 0)
            return toCheck.length > 0 ? (
              <span style={{ fontSize: 12, lineHeight: 1.45 }}>
                ⚠ <b>Approve all</b> waits until the flagged questions are checked: open {toCheck.map((d) => weekday(d.date)).join(', ')}, then approve {toCheck.length === 1 ? 'it' : 'each'} there, or edit the question.
              </span>
            ) : null
          })()}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="pill"
              disabled={!!busy || days.some((d) => flaggedCount(d.verse?.questions) > 0)}
              onClick={() => approveAll(key, days)}
              style={{ fontSize: 12.5, fontWeight: 800 }}
            >
              {busy === `ok:${key}` ? 'Approving…' : armed === `ok:${key}` ? `Tap again to approve ${days.length} for your members` : `Approve all ${days.length}`}
            </button>
            {backend.discard && (
              <button className="pill" disabled={!!busy} onClick={() => discardAll(key, days)} style={{ fontSize: 12.5 }}>
                {busy === `x:${key}` ? 'Discarding…' : armed === `x:${key}` ? `Tap again to discard ${days.length}` : 'Discard all'}
              </button>
            )}
          </div>
        </div>
      ))}
      <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
        Open a day to change its verse, questions or note before approving; ↑ ↓ move a day, ✕ discards it. Approving the set approves the drafts as they’re saved.
      </span>
      {note && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mint)' }}>{note}</p>}
      {err && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--coral)' }}>{err}</p>}
    </div>
  )
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function weekday(iso: string): string {
  return pretty(iso)
}

function rowBtn(off: boolean): React.CSSProperties {
  return { padding: '2px 8px', fontSize: 12, opacity: off ? 0.35 : 1 }
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)' }
