import type { ReactNode } from 'react'
import { Character } from '@/components/Character'
import { CardBg } from '@/components/CardBg'
import { Pet } from '@/components/Pet'
import { cardBgInk, cardBgStyle } from '@/data/playerCards'
import { petById, petGlows } from '@/data/pets'
import { useSettings } from '@/store/settings'
import { FounderTag } from '@/components/FounderTag'
import type { AvatarSpec } from '@/types'

// The top of your own profile, and the top of anybody's card.
//
// Everywhere else in the app a character is a 44px circle with the face cropped
// in, because that's what a chip or a list row needs. This is the one component
// that shows the whole figure at the size the skin was drawn for, on the
// background that player earned, with their pet beside them.
//
// It serves TWO surfaces now: your own /you (at full size) and the player-card
// pop-up (smaller). One component rather than two so the look stays consistent.
//
// It is a PORTRAIT, not a card. No stats, no level, no numbers of any kind —
// the player card sits directly underneath and carries all of that.
export function ProfileHero({
  spec,
  emoji,
  username,
  pet,
  cardBackground,
  title,
  caption = null,
  size = 190,
}: {
  spec?: AvatarSpec | null
  emoji: string
  username: string
  pet?: string | null
  cardBackground?: string | null
  title?: string | null
  caption?: ReactNode
  size?: number
}) {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const companion = petById(pet)
  const glowing = petGlows(pet)
  const artId = `hero-${username}-${cardBackground ?? 'default'}`

  const FIGURE = size

  return (
    <div
      style={{
        ...cardBgStyle(cardBackground),
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--r-lg, 22px)',
        border: '1px solid var(--stroke)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
        padding: '18px 16px 20px',
      }}
    >
      <CardBg bgKey={cardBackground} id={artId} eager />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(9, 6, 8,0.18) 0%, rgba(9, 6, 8,0.52) 100%)',
        }}
      />

      <div style={{ position: 'relative' }}>
        {caption != null && (
          <p
            className="faint"
            style={{
              margin: 0,
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              textAlign: 'center',
              textShadow: '0 1px 4px rgba(9, 6, 8,0.9), 0 0 10px rgba(9, 6, 8,0.7)',
            }}
          >
            {caption}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: companion ? 4 : 0,
            marginTop: caption != null ? 6 : 0,
            minHeight: FIGURE,
          }}
        >
          {spec ? (
            <span
              className={reduceMotion ? undefined : 'floaty'}
              style={{ display: 'block', flexShrink: 0, position: 'relative' }}
            >
              {glowing && <Aura size={FIGURE} still={reduceMotion} />}
              <span style={{ position: 'relative', display: 'block' }}>
                <Character spec={spec} size={FIGURE} fullBody title={username} />
              </span>
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
                marginLeft: -FIGURE * 0.17,
                marginBottom: FIGURE * 0.045,
                animationDelay: '-1.4s',
              }}
            >
              <Pet id={companion.id} size={FIGURE * companion.scale} title={companion.name} />
            </span>
          )}
        </div>

        <p
          className={cardBgInk(cardBackground) === 'gold' ? 'gold-text' : undefined}
          style={{
            margin: '10px 0 0',
            textAlign: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: FIGURE >= 170 ? 28 : 22,
            fontWeight: 800,
            lineHeight: 1.15,
            textShadow: '0 2px 10px rgba(9, 6, 8,0.7)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          @{username}
        </p>
        <div style={{ textAlign: 'center', marginTop: 2 }}>
          <FounderTag username={username} />
        </div>
        {title && (
          <p className="dim" style={{ margin: '2px 0 0', textAlign: 'center', fontSize: 14, fontWeight: 600, textShadow: '0 1px 6px rgba(9, 6, 8,0.8)' }}>
            {title}
          </p>
        )}
      </div>
    </div>
  )
}

function Aura({ size, still }: { size: number; still: boolean }) {
  return (
    <span
      aria-hidden
      className={still ? undefined : 'pet-aura'}
      style={{
        position: 'absolute',
        left: '50%',
        top: '52%',
        width: size * 1.15,
        height: size * 1.15,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        background:
          'radial-gradient(circle, rgba(255,210,63,0.34) 0%, rgba(255,159,28,0.16) 42%, rgba(255,159,28,0) 68%)',
        pointerEvents: 'none',
      }}
    />
  )
}
