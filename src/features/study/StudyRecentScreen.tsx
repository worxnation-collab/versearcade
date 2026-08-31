import { StudySubPage } from './StudySubPage'
import { PracticeSection } from '@/features/practice/PracticeSection'

// "Study the last five" — the replay list, opened from the book Tabitha lends
// for it. Plain here (no collapsible header): the page title already says what
// this is, so a second one to fold would just be furniture.
export default function StudyRecentScreen() {
  return (
    <StudySubPage
      emblem="📚"
      title="The last five"
      blurb="Replay a verse you've already played. Beat your best score to earn XP."
    >
      <PracticeSection plain showEmpty />
    </StudySubPage>
  )
}
