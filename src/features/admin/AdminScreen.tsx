import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { FULL_SKINS, BUNDLES } from '@/data/avatar'
import GrowthPanel from './GrowthPanel'
import type { AvatarSpec } from '@/types'

// Private operator surface. THREE gates, strongest first:
//   1. Server: every admin_* RPC calls require_admin() — a non-admin gets
//      nothing back, so the real lock is the is_admin flag on the account.
//   2. Route: renders nothing and redirects unless the signed-in profile is
//      admin (so it's invisible to every other account).
//   3. PIN: a 4-digit lock (4208) on top, remembered for the browser session.
const ADMIN_PIN = '4208'
const PIN_KEY = 'va_admin_unlocked'

interface Overview {
  users: number; active_today: number; active_7d: number; new_7d: number; new_today: number
  total_plays: number; battles_total: number; battles_complete: number
  buddies_pairs: number; buddy_requests_pending: number; skins_sold: number
  founders: number; church_open: number; church_total: number
}
interface AdminUser {
  username: string; level: number; xp: number; current_streak: number; longest_streak: number
  last_played_on: string | null; created_at: string; owned_skins: string[]; founder: boolean; is_admin: boolean
}
interface Inquiry {
  id: string; church_name: string; contact_name: string; email: string
  size: string | null; message: string | null; handled: boolean; created_at: string
}
interface ActiveRow {
  rank: number; username: string; avatar_emoji: string; avatar_character?: AvatarSpec | null
  level: number; daily_plays: number; battles: number; practice_days: number
  total_ms: number; last_active: string
}
interface PromoRow { code: string; skin_id: string; active: boolean; redeemed_count: number; created_at: string }

// Active quiz/battle time (not total app time — the app has no session tracking).
function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  return `${h}h ${String(min % 60).padStart(2, '0')}m`
}

export default function AdminScreen() {
  const { ready, profile } = useAuth()
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(PIN_KEY) === '1')

  if (!ready) return <Page noNav><div style={{ display: 'grid', placeItems: 'center', height: '70dvh' }}><div className="floaty" style={{ fontSize: 48 }}>🔒</div></div></Page>
  // Not the admin account → behave as if this route does not exist.
  if (!profile?.isAdmin) return <Navigate to="/play" replace />
  if (!unlocked) return <PinGate onOk={() => { sessionStorage.setItem(PIN_KEY, '1'); setUnlocked(true) }} />
  return <Dashboard />
}

function PinGate({ onOk }: { onOk: () => void }) {
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)
  const submit = () => {
    if (pin === ADMIN_PIN) onOk()
    else { setErr(true); setPin('') }
  }
  return (
    <Page noNav>
      <div className="center" style={{ paddingTop: 60 }}>
        <div style={{ fontSize: 44 }}>🔐</div>
        <h1 style={{ fontSize: 24, marginTop: 8 }}>Enter PIN</h1>
        <input
          value={pin}
          onChange={(e) => { setErr(false); setPin(e.target.value.replace(/\D/g, '').slice(0, 4)) }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          inputMode="numeric"
          autoFocus
          placeholder="••••"
          style={{ marginTop: 18, textAlign: 'center', fontSize: 28, letterSpacing: '0.5em', width: 160 }}
        />
        {err && <p style={{ color: 'var(--coral)', marginTop: 10 }}>Incorrect PIN</p>}
        <div style={{ marginTop: 18, width: 200 }}>
          <Button variant="gold" full disabled={pin.length < 4} onClick={submit}>Unlock</Button>
        </div>
        <button className="pill" style={{ marginTop: 12 }} onClick={() => navigate('/you')}>← Back</button>
      </div>
    </Page>
  )
}

