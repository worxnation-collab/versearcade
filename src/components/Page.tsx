import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { useSettings } from '@/store/settings'

// Consistent springy page transition + safe-area-aware app shell. The motion
// is a transform and an opacity only — nothing that changes layout — so a page
// arriving never shifts its own content at any width. Under reduce-motion it
// is a short fade with no travel.
export function Page({ children, noNav, className }: { children: ReactNode; noNav?: boolean; className?: string }) {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  return (
    <motion.main
      className={`app-shell${noNav ? ' no-nav' : ''}${className ? ` ${className}` : ''}`}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduceMotion ? 0 : -10 }}
      transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 320, damping: 30 }}
    >
      {children}
    </motion.main>
  )
}
