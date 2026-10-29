import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { todayLocalDate, addDays } from '@/lib/date'
import { parseReference } from '@/lib/bibleProgress'
import { verseFromReference } from '@/data/bible/questions'
import { TranscriptMeter, transcriptNote } from './transcript'
import { MemoInput, placeTranscript } from './memo'
import { cleanDiscussion, DISCUSSION_LINE_MAX, cleanLine, cleanQuestions, fetchDays, flaggedCount, GUIDANCE_MAX, NOTE_MAX, SERIES_MAX, serverVerseBackend, useDraftAllowance, type DayVerse, type VerseBackend, type VerseStatus, type WeekDay } from '@/store/churchAdmin'
import type { Question } from '@/types'
import { SeriesCopyPanel } from './SeriesCopyPanel'
import { DiscussionToggle, DraftReview } from './WeekDraftPanel'
import { SundayPack } from './SundayPack'
import { ShareVerse } from './ShareVerse'
import { PlanWeek } from './PlanWeek'
import { ENGINE_REASONS } from './weekRun'
import { AssetStudio } from './AssetStudio'
import { useChurchAssetsAdmin } from '@/store/churchAssets'
import { MoreTools } from './MoreTools'

// "Set today's verse" — the verified layer's one write (0119).
//
// A reference, the words, and five questions of the church's own, saved for a
// date. Saving the same date again replaces it (`set_church_verse` is an
// upsert), so the form loads whatever is already there first and edits it
// rather than overwriting blind. Members get it as their church's own round
// for that day, BESIDE the global drop (0128) — never in place of it.
//
// Two tiers meet in this form (0127). Everything above is the BASE church
// leader tier. The content engine — "✨ Draft five questions", steered by a
// focus line or a sermon transcript, and "Draft a week from a sermon" (0129) —
// exists only when the backend carries `draft`/`draftWeek`, i.e. the church
// holds the Content Generation package; without it the form draws a locked
// card in its place (`generationLocked`). Anything the engine drafted is saved
// as a DRAFT, which members never see, and goes live only through an explicit
// approve. A day typed by hand is approved by being saved, because the leader
// wrote it.
//
// A pastor prepares weekly and preaches by the SERIES, so the form sits under a
// three-week strip: twenty-one days, each marked set or not, tapping one edits
// it, and a run of days filed under one series name is drawn as one. A day
// nobody set leaves the church box empty that day, and the strip is what makes that
// visible before it happens. After a save, `SeriesCopyPanel` carries the verse
// through a chosen date, listing every day it would replace before it touches
// one (nothing is replaced unless ticked).
//
// Each day may carry a SERIES name and a short NOTE from the pastor (0123), both
// optional plain text. The note is what members read beside the verse on the
// Play tab that day (the church card, `ChurchWindow`); the series is the quiet label beside it
// and what "This week we're in …" puts on the church's page in one tap.
//
// LAYOUT (2026-10-26): with the Content Generation package the tab opens on
// "Plan your week" (`PlanWeek`) — start from a sermon, a topic or a passage,
// draft the week, review and approve — and this day-by-day form sits folded
// under "Edit one day", opened by tapping a day on the strip, opening a draft
// from the review, or arriving from a Home to-do (`initialDate`). Without the
// package (and in the public demo) the form is the tab and starts open. The
// per-day "✨ Draft five questions" and the library fill live inside it, as
// tools for editing one day rather than ways to plan a week.
//
// When the arcade's library already carries the verse, one tap fills its words
// and the five questions the app would have asked — a starting point to edit,
// not a requirement. Validation mirrors `church_clean_questions` (`cleanQuestions`),
// so the form says what is missing before the server has to refuse it.

const OPTIONS = 4
/** Three weeks: a series is usually longer than one and rarely longer than this. */
const WINDOW = 21

interface Draft {
  prompt: string
  options: string[]
  answerIndex: number
  teach: string
  /** The blind check's ⚠ (0143), until the leader edits the question or says it looks right. */
  check?: true
  /** The option the second read picked (an index into `options`), or -1. */
  checkPick?: number
}

const blank = (): Draft => ({ prompt: '', options: Array(OPTIONS).fill(''), answerIndex: 0, teach: '' })
const toDraft = (q: Question): Draft => ({
  prompt: q.prompt,
  options: [...q.options, ...Array(OPTIONS).fill('')].slice(0, OPTIONS),
  answerIndex: q.answerIndex,
  teach: q.teach,
  ...(q.check === true ? { check: true as const, checkPick: q.checkPick } : {}),
})

/** Blank options drop out; the correct one has to survive that. */
function fromDraft(d: Draft): Question | null {
  const kept: string[] = []
  let answer = -1
  d.options.forEach((o, i) => {
    if (!o.trim()) return
    if (i === d.answerIndex) answer = kept.length
    kept.push(o)
  })
  if (answer < 0) return null
  const q: Question = { prompt: d.prompt, options: kept, answerIndex: answer, teach: d.teach }
  // An unedited flagged question is saved flagged (a draft keeps it; approving strips it).
  if (d.check) {
    q.check = true
    const pick = d.checkPick != null && d.checkPick >= 0 ? kept.indexOf(d.options[d.checkPick] ?? '') : -1
    q.checkPick = pick
  }
  return q
}

