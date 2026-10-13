import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { todayLocalDate, addDays } from '@/lib/date'
import { VERSE_POOL } from '@/data/bible/pool'
import { aboutVerseSeed } from '@/data/cardAbout'
import {
  deleteScheduledVerse,
  listScheduledVerses,
  scheduleVerse,
  type ScheduledVerse,
} from '@/store/churchAdmin'

// Schedule the congregation's shared verse.
//
// The one fact leadership most needs to know before saving is whether members
// will PLAY it or only READ it, so it is stated under the reference the moment
// one is typed: the daily quiz can only be built from a verse the arcade's
// library carries (`aboutVerseSeed`), and anything else is shown on members'
// Play tab to read while the quiz stays the global verse (`game.ts`'s
// `churchVerseOr`). Picking from the library fills the text in for you.

const NOTE_MAX = 600
const TEXT_MAX = 1000

const REASONS: Record<string, string> = {
  bad_reference: 'That reference doesn’t look right — try the form “John 3:16” or “Psalm 23:1-3”.',
  bad_text: 'Add the words of the verse.',
  note_too_long: `Keep the note under ${NOTE_MAX} characters.`,
  bad_window: 'The end date can’t be before the start date.',
  not_verified: 'Scheduling a verse comes with a verified church.',
  not_leadership: 'Only this church’s leadership can schedule a verse.',
}

