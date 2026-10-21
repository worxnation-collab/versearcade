import { useEffect, useState } from 'react'
import { useSettings } from '@/store/settings'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { refreshAvailableBibles } from '@/lib/bible'
import { copyrightFor, selectableTranslations, translationById, type AvailableBible } from '@/lib/translations'

// The Bible you read in. One choice for every verse the app QUOTES — recaps,
// the Bible, highlights, the reader. The daily quiz keeps the BSB its
// questions are written from, and the line under the list says so.
//
// The list is only what this build can actually serve (selectableTranslations):
// the licensed versions appear once the Edge Function has confirmed this key
// carries them, so a keyless build shows the public-domain three and nothing
// that would read as something else.
export function TranslationPicker() {
  const juice = useJuice()
  const current = useSettings((s) => s.readingTranslation)
  const set = useSettings((s) => s.set)
  const online = useAuth((s) => s.mode === 'online')
  const [available, setAvailable] = useState<AvailableBible[] | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    void refreshAvailableBibles().then((b) => { if (live) setAvailable(b) })
    return () => { live = false }
  }, [])

  const options = selectableTranslations(available ?? undefined)
  const chosen = translationById(current)

  const pick = (id: string) => {
    juice.select?.()
    set({ readingTranslation: id })
    if (online) void useAuth.getState().updateProfile({ readingTranslation: id })
  }

  return (
    <>
      <h3 style={{ fontSize: 14, margin: '0 0 8px' }} className="dim">
        Bible translation <span className="faint" style={{ fontSize: 12 }}>· {chosen.abbr}</span>
      </h3>
      <div className="card" style={{ marginBottom: 6 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          {options.map((t) => {
            const on = chosen.id === t.id
            return (
              <button
                key={t.id}
                onClick={() => pick(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%',
                  padding: '11px 12px', borderRadius: 12,
                  background: on ? 'var(--select)' : 'var(--card-solid)',
                  border: on ? '1px solid var(--gold)' : '1px solid var(--stroke)', cursor: 'pointer',
                  color: 'var(--ink)',
                }}
              >
                <span className="pill" style={{ fontSize: 11, fontWeight: 800, flexShrink: 0, minWidth: 40, justifyContent: 'center' }}>{t.abbr}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: 14 }}>{t.name}</b>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-dim)' }}>{t.blurb}</span>
                </span>
                {on && <span style={{ color: 'var(--gold)', fontWeight: 800 }}>✓</span>}
              </button>
            )
          })}
        </div>
      </div>
      {available === undefined && options.length < 4 && (
        <p className="faint" style={{ fontSize: 11, margin: '0 0 4px' }}>Checking for more translations…</p>
      )}
      <p className="faint" style={{ fontSize: 11, lineHeight: 1.4 }}>
        Used wherever a verse is shown and in the Bible reader. The daily quiz asks about the Berean
        Standard Bible’s wording, so it shows the BSB. Offline, a verse you haven’t read in{' '}
        {chosen.abbr} yet shows in the BSB.
      </p>
      <p className="faint" style={{ fontSize: 10.5, lineHeight: 1.4, marginTop: 6 }}>
        {copyrightFor(chosen)} Scripture text provided by{' '}
        <a href="https://api.bible" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>API.Bible</a>.
      </p>
    </>
  )
}
