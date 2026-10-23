import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { getPendingChurch, clearPendingChurch } from './pending'
import { clearPendingClaim, getPendingClaim } from '@/store/churchClaim'

// After someone signs up (or in) from a shared church link, drop them straight
// back onto that church — now with the congregation named. Rendered once inside
// the router, beside BattleResume, and fires once a REAL ACCOUNT exists.
//
// `mode === 'online'` and not merely "a profile exists", and that line was
// earned (2026-10-21): a GUEST has a profile too — the local one — so a guest
// who tapped "Join" on a church page was sent to /auth, this effect saw a
// profile on a path that wasn't the church, cleared the pending church and sent
// them straight back. Sign-up was unreachable from the page for exactly the
// visitors most likely to have arrived from a pastor's link. Found by driving
// it as a guest; signed-out-with-no-guest worked, which is why it survived.
export function ChurchResume() {
  const profile = useAuth((s) => s.profile)
  const online = useAuth((s) => s.mode === 'online')
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!profile || !online) return
    // A leadership invite wins over a plain church page: it is the one thing
    // the visitor came to do. Redirected ONCE, with the code back in the
    // fragment, and cleared — the same one-shot rule the church resume below
    // follows, or anybody who wandered off before tapping would be dragged
    // back to the claim screen on every navigation.
    const claim = getPendingClaim()
    if (claim) {
      clearPendingClaim()
      // An empty code is a self-serve claim (0134): the screen, no fragment.
      if (location.pathname !== `/church/${claim.churchId}/claim`) {
        navigate(`/church/${claim.churchId}/claim${claim.code ? `#${claim.code}` : ''}`, { replace: true })
      }
      return
    }
    const pending = getPendingChurch()
    if (pending && location.pathname !== `/church/${pending}`) {
      clearPendingChurch()
      navigate(`/church/${pending}`, { replace: true })
    }
  }, [profile, online, location.pathname, navigate])

  return null
}
