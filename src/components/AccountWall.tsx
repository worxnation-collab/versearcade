import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { isSupabaseConfigured } from '@/lib/config'

// The account wall — the one place the app says "this part needs an account".
//
// WHY THIS EXISTS AT ALL, because it reverses a rule written down elsewhere:
// CLAUDE.md's two-mode invariant says every feature works LOCAL and ONLINE, and
// it still does — a guest device can technically run Study, the Bible and the
// keep, and that code is untouched. What changed is the PRODUCT decision above
// it: a guest gets today's verse and their own profile, and everything else
// asks for a free account first. The engineering invariant is about a feature
// being whole in both modes; this is about which modes we hand the player.
//
// Two consequences worth keeping straight:
//   - The gate is at the ROUTE, not inside the screens (App.tsx's
//     RequireAccount). Screens that already had their own guest branch keep it,
//     so lifting the route gate restores the old behaviour in one edit.
//   - It only bites when an account is actually obtainable. In a keyless LOCAL
//     build (`npm run dev` with no .env.local) there is no backend to sign up
//     to, so walling the app would leave a developer with five locked tabs and
//     no way through. `isSupabaseConfigured` is the whole condition.

/** True when this player is a guest AND a real account is available to them. */
export function useAccountLocked(): boolean {
  const mode = useAuth((s) => s.mode)
  return isSupabaseConfigured && mode === 'local'
}

export interface WallCopy {
  icon: string
  title: string
  line: string
}

/**
 * The wall as a card, for a screen that wants to keep its own header above it.
 * `AccountWall` below is the whole-screen version the route guard uses.
 */
export function AccountWallCard({ icon, title, line }: WallCopy) {
  const navigate = useNavigate()
  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ textAlign: 'center' }}
    >
      <div className="floaty" style={{ fontSize: 42 }}>{icon}</div>
      <h2 style={{ fontSize: 22, margin: '10px 0 0' }}>{title}</h2>
      <p className="dim" style={{ margin: '8px 0 16px', fontSize: 14.5, lineHeight: 1.55 }}>{line}</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <Button variant="gold" full onClick={() => navigate('/auth?mode=signup')}>
          Create a free account →
        </Button>
        <Button variant="ghost" full onClick={() => navigate('/auth')}>
          I already have an account
        </Button>
      </div>
      {/* Said plainly, because the fear is losing what you've already done. */}
      <p className="faint" style={{ fontSize: 11.5, margin: '12px 0 0', lineHeight: 1.45 }}>
        Your streak, XP and character come with you — nothing you’ve played is lost.
      </p>
    </motion.div>
  )
}

/** The whole-screen wall. Used by RequireAccount, inside the tab shell. */
export function AccountWall(copy: WallCopy) {
  return (
    <Page>
      <div style={{ paddingTop: 24 }}>
        <AccountWallCard {...copy} />
      </div>
      <div style={{ height: 90 }} />
    </Page>
  )
}
