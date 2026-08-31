import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'

// The chrome every arcade screen wears: a way out, a name, and a line saying
// what this machine is. Extracted the moment a second game wanted it — two
// copies of a header drift, which is the same rule `KeepScene` and `QuizRunner`
// are built on.
//
// `noNav` on purpose: a game takes the screen. The way back is the arrow, and
// the arrow goes where you actually came from — the lobby if you picked the
// machine there, the room if you tapped the cabinet standing in it.
export function ArcadeShell({
  title,
  tagline,
  home = '/arcade',
  children,
}: {
  title: string
  tagline: string
  /** Where the arrow goes when there's no history to go back to. */
  home?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  // A deep link (a shared URL, a reload on this screen) has nothing behind it,
  // and `navigate(-1)` there walks the player out of the app. React Router
  // marks that first entry with the default key.
  const canGoBack = location.key !== 'default'

  return (
    <Page noNav>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => (canGoBack ? navigate(-1) : navigate(home))}
            aria-label={home === '/arcade' ? 'Back to the arcade' : 'Leave the arcade'}
            style={{
              fontSize: 20,
              lineHeight: 1,
              padding: '8px 12px',
              borderRadius: 'var(--r-pill)',
              background: 'var(--card)',
              border: '1px solid var(--stroke)',
              flexShrink: 0,
            }}
          >
            ←
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 26 }}>{title}</h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.4 }}>
              {tagline}
            </p>
          </div>
        </div>

        {children}
      </div>
    </Page>
  )
}
