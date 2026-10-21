import { useState, type CSSProperties } from 'react'
import { quoted } from '@/features/daily/MissedList'
import { useVerseText, type VerseLike } from '@/features/bible/useVerseText'

// A quoted verse in the player's translation, with the translation's badge
// after it. Tapping the badge shows the publisher's notice in place — API.Bible
// requires the full copyright to be one step from every citation, and a line
// that appears where you tapped is a step nobody has to go looking for.
//
// The words are the bundled BSB until the chosen version lands (usually from
// the device cache, so a frame or two), and stay BSB — labelled BSB — if it
// never does. See useVerseText.
export function ScriptureQuote({
  verse,
  style,
  className,
}: {
  verse: VerseLike
  style?: CSSProperties
  className?: string
}) {
  const shown = useVerseText(verse)
  const [open, setOpen] = useState(false)
  return (
    <>
      <p className={className} style={{ lineHeight: 1.5, ...style, opacity: shown.loading ? 0.75 : 1, transition: 'opacity 0.2s' }}>
        {quoted(shown.text)}{' '}
        <TranslationBadge abbr={shown.abbr} open={open} onToggle={() => setOpen((o) => !o)} />
      </p>
      {open && (
        <p className="faint" style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.4 }}>
          {shown.copyright}
        </p>
      )}
    </>
  )
}

export function TranslationBadge({ abbr, open, onToggle }: { abbr: string; open?: boolean; onToggle?: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${abbr} — show copyright`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        padding: '1px 6px',
        borderRadius: 6,
        border: '1px solid var(--stroke)',
        background: 'transparent',
        color: 'var(--ink-dim)',
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.04em',
        lineHeight: 1.5,
        cursor: onToggle ? 'pointer' : 'default',
        fontStyle: 'normal',
      }}
    >
      {abbr}
    </button>
  )
}
