import { useEffect } from 'react'
import { useBattleXp } from '@/store/battleXp'
import { allSkins, skinOwned } from '@/data/avatar'
import { useAuth } from '@/store/auth'

// The one line a finished battle says about what it was worth.
//
// It is deliberately a STATEMENT ABOUT YOUR OWN DAY and never a comparison:
// what a battle pays, how many of today's have paid, and how far off the next
// live-battle skin is. There is no opponent in any sentence here, and nothing
// on this line changes depending on whether you won — because nothing about the
// payout does (see data/battleXp).
//
// It draws nothing at all when the card is unknown (a guest, no keys, or 0086
// not applied yet). A result screen must never carry an error about a reward.
export function BattleXpLine({ live }: { live?: boolean }) {
  const { card, load } = useBattleXp()
  const profile = useAuth((s) => s.profile)

  useEffect(() => {
    void load()
  }, [load])

  if (!card) return null

  const atCap = card.today >= card.cap
  // The next live-battle skin, if there is one still to come. Owned is checked
  // through the same skinOwned every grid uses, so this line and the wardrobe
  // can't disagree about what is unlocked.
  const nextSkin = live
    ? allSkins()
        .filter((s) => s.liveGoal != null)
        .sort((a, b) => (a.liveGoal ?? 0) - (b.liveGoal ?? 0))
        .find((s) => !skinOwned(s, { liveBattles: card.liveBattles, sharedDays: profile?.sharedDays, ownedSkins: profile?.ownedSkins, referralCount: profile?.referralCount }))
    : undefined

  return (
    <p className="faint center" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.6 }}>
      {atCap
        ? `That's today's ${card.cap} battle rewards in. Play as many as you like — they still count.`
        : `+${card.pay} XP for turning up — ${card.today} of ${card.cap} battles today.`}
      {nextSkin && (
        <>
          <br />
          {card.liveBattles} live {card.liveBattles === 1 ? 'battle' : 'battles'} played ·{' '}
          {Math.max(0, (nextSkin.liveGoal ?? 0) - card.liveBattles)} more for {nextSkin.name}
        </>
      )}
    </p>
  )
}
