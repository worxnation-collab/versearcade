import { motion, AnimatePresence } from 'framer-motion'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'
import { Icon, type IconId } from '@/data/icons'

// One line about a tab, the first time it is opened.
//
// These are the four slides the tutorial used to spend on Battle, Study, Church
// and You, moved to the moment each is useful: the tab in front of you rather
// than a modal in front of the Play tab. One sentence, one ✕, remembered per
// tip, and never shown again — not a coach mark that returns, not a checklist
// of tabs to visit. A tip that has been closed leaves no trace.
export const TIPS: Record<string, { icon: IconId; text: string }> = {
  battle: { icon: 'battle', text: 'Challenge a friend to the same quiz, head to head. Your wins raise your team’s keep — a hall you get to furnish.' },
  study: { icon: 'study', text: 'Nothing in here touches your rank. Race the CPU, drill one book, replay a verse, or open your own Bible — all 66, lighting up as you read.' },
  church: { icon: 'church', text: 'Play for the church you actually go to. Your points pool with everyone there, the building grows for all of you, and you plant the garden out front.' },
  you: { icon: 'you', text: 'Build your character, earn borders and badges, unlock hero skins — and furnish your own Upper Room, with a quiet place in it to pray.' },
}

export type TipId = 'battle' | 'study' | 'church' | 'you'

export function FirstVisitTip({ id }: { id: TipId }) {
  const juice = useJuice()
  const seen = useSettings((s) => s.tipsSeen.includes(id))
  const set = useSettings((s) => s.set)
  const tip = TIPS[id]

  return (
    <AnimatePresence initial={false}>
      {!seen && (
        <motion.div
          key={id}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          className="card"
          role="note"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '10px 12px',
            marginBottom: 12,
            borderColor: 'var(--edge)',
            background: 'transparent',
            overflow: 'hidden',
          }}
        >
          <span aria-hidden style={{ lineHeight: 0, flexShrink: 0, marginTop: 1, color: 'var(--edge)' }}>
            <Icon id={tip.icon} size={17} />
          </span>
          <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.45, flex: 1, minWidth: 0 }}>{tip.text}</p>
          <button
            className="pill"
            aria-label="Got it"
            onClick={() => {
              juice.select?.()
              set({ tipsSeen: [...useSettings.getState().tipsSeen, id] })
            }}
            style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0 }}
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
