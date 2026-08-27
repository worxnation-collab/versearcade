import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { pushSupported, pushPermission, enablePush } from '@/lib/push'

// Asking for notifications, at a moment the answer is obviously yes.
//
// enablePush() had exactly one caller — a toggle inside the settings sheet — and
// across the whole user base that produced a single push subscription. Nobody
// opens settings to turn notifications on. So the ask moved to the two places
// where the player has just been handed a reason to want one: a streak worth
// protecting, and a buddy request whose answer arrives later, from someone else.
//
// Rules this keeps to, because a notification prompt is easy to make hostile:
//   · never on first launch, and never before the player has something to lose
//   · one ask per week, three asks ever, then it stops for good
//   · "Not now" is a real answer — no second card, no red dot, no nagging
//   · a denied browser permission is permanent; never ask again after it
//
// It is also strictly opt-in to a *helpful* message. Nothing here notifies
// anyone that they are behind someone else — same rule as the rest of the app.

const KEY = 'va.pushAsk'
const WEEK = 7 * 24 * 60 * 60 * 1000
const MAX_ASKS = 3

interface AskState { count: number; last: number }

function readState(): AskState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { count: 0, last: 0 }
    const p = JSON.parse(raw) as Partial<AskState>
    return { count: Number(p.count) || 0, last: Number(p.last) || 0 }
  } catch {
    return { count: 0, last: 0 }
  }
}

function noteAsked() {
  try {
    const s = readState()
    localStorage.setItem(KEY, JSON.stringify({ count: s.count + 1, last: Date.now() }))
  } catch {
    /* a browser that won't store this just gets asked again later */
  }
}

/** Silence it permanently — they said yes, or they're out of asks. */
function stopAsking() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ count: MAX_ASKS, last: Date.now() }))
  } catch {
    /* ignore */
  }
}

export type NudgeReason = 'streak' | 'buddy'

const COPY: Record<NudgeReason, { icon: string; title: string; body: string; cta: string }> = {
  streak: {
    icon: '🔔',
    title: 'Keep the streak alive',
    body: 'Want a nudge on days you haven’t played yet? One reminder, only when your streak is actually at risk.',
    cta: 'Remind me',
  },
  buddy: {
    icon: '📨',
    title: 'We’ll tell you when they answer',
    body: 'Buddy requests get answered whenever your friend next opens the app. Turn on notifications and you’ll know the moment they do.',
    cta: 'Let me know',
  },
}

/**
 * Renders nothing unless asking is genuinely appropriate right now.
 *
 * `when` is the caller's judgement that this is a good moment — a streak worth
 * keeping, a request just sent. Everything else (support, permission, existing
 * subscription, ask budget) is decided here so no caller has to remember it.
 */
export function PushNudge({ reason, when = true }: { reason: NudgeReason; when?: boolean }) {
  const juice = useJuice()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!when) return
    if (!pushSupported()) return
    // The permission is the whole gate, and it's synchronous.
    //
    // 'granted' means they already have a subscription; 'denied' is the
    // browser's final answer and asking again can't even raise a prompt. Only
    // 'default' can be acted on. There's deliberately no isPushSubscribed()
    // call here: it awaits navigator.serviceWorker.ready, which never resolves
    // at all if registration failed, and a hung promise would leave this
    // rendering nothing forever — silently disabling the one prompt that
    // exists to fix a push-subscription count of 1.
    if (pushPermission() !== 'default') return
    const st = readState()
    if (st.count >= MAX_ASKS) return
    if (Date.now() - st.last < WEEK) return
    setShow(true)
  }, [when])

  if (!show) return null

  const accept = async () => {
    if (busy) return
    setBusy(true)
    noteAsked()
    try {
      const ok = await enablePush()
      if (ok) {
        stopAsking()
        juice.coin()
        setDone(true)
      } else {
        // Denied, or the subscribe failed. Either way, stop occupying the screen.
        setShow(false)
      }
    } catch {
      setShow(false)
    } finally {
      setBusy(false)
    }
  }

  const dismiss = () => {
    juice.select?.()
    noteAsked()
    setShow(false)
  }

  const copy = COPY[reason]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, type: 'spring', stiffness: 220, damping: 20 }}
      className="card"
      style={{ marginTop: 16, textAlign: 'left', borderColor: 'var(--mint)', background: 'rgba(78,205,196,0.08)' }}
    >
      {done ? (
        <p style={{ fontSize: 14, margin: 0, color: 'var(--mint)' }}>
          ✓ Notifications on. You can turn them off any time in Settings.
        </p>
      ) : (
        <>
          <div style={{ fontSize: 24 }}>{copy.icon}</div>
          <b style={{ fontSize: 16, display: 'block', marginTop: 2 }}>{copy.title}</b>
          <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>{copy.body}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="secondary" full onClick={accept} disabled={busy}>
              {busy ? '…' : copy.cta}
            </Button>
            <button className="pill" onClick={dismiss} style={{ fontWeight: 700, fontSize: 13, flex: 'none' }}>
              Not now
            </button>
          </div>
        </>
      )}
    </motion.div>
  )
}
