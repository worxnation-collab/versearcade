import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// The growth tab. Answers "is this thing growing and where is it leaking",
// which admin_overview()'s totals can't.
//
// Nothing here is computed client-side. admin_growth() (0051) returns a cached
// snapshot that pg_cron rebuilds every 12 hours, and refreshes itself lazily if
// it's ever staler than that — so this panel is a renderer, not a calculator.
// "Refresh now" forces a rebuild for when you want numbers this second.

export interface GrowthMetrics {
  window: { first_signup: string | null; first_play: string | null; today: string; partial_day: string }
  headline: {
    accounts: number; players: number; zero_play_accts: number; guests: number; plays: number
    active_7d: number; active_28d: number; new_7d: number; new_prev_7d: number
  }
  daily: { day: string; new_accounts: number; players: number; guests: number }[]
  weekly: { week: string; actives: number; prior_actives: number; retained: number; partial: boolean }[]
  depth: { d1: number; d2: number; d3_6: number; d7_13: number; d14p: number; max: number }
  guests: { total: number; one_day: number; returned: number; three_plus: number; max_days: number; warm_now: number }
  features: { key: string; label: string; users: number; pct: number }[]
  viral: {
    referred_accounts: number; buddy_accepted: number; buddy_pending: number; buddy_total: number
    battles_real: number; battles_real_done: number; battles_broadcast: number; push_subscriptions: number
  }
  quality: {
    avg_pct_correct: number | null; avg_secs: number | null
    streak_3plus: number; streak_7plus: number; streak_max: number; top10_share: number
  }
  money: { stripe_granted: number; apple_purchases: number; accounts_w_skins: number }
  health: { onboarded_gap: number; rls_disabled: string[] }
}
interface GrowthResponse {
  metrics: GrowthMetrics
  computed_at: string
  compute_ms: number | null
  stale: boolean
  next_refresh_due: string
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)

export default function GrowthPanel() {
  const [res, setRes] = useState<GrowthResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async (force: boolean) => {
    setBusy(true); setErr(null)
    const { data, error } = await supabase!.rpc('admin_growth', { p_force: force })
    if (error) setErr(error.message)
    else setRes(data as GrowthResponse)
    setBusy(false)
  }, [])

  useEffect(() => { load(false) }, [load])

  if (err) return <p className="center" style={{ padding: 30, color: 'var(--coral)' }}>{err}</p>
  if (!res) return <p className="faint center" style={{ padding: 30 }}>Loading…</p>
  const m = res.metrics

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Freshness res={res} busy={busy} onRefresh={() => load(true)} />
      <Headline m={m} />
      <ActivityChart daily={m.daily} today={m.window.partial_day} />
      <Retention weekly={m.weekly} />
      <Depth depth={m.depth} players={m.headline.players} />
      <GuestFunnel g={m.guests} />
      <Features features={m.features} players={m.headline.players} />
      <ViralLoops v={m.viral} accounts={m.headline.accounts} />
      <Quality q={m.quality} money={m.money} />
      <Health h={m.health} />
    </div>
  )
}

// ————————————————————————————————— pieces —————————————————————————————————

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="dim" style={{ fontSize: 15, margin: '0 0 2px' }}>{title}</h3>
      {hint && <p className="faint" style={{ fontSize: 11, margin: '0 0 8px', lineHeight: 1.4 }}>{hint}</p>}
      {!hint && <div style={{ height: 8 }} />}
      {children}
    </div>
  )
}

function Freshness({ res, busy, onRefresh }: { res: GrowthResponse; busy: boolean; onRefresh: () => void }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>
          Updated {ago(res.computed_at)}
          {res.compute_ms != null && <span className="faint" style={{ fontWeight: 400 }}> · {res.compute_ms}ms</span>}
        </div>
        <div className="faint" style={{ fontSize: 11 }}>
          Rebuilds every 12h · next {new Date(res.next_refresh_due).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>
      <button className="pill" onClick={onRefresh} disabled={busy}
        style={{ fontSize: 11, fontWeight: 800, background: 'var(--card-solid)', opacity: busy ? 0.5 : 1 }}>
        {busy ? '…' : '↻ Refresh'}
      </button>
    </div>
  )
}

