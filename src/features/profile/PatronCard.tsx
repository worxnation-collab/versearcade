// The support card — the one place in this app that asks the player for money.
//
// It exists because the founding patron was, in practice, unreachable: the only
// way to find it was to open Customize, choose the Skins tab, scroll to a
// locked whale and tap it. That is not a shop, it is a thing you could stumble
// on, and the app has one product.
//
// What it must NOT become is a nag. Three things hold that line, and they are
// the reason this can sit on /you at all:
//
//   * it is asked ONCE. A patron sees a thank-you, never the offer again
//     (`patronOffer` returns 'owned'), because a one-off thank-you that keeps
//     asking is a subscription with extra steps;
//   * it sells a THANK-YOU, not power. The whale is a skin. There is no rank,
//     no XP, no multiplier and nothing a non-patron is behind on — the same
//     reason a paid church skin is "not a bigger church". If a supporter perk
//     ever touches a number that ranks people, this card is the wrong home for
//     it and the no-losers rule is the thing that broke;
//   * it sits BELOW the room and the collection, above the account controls —
//     the settled end of your own profile, not in front of the day's verse.
//
// Whether it may draw at all is `patronOffer` in lib/commerce, never a check
// here: this file renders a decision, it does not make one. A price shown is
// always `displayPrice`, which on native is Apple's localized string and on web
// the catalog's USD.

import { useState } from 'react'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { useSeason } from '@/store/season'
import { allSkins, skinOwned, DEFAULT_AVATAR, type SkinDef } from '@/data/avatar'
import { PATRON_SKU, patronOffer, displayPrice } from '@/lib/commerce'
import { skinBuyUrl } from '@/lib/config'
import { startSkinCheckout } from '@/lib/checkout'
import { useJuice } from '@/juice/useJuice'

export function PatronCard() {
  const profile = useAuth((s) => s.profile)
  const seasonUnlocks = useSeason((s) => s.unlocks)
  const juice = useJuice()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const skin: SkinDef | undefined = allSkins().find((s) => s.id === PATRON_SKU)
  if (!profile || !skin) return null

  const owned = skinOwned(skin, {
    sharedDays: profile.sharedDays,
    ownedSkins: profile.ownedSkins,
    referralCount: profile.referralCount,
    admin: profile.isAdmin,
    seasonUnlocks,
  })
  const offer = patronOffer(skin, owned, skinBuyUrl(PATRON_SKU))
  if (offer === 'hidden') return null

  const spec = profile.avatarCharacter ?? DEFAULT_AVATAR
  const preview = (
    <Avatar
      emoji={profile.avatarEmoji}
      character={{ ...spec, skinId: skin.id, regalia: null }}
      size={64}
      ring={false}
    />
  )

  if (offer === 'owned') {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {preview}
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontFamily: 'var(--font-display)' }}>You’re a founding patron</b>
          <p className="faint" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>
            {skin.name} is yours, and so is the fact that this app has no ads, no
            energy bar and nothing locked behind a subscription. Thank you. 🙏
          </p>
        </div>
      </div>
    )
  }

  const price = displayPrice(PATRON_SKU, skin.price)

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {preview}
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontFamily: 'var(--font-display)' }}>Become a founding patron</b>
          <p className="faint" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>
            Verse Arcade is built by one person, and it stays free: no ads, no
            energy, nothing that makes you wait. If it’s worth something to you,
            this is the way to say so — and {skin.name} comes with it.
          </p>
        </div>
      </div>

      {price && (
        <p
          className="gradient-text"
          style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginTop: 12 }}
        >
          {price}
        </p>
      )}

      <div style={{ marginTop: 10 }}>
        <Button
          variant="gold"
          full
          disabled={busy}
          onClick={async () => {
            juice.coin()
            setBusy(true)
            const result = await startSkinCheckout(PATRON_SKU, profile.username)
            setBusy(false)
            // Never close a paid tap in silence. 'unconfirmed' is the one that
            // matters: Apple charged and the entitlement hasn't landed, so the
            // honest instruction is to wait and Restore, not an apology.
            if (result === 'failed') {
              setNote('That didn’t go through — you haven’t been charged.')
            } else if (result === 'unconfirmed') {
              setNote('Payment went through. Your skin should appear in a moment — if it doesn’t, tap Restore purchases in Customize.')
            } else if (result === 'bought') {
              setNote('Thank you. 🙏')
            }
          }}
        >
          {busy ? 'Opening…' : '💛 Support Verse Arcade'}
        </Button>
        <p className="faint" style={{ fontSize: 10, marginTop: 8, textAlign: 'center', lineHeight: 1.4 }}>
          One payment, never a subscription. It buys a skin and a thank-you — no
          points, no rank, nothing other players are behind on.
        </p>
        {note && (
          <p className="faint" style={{ fontSize: 11, marginTop: 6, textAlign: 'center' }}>{note}</p>
        )}
      </div>
    </div>
  )
}
