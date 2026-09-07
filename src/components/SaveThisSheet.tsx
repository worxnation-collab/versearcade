import { useNavigate } from 'react-router-dom'
import { QuickSheet } from './QuickSheet'
import { Button } from './Button'
import { useSaveNudge } from '@/store/saveNudge'
import { useJuice } from '@/juice/useJuice'

// The "save this" ask — mounted once in App, shown at most once per device.
// See the header in store/saveNudge.ts for why it exists and what keeps it
// from being a nag. Every sign-up door in this app goes to `/auth?mode=signup`.
export function SaveThisSheet() {
  const navigate = useNavigate()
  const juice = useJuice()
  const pending = useSaveNudge((s) => s.pending)
  const dismiss = useSaveNudge((s) => s.dismiss)
  if (!pending) return null

  return (
    <QuickSheet title="💾 Save this?" onClose={dismiss}>
      <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>
        {pending.thing} is on this phone only.
      </p>
      <p className="dim" style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5 }}>
        {pending.line} A free account keeps it — with your streak, your character and
        everything you earn — on every device, and opens the rest of the app.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        <Button variant="gold" full onClick={() => { juice.coin(); dismiss(); navigate('/auth?mode=signup') }}>
          Create a free account →
        </Button>
        <Button variant="ghost" full onClick={() => { juice.select(); dismiss() }}>
          Not now
        </Button>
      </div>
      <p className="faint center" style={{ margin: '10px 0 0', fontSize: 11.5, lineHeight: 1.5 }}>
        You can keep playing as a guest either way. We won’t ask again.
      </p>
    </QuickSheet>
  )
}
