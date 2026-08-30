import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { getPendingChurch, clearPendingChurch } from './pending'

// After someone signs up (or in) from a shared church link, drop them straight
// back onto that church — now with the congregation named. Rendered once inside
// the router, beside BattleResume, and fires as soon as a profile exists.
export function ChurchResume() {
  const profile = useAuth((s) => s.profile)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!profile) return
    const pending = getPendingChurch()
    if (pending && location.pathname !== `/church/${pending}`) {
      clearPendingChurch()
      navigate(`/church/${pending}`, { replace: true })
    }
  }, [profile, location.pathname, navigate])

  return null
}
