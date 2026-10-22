import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { addDays } from '@/lib/date'
import { parseReference } from '@/lib/bibleProgress'
import { freeTopic, passageVerses, suggestTopics, topicByLabel, TOPIC_PASSAGES_MAX, type StudyTopic } from '@/data/studyTopics'
import {
  cleanLine,
  fetchDays,
  fetchPastSeries,
  GUIDANCE_MAX,
  resolvePassage,
  SCRIPTURE_CHARS_MAX,
  scriptureChars,
  SERIES_MAX,
  TOPIC_MAX,
  WEEK_DAYS_MAX,
  WEEK_DAYS_MIN,
  WEEK_TRANSCRIPT_MAX,
  type VerseBackend,
  type WeekDay,
  type WeekPassage,
} from '@/store/churchAdmin'

// "What is your congregation studying this week?" — the guided week fill at the
// top of the leadership planner (Content Generation only; drawn only when the
// backend carries `draftWeek`).
//
// A topic in → a suggested week of DRAFTS out, through the machinery that
// already existed rather than a second generator:
//   1. ANCHOR. The topic resolves to at most three passages: the leader's own
//      verse hints if typed, else the catalog's (`data/studyTopics.ts`), else
//      `church-draft`'s `topic` mode, which returns references and nothing
//      else. Every passage is then fetched from the BSB (`resolvePassage`), so
//      the scripture on a day is the Bible's and never the model's.
//   2. DRAFT. `draftWeek` — the sermon week's own call, with the topic as its
//      focus line and an optional pasted transcript — writes each day's verse
//      focus inside those passages, five questions and a note.
//   3. SAVE AS DRAFTS on the planned dates with `saveDraft`. Nothing is live:
//      the days show in the strip as ✎ and wait in `DraftReview`, where each is
//      opened, edited, reordered, approved or discarded.
//
// What a day already holds is never silently replaced: a live (approved) day is
// skipped and named, a waiting draft is kept unless the leader ticks "redo",
// and the plan says which dates will be written before anything is spent.
// "Discard this suggested week" throws away exactly the dates this run saved,
// and the server only ever discards a DRAFT (0129), so it cannot reach a day
// that was approved in the meantime.

const REASONS: Record<string, string> = {
  limit: 'That’s more drafting than today’s allowance has left (30 a church a day). Try fewer days, or tomorrow.',
  no_addon: 'Suggesting a week is part of the Content Generation package, which this church doesn’t have.',
  not_verified: 'This isn’t available for your church right now.',
  not_leadership: 'Only this church’s leadership can draft.',
  needs_topic: 'Type what your congregation is studying first.',
  topic_unclear: 'Couldn’t find passages for that topic — add a verse or two under “Anchor it to” and try again.',
  bad_reference: 'One of those verse hints doesn’t look right — try “John 15:1-11”.',
  passage_too_long: 'Keep each verse hint to 40 verses or fewer.',
  passage_unavailable: 'Couldn’t fetch the words of a passage — check your connection and try again.',
  bad_passages: 'One of those passages couldn’t be used — keep each inside one chapter.',
  draft_failed: 'Couldn’t draft a usable week from that — try again, or name the passages yourself.',
  unavailable: 'Suggesting a week isn’t available just now — check your connection and try again.',
}

const KIND_LABEL: Record<StudyTopic['kind'], string> = {
  previous: 'Used before',
  series: 'Series',
  season: 'Season',
  theme: 'Theme',
  book: 'Book',
}

type Phase = 'idle' | 'anchoring' | 'reading' | 'drafting' | 'saving'

export interface FillPlan {
  /** Dates this run will write. */
  dates: string[]
  /** Live days in the window, left alone. */
  live: string[]
  /** Drafts in the window: kept, or redone when `redo`. */
  drafts: string[]
}

/**
 * The fill for a fixed window: every EMPTY day, plus waiting drafts only when
 * the leader asked to redo them. An approved day is never a target — the
 * window does not stretch to make up for it, because the leader asked about
 * THIS week.
 */
