import { useEffect, useState } from 'react'
import { fetchChurchExtras } from '@/store/churchPackage'
import { givingLinkVisible } from '@/lib/commerce'
import type { ChurchExtras } from '@/types/churchPackages'

// What a church page adds on top of the free profile (0117): the verified
// badge, a logo, its one live announcement, and — for a verified church — the
// giving link. Fetched separately from `get_church_page`/`public_church_page`
// on purpose, so neither of those had to be restated (a wholesale restate of a
// function every board reads is the trap this codebase keeps warning about).
// A server without 0117 answers null and the page is exactly the old page.

export function useChurchExtras(churchId: string, refreshKey: unknown = null): ChurchExtras | null {
  const [extras, setExtras] = useState<ChurchExtras | null>(null)
  useEffect(() => {
    let alive = true
    setExtras(null)
    if (!churchId) return // the sheet is closed — nothing to ask about
    fetchChurchExtras(churchId).then((x) => { if (alive) setExtras(x) })
    return () => { alive = false }
  }, [churchId, refreshKey])
  return extras
}

/**
 * The announcement and the giving link, as they sit on the profile.
 *
 * The announcement is FREE-layer: any claimed church can post one, and it is
 * shown to anybody who opens the page, like the tagline. The giving link is
 * the verified layer's, and `givingLinkVisible()` decides whether this build
 * may show it at all (hidden in the App Store build — see lib/commerce.ts).
 */
export function ChurchExtrasBlock({ extras, churchName }: { extras: ChurchExtras | null; churchName: string }) {
  if (!extras) return null
  const giving = extras.verified && extras.givingUrl && givingLinkVisible() ? extras.givingUrl : null
  if (!extras.announcement && !giving) return null

  return (
    <div style={{ display: 'grid', gap: 10, margin: '0 0 14px' }}>
      {extras.announcement && (
        <div className="card" style={{ borderColor: 'var(--edge)' }}>
          <div className="faint" style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            From {churchName}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 14.5, lineHeight: 1.5, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
            {extras.announcement.message}
          </p>
        </div>
      )}
      {giving && <GiveLink url={giving} churchName={churchName} />}
    </div>
  )
}

/** One external link out to the church's own giving page. Nothing is paid in the app. */
export function GiveLink({ url, churchName, compact = false }: { url: string; churchName: string; compact?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      // noreferrer: the giving page learns nothing about which app page sent
      // somebody, the same rule the native sign-in bridge follows.
      rel="noopener noreferrer"
      className={compact ? 'pill' : 'card'}
      style={
        compact
          ? { fontSize: 12, fontWeight: 800, textDecoration: 'none' }
          : { display: 'block', textDecoration: 'none', color: 'inherit', textAlign: 'center' }
      }
    >
      {compact ? (
        <>Give to {churchName} ↗</>
      ) : (
        <>
          <b style={{ fontSize: 14.5 }}>Give to {churchName} ↗</b>
          <span className="faint" style={{ display: 'block', fontSize: 11.5, marginTop: 4 }}>
            Opens the church's own giving page. Verse Arcade takes nothing.
          </span>
        </>
      )}
    </a>
  )
}
