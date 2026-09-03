// The ask on the founder's player card.
//
// Tap the founder's face anywhere in the app — a board, a battle row, a
// churchyard — and their card pops up wearing the Founder tag and, along the
// top of the card, a slim gold bar: "Get this card · become a founder". It
// opens a sheet that says who built the thing and that buying the founding
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
//   * a PATRON is never asked again. They get one warm line, no checkout;
//   * the price is `displayPrice`: Apple's localized string on native, the
//     catalog's USD on web.
//
// One deliberate exception to "never asked again": the FOUNDER sees the bar on
// their own card. They own the skin, so `patronOffer` says 'owned' and would
// hide it — and then the one person who most needs to know the ask exists
// would be the one person who could never see it. Their tap opens a preview
// of the sheet others get, with the checkout replaced by a line saying so.
//
// It renders only on the founder's card (data/founder decides who that is), so
// nobody else's card can grow a checkout by passing a flag.

import { useState } from 'react'
import { useAuth } from '@/store/auth'
import { useSeason } from '@/store/season'
import { allSkins, skinOwned, type SkinDef } from '@/data/avatar'
import { isFounder } from '@/data/founder'
import { PATRON_SKU, patronOffer, displayPrice, type PatronOffer } from '@/lib/commerce'
import { skinBuyUrl } from '@/lib/config'
import { QuickSheet } from '@/components/QuickSheet'
import { useJuice } from '@/juice/useJuice'
import { PatronBuyButton } from './PatronCard'

interface FounderOffer {
  offer: PatronOffer
  skin: SkinDef
  /** The viewer is the founder looking at their own card. */
  self: boolean
  viewer: string
}

/** What, if anything, the founder's card may offer the person looking at it. */
function useFounderOffer(username: string): FounderOffer | null {
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
  return {
    offer: patronOffer(skin, owned, skinBuyUrl(PATRON_SKU)),
    skin,
    self: isFounder(me.username),
    viewer: me.username,
  }
}

/**
 * The slim gold bar along the top of the founder's card. Renders for a viewer
 * who can be sold to, and for the founder themself (preview); nothing else.
 */
export function FounderPill({ username }: { username: string }) {
  const juice = useJuice()
  const [open, setOpen] = useState(false)
  const fo = useFounderOffer(username)
  if (!fo) return null
  const show = fo.offer === 'buy' || (fo.offer === 'owned' && fo.self)
  if (!show) return null

  return (
    <>
      <button
        onClick={() => { juice.select(); setOpen(true) }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          width: '100%',
          marginBottom: 10,
          padding: '8px 12px',
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          fontWeight: 800,
          fontSize: 12.5,
          letterSpacing: '0.02em',
          color: '#2a1e05',
          background: 'linear-gradient(90deg, #fff1b8, var(--gold) 45%, var(--tangerine))',
          boxShadow: '0 0 16px rgba(255,210,63,0.45), 0 4px 12px rgba(0,0,0,0.35)',
        }}
      >
        <span aria-hidden>🪨</span>
        <span>Get this card · become a founder</span>
        <span aria-hidden style={{ opacity: 0.7 }}>→</span>
      </button>
      {open && (
        <QuickSheet title="🪨 Become a founder" onClose={() => setOpen(false)} zIndex={112}>
          <FounderOfferBody username={username} fo={fo} />
        </QuickSheet>
      )}
    </>
  )
}

function FounderOfferBody({ username, fo }: { username: string; fo: FounderOffer }) {
  const price = displayPrice(PATRON_SKU, fo.skin.price)
  return (
    <div>
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>@{username} built this</b>
      <p
        style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5, fontStyle: 'italic', color: 'var(--gold)' }}
      >
        “You are Peter, and on this rock I will build my church.”
        <span className="faint" style={{ fontStyle: 'normal' }}> · Matthew 16:18</span>
      </p>
      <p className="faint" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.55 }}>
        Verse Arcade is one person’s work and it stays free — no ads, no energy
        bar, nothing held back for payers. Becoming a founding patron is how you
        say thanks. It buys this card — the Cornerstone, with its gold veins and
        gold name — the {fo.skin.name} skin, and the ring to match, and it pays
        for the next thing.
        {price && (
          <>
            {' '}
            <b style={{ color: 'var(--gold)' }}>{price}</b>, once. Never a subscription.
          </>
        )}
      </p>
      <div style={{ marginTop: 14 }}>
        {fo.offer === 'buy' ? (
          <PatronBuyButton username={fo.viewer} />
        ) : (
          <p className="faint" style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.45 }}>
            🪨 You’re the rock this is built on. Other players see a “Become a
            founding patron” button here.
          </p>
        )}
      </div>
      <p className="faint" style={{ fontSize: 10, marginTop: 10, textAlign: 'center', lineHeight: 1.4 }}>
        A look and a thank-you — no points, no rank, nothing other players are behind on.
      </p>
    </div>
  )
}