export function planFill(window: WeekDay[], redo: boolean): FillPlan {
  const dates: string[] = []
  const live: string[] = []
  const drafts: string[] = []
  for (const w of window) {
    if (!w.verse) dates.push(w.date)
    else if (w.verse.status === 'draft') { drafts.push(w.date); if (redo) dates.push(w.date) }
    else live.push(w.date)
  }
  return { dates, live, drafts }
}

/** "John 15:1-11, Psalm 23" → up to three citations; null if any piece isn't one. */
function readHints(s: string): string[] | null {
  const parts = s.split(/[;,\n]+/).map((x) => x.trim()).filter(Boolean)
  if (!parts.length) return []
  if (parts.length > TOPIC_PASSAGES_MAX) return null
  return parts.every((p) => parseReference(p) && passageVerses(p) !== null) ? parts : null
}

export function StudyTopicWeek({
  churchId,
  backend,
  today,
  onDrafted,
  onChanged,
}: {
  churchId: string
  backend: VerseBackend
  today: string
  /** After drafts were saved — reload the strip and open the first. */
  onDrafted: (dates: string[]) => void
  /** After the suggested week was discarded. */
  onChanged: () => void
}) {
  const juice = useJuice()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const [topic, setTopic] = useState<StudyTopic | null>(null)
  const [past, setPast] = useState<string[]>([])

  const [hints, setHints] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [start, setStart] = useState(today)
  const [days, setDays] = useState(7)
  const [redo, setRedo] = useState(false)
  const [window_, setWindow] = useState<WeekDay[] | null>(null)
  const [windowErr, setWindowErr] = useState(false)

  const [phase, setPhase] = useState<Phase>('idle')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // What the last run saved, so "Discard this suggested week" throws away exactly that.
  const [result, setResult] = useState<{ series: string; dates: string[]; passages: string[] } | null>(null)
  const [discardArmed, setDiscardArmed] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  useEffect(() => {
    let alive = true
    fetchPastSeries(churchId, today, backend).then((s) => alive && setPast(s))
    return () => { alive = false }
  }, [churchId, today, backend])

  const suggestions = useMemo(() => suggestTopics(query, past), [query, past])
  const open = focused && !topic && suggestions.length > 0
  useEffect(() => setActive(0), [query])

  // The window this fill would write, re-read when its edges move.
  useEffect(() => {
    if (!topic) return
    let alive = true
    setWindow(null)
    setWindowErr(false)
    fetchDays(churchId, start, days, backend).then((r) => {
      if (!alive) return
      if (r.ok) setWindow(r.data)
      else setWindowErr(true)
    })
    return () => { alive = false }
  }, [topic, churchId, start, days, backend, result])

  const plan = window_ ? planFill(window_, redo) : null
  const hintList = readHints(hints)
  const anchors = hintList?.length ? hintList : topic?.passages ?? []
  const needsAnchoring = !anchors.length
  // Week mode drafts at least two days; one open day still costs two.
  const units = plan ? Math.max(plan.dates.length, plan.dates.length ? WEEK_DAYS_MIN : 0) + (needsAnchoring ? 1 : 0) : 0
  const busy = phase !== 'idle'
  const canAnchor = !needsAnchoring || !!backend.planTopic
  const ready = !!topic && hintList !== null && !!plan && plan.dates.length > 0 && canAnchor && !busy

  const choose = (t: StudyTopic) => {
    juice.select?.()
    setTopic(t)
    setQuery(t.label)
    setMsg(null)
    setResult(null)
    setDiscardArmed(false)
    setFocused(false)
  }

  const commitTyped = () => {
    const typed = cleanLine(query, TOPIC_MAX)
    if (!typed) return
    choose(topicByLabel(typed) ?? freeTopic(typed))
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && open) { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp' && open) { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && suggestions[active]) choose(suggestions[active])
      else commitTyped()
    } else if (e.key === 'Escape') setFocused(false)
  }

  const change = () => {
    setTopic(null)
    setResult(null)
    setMsg(null)
    setHints('')
    setFocused(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const run = async () => {
    if (!topic || !plan || !ready || !backend.draftWeek || !backend.saveDraft) return
    setMsg(null)
    setResult(null)
    setDiscardArmed(false)

    // 1. Anchor.
    let refs = anchors
    let series = cleanLine(topic.series ?? topic.label, SERIES_MAX) ?? ''
    if (needsAnchoring) {
      setPhase('anchoring')
      const r = await backend.planTopic!(churchId, topic.label, topic.book)
      if (!r.ok) { setPhase('idle'); return setMsg({ ok: false, text: REASONS[r.reason] ?? REASONS.unavailable }) }
      refs = r.data.passages
      if (topic.kind !== 'previous') series = cleanLine(r.data.series, SERIES_MAX) ?? series
    }

    // 2. The words, from the BSB. A passage that won't resolve is dropped; a
    //    leader's own hint that won't resolve is an error, since they asked for it.
    setPhase('reading')
    const resolved = await Promise.all(refs.map((r) => resolvePassage(r)))
    const passages: WeekPassage[] = []
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i]
      if (r.ok) passages.push(r.data)
      else if (hintList?.length) { setPhase('idle'); return setMsg({ ok: false, text: `${refs[i]}: ${REASONS[r.reason] ?? REASONS.unavailable}` }) }
    }
    while (passages.length > 1 && scriptureChars(passages) > SCRIPTURE_CHARS_MAX) passages.pop()
    if (!passages.length || scriptureChars(passages) > SCRIPTURE_CHARS_MAX) {
      setPhase('idle')
      return setMsg({ ok: false, text: REASONS.passage_unavailable })
    }

    // 3. Draft the week.
    setPhase('drafting')
    const n = plan.dates.length
    const guidance = `This week the congregation is studying “${topic.label}”. Keep every day on that topic.`.slice(0, GUIDANCE_MAX)
    const r = await backend.draftWeek(churchId, {
      series,
      days: Math.max(n, WEEK_DAYS_MIN),
      passages,
      guidance,
      transcript: transcript.trim() || undefined,
    })
    if (!r.ok) { setPhase('idle'); return setMsg({ ok: false, text: REASONS[r.reason] ?? REASONS.unavailable }) }

    // 4. Save each as a DRAFT on its planned date. A day that went live in the
    //    meantime refuses (`day_is_set`) and is reported, never forced.
    setPhase('saving')
    const saved: string[] = []
    const refused: string[] = []
    for (let i = 0; i < n && i < r.data.days.length; i++) {
      const d = r.data.days[i]
      const s = await backend.saveDraft(churchId, plan.dates[i], { reference: d.reference, text: d.text, questions: d.questions, series, note: d.note ?? '' }, false)
      if (s.ok) saved.push(plan.dates[i])
      else refused.push(plan.dates[i])
    }
    setPhase('idle')
    if (!saved.length) return setMsg({ ok: false, text: 'None of the suggested days could be saved — check your connection and try again.' })
    juice.select?.()
    const short = n - Math.min(n, r.data.days.length)
    setResult({ series, dates: saved, passages: passages.map((p) => p.reference) })
    setMsg({
      ok: true,
      text:
        `Suggested ${saved.length} day${saved.length === 1 ? '' : 's'} of “${series}”. All of them are drafts — nothing is live until you approve it.` +
        (short ? ` ${short} day${short === 1 ? '' : 's'} came back unusable and ${short === 1 ? 'was' : 'were'} left empty.` : '') +
        (refused.length ? ` ${refused.map(pretty).join(', ')} couldn’t be saved and ${refused.length === 1 ? 'was' : 'were'} skipped.` : ''),
    })
    onDrafted(saved)
  }

  const discardWeek = async () => {
    if (!result || !backend.discard) return
    if (!discardArmed) { setDiscardArmed(true); return }
    setDiscardArmed(false)
    setDiscarding(true)
    let gone = 0
    for (const d of result.dates) if ((await backend.discard(churchId, d)).ok) gone++
    setDiscarding(false)
    juice.select?.()
    const kept = result.dates.length - gone
    setMsg({
      ok: true,
      text:
        `Discarded ${gone} suggested day${gone === 1 ? '' : 's'}. Those days are empty again.` +
        (kept ? ` ${kept} ${kept === 1 ? 'was' : 'were'} already approved, changed or discarded, and ${kept === 1 ? 'was' : 'were'} left alone.` : ''),
    })
    setResult(null)
    onChanged()
  }

  if (!backend.draftWeek || !backend.saveDraft) return null

  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 10, background: 'var(--card-raised)' }} aria-label="Suggest a week from a study topic">
      <label htmlFor={`${listId}-input`} style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.3 }}>
        What is your congregation studying this week?
      </label>

      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            id={`${listId}-input`}
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${listId}-list`}
            aria-autocomplete="list"
            aria-activedescendant={open ? `${listId}-opt-${active}` : undefined}
            value={query}
            readOnly={!!topic || busy}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={onKey}
            maxLength={TOPIC_MAX}
            placeholder="The Beatitudes, Advent, Romans, forgiveness…"
            autoComplete="off"
            autoCorrect="off"
            style={{ flex: 1, minWidth: 0 }}
          />
          {topic ? (
            <button className="pill" onClick={change} disabled={busy} style={{ fontSize: 12.5 }}>Change</button>
          ) : (
            <button className="pill" onClick={commitTyped} disabled={!cleanLine(query, TOPIC_MAX)} style={{ fontSize: 12.5, fontWeight: 800 }}>Go</button>
          )}
        </div>

        {open && (
          <ul
            id={`${listId}-list`}
            role="listbox"
            aria-label="Suggested topics"
            style={{
              position: 'absolute', zIndex: 5, left: 0, right: 0, top: 'calc(100% + 4px)', margin: 0, padding: 4,
              listStyle: 'none', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--edge)',
              boxShadow: '0 10px 24px rgba(0,0,0,0.35)', maxHeight: 300, overflowY: 'auto',
            }}
          >
            {suggestions.map((t, i) => (
              <li
                key={t.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); choose(t) }}
                onMouseEnter={() => setActive(i)}
                style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'baseline',
                  padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
                  background: i === active ? 'var(--select)' : 'transparent',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>{t.label}</span>
                  {t.passages[0] && (
                    <span className="dim" style={{ display: 'block', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.passages.join(' · ')}
                    </span>
                  )}
                </span>
                <span className="dim" style={{ fontSize: 11 }}>{KIND_LABEL[t.kind]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!topic && (
        <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
          Pick a topic and we’ll suggest a week — a verse, five questions and a note for each day — as drafts you edit and
          approve. Nothing reaches your members until you do.
        </p>
      )}

      {topic && (
        <>
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>
            <b>Anchored to</b>{' '}
            <span className="dim">
              {hintList?.length
                ? hintList.join(' · ')
                : topic.passages.length
                  ? topic.passages.join(' · ')
                  : topic.book
                    ? `passages from ${topic.book}, chosen for you`
                    : 'passages chosen for this topic'}
            </span>
          </div>
          <label style={labelStyle}>
            Anchor it to your own verses (optional)
            <input
              value={hints}
              onChange={(e) => setHints(e.target.value)}
              placeholder={topic.passages[0] ?? 'Matthew 5:1-12, Luke 6:20-26'}
              autoCapitalize="words"
              autoCorrect="off"
              maxLength={120}
              disabled={busy}
              style={{ borderColor: hintList === null ? 'var(--coral)' : undefined }}
            />
          </label>
          {hintList === null && (
            <span style={{ fontSize: 11.5, color: 'var(--coral)', marginTop: -6 }}>
              Up to three passages, each inside one chapter — like “John 15:1-11, Psalm 23:1-6”.
            </span>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ ...labelStyle, flex: '1 1 140px' }}>
              Starting
              <input type="date" value={start} min={today} max={addDays(today, 300)} disabled={busy} onChange={(e) => e.target.value && setStart(e.target.value)} />
            </label>
            <label style={{ ...labelStyle, flex: '1 1 100px' }}>
              Days
              <select value={days} disabled={busy} onChange={(e) => setDays(Number(e.target.value))}>
                {Array.from({ length: WEEK_DAYS_MAX - WEEK_DAYS_MIN + 1 }, (_, i) => WEEK_DAYS_MIN + i).map((n) => (
                  <option key={n} value={n}>{n} days</option>
                ))}
              </select>
            </label>
          </div>

          <label style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 8, alignItems: 'start', fontSize: 12.5, lineHeight: 1.4, fontWeight: 400, color: 'var(--ink)' }}>
            <input type="checkbox" checked={redo} disabled={busy} onChange={(e) => setRedo(e.target.checked)} style={{ width: 16, height: 16, margin: '2px 0 0', padding: 0 }} />
            <span>Also redo drafts already waiting for approval in these days. <span className="dim">Days you’ve approved are always left alone.</span></span>
          </label>

          {notesOpen ? (
            <label style={labelStyle}>
              Sermon notes or a transcript (optional)
              <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={5} maxLength={WEEK_TRANSCRIPT_MAX} disabled={busy} placeholder="Paste notes or a transcript to steer each day’s note…" style={{ resize: 'vertical' }} />
            </label>
          ) : (
            <button className="faint" onClick={() => setNotesOpen(true)} style={{ justifySelf: 'start', padding: 0, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)', cursor: 'pointer' }}>
              + Paste sermon notes or a transcript
            </button>
          )}

          {!result && <FillLine plan={plan} error={windowErr} />}

          {msg && <p style={{ margin: 0, fontSize: 12.5, color: msg.ok ? 'var(--mint)' : 'var(--coral)' }}>{msg.text}</p>}

          {result ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="pill" onClick={() => onDrafted(result.dates)} style={{ fontSize: 12.5, fontWeight: 800 }}>
                Review {pretty(result.dates[0])} →
              </button>
              {backend.discard && (
                <button className="pill" onClick={discardWeek} disabled={discarding} style={{ fontSize: 12.5 }}>
                  {discarding ? 'Discarding…' : discardArmed ? `Tap again to discard all ${result.dates.length}` : 'Discard this suggested week'}
                </button>
              )}
            </div>
          ) : (
            <>
              <Button variant="gold" full disabled={!ready} onClick={run}>
                {phase === 'anchoring'
                  ? 'Finding the passages…'
                  : phase === 'reading'
                    ? 'Reading the passages…'
                    : phase === 'drafting'
                      ? `Drafting ${plan?.dates.length ?? days} days — about a minute…`
                      : phase === 'saving'
                        ? 'Saving the drafts…'
                        : plan && plan.dates.length
                          ? `Suggest ${plan.dates.length} day${plan.dates.length === 1 ? '' : 's'}`
                          : 'Suggest a week'}
              </Button>
              {plan && plan.dates.length > 0 && (
                <span className="faint" style={{ fontSize: 11.5, marginTop: -4, lineHeight: 1.4 }}>
                  Uses {units} of your church’s 30 drafts for today.
                  {needsAnchoring && !backend.planTopic ? ' Name a passage above to anchor this topic.' : ''}
                </span>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function FillLine({ plan, error }: { plan: FillPlan | null; error: boolean }) {
  if (error) return <p style={{ margin: 0, fontSize: 12, color: 'var(--coral)' }}>Couldn’t check the schedule — try again in a moment.</p>
  if (!plan) return <p className="faint" style={{ margin: 0, fontSize: 12 }}>Checking the schedule…</p>
  if (!plan.dates.length) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: 'var(--coral)' }}>
        Every day in that stretch already has content. Pick another start{plan.drafts.length ? ', or tick “redo drafts”' : ''}.
      </p>
    )
  }
  const keptDrafts = plan.drafts.filter((d) => !plan.dates.includes(d))
  const redone = plan.drafts.filter((d) => plan.dates.includes(d))
  return (
    <div style={{ fontSize: 12, lineHeight: 1.5 }}>
      <div><b>Drafts go on</b> <span className="dim">{plan.dates.map(pretty).join(', ')}</span></div>
      {plan.live.length > 0 && <div className="dim">Left alone (approved): {plan.live.map(pretty).join(', ')}</div>}
      {keptDrafts.length > 0 && <div className="dim">Kept (your waiting drafts): {keptDrafts.map(pretty).join(', ')}</div>}
      {redone.length > 0 && <div className="dim">Redone (older drafts replaced): {redone.map(pretty).join(', ')}</div>}
    </div>
  )
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)' }
