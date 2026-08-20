import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { SUPPORT_URL, skinBuyUrl } from '@/lib/config'
import { cardBgVisible, displayPrice, skinVisible, storefrontEnabled } from '@/lib/commerce'
import { isNativeApp } from '@/lib/appStore'
import { iapAvailable } from '@/lib/iap'
import { useIap } from '@/store/iap'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { BORDERS, BADGES, isUnlocked } from '@/data/cosmetics'
import { useCollection } from '@/store/collection'
import { collectibleByKey } from '@/data/collectibles'
import { CARD_BACKGROUNDS, DEFAULT_CARD_BG, cardBgStyle, cardArtProps, cardBgAccentColor, cardBgUnlocked } from '@/data/playerCards'
import { CardArt } from '@/data/cardArt'
import {
  ARMOR,
  SKINS,
  ROBES,
  DEFAULT_AVATAR,
  distinctSharedDays,
  accessOwned,
  accessLabel,
  ITEMS,
  FULL_SKINS,
  BUNDLES,
  bundleExpired,
  bundleItemCount,
  packEntitled,
  packPreviewable,
  skinExpired,
  skinOwned,
  equippedSkinId,
  type ArmorPieceDef,
  type BundleDef,
  type ItemDef,
  type SkinDef,
  type Swatch,
} from '@/data/avatar'
import { BundleSheet } from './BundleSheet'

