import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Avatar } from '@/components/Avatar'
import { Pet } from '@/components/Pet'
import { ItemShapeThumb } from '@/data/itemArt'
import { useAuth } from '@/store/auth'
import { useBible } from '@/store/bible'
import { useKeep } from '@/store/keep'
import { useSeason } from '@/store/season'
import { useJuice } from '@/juice/useJuice'
import { petProgress } from '@/lib/petProgress'
import { chaptersOpened } from '@/data/seals'
import { DEFAULT_AVATAR, skinOwned, type AvatarSpec, type SkinDef } from '@/data/avatar'
import { DOORS, atDoor, wardrobe, type WardrobeEntry } from '@/data/wardrobe'

// The Wardrobe — everything there is to earn, and the door to each thing.
//
// See the header in data/wardrobe.ts for the rule this page is built on: it
// shows the THING and the DOOR, and never the DISTANCE. No counts, no bars, no
// "12 of 22", no ordering by how close anything is. A gallery of what exists is
// an invitation; the same gallery with progress on it is a list of what you are
// behind on, which is the one screen this app doesn't build.
//
// It adds no way around lib/commerce: `skinVisible` still decides what a player
// may see, so a retired look stays with its owners and a priced one stays off a
// native shelf that can't sell it.
export default function WardrobeScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const profile = useAuth((s) => s.profile)
  const seasonUnlocks = useSeason((s) => s.unlocks)

  // Pet requirements and the reading gate read from stores nothing else on this
  // screen touches. Without loading them the page would quietly report that a
  // player has earned nothing — the trap lib/petProgress.ts documents.
  const bibleLoaded = useBible((s) => s.loaded)
  const keepLoaded = useKeep((s) => s.loaded)
  useEffect(() => {
    if (!bibleLoaded) void useBible.getState().load()
    if (!keepLoaded) void useKeep.getState().load()
  }, [bibleLoaded, keepLoaded])
  const chaptersRead = chaptersOpened(useBible((s) => s.chapters))

  const [open, setOpen] = useState<string | null>(null)

  const entries = useMemo(() => {
    if (!profile) return []
    const ownedSkins = profile.ownedSkins ?? []
    const isSkinOwned = (skin: SkinDef) =>
      skinOwned(skin, {
        ownedSkins,
        sharedDays: profile.sharedDays ?? [],
        referralCount: profile.referralCount ?? 0,
        liveBattles: profile.liveBattles ?? 0,
        battleWins: profile.battleWins ?? 0,
        seasonUnlocks,
        chaptersRead,
        level: profile.level,
        admin: profile.isAdmin,
      })
    return wardrobe({
      ownedSkins,
      ownedItems: profile.ownedItems ?? [],
      longestStreak: profile.longestStreak,
      chaptersRead,
      founder: profile.founder,
      isSkinOwned,
      petProgress: petProgress(),
      petAdmin: profile.isAdmin,
    })
  }, [profile, seasonUnlocks, chaptersRead, bibleLoaded, keepLoaded])

  if (!profile) return null
  const spec = profile.avatarCharacter ?? DEFAULT_AVATAR

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <h2 style={{ fontSize: 24, margin: 0 }}>🧺 Wardrobe</h2>
        <div style={{ flex: 1 }} />
        <button
          className="pill"
          onClick={() => { juice.select(); navigate(-1) }}
          style={{ fontSize: 13, fontWeight: 800, padding: '7px 14px' }}
        >
          Back
        </button>
      </div>

      <p className="faint" style={{ fontSize: 12.5, margin: '0 0 16px', lineHeight: 1.55 }}>
        Everything there is to wear, and what brings it. Nothing here is ranked, nothing expires,
        and nothing you have earned can be taken back. Tap a shelf to open it.
      </p>

      {DOORS.map((door) => {
        const shelf = atDoor(entries, door.id)
        if (!shelf.length) return null
        const isOpen = open === door.id
        return (
          <section key={door.id} style={{ marginBottom: 10 }}>
            <button
              className="card"
              onClick={() => { juice.select(); setOpen(isOpen ? null : door.id) }}
              aria-expanded={isOpen}
              style={{
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                cursor: 'pointer',
                borderColor: isOpen ? 'var(--gold)' : 'var(--stroke)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, display: 'block' }}>{door.name}</b>
                <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.4, display: 'block', marginTop: 2 }}>
                  {door.line}
                </span>
              </span>
              <span aria-hidden style={{ fontSize: 13, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
            </button>

            {isOpen && (
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', marginTop: 8 }}>
                {shelf.map((e, i) => (
                  <Tile key={e.key} entry={e} spec={spec} emoji={profile.avatarEmoji} index={i} />
                ))}
                {door.to && (
                  <button
                    className="pill"
                    onClick={() => { juice.coin(); navigate(door.to!) }}
                    style={{ gridColumn: '1 / -1', fontWeight: 800, fontSize: 13, padding: '10px 14px' }}
                  >
                    Go there →
                  </button>
                )}
              </div>
            )}
          </section>
        )
      })}

      <p className="faint center" style={{ fontSize: 11, margin: '18px 0 0', lineHeight: 1.5 }}>
        No counts and no bars on purpose. What you have is yours; the rest is simply there.
      </p>
    </Page>
  )
}

function Tile({
  entry,
  spec,
  emoji,
  index,
}: {
  entry: WardrobeEntry
  spec: AvatarSpec
  emoji: string
  index: number
}) {
  // Locked draws the thing itself, dimmed and desaturated with the lock as a
  // corner chip — never a padlock over the face. The skins grid learned this
  // the hard way: the one surface meant to make somebody want a look was the
  // one where they couldn't see it.
  const art =
    entry.kind === 'skin' ? (
      <Avatar emoji={emoji} character={{ ...spec, skinId: entry.id, regalia: null }} size={56} ring={false} />
    ) : entry.kind === 'pet' ? (
      <Pet id={entry.id} size={48} />
    ) : entry.kind === 'item' ? (
      <ItemShapeThumb id={entry.id} slot={entry.slot ?? 'hat'} size={48} />
    ) : entry.kind === 'border' ? (
      <Avatar emoji={emoji} character={spec} size={52} border={entry.id} />
    ) : (
      <Avatar emoji={emoji} character={spec} size={52} badge={entry.id} />
    )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(0.02 * index, 0.24), type: 'spring', stiffness: 320, damping: 26 }}
      className="card"
      style={{
        display: 'grid',
        justifyItems: 'center',
        gap: 6,
        padding: '12px 8px 10px',
        minWidth: 0,
        borderColor: entry.owned ? 'var(--gold)' : 'var(--stroke)',
      }}
    >
      <div style={{ position: 'relative', opacity: entry.owned ? 1 : 0.6, filter: entry.owned ? 'none' : 'saturate(0.55)' }}>
        {art}
        {!entry.owned && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              right: -4,
              bottom: -2,
              fontSize: 12,
              lineHeight: 1,
              background: 'var(--card-solid)',
              border: '1px solid var(--stroke)',
              borderRadius: 999,
              padding: 3,
            }}
          >
            🔒
          </span>
        )}
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 800, textAlign: 'center', lineHeight: 1.2 }}>{entry.name}</span>
      <span className="faint" style={{ fontSize: 10.5, textAlign: 'center', lineHeight: 1.35 }}>
        {entry.owned ? 'Yours' : entry.how}
      </span>
    </motion.div>
  )
}
