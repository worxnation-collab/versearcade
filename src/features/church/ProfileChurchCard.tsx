import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import { useChurch } from '@/store/church'
import { useChurchToday } from '@/store/churchPackage'
import { useJuice } from '@/juice/useJuice'
import { ChurchArt } from './ChurchArt'
import { useChurchExtras } from './ChurchExtras'
import { churchLevelInfo, tierForLevel } from './levels'
import { throughLabel } from '@/features/home/ChurchWindow'

// Your church, as one row on your own profile.
//
// `ChurchNudge` is the no-church half of this slot and removes itself the
// moment there is a church — which used to leave `/you` saying nothing about
// the congregation somebody plays for. This is the other half: who it is, how
// big the building is, and the ONE thing the church is saying right now.
//
// It stays compact on purpose. The yard, giving, the week and the roster are
// the Church tab's, and a second copy of any of them here would be two
// surfaces to keep in step (the "one component per world" rule). So: no
// per-person number, no giving form, nothing editable — one door to /church,
// and a second to the leadership tools for the people who have them.
//
// The "next" line picks the first thing that is TRUE today: the live notice
// (any claimed church may post one), else the published "This week" line,
// else the service times, else nothing — the card is whole without any of
// them. Online-only, inherited from `store/church.ts`.
export function ProfileChurchCard() {
  const navigate = useNavigate()
  const juice = useJuice()
  const mode = useAuth((s) => s.mode)
  const church = useChurch((s) => s.church)
  const loaded = useChurch((s) => s.loaded)
  const load = useChurch((s) => s.load)
  const info = useChurch((s) => s.myInfo)
  const loadCongregation = useChurch((s) => s.loadCongregation)
  const today = useChurchToday((s) => s.today)
  const loadToday = useChurchToday((s) => s.load)
  const extras = useChurchExtras(church?.id ?? '')

  const online = mode === 'online' && !!supabase
  const churchId = church?.id

  useEffect(() => {
    if (online && !loaded) void load()
  }, [online, loaded, load])

  // The published info rides on the same `get_church_page` read the yard
  // already makes; the notice's last day only comes with `my_church_today`.
  useEffect(() => {
    if (!online || !churchId) return
    void loadCongregation()
    void loadToday()
  }, [online, churchId, loadCongregation, loadToday])

  // Nothing until the store has answered — and nothing at all without a church,
  // where `ChurchNudge` already has the slot.
  if (!online || !loaded || !church) return null

  const lvl = churchLevelInfo(church.xp)
  const tier = tierForLevel(church.level)
  const place = [church.city, church.region].filter(Boolean).join(', ')

  const notice = extras?.announcement ?? null
  // `church_extras` carries no expiry; `my_church_today` does, but only for a
  // verified church. Matched by id so one church's date can't caption another's.
  const expires = notice
    ? today?.announcements?.find((a) => a.id === notice.id)?.expires_at ?? null
    : null
  const next = notice
    ? { label: expires ? `Notice ${throughLabel(expires, new Date())}` : 'Notice', text: notice.message }
    : info?.thisWeek
      ? { label: 'This week', text: info.thisWeek }
      : info?.serviceTimes
        ? { label: 'Services', text: info.serviceTimes }
        : null

  const open = () => {
    juice.select?.()
    navigate('/church')
  }

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      // minmax(0, 1fr): a grid item's min-width is `auto`, so a long church
      // name would otherwise widen the card off a 320px phone.
      style={{ padding: 14, marginBottom: 10, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}
    >
      {/* The card is not one big <button> because the leadership pill is a
          second door, and a button can't hold a button. */}
      <motion.button
        onClick={open}
        whileTap={{ scale: 0.985 }}
        aria-label={`Open ${church.name}`}
        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
      >
        <div aria-hidden style={{ width: 60, height: 60, flexShrink: 0, display: 'grid', placeItems: 'end center' }}>
          <ChurchArt level={church.level} skin={church.skin} size={60} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {church.name}
          </div>
          {place && (
            <div className="faint" style={{ fontSize: 12, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {place}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: 'var(--font-display)' }}>LVL {church.level}</span> · {tier.name}
            </span>
            <span className="faint" style={{ fontSize: 12, flexShrink: 0 }}>
              {church.members === 1 ? '1 player' : `${church.members.toLocaleString()} players`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Church level progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(lvl.pct * 100)}
            style={{ height: 5, borderRadius: 999, background: 'var(--card-raised)', marginTop: 5, overflow: 'hidden' }}
          >
            <div style={{ width: `${lvl.pct * 100}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--gold), var(--tangerine))' }} />
          </div>
        </div>
        <span aria-hidden className="faint" style={{ fontSize: 18, flexShrink: 0 }}>›</span>
      </motion.button>

      {(next || extras?.isAdmin) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, borderTop: '1px solid var(--stroke)', paddingTop: 10 }}>
          {next ? (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="faint" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {next.label}
              </div>
              <p
                style={{
                  margin: '3px 0 0',
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: 'var(--ink-dim)',
                  overflowWrap: 'anywhere',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {next.text}
              </p>
            </div>
          ) : (
            <div style={{ flex: 1 }} />
          )}
          {extras?.isAdmin && (
            <button
              className="pill"
              onClick={() => { juice.select?.(); navigate(`/church/${church.id}/admin`) }}
              style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold)', flexShrink: 0, cursor: 'pointer' }}
            >
              Leadership
            </button>
          )}
        </div>
      )}
    </motion.div>
  )
}