/** What the ⚠ says, in the words of the passage check. */
function checkLine(d: Draft): string {
  const picked = d.checkPick != null && d.checkPick >= 0 ? d.options[d.checkPick]?.trim() : ''
  return picked
    ? `The draft answer may not match the passage. Please check — a second read of the passage picked “${picked}”.`
    : 'The draft answer may not match the passage. Please check — a second read couldn’t answer it from the passage alone.'
}

const REASONS: Record<string, string> = {
  bad_date: 'Pick today or a day ahead.',
  bad_reference: 'That reference doesn’t look right — try “John 3:16” or “Psalm 23:1-3”.',
  bad_text: 'Add the words of the verse.',
  bad_questions: 'Each question needs a prompt, at least two different answers, the right one marked, and a line that explains it.',
  not_verified: 'This isn’t available for your church right now.',
  not_leadership: 'Only this church’s leadership can set the verse.',
  no_addon: 'Drafting is part of the Content Generation package, which this church doesn’t have.',
  no_draft: 'That draft was already approved or replaced — reload the day to see it.',
  day_is_set: 'This day already has a live verse.',
}

const DRAFT_REASONS: Record<string, string> = {
  ...ENGINE_REASONS,
  limit: 'That’s the drafting limit for today — write these by hand, or draft again tomorrow.',
  not_verified: 'Drafting is part of a Founding Church.',
  no_addon: 'Drafting is part of the Content Generation package, which this church doesn’t have.',
  bad_reference: 'Drafting starts from a verse reference — try “John 15:5” or “Psalm 23:1-3”.',
  not_leadership: 'Only this church’s leadership can draft questions.',
  draft_failed: 'Couldn’t draft good questions for that one — try again, or write your own.',
  demo_library_only: 'In this demo, drafting works for verses in our library (try John 15:5). A Founding Church can draft from any passage.',
  unavailable: 'Drafting isn’t available just now — check your connection and try again.',
}

