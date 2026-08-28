import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { XpBar } from '@/components/XpBar'
import { StreakFlame } from '@/components/StreakFlame'
import { PresenceStrip } from '@/features/presence/PresenceStrip'
import { DailyChest } from '@/features/chest/DailyChest'
import { RoadStrip } from '@/features/season/RoadStrip'
import { Collapsible } from '@/components/Collapsible'
import { LeaderboardSection } from '@/features/leaderboard/LeaderboardScreen'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import { useGame } from '@/store/game'
import { useReviews } from '@/store/reviews'
import { useSettings } from '@/store/settings'
import { Tutorial } from './Tutorial'
import { InstallPrompt } from './InstallPrompt'
import { AppStoreNudge } from './AppStoreNudge'
import { InventoryNudge } from './InventoryNudge'
import { msUntilNextLocalMidnight, formatCountdown } from '@/lib/date'

export default function HomeScreen() {
  const navigate = useNavigate()
  const profile = useAuth((s) => s.profile)!
  const mode = useAuth((s) => s.mode)
  const { today, playedToday, lastResult, loadToday, boostArmed, armBoost } = useGame()
  const { dueRefs, loadDue } = useReviews()
  const tutorialSeen = useSettings((s) => s.tutorialSeen)
  const setSettings = useSettings((s) => s.set)
  const [countdown, setCountdown] = useState(msUntilNextLocalMidnight())
  const [tutorialOpen, setTutorialOpen] = useState(false)

  useEffect(() => {
    loadToday()
    loadDue()
  }, [loadToday, loadDue])

  // Show the how-to-play walkthrough once, automatically, to brand-new players
  // (nobody who's already played today). After that it's opt-in via the button.
  useEffect(() => {
    if (!tutorialSeen && !playedToday && profile.totalPlays === 0) {
      setTutorialOpen(true)
      setSettings({ tutorialSeen: true })
    }
  }, [tutorialSeen, playedToday, profile.totalPlays, setSettings])

  useEffect(() => {
    const t = setInterval(() => setCountdown(msUntilNextLocalMidnight()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <Page>
      {/* Top identity bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Avatar emoji={profile.avatarEmoji} character={profile.avatarCharacter} ring border={profile.avatarBorder} badge={profile.avatarBadge} username={profile.username} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>@{profile.username}</b>
            <StreakFlame days={profile.currentStreak} size={18} />
          </div>
          <div style={{ marginTop: 6 }}>
            <XpBar xp={profile.xp} />
          </div>
        </div>
      </div>

      {/* The Pilgrimage. High on the tab because the bottom nav is full at five
          and this strip is the only way the road gets seen. */}
      <RoadStrip />

      {/* Add to Home Screen — only renders where installing is actually possible
          (and not already installed), and can be dismissed for good. */}
      <InstallPrompt />

      {/* The App Store bubble — floats in a couple of seconds later, for players
          a few drops deep. Asks iOS web players to download, and players who are
          already inside the app to leave a review. */}
      <AppStoreNudge />

      {/* How to play — a persistent, low-key button that opens the walkthrough.
          Replaces the old build-your-character nudge card. */}
      <button
        onClick={() => setTutorialOpen(true)}
        className="card"
        style={{
          width: '100%',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 22 }}>💡</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>How to play</b>
          <div className="faint" style={{ fontSize: 12.5 }}>A 20-second tour — streaks, battles &amp; building your character.</div>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 18, flexShrink: 0 }}>→</div>
      </button>

      {tutorialOpen && <Tutorial onClose={() => setTutorialOpen(false)} />}

      {/* Streak-freeze reassurance (kind loss-aversion made visible) */}
      {profile.streakFreezes > 0 && profile.currentStreak > 0 && (
        <p className="faint" style={{ fontSize: 12, marginBottom: 12 }}>
          🛟 {profile.streakFreezes} streak freeze{profile.streakFreezes > 1 ? 's' : ''} — miss a day and your streak survives.
        </p>
      )}

      {/* The daily drop */}
      <motion.div
        className="card"
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        style={{ padding: 22, textAlign: 'center', position: 'relative', overflow: 'hidden' }}
      >
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(400px 200px at 50% 0%, rgba(255,210,63,0.14), transparent 70%)' }} />
        <span className="pill" style={{ marginBottom: 12 }}>
          ✦ Today’s Drop
        </span>

        {!playedToday ? (
          <>
            <h2 style={{ fontSize: 26, marginTop: 6 }}>A new verse is live</h2>
            <p className="dim" style={{ marginTop: 8 }}>
              Read it, then race the clock on {today?.questions.length ?? 5} quick
              questions about it. Same verse everyone’s playing right now.
            </p>
            {profile.xpBoosts > 0 && (
              <motion.button
                onClick={() => armBoost(!boostArmed)}
                whileTap={{ scale: 0.98 }}
                style={{
                  width: '100%',
                  marginTop: 14,
                  padding: '11px 14px',
                  borderRadius: 'var(--r-md)',
                  border: `1px solid ${boostArmed ? 'var(--gold)' : 'var(--stroke)'}`,
                  background: boostArmed ? 'rgba(255,210,63,0.14)' : 'var(--card)',
                  color: 'var(--ink)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 22 }}>⚡</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>
                    {boostArmed ? 'XP Boost armed — +50% XP' : 'Use an XP Boost'}
                  </div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {profile.xpBoosts} available{boostArmed ? ' · applies to this run' : ' · +50% XP on this verse'}
                  </div>
                </div>
                <span
                  className="pill"
                  style={{
                    fontSize: 11,
                    borderColor: boostArmed ? 'var(--gold)' : undefined,
                    color: boostArmed ? 'var(--gold)' : undefined,
                  }}
                >
                  {boostArmed ? 'ON' : 'OFF'}
                </span>
              </motion.button>
            )}
            <div style={{ marginTop: 14 }}>
              <Button variant="gold" full onClick={() => navigate('/play/run')}>
                ▶ Play today’s verse{boostArmed ? ' ⚡' : ''}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 24, marginTop: 6 }}>Done for today 🎉</h2>
            <p className="dim" style={{ marginTop: 6 }}>{today?.reference}</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 14 }}>
              <Stat label="Score" value={lastResult?.result.score.toLocaleString() ?? '—'} />
              <Stat label="Correct" value={`${lastResult?.result.correctCount}/${lastResult?.result.totalQuestions}`} />
              <Stat label="Best combo" value={`×${lastResult?.result.comboMax ?? 0}`} />
            </div>
            <p className="faint" style={{ marginTop: 16, fontSize: 14 }}>
              Next verse in <b style={{ color: 'var(--sky)' }}>{formatCountdown(countdown)}</b>
            </p>
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" full onClick={() => navigate('/play/result')}>
                See my recap & share →
              </Button>
            </div>
          </>
        )}
      </motion.div>

      {/* Guests need a way back into an existing account, and this is the only
          screen everyone lands on. The same CTA already exists inside
          LeaderboardSection, but that lives in the "Worldwide Ranks"
          collapsible, which is CLOSED by default — so a signed-out player with
          an account had no visible way to sign in from here.

          Guarded on `supabase` as well as guest mode: in a LOCAL build (no keys)
          there is no backend to sign in to, and the button would be a dead end.
          Deliberately `secondary`, so it never competes with the gold primary
          action above it — this is an offer, not a wall. */}
      {mode === 'local' && supabase && (
        <motion.div
          className="card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginTop: 16, textAlign: 'center' }}
        >
          <p style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>
            Today’s verse is yours. The rest is one tap away.
          </p>
          <p className="dim" style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.5 }}>
            A free account opens battles, your keep, Study, your own Bible and playing for
            your church — and carries your streak, XP and character to any device.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            <Button variant="gold" full onClick={() => navigate('/auth?mode=signup')}>
              Create a free account →
            </Button>
            <Button variant="ghost" full onClick={() => navigate('/auth')}>
              I already have an account
            </Button>
          </div>
        </motion.div>
      )}

      {/* Daily Chest — unlocks after today's verse, gives a random relic. */}
      <DailyChest />

      {/* …and, once, a pointer at where those relics went and what they're for.
          Directly under the chest because that's where they came from. */}
      <InventoryNudge />

      {/* Reviews that are due ("Keep it") now live on the Study tab, alongside
          the other practice surfaces, rather than competing with today's verse.
          A dot on this nudge points there when something is waiting. */}
      {dueRefs.length > 0 && !(mode === 'local' && supabase) && (
        <motion.button
          onClick={() => navigate('/study')}
          whileTap={{ scale: 0.97 }}
          className="card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ width: '100%', textAlign: 'left', marginTop: 16, display: 'flex', alignItems: 'center', gap: 14 }}
        >
          <div style={{ fontSize: 30 }}>🧠</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>Keep it</div>
            <div className="faint" style={{ fontSize: 13 }}>
              {dueRefs.length} verse{dueRefs.length > 1 ? 's' : ''} ready to review — waiting on the Study tab
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 20 }}>→</div>
        </motion.button>
      )}

      <div style={{ height: 16 }} />
      <PresenceStrip />

      {/* Worldwide ranks — folded in here instead of owning a tab. Closed by
          default so today's verse stays the point of this screen. */}
      <div style={{ marginTop: 18 }}>
        <Collapsible icon="🏆" title="Worldwide Ranks">
          <LeaderboardSection />
        </Collapsible>
      </div>

      <div style={{ height: 80 }} />
    </Page>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{value}</div>
      <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}