export function VerseScheduler({ churchId, churchName }: { churchId: string; churchName: string }) {
  const juice = useJuice()
  const today = todayLocalDate()
  const [reference, setReference] = useState('')
  const [text, setText] = useState('')
  const [textFromLibrary, setTextFromLibrary] = useState(false)
  const [note, setNote] = useState('')
  const [startsOn, setStartsOn] = useState(today)
  const [endsOn, setEndsOn] = useState(addDays(today, 6))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [list, setList] = useState<ScheduledVerse[] | null>(null)

  const seed = useMemo(() => aboutVerseSeed(reference.trim()), [reference])
  const playable = !!seed

  // Picking a library verse fills the text — but never overwrites words the
  // pastor typed themselves.
  useEffect(() => {
    if (seed && (!text || textFromLibrary)) {
      setText(seed.text)
      setTextFromLibrary(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  const refresh = useCallback(async () => {
    const r = await listScheduledVerses(churchId)
    setList(r.ok ? r.data : [])
  }, [churchId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = async () => {
    setBusy(true)
    setMsg(null)
    const r = await scheduleVerse(churchId, {
      reference: reference.trim(),
      text: text.trim(),
      pastorNote: note.trim(),
      startsOn,
      endsOn: endsOn || null,
    })
    setBusy(false)
    if (!r.ok) {
      setMsg({ tone: 'err', text: REASONS[r.reason] ?? 'That didn’t save — check your connection and try again.' })
      return
    }
    juice.coin()
    setMsg({ tone: 'ok', text: `Scheduled. ${churchName}’s members will see it from ${pretty(startsOn)}.` })
    setReference('')
    setText('')
    setTextFromLibrary(false)
    setNote('')
    void refresh()
  }

  const remove = async (v: ScheduledVerse) => {
    const r = await deleteScheduledVerse(v.id)
    if (!r.ok) {
      setMsg({ tone: 'err', text: 'That one couldn’t be removed just now.' })
      return
    }
    void refresh()
  }

  const canSave = reference.trim().length >= 5 && text.trim().length > 0 && !!startsOn && !busy

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <label style={labelStyle}>
        Verse reference
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="John 15:5"
          list="va-pool-refs"
          autoCapitalize="words"
          autoCorrect="off"
          maxLength={40}
        />
        <datalist id="va-pool-refs">
          {VERSE_POOL.map((v) => <option key={v.reference} value={v.reference} />)}
        </datalist>
      </label>
      {reference.trim().length >= 5 && (
        <p style={{ margin: '-4px 0 0', fontSize: 12.5, lineHeight: 1.45, color: playable ? 'var(--mint)' : 'var(--ink-dim)' }}>
          {playable
            ? '✓ In the quiz library — this becomes your members’ daily quiz.'
            : 'Not in the quiz library yet — members will see it to read, and their daily quiz stays the shared verse.'}
        </p>
      )}

      <label style={labelStyle}>
        The verse
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setTextFromLibrary(false) }}
          rows={3}
          maxLength={TEXT_MAX}
          placeholder="I am the vine; you are the branches…"
          style={{ resize: 'vertical' }}
        />
      </label>

      <label style={labelStyle}>
        A note from you (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={NOTE_MAX}
          placeholder="This week we're reading John 15 together. What does 'remain' look like on a Tuesday?"
          style={{ resize: 'vertical' }}
        />
        <span className="faint" style={{ fontWeight: 600, textAlign: 'right' }}>{note.length}/{NOTE_MAX}</span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ ...labelStyle, minWidth: 0 }}>
          Starts
          <input type="date" value={startsOn} min={today} onChange={(e) => setStartsOn(e.target.value)} />
        </label>
        <label style={{ ...labelStyle, minWidth: 0 }}>
          Ends (optional)
          <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </label>
      </div>
      <p className="faint" style={{ margin: '-4px 0 0', fontSize: 11.5, lineHeight: 1.45 }}>
        With no end date it stays until you schedule another. If two overlap, the one that starts
        later wins — so a one-day verse can sit inside a week-long series.
      </p>

      <Preview reference={reference.trim()} text={text.trim()} note={note.trim()} churchName={churchName} playable={playable} />

      {msg && (
        <p style={{ margin: 0, fontSize: 13, color: msg.tone === 'ok' ? 'var(--mint)' : 'var(--coral)' }}>{msg.text}</p>
      )}
      <Button variant="gold" full disabled={!canSave} onClick={save}>
        {busy ? 'Saving…' : 'Schedule this verse'}
      </Button>

      <div style={{ marginTop: 6 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Now and coming up</b>
        {list === null ? (
          <div className="skeleton" style={{ height: 48, borderRadius: 12, marginTop: 8 }} />
        ) : list.length === 0 ? (
          <p className="dim" style={{ margin: '6px 0 0', fontSize: 13 }}>
            Nothing scheduled — your members get the same verse as everyone else.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {list.map((v) => (
              <div key={v.id} className="card" style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14 }}>{v.reference}</b>
                  <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                    {pretty(v.startsOn)} {v.endsOn ? `– ${pretty(v.endsOn)}` : 'onward'}
                    {v.startsOn <= today && (!v.endsOn || v.endsOn >= today) ? ' · showing now' : ''}
                  </div>
                  {v.pastorNote && (
                    <div className="dim" style={{ fontSize: 12.5, marginTop: 4, overflowWrap: 'anywhere' }}>{v.pastorNote}</div>
                  )}
                </div>
                <button className="pill" onClick={() => remove(v)} style={{ fontSize: 12, flexShrink: 0 }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * What a member sees: the church strip under the two daily boxes, and the drop
 * box's line. Drawn from the same words `ChurchTodayStrip` uses, so this
 * preview and the real thing say the same thing.
 */
function Preview({ reference, text, note, churchName, playable }: { reference: string; text: string; note: string; churchName: string; playable: boolean }) {
  if (!reference && !text && !note) return null
  return (
    <div>
      <div className="faint" style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
        Preview — your members' Play tab
      </div>
      {playable && (
        <div className="card" style={{ padding: '10px 12px', marginBottom: 8 }}>
          <span className="pill" style={{ fontSize: 10.5 }}>✦ Today’s Drop</span>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.45 }} className="dim">
            5 quick questions about it, against the clock. Chosen by {churchName} for its members.
          </p>
        </div>
      )}
      <div className="card" style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
        <div className="faint" style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase' }}>⛪ {churchName}</div>
        {playable ? (
          <p style={{ margin: 0, fontSize: 13.5 }}>Today's drop is <b>{reference || '…'}</b>, chosen by your church.</p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13.5 }}>Your church's verse — <b>{reference || '…'}</b></p>
            {text && <p className="dim" style={{ margin: 0, fontSize: 13, fontStyle: 'italic', overflowWrap: 'anywhere' }}>“{text}”</p>}
          </>
        )}
        {note && <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.5, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{note}</p>}
      </div>
    </div>
  )
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)' }