export function TodayVerseForm({
  churchId,
  churchName,
  backend = serverVerseBackend,
  generationLocked = false,
  assets,
  onSaved,
  initialDate,
}: {
  /** Open on this day (the Home to-do's "draft for Thursday"). Today if absent or past. */
  initialDate?: string
  churchId: string
  churchName: string
  /** Where days are read and written — the server, or memory for the demo. */
  backend?: VerseBackend
  /** Draw the content engine as locked (base tier without the add-on). */
  generationLocked?: boolean
  /** After a successful save, with the verse as saved. */
  onSaved?: (date: string, v: DayVerse) => void
  /**
   * Visual assets (0133) for a saved day — the verse card and its series
   * graphic. Only the real admin screen passes this (the public demo does
   * not); `canGenerate` is the Content Generation add-on.
   */
  assets?: { canGenerate: boolean }
}) {
  const juice = useJuice()
  const today = todayLocalDate()
  const start = initialDate && initialDate > today ? initialDate : today
  const [date, setDate] = useState(start)
  const [reference, setReference] = useState('')
  const [text, setText] = useState('')
  const [qs, setQs] = useState<Draft[]>(() => Array.from({ length: 5 }, blank))
  const [loading, setLoading] = useState(true)
  const [existing, setExisting] = useState(false)
  // The day as it is SAVED (not the edits in the fields) — what a card is made from.
  const [stored, setStored] = useState<DayVerse | null>(null)
  // What the loaded day IS (0127), and whether the engine filled this edit.
  const [status, setStatus] = useState<VerseStatus | undefined>(undefined)
  const [generatedNow, setGeneratedNow] = useState(false)
  const [replaceArmed, setReplaceArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // The strip starts at today unless the opening day would fall off it.
  const [weekStart, setWeekStart] = useState(() => (start > addDays(today, WINDOW - 1) ? start : today))
  const [week, setWeek] = useState<WeekDay[] | null>(null)
  const [weekErr, setWeekErr] = useState(false)
  const [saved, setSaved] = useState<DayVerse | null>(null)
  const [series, setSeries] = useState('')
  const [note, setNote] = useState('')
  // Open discussion questions for small groups (0151): three slots, saved
  // beside the day after the day itself saves. `discOnFile` is what the server
  // holds, so an untouched day is never re-written.
  const [disc, setDisc] = useState<string[]>(['', '', ''])
  const [discOnFile, setDiscOnFile] = useState<string[]>([])
  const [discGenerated, setDiscGenerated] = useState(false)
  const [askDiscussion, setAskDiscussion] = useState(false)
  const [pageLine, setPageLine] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')
  // The copy panel closes once it has run; the verse it copied stays `saved`,
  // so "This week we're in …" is still one tap away afterwards.
  const [copied, setCopied] = useState(false)
  // Bumped to re-read the open day after something outside the form changed it.
  const [dayKey, setDayKey] = useState(0)
  // A line to show once that re-read lands (the load clears messages).
  const afterLoad = useRef<{ ok: boolean; text: string } | null>(null)
  const weekRef = useRef<WeekDay[] | null>(null)
  weekRef.current = week

  const loadWeek = async (start = weekStart) => {
    const r = await fetchDays(churchId, start, WINDOW, backend)
    if (r.ok) { setWeek(r.data); setWeekErr(false) } else { setWeek(null); setWeekErr(true) }
  }
  useEffect(() => { void loadWeek(weekStart) }, [churchId, weekStart, backend]) // eslint-disable-line react-hooks/exhaustive-deps

  // The day form is folded under the planning flow when there is one.
  const planning = !!backend.draftWeek
  const [dayOpen, setDayOpen] = useState(!planning || !!initialDate)
  const dayRef = useRef<HTMLDivElement>(null)
  const pick = (d: string, open = true) => {
    if (d < weekStart || d > addDays(weekStart, WINDOW - 1)) setWeekStart(d < today ? today : d)
    setDate(d)
    if (open && planning) {
      setDayOpen(true)
      requestAnimationFrame(() => dayRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
    }
  }

  // Load what this date already holds, so a second save edits the first.
  useEffect(() => {
    let alive = true
    setLoading(true)
    setMsg(afterLoad.current)
    afterLoad.current = null
    setSaved(null)
    setCopied(false)
    setPageLine('idle')
    backend.get(churchId, date).then((r) => {
      if (!alive) return
      const v = r.ok ? r.data : null
      setExisting(!!v)
      setStored(v)
      setStatus(v?.status ?? (v ? 'approved' : undefined))
      setGeneratedNow(false)
      setReplaceArmed(false)
      setReference(v?.reference ?? '')
      setText(v?.text ?? '')
      setQs(v ? v.questions.map(toDraft) : Array.from({ length: 5 }, blank))
      // An empty day right after a day in a series most likely continues it,
      // so the name is offered — visible in the field, and one tap to clear.
      const before = weekRef.current?.find((w) => w.date === addDays(date, -1))?.verse
      setSeries(v ? (v.series ?? '') : (before?.series ?? ''))
      setNote(v?.note ?? '')
      setDisc(['', '', ''])
      setDiscOnFile([])
      setDiscGenerated(false)
      setLoading(false)
    })
    if (backend.discussion) {
      backend.discussion.get(churchId, date).then((r) => {
        if (!alive || !r.ok) return
        setDiscOnFile(r.data)
        setDisc([0, 1, 2].map((i) => r.data[i] ?? ''))
      })
    }
    return () => { alive = false }
  }, [churchId, date, backend, dayKey])

  /**
   * After the day itself saved: write its discussion questions if they
   * changed — or if the day's reference did, since questions are kept only
   * while they match it (0151). Returns a sentence to add when they didn't
   * save, else ''.
   */
  const persistDiscussion = async (moved: boolean): Promise<string> => {
    if (!backend.discussion) return ''
    const want = cleanDiscussion(disc)
    if (!(moved && want.length) && JSON.stringify(want) === JSON.stringify(discOnFile)) return ''
    const r = await backend.discussion.save(churchId, date, want, discGenerated)
    if (!r.ok) return ' The discussion questions didn’t save — try again in a moment.'
    setDiscOnFile(r.data)
    setDiscGenerated(false)
    return ''
  }

  const library = useMemo(() => (parseReference(reference) ? verseFromReference(reference.trim()) : null), [reference])

  const useLibrary = () => {
    if (!library) return
    setMsg(null)
    setText(library.text)
    setQs(library.questions.slice(0, 5).map(toDraft))
  }

  // "✨ Draft questions" — five questions written from the passage by the
  // server (`church-draft`, 0122) for ANY reference, not only the library's.
  // It fills the form and saves nothing. Over questions the pastor already
  // typed, the first tap only warns; the second replaces.
  const [drafting, setDrafting] = useState(false)
  const [armed, setArmed] = useState(false)
  const [steerOpen, setSteerOpen] = useState(false)
  const [guidance, setGuidance] = useState('')
  const [transcript, setTranscript] = useState('')
  const typed = qs.some((q) => q.prompt.trim() || q.teach.trim() || q.options.some((o) => o.trim()))
  const canDraft = !!backend.draft && !!parseReference(reference) && text.trim().length >= 3
  // What the engine last said this church has left today (null until it has answered).
  const draftsLeft = useDraftAllowance((s) => (backend.draft ? s.left[churchId] : undefined))
  const draft = async () => {
    if (!backend.draft || !canDraft) return
    if (typed && !armed) { setArmed(true); return }
    setArmed(false)
    setMsg(null)
    setDrafting(true)
    const r = await backend.draft(churchId, reference.trim(), text.trim(), { guidance, transcript, discussion: askDiscussion && !!backend.discussion })
    setDrafting(false)
    if (!r.ok) return setMsg({ ok: false, text: DRAFT_REASONS[r.reason] ?? DRAFT_REASONS.unavailable })
    juice.select?.()
    setQs(r.data.questions.map(toDraft))
    // A suggested note fills an EMPTY note only — never over the pastor's own.
    if (r.data.note && !note.trim()) setNote(r.data.note)
    if (r.data.discussion?.length) {
      setDisc([0, 1, 2].map((i) => r.data.discussion![i] ?? ''))
      setDiscGenerated(true)
    }
    setGeneratedNow(true)
    setMsg({ ok: true, text: 'Drafted. Nothing is live yet — read each one, change anything that isn’t how you’d say it, then save it as a draft and approve it.' + transcriptNote(transcript, r.data.transcriptUse, r.data.transcriptRead) })
  }

  // Any edit to a question is the leader's own call on it, so it clears the ⚠.
  const unflag = (q: Draft): Draft => { const { check: _c, checkPick: _p, ...rest } = q; return rest }
  const setQ = (i: number, patch: Partial<Draft>) => setQs((all) => all.map((q, j) => (j === i ? unflag({ ...q, ...patch }) : q)))
  const setOpt = (i: number, k: number, v: string) =>
    setQs((all) => all.map((q, j) => (j === i ? unflag({ ...q, options: q.options.map((o, m) => (m === k ? v : o)) }) : q)))
  const flagged = qs.filter((q) => q.check).length

  // The verse as the form holds it, or null with the reason on screen.
  const build = (): DayVerse | null => {
    setMsg(null)
    if (!parseReference(reference)) { setMsg({ ok: false, text: REASONS.bad_reference }); return null }
    if (!text.trim()) { setMsg({ ok: false, text: REASONS.bad_text }); return null }
    const built = qs.map(fromDraft)
    const bad = built.findIndex((q) => !q || !cleanQuestions([q, q, q, q, q]))
    if (bad >= 0) { setMsg({ ok: false, text: `Question ${bad + 1} isn’t finished. ${REASONS.bad_questions}` }); return null }
    return {
      reference: reference.trim(),
      text: text.trim(),
      questions: built as Question[],
      series: cleanLine(series, SERIES_MAX),
      note: cleanLine(note, NOTE_MAX),
    }
  }

  // After anything that left the day LIVE: the copy panel, the page line, the strip.
  const landed = (v: DayVerse, extrasLost: boolean, lead: string) => {
    juice.select?.()
    setExisting(true)
    setStatus(date <= today ? 'published' : 'approved')
    setGeneratedNow(false)
    setReplaceArmed(false)
    setSaved(v)
    setStored(v)
    setCopied(false)
    setPageLine('idle')
    onSaved?.(date, v)
    void loadWeek()
    // A save can make an existing card out of date; re-read the flags.
    if (assets) void useChurchAssetsAdmin.getState().load(churchId, true)
    setMsg({
      ok: !extrasLost,
      text: lead + (extrasLost ? ' The series name and note didn’t save — try again in a moment.' : ''),
    })
  }
  const liveLine = () =>
    date === today
      ? `It’s live now for ${churchName}’s members, next to today’s drop — anyone who already played it keeps their run.`
      : `It goes to ${churchName}’s members on ${pretty(date)}.`

  // A day typed by hand: saving it IS the approval (`set_church_verse`).
  const save = async () => {
    const v = build()
    if (!v) return
    const moved = stored?.reference !== v.reference
    setBusy(true)
    const r = await backend.save(churchId, date, v)
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: REASONS[r.reason] ?? 'That didn’t save — check your connection and try again.' })
    const lost = r.data?.extras === false && !!(v.series || v.note)
    landed(v, lost, `Saved. ${liveLine()}` + (await persistDiscussion(moved)))
  }

  // Replacing a LIVE day with a draft takes it off members' screens until the
  // draft is approved, so the first tap only says so.
  const liveDay = existing && status !== 'draft'
  const needsReplace = liveDay && generatedNow
  const armReplace = (): boolean => {
    if (needsReplace && !replaceArmed) {
      setReplaceArmed(true)
      setMsg({ ok: false, text: `${pretty(date)} already has a live verse. Saving this draft takes it off your members’ screens until you approve — tap again to go ahead.` })
      return false
    }
    return true
  }

  // Generated content, saved for review. Members can't see a draft.
  const saveAsDraft = async () => {
    if (!backend.saveDraft) return
    const v = build()
    if (!v || !armReplace()) return
    const moved = stored?.reference !== v.reference
    setBusy(true)
    const r = await backend.saveDraft(churchId, date, v, needsReplace)
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: REASONS[r.reason] ?? 'That didn’t save — check your connection and try again.' })
    juice.select?.()
    setExisting(true)
    setStored({ ...v, status: 'draft' })
    setStatus('draft')
    setGeneratedNow(false)
    setReplaceArmed(false)
    setSaved(null)
    void loadWeek()
    if (assets) void useChurchAssetsAdmin.getState().load(churchId, true)
    const discLost = await persistDiscussion(moved)
    setMsg({ ok: !discLost, text: `Saved as a draft. ${churchName}’s members can’t see it until you approve it.` + discLost })
  }

  // The explicit approval. With the add-on, the edits are saved as the draft
  // first so the record keeps "generated"; without it (a lapsed add-on, an old
  // draft), the leader's own save approves it.
  const approve = async () => {
    const v = build()
    if (!v || !armReplace()) return
    const moved = stored?.reference !== v.reference
    setBusy(true)
    let r: { ok: true; data: unknown } | { ok: false; reason: string }
    let lost = false
    if (backend.saveDraft && backend.approve) {
      const d = await backend.saveDraft(churchId, date, v, needsReplace || liveDay)
      r = d.ok ? await backend.approve(churchId, date) : d
    } else {
      const s2 = await backend.save(churchId, date, v)
      r = s2
      lost = s2.ok && s2.data?.extras === false && !!(v.series || v.note)
    }
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: REASONS[r.reason] ?? 'That didn’t go through — check your connection and try again.' })
    landed(v, lost, `Approved. ${liveLine()}` + (await persistDiscussion(moved)))
  }

  // Throw the open draft away (0129). The day reads as empty again.
  const [discardArmed, setDiscardArmed] = useState(false)
  const discard = async () => {
    if (!backend.discard) return
    if (!discardArmed) { setDiscardArmed(true); return }
    setDiscardArmed(false)
    setBusy(true)
    const r = await backend.discard(churchId, date)
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: REASONS[r.reason] ?? 'That didn’t go through — check your connection and try again.' })
    juice.select?.()
    void loadWeek()
    afterLoad.current = { ok: true, text: `Discarded the draft for ${pretty(date)}. That day is empty again.` }
    setDayKey((k) => k + 1)
  }

  // Draft flow: the engine filled this edit, or the day on file is a draft.
  const draftFlow = generatedNow || status === 'draft'

  const putOnPage = async () => {
    if (!saved?.series || !backend.setThisWeek) return
    setPageLine('busy')
    const r = await backend.setThisWeek(churchId, thisWeekLine(saved.series))
    setPageLine(r.ok ? 'done' : 'failed')
    if (r.ok) juice.select?.()
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {planning ? (
        <PlanWeek
          churchId={churchId}
          backend={backend}
          today={today}
          week={week}
          selected={date}
          onDrafted={(ds) => { void loadWeek(); if (ds[0]) pick(ds[0], false); setDayKey((k) => k + 1) }}
          onChanged={() => { void loadWeek(); setDayKey((k) => k + 1) }}
          onOpenDay={pick}
        />
      ) : (
        <>
          {generationLocked && <GenerationLocked />}
          {/* A church whose add-on lapsed still reviews what it made. */}
          <DraftReview
            churchId={churchId}
            backend={backend}
            week={week}
            selected={date}
            onOpen={pick}
            onChanged={() => { void loadWeek(); setDayKey((k) => k + 1) }}
          />
        </>
      )}

      <WeekStrip
        week={week}
        error={weekErr}
        selected={date}
        today={today}
        canBack={weekStart > today}
        canForward={addDays(weekStart, WINDOW + 6) <= addDays(today, 366)}
        onBack={() => setWeekStart(addDays(weekStart, -7) < today ? today : addDays(weekStart, -7))}
        onForward={() => setWeekStart(addDays(weekStart, 7))}
        onPick={pick}
        onRetry={() => void loadWeek()}
      />

      {/* Sharing the verse, and the Sunday pack under More tools: real admin
          screen only (the demo passes no `assets`). */}
      {assets && <ShareVerse churchId={churchId} churchName={churchName} />}
      {assets && (
        <MoreTools names={['Sunday pack PDF']}>
          <SundayPack churchId={churchId} churchName={churchName} backend={backend} />
        </MoreTools>
      )}

      {planning && (
        <button
          className="pill"
          data-edit-day
          aria-expanded={dayOpen}
          onClick={() => { juice.select?.(); setDayOpen((o) => !o) }}
          style={{ justifySelf: 'start', fontSize: 12.5, fontWeight: 800 }}
        >
          {dayOpen ? `− Close ${pretty(date)}` : '✎ Edit one day — type a verse and questions by hand'}
        </button>
      )}
      {dayOpen && (
      <div ref={dayRef} style={{ display: 'grid', gap: 12, scrollMarginTop: 12 }}>
      <label style={labelStyle}>
        Day
        <input type="date" value={date} min={today} max={addDays(today, 366)} onChange={(e) => e.target.value && pick(e.target.value)} />
      </label>
      <p className="faint" style={{ margin: '-4px 0 0', fontSize: 11.5, lineHeight: 1.45 }}>
        {loading
          ? 'Checking that day…'
          : status === 'draft'
            ? 'A DRAFT is saved for this day — your members can’t see it until you approve it.'
            : existing
              ? 'A verse is set for this day — saving replaces it.'
              : 'Nothing set — your members just have the everyday verse that day.'}
      </p>

      <label style={labelStyle}>
        Verse reference
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="John 15:5"
          autoCapitalize="words"
          autoCorrect="off"
          maxLength={40}
        />
      </label>
      {library && (
        <button className="pill" onClick={useLibrary} style={{ justifySelf: 'start', fontSize: 12.5 }}>
          ✨ Fill in the words and five questions for {library.reference}
        </button>
      )}

      <label style={labelStyle}>
        The verse
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} placeholder="I am the vine; you are the branches…" style={{ resize: 'vertical' }} />
      </label>

      {backend.draft && (
        <div style={{ display: 'grid', gap: 6 }}>
          <button
            className="pill"
            onClick={draft}
            disabled={!canDraft || drafting}
            style={{ justifySelf: 'start', fontSize: 12.5, fontWeight: 800, opacity: canDraft ? 1 : 0.55 }}
          >
            {drafting ? 'Drafting five questions…' : armed ? 'Tap again to replace your questions' : '✨ Draft five questions from this passage'}
          </button>
          {backend.discussion && <DiscussionToggle on={askDiscussion} onChange={setAskDiscussion} />}
          <button
            className="faint"
            onClick={() => setSteerOpen((o) => !o)}
            aria-expanded={steerOpen}
            style={{ justifySelf: 'start', padding: 0, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--ink-dim)' }}
          >
            {steerOpen ? '− Hide focus and sermon notes' : '+ Add a focus or sermon notes (optional)'}
          </button>
          {steerOpen && (
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={labelStyle}>
                What to focus on
                <input value={guidance} onChange={(e) => setGuidance(e.target.value)} maxLength={GUIDANCE_MAX} placeholder="Abiding when life is busy" />
              </label>
              <label style={labelStyle}>
                Sermon notes or a voice-memo transcript
                <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={4} placeholder="Paste your notes, or the transcript of a voice memo…" style={{ resize: 'vertical' }} />
              </label>
              <TranscriptMeter value={transcript} />
              {backend.memo && <MemoInput churchId={churchId} memo={backend.memo} hasText={!!transcript.trim()} disabled={drafting} onTranscript={(t, how) => setTranscript((cur) => placeTranscript(cur, t, how))} />}
              <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
                These only steer the emphasis and the suggested note. The questions are still about {parseReference(reference) ? reference.trim() : 'the passage above'} and nothing else.
              </span>
            </div>
          )}
          <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
            {canDraft
              ? 'A first draft to edit. It’s saved as a draft your members can’t see until you approve it.'
              : 'Add the reference and the words of the verse first — drafting always starts from a passage.'}
            {draftsLeft != null ? ` Your church has ${draftsLeft} draft${draftsLeft === 1 ? '' : 's'} left today.` : ''}
          </span>
        </div>
      )}

      <label style={labelStyle}>
        Series (optional)
        <input value={series} onChange={(e) => setSeries(e.target.value)} placeholder="John 15–17, Advent…" maxLength={SERIES_MAX} autoCapitalize="words" />
      </label>

      <label style={labelStyle}>
        A note to your members (optional)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={NOTE_MAX} placeholder="Read the whole chapter before Sunday — we’ll pick up at verse 9." style={{ resize: 'vertical' }} />
      </label>
      <p className="faint" style={{ margin: '-4px 0 0', fontSize: 11.5, lineHeight: 1.45 }}>
        Members see the note beside this day&rsquo;s verse on their Play tab, that day only. {note.length > NOTE_MAX - 40 ? `${NOTE_MAX - note.length} characters left.` : ''}
      </p>

      {backend.discussion && (
        <div data-discussion style={{ display: 'grid', gap: 6 }}>
          <span style={labelStyle as React.CSSProperties}>Discussion questions for small groups (optional)</span>
          {disc.map((q, i) => (
            <input
              key={i}
              value={q}
              onChange={(e) => { const v = e.target.value; setDisc((all) => all.map((x, j) => (j === i ? v : x))) }}
              maxLength={DISCUSSION_LINE_MAX}
              placeholder={i === 0 ? 'What does this verse show us about God?' : i === 1 ? 'Where could you live this out this week?' : 'Another question (optional)'}
              aria-label={`Discussion question ${i + 1}`}
            />
          ))}
          <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
            Open questions with no right answer. Your group leaders see them beside this day once it’s approved; members don’t.
          </span>
        </div>
      )}

      {flagged > 0 && (
        <p role="status" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, padding: '8px 12px', borderRadius: 12, background: 'var(--card-raised)', border: '1px solid var(--edge)' }}>
          ⚠ <b>{flagged} question{flagged === 1 ? '' : 's'} to check.</b>{' '}
          <span className="dim">A second read of the passage didn’t agree with the marked answer. Edit it, or tap “Looks right” and save. You can still save or approve either way; approving takes the ⚠ off.</span>
        </p>
      )}
      {qs.map((q, i) => (
        <div
          key={i}
          className="card"
          role="group"
          aria-label={`Question ${i + 1}${q.check ? ', needs a check' : ''}`}
          style={{ padding: '12px 12px 10px', display: 'grid', gap: 8, minWidth: 0, ...(q.check ? { borderColor: 'var(--gold)' } : {}) }}
        >
          <b style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-dim)' }}>
            Question {i + 1}
            {q.check && <span title={checkLine(q)} aria-hidden="true" style={{ marginLeft: 6, color: 'var(--gold)' }}>⚠ check this one</span>}
          </b>
          {q.check && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 200px', fontSize: 12, lineHeight: 1.45 }}>{checkLine(q)}</span>
              <button className="pill" onClick={() => setQs((all) => all.map((x, j) => (j === i ? unflag(x) : x)))} style={{ fontSize: 12, fontWeight: 800 }}>
                Looks right
              </button>
            </div>
          )}
          <input value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} placeholder="What does Jesus call himself here?" maxLength={300} aria-label={`Question ${i + 1}`} />
          {q.options.map((o, k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name={`answer-${i}`}
                checked={q.answerIndex === k}
                onChange={() => setQ(i, { answerIndex: k })}
                aria-label={`Answer ${k + 1} is correct`}
                style={{ flexShrink: 0, width: 18, height: 18 }}
              />
              <input
                value={o}
                onChange={(e) => setOpt(i, k, e.target.value)}
                placeholder={k < 2 ? `Answer ${k + 1}` : `Answer ${k + 1} (optional)`}
                maxLength={120}
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>
          ))}
          <input value={q.teach} onChange={(e) => setQ(i, { teach: e.target.value })} placeholder="Shown after answering — what a wrong answer should learn" maxLength={400} aria-label={`Question ${i + 1} explanation`} />
        </div>
      ))}
      <p className="faint" style={{ margin: '-4px 0 0', fontSize: 11.5, lineHeight: 1.45 }}>
        Mark the right answer with the circle. The last line shows after every answer, right or wrong — a miss should still teach something.
      </p>

      {msg && <p style={{ margin: 0, fontSize: 13, color: msg.ok ? 'var(--mint)' : 'var(--coral)' }}>{msg.text}</p>}
      {saved?.series && backend.setThisWeek && (
        <button
          className="pill"
          onClick={putOnPage}
          disabled={pageLine === 'busy' || pageLine === 'done'}
          style={{ justifySelf: 'start', fontSize: 12.5, whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.4 }}
        >
          {pageLine === 'done'
            ? `✓ Your church page says “${thisWeekLine(saved.series)}”`
            : pageLine === 'failed'
              ? 'Couldn’t update your page — tap to try again'
              : `📌 Put “${thisWeekLine(saved.series)}” on your church page`}
        </button>
      )}
      {saved && !copied && date < addDays(today, 365) && (
        <SeriesCopyPanel
          key={`${date}:${saved.reference}`}
          churchId={churchId}
          from={date}
          today={today}
          defaultUntil={addDays(date, 6)}
          verse={saved}
          backend={backend}
          onDone={(t) => { setCopied(true); setMsg({ ok: true, text: `${t} Tap any day to change it.` }); void loadWeek() }}
        />
      )}
      {draftFlow ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
            Drafted content needs your approval before {churchName}’s members see it.
          </p>
          {backend.saveDraft && (
            <Button variant="secondary" full disabled={busy || loading} onClick={saveAsDraft}>
              {busy ? 'Saving…' : 'Save as draft'}
            </Button>
          )}
          <Button variant="gold" full disabled={busy || loading} onClick={approve}>
            {busy ? 'Saving…' : date === today ? 'Approve for today' : `Approve for ${pretty(date)}`}
          </Button>
          {status === 'draft' && backend.discard && (
            <button className="pill" disabled={busy || loading} onClick={discard} style={{ justifySelf: 'center', fontSize: 12.5 }}>
              {discardArmed ? 'Tap again to discard this draft' : 'Discard this draft'}
            </button>
          )}
        </div>
      ) : (
        <Button variant="gold" full disabled={busy || loading} onClick={save}>
          {busy ? 'Saving…' : date === today ? 'Set today’s verse' : `Set the verse for ${pretty(date)}`}
        </Button>
      )}


      {/* Graphics for the SAVED day (0133): its verse card, and its series'
          graphic when it belongs to one. Made from what is saved, never from
          the fields being edited, so a card can't show words nobody saved. */}
      {assets && !loading && existing && stored && (
        <div style={{ display: 'grid', gap: 10 }}>
          <AssetStudio
            churchId={churchId}
            source={{ kind: 'verse_card', date }}
            canGenerate={assets.canGenerate}
            preview={{ church_name: churchName, date, reference: stored.reference, text: stored.text, series: stored.series ?? null, note: stored.note ?? null }}
          />
          {stored.series && (
            <AssetStudio
              churchId={churchId}
              source={{ kind: 'series_header', series: stored.series }}
              canGenerate={assets.canGenerate}
              preview={seriesPreview(churchName, stored.series, week)}
            />
          )}
        </div>
      )}
      </div>
      )}
    </div>
  )
}

