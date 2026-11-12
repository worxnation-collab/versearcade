import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// The one header for every screen that is NOT a tab root.
//
// Before this, seven shapes were in use (2026-11-11 audit): a centred emoji over
// a centred h1, a "← Back" pill above a left h1, a top-right "Back" pill, a round
// ← button, and no title at all. A screen you reach FROM somewhere gets this:
// a round ← on the left, the title, one dim line under it, and at most one
// action on the right. Tab roots (/play, /battle, /study, /church, /you) do not
// use it — a title restating the nav button you just tapped is the ~130px the
// tabs gave back on purpose.
//
// `onBack` overrides where the arrow goes (a screen with its own exit rule);
// otherwise it walks history when there is some, and goes `home` when the
// screen was opened cold from a link or a reload — `navigate(-1)` from the
// first entry walks the player out of the app.

export function PageHeader({
  title,
  sub,
  home = '/play',
  onBack,
  backLabel = 'Back',
  noBack,
  icon,
  action,
  flush,
}: {
  title: ReactNode
  /** One dim line under the title. */
  sub?: ReactNode
  /** Where the arrow goes when there is no history to go back to. */
  home?: string
  /** Replaces the default back behaviour entirely. */
  onBack?: () => void
  backLabel?: string
  /** For a screen that must not offer a way back (a shared link's visitor). */
  noBack?: boolean
  /** A painted icon beside the title — a node, so callers pass PaintedIcon. */
  icon?: ReactNode
  /** One control on the right (share, settings…). */
  action?: ReactNode
  /** No bottom margin, for a parent that already spaces its children. */
  flush?: boolean
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const canGoBack = location.key !== 'default'
  const back = onBack ?? (() => (canGoBack ? navigate(-1) : navigate(home)))

  return (
    <header style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: flush ? 0 : 14 }}>
      {!noBack && (
        <button
          type="button"
          onClick={back}
          aria-label={backLabel}
          style={{
            width: 42,
            height: 42,
            display: 'grid',
            placeItems: 'center',
            fontSize: 20,
            lineHeight: 1,
            padding: 0,
            borderRadius: 'var(--r-pill)',
            background: 'var(--card)',
            border: '1px solid var(--stroke)',
            color: 'var(--ink)',
            flexShrink: 0,
            cursor: 'pointer',
          }}
        >
          ←
        </button>
      )}
      {/* The arrow sits level with the TITLE, not with the title-plus-subtitle
          block: a two-line subtitle used to pull it down beside the copy. */}
      <div style={{ minWidth: 0, flex: 1, paddingTop: 5 }}>
        <h1
          style={{
            fontSize: 26,
            lineHeight: 1.15,
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {icon && <span style={{ display: 'inline-flex', fontSize: 26, flexShrink: 0 }}>{icon}</span>}
          <span style={{ minWidth: 0 }}>{title}</span>
        </h1>
        {sub && (
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.4 }}>{sub}</p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </header>
  )
}
