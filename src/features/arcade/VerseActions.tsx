import { Link } from 'react-router-dom'
import { FavoriteButton } from '@/components/FavoriteButton'
import { canonBook } from '@/data/bible/structure'

// What you can do with a verse a machine just gave you: keep it, or go and read
// the chapter it came out of. Shared by both games that end on scripture, so
// the offer is the same wherever the verse turns up.
//
// Never rendered on a free go from a shared link: keeping a verse writes to a
// shelf the visitor doesn't have, and the chapter reader is behind the account
// wall, so both would be an offer that goes nowhere.
export function VerseActions({
  reference,
  book,
  chapter,
}: {
  reference: string
  book: string
  chapter: number
}) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
      <FavoriteButton reference={reference} label="Keep this verse" />
      <Link
        className="pill"
        style={{ textDecoration: 'none', color: 'var(--ink)' }}
        to={`/bible/${encodeURIComponent(canonBook(book))}/${chapter}`}
      >
        📖 Read the chapter
      </Link>
    </div>
  )
}