function Cells({ cells }: { cells: [string, string | number, string?][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {cells.map(([label, val, color]) => (
        <div key={label} className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: color ?? 'var(--ink)' }}>
            {typeof val === 'number' ? val.toLocaleString() : val}
          </div>
          <div className="faint" style={{ fontSize: 12 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

function Headline({ m }: { m: GrowthMetrics }) {
  const h = m.headline
  // Signups this week vs last. The sign is the whole point of the tab.
  const delta = h.new_prev_7d > 0 ? Math.round(((h.new_7d - h.new_prev_7d) / h.new_prev_7d) * 100) : null
  const deltaColor = delta === null ? 'var(--ink)' : delta > 0 ? 'var(--good)' : delta < 0 ? 'var(--coral)' : 'var(--ink)'
  return (
    <Section title="📈 Where it stands">
      <Cells cells={[
        ['Accounts', h.accounts],
        ['New this week', delta === null ? h.new_7d : `${h.new_7d} (${delta > 0 ? '+' : ''}${delta}%)`, deltaColor],
        ['Active (7d)', h.active_7d, 'var(--gold)'],
        ['Active (28d)', h.active_28d],
        ['Guests', h.guests, 'var(--mint)'],
        ['Never played', h.zero_play_accts, h.zero_play_accts > 0 ? 'var(--coral)' : undefined],
      ]} />
    </Section>
  )
}

// 30-day dual line. Gold = signed-in players, mint = guests. That pair is the
// one checked for deutan separation (see CLAUDE.md); both are also named in
// text below, so nothing rides on colour alone.
function ActivityChart({ daily, today }: { daily: GrowthMetrics['daily']; today: string }) {
  if (daily.length < 2) return null
  const W = 320, H = 88, PAD = 4
  const max = Math.max(1, ...daily.map((d) => Math.max(d.players, d.guests)))
  const x = (i: number) => PAD + ((W - PAD * 2) * i) / (daily.length - 1)
  const y = (v: number) => PAD + (H - PAD * 2) * (1 - v / max)
  const path = (key: 'players' | 'guests') =>
    daily.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(' ')

  const last = daily[daily.length - 1]
  const isPartial = last.day === today

  return (
    <Section title="🕹️ Last 30 days" hint={`Gold = signed-in players · mint = guests. Peak ${max}/day.`}>
      <div className="card" style={{ padding: '10px 8px 6px' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }}
          role="img" aria-label={`Daily activity over 30 days. Signed-in players and guests, peak ${max} per day.`}>
          <path d={path('guests')} fill="none" stroke="var(--mint)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <path d={path('players')} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(daily.length - 1)} cy={y(last.players)} r="3" fill="var(--gold)" />
          <circle cx={x(daily.length - 1)} cy={y(last.guests)} r="3" fill="var(--mint)" />
        </svg>
        <div className="faint" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginTop: 2 }}>
          <span>{new Date(daily[0].day + 'T00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
          <span>
            today {last.players} / {last.guests}
            {isPartial && <span style={{ color: 'var(--ink-faint)' }}> · partial</span>}
          </span>
        </div>
      </div>
    </Section>
  )
}

// Week over week. retained / prior_actives — of the people active last week,
// how many came back. The current week is still filling, so it's marked.
function Retention({ weekly }: { weekly: GrowthMetrics['weekly'] }) {
  const rows = weekly.filter((w) => w.prior_actives > 0).slice(-4)
  if (rows.length === 0) return <Section title="🔁 Retention"><p className="faint" style={{ fontSize: 12 }}>Not enough history yet — needs two weeks of play.</p></Section>
  return (
    <Section title="🔁 Weekly retention" hint="Of the players active in a week, how many came back the next week.">
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((w) => {
          const rate = pct(w.retained, w.prior_actives)
          const color = rate >= 40 ? 'var(--good)' : rate >= 20 ? 'var(--gold)' : 'var(--coral)'
          return (
            <div key={w.week} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 13 }}>
                  {new Date(w.week + 'T00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  {w.partial && <span className="faint" style={{ fontWeight: 400, fontSize: 11 }}> · in progress</span>}
                </b>
                <div className="faint" style={{ fontSize: 11 }}>
                  {w.actives} active · {w.retained} of {w.prior_actives} returned
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color }}>{rate}%</div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function Bars({ rows, total, tint }: { rows: [string, number][]; total: number; tint: string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]))
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {rows.map(([label, n]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="faint" style={{ fontSize: 11.5, width: 108, flex: 'none' }}>{label}</span>
          <div style={{ flex: 1, height: 14, background: 'var(--card)', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{ width: `${(n / max) * 100}%`, height: '100%', background: tint, borderRadius: 7, minWidth: n > 0 ? 4 : 0 }} />
          </div>
          <span style={{ fontSize: 11.5, width: 62, textAlign: 'right', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
            {n} <span className="faint">· {pct(n, total)}%</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function Depth({ depth, players }: { depth: GrowthMetrics['depth']; players: number }) {
  return (
    <Section title="🎯 How many days each player shows up"
      hint={`${players} accounts have played. Longest run: ${depth.max} days.`}>
      <Bars tint="var(--grape)" total={players} rows={[
        ['1 day only', depth.d1], ['2 days', depth.d2], ['3–6 days', depth.d3_6],
        ['7–13 days', depth.d7_13], ['14+ days', depth.d14p],
      ]} />
    </Section>
  )
}

function GuestFunnel({ g }: { g: GrowthMetrics['guests'] }) {
  return (
    <Section title="👻 Guests" hint="Played without an account. A guest who came back is the warmest signup prospect there is.">
      <Cells cells={[
        ['Guests, all time', g.total, 'var(--mint)'],
        ['One day, then gone', `${g.one_day} · ${pct(g.one_day, g.total)}%`, g.one_day > g.returned ? 'var(--coral)' : undefined],
        ['Came back 2+ days', g.returned],
        ['Warm right now', g.warm_now, g.warm_now > 0 ? 'var(--gold)' : undefined],
      ]} />
    </Section>
  )
}

function Features({ features, players }: { features: GrowthMetrics['features']; players: number }) {
  return (
    <Section title="🧩 Feature adoption" hint={`Share of the ${players} accounts that have ever played.`}>
      <Bars tint="var(--mint)" total={players} rows={features.map((f) => [f.label, f.users])} />
    </Section>
  )
}

// The loops that are supposed to bring new people in. These are the numbers
// that decide whether good retention compounds or just holds a fixed pool.
function ViralLoops({ v, accounts }: { v: GrowthMetrics['viral']; accounts: number }) {
  const pendingShare = pct(v.buddy_pending, v.buddy_total)
  return (
    <Section title="🌱 Growth loops" hint="Retention holds the pool. These are what fill it.">
      <Cells cells={[
        ['Referred signups', `${v.referred_accounts} of ${accounts}`, v.referred_accounts === 0 ? 'var(--coral)' : 'var(--good)'],
        ['Buddy pairs', v.buddy_accepted],
        ['Requests unanswered', v.buddy_total > 0 ? `${v.buddy_pending} · ${pendingShare}%` : '0',
          pendingShare >= 50 ? 'var(--coral)' : undefined],
        ['Push subscriptions', v.push_subscriptions, v.push_subscriptions < 5 ? 'var(--coral)' : undefined],
        ['Real battles', `${v.battles_real_done}/${v.battles_real} done`],
        ['Battles shared', v.battles_broadcast, v.battles_broadcast === 0 ? 'var(--coral)' : undefined],
      ]} />
      {pendingShare >= 50 && v.buddy_total > 0 && (
        <p style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.45, color: 'var(--warn)' }}>
          ⚠ {pendingShare}% of buddy requests are unanswered
          {v.push_subscriptions < 5 && ` and only ${v.push_subscriptions} device${v.push_subscriptions === 1 ? '' : 's'} can receive a push`}
          {' '}— people are inviting, the invite isn't landing.
        </p>
      )}
    </Section>
  )
}

function Quality({ q, money }: { q: GrowthMetrics['quality']; money: GrowthMetrics['money'] }) {
  return (
    <Section title="🎮 Play quality & money"
      hint={`Top 10 players are ${q.top10_share}% of all plays${q.top10_share >= 50 ? ' — the averages describe a handful of people' : ''}.`}>
      <Cells cells={[
        ['Avg correct', q.avg_pct_correct == null ? '—' : `${q.avg_pct_correct}%`],
        ['Avg run time', q.avg_secs == null ? '—' : `${q.avg_secs}s`],
        ['Streak 3+', q.streak_3plus, 'var(--gold)'],
        ['Streak 7+', q.streak_7plus, 'var(--gold)'],
        ['Longest streak', q.streak_max],
        ['Paid unlocks', money.stripe_granted + money.apple_purchases],
      ]} />
    </Section>
  )
}

// Self-monitoring. If either of these is non-zero the numbers above are lying,
// so it says so rather than quietly reporting a wrong figure.
function Health({ h }: { h: GrowthMetrics['health'] }) {
  const clean = h.onboarded_gap === 0 && h.rls_disabled.length === 0
  return (
    <Section title="🩺 Data health">
      <div className="card" style={{ padding: '12px 14px', display: 'grid', gap: 6 }}>
        {clean && <div style={{ fontSize: 13, color: 'var(--good)' }}>✓ All checks clean.</div>}
        {h.onboarded_gap > 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--coral)', lineHeight: 1.45 }}>
            ⚠ {h.onboarded_gap} account{h.onboarded_gap === 1 ? ' has' : 's have'} played but{' '}
            {h.onboarded_gap === 1 ? 'is' : 'are'} not flagged onboarded — a write path is bypassing
            the trigger from migration 0052.
          </div>
        )}
        {h.rls_disabled.length > 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--coral)', lineHeight: 1.45 }}>
            ⚠ Row level security is OFF on: {h.rls_disabled.join(', ')} — readable and writable by
            anyone holding the anon key.
          </div>
        )}
      </div>
    </Section>
  )
}
