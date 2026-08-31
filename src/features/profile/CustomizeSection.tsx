import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Avatar } from '@/components/Avatar'
import { CharacterPicker } from '@/components/CharacterPicker'
import { Button } from '@/components/Button'
import { SUPPORT_URL, skinBuyUrl } from '@/lib/config'
import { startSkinCheckout } from '@/lib/checkout'
import { cardBgVisible, displayPrice, skinVisible, storefrontEnabled } from '@/lib/commerce'
import { isNativeApp } from '@/lib/appStore'
import { iapAvailable } from '@/lib/iap'
import { useIap } from '@/store/iap'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import { useSeason } from '@/store/season'
import { useJuice } from '@/juice/useJuice'
import { useSettings } from '@/store/settings'
import { Pet } from '@/components/Pet'
import { PETS, nextPet, petById, petEffectText, petRequirementText, petUnlocked, reqValue } from '@/data/pets'
import { petProgress } from '@/lib/petProgress'
import { useBible } from '@/store/bible'
import { useKeep } from '@/store/keep'
import { BORDERS, BADGES, isUnlocked } from '@/data/cosmetics'
import { useCollection } from '@/store/collection'
import { collectibleByKey } from '@/data/collectibles'
import { CARD_BACKGROUNDS, DEFAULT_CARD_BG, cardBgStyle, cardArtProps, cardBgAccentColor, cardBgUnlocked } from '@/data/playerCards'
import { CardArt } from '@/data/cardArt'
import { SavedLooks } from './SavedLooks'
import {
  DEFAULT_AVATAR,
  distinctSharedDays,
  ITEMS,
  allSkins,
  BUNDLES,
  bundleExpired,
  bundleItemCount,
  packEntitled,
  packPreviewable,
  skinExpired,
  skinOwned,
  equippedSkinId,
  baseSkinId,
  passSkinEquipId,
  type BundleDef,
  type ItemDef,
  type SkinDef,
  itemArt,
} from '@/data/avatar'
import { BundleSheet } from './BundleSheet'
import type { AvatarSpec } from '@/types'

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
  const mode = useAuth((s) => s.mode)

  const doRedeem = async () => {
    if (!redeemTarget) return
    // A guest has no server identity, so redeem_code would raise
    // 'not authenticated' and surface as "invalid code" — which is a lie, and a
    // costly one when most redeemers are fresh installs still playing as
    // guests. Check mode first (it is 'local' for a guest *and* for a keyless
    // build) and tell them the actual fix.
    if (mode === 'local' || !supabase) {
      setRedeemMsg('Create a free account to redeem a code — your progress carries over.')
      return
    }
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
  const setPet = useAuth((s) => s.setPet)
  const ownedCollectibles = useCollection((s) => s.owned)

  const longest = profile.longestStreak
  const equippedBorder = profile.avatarBorder || 'default'
  const equippedBadge = profile.avatarBadge ?? 'none'
  const spec = profile.avatarCharacter ?? DEFAULT_AVATAR

  const equippedBg = profile.cardBackground ?? DEFAULT_CARD_BG
  // Two of the pet requirements live in other stores (verses studied, CPU races
  // won), and nothing else on this screen loads them — without this the picker
  // quietly reports 0 for both and a pet the player has already earned reads as
  // locked. Found by driving the real screen.
  const loadBible = useBible((st) => st.load)
  const loadKeep = useKeep((st) => st.load)
  const bibleLoaded = useBible((st) => st.loaded)
  const keepLoaded = useKeep((st) => st.loaded)
  useEffect(() => {
    if (!bibleLoaded) void loadBible()
    if (!keepLoaded) void loadKeep()
  }, [bibleLoaded, keepLoaded, loadBible, loadKeep])

  const [petErr, setPetErr] = useState<string | null>(null)
  const petProg = petProgress()
  // The operator account previews every pet, the same way it previews every
  // skin — and 0067 says the same thing inside pet_requirements_met, so the
  // grid never offers something set_pet will refuse.
  const petAdmin = !!profile.isAdmin
  const unlockedPetCount = PETS.filter((p) => petUnlocked(p.id, petProg, petAdmin)).length
  const comingPet = nextPet(petProg, petAdmin)
  // Pack cards gate on the skin entitlement rather than a collectible, so the
  // picker needs both sources of ownership.
  const bgCtx = { ownedSkins: profile.ownedSkins ?? [], admin: profile.isAdmin }
  // A card that only ships with a paid pack is hidden in a native build until
  // the pack is owned — the app has no way to sell it (see lib/commerce). The
  // "x/y unlocked" count follows the same list, so it never reads as short.
  // Only what the player actually has. This used to render all 44 backgrounds
  // with the locked ones dimmed, which made the customizer a wall of things you
  // can't use — the collection wall is where "what's out there" belongs, and it
  // still shows every locked item. Here the question is "what do I equip", so
  // anything you can't equip is noise.
  const visibleBgs = CARD_BACKGROUNDS.filter(
    (b) =>
      cardBgUnlocked(b.key, ownedCollectibles, bgCtx) &&
      cardBgVisible(b, true),
  )
  const unlockedBgCount = visibleBgs.length
  const lockedBgCount = CARD_BACKGROUNDS.filter(
    (b) => !cardBgUnlocked(b.key, ownedCollectibles, bgCtx) && cardBgVisible(b, false),
  ).length

  const pickBg = async (key: string) => {
    setErr(null)
    juice.select()
    const res = await setCardBackground(key)
    if (!res.ok) setErr(res.error ?? 'That background isn’t unlocked yet')
    else flashSaved()
  }

  // Pets are earned by level and nothing else, so the picker's only job is to
  // say which are yours yet. Tapping the equipped one takes it off — a
  // companion you can't put down is a commitment, and this isn't one.
  const pickPet = async (id: string) => {
    const def = petById(id)
    if (!def) return
    const prog = petProgress()
    if (!petUnlocked(id, prog, petAdmin)) {
      // Local to the section, not the shared error at the very bottom of the
      // customizer — a refusal a page and a half below the tap is no refusal.
      setPetErr(`${def.name} needs ${petRequirementText(def).toLowerCase()}.`)
      return
    }
    setPetErr(null)
    juice.select()
    const equipping = profile.pet !== id
    const res = await setPet(equipping ? id : null, prog)
    if (!res.ok) setPetErr(res.error ?? 'That one isn’t unlocked yet')
    else {
      // Prepacked verb. Emitted from the screen rather than store/auth.ts,
      // which store/season.ts already imports — the other direction is a cycle.
      if (equipping) void useSeason.getState().track('pet_equipped')
      flashSaved()
    }
  }

  const equip = async (patch: { border?: string; badge?: string | null }) => {
    setErr(null)
    juice.select()
    const res = await setCosmetics(patch)
    if (!res.ok) setErr(res.error ?? 'That’s not unlocked yet')
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
  const seasonUnlocks = useSeason((st) => st.unlocks)
  const equippedSkin = equippedSkinId(spec)
  /** Reactive pass skins store their state in the id ('ruth_2'); compare bases. */
  const isEquipped = (skin: SkinDef) => !!equippedSkin && baseSkinId(equippedSkin) === skin.id
  const isSkinOwned = (skin: SkinDef) =>
    skinOwned(skin, { sharedDays: profile.sharedDays, ownedSkins, referralCount: profile.referralCount, admin: profile.isAdmin, seasonUnlocks })
  // Cosmetics aren't sold any more — the launch trio is free, the angels are
  // road rewards and the promo skins are free redemptions — so the copy under
  // the grid only mentions money while a listing that still HAS a price is
  // actually on screen. That's the founding-patron whale, and it expires; the
  // filters below are the same ones the grid itself uses, so the sentence and
  // the tile appear and disappear together.
  const pricedOnShelf =
    storefrontEnabled() &&
    allSkins().some((sk) => sk.source === 'paid' && !sk.exclusive && !skinExpired(sk) && skinVisible(sk, isSkinOwned(sk)))
  const onSkinTap = (skin: SkinDef) => {
    const owned = isSkinOwned(skin)
    if (!owned && skin.source === 'pass') {
      setErr(`${skin.name} is earned on the Pilgrimage — walk the road on the Play tab.`)
      return
    }
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
    const willEquip = !isEquipped(skin)
    // A reactive pass skin equips at its highest unlocked state, and the state
    // rides in the stored id so other viewers render the same basket.
    const equipId = skin.source === 'pass' ? passSkinEquipId(skin, seasonUnlocks) : skin.id
    setAvatarCharacter({ ...spec, skinId: willEquip ? equipId : null, regalia: null })
    flashSaved()
  }

  return (
    <>
      {/* ── Character builder ─────────────────────────────────────────── */}
      <Section
        title="Your Character"
        defaultOpen
        right={savedFlash ? <span style={{ color: 'var(--good)', fontWeight: 700 }}>Saved ✓</span> : 'always free'}
      >
      <div className="card" style={{ marginBottom: 14 }}>
        {/* The SAME picker the sign-up flow uses (components/CharacterPicker) —
            a second copy here would drift from the one people meet at the door,
            and the whole promise is that the character you made while signing up
            is the character you keep and can keep editing.
            The Armor of God grid used to sit above this; it's parked, not
            deleted — see ARMOR_ENABLED in data/avatar. */}
        {/* No robe row: the raster base bakes the linen robe into the art, so
            a robe swatch would be a control that visibly does nothing. The
            stored `robe` still colours the drawn SVG fallback. */}
        <CharacterPicker
          value={spec}
          onChange={(next: AvatarSpec) => { setAvatarCharacter(next); flashSaved() }}
          longestStreak={longest}
          admin={!!profile.isAdmin}
        />

        <p className="faint" style={{ fontSize: 10, marginTop: 12, lineHeight: 1.4 }}>
          Every tone and every colour here is free and always will be — this is
          who you are, not something to unlock. It saves as you tap.
        </p>
      </div>
      </Section>

      {/* ── Full looks + companions ────────────────────────────────────
          One shelf with two pills instead of two collapsibles: skins and pets
          answer the same question (who stands there when you show up), and a
          player choosing a look is one tap from choosing who walks beside it.
          Both names stay on screen, which a nested accordion loses. ── */}
      <TabbedSection
        defaultOpen
        tabs={[
          {
            key: 'skins',
            label: 'Skins',
            right: 'full looks',
            content: (
              <>
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
                    {allSkins()
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
                      const equipped = isEquipped(skin)
                      const preview = {
                        ...spec,
                        skinId: skin.source === 'pass' ? passSkinEquipId(skin, seasonUnlocks) : skin.id,
                        regalia: null,
                      }
                      const status =
                        owned
                          ? equipped
                            ? '✓ Equipped'
                            : 'Tap to wear'
                          : skin.source === 'pass'
                            ? '🌾 On the road'
                          : skin.source === 'earned'
                            ? skin.referralGoal != null
                              ? `${Math.min(profile.referralCount ?? 0, skin.referralGoal)}/${skin.referralGoal} friends`
                              : `Shared ${Math.min(sharedCount, skin.shareGoal ?? 0)}/${skin.shareGoal ?? 0} days`
                            : skin.exclusive ? `🔒 ${skin.packName ?? 'Exclusive'}`
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
                    Skins are <b>earned</b>, not sold — share the daily verse, invite friends, or walk the
                    Harvest Road, and they’re yours to keep. A few unlock with a code. A missed day never
                    takes one away, and Scripture is always free.
                    {pricedOnShelf && ' The one listing with a price is the founding-patron thank-you — nothing in the game is behind it.'}
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
                          const r = await restoreIap()
                          setRestoreMsg(
                            // Three outcomes, not two. "Nothing to restore" must only be
                            // said when we actually asked and were told nothing — saying
                            // it after a failed lookup tells a real buyer they own
                            // nothing, which is the case App Review checks.
                            !r.ok
                              ? 'Couldn’t check with the App Store just now — try again in a moment.'
                              : r.count > 0
                                ? `Restored ${r.count} item${r.count === 1 ? '' : 's'} ✓`
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

                {/* A genuine note on the one thing that still has a price. It lives
                    inside the Skins tab because that's what it's about — under Pets it
                    would be answering a question nobody asked. Web-only: in a native
                    build nothing is offered for sale at all, so an essay about paying
                    would both confuse and (per lib/commerce) steer. */}
                {storefrontEnabled() && (
              <>
                <button
                  onClick={() => { juice.select(); setDevNoteOpen((o) => !o) }}
                  className="card"
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, marginBottom: devNoteOpen ? 0 : 14, cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 18 }}>💛</span>
                  <b style={{ flex: 1, fontSize: 13.5 }}>Is any of this paid?</b>
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
                      Skins used to be the one paid extra. They aren’t any more — the three that had a price
                      belong to everybody now, the angels are earned on the Harvest Road, and nothing you can
                      play with is sold. Anyone who bought a pack keeps every bit of it.
                    </p>
                    <p style={{ margin: '12px 0 0' }}>
                      What’s left is a founding-patron thank-you for people who want to chip in. I’m not a
                      nonprofit, so it isn’t a donation — it’s support that covers the monthly cost of keeping
                      the app online. It buys one cosmetic and nothing else.
                    </p>
                    <p style={{ margin: '12px 0 0', color: 'var(--ink)' }}>
                      If you chip in — thank you, genuinely. It keeps this going. If you don’t, that’s completely
                      okay: nothing is missing from your app either way. 🙏
                    </p>
                  </div>
                )}
              </>
              )}
              </>
            ),
          },
          {
            key: 'pets',
            label: 'Pets',
            right: `${unlockedPetCount}/${PETS.length}`,
            content: (
              <>
                  <p className="faint" style={{ fontSize: 12, margin: '0 0 10px', lineHeight: 1.5 }}>
                    A companion stands beside you at the top of this tab. Every one is earned — a level and,
                    past the first, one more thing — and nothing buys, trades or takes one away. The common
                    ones are simply company; the rarer ones each do one small thing.
                    {comingPet && ` Next: ${comingPet.name}, ${petRequirementText(comingPet).toLowerCase()}.`}
                  </p>
                  {petErr && (
                    <p style={{ color: 'var(--coral)', fontSize: 12.5, margin: '0 0 10px', lineHeight: 1.4 }}>{petErr}</p>
                  )}
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: 14 }}>
                    {PETS.map((p) => {
                      const open = petUnlocked(p.id, petProg, petAdmin)
                      const on = profile.pet === p.id
                      // The one number worth showing on a locked row: how far along the
                      // second requirement is. A bare "🔒 Level 33" tells you nothing
                      // about the part you're actually working on.
                      const short =
                        !open && petProg.level >= p.level && p.extra
                          ? `${reqValue(p.extra, petProg).toLocaleString()}/${p.extra.n.toLocaleString()}`
                          : null
                      return (
                        <button
                          key={p.id}
                          onClick={() => void pickPet(p.id)}
                          className="card"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 12px',
                            minWidth: 0,
                            textAlign: 'left',
                            cursor: 'pointer',
                            borderColor: on ? 'var(--gold)' : 'var(--stroke)',
                            background: on ? 'rgba(255,210,63,0.08)' : undefined,
                            // Locked pets stay visible and legible — a silhouette would
                            // make the ladder a mystery, and the level it arrives at is
                            // the whole message.
                            opacity: open ? 1 : 0.58,
                          }}
                        >
                          <span style={{ flexShrink: 0, width: 44, height: 44, display: 'grid', placeItems: 'center' }}>
                            <Pet id={p.id} size={44} />
                          </span>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: 'block', fontWeight: 800, fontSize: 13.5 }}>{p.name}</span>
                            <span className="faint" style={{ display: 'block', fontSize: 11.5, lineHeight: 1.35 }}>
                              {on
                                ? 'Beside you · tap to put down'
                                : open
                                  ? p.blurb
                                  : `🔒 ${petRequirementText(p)}${short ? ` · ${short}` : ''}`}
                            </span>
                            {/* What it does, always — including "Just company", so the
                                common ones read as a choice rather than as a lesser
                                version of the rare ones. */}
                            <span
                              style={{
                                display: 'block',
                                fontSize: 10.5,
                                marginTop: 3,
                                fontWeight: 800,
                                letterSpacing: '0.02em',
                                color: p.effects.length ? 'var(--gold)' : 'var(--ink-dim)',
                              }}
                            >
                              {petEffectText(p)}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
              </>
            ),
          },
          {
            key: 'items',
            label: 'Items',
            right: `${myItems.length} collected`,
            content: (
              <>
              {/* ── Collected items (from the Daily Chest) ────────────────────── */}
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
                            // The art sits in its own column beside the three text rows,
                            // so a long item name never pushes it out of alignment.
                            gridTemplateColumns: '40px minmax(0, 1fr)',
                            gridTemplateAreas: '"art name" "art meta" "art pill"',
                            columnGap: 9,
                            rowGap: 3,
                            alignItems: 'start',
                            padding: '9px 10px',
                            borderRadius: 12,
                            background: on ? 'var(--grape)' : 'var(--card-solid)',
                            border: on ? '1px solid var(--gold)' : '1px solid var(--stroke)',
                            cursor: 'pointer',
                          }}
                        >
                          <img
                            src={itemArt(item.id)}
                            alt=""
                            aria-hidden
                            width={40}
                            height={40}
                            loading="lazy"
                            style={{ gridArea: 'art', width: 40, height: 40, objectFit: 'contain', alignSelf: 'center' }}
                          />
                          <span style={{ gridArea: 'name', fontSize: 12, fontWeight: 800, lineHeight: 1.15 }}>{item.name}</span>
                          <span className="faint" style={{ gridArea: 'meta', fontSize: 10, textTransform: 'capitalize' }}>{item.slot} · {item.rarity}</span>
                          <span style={{ ...pillStyle(on ? 'studio' : 'free'), gridArea: 'pill', marginTop: 2 }}>{on ? '✓ Worn' : 'Tap to wear'}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              </>
            ),
          },
          {
            key: 'cards',
            label: 'Backgrounds',
            right: `${unlockedBgCount}/${visibleBgs.length}`,
            content: (
              <>
              {/* ── Player-card backgrounds ───────────────────────────────────────
                  Every card and relic you own also unlocks the background themed after
                  it, so the collection doubles as a wardrobe for your player card. ── */}
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
                    const equipped = equippedBg === b.key
                    const src = collectibleByKey(b.key)
                    return (
                      <button
                        key={b.key}
                        onClick={!equipped ? () => pickBg(b.key) : undefined}
                        disabled={equipped}
                        title={b.name}
                        style={{
                          padding: 0, borderRadius: 12, overflow: 'hidden', cursor: equipped ? 'default' : 'pointer',
                          border: equipped ? `2px solid ${cardBgAccentColor(b.key)}` : '1px solid var(--stroke)',
                          boxShadow: equipped ? `0 0 14px ${cardBgAccentColor(b.key)}55` : 'none',
                          background: 'transparent',
                        }}
                      >
                        <div style={{ ...cardBgStyle(b.key), position: 'relative', height: 52, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                          <CardArt {...cardArtProps(b.key)} id={`bg-tile-${b.key}`} />
                          <span style={{ position: 'relative', fontSize: 16, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))' }}>
                            {b.emoji ?? src?.emoji ?? '✦'}
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
                  {lockedBgCount > 0 && ` ${lockedBgCount} more are waiting in your collection.`}
                  {storefrontEnabled() && ' The two Angel cards come with The Angel Pack — the pack is sold whole.'}
                </p>
              </div>
              </>
            ),
          },
          {
            key: 'borders',
            label: 'Borders',
            right: `Best streak: ${longest}d`,
            content: (
              <>
              {/* ── Streak-unlocked borders + badges ──────────────────────────── */}
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

              </>
            ),
          },
          {
            key: 'badges',
            label: 'Badges',
            content: (
              <>
              {/* Badges */}
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
              </>
            ),
          },
          {
            key: 'looks',
            label: 'Looks',
            right: 'saved outfits',
            content: <SavedLooks />,
          },
        ]}
      />

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
                      // Both stores, one implementation — shared with the patron
                      // card on /you so the two surfaces can't drift (lib/checkout).
                      setBuying(true)
                      const result = await startSkinCheckout(skin.id, profile.username)
                      setBuying(false)
                      if (result === 'cancelled') return
                      setBuyTarget(null)
                      // Never close on a paid purchase without saying what
                      // happened. 'unconfirmed' means Apple charged but the
                      // entitlement hasn't landed yet — the honest instruction is
                      // to wait and Restore, not silence.
                      if (result === 'failed') {
                        setErr('That didn’t go through — you haven’t been charged.')
                      } else if (result === 'unconfirmed') {
                        setErr('Payment went through. Your skin should appear in a moment — if it doesn’t, tap Restore purchases.')
                      }
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
            <span className="pill" style={{ fontSize: 10, background: 'var(--gold)', color: '#241f0a', fontWeight: 800 }}>★ {redeemTarget.packName ?? 'Exclusive'}</span>
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


      {err && <p style={{ color: 'var(--coral)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{err}</p>}
    </>
  )
}

// A collapsible sub-section of the customizer, so the (long) page can be tidied
// section by section. Header shows an optional right-side summary + a chevron.
// Every shelf in the customizer under ONE header. The pills ARE the header:
// tapping another name swaps the grid, tapping the one you're on folds the
// whole thing away, so there is exactly one control and every shelf's name is
// on screen at once.
//
// This replaced six stacked collapsibles. The old shape made changing your
// border after your skin a scroll past four other sections, and Pets sat so
// far down that nobody choosing a look ever saw it — which is the opposite of
// what a customizer is for. Everything you can equip is now one tap from
// everything else.
//
// Only the active tab's content is mounted, so six grids of avatars, card art
// and borders never render at once.
function TabbedSection({ tabs, defaultOpen = false }: {
  tabs: { key: string; label: string; right?: React.ReactNode; content: React.ReactNode }[]
  defaultOpen?: boolean
}) {
  const juice = useJuice()
  const [open, setOpen] = useState(defaultOpen)
  const [active, setActive] = useState(tabs[0].key)
  const reduceMotion = useSettings((st) => st.reduceMotion)
  const headRef = useRef<HTMLDivElement>(null)
  const current = tabs.find((t) => t.key === active) ?? tabs[0]

  // Switching from a long shelf (44 card backgrounds) to a short one can leave
  // you scrolled below the whole section, looking at nothing. If the pills have
  // gone off the top by the time you tap one, bring them back — but only then,
  // because scrolling a header that's already in view moves the page under a
  // thumb that just landed.
  const pick = (key: string) => {
    juice.select()
    if (key === current.key) { setOpen((o) => !o); return }
    setActive(key)
    setOpen(true)
    const top = headRef.current?.getBoundingClientRect().top ?? 0
    if (top < 0) headRef.current?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  return (
    <>
      <div ref={headRef} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '2px 0 10px', scrollMarginTop: 8 }}>
        {/* Wraps rather than scrolls sideways: six names fit in two rows on
            every phone, and all six stay visible. A scrolling chip rail hides
            half the wardrobe behind a swipe nobody is told about. */}
        <div role="tablist" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: 0 }}>
          {tabs.map((t) => {
            // A pill only reads as selected while the section is actually open;
            // folded, neither is lit, so the header never claims to be showing
            // something it isn't.
            const on = open && t.key === current.key
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={on}
                onClick={() => pick(t.key)}
                className="pill"
                style={{
                  padding: '5px 11px',
                  fontFamily: 'var(--font-display)',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  color: on ? 'var(--ink)' : 'var(--ink-dim)',
                  background: on ? 'var(--grape)' : 'var(--card)',
                  borderColor: on ? 'var(--gold)' : 'var(--stroke)',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => { juice.select(); setOpen((o) => !o) }}
          aria-expanded={open}
          aria-label={open ? `Hide ${current.label}` : `Show ${current.label}`}
          style={{ background: 'transparent', border: 'none', padding: '4px 0 0', cursor: 'pointer', color: 'var(--gold)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
        >
          ▾
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: 'easeInOut' }} style={{ overflow: 'hidden' }}>
            {/* Keyed on the tab, so switching remounts and replays the fade —
                a swap with no motion at all reads as a render glitch. */}
            <motion.div key={current.key} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
              {/* The shelf's own count, under the pills rather than beside
                  them: once the row wraps, a hint trailing the last pill reads
                  as belonging to THAT pill instead of to the open shelf. */}
              {current.right && (
                <p className="faint" style={{ fontSize: 12, margin: '0 0 8px' }}>{current.right}</p>
              )}
              {current.content}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

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
