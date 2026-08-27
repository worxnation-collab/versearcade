import { Character } from '@/components/Character'
import { CardBg } from '@/components/CardBg'
import { Pet } from '@/components/Pet'
import { cardBgStyle } from '@/data/playerCards'
import { petById } from '@/data/pets'
import { useSettings } from '@/store/settings'
import type { AvatarSpec } from '@/types'

// "This is you" — the top of your own profile.
//
// Everywhere else in the app your character is a 44px circle with the face
// cropped in, because that's what a chip or a list row needs. This is the one
// place that shows the whole figure at the size the skin was drawn for, on the
// background you earned, with your pet beside you. The tab is called You; it
// should open with you in it.
//
// It is a PORTRAIT, not a card. No stats, no level, no numbers of any kind —
// the player card sits directly underneath and carries all of that, and the
// point of this is the moment before the numbers. It also means nothing here
// can be compared with anybody: it's a picture of a person and their lamb.
//
// The background is the same `cardBgStyle` + `CardBg` pair the player card
// uses, so the two can't drift — equip a background and both change together.
//
// reduce-motion: the float is decoration, so it simply stops. (The scenes'
// rule — repositioning instead of gliding — is for figures that would otherwise
// go dead; a portrait standing still is still a portrait.)
export function ProfileHero({
  spec,
  emoji,
  username,
  pet,
  cardBackground,
  title,
}: {
  spec?: AvatarSpec | null
  emoji: string
  username: string
  pet?: string | null
  cardBackground?: string | null
  /** The equipped road title, if any — the one bit of text that is identity
   *  rather than score. */
  title?: string | null
}) {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const companion = petById(pet)
  // Unique per hero: SVG gradient ids inside CardBg must not collide with the
  // player card rendering the same background right below this.
  const artId = `hero-${username}-${cardBackground ?? 'default'}`

  const FIGURE = 190

  return (
    <div
      style={{
        ...cardBgStyle(cardBackground),
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--r-lg, 22px)',
        border: '1px solid var(--stroke)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
        padding: '14px 16px 18px',
      }}
    >
      <CardBg bgKey={cardBackground} id={artId} eager />
      {/* The same scrim the card uses: the brighter paintings would otherwise
          swallow a pale skin. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(8,3,24,0.18) 0%, rgba(8,3,24,0.52) 100%)',
        }}
      />

      <div style={{ position: 'relative' }}>
        <p
          className="faint"
          style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center' }}
        >
          This is you
        </p>

        {/* Feet on one line: the figure and the pet share a baseline, so the
            pet stands NEXT to you rather than floating near you. The pet's own
            float runs on a slightly different beat, which is what stops the two
            reading as one rigid object bobbing. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: companion ? 4 : 0,
            marginTop: 6,
            minHeight: FIGURE,
          }}
        >
          {spec ? (
            <span
              className={reduceMotion ? undefined : 'floaty'}
              style={{ display: 'block', flexShrink: 0 }}
            >
              <Character spec={spec} size={FIGURE} fullBody title={username} />
            </span>
          ) : (
            <span
              className={reduceMotion ? undefined : 'floaty'}
              style={{ display: 'block', fontSize: FIGURE * 0.55, lineHeight: 1 }}
              role="img"
              aria-label={username}
            >
              {emoji}
            </span>
          )}

          {companion && (
            <span
              className={reduceMotion ? undefined : 'floaty'}
              style={{
                display: 'block',
                flexShrink: 0,
                // Character draws into a 120x170 viewBox with the figure only
                // about 70 units wide, so roughly a fifth of the rendered box
                // is empty on each side. Without pulling that back the pet
                // stands a visible gap away and the two read as two pictures
                // rather than as somebody and their lamb.
                marginLeft: -FIGURE * 0.17,
                // The figure's feet sit on Character's ground shadow at y=162
                // of 170 — about 4.5% up from the bottom. Matching it puts the
                // two on one floor.
                marginBottom: FIGURE * 0.045,
                // Half a beat behind the figure, so they aren't in lockstep.
                animationDelay: '-1.4s',
              }}
            >
              <Pet id={companion.id} size={FIGURE * companion.scale} title={companion.name} />
            </span>
          )}
        </div>

        <p
          style={{
            margin: '2px 0 0',
            textAlign: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            fontWeight: 800,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          @{username}
        </p>
        {(title || companion) && (
          <p className="faint" style={{ margin: '2px 0 0', textAlign: 'center', fontSize: 12.5 }}>
            {[title, companion?.name].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}
