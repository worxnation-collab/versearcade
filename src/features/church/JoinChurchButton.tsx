import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { useChurch } from '@/store/church'
import { useJuice } from '@/juice/useJuice'
import type { Church } from '@/types'

// "Play for this church" on a church's own page — the join flow's front door
// for anybody who arrived by link, QR or the directory rather than through the
// picker, so nobody who was HANDED this church has to find it again in a
// radius search.
//
// It joins BY ID (`join_church`'s `p_church_id`, 0092), which is the only
// honest way to join a church that already exists: re-deriving a place key
// from the row would fork a second church. The rest is the store's own `join`,
// so this and the picker cannot disagree about what joining does.
//
// It never MOVES anybody. A player who already plays for a church is told which
// one and sent to it; switching stays the existing leave-then-join flow on the
// church tab, where the move is the subject of the screen rather than a side
// effect of opening somebody else's link. And nothing is drawn until the
// player's own church has loaded: a join button that flashes up for a frame in
// front of somebody who already has a church is a button that moves them.
//
// Joining only ever happens on the tap. Arriving here from sign-up (OAuth
// included, via `ChurchResume`) pre-selects the church and does nothing else.
export function JoinChurchButton({ church, isMember }: { church: Church; isMember: boolean }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const mine = useChurch((s) => s.church)
  const loaded = useChurch((s) => s.loaded)
  const loadError = useChurch((s) => s.error)
  const loadMine = useChurch((s) => s.load)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void loadMine()
  }, [loadMine])

  if (isMember || mine?.id === church.id) {
    return (
      <div className="card center" style={{ marginTop: 4 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>You play for {church.name}</b>
        <div style={{ marginTop: 10 }}>
          <Button variant="secondary" full onClick={() => navigate('/church')}>Go to your church</Button>
        </div>
      </div>
    )
  }

  if (!loaded) return <div className="skeleton" style={{ height: 120, borderRadius: 18, marginTop: 4 }} />

  // Couldn't tell whether they already have a church — so don't offer a join
  // that might move them. Same fail-closed rule as the loading state above.
  if (!mine && loadError) {
    return (
      <div className="card center" style={{ marginTop: 4 }}>
        <p className="dim" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5 }}>
          We couldn&rsquo;t check which church you play for just now.
        </p>
        <Button variant="secondary" full onClick={() => void loadMine()}>Try again</Button>
      </div>
    )
  }

  if (mine) {
    return (
      <div className="card center" style={{ marginTop: 4 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 15, display: 'block' }}>You play for {mine.name}</b>
        <p className="dim" style={{ margin: '6px 0 12px', fontSize: 13, lineHeight: 1.5 }}>
          A player plays for one church at a time. To play for {church.name} instead, leave yours from
          your church tab first.
        </p>
        <Button variant="secondary" full onClick={() => navigate('/church')}>Go to {mine.name}</Button>
      </div>
    )
  }

  const join = async () => {
    setBusy(true)
    setErr(null)
    const joined = await useChurch.getState().join({
      churchId: church.id,
      placeKey: '',
      name: church.name,
      lat: church.lat,
      lng: church.lng,
      address: church.address ?? null,
      city: church.city ?? null,
      region: church.region ?? null,
      miles: 0,
    })
    setBusy(false)
    if (!joined) {
      setErr("That didn't go through — check your connection and try again.")
      return
    }
    // A quiet tick, not the quiz's confetti — joining a church is a choice,
    // not a high score.
    juice.select()
    navigate('/church')
  }

  return (
    <div className="card" style={{ marginTop: 4 }}>
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, display: 'block' }}>Play for {church.name}</b>
      <p className="dim" style={{ margin: '6px 0 12px', fontSize: 13, lineHeight: 1.5 }}>
        Your daily verse stays the same game — you just play it with this congregation, and the points
        you give build its church.
      </p>
      <Button variant="gold" full disabled={busy} onClick={join}>
        {busy ? 'Joining…' : `Play for ${church.name}`}
      </Button>
      {err && <p style={{ color: 'var(--coral)', fontSize: 12.5, margin: '8px 0 0' }}>{err}</p>}
    </div>
  )
}
