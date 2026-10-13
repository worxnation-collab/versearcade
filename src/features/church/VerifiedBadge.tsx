// "Verified" — the one visual difference a church package makes on a list or
// a page. It says the church's leadership has been confirmed and that its
// members get a scheduled verse; it is not a rank, not a size, not a level, and
// deliberately the same small chip at every size of congregation. Mint rather
// than gold: gold is rationed to "the thing to do next" (CLAUDE.md, palette).
export function VerifiedBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const md = size === 'md'
  return (
    <span
      title="This church's leadership is verified and it sets a verse for its members"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
        padding: md ? '3px 9px' : '2px 7px',
        borderRadius: 999,
        border: '1px solid var(--mint)',
        color: 'var(--mint)',
        fontSize: md ? 12 : 10.5,
        fontWeight: 800,
        letterSpacing: 0.2,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <svg width={md ? 12 : 10} height={md ? 12 : 10} viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2.2 6.3 4.8 8.8 9.8 3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Verified
    </span>
  )
}
