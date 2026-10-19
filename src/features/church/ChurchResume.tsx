import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { getPendingChurch, clearPendingChurch } from './pending'
import { clearPendingClaim, getPendingClaim } from '@/store/churchClaim'

// After someone signs up (or in) from a shared church link, drop them straight
// back onto that church — now with the congregation named. Rendered once inside
// the router, beside BattleResume, and fires as soon as a profile exists.
export function ChurchResume() {
  const profile = useAuth((s) => s.profile)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!profile) return
    // A leadership invite wins over a plain church page: it is the one thing
    // the visitor came to do. Redirected ONCE, with the code back in the
    // fragment, and cleared — the same one-shot rule the church resume below
    // follows, or anybody who wandered off before tapping would be dragged
    // back to the claim screen on every navigation.
    const claim = getPendingClaim()
    if (claim) {
      clearPendingClaim()
      if (location.pathname !== `/church/${claim.churchId}/claim`) {
        navigate(`/church/${claim.churchId}/claim#${claim.code}`, { replace: true })
      }
      return
    }
    const pending = getPendingChurch()
    if (pending && location.pathname !== `/church/${pending}`) {
      clearPendingChurch()
      navigate(`/church/${pending}`, { replace: true })
    }
  }, [profile, location.pathname, navigate])

  return null
}
