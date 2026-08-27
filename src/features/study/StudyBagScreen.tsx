import { StudySubPage } from './StudySubPage'
import { InventorySection } from '@/features/collection/InventorySection'

// What studying turned up, and the one thing it's for. The drop toast lands
// here, so "give it to your church" is one tap from the reveal.
export default function StudyBagScreen() {
  return (
    <StudySubPage
      emblem="🎒"
      title="Your bag"
      blurb="What you've found while studying — and the church you can give it to."
    >
      <InventorySection />
    </StudySubPage>
  )
}
