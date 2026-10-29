import { useEffect, useState } from 'react'
import { PushNudge } from '@/components/PushNudge'
import { pushSupported, pushPermissionNow } from '@/lib/push'

// "You'll hear when they play" — once, on the screen a player lands on after
// sending their FIRST friend challenge. That is the moment they are waiting on
// somebody else, which is the one moment a notification is obviously wanted.
//
// Three outcomes, and only one of them asks:
//   · notifications already on → the plain line, because it is now true (0159:
//     the opponent's submit pushes the challenger, once per battle);
//   · permission still undecided → PushNudge's 'battle' ask, inside its own
//     budget (one a week, three ever), so this never adds a fourth;
//   · denied / unsupported → nothing, since the line would be a promise we
//     can't keep.
// The device flag is set only when something was SHOWN, so a budget that is
// spent this week leaves the next challenge free to try again.

const KEY = 'va.firstChallengePush'

function seen(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return true }
}
function markSeen() {
  try { localStorage.setItem(KEY, '1') } catch { /* asked again next time */ }
}

export function FirstChallengePush({ when }: { when: boolean }) {
  const [state, setState] = useState<'none' | 'on' | 'ask'>('none')

  useEffect(() => {
    if (!when || seen() || !pushSupported()) return
    let live = true
    void pushPermissionNow().then((perm) => {
      if (!live) return
      if (perm === 'granted') { markSeen(); setState('on') }
      else if (perm === 'default') setState('ask')
    })
    return () => { live = false }
  }, [when])

  if (state === 'on') {
    return (
      <p className="center" style={{ fontSize: 13, marginTop: 12, color: 'var(--mint)' }}>
        🔔 You’ll hear when they play.
      </p>
    )
  }
  if (state === 'ask') return <PushNudge reason="battle" onShow={markSeen} />
  return null
}