function Dashboard() {
  const navigate = useNavigate()
  const [ov, setOv] = useState<Overview | null>(null)
  const [tab, setTab] = useState<'stats' | 'growth' | 'users' | 'sales' | 'church' | 'codes' | 'push'>('stats')

  useEffect(() => {
    supabase?.rpc('admin_overview').then(({ data }) => setOv(data as Overview))
  }, [])

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button className="pill" onClick={() => navigate('/you')} aria-label="Back">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Admin</b>
        <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>operator only</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {(['stats', 'growth', 'users', 'sales', 'church', 'codes', 'push'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="pill"
            style={{ background: tab === t ? 'var(--grape)' : 'var(--card)', fontWeight: 800, textTransform: 'capitalize' }}>
            {t === 'church' ? 'Churches' : t}
          </button>
        ))}
      </div>

      {tab === 'stats' && <Stats ov={ov} />}
      {tab === 'growth' && <GrowthPanel />}
      {tab === 'users' && <Users />}
      {tab === 'sales' && <Sales />}
      {tab === 'church' && <Churches />}
      {tab === 'codes' && <Codes />}
      {tab === 'push' && <PushBroadcast />}
      <div style={{ height: 40 }} />
    </Page>
  )
}

function Stats({ ov }: { ov: Overview | null }) {
  if (!ov) return <p className="faint center" style={{ padding: 30 }}>Loading…</p>
  const cells: [string, number | string][] = [
    ['Total users', ov.users],
    ['New today', ov.new_today],
    ['New (7d)', ov.new_7d],
    ['Active today', ov.active_today],
    ['Active (7d)', ov.active_7d],
    ['Total plays', ov.total_plays],
    ['Battles', ov.battles_total],
    ['Battles done', ov.battles_complete],
    ['Buddy pairs', ov.buddies_pairs],
    ['Pending reqs', ov.buddy_requests_pending],
    ['Skins owned', ov.skins_sold],
    ['Founders', ov.founders],
    ['Church (open)', ov.church_open],
    ['Church (all)', ov.church_total],
  ]
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {cells.map(([label, val]) => (
          <div key={label} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26 }} className="gradient-text">{Number(val).toLocaleString()}</div>
            <div className="faint" style={{ fontSize: 12 }}>{label}</div>
          </div>
        ))}
      </div>
      <TopActive />
    </>
  )
}

