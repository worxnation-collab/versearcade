import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

// Consistent springy page transition + safe-area-aware app shell.
export function Page({ children, noNav, className }: { children: ReactNode; noNav?: boolean; className?: string }) {
  return (
    <motion.main
      className={`app-shell${noNav ? ' no-nav' : ''}${className ? ` ${className}` : ''}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
    >
      {children}
    </motion.main>
  )
}
