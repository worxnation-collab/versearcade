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
import { Collapsible } from '@/components/Collapsible'
import { LeaderboardSection } from '@/features/leaderboard/LeaderboardScreen'
import { useAuth } from '@/store/auth'
import { useGame } from '@/store/game'
import { useReviews } from '@/store/reviews'
import { useSettings } from '@/store/settings'
import { isDefaultAvatar } from '@/data/avatar'
import { msUntilNextLocalMidnight, formatCountdown } from '@/lib/date'

export default function HomeScreen() {
  const navigate = useNavigate()
  const profile = useAuth((s) => s.profile)!
  const { today, playedToday, lastResult, loadToday, boostArmed, armBoost } = useGame()
  const { dueRefs, loadDue } = useReviews()
  const promptDismissed = useSettings((s) => s.characterPromptDismissed)
  const setSettings = useSettings((s) => s.set)
  const [countdown, setCountdown] = useState(msUntilNextLocalMidnight())

  // Nudge players who haven't built a character yet (existing emoji-only users,
  // or anyone still on the starter look). One-time, dismissible.
  const showCharacterPrompt = !promptDismissed && isDefaultAvatar(profile.avatarCharacter)

  useEffect(() => {
    loadToday()
    loadDue()
  }, [loadToday, loadDue])

  useEffect(() => {
    const t = setInterval(() => setCountdown(msUntilNextLocalMidnight()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <Page>
      {/* Top identity bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Avatar emoji={profile.avatarEmoji} character={profile.avatarCharacter} ring border={profile.avatarBorder} badge={profile.avatarBadge} />
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

      {/* One-time nudge to build a character (replaces the plain emoji pfp). */}
      {showCharacterPrompt && (
        <motion.div
          className="card"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'linear-gradient(120deg, rgba(255,210,63,0.14), rgba(160,107,255,0.12))',
            borderColor: 'var(--gold)',
          }}
        >
          <Avatar emoji={profile.avatarEmoji} character={{ skin: 'sand', robe: 'linen', armor: { breastplate: true, belt: true, helmet: true, sword: true } }} size={48} ring={false} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>New — build your character</b>
            <div className="faint" style={{ fontSize: 12.5 }}>Make it yours and start collecting the Armor of God.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => navigate('/you')}
              className="pill"
              style={{ background: 'var(--gold)', color: '#241f0a', fontWeight: 800, fontSize: 13, padding: '7px 12px' }}
            >
              Build it →
            </button>
            <button
              onClick={() => setSettings({ characterPromptDismissed: true })}
              className="faint"
              style={{ fontSize: 11, background: 'transparent', border: 'none', cursor: 'pointer' }}
              aria-label="Dismiss"
            >
              Maybe later
            </button>
          </div>
        </motion.div>
      )}

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

      {/* Daily Chest — unlocks after today's verse, gives a random relic. */}
      <DailyChest />

      {/* Reviews that are due ("Keep it") now live on the Study tab, alongside
          the other practice surfaces, rather than competing with today's verse.
          A dot on this nudge points there when something is waiting. */}
      {dueRefs.length > 0 && (
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
