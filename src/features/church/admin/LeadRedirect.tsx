import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { useChurch } from '@/store/church'

// /church/lead — "my church's leadership", for the map's Leadership row (0128).
// The map's rows are static routes (scripts/check-map.mjs asserts them), and a
// leader's dashboard lives at /church/:id/admin, so this resolves YOUR church
// and forwards. The admin screen re-checks leadership server-side; this is a
// door, not a lock.
export default function LeadRedirect() {
  const church = useChurch((s) => s.church)
  const loaded = useChurch((s) => s.loaded)
  const load = useChurch((s) => s.load)
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  if (!loaded) return <Page><div className="skeleton" style={{ height: 220, borderRadius: 18 }} /></Page>
  return <Navigate to={church ? `/church/${church.id}/admin` : '/church'} replace />
}
