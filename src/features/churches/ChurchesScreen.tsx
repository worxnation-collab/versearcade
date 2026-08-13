import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { supabase } from '@/lib/supabase'
import { useJuice } from '@/juice/useJuice'

// For Churches — the congregation/partnership funnel that replaces the old
// user-facing Groups tab. Churches inquire here; the co-op group engine lives on
// behind the scenes as the future church-cohort backend.
export default function ChurchesScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const [church, setChurch] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [size, setSize] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const valid = church.trim().length >= 2 && name.trim().length >= 2 && email.includes('@') && email.trim().length >= 5

  const submit = async () => {
    if (!valid || !supabase) return
    setBusy(true)
    setErr(null)
    juice.coin()
    const { data, error } = await supabase.rpc('submit_church_inquiry', {
      p_church: church, p_name: name, p_email: email, p_size: size || null, p_message: message || null,
    })
    setBusy(false)
    if (error || !(data as { ok?: boolean })?.ok) {
      setErr('Something went wrong — please try again.')
      return
    }
    juice.celebrate()
    setSent(true)
  }

  if (sent) {
    return (
      <Page>
        <div className="center" style={{ paddingTop: 40 }}>
          <div className="floaty" style={{ fontSize: 56 }}>⛪</div>
          <h1 style={{ fontSize: 28, marginTop: 8 }}>Thank you!</h1>
          <p className="dim" style={{ marginTop: 8, maxWidth: 320 }}>
            We got your inquiry and will reach out to <b>{email}</b> to walk through how Verse Arcade can work for your congregation.
          </p>
          <div style={{ marginTop: 20 }}>
            <Button variant="gold" full onClick={() => navigate('/play')}>Back to the app</Button>
          </div>
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <div className="center" style={{ marginBottom: 16 }}>
        <div className="floaty" style={{ fontSize: 44 }}>⛪</div>
        <h1 style={{ fontSize: 28, marginTop: 4 }}>Verse Arcade for Churches</h1>
        <p className="dim" style={{ marginTop: 4 }}>Bring your whole congregation into the Word — together.</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>What a church cohort can do</b>
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
          <li>A private group for your congregation — everyone on the same daily verse.</li>
          <li>A group climb: members pool points toward a shared weekly goal.</li>
          <li>Friendly Bible Battles between members and small groups.</li>
          <li>Youth-group friendly — safe, encouragement-first, no shame for a missed day.</li>
        </ul>
        <p className="faint" style={{ fontSize: 12, marginTop: 10 }}>
          Tell us a little about your church and we’ll set you up and go over how it works.
        </p>
      </div>

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <label style={labelStyle}>Church / ministry name
          <input value={church} onChange={(e) => setChurch(e.target.value)} placeholder="Grace Community Church" maxLength={80} />
        </label>
        <label style={labelStyle}>Your name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pastor Jane Smith" maxLength={80} />
        </label>
        <label style={labelStyle}>Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@church.org" type="email" autoCapitalize="none" autoCorrect="off" maxLength={120} />
        </label>
        <label style={labelStyle}>Congregation size (optional)
          <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 150" maxLength={40} />
        </label>
        <label style={labelStyle}>Anything else? (optional)
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What you’re hoping to do…" rows={3} maxLength={500} style={{ resize: 'vertical' }} />
        </label>
        {err && <p style={{ color: 'var(--coral)', fontSize: 13 }}>{err}</p>}
        <Button variant="gold" full disabled={!valid || busy} onClick={submit}>
          {busy ? 'Sending…' : 'Send inquiry'}
        </Button>
      </div>
      <div style={{ height: 40 }} />
    </Page>
  )
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)' }
