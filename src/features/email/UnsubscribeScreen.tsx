import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { supabase } from '@/lib/supabase'

// The link at the foot of every email (0169). PUBLIC on purpose: a link in an
// inbox carries no session, so the token in the URL is the only key, and the
// one thing it can do is switch that kind of email OFF. It never says whose
// token it was or whether it matched — the server answers the same either way.
// Turning it back on is the Settings switch, signed in.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function UnsubscribeScreen() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const token = params.get('t') ?? ''
  const [state, setState] = useState<'working' | 'done' | 'bad'>('working')

  useEffect(() => {
    if (!supabase || !UUID.test(token)) { setState('bad'); return }
    void supabase.rpc('email_unsubscribe', { p_token: token, p_kind: 'comeback' })
      .then(({ data, error }) => setState(!error && (data as { ok?: boolean } | null)?.ok ? 'done' : 'bad'))
  }, [token])

  return (
    <Page>
      <div className="card" style={{ marginTop: 40, textAlign: 'center', padding: 24 }}>
        {state === 'working' && <p className="dim">One moment…</p>}
        {state === 'done' && (
          <>
            <h2 style={{ margin: '0 0 8px' }}>You won’t get these emails</h2>
            <p className="dim" style={{ margin: '0 0 18px', lineHeight: 1.45 }}>
              No more “Today’s verse” emails. You can turn them back on any time in Settings.
            </p>
          </>
        )}
        {state === 'bad' && (
          <>
            <h2 style={{ margin: '0 0 8px' }}>That link didn’t work</h2>
            <p className="dim" style={{ margin: '0 0 18px', lineHeight: 1.45 }}>
              You can switch these emails off in Settings once you’re signed in.
            </p>
          </>
        )}
        {state !== 'working' && <Button onClick={() => nav('/play')}>Open today’s verse</Button>}
      </div>
    </Page>
  )
}
