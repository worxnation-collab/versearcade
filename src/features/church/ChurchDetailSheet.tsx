import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useChurch } from '@/store/church'
import { useJuice } from '@/juice/useJuice'
import { ChurchPageBody } from './ChurchPageBody'
import { ShareChurch } from './ShareChurch'

// A church's page: what's behind tapping a row on the leaderboard.
//
// Portalled to document.body on purpose. The board lives inside a `.card`, and
// `.card` sets `backdrop-filter`, which makes it a containing block for
// `position: fixed` children — the sheet would be trapped inside the card and
// scroll with it. (Same class of bug as the `perspective` note in BookOpening.)
export function ChurchDetailSheet() {
  const page = useChurch((s) => s.page)
  const loading = useChurch((s) => s.pageLoading)
  const close = useChurch((s) => s.closeChurch)
  const juice = useJuice()

  // Escape closes it, same as tapping the scrim — this is reachable with a
  // keyboard on the web build.
  useEffect(() => {
    if (!page) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, close])

  // The AnimatePresence lives inside the portal rather than around the whole
  // component, so the sheet can still play its slide-out after `page` is gone.
  return createPortal(
    <AnimatePresence>
      {page && (
        <motion.div
          key="church-sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => { juice.select?.(); close() }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.62)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={page.church.name}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            style={{
              width: '100%',
              maxWidth: 520,
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'var(--bg-1)',
              borderTop: '1px solid var(--stroke)',
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: '10px 16px calc(24px + env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ width: 42, height: 4, borderRadius: 999, background: 'var(--stroke)', margin: '0 auto 12px' }} />
            <ChurchPageBody
              page={page}
              loading={loading}
              onClose={close}
              footer={<ShareChurch churchId={page.church.id} churchName={page.church.name} />}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
