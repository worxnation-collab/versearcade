import { useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { useSettings } from '@/store/settings'

// Several sections under ONE header. The pills ARE the header: tapping another
// name swaps the panel, tapping the one you're on folds the whole thing away,
// so there is exactly one control and every section's name is on screen at once.
//
// This shape was built for the customizer, where it replaced six stacked
// collapsibles — the old shape made changing your border after your skin a
// scroll past four other sections, and Pets sat so far down that nobody
// choosing a look ever saw it. It lives out here now because the profile has
// the identical problem for the identical reason: five closed rows, all the
// same shape, and the one you want is always the last one. Two copies of this
// would drift the first time one grew a feature, which is the same argument
// `QuizRunner` and the little worlds are built on.
//
// Only the active tab's content is mounted, so five grids never render at once.
//
// **A pill may carry a dot, and may never carry a number.** The dot says
// somebody is waiting on you, which is the one thing in this app another person
// can be blocked by — the same single, countless dot the bottom nav uses, for
// the same reason. A count on a pill would turn a wardrobe into a queue.
export interface SectionTab {
  key: string
  label: string
  /** A line under the pills once the section is open. Not a badge. */
  right?: ReactNode
  content: ReactNode
  /** Someone is waiting on you in here. One dot, never a count. */
  dot?: boolean
}

export function TabbedSection({
  tabs,
  defaultOpen = false,
  defaultTab,
}: {
  tabs: SectionTab[]
  defaultOpen?: boolean
  /** Which pill starts selected. Falls back to the first tab. */
  defaultTab?: string
}) {
  const juice = useJuice()
  const [open, setOpen] = useState(defaultOpen)
  const [active, setActive] = useState(
    () => (defaultTab && tabs.some((t) => t.key === defaultTab) ? defaultTab : tabs[0].key),
  )
  const reduceMotion = useSettings((st) => st.reduceMotion)
  const headRef = useRef<HTMLDivElement>(null)
  const current = tabs.find((t) => t.key === active) ?? tabs[0]

  // Switching from a long shelf (44 card backgrounds) to a short one can leave
  // you scrolled below the whole section, looking at nothing. If the pills have
  // gone off the top by the time you tap one, bring them back — but only then,
  // because scrolling a header that's already in view moves the page under a
  // thumb that just landed.
  const pick = (key: string) => {
    juice.select()
    if (key === current.key) { setOpen((o) => !o); return }
    setActive(key)
    setOpen(true)
    const top = headRef.current?.getBoundingClientRect().top ?? 0
    if (top < 0) headRef.current?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  return (
    <>
      <div ref={headRef} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '2px 0 10px', scrollMarginTop: 8 }}>
        {/* Wraps rather than scrolls sideways: the names fit in two rows on
            every phone, and all of them stay visible. A scrolling chip rail
            hides half the section behind a swipe nobody is told about. */}
        <div role="tablist" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: 0 }}>
          {tabs.map((t) => {
            // A pill only reads as selected while the section is actually open;
            // folded, neither is lit, so the header never claims to be showing
            // something it isn't.
            const on = open && t.key === current.key
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={on}
                onClick={() => pick(t.key)}
                className="pill"
                style={{
                  position: 'relative',
                  padding: '5px 11px',
                  fontFamily: 'var(--font-display)',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  color: on ? 'var(--ink)' : 'var(--ink-dim)',
                  background: on ? 'var(--grape)' : 'var(--card)',
                  borderColor: t.dot && !on ? 'var(--gold)' : on ? 'var(--gold)' : 'var(--stroke)',
                }}
              >
                {t.label}
                {t.dot && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', top: -3, right: -3, width: 8, height: 8,
                      borderRadius: 999, background: 'var(--gold)',
                      border: '2px solid rgba(20,10,52,0.95)', boxSizing: 'content-box',
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => { juice.select(); setOpen((o) => !o) }}
          aria-expanded={open}
          aria-label={open ? `Hide ${current.label}` : `Show ${current.label}`}
          style={{ background: 'transparent', border: 'none', padding: '4px 0 0', cursor: 'pointer', color: 'var(--gold)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
        >
          ▾
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: 'easeInOut' }} style={{ overflow: 'hidden' }}>
            {/* Keyed on the tab, so switching remounts and replays the fade —
                a swap with no motion at all reads as a render glitch. */}
            <motion.div key={current.key} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
              {/* The section's own summary, under the pills rather than beside
                  them: once the row wraps, a hint trailing the last pill reads
                  as belonging to THAT pill instead of to the open section. */}
              {current.right && (
                <p className="faint" style={{ fontSize: 12, margin: '0 0 8px' }}>{current.right}</p>
              )}
              {current.content}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