function TopActive() {
  const [rows, setRows] = useState<ActiveRow[] | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open || rows !== null) return
    supabase?.rpc('admin_top_active', { p_limit: 5 }).then(({ data }) => setRows((data as ActiveRow[]) ?? []))
  }, [open, rows])
  return (
    <div style={{ marginTop: 18 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', padding: '0 0 4px', cursor: 'pointer' }}
      >
        <h3 className="dim" style={{ fontSize: 16, margin: 0 }}>🔥 Top 5 most active</h3>
        <span style={{ color: 'var(--gold)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {!open ? null : (
        <>
      <p className="faint" style={{ fontSize: 11, marginBottom: 10 }}>
        Ranked by plays. Time = active quiz/battle time (not total time in app).
      </p>
      {rows === null ? (
        <p className="faint center" style={{ padding: 20 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className="faint center" style={{ padding: 20 }}>No activity yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <div key={r.username} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 22, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink-faint)' }}>
                {r.rank === 1 ? '👑' : r.rank}
              </span>
              <Avatar emoji={r.avatar_emoji} character={r.avatar_character} size={38} ring={false} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>@{r.username}</b>
                <div className="faint" style={{ fontSize: 11.5 }}>
                  {r.daily_plays} daily · {r.battles} battle{r.battles === 1 ? '' : 's'}
                  {r.practice_days > 0 && <> · {r.practice_days} practice</>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }} className="gradient-text">{r.daily_plays + r.battles}</div>
                <div className="faint" style={{ fontSize: 10 }}>plays · {fmtDuration(r.total_ms)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  )
}

function Users() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminUser[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const search = async () => {
    setBusy(true)
    const { data } = await supabase!.rpc('admin_find_users', { p_search: q || null, p_limit: 25 })
    setRows((data as AdminUser[]) ?? [])
    setBusy(false)
  }
  useEffect(() => { search() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const grant = async (username: string, skin: string) => {
    if (!skin) return
    setMsg(null)
    await supabase!.rpc('admin_grant_skin', { p_username: username, p_skin: skin })
    setMsg(`Granted ${skin} to @${username}`)
    search()
  }
  const revoke = async (username: string, skin: string) => {
    await supabase!.rpc('admin_revoke_skin', { p_username: username, p_skin: skin })
    setMsg(`Revoked ${skin} from @${username}`)
    search()
  }
  const toggleFounder = async (u: AdminUser) => {
    await supabase!.rpc('admin_set_founder', { p_username: u.username, p_value: !u.founder })
    setMsg(`${u.founder ? 'Removed' : 'Granted'} founder for @${u.username}`)
    search()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search() }}
          placeholder="Search @username (blank = newest)" autoCapitalize="none" autoCorrect="off" style={{ flex: 1 }} />
        <Button variant="gold" disabled={busy} onClick={search}>Search</Button>
      </div>
      {msg && <p style={{ color: 'var(--good)', fontSize: 13, marginBottom: 10 }}>{msg}</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((u) => (
          <div key={u.username} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ fontWeight: 800 }}>@{u.username}</b>
              {u.founder && <span className="pill" style={{ fontSize: 10, background: 'var(--gold)', color: '#241f0a' }}>founder</span>}
              {u.is_admin && <span className="pill" style={{ fontSize: 10, background: 'var(--grape)' }}>admin</span>}
              <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>Lvl {u.level} · 🔥 {u.current_streak}</span>
            </div>
            <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>
              Skins: {u.owned_skins.length ? u.owned_skins.join(', ') : '—'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
              <select defaultValue="" onChange={(e) => { grant(u.username, e.target.value); e.target.value = '' }}
                style={{ fontSize: 12, padding: '6px 8px', borderRadius: 8, background: 'var(--card-solid)', color: 'var(--ink)', border: '1px solid var(--stroke)' }}>
                <option value="" disabled>+ Grant skin…</option>
                {/* Bundles first — granting the pack sku hands over every skin
                    in it at once (pack_skins, migration 0044), which is the only
                    way to grant a bundle without leaving someone a partial one. */}
                {BUNDLES.map((b) => <option key={b.sku} value={b.sku}>{b.name} (whole pack)</option>)}
                {FULL_SKINS.filter((s) => !s.bundleOnly).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {u.owned_skins.length > 0 && (
                <select defaultValue="" onChange={(e) => { revoke(u.username, e.target.value); e.target.value = '' }}
                  style={{ fontSize: 12, padding: '6px 8px', borderRadius: 8, background: 'var(--card-solid)', color: 'var(--ink)', border: '1px solid var(--stroke)' }}>
                  <option value="" disabled>− Revoke skin…</option>
                  {u.owned_skins.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <button className="pill" onClick={() => toggleFounder(u)} style={{ fontSize: 12, fontWeight: 700 }}>
                {u.founder ? 'Remove founder' : 'Make founder'}
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && !busy && <p className="faint center" style={{ padding: 20 }}>No users found.</p>}
      </div>
    </div>
  )
}

function Churches() {
  const [rows, setRows] = useState<Inquiry[]>([])
  useEffect(() => {
    supabase?.rpc('admin_church_inquiries', { p_limit: 50 }).then(({ data }) => setRows((data as Inquiry[]) ?? []))
  }, [])
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <InfoRequests />
      <div>
        <h3 style={{ fontSize: 14, margin: '0 0 8px' }} className="dim">“For Churches” inquiries</h3>
        {rows.length === 0
          ? <p className="faint center" style={{ padding: 20 }}>No church inquiries yet.</p>
          : <Inquiries rows={rows} />}
      </div>
    </div>
  )
}

// The "Add info" queue from a church's page on the leaderboard (migration
// 0050). Marking one handled is what clears the pending state on the player's
// pill, so do it once the page is filled in — or once it's been decided against.
interface InfoRequest {
  id: string; church_id: string; church_name: string; city: string | null; region: string | null
  role: 'leadership' | 'member'; username: string | null; contact_name: string | null
  email: string | null; note: string; handled: boolean; created_at: string
}
function InfoRequests() {
  const [rows, setRows] = useState<InfoRequest[] | null>(null)
  const load = () =>
    supabase?.rpc('admin_church_info_requests', { p_limit: 50 }).then(({ data }) => setRows((data as InfoRequest[]) ?? []))
  useEffect(() => { void load() }, [])

  const handle = async (r: InfoRequest) => {
    await supabase?.rpc('admin_handle_church_info_request', { p_id: r.id, p_handled: !r.handled })
    void load()
  }

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '0 0 8px' }} className="dim">Church page requests</h3>
      {rows === null && <p className="faint center" style={{ padding: 20 }}>Loading…</p>}
      {rows?.length === 0 && <p className="faint center" style={{ padding: 20 }}>No page requests yet.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {(rows ?? []).map((r) => (
          <div key={r.id} className="card" style={{ opacity: r.handled ? 0.55 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <b style={{ fontWeight: 800 }}>{r.church_name}</b>
              <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="faint" style={{ fontSize: 12 }}>
              {[r.city, r.region].filter(Boolean).join(', ') || 'No location'}
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              <span className="pill" style={{ fontSize: 11, padding: '3px 9px', borderColor: r.role === 'leadership' ? 'var(--gold)' : 'var(--stroke)' }}>
                {r.role === 'leadership' ? 'staff' : 'attender'}
              </span>{' '}
              {r.contact_name || (r.username ? `@${r.username}` : 'anonymous')}
              {r.email && <> · <a href={`mailto:${r.email}`} style={{ color: 'var(--sky)' }}>{r.email}</a></>}
            </div>
            <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{r.note}</p>
            <button className="pill" onClick={() => void handle(r)} style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>
              {r.handled ? 'Reopen' : 'Mark handled'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Inquiries({ rows }: { rows: Inquiry[] }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((i) => (
        <div key={i.id} className="card">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <b style={{ fontWeight: 800 }}>{i.church_name}</b>
            <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>{new Date(i.created_at).toLocaleDateString()}</span>
          </div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{i.contact_name} · <a href={`mailto:${i.email}`} style={{ color: 'var(--sky)' }}>{i.email}</a></div>
          {i.size && <div className="faint" style={{ fontSize: 12 }}>Size: {i.size}</div>}
          {i.message && <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{i.message}</p>}
        </div>
      ))}
    </div>
  )
}

interface SaleRow {
  skin: string; username: string | null; email: string | null
  granted: boolean; reason: string | null; created_at: string
}
function Sales() {
  const [rows, setRows] = useState<SaleRow[] | null>(null)
  useEffect(() => {
    supabase?.rpc('admin_recent_purchases', { p_limit: 50 }).then(({ data }) => setRows((data as SaleRow[]) ?? []))
  }, [])
  if (rows === null) return <p className="faint center" style={{ padding: 30 }}>Loading…</p>
  if (rows.length === 0) return <p className="faint center" style={{ padding: 30 }}>No purchases yet.</p>
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((r, i) => (
        <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontWeight: 800, textTransform: 'capitalize' }}>{r.skin}</b>
            <div className="faint" style={{ fontSize: 12 }}>
              {r.username ? `@${r.username}` : r.email || '—'} · {new Date(r.created_at).toLocaleString()}
              {r.reason === 'manual' && ' · manual'}
            </div>
          </div>
          <span className="pill" style={{ fontSize: 11, fontWeight: 800,
            background: r.granted ? 'var(--good)' : 'var(--coral)', color: '#101018' }}>
            {r.granted ? '✓ granted' : r.reason ?? 'pending'}
          </span>
        </div>
      ))}
    </div>
  )
}

function Codes() {
  const [rows, setRows] = useState<PromoRow[] | null>(null)
  const [code, setCode] = useState('')
  const [skin, setSkin] = useState('shades')
  const [msg, setMsg] = useState<string | null>(null)

  const load = () => supabase?.rpc('admin_list_promo_codes').then(({ data }) => setRows((data as PromoRow[]) ?? []))
  useEffect(() => { load() }, [])

  const upsert = async (c: string, s: string, active: boolean) => {
    const { data } = await supabase!.rpc('admin_upsert_promo_code', { p_code: c, p_skin: s, p_active: active })
    if (!(data as { ok?: boolean })?.ok) { setMsg('Code must be 3+ characters.'); return }
    setMsg(`Saved ${c.toUpperCase()}`)
    setCode('')
    load()
  }
  // A code can tie to a single paid skin or to a whole bundle sku — never to one
  // piece of a bundle, which would hand out a partial pack.
  const paidSkins = FULL_SKINS.filter((s) => s.source === 'paid' && !s.bundleOnly)

  return (
    <div>
      <p className="faint" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.4 }}>
        Pin a code in your live. Viewers redeem it in Skins to unlock the tied skin. Toggle a code off after the live to make it truly exclusive.
      </p>
      <div className="card" style={{ marginBottom: 12, display: 'grid', gap: 8 }}>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16))}
          placeholder="NEW CODE (e.g. DAYONE)" autoCapitalize="characters" autoCorrect="off" />
        <select value={skin} onChange={(e) => setSkin(e.target.value)}
          style={{ padding: '10px 8px', borderRadius: 10, background: 'var(--card-solid)', color: 'var(--ink)', border: '1px solid var(--stroke)' }}>
          {BUNDLES.map((b) => <option key={b.sku} value={b.sku}>{b.name} — whole pack ({b.sku})</option>)}
          {paidSkins.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
        </select>
        <Button variant="gold" disabled={code.trim().length < 3} onClick={() => upsert(code, skin, true)}>Create / update code</Button>
        {msg && <p style={{ color: 'var(--good)', fontSize: 13 }}>{msg}</p>}
      </div>

      {rows === null ? (
        <p className="faint center" style={{ padding: 20 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className="faint center" style={{ padding: 20 }}>No codes yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <div key={r.code} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}>{r.code}</b>
                <div className="faint" style={{ fontSize: 11 }}>→ {r.skin_id} · {r.redeemed_count} redeemed</div>
              </div>
              <button className="pill" onClick={() => upsert(r.code, r.skin_id, !r.active)}
                style={{ fontWeight: 800, fontSize: 12, background: r.active ? 'var(--good)' : 'var(--card-solid)', color: r.active ? '#0a2417' : 'var(--ink-faint)' }}>
                {r.active ? 'Active' : 'Off'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Send a Web Push notification to everyone who's opted in. Calls the push-send
// Edge Function, which does the VAPID + encryption work and prunes dead subs.
const PUSH_PRESETS = [
  { label: '📖 New verse', title: 'Today’s verse is live', body: 'A fresh verse just dropped — play it and keep your streak going.' },
  { label: '🔥 Streak nudge', title: 'Don’t break your streak', body: 'Your streak is waiting — a couple minutes keeps it alive.' },
  { label: '⚔️ Battle call', title: 'Who can you beat today?', body: 'Challenge a buddy to today’s verse and settle it head to head.' },
]

function PushBroadcast() {
  const [title, setTitle] = useState('Verse Arcade')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('/')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const send = async () => {
    if (!body.trim() || busy) return
    setBusy(true); setMsg(null); setErr(null)
    try {
      const { data, error } = await supabase!.functions.invoke('push-send', {
        body: { title: title.trim() || 'Verse Arcade', body: body.trim(), url: url.trim() || '/' },
      })
      if (error) throw error
      const r = data as { sent: number; failed: number; removed: number; total: number; error?: string }
      if (r?.error) { setErr(r.error); return }
      setMsg(`Sent to ${r.sent}/${r.total} devices${r.failed ? ` · ${r.failed} failed` : ''}${r.removed ? ` · ${r.removed} stale removed` : ''}.`)
    } catch (e) {
      const m = (e as { message?: string })?.message || String(e)
      setErr(/non-2xx|500/i.test(m) ? 'Send failed — is VAPID_PRIVATE_KEY set in Supabase?' : m)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="faint" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.4 }}>
        Push a notification to everyone who turned reminders on (Profile → ⚙️ → Notifications). Needs the <code>VAPID_PRIVATE_KEY</code> secret set in Supabase.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {PUSH_PRESETS.map((p) => (
          <button key={p.label} className="pill" style={{ fontSize: 12, fontWeight: 800 }}
            onClick={() => { setTitle(p.title); setBody(p.body) }}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <label className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="Verse Arcade" />
        <label className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Message</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 240))} rows={3}
          placeholder="What do you want to say?"
          style={{ padding: '10px 8px', borderRadius: 10, background: 'var(--card-solid)', color: 'var(--ink)', border: '1px solid var(--stroke)', resize: 'vertical', font: 'inherit' }} />
        <div className="faint" style={{ fontSize: 11, textAlign: 'right' }}>{body.length}/240</div>
        <label className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Opens (path)</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/" />
        <Button variant="gold" disabled={body.trim().length === 0 || busy} onClick={send}>
          {busy ? 'Sending…' : '🔔 Send to everyone'}
        </Button>
        {msg && <p style={{ color: 'var(--good)', fontSize: 13 }}>{msg}</p>}
        {err && <p style={{ color: 'var(--coral)', fontSize: 13 }}>{err}</p>}
      </div>
    </div>
  )
}
