// The ask under the founder's player card.
//
// Tap the founder's face anywhere in the app and their card pops up wearing the
// Founder tag; under it, THIS: the one product, offered from the one place its
// maker is on screen. It says who built the thing and that buying the founding
// patron is how you say thanks — the same sale /you's support card makes, on
// the card of the person the money actually reaches.
//
// It is the second surface to offer the patron skin, so it makes no decision
// of its own: `patronOffer` (lib/commerce) says whether a sale may be shown
// here at all, and `PatronBuyButton` starts it. That is what keeps it inside
// every rule the first surface follows —
//
//   * hidden for a guest (no account to land the skin on), hidden when the
//     store can't complete a sale, hidden on native until StoreKit has the
//     product — never a greyed button, never "opening soon";
//   * a PATRON is never asked again. They get one warm line, no checkout —
//     which is also what the founder sees on their own card, since they own it;
//   * the price is `displayPrice`: Apple's localized string on native, the
//     catalog's USD on web.
//
// It renders only on the founder's card (data/founder decides who that is), so
// nobody else's card can grow a checkout under it by passing a flag.

import { useAuth } from '@/store/auth'
import { useSeason } from '@/store/season'
import { allSkins, skinOwned } from '@/data/avatar'
import { isFounder } from '@/data/founder'
import { PATRON_SKU, patronOffer, displayPrice } from '@/lib/commerce'
import { skinBuyUrl } from '@/lib/config'
import { PatronBuyButton } from './PatronCard'

export function FounderSupport({ username }: { username: string }) {
  const me = useAuth((s) => s.profile)
  const seasonUnlocks = useSeason((s) => s.unlocks)
  if (!isFounder(username) || !me) return null

  const skin = allSkins().find((s) => s.id === PATRON_SKU)
  if (!skin) return null
  const owned = skinOwned(skin, {
    sharedDays: me.sharedDays,
    ownedSkins: me.ownedSkins,
    referralCount: me.referralCount,
    admin: me.isAdmin,
    seasonUnlocks,
  })
  const offer = patronOffer(skin, owned, skinBuyUrl(PATRON_SKU))
  if (offer === 'hidden') return null

  if (offer === 'owned') {
    return (
      <p className="faint" style={{ fontSize: 12, marginTop: 10, textAlign: 'center', lineHeight: 1.45 }}>
        🪨 You’re a founding patron — the rock this is built on. Thank you.
      </p>
    )
  }

  const price = displayPrice(PATRON_SKU, skin.price)

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>@{username} built this</b>
      <p className="faint" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
        Verse Arcade is one person’s work and it stays free — no ads, no energy
        bar, nothing held back for payers. Becoming a founding patron is how you
        say thanks: it buys the {skin.name} skin and the Cornerstone card, and it
        pays for the next thing.
        {price && (
          <>
            {' '}
            <b style={{ color: 'var(--gold)' }}>{price}</b>, once.
          </>
        )}
      </p>
      <div style={{ marginTop: 10 }}>
        <PatronBuyButton username={me.username} />
      </div>
    </div>
  )
}
