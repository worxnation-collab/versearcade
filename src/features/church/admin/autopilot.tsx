import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { localTimeZone } from '@/lib/date'
import {
  autopilotTick,
  fetchAutopilot,
  resolveAutopilotFallback,
  saveAutopilot,
  setAutopilotSkip,
  type Autopilot,
} from '@/store/churchAdmin'

// Autopilot (0152) — the church's week drafts itself and waits for the pastor.
//
// One switch on Plan, per church, default OFF, drawn only for verified
// leadership holding Content Generation (every RPC behind it is
// `church_gen_can`, so a free claim or an unverified church never gets past
// the first read and this card renders nothing).
//
//   * ON + a sermon memo sent from "Your sermon" → the 0148 job, queued by
//     itself (WeekDraftPanel ticks "Draft my week for me" for it).
//   * ON + no memo by the cutoff (Monday 9pm, the church's own clock, unless
//     the pastor sets another) → the saved FALLBACK — a topic or one passage —
//     drafts the week instead, through the same week call.
//   * ON + no memo + no fallback → nothing is drafted, and this card and Home
//     say so in a quiet line. Never a week from nothing.
//
// Switching it on with no fallback saved opens the fallback chooser FIRST and
// only turns Autopilot on when that is saved. Switching it on midweek, after
// the cutoff, settles the current week at once — so a pastor who flipped the
// switch with nothing saved used to be greeted by a red "skipped" for a week
// that had passed its deadline before Autopilot existed. Asking first means a
// fallback is in place for that very settle, and the empty days of this week
// are drafted on the spot.
//   * "Skip this week" pauses it for the current week only (a guest speaker, a
//     vacation); the switch stays on.
//
// Every day Autopilot writes is a DRAFT: the review and approve step below is
// unchanged, and nothing reaches a member until the pastor approves it.
//
// There is no cron, so the cutoff is noticed by the first visit after it: the
// dashboard and the church tab send `autopilotTick` on load (once per page
// load per church here), and a due week is claimed on the server exactly once.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ticked = new Map<string, Promise<{ ok: true; data: Autopilot } | { ok: false; reason: string }>>()

