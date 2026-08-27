import { StudySubPage } from './StudySubPage'
import { BookAccuracyChart } from './BookAccuracyChart'

// "My reports" — where accuracy by book lives now that it's a book of its own
// rather than a panel at the bottom of the Study tab. Every book is expanded
// here: this page exists to be read in full, so nothing hides behind a
// "show more".
//
// Still a review tool and not a scoreboard: it compares you to nobody, and the
// only action it offers is a drill on whatever is softest.
export default function StudyReportsScreen() {
  return (
    <StudySubPage
      emblem="📊"
      title="My reports"
      blurb="Where you stand book by book — only ever against yourself."
    >
      <BookAccuracyChart defaultExpanded flush />
    </StudySubPage>
  )
}
