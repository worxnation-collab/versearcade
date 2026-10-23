import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { BADGES, BORDERS } from '@/data/cosmetics'

// The day a streak first reaches a rung, the border and badge it opens are
// handed over right there — the chest's "Put it on my card" move, for the
// streak. "Ember is yours now" with the equip three taps away in the customizer
// was a reward described rather than given.
//
// Only 7 and 30 offer: the later rungs exist and unlock the same way, they just
// aren't announced here. Both unlock on LONGEST streak (cosmetics.ts), so a
// streak landing exactly on its rung is the first moment they can be owned.
// One tap equips both through `setCosmetics`, which the server gates as ever.
//
// "First" is remembered per account on this device (`va.streakBorder.<id>`),
// written the moment the offer is shown, so reaching 7 again after a reset never
// asks twice. A second device may ask once more; it is harmless, because it only
// ever shows while the rung's look isn't already on. Nothing here is counted or
// sent.

const OFFERED_AT = [7, 30]

const seenKey = (uid: string) => `va.streakBorder.${uid}`

function seen(uid: string): number[] {
  try {
    const raw = localStorage.getItem(seenKey(uid))
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch {
    return []
  }
}

function markSeen(uid: string, rung: number) {
  try {
    const cur = seen(uid)
    if (!cur.includes(rung)) localStorage.setItem(seenKey(uid), JSON.stringify([...cur, rung]))
  } catch {
    /* private mode: worst case the offer can show again, for a look not on */
  }
}

/** The streak-only rung — not the reading ladder, not the patron's ring. */
const atRung = <T extends { requiredStreak: number; requiredChapters?: number }>(list: T[], streak: number) =>
  list.find((c) => c.requiredStreak === streak && !c.requiredChapters && !('pack' in c && c.pack))

export function StreakBorderOffer({ streak, alreadyPlayed }: { streak: number; alreadyPlayed: boolean }) {
  const juice = useJuice()
  const profile = useAuth((s) => s.profile)
  const setCosmetics = useAuth((s) => s.setCosmetics)
  const rung = OFFERED_AT.includes(streak)
  const border = rung ? atRung(BORDERS, streak) : undefined
  const badge = rung ? atRung(BADGES, streak) : undefined

  // Decided once, at mount: equipping changes the profile, and re-deriving
  // would swap the "✓ On your card" state out from under the tap.
  const [show] = useState(() =>
    !!border && !!profile && !alreadyPlayed &&
    (profile.avatarBorder !== border.key || (!!badge && profile.avatarBadge !== badge.key)) &&
    !seen(profile.id).includes(streak),
  )
  const [onCard, setOnCard] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (show && profile) markSeen(profile.id, streak)
  }, [show, profile, streak])

  if (!show || !border) return null

  const what = badge ? `the ${border.name} border and ${badge.emoji} ${badge.name} badge are` : `the ${border.name} border is`

  return (
    <div className="card" style={{ marginTop: 12, textAlign: 'center' }}>
      <p style={{ fontSize: 13, color: 'var(--gold)', lineHeight: 1.5 }}>
        ✦ {streak} days — {what} yours now.
      </p>
      <p className="faint" style={{ fontSize: 12, marginTop: 4 }}>{border.blurb}</p>
      <div style={{ marginTop: 10 }}>
        <Button
          variant={onCard ? 'secondary' : 'gold'}
          full
          disabled={onCard}
          onClick={async () => {
            setErr(null)
            const r = await setCosmetics({ border: border.key, ...(badge ? { badge: badge.key } : {}) })
            if (r.ok) { juice.coin(); setOnCard(true) } else setErr(r.error ?? 'Couldn’t put it on just now.')
          }}
        >
          {onCard ? '✓ On your card' : '🃏 Put it on my card'}
        </Button>
      </div>
      {err && <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>{err}</p>}
    </div>
  )
}
