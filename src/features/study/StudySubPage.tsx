import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'

// The inside of a study book. Every shelf book opens onto one of these, so the
// way back to the shelf looks the same wherever you landed.
export function StudySubPage({
  emblem,
  title,
  blurb,
  children,
}: {
  emblem: string
  title: string
  blurb?: string
  children: ReactNode
}) {
  const navigate = useNavigate()

  return (
    <Page>
      <button
        className="pill"
        onClick={() => navigate('/study')}
        style={{ marginBottom: 14, fontSize: 13 }}
        aria-label="Back to the study shelf"
      >
        ← Shelf
      </button>

      <div className="center" style={{ marginBottom: 18 }}>
        <div className="floaty" style={{ fontSize: 40 }}>{emblem}</div>
        <h1 style={{ fontSize: 26, marginTop: 4 }}>{title}</h1>
        {blurb && <p className="dim" style={{ marginTop: 4, fontSize: 14, lineHeight: 1.45 }}>{blurb}</p>}
      </div>

      {children}

      <div style={{ height: 90 }} />
    </Page>
  )
}
