import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useGroups, type GroupView } from '@/store/groups'
import { useGame } from '@/store/game'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { shareResult, inviteUrl } from '@/features/daily/shareCard'

// Co-op tier: a group opens the SAME daily verse and pools points toward a
// shared goal against the clock. Everyone climbs together — no member is ever
// ranked against another. The bar is the whole group's, not yours.
export default function GroupsScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { groups, loadGroups, createGroup, joinGroup, contributeToday } = useGroups()
  const playedToday = useGame((s) => s.playedToday)
  const mode = useAuth((s) => s.mode)
  const [params] = useSearchParams()
  const [tab, setTab] = useState<'mine' | 'join' | 'new'>('mine')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🔥')
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  // Invite deep link: /groups?join=CODE prefills the Join tab for an existing player.
  useEffect(() => {
    const invited = params.get('join')
    if (invited) {
      setCode(invited.toUpperCase().slice(0, 6))
      setTab('join')
    }
  }, [params])

  const contribute = async () => {
    juice.coin()
    try {
      await contributeToday()
      juice.celebrate()
      setFlash('Added to the climb! 🧗')
    } catch {
      setFlash('Couldn’t add your score — try again.')
    }
  }

  return (
    <Page>
      <h1 style={{ fontSize: 30, marginBottom: 4 }}>Groups</h1>
      <p className="dim" style={{ marginBottom: 16 }}>Climb together against the clock.</p>

      {mode === 'local' && (
        <div className="card" style={{ marginBottom: 14, background: 'rgba(94,231,223,0.1)', borderColor: 'var(--sky)' }}>
          <b>Preview mode</b>
          <p className="dim" style={{ fontSize: 14, marginTop: 4 }}>
            This is a demo group. <span style={{ color: 'var(--sky)', textDecoration: 'underline' }} onClick={() => navigate('/auth')}>Create an account</span> to make real groups and invite friends by code.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['mine', 'join', 'new'] as const).map((t) => (
          <button key={t} onClick={() => { juice.select(); setFlash(null); setTab(t) }} className="pill"
            style={{ background: tab === t ? 'var(--grape)' : 'var(--card)', fontWeight: 800, textTransform: 'capitalize' }}>
            {t === 'mine' ? 'My groups' : t === 'join' ? 'Join' : 'New'}
          </button>
        ))}
      </div>

      {/* Feedback is shown on every tab — otherwise a tapped Create/Join button
          looks dead when it returns a message but doesn't switch tabs. */}
      {flash && <p style={{ color: 'var(--sky)', textAlign: 'center', marginBottom: 14 }}>{flash}</p>}

      {tab === 'mine' && (
        <div style={{ display: 'grid', gap: 14 }}>
          {groups.length === 0 && <p className="faint">No groups yet. Create one or join with a code!</p>}
          {groups.map((g) => (
            <GroupCard key={g.id} g={g} canContribute={playedToday && !g.contributedToday} onContribute={contribute} />
          ))}
          {!playedToday && groups.length > 0 && (
            <p className="faint center" style={{ fontSize: 13 }}>Play today’s verse first, then add your score to the climb.</p>
          )}
        </div>
      )}

      {tab === 'join' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter 6-letter group code" autoCapitalize="characters" maxLength={6} />
          <Button variant="gold" full disabled={code.trim().length < 6} onClick={async () => {
            if (mode === 'local') { setFlash('Sign in to join real groups.'); return }
            const ok = await joinGroup(code)
            setFlash(ok ? 'Joined! 🎉' : 'Hmm, no group with that code.')
            if (ok) setTab('mine')
          }}>Join group</Button>
        </div>
      )}

      {tab === 'new' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {['🔥', '🙌', '📖', '🕊️', '⚡', '🌿'].map((e) => (
              <button key={e} onClick={() => { juice.select(); setEmoji(e) }} className="pill"
                style={{ fontSize: 20, background: e === emoji ? 'var(--grape)' : 'var(--card)' }}>{e}</button>
            ))}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name (e.g. Youth Group)" maxLength={30} />
          <Button variant="gold" full disabled={name.trim().length < 2} onClick={async () => {
            if (mode === 'local') { setFlash('Sign in to create real groups and invite friends by code.'); return }
            const c = await createGroup(name.trim(), emoji)
            if (c) { setFlash(`Created! Share code: ${c}`); setTab('mine') }
            else setFlash('Couldn’t create the group — please try again.')
          }}>Create group</Button>
        </div>
      )}
    </Page>
  )
}

function GroupCard({ g, canContribute, onContribute }: { g: GroupView; canContribute: boolean; onContribute: () => void }) {
  const pct = Math.min(1, g.todayTotal / g.goal)
  const hit = pct >= 1
  const [invite, setInvite] = useState<string | null>(null)
  const referralCode = useAuth((s) => s.profile?.referralCode)

  const shareInvite = async () => {
    const link = inviteUrl(referralCode, `/groups?join=${g.joinCode}`)
    const text =
      `Join my Verse Arcade group “${g.name}” ${g.emoji}!\n` +
      `We race one shared Bible verse a day and climb together.\n\n` +
      `Tap Groups → Join and enter code ${g.joinCode}\n` +
      `${link}`
    const r = await shareResult(text, link)
    setInvite(r === 'shared' ? 'Invite shared!' : r === 'copied' ? 'Invite copied to clipboard!' : 'Could not share')
  }

  return (
    <motion.div className="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 26 }}>{g.emoji}</div>
        <div style={{ flex: 1 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{g.name}</b>
          <div className="faint" style={{ fontSize: 12 }}>LVL {g.level} · 🔥 {g.currentStreak} · {g.memberCount} members · code {g.joinCode}</div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, fontWeight: 700 }}>
          <span className="dim">Today’s climb</span>
          <span style={{ color: hit ? 'var(--good)' : 'var(--gold)' }}>{g.todayTotal.toLocaleString()} / {g.goal.toLocaleString()}</span>
        </div>
        <div style={{ height: 14, borderRadius: 999, background: 'rgba(0,0,0,0.35)', overflow: 'hidden', border: '1px solid var(--stroke)' }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            style={{ height: '100%', borderRadius: 999, background: hit ? 'linear-gradient(90deg, var(--good), var(--good-deep))' : 'linear-gradient(90deg, var(--gold), var(--tangerine))' }} />
        </div>
        {hit && <p style={{ color: 'var(--good)', fontSize: 13, marginTop: 8, fontWeight: 700 }}>🎉 Goal reached — everyone earns bonus XP!</p>}
      </div>

      {g.contributedToday ? (
        <p className="faint" style={{ fontSize: 13, marginTop: 12 }}>✅ You’ve added your score today.</p>
      ) : canContribute ? (
        <div style={{ marginTop: 12 }}><Button variant="gold" full onClick={onContribute}>Add my score to the climb 🧗</Button></div>
      ) : null}

      {g.id !== 'demo' && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={shareInvite}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--stroke)', color: 'var(--ink)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            📤 Share invite <span className="faint" style={{ fontWeight: 800, letterSpacing: '0.08em' }}>· {g.joinCode}</span>
          </button>
          {invite && <p style={{ color: 'var(--good)', fontSize: 12, textAlign: 'center', marginTop: 6 }}>{invite}</p>}
        </div>
      )}
    </motion.div>
  )
}
