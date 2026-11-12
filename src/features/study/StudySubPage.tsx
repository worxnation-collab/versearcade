import type { ReactNode } from 'react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'

// The inside of a study book. Every book Tabitha lends opens onto one of these,
// so the way back to the library looks the same wherever you landed.
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
  // The house header (PageHeader), home = the Study tab — this page used to
  // carry its own "← Library" pill and a centred floating emoji.
  return (
    <Page>
      <PageHeader title={title} sub={blurb} home="/study" icon={<span aria-hidden>{emblem}</span>} />

      {/* Every card on a study page is the library's paper (index.css). */}
      <div className="study-vellum">{children}</div>

      <div style={{ height: 90 }} />
    </Page>
  )
}