/** The church's Autopilot, ticking once per page load. `onJob` fires when the tick made a job. */
export function useAutopilot(churchId: string, enabled: boolean, onJob?: () => void) {
  const [ap, setAp] = useState<Autopilot | null>(null)
  const [failed, setFailed] = useState(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const onJobRef = useRef(onJob)
  onJobRef.current = onJob

  useEffect(() => {
    if (!enabled) return
    let first = ticked.get(churchId)
    const fresh = !first
    if (!first) { first = autopilotTick(churchId); ticked.set(churchId, first) }
    void first.then(async (r) => {
      // A later mount reads the current state rather than replaying the tick —
      // unless the cutoff has passed since (the app was left open), then it ticks.
      let res = fresh ? r : await fetchAutopilot(churchId)
      let made = fresh
      if (!fresh && res.ok && res.data.state === 'due') { res = await autopilotTick(churchId); made = true }
      if (!alive.current) return
      if (res.ok) { setAp(res.data); if (made && res.data.job && res.data.state === 'fallback') onJobRef.current?.() }
      else setFailed(true)
    })
  }, [churchId, enabled])

  const reload = useCallback(async () => {
    const r = await fetchAutopilot(churchId)
    if (alive.current && r.ok) setAp(r.data)
  }, [churchId])
  return { ap, setAp, failed, reload }
}

/** Fire-and-forget, for the church tab: a leader opening it is a visit after the cutoff too. */
export function tickAutopilot(churchId: string) {
  if (!ticked.has(churchId)) ticked.set(churchId, autopilotTick(churchId))
}

export const cutoffLabel = (dow: number, minute: number) => {
  const d = new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60)
  return `${DAYS[dow]} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}
const pad = (n: number) => String(n).padStart(2, '0')
const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : iso
}

/** The one line that says where this week stands. Null when Autopilot is off. */
export function autopilotLine(ap: Autopilot): { tone: 'quiet' | 'gold' | 'coral'; text: string } | null {
  if (!ap.enabled) return null
  const cut = cutoffLabel(ap.cutoffDow, ap.cutoffMinute)
  const fb = ap.fallback ? `“${ap.fallback.label}”` : null
  switch (ap.state) {
    case 'paused': return { tone: 'quiet', text: 'Skipped this week. Autopilot drafts nothing until next Sunday.' }
    case 'memo': return { tone: 'gold', text: 'This week’s sermon memo is in — its week is shown below.' }
    case 'waiting':
      return {
        tone: 'quiet',
        text: `Waiting for this week’s sermon. Send the memo under “Your sermon” and the week drafts itself. ` +
          (fb ? `If none arrives by ${cut}, it drafts from ${fb}.` : `If none arrives by ${cut}, Autopilot skips the week — add a fallback below.`),
      }
    case 'due': return { tone: 'quiet', text: 'Checking this week…' }
    case 'fallback': return { tone: 'gold', text: `No sermon memo by ${cut}, so the week was drafted from ${fb ?? 'your fallback'}${ap.windowFrom ? ` (${day(ap.windowFrom)} – ${day(ap.windowTo)})` : ''}. Review it below.` }
    case 'no_source': return { tone: 'quiet', text: `Nothing drafted this week: no sermon memo arrived by ${cut} and no fallback is set. Plan this week below, or set a fallback so next week drafts itself.` }
    case 'covered': return { tone: 'quiet', text: 'This week was already planned, so Autopilot had nothing to draft.' }
    default: return null
  }
}

const FAIL: Record<string, string> = {
  bad_tz: 'Your device’s time zone wasn’t recognised.',
  bad_cutoff: 'Pick a day and a time for the cutoff.',
  bad_fallback: 'That fallback couldn’t be used — check the topic or passage.',
  bad_reference: 'Type a passage like “John 15:1-11”.',
  passage_too_long: 'Keep the passage inside one chapter, up to 40 verses.',
  passage_unavailable: 'We couldn’t fetch that passage — check it, or try again in a moment.',
  needs_topic: 'Type a topic first.',
  topic_unclear: 'We couldn’t tie that topic to passages — try different words, or use a passage.',
  limit: 'Your church has used today’s drafts — a curated topic or a passage costs none.',
  not_set_up: 'Turn Autopilot on first.',
}

export function AutopilotCard({
  churchId,
  ap,
  setAp,
}: {
  churchId: string
  ap: Autopilot | null
  setAp: (a: Autopilot) => void
}) {
  const juice = useJuice()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  // Switching on with no fallback saved: the chooser opens first, and Save turns it on.
  const [setup, setSetup] = useState(false)
  const [dow, setDow] = useState(1)
  const [time, setTime] = useState('21:00')
  const [kind, setKind] = useState<'none' | 'topic' | 'passage'>('none')
  const [label, setLabel] = useState('')

  const openEdit = () => {
    if (!ap) return
    setDow(ap.cutoffDow)
    setTime(`${pad(Math.floor(ap.cutoffMinute / 60))}:${pad(ap.cutoffMinute % 60)}`)
    setKind(ap.fallback?.kind ?? 'none')
    setLabel(ap.fallback?.label ?? '')
    setErr(null)
    setEditing(true)
  }
  if (!ap) return null

  const save = async (patch: { enabled?: boolean; settings?: boolean }) => {
    setBusy(true); setErr(null)
    let fallback = undefined as Parameters<typeof saveAutopilot>[1]['fallback'] | undefined
    let cutoffDow = ap.cutoffDow, cutoffMinute = ap.cutoffMinute
    if (patch.settings) {
      const [h, m] = time.split(':').map(Number)
      cutoffDow = dow
      cutoffMinute = Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : ap.cutoffMinute
      if (kind === 'none') fallback = null
      else if (ap.fallback && ap.fallback.kind === kind && ap.fallback.label === label.trim()) fallback = undefined
      else {
        const r = await resolveAutopilotFallback(churchId, kind, label)
        if (!r.ok) { setBusy(false); return setErr(FAIL[r.reason] ?? 'That didn’t save — try again in a moment.') }
        fallback = r.data
      }
    }
    // An unchanged fallback is left as saved ('keep'): re-resolving a topic could spend a unit.
    const r = await saveAutopilot(churchId, {
      enabled: patch.enabled ?? ap.enabled,
      tz: localTimeZone(),
      cutoffDow,
      cutoffMinute,
      fallback: fallback === undefined ? 'keep' : fallback,
    })
    setBusy(false)
    if (!r.ok) return setErr(FAIL[r.reason] ?? 'That didn’t save — try again in a moment.')
    juice.select?.()
    setAp(r.data)
    if (patch.settings) { setEditing(false); setSetup(false) }
    // Turning it on after the cutoff: settle this week now, not on the next visit.
    if (r.data.state === 'due') {
      const t = await autopilotTick(churchId)
      if (t.ok) setAp(t.data)
    }
  }

  const skip = async (on: boolean) => {
    setBusy(true); setErr(null)
    const r = await setAutopilotSkip(churchId, on)
    setBusy(false)
    if (!r.ok) return setErr(FAIL[r.reason] ?? 'That didn’t go through — try again in a moment.')
    juice.select?.()
    setAp(r.data)
  }

  const line = autopilotLine(ap)
  return (
    <section className="card" data-autopilot={ap.enabled ? ap.state : 'off'} aria-label="Autopilot" style={{ padding: '12px 14px', display: 'grid', gap: 8, minWidth: 0, borderColor: ap.enabled ? 'var(--gold)' : 'var(--edge)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14.5 }}>✈️ Autopilot</b>
          <div className="dim" style={{ fontSize: 12, lineHeight: 1.45 }}>
            Your week drafts itself from Sunday’s sermon — or from a fallback — and waits here for you. Nothing goes live until you approve it.
          </div>
        </div>
        <button
          role="switch"
          aria-checked={ap.enabled}
          aria-label="Autopilot"
          disabled={busy}
          onClick={() => {
            if (!ap.enabled && !ap.fallback) {
              openEdit()
              setKind('topic')
              setSetup(true)
              return
            }
            void save({ enabled: !ap.enabled })
          }}
          style={{
            width: 48, height: 28, borderRadius: 14, flexShrink: 0, cursor: 'pointer', position: 'relative',
            background: ap.enabled ? 'var(--gold)' : 'var(--card-raised)', border: '1px solid var(--edge)',
          }}
        >
          <span aria-hidden style={{ position: 'absolute', top: 3, left: ap.enabled ? 23 : 3, width: 20, height: 20, borderRadius: 10, background: ap.enabled ? 'var(--card-sunken)' : 'var(--ink-dim)', transition: 'left .15s' }} />
        </button>
      </div>

      {line && (
        <p role="status" data-autopilot-line={ap.state} style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: line.tone === 'coral' ? 'var(--coral)' : line.tone === 'gold' ? 'var(--ink)' : 'var(--ink-dim)' }}>
          {line.text}
        </p>
      )}

      {ap.enabled && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ap.state === 'paused' ? (
            <button className="pill" disabled={busy} onClick={() => void skip(false)} style={{ fontSize: 12.5, fontWeight: 800 }}>Undo — run this week</button>
          ) : (ap.state === 'waiting' || ap.state === 'due') ? (
            <button className="pill" data-skip-week disabled={busy} onClick={() => void skip(true)} style={{ fontSize: 12.5, fontWeight: 800 }}>Skip this week</button>
          ) : null}
          {!editing && (
            <button className="pill" disabled={busy} onClick={openEdit} style={{ fontSize: 12.5 }}>
              {ap.fallback ? 'Cutoff and fallback' : 'Set a fallback'}
            </button>
          )}
        </div>
      )}
      {ap.enabled && !editing && (
        <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
          Cutoff {cutoffLabel(ap.cutoffDow, ap.cutoffMinute)} · Fallback {ap.fallback ? `“${ap.fallback.label}”${ap.fallback.references.length ? ` (${ap.fallback.references.join(', ')})` : ''}` : 'none — a week with no memo is skipped'}
        </span>
      )}

      {(ap.enabled || setup) && editing && (
        <div style={{ display: 'grid', gap: 8 }}>
          {setup && (
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45 }}>
              <b>First, a fallback.</b> If no sermon memo arrives by the cutoff, Autopilot drafts the week from this instead.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)', flex: '1 1 130px' }}>
              If no sermon memo by
              <select value={dow} onChange={(e) => setDow(Number(e.target.value))}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)', flex: '1 1 100px' }}>
              At
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>
          <div role="radiogroup" aria-label="Fallback" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['none', 'topic', 'passage'] as const).map((k) => (
              <button key={k} role="radio" aria-checked={kind === k} className="pill" onClick={() => setKind(k)}
                style={{ fontSize: 12.5, fontWeight: 800, background: kind === k ? 'var(--select)' : undefined }}>
                {k === 'none' ? 'No fallback' : k === 'topic' ? 'A topic' : 'A passage'}
              </button>
            ))}
          </div>
          {kind !== 'none' && (
            <input
              aria-label={kind === 'topic' ? 'Fallback topic' : 'Fallback passage'}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={kind === 'topic' ? 80 : 40}
              placeholder={kind === 'topic' ? 'Prayer, The Fruit of the Spirit, Advent…' : 'Psalm 23:1-6'}
              autoCorrect="off"
            />
          )}
          <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
            {kind === 'none'
              ? 'With no fallback, a week with no sermon memo is skipped — nothing is drafted from nothing.'
              : 'The week is drafted from this, as drafts for you to review, only when no memo arrives by the cutoff. The words come from the Berean Standard Bible.'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" disabled={busy || (kind !== 'none' && !label.trim())} onClick={() => void save(setup ? { settings: true, enabled: true } : { settings: true })}>
              {busy ? 'Saving…' : setup ? 'Turn on Autopilot' : 'Save'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setEditing(false); setSetup(false) }}>Cancel</Button>
          </div>
        </div>
      )}
      {err && <span role="alert" style={{ fontSize: 12, color: 'var(--coral)' }}>{err}</span>}
    </section>
  )
}
