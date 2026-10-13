import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { useChurch } from '@/store/church'
import { useJuice } from '@/juice/useJuice'
import type { Church } from '@/types'

// "Play for this church" on a church's own page — the join flow's front door
// for anybody who arrived by link, QR or the directory rather than through the
// picker.
//
// It joins BY ID (`join_church`'s `p_church_id`, 0092), which is the only
// honest way to join a church that already exists: re-deriving a place key
// from the row would fork a second church. The rest is the store's own `join`,
// so this and the picker cannot disagree about what joining does.
//
// Switching is allowed and said plainly, never hidden behind a second screen:
// a player plays for ONE church (`profiles.church_id`), and what they gave stays
// given — lifetime giving follows them, the churchyard's own rule.
export function JoinChurchButton({ church, isMember }: { church: Church; isMember: boolean }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const mine = useChurch((s) => s.church)
  const loadMine = useChurch((s) => s.load)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Who you play for now, so a switch can name what it is switching FROM.
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

  const switching = !!mine && mine.id !== church.id

  const join = async () => {
    if (switching && !confirming) {
      setConfirming(true)
      return
    }
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
    juice.celebrate()
    navigate('/church')
  }

  return (
    <div className="card" style={{ marginTop: 4 }}>
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, display: 'block' }}>Play for {church.name}</b>
      <p className="dim" style={{ margin: '6px 0 12px', fontSize: 13, lineHeight: 1.5 }}>
        {confirming && mine
          ? `This moves you from ${mine.name}. Everything you've already given stays given.`
          : 'Your daily verse stays the same game — you just play it with this congregation.'}
      </p>
      <Button variant="gold" full disabled={busy} onClick={join}>
        {busy ? 'Joining…' : confirming ? `Yes, play for ${church.name}` : 'Join this church'}
      </Button>
      {confirming && (
        <button
          className="faint"
          onClick={() => setConfirming(false)}
          style={{ display: 'block', width: '100%', marginTop: 10, fontSize: 12.5, textDecoration: 'underline' }}
        >
          Stay with {mine?.name}
        </button>
      )}
      {err && <p style={{ color: 'var(--coral)', fontSize: 12.5, margin: '8px 0 0' }}>{err}</p>}
    </div>
  )
}