// "Customize" — streak-unlocked avatar borders + badges. Unlock eligibility is
// based on the player's LONGEST streak ever, so a missed day never takes a
// cosmetic away. Locked items stay visible (with the milestone needed) as a
// gentle pull toward the next streak.
//
// This is the whole body of the profile's Customize screen, which is already a
// dedicated place for exactly this — so it has no show/hide header of its own,
// just the sections.
export function CustomizeSection() {
  const profile = useAuth((s) => s.profile)!
  const setCosmetics = useAuth((s) => s.setCosmetics)
  const juice = useJuice()
  const [err, setErr] = useState<string | null>(null)
  const [devNoteOpen, setDevNoteOpen] = useState(false)
  const [buyTarget, setBuyTarget] = useState<SkinDef | null>(null)
  const [bundleTarget, setBundleTarget] = useState<BundleDef | null>(null)
  const [redeemTarget, setRedeemTarget] = useState<SkinDef | null>(null)
  const [redeemInput, setRedeemInput] = useState('')
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [buying, setBuying] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null)
  const loadIap = useIap((s) => s.load)
  const buyIap = useIap((s) => s.buy)
  const restoreIap = useIap((s) => s.restore)
  // Ask StoreKit for the catalog when the customizer opens. Until it answers,
  // storefrontEnabled() is false on native and no price is rendered anywhere.
  useEffect(() => { void loadIap() }, [loadIap])
  const refreshProfile = useAuth((s) => s.refreshProfile)

  const doRedeem = async () => {
    if (!redeemTarget) return
    if (!supabase) { setRedeemMsg('Create an account to redeem a code.'); return }
    setRedeeming(true)
    setRedeemMsg(null)
    const { data, error } = await supabase.rpc('redeem_code', { p_code: redeemInput })
    setRedeeming(false)
    const res = data as { ok?: boolean; skin?: string } | null
    if (error || !res?.ok) {
      setRedeemMsg('That code isn’t valid or has ended.')
      return
    }
    await refreshProfile()
    juice.celebrate?.()
    setAvatarCharacter({ ...spec, skinId: redeemTarget.id, regalia: null })
    setRedeemTarget(null)
    setRedeemInput('')
    flashSaved()
  }
  const [savedFlash, setSavedFlash] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Brief "Saved ✓" confirmation — the builder auto-saves on every change, so
  // this makes the (otherwise invisible) save visible.
  const flashSaved = () => {
    setSavedFlash(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedFlash(false), 1500)
  }

  const setAvatarCharacter = useAuth((s) => s.setAvatarCharacter)
  const setCardBackground = useAuth((s) => s.setCardBackground)
  const ownedCollectibles = useCollection((s) => s.owned)

  const longest = profile.longestStreak
  const equippedBorder = profile.avatarBorder || 'default'
  const equippedBadge = profile.avatarBadge ?? 'none'
  const spec = profile.avatarCharacter ?? DEFAULT_AVATAR
  const equippedPieces = ARMOR.filter((a) => spec.armor[a.slot]).length

  const equippedBg = profile.cardBackground ?? DEFAULT_CARD_BG
  // Pack cards gate on the skin entitlement rather than a collectible, so the
  // picker needs both sources of ownership.
  const bgCtx = { ownedSkins: profile.ownedSkins ?? [], admin: profile.isAdmin }
  // A card that only ships with a paid pack is hidden in a native build until
  // the pack is owned — the app has no way to sell it (see lib/commerce). The
  // "x/y unlocked" count follows the same list, so it never reads as short.
  const visibleBgs = CARD_BACKGROUNDS.filter((b) =>
    cardBgVisible(b, cardBgUnlocked(b.key, ownedCollectibles, bgCtx)),
  )
  const unlockedBgCount = visibleBgs.filter((b) => cardBgUnlocked(b.key, ownedCollectibles, bgCtx)).length

  const pickBg = async (key: string) => {
    setErr(null)
    juice.select()
    const res = await setCardBackground(key)
    if (!res.ok) setErr(res.error ?? 'That background isn’t unlocked yet')
    else flashSaved()
  }

  const equip = async (patch: { border?: string; badge?: string | null }) => {
    setErr(null)
    juice.select()
    const res = await setCosmetics(patch)
    if (!res.ok) setErr(res.error ?? 'That’s not unlocked yet')
  }

  const toggleArmor = (def: ArmorPieceDef) => {
    if (!accessOwned(def.access, longest, profile.isAdmin)) {
      setErr(`${def.name} unlocks with a ${accessLabel(def.access).text.toLowerCase()}`)
      return
    }
    setErr(null)
    juice.select()
    setAvatarCharacter({ ...spec, armor: { ...spec.armor, [def.slot]: !spec.armor[def.slot] } })
    flashSaved()
  }

  const pickSkin = (s: Swatch) => {
    setErr(null)
    juice.select()
    setAvatarCharacter({ ...spec, skin: s.key })
    flashSaved()
  }

  const pickRobe = (r: Swatch) => {
    if (!accessOwned(r.access, longest, profile.isAdmin)) {
      setErr(`${r.name} is a Studio color`)
      return
    }
    setErr(null)
    juice.select()
    setAvatarCharacter({ ...spec, robe: r.key })
    flashSaved()
  }

  const ownedItems = profile.ownedItems ?? []
  const myItems = profile.isAdmin ? ITEMS : ITEMS.filter((i) => ownedItems.includes(i.id))
  const toggleItem = (item: ItemDef) => {
    setErr(null)
    juice.select()
    const nextItems = { ...(spec.items ?? {}) }
    if (nextItems[item.slot] === item.id) delete nextItems[item.slot]
    else nextItems[item.slot] = item.id
    setAvatarCharacter({ ...spec, items: nextItems })
    flashSaved()
  }

  const sharedCount = distinctSharedDays(profile.sharedDays)
  const grantSkin = useAuth((s) => s.grantSkin)
  const ownedSkins = profile.ownedSkins ?? []
  const equippedSkin = equippedSkinId(spec)
  const isSkinOwned = (skin: SkinDef) =>
    skinOwned(skin, { sharedDays: profile.sharedDays, ownedSkins, referralCount: profile.referralCount, admin: profile.isAdmin })
  const onSkinTap = (skin: SkinDef) => {
    const owned = isSkinOwned(skin)
    if (!owned && skin.source === 'earned') {
      if (skin.referralGoal != null) {
        const rc = profile.referralCount ?? 0
        setErr(`${skin.name}: ${Math.min(rc, skin.referralGoal)}/${skin.referralGoal} friends joined with your code`)
      } else {
        const goal = skin.shareGoal ?? 0
        setErr(`${skin.name}: shared ${Math.min(sharedCount, goal)}/${goal} days`)
      }
      return
    }
    // Locked paid skin: the operator account (admin) previews it free; everyone
    // else gets the purchase prompt instead of a free grant. A bundle-only skin
    // has no purchase of its own — it always routes to its pack.
    if (!owned && skin.source === 'paid' && !profile.isAdmin) {
      juice.select()
      // A free promo-code skin redeems in every build — no price, no checkout.
      // Anything with a price simply doesn't exist in a native build, so there
      // is no sheet to open (see lib/commerce). The tile is already hidden
      // there; this is the second lock on the same door.
      if (skin.exclusive) { setRedeemMsg(null); setRedeemTarget(skin) }
      else if (storefrontEnabled()) {
        const bundle = skin.bundleOnly ? BUNDLES.find((b) => b.id === skin.pack) : undefined
        if (bundle) setBundleTarget(bundle)
        else setBuyTarget(skin)
      }
      return
    }
    setErr(null)
    juice.select()
    if (!owned && skin.source === 'paid') grantSkin(skin.id) // admin preview
    const willEquip = equippedSkin !== skin.id
    setAvatarCharacter({ ...spec, skinId: willEquip ? skin.id : null, regalia: null })
    flashSaved()
  }

  return (
    <>
      {/* ── Character builder ─────────────────────────────────────────── */}
      <Section title="Your Character" defaultOpen right={savedFlash ? <span style={{ color: 'var(--good)', fontWeight: 700 }}>Saved ✓</span> : `Armor of God · ${equippedPieces}/6`}>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          <Avatar emoji={profile.avatarEmoji} character={spec} size={76} border={equippedBorder} badge={equippedBadge} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Equip your armor</b>
            <p className="faint" style={{ fontSize: 12, marginTop: 2 }}>
              Ephesians 6 — a piece at a time. Tap to equip or remove; it saves automatically.
            </p>
            <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: 'rgba(0,0,0,0.3)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(equippedPieces / 6) * 100}%`, borderRadius: 999, background: 'linear-gradient(90deg, var(--gold), var(--tangerine))', transition: 'width 0.25s' }} />
            </div>
          </div>
        </div>

        {/* Armor pieces */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {ARMOR.map((def) => {
            const owned = accessOwned(def.access, longest, profile.isAdmin)
            const on = !!spec.armor[def.slot]
            const lbl = accessLabel(def.access)
            return (
              <button
                key={def.slot}
                onClick={() => toggleArmor(def)}
                style={{
                  textAlign: 'left',
                  display: 'grid',
                  gap: 3,
                  padding: '9px 10px',
                  borderRadius: 12,
                  background: on ? 'var(--grape)' : 'var(--card-solid)',
                  border: on ? '1px solid var(--gold)' : '1px solid var(--stroke)',
                  opacity: owned ? 1 : 0.55,
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.15 }}>{def.name}</span>
                <span className="faint" style={{ fontSize: 10, fontStyle: 'italic' }}>{def.verse}</span>
                <span style={{ ...pillStyle(lbl.tone), marginTop: 2 }}>
                  {on ? '✓ Equipped' : owned ? (lbl.tone === 'studio' ? '✦ Studio' : 'Tap to equip') : `🔒 ${lbl.text}`}
                </span>
              </button>
            )
          })}
        </div>

        {/* Skin tone */}
        <p className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 6px' }}>Skin tone</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {SKINS.map((s) => (
            <SwatchDot key={s.key} hex={s.hex} selected={spec.skin === s.key} onClick={() => pickSkin(s)} />
          ))}
        </div>

        {/* Robe */}
        <p className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 6px' }}>Robe</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {ROBES.map((r) => (
            <SwatchDot
              key={r.key}
              hex={r.hex}
              selected={spec.robe === r.key}
              locked={!accessOwned(r.access, longest, profile.isAdmin)}
              studio={r.access?.kind === 'studio'}
              onClick={() => pickRobe(r)}
            />
          ))}
        </div>

        <p className="faint" style={{ fontSize: 10, marginTop: 12, lineHeight: 1.4 }}>
          {storefrontEnabled()
            ? 'Studio pieces are unlocked here so you can preview the full look. Scripture is always free — the craft around it is the paid layer.'
            : 'Studio pieces are unlocked here so you can build the full look. Scripture is always free.'}
        </p>
      </div>
      </Section>

      {/* ── Full-look skins ───────────────────────────────────────────── */}
      <Section title="Skins" defaultOpen right="full looks">
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {/* Bundles first — a pack is one listing at one price. Its skins are
              hidden from the grid until it's owned, so the only way to get them
              is the pack itself. Once owned they appear below as normal, each
              individually equippable. */}
          {storefrontEnabled() &&
            BUNDLES.filter((b) => !bundleExpired(b) && !packEntitled(b.id, ownedSkins)).map((b) => (
              <button
                key={b.id}
                onClick={() => { juice.select(); setBundleTarget(b) }}
                style={{
                  gridColumn: '1 / -1',
                  display: 'grid', justifyItems: 'center', gap: 6,
                  padding: '12px 8px', borderRadius: 14,
                  background: 'var(--card-solid)', border: '1px solid var(--gold)', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {b.skins.map((id, n) => (
                    <div key={id} style={{ marginLeft: n === 0 ? 0 : -14, zIndex: n }}>
                      <Avatar emoji={profile.avatarEmoji} character={{ ...spec, skinId: id, regalia: null }} size={56} ring={false} />
                    </div>
                  ))}
                </div>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800 }}>{b.name}</span>
                <span className="faint" style={{ fontSize: 11 }}>
                  {bundleItemCount(b)} items · {b.skins.length} skins + {b.cards.length} calling cards
                </span>
                <span style={{ ...pillStyle('studio') }}>{displayPrice(b.sku, b.price)} · tap to preview</span>
                {b.limitedUntil && <LimitedBadge until={b.limitedUntil} />}
              </button>
            ))}
          {FULL_SKINS
            .filter((skin) => !skinExpired(skin))
            // A bundle-only skin is never its own listing — it shows up here
            // only once the pack that contains it is owned.
            .filter((skin) => !skin.bundleOnly || packPreviewable(skin.pack ?? '', ownedSkins, profile.isAdmin))
            // Native builds carry no storefront, so a priced skin only appears
            // once it's owned — including packs bought on the website, which
            // stay wearable here. See lib/commerce.
            .filter((skin) => skinVisible(skin, isSkinOwned(skin)))
            .map((skin) => {
            const owned = isSkinOwned(skin)
            const equipped = equippedSkin === skin.id
            const preview = { ...spec, skinId: skin.id, regalia: null }
            const status =
              owned
                ? equipped
                  ? '✓ Equipped'
                  : 'Tap to wear'
                : skin.source === 'earned'
                  ? skin.referralGoal != null
                    ? `${Math.min(profile.referralCount ?? 0, skin.referralGoal)}/${skin.referralGoal} friends`
                    : `Shared ${Math.min(sharedCount, skin.shareGoal ?? 0)}/${skin.shareGoal ?? 0} days`
                  : skin.exclusive ? '🔒 Live exclusive'
                    : skin.bundleOnly ? `🔒 ${skin.packName ?? 'Pack only'}`
                      : `🔒 ${skin.price}`
            return (
              <button
                key={skin.id}
                onClick={() => onSkinTap(skin)}
                style={{
                  display: 'grid',
                  justifyItems: 'center',
                  gap: 6,
                  padding: '10px 8px',
                  borderRadius: 14,
                  background: equipped ? 'var(--grape)' : 'var(--card-solid)',
                  border: equipped ? '1px solid var(--gold)' : '1px solid var(--stroke)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ position: 'relative' }}>
                  <Avatar emoji={profile.avatarEmoji} character={preview} size={60} ring={false} />
                  {!owned && (
                    <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 20, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}>🔒</span>
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 800 }}>{skin.name}</span>
                <span style={{ ...pillStyle(skin.source === 'paid' ? 'studio' : 'earned') }}>{status}</span>
                {skin.limitedUntil && <LimitedBadge until={skin.limitedUntil} />}
              </button>
            )
          })}
        </div>
        <p className="faint" style={{ fontSize: 10, marginTop: 10, lineHeight: 1.4 }}>
          {storefrontEnabled() ? (
            <>
              Hero skins are <b>premium</b> — tap one to unlock it. Packs are sold whole: tap to swipe through
              everything inside before you decide. Earned skins (like Baldwin) are never for sale, and Scripture is always free.
            </>
          ) : (
            <>
              Skins are <b>earned</b> — share the daily verse and invite friends, and they’re yours to keep.
              A missed day never takes one away, and Scripture is always free.
            </>
          )}
        </p>
        {/* Restore Purchases — REQUIRED by Apple for non-consumable in-app
            purchases (Guideline 3.1.1): a buyer who reinstalls, or signs in on a
            second device, has to be able to get their packs back without paying
            again. Shown whenever the app can talk to StoreKit at all, including
            when the shop itself is hidden — restoring is not selling. */}
        {iapAvailable() && (
          <div style={{ marginTop: 12 }}>
            <button
              className="pill"
              style={{ width: '100%' }}
              onClick={async () => {
                juice.select()
                setRestoreMsg(null)
                const n = await restoreIap()
                setRestoreMsg(
                  n > 0
                    ? `Restored ${n} item${n === 1 ? '' : 's'} ✓`
                    : 'Nothing to restore on this Apple ID.',
                )
              }}
            >
              Restore purchases
            </button>
            {restoreMsg && (
              <p className="faint" style={{ fontSize: 11, marginTop: 6, textAlign: 'center' }}>{restoreMsg}</p>
            )}
          </div>
        )}
        {/* Optional support link (a Stripe Payment Link, set via VITE_SUPPORT_URL).
            Web-only: on native, "chip in what you like" is a pay-what-you-want
            digital purchase outside IAP, which Apple does not allow. */}
        {SUPPORT_URL && !isNativeApp() && (
          <div style={{ marginTop: 12 }}>
            <Button
              variant="gold"
              full
              onClick={() => { juice.coin(); window.open(SUPPORT_URL, '_blank', 'noopener,noreferrer') }}
            >
              💛 Support Verse Arcade
            </Button>
            <p className="faint" style={{ fontSize: 10, marginTop: 6, textAlign: 'center', lineHeight: 1.4 }}>
              Chip in what you like — it keeps the app online and free. Not a donation; you’re supporting a solo builder.
            </p>
          </div>
        )}
      </div>
      </Section>

      {/* Pack sheet — swipe every item, then buy the whole thing or nothing */}
      {bundleTarget && (
        <BundleSheet
          bundle={bundleTarget}
          spec={spec}
          emoji={profile.avatarEmoji}
          username={profile.username}
          owned={packEntitled(bundleTarget.id, ownedSkins)}
          onClose={() => setBundleTarget(null)}
        />
      )}

      {/* Purchase prompt for a locked hero skin */}
      {buyTarget && (
        <div
          onClick={() => setBuyTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340, width: '100%', textAlign: 'center' }}>
            <Avatar emoji={profile.avatarEmoji} character={{ ...spec, skinId: buyTarget.id, regalia: null }} size={92} ring={false} />
            <h3 style={{ fontSize: 20, marginTop: 10 }}>{buyTarget.name}</h3>
            {buyTarget.packName && <p className="faint" style={{ fontSize: 12 }}>{buyTarget.packName}</p>}
            <p style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>{buyTarget.blurb}</p>
            <p style={{ marginTop: 10, marginBottom: 12, fontFamily: 'var(--font-display)', fontSize: 24 }} className="gradient-text">
              {displayPrice(buyTarget.id, buyTarget.price)}
            </p>
            {(isNativeApp() ? storefrontEnabled() : !!skinBuyUrl(buyTarget.id)) && storefrontEnabled() ? (
              <>
                <Button variant="gold" full disabled={buying} onClick={async () => {
                  juice.coin()
                  const skin = buyTarget
                  if (isNativeApp()) {
                    // Apple's purchase sheet — the app may not check out anywhere else.
                    setBuying(true)
                    const result = await buyIap(skin.id)
                    setBuying(false)
                    if (result === 'cancelled') return
                    setBuyTarget(null)
                    return
                  }
                  // Pass "<username>-<skinId>" as Stripe's client_reference_id so the
                  // webhook can auto-grant the right skin to the right account.
                  const base = skinBuyUrl(skin.id)
                  const ref = encodeURIComponent(`${profile.username}-${skin.id}`)
                  const url = base + (base.includes('?') ? '&' : '?') + 'client_reference_id=' + ref
                  window.open(url, '_blank', 'noopener,noreferrer')
                  setBuyTarget(null)
                }}>
                  {buying ? 'Opening Apple…' : 'Get this skin'}
                </Button>
                <p className="faint" style={{ fontSize: 10, marginTop: 8, lineHeight: 1.4 }}>
                  Opens secure checkout — your skin unlocks automatically right after. Thank you for supporting a solo builder! 🙏
                </p>
              </>
            ) : (
              <p className="faint" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                Purchases are opening soon — check back shortly. 🙏
              </p>
            )}
            <button className="pill" style={{ marginTop: 12 }} onClick={() => setBuyTarget(null)}>Maybe later</button>
          </div>
        </div>
      )}

      {/* Redeem prompt for a live-exclusive skin */}
      {redeemTarget && (
        <div
          onClick={() => setRedeemTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340, width: '100%', textAlign: 'center' }}>
            <Avatar emoji={profile.avatarEmoji} character={{ ...spec, skinId: redeemTarget.id, regalia: null }} size={92} ring={false} />
            <h3 style={{ fontSize: 20, marginTop: 10 }}>{redeemTarget.name}</h3>
            <span className="pill" style={{ fontSize: 10, background: 'var(--gold)', color: '#241f0a', fontWeight: 800 }}>★ Live Exclusive</span>
            <p style={{ fontSize: 14, marginTop: 10, lineHeight: 1.5 }}>{redeemTarget.blurb}</p>
            <input
              value={redeemInput}
              onChange={(e) => { setRedeemMsg(null); setRedeemInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)) }}
              onKeyDown={(e) => { if (e.key === 'Enter') doRedeem() }}
              placeholder="Enter code"
              autoCapitalize="characters"
              autoCorrect="off"
              style={{ marginTop: 12, textAlign: 'center', letterSpacing: '0.15em', fontWeight: 800 }}
            />
            {redeemMsg && <p style={{ color: 'var(--coral)', fontSize: 13, marginTop: 8 }}>{redeemMsg}</p>}
            <div style={{ marginTop: 12 }}>
              <Button variant="gold" full disabled={redeeming || redeemInput.trim().length < 3} onClick={doRedeem}>
                {redeeming ? 'Redeeming…' : 'Redeem'}
              </Button>
            </div>
            <button className="pill" style={{ marginTop: 10 }} onClick={() => setRedeemTarget(null)}>Close</button>
          </div>
        </div>
      )}

      {/* A genuine note on why anything costs money at all. Web-only: in a
          native build nothing costs anything, so an essay about paying for
          skins would both confuse and (per lib/commerce) steer. */}
      {storefrontEnabled() && (
      <>
      <button
        onClick={() => { juice.select(); setDevNoteOpen((o) => !o) }}
        className="card"
        style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, marginBottom: devNoteOpen ? 0 : 14, cursor: 'pointer' }}
      >
        <span style={{ fontSize: 18 }}>💛</span>
        <b style={{ flex: 1, fontSize: 13.5 }}>Why do skins cost anything?</b>
        <span style={{ color: 'var(--gold)', transform: devNoteOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {devNoteOpen && (
        <div className="card" style={{ marginTop: 8, marginBottom: 14, lineHeight: 1.6, fontSize: 14 }}>
          <p style={{ margin: 0 }}>
            Verse Arcade is built by <b>one person</b> — not a company, no investors. The whole app is
            free: the daily verse, the games, streaks, groups, battles. That never changes, and the
            Scripture is never behind a paywall.
          </p>
          <p style={{ margin: '12px 0 0' }}>
            Skins are the one optional extra. I’m not a nonprofit, so this isn’t a donation — it’s
            support. It covers the real monthly cost of keeping the app online, and gives me a little
            room to keep building it instead of shelving it. You’re only ever paying for a cosmetic you
            like.
          </p>
          <p style={{ margin: '12px 0 0', color: 'var(--ink)' }}>
            If you grab one — thank you, genuinely. It keeps this going. If you don’t, that’s completely
            okay: the app is yours to enjoy either way. 🙏
          </p>
        </div>
      )}
      </>
      )}

      {/* ── Collected items (from the Daily Chest) ────────────────────── */}
      <Section title="Items" right={`${myItems.length} collected`}>
      <div className="card" style={{ marginBottom: 14 }}>
        {myItems.length === 0 ? (
          <p className="faint" style={{ fontSize: 13, textAlign: 'center', padding: '6px 0' }}>
            🎁 Open your Daily Chest to find hats, staffs, cloaks and more — then equip them here.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {myItems.map((item) => {
              const on = spec.items?.[item.slot] === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item)}
                  style={{
                    textAlign: 'left',
                    display: 'grid',
                    gap: 3,
                    padding: '9px 10px',
                    borderRadius: 12,
                    background: on ? 'var(--grape)' : 'var(--card-solid)',
                    border: on ? '1px solid var(--gold)' : '1px solid var(--stroke)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.15 }}>{item.name}</span>
                  <span className="faint" style={{ fontSize: 10, textTransform: 'capitalize' }}>{item.slot} · {item.rarity}</span>
                  <span style={{ ...pillStyle(on ? 'studio' : 'free'), marginTop: 2 }}>{on ? '✓ Worn' : 'Tap to wear'}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      </Section>

      {/* ── Player-card backgrounds ───────────────────────────────────────
          Every card and relic you own also unlocks the background themed after
          it, so the collection doubles as a wardrobe for your player card. ── */}
      <Section title="Card background" right={`${unlockedBgCount}/${visibleBgs.length}`}>
      <div className="card" style={{ marginBottom: 14 }}>
        {/* Live preview of the equipped background. */}
        <div style={{ ...cardBgStyle(equippedBg), position: 'relative', height: 92, borderRadius: 14, border: '1px solid var(--stroke)', overflow: 'hidden', display: 'grid', placeItems: 'center', marginBottom: 12 }}>
          <CardArt {...cardArtProps(equippedBg)} id={`bg-preview-${equippedBg}`} />
          <span style={{ position: 'relative', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}>
            {CARD_BACKGROUNDS.find((b) => b.key === equippedBg)?.name ?? 'Classic'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {visibleBgs.map((b) => {
            const unlocked = cardBgUnlocked(b.key, ownedCollectibles, bgCtx)
            const equipped = equippedBg === b.key
            const src = collectibleByKey(b.key)
            return (
              <button
                key={b.key}
                onClick={unlocked && !equipped ? () => pickBg(b.key) : undefined}
                disabled={!unlocked || equipped}
                title={unlocked ? b.name : b.unlockHint ?? `Unlocks with ${b.name}`}
                style={{
                  padding: 0, borderRadius: 12, overflow: 'hidden', cursor: unlocked && !equipped ? 'pointer' : 'default',
                  border: equipped ? `2px solid ${cardBgAccentColor(b.key)}` : '1px solid var(--stroke)',
                  opacity: unlocked ? 1 : 0.42, filter: unlocked ? 'none' : 'grayscale(0.75)',
                  boxShadow: equipped ? `0 0 14px ${cardBgAccentColor(b.key)}55` : 'none',
                  background: 'transparent',
                }}
              >
                <div style={{ ...cardBgStyle(b.key), position: 'relative', height: 52, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                  <CardArt {...cardArtProps(b.key)} id={`bg-tile-${b.key}`} />
                  <span style={{ position: 'relative', fontSize: 16, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))' }}>
                    {unlocked ? b.emoji ?? src?.emoji ?? '✦' : '🔒'}
                  </span>
                </div>
                <div style={{ padding: '5px 4px 6px', background: 'var(--card-solid)' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.name}
                  </div>
                  {equipped && <div style={{ fontSize: 8.5, color: cardBgAccentColor(b.key), fontWeight: 800 }}>EQUIPPED</div>}
                </div>
              </button>
            )
          })}
        </div>
        <p className="faint" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.4 }}>
          Each background unlocks with the card or relic it’s named after — earn them from goals and the Daily Chest.
          {storefrontEnabled() && ' The two Angel cards come with The Angel Pack — the pack is sold whole.'}
        </p>
      </div>
      </Section>

      {/* ── Streak-unlocked borders + badges ──────────────────────────── */}
      <Section title="Borders" right={`Best streak: ${longest}d`}>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {BORDERS.map((b) => {
            const unlocked = isUnlocked(b.requiredStreak, longest, profile.founder)
            const equipped = equippedBorder === b.key
            return (
              <CosmeticTile
                key={b.key}
                name={b.name}
                unlocked={unlocked}
                equipped={equipped}
                requiredStreak={b.requiredStreak}
                onClick={unlocked && !equipped ? () => equip({ border: b.key }) : undefined}
                preview={
                  <Avatar
                    emoji={profile.avatarEmoji}
                    character={spec}
                    size={52}
                    border={b.key}
                    badge={equippedBadge}
                  />
                }
              />
            )
          })}
        </div>
      </div>

      </Section>

      {/* Badges */}
      <Section title="Badges">
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {BADGES.map((b) => {
            const unlocked = isUnlocked(b.requiredStreak, longest, profile.founder)
            const equipped = equippedBadge === b.key
            return (
              <CosmeticTile
                key={b.key}
                name={b.name}
                unlocked={unlocked}
                equipped={equipped}
                requiredStreak={b.requiredStreak}
                onClick={unlocked && !equipped ? () => equip({ badge: b.key }) : undefined}
                preview={
                  <Avatar
                    emoji={profile.avatarEmoji}
                    character={spec}
                    size={52}
                    border={equippedBorder}
                    badge={b.key === 'none' ? null : b.key}
                  />
                }
              />
            )
          })}
        </div>
      </div>
      </Section>

      {err && <p style={{ color: 'var(--coral)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{err}</p>}
    </>
  )
}

// A collapsible sub-section of the customizer, so the (long) page can be tidied
// section by section. Header shows an optional right-side summary + a chevron.
function Section({ title, right, defaultOpen = false, children }: {
  title: string
  right?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const juice = useJuice()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <button
        onClick={() => { juice.select(); setOpen((o) => !o) }}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', background: 'transparent', border: 'none', padding: '2px 0 10px', cursor: 'pointer' }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h3 style={{ fontSize: 16, margin: 0 }} className="dim">{title}</h3>
          {right && <span className="faint" style={{ fontSize: 12 }}>{right}</span>}
        </span>
        <span style={{ color: 'var(--gold)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: 'easeInOut' }} style={{ overflow: 'hidden' }}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// Small access pill (Free / earned streak / Studio) shown on each armor tile.
function pillStyle(tone: 'free' | 'earned' | 'studio'): React.CSSProperties {
  const color = tone === 'free' ? 'var(--good)' : tone === 'earned' ? 'var(--tangerine)' : 'var(--gold)'
  return {
    justifySelf: 'start',
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    padding: '3px 7px',
    borderRadius: 999,
    color,
    background: 'color-mix(in srgb, currentColor 16%, transparent)',
  }
}

// A ticking "limited edition" countdown — this look vanishes for good at `until`.
function LimitedBadge({ until }: { until: string }) {
  const end = new Date(until).getTime()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = end - now
  if (ms <= 0) return null
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const label = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 800, color: 'var(--coral)', marginTop: 1 }}>
      ⏳ {label} left
    </span>
  )
}

// A tappable color swatch for skin tone / robe, with lock + studio affordances.
function SwatchDot({
  hex,
  selected,
  locked,
  studio,
  onClick,
}: {
  hex: string
  selected: boolean
  locked?: boolean
  studio?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      style={{
        position: 'relative',
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: hex,
        border: selected ? '2px solid var(--gold)' : '2px solid var(--stroke)',
        boxShadow: selected ? '0 0 0 3px color-mix(in srgb, var(--gold) 35%, transparent)' : 'none',
        cursor: 'pointer',
        opacity: locked ? 0.6 : 1,
        flexShrink: 0,
      }}
    >
      {studio && (
        <span
          style={{
            position: 'absolute',
            right: -3,
            bottom: -3,
            fontSize: 10,
            lineHeight: 1,
            background: 'var(--card-solid)',
            borderRadius: '50%',
            padding: 1,
          }}
        >
          {locked ? '🔒' : '✦'}
        </span>
      )}
    </button>
  )
}

function unlockLabel(days: number): string {
  if (days === 365) return '1-year streak'
  if (days % 365 === 0) return `${days / 365}-year streak`
  return `${days}-day streak`
}

function CosmeticTile({
  name,
  unlocked,
  equipped,
  requiredStreak,
  preview,
  onClick,
}: {
  name: string
  unlocked: boolean
  equipped: boolean
  requiredStreak: number
  preview: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        display: 'grid',
        justifyItems: 'center',
        gap: 6,
        padding: '8px 4px',
        borderRadius: 14,
        background: equipped ? 'var(--grape)' : 'transparent',
        border: equipped ? '1px solid var(--gold)' : '1px solid transparent',
        cursor: onClick ? 'pointer' : 'default',
        opacity: unlocked ? 1 : 0.5,
        filter: unlocked ? 'none' : 'grayscale(0.7)',
      }}
    >
      <div style={{ position: 'relative' }}>
        {preview}
        {!unlocked && (
          <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 20 }}>🔒</span>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'center' }}>{name}</div>
      <div className="faint" style={{ fontSize: 10, textAlign: 'center' }}>
        {equipped ? 'Equipped' : unlocked ? 'Tap to equip' : unlockLabel(requiredStreak)}
      </div>
    </button>
  )
}
