import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/store/auth'
import { useWashing } from '@/store/washing'
import { useJuice } from '@/juice/useJuice'
import { WASH_DAILY_CAP, type WashMilestone } from '@/data/washing'

// "Wash their feet" — one control, used everywhere a single other player is on
// screen (their card, a buddy row, the basin's own list). One component so the
// rules can't drift between surfaces, the same choke-point habit as QuizRunner
// and KeepScene.
//
// It never scolds. Already washed them today, out of washings, signed out —
// each one draws as a calm state with a plain reason, never a red error and
// never a disabled control with no explanation.

interface Props {
  username: string
  /** `pill` for a row, `wide` for a card's action grid. */
  size?: 'pill' | 'wide'
  /** Fires when a washing lands, with the milestone it reached (if any). */
  onWashed?: (milestone: WashMilestone | null) => void
}

export function WashFeetButton({ username, size = 'pill', onWashed }: Props) {
  const juice = useJuice()
  const me = useAuth((s) => s.profile)
  const isGuest = useAuth((s) => s.mode) === 'local'
  const { loaded, load, wash, didToday, remaining } = useWashing()
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  // A message here is a note, not a state: it says its piece and gets out of
  // the way, so a row never keeps yesterday's "already today" on screen.
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2600)
    return () => clearTimeout(t)
  }, [flash])

  // The button has to know today's tally before it can draw itself, and it can
  // appear on a screen that never loads the store (a card opened from a crowd).
  useEffect(() => { if (!loaded && !isGuest) void load() }, [loaded, isGuest, load])

  const isMe = !!me && me.username.toLowerCase() === username.replace(/^@/, '').toLowerCase()
  if (isMe || isGuest) return null

  const done = didToday(username)
  const left = remaining()
  const spent = left <= 0 && !done

  const go = async () => {
    if (busy || done || spent) return
    setBusy(true)
    const res = await wash(username)
    setBusy(false)
    if (res.ok) {
      // A wash is a small, warm thing: a soft chime, not a fanfare — unless it
      // landed on a rung (the caller celebrates that) or the single point
      // happened to tip a level, which is worth the usual noise.
      if (res.leveledUp) juice.levelUp()
      else juice.coin()
      setFlash('+1 XP')
      onWashed?.(res.milestone ?? null)
      return
    }
    juice.select()
    setFlash(
      res.reason === 'cap' ? `That's all ${WASH_DAILY_CAP} for today`
        : res.reason === 'already' ? 'Already today'
        : res.reason === 'not_found' ? 'No such player'
        : 'Try again in a moment',
    )
  }

  const label = done ? '✓ Washed today' : spent ? '🫗 None left today' : busy ? '…' : '🫗 Wash their feet'
  const quiet = done || spent

  if (size === 'wide') {
    return (
      <div>
        <motion.button
          whileTap={quiet ? undefined : { scale: 0.96 }}
          onClick={go}
          aria-label={`Wash @${username}'s feet`}
          style={{
            width: '100%',
            padding: '13px 14px',
            borderRadius: 16,
            fontFamily: 'var(--font-display)',
            fontSize: 15,
            fontWeight: 800,
            cursor: quiet ? 'default' : 'pointer',
            border: '1.5px solid var(--stroke)',
            background: quiet ? 'transparent' : 'var(--card-solid)',
            color: quiet ? 'var(--ink-dim)' : '#fff',
            boxShadow: quiet ? 'none' : '0 5px 0 rgba(0,0,0,0.4)',
          }}
        >
          {label}
        </motion.button>
        <p className="faint center" style={{ fontSize: 11, marginTop: 6 }}>
          {flash ?? (done ? 'They’ll see it on their basin.' : `${left} of ${WASH_DAILY_CAP} left today · +1 XP`)}
        </p>
      </div>
    )
  }

  return (
    <button
      className="pill"
      onClick={go}
      aria-label={`Wash @${username}'s feet`}
      title={done ? 'Already washed today' : `Wash their feet — ${left} of ${WASH_DAILY_CAP} left today`}
      style={{
        fontWeight: 800,
        fontSize: 13,
        whiteSpace: 'nowrap',
        opacity: quiet ? 0.55 : 1,
        cursor: quiet ? 'default' : 'pointer',
      }}
    >
      {flash === '+1 XP' ? '✓ +1 XP' : done ? '✓ 🫗' : spent ? '🫗' : '🫗 Wash'}
    </button>
  )
}
