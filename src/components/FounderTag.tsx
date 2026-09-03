import { isFounder } from '@/data/founder'

/**
 * The gold "Founder" pill next to the founder's name. Renders nothing for
 * anybody else, so the two surfaces that draw a name (ProfileHero and the
 * player card's identity block) can call it unconditionally and can't drift on
 * WHO gets it — that decision lives in data/founder.
 */
export function FounderTag({ username, size = 'md' }: { username: string; size?: 'sm' | 'md' }) {
  if (!isFounder(username)) return null
  const sm = size === 'sm'
  return (
    <span
      title="Built Verse Arcade"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: sm ? '2px 7px' : '3px 9px',
        borderRadius: 999,
        fontSize: sm ? 10 : 11,
        fontWeight: 800,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#2a1e05',
        background: 'linear-gradient(90deg, var(--gold), var(--tangerine))',
        boxShadow: '0 0 12px rgba(255,210,63,0.45)',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >
      🪨 Founder
    </span>
  )
}
