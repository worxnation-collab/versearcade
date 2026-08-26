import { TIERS, TIER_LABEL, type TierCounts, type VerseTier } from '@/lib/bibleProgress'
import { PAPER, PAPER_TIER } from './paper'

// The shared vocabulary of the Bible: one stacked bar and one legend, used on
// the contents page, on a book and on a chapter, so "gold means kept" is learned
// once and true everywhere.

/** Proportions of a scope's verses across the four tiers. */
export function TierBar({
  counts,
  height = 8,
  label,
}: {
  counts: TierCounts
  height?: number
  label?: string
}) {
  const total = TIERS.reduce((s, t) => s + counts[t], 0)
  if (!total) return null

  return (
    <div
      role="img"
      aria-label={
        label ??
        TIERS.filter((t) => counts[t] > 0)
          .map((t) => `${TIER_LABEL[t]}: ${counts[t]}`)
          .join(', ')
      }
      style={{
        display: 'flex',
        height,
        borderRadius: 'var(--r-pill)',
        overflow: 'hidden',
        background: 'rgba(58,44,22,0.07)',
        border: `1px solid ${PAPER.ruleSoft}`,
      }}
    >
      {TIERS.map((tier) =>
        counts[tier] > 0 ? (
          <div
            key={tier}
            style={{
              width: `${(counts[tier] / total) * 100}%`,
              // The Bible is 31,102 verses, so a real morning's reading is a
              // fraction of a pixel. Never let a mark the player actually made
              // round away to an empty bar.
              minWidth: tier === 'unread' ? 0 : 3,
              // Unread is the page itself, not a bar — it reads as room left,
              // not as a deficit.
              background: tier === 'unread' ? 'transparent' : PAPER_TIER[tier].dot,
            }}
          />
        ) : null,
      )}
    </div>
  )
}

/** What the shading means, spelled out — meaning never rides on color alone. */
export function TierLegend({ compact, only }: { compact?: boolean; only?: VerseTier[] }) {
  const shown: VerseTier[] = only ?? (compact ? ['saved', 'studied', 'read'] : TIERS)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 10 : 12, justifyContent: 'center' }}>
      {shown.map((tier) => (
        <span
          key={tier}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: PAPER.inkFaint }}
        >
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: tier === 'unread' ? 'transparent' : PAPER_TIER[tier].dot,
              border: tier === 'unread' ? `1px dashed ${PAPER.inkFaint}` : 'none',
            }}
          />
          {TIER_LABEL[tier]}
        </span>
      ))}
    </div>
  )
}

/** A card on the page — a boxed note, not the app's glassy dark card. */
export function PaperCard({
  children,
  accent,
  style,
}: {
  children: React.ReactNode
  accent?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        border: `1px solid ${accent ?? PAPER.rule}`,
        borderRadius: 14,
        background: 'rgba(255,255,255,0.45)',
        padding: 14,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
