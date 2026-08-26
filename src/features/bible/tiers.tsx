import { TIERS, TIER_COLOR, TIER_LABEL, type TierCounts, type VerseTier } from '@/lib/bibleProgress'

// The shared vocabulary of the Bible view: one stacked bar and one legend, used
// on the contents page, on a book, and on a chapter, so "gold means kept" is
// learned once and true everywhere.

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
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--stroke)',
      }}
    >
      {TIERS.map((tier) =>
        counts[tier] > 0 ? (
          <div
            key={tier}
            style={{
              width: `${(counts[tier] / total) * 100}%`,
              // Unread is the page itself, not a bar — it reads as room left,
              // not as a deficit.
              background: tier === 'unread' ? 'transparent' : TIER_COLOR[tier],
              opacity: tier === 'read' ? 0.45 : 1,
            }}
          />
        ) : null,
      )}
    </div>
  )
}

/** What the shading means, spelled out — meaning never rides on color alone. */
export function TierLegend({ compact }: { compact?: boolean }) {
  const shown: VerseTier[] = compact ? ['saved', 'studied', 'read'] : TIERS
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: compact ? 10 : 12,
        justifyContent: 'center',
      }}
    >
      {shown.map((tier) => (
        <span
          key={tier}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}
          className="faint"
        >
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: tier === 'unread' ? 'transparent' : TIER_COLOR[tier],
              opacity: tier === 'read' ? 0.5 : 1,
              border: tier === 'unread' ? '1px dashed var(--ink-faint)' : 'none',
            }}
          />
          {TIER_LABEL[tier]}
        </span>
      ))}
    </div>
  )
}
