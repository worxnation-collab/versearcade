import { useEffect, useState } from 'react'
import { useJuice } from '@/juice/useJuice'
import { fetchAutoPublish, setAutoPublish, type AutoPublish } from '@/store/churchAdmin'

// "Publish tomorrow's draft if I haven't approved it by 8pm" (0176, the
// owner's call, docs/CHURCH-SHARED-VERSE.md → "Auto-publish"). Default OFF,
// per church, Content Generation only. It is the one exception to "a draft
// waits for a leader", and the card says exactly how narrow it is: drafts
// only, never a ⚠ flagged one, never a day you already approved — and Home
// says every time it published one.

export function useAutoPublish(churchId: string, enabled: boolean) {
  const [state, setState] = useState<AutoPublish | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    fetchAutoPublish(churchId).then((r) => { if (alive && r.ok) setState(r.data) })
    return () => { alive = false }
  }, [churchId, enabled])
  return { state, setState }
}

export function hourLabel(h: number): string {
  if (h === 0) return 'midnight'
  if (h === 12) return 'noon'
  return h < 12 ? `${h}am` : `${h - 12}pm`
}

export function AutoPublishToggle({ churchId, state, setState }: {
  churchId: string
  state: AutoPublish | null
  setState: (s: AutoPublish) => void
}) {
  const juice = useJuice()
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState(false)
  if (!state) return null
  const at = hourLabel(state.hour)

  const flip = async () => {
    const next = !state.enabled
    const prev = state
    setState({ ...state, enabled: next }); setBusy(true); setFail(false)
    const r = await setAutoPublish(churchId, next)
    setBusy(false)
    if (!r.ok) { setState(prev); setFail(true); return }
    setState(r.data)
    juice.select?.()
  }

  return (
    <div className="card" data-auto-publish style={{ display: 'grid', gap: 6, padding: '11px 13px' }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={state.enabled} disabled={busy} onChange={() => void flip()} style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0, padding: 0 }} />
        <span style={{ minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 14 }}>If I haven’t approved it by {at}, publish tomorrow’s draft</b>
          <span className="dim" style={{ display: 'block', fontSize: 12.5, lineHeight: 1.45, marginTop: 2 }}>
            So your members never open an empty church tab. Only a draft already waiting goes live — never one with a ⚠
            flagged question, never over a day you approved. Your church’s clock; Home tells you each time it does.
          </span>
        </span>
      </label>
      {fail && <div role="status" style={{ fontSize: 12.5, color: 'var(--coral)' }}>That didn’t save. Try again in a moment.</div>}
    </div>
  )
}
