import type { ReactNode } from 'react'
import { LeaderLookFigure } from './leaderLooks'
import { useChurchLeaderLook } from '@/store/churchLeaderLook'

// The church's leader standing beside something they wrote — the pastor's
// note on the church verse, the live notice on the church tab (0146).
//
// The figure is the same `LeaderLookFigure` the leader chose it in, read
// through `church_leader_look`, so what a member sees is what the leader
// picked. No look, a church that isn't verified, no keys, a server without
// 0146, or still loading ⇒ the words alone, exactly as before: a placeholder
// clergyman beside a church's note would be a stranger speaking for it.
//
// It is a picture, not a byline: no name and no number rides with it, and it
// opens nothing — the player card is for players, and this is a role.
export function LeaderBeside({
  churchId,
  size = 44,
  align = 'flex-start',
  children,
}: {
  churchId: string | null | undefined
  size?: number
  align?: 'flex-start' | 'center' | 'flex-end'
  children: ReactNode
}) {
  const leader = useChurchLeaderLook(churchId)
  if (!leader) return <>{children}</>
  return (
    <div style={{ display: 'flex', alignItems: align, gap: 10, minWidth: 0 }}>
      <div style={{ flexShrink: 0 }} data-leader-look={leader.look}>
        <LeaderLookFigure
          look={leader.look}
          spec={leader.spec}
          customArtUrl={leader.customArtUrl}
          size={size}
          title="Your church's leadership"
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}