/** What a series graphic would say, from the days on the strip — the thumbnails' stand-in until it is made. */
function seriesPreview(churchName: string, series: string, week: WeekDay[] | null): Record<string, unknown> {
  const days = (week ?? []).filter((w) => w.verse?.series === series)
  return {
    church_name: churchName,
    series,
    days: days.length || null,
    start_date: days[0]?.date ?? null,
    end_date: days[days.length - 1]?.date ?? null,
    references: days.slice(0, 7).map((d) => d.verse!.reference),
  }
}

function WeekStrip(props: {
  week: WeekDay[] | null
  error: boolean
  selected: string
  today: string
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  onPick: (d: string) => void
  onRetry: () => void
}) {
  const { week, error, selected, today } = props
  const unset = week ? week.filter((w) => !w.verse).length : 0
  const drafts = week ? week.filter((w) => w.verse?.status === 'draft').length : 0
  const runs = week ? seriesRuns(week) : []
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ flex: 1, fontSize: 13, fontWeight: 800 }}>
          {week ? `${pretty(week[0].date)} – ${pretty(week[week.length - 1].date)}` : 'The next three weeks'}
        </b>
        <button className="pill" onClick={props.onBack} disabled={!props.canBack} aria-label="Earlier week" style={{ opacity: props.canBack ? 1 : 0.4 }}>‹</button>
        <button className="pill" onClick={props.onForward} disabled={!props.canForward} aria-label="Next week" style={{ opacity: props.canForward ? 1 : 0.4 }}>›</button>
      </div>
      {error ? (
        <button className="pill" onClick={props.onRetry} style={{ justifySelf: 'start', fontSize: 12.5 }}>Couldn&rsquo;t load the week — try again</button>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
          {(week ?? Array.from({ length: WINDOW }, () => null)).map((w, i) => {
            if (!w) return <div key={i} className="skeleton" style={{ height: 58, borderRadius: 10 }} />
            const on = w.date === selected
            const isDraft = w.verse?.status === 'draft'
            const toCheck = isDraft ? flaggedCount(w.verse?.questions) : 0
            const [y, m, d] = w.date.split('-').map(Number)
            const day = new Date(y, m - 1, d)
            return (
              <button
                key={w.date}
                onClick={() => props.onPick(w.date)}
                aria-pressed={on}
                aria-label={`${day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${w.verse ? `${isDraft ? 'draft, not approved: ' : ''}${w.verse.reference}${w.verse.series ? `, ${w.verse.series}` : ''}${toCheck ? `, ${toCheck} to check` : ''}` : 'not set'}`}
                style={{
                  minWidth: 0, padding: '6px 2px', borderRadius: 10, display: 'grid', gap: 2, justifyItems: 'center',
                  borderWidth: 1.5,
                  background: w.verse && !isDraft ? 'var(--select)' : 'var(--card-raised)',
                  borderStyle: isDraft && !on ? 'dashed' : 'solid',
                  borderColor: on ? 'var(--ink-dim)' : isDraft ? 'var(--edge)' : 'transparent',
                  // A day filed under a series wears a bar along its top, so a
                  // run reads as one stretch of the strip.
                  boxShadow: w.verse?.series ? 'inset 0 3px 0 var(--edge)' : undefined,
                  color: 'var(--ink)', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-dim)' }}>
                  {w.date === today ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{d}</span>
                <span aria-hidden="true" style={{ fontSize: 10, color: w.verse && !isDraft ? 'var(--mint)' : 'var(--ink-dim)' }}>{isDraft ? (toCheck ? '✎⚠' : '✎') : w.verse ? (w.verse.note ? '✓✉' : '✓') : '—'}</span>
              </button>
            )
          })}
        </div>
      )}
      {runs.length > 0 && (
        <div style={{ display: 'grid', gap: 2 }}>
          {runs.map((r) => (
            <span key={`${r.from}:${r.name}`} style={{ fontSize: 12, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
              <b>{r.name}</b> <span className="dim">· {r.from === r.to ? pretty(r.from) : `${pretty(r.from)} – ${pretty(r.to)}`}</span>
            </span>
          ))}
        </div>
      )}
      {week && (
        <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
          {unset === 0 && drafts === 0
            ? 'Every one of these days has your verse.'
            : `${unset} of these ${week.length} days ${unset === 1 ? 'has' : 'have'} no church verse${drafts ? `, and ${drafts} ${drafts === 1 ? 'is a draft' : 'are drafts'} waiting for approval` : ''}. ✓ marks a live day, ✎ a draft, ✉ a note, and a bar along the top a day in a series.`}
        </p>
      )}
    </div>
  )
}

/** Consecutive days in the window filed under the same series name. */
function seriesRuns(days: WeekDay[]): { name: string; from: string; to: string }[] {
  const out: { name: string; from: string; to: string }[] = []
  for (const d of days) {
    const name = d.verse?.series
    const last = out[out.length - 1]
    if (name && last && last.name === name && addDays(last.to, 1) === d.date) last.to = d.date
    else if (name) out.push({ name, from: d.date, to: d.date })
  }
  return out
}

/** The church page's "This week" line for a series — 140 chars, like the field. */
export function thisWeekLine(series: string): string {
  return `This week we’re in ${series}`.slice(0, 140)
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)' }

// The content engine, locked: the base tier without the Content Generation
// package. It says what the package is and that it isn't on this church's plan
// — no price, no checkout, the same no-storefront rule as the rest of the
// verified layer. Manual entry above is untouched.
function GenerationLocked() {
  return (
    <div className="card" aria-label="Drafting assist, locked" style={{ padding: '10px 12px', display: 'grid', gap: 4, background: 'var(--card-raised)' }}>
      <b style={{ fontSize: 12.5, fontWeight: 800 }}>🔒 Drafting assist</b>
      <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
        Suggesting a whole week from what your congregation is studying, a week from one sermon, or the questions
        and a note for a passage is the Content Generation package — an add-on this church doesn’t have. Everything
        here still works by hand.
      </span>
    </div>
  )
}
