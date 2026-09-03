import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/store/auth'
import { useFavorites } from '@/store/favorites'
import { useJuice } from '@/juice/useJuice'
import { toList } from '@/lib/favorites'
import { BIBLE_BOOKS, type VerseSeed } from '@/data/bible/pool'
import {
  CARD_TRANSLATIONS,
  aboutVerseSeed,
  normalizeVerseReference,
  searchPoolVerses,
  translationByCode,
  type CardAbout,
} from '@/data/cardAbout'

// The "About" shelf of the customizer: what your card says about you. Three
// picks — a favorite verse, a favorite book, the translation you read — and
// each is a choice from a fixed list rather than a field to type in
// (data/cardAbout says why). It saves on every tap, like everything else in
// the customizer, and the card above redraws immediately.
//
// The verse picker is a search over the arcade's own pool plus the verses on
// your shelf, with one escape hatch: a reference that IS a real verse but isn't
// in the pool ("Use John 3:17") goes on the card as a reference alone. That
// keeps the whole Bible reachable without ever storing a sentence.
export function CardAboutEditor({ onSaved }: { onSaved?: () => void }) {
  const profile = useAuth((s) => s.profile)!
  const setCardAbout = useAuth((s) => s.setCardAbout)
  const juice = useJuice()
  const [err, setErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const favLoaded = useFavorites((s) => s.loaded)
  const loadFavorites = useFavorites((s) => s.load)
  const favMap = useFavorites((s) => s.map)
  useEffect(() => {
    if (!favLoaded) void loadFavorites()
  }, [favLoaded, loadFavorites])

  const current: CardAbout = {
    verse: profile.favoriteVerse ?? null,
    book: profile.favoriteBook ?? null,
    translation: profile.favoriteTranslation ?? null,
  }

  const save = async (patch: Partial<CardAbout>) => {
    setErr(null)
    juice.select()
    const res = await setCardAbout({ ...current, ...patch })
    if (!res.ok) setErr(res.error ?? 'Couldn’t save that')
    else onSaved?.()
  }

  // What the list under the search box shows: your shelf while the box is
  // empty (newest keep first, a handful), pool matches once you type, and the
  // typed reference itself when it names a real verse the pool doesn't carry.
  const kept = useMemo(() => toList(favMap).slice(0, 6), [favMap])
  const results = useMemo(() => searchPoolVerses(query, 8), [query])
  const typedRef = useMemo(() => {
    const ref = normalizeVerseReference(query)
    if (!ref) return null
    return results.some((r) => r.reference === ref) ? null : ref
  }, [query, results])

  const chosenSeed = aboutVerseSeed(current.verse)

  return (
    <div className="card" style={{ marginBottom: 14, minWidth: 0, overflow: 'hidden' }}>
      {/* ── Favorite verse ─────────────────────────────────────────────── */}
      <Label>Favorite verse</Label>
      {current.verse ? (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 12, marginBottom: 10,
            background: 'var(--grape)', border: '1px solid var(--gold)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <b style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 15 }}>{current.verse}</b>
            {chosenSeed && (
              <span className="faint" style={{ display: 'block', fontSize: 12, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {chosenSeed.text}
              </span>
            )}
          </div>
          <button
            className="pill"
            onClick={() => void save({ verse: null })}
            aria-label="Remove favorite verse"
            style={{ fontSize: 12, padding: '5px 10px', fontWeight: 800, flexShrink: 0 }}
          >
            ✕ Clear
          </button>
        </div>
      ) : (
        <p className="faint" style={{ fontSize: 12, margin: '0 0 10px', lineHeight: 1.45 }}>
          The verse that’s yours. Search below, or pick one from your shelf.
        </p>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="John 3:16 — or a word: shepherd, fear, love…"
        autoCapitalize="none"
        autoCorrect="off"
        aria-label="Search for a verse"
        style={{ padding: '11px 14px', fontSize: 15 }}
      />
      {/* minmax(0, 1fr): a grid item's min-width is `auto`, so a row holding a
          nowrap verse widened the whole card past the phone and the page
          scrolled sideways. Same scar as the sign-up tile row. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, marginTop: 8 }}>
        {query.trim() === '' ? (
          kept.length > 0 ? (
            <>
              <span className="faint" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>From your shelf</span>
              {kept.map((k) => (
                <VerseRow
                  key={k.reference}
                  reference={k.reference}
                  text={k.seed?.text}
                  selected={current.verse === k.reference}
                  onPick={() => void save({ verse: k.reference })}
                />
              ))}
            </>
          ) : null
        ) : (
          <>
            {results.map((v: VerseSeed) => (
              <VerseRow
                key={v.reference}
                reference={v.reference}
                text={v.text}
                selected={current.verse === v.reference}
                onPick={() => void save({ verse: v.reference })}
              />
            ))}
            {typedRef && (
              <VerseRow
                reference={typedRef}
                text="Not one the arcade plays yet — the reference alone goes on your card."
                selected={current.verse === typedRef}
                onPick={() => void save({ verse: typedRef })}
              />
            )}
            {results.length === 0 && !typedRef && (
              <p className="faint" style={{ fontSize: 12, margin: '2px 0 0' }}>
                Nothing matches yet. Try a reference like <i>Psalm 23:1</i>, or a word from the verse.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Favorite book ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16 }}>
        <Label tight>Favorite book</Label>
        <select
          value={current.book ?? ''}
          onChange={(e) => void save({ book: e.target.value || null })}
          aria-label="Favorite book"
          style={{
            padding: '7px 10px', borderRadius: 10, background: 'var(--card-solid)',
            border: '1px solid var(--stroke)', color: 'var(--ink)', fontSize: 13, fontWeight: 700,
            maxWidth: '60%',
          }}
        >
          <option value="">None yet</option>
          <optgroup label="Old Testament">
            {BIBLE_BOOKS.slice(0, 39).map((b) => <option key={b} value={b}>{b}</option>)}
          </optgroup>
          <optgroup label="New Testament">
            {BIBLE_BOOKS.slice(39).map((b) => <option key={b} value={b}>{b}</option>)}
          </optgroup>
        </select>
      </div>

      {/* ── Translation ────────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Label>
          Translation you read
          {current.translation && (
            <span className="faint" style={{ textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
              · {translationByCode(current.translation)?.name}
            </span>
          )}
        </Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CARD_TRANSLATIONS.map((t) => {
            const on = current.translation === t.code
            return (
              <button
                key={t.code}
                onClick={() => void save({ translation: on ? null : t.code })}
                aria-pressed={on}
                title={t.name}
                className="pill"
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '6px 11px',
                  background: on ? 'var(--grape)' : 'var(--card-solid)',
                  border: on ? '1px solid var(--gold)' : '1px solid var(--stroke)',
                  cursor: 'pointer',
                }}
              >
                {t.code}
              </button>
            )
          })}
        </div>
      </div>

      {err && <p style={{ color: 'var(--coral)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}
      <p className="faint" style={{ fontSize: 10, marginTop: 12, lineHeight: 1.4 }}>
        All three are picks from a list, so nothing typed ever lands on a card. Leave any of
        them empty and the card simply doesn’t mention it — none of this is scored.
      </p>
    </div>
  )
}

function Label({ children, tight }: { children: React.ReactNode; tight?: boolean }) {
  return (
    <div
      className="faint"
      style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: tight ? 0 : 6, fontWeight: 700 }}
    >
      {children}
    </div>
  )
}

function VerseRow({
  reference,
  text,
  selected,
  onPick,
}: {
  reference: string
  text?: string
  selected: boolean
  onPick: () => void
}) {
  return (
    <button
      onClick={onPick}
      aria-pressed={selected}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%', minWidth: 0,
        padding: '8px 11px', borderRadius: 12, cursor: 'pointer',
        background: selected ? 'var(--grape)' : 'var(--card-solid)',
        border: selected ? '1px solid var(--gold)' : '1px solid var(--stroke)',
      }}
    >
      <span style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
        <b style={{ display: 'block', fontSize: 13 }}>{reference}</b>
        {text && (
          <span className="faint" style={{ display: 'block', fontSize: 11.5, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {text}
          </span>
        )}
      </span>
      {selected && <span style={{ color: 'var(--gold)', fontWeight: 800, flexShrink: 0 }}>✓</span>}
    </button>
  )
}
