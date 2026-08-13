import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { getPendingBattle, clearPendingBattle } from './pending'

// After someone signs up (or in) from a battle invite, drop them straight back
// into that invitation. Rendered once inside the router; fires as soon as a
// profile exists and we're not already on the battle page.
export function BattleResume() {
  const profile = useAuth((s) => s.profile)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!profile) return
    const pending = getPendingBattle()
    if (pending && location.pathname !== `/battle/${pending}`) {
      clearPendingBattle()
      navigate(`/battle/${pending}`, { replace: true })
    }
  }, [profile, location.pathname, navigate])

  return null
}
