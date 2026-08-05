export function Avatar({ emoji, size = 44, ring }: { emoji: string; size?: number; ring?: boolean }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.5,
        background: 'linear-gradient(180deg, var(--grape), var(--grape-deep))',
        boxShadow: ring ? '0 0 0 3px var(--gold), 0 6px 16px rgba(0,0,0,0.4)' : '0 6px 16px rgba(0,0,0,0.4)',
        flexShrink: 0,
      }}
    >
      {emoji}
    </div>
  )
}
