import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChapterReader } from './ChapterReader'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { CountUp } from '@/components/CountUp'
import { StreakFlame } from '@/components/StreakFlame'
import { useGame } from '@/store/game'
import { useDailyTrivia } from '@/store/dailyTrivia'
import { dailyTriviaBook } from '@/data/bible/questions'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { useAccountLocked } from '@/components/AccountWall'
import { useSeason } from '@/store/season'
import { useJuice } from '@/juice/useJuice'
import { buildShareText, shareResult, earnedCards, inviteUrl } from './shareCard'
import { collectibleByKey, rarityColor } from '@/data/collectibles'
import { useCollection } from '@/store/collection'
import { OAuthButtons } from '@/features/auth/oauthUi'
import { FavoriteButton } from '@/components/FavoriteButton'
import { PushNudge } from '@/components/PushNudge'
import { WatchYesterday } from './WatchYesterday'
import { TomorrowCard } from './TomorrowCard'
import { SendVerseCard } from './SendVerseCard'
import { MissedList } from './MissedList'
import { ScriptureQuote } from '@/components/ScriptureQuote'
import { PaintedIcon } from '@/components/PaintedIcon'
import { StreakBorderOffer } from './StreakBorderOffer'
import { ChurchArt } from '@/features/church/ChurchArt'

export default function ResultScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { today, todayDate, lastResult } = useGame()
  // The other half of today. Both daily things sit level with each other on the
  // Play tab, and this is the screen a player is on when they've just finished
  // one of them — so it says what's left rather than letting them find out
  // tomorrow. Loaded here because the store is device-local and this screen can
  // be reached without the Play tab (a deep link into the run).
  const triviaLoaded = useDailyTrivia((s) => s.loaded)
  const loadTrivia = useDailyTrivia((s) => s.load)
  const triviaDone = useDailyTrivia((s) => !!s.done[todayDate])
  useEffect(() => {
    if (!triviaLoaded) loadTrivia()
  }, [triviaLoaded, loadTrivia])
  const triviaBook = dailyTriviaBook(todayDate)
  const profile = useAuth((s) => s.profile)!
  const recordShare = useAuth((s) => s.recordShare)
  const isGuest = useAuth((s) => s.mode) === 'local'
  // Guest AND an account is actually available. This is the app's one reliably
  // happy screen, so it's where the offer belongs — right after the run they
  // just finished, naming what's on the other side of it.
  const locked = useAccountLocked()
  const [shareState, setShareState] = useState<string | null>(null)
  const [signInErr, setSignInErr] = useState<string | null>(null)
  const [readerOpen, setReaderOpen] = useState(false)
  const reduceMotion = useSettings((s) => s.reduceMotion)

  const result = lastResult?.result
  const outcome = lastResult?.outcome

  // A guest who has played before has something to lose, which is a different
  // pitch from a first-timer who has only just seen the payoff.
  const returningGuest = isGuest && (profile.totalPlays > 1 || (outcome?.currentStreak ?? 0) > 1)

  const cards = useMemo(
    () => (result && outcome ? earnedCards(result, outcome, profile.totalPlays) : []),
    [result, outcome, profile.totalPlays],
  )
  // Persist earned cards to the account (or device for guests) so they stick.
  useEffect(() => {
    if (cards.length) useCollection.getState().grant(cards)
  }, [cards])

  // Celebrate on arrival — the reason people come back is this moment feels good.
  useEffect(() => {
    if (!outcome) return
    const t = setTimeout(() => {
      if (outcome.leveledUp) juice.levelUp()
      else if (outcome.currentStreak >= 3) juice.streak()
      else juice.celebrate()
    }, 350)
    return () => clearTimeout(t)
  }, [outcome, juice])

  useEffect(() => {
    if (!lastResult) navigate('/play', { replace: true })
  }, [lastResult, navigate])

  if (!result || !outcome || !today) return null

  // A low run (none or one right) makes the facts the peak of the screen: the
  // score stays visible but compact, the zero-line folds into the list's own
  // header, and the trivia nudge moves under the list so five facts fit on a
  // phone without scrolling. A perfect or good run is untouched.
  const lowRun = result.correctCount <= 1 && result.perQuestion.some((p) => !p.correct)

  const doShare = async () => {
    const text = buildShareText(result, outcome, profile.referralCode)
    const r = await shareResult(text, inviteUrl(profile.referralCode))
    // A successful share (native sheet or clipboard copy) counts today toward
    // share-day unlocks like the King Baldwin set — distinct days only.
    if (r !== 'failed' && today) {
      recordShare(today.dropDate)
      void useSeason.getState().track('share_daily')
    }
    setShareState(r === 'copied' ? 'Copied to clipboard!' : r === 'shared' ? 'Shared!' : 'Could not share')
  }

  const payoff = (
    <>
        {/* Level up / XP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16 }}>
          <Tile label="XP earned" value={`+${outcome.xpEarned ?? 0}`} accent="var(--gold)" />
          <Tile label="Level" value={`${outcome.level}`} accent={outcome.leveledUp ? 'var(--good)' : undefined} badge={outcome.leveledUp ? 'UP!' : undefined} />
          <Tile label="Correct" value={`${result.correctCount}/${result.totalQuestions}`} />
        </div>

        {outcome.pending && (
          <p className="dim" data-play-pending style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
            You’re offline, so this play is saved on your phone. It counts for today and is sent the moment
            you’re back online. These numbers are an estimate until then.
          </p>
        )}

        {outcome.boostUsed && (
          <p className="faint" style={{ marginTop: 8, fontSize: 13 }}>
            ⚡ <b style={{ color: 'var(--gold)' }}>XP Boost applied</b> — +50% XP this run
          </p>
        )}

        {/* Streak */}
        <motion.div className="card" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}
          animate={outcome.currentStreak >= 3 ? { scale: [1, 1.03, 1] } : {}} transition={{ repeat: 2, duration: 0.5 }}>
          <StreakFlame days={outcome.currentStreak} size={26} />
          <span className="dim">
            {outcome.usedFreeze ? <>Streak freeze saved you! <PaintedIcon id="freeze" /></> : outcome.currentStreak === 1 ? 'Streak started — come back tomorrow!' : `${outcome.currentStreak}-day streak. Same time tomorrow?`}
          </span>
        </motion.div>
        <StreakBorderOffer streak={outcome.currentStreak} alreadyPlayed={outcome.alreadyPlayed} />

        {/* Collectibles earned */}
        {cards.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p className="faint" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>New verse card{cards.length > 1 ? 's' : ''}!</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {cards.map((k) => {
                const c = collectibleByKey(k)
                if (!c) return null
                return (
                  <motion.div key={k} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }}
                    className="card" style={{ padding: 12, minWidth: 92, borderColor: rarityColor[c.rarity] }}>
                    <div style={{ fontSize: 30 }}>{c.emoji}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: rarityColor[c.rarity], textTransform: 'uppercase' }}>{c.rarity}</div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}

    </>
  )

  return (
    <Page noNav>
      <div style={{ textAlign: 'center', paddingTop: 12 }}>
        <motion.div initial={{ scale: reduceMotion ? 1 : 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 12 }}>
          {/* A star over a zero reads as sarcasm. A run that taught five facts
              and scored none of them gets the book instead — the same beat,
              naming what actually happened. */}
          <div style={{ fontSize: lowRun ? 36 : 60 }}>
            {outcome.leveledUp ? '🎉' : result.correctCount === result.totalQuestions ? '💎' : result.correctCount === 0 ? '📖' : '⭐'}
          </div>
        </motion.div>

        <p className="dim" style={{ marginTop: lowRun ? 0 : 4, fontSize: lowRun ? 13 : undefined }}>You scored</p>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: lowRun ? 40 : 64, lineHeight: 1 }}>
          <CountUp to={result.score} duration={1200} tickSound className="gradient-text" />
        </div>

        {/* THE SCORE IS NEVER HIDDEN — it is the player's own number and taking
            it away would be a worse lie than a big zero. On a zero (or one-
            right) run it is drawn compact instead, and the featured list
            directly under it carries the "nothing lost" line in its header, so
            the facts are the last word rather than the zero. */}

        {/* The payoff — XP, level, streak, cards — directly under the score
            (2026-10-29). It sat under the verse card and the missed list, about
            two screens down, so a good run's reward was off-screen. On a low
            run the facts stay the peak and this follows them. */}
        {!lowRun && payoff}

        {/* Up by the score, while the run is still the thing on screen: the
            day's other box. It renders only while there IS one left to play —
            a finished day says nothing here rather than showing a tick, which
            is the same rule the map's invitations panel follows. */}
        {!triviaDone && !lowRun && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            onClick={() => navigate('/play/trivia')}
            className="card"
            style={{
              width: '100%', marginTop: 16, display: 'flex', alignItems: 'center', gap: 10,
              textAlign: 'left', cursor: 'pointer',
              borderColor: 'var(--sky)', background: 'rgba(93,211,255,0.10)',
            }}
          >
            <span style={{ fontSize: 22, flexShrink: 0 }}>✨</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 14 }}>Today’s trivia is still waiting</b>
              <span className="faint" style={{ fontSize: 12 }}>
                Five on {triviaBook ?? 'the whole Bible'} — the book itself, not the verse.
              </span>
            </span>
            <span style={{ color: 'var(--sky)', fontFamily: 'var(--font-display)', fontSize: 18 }}>→</span>
          </motion.button>
        )}

        {/* What the misses taught, ABOVE the verse card rather than under it.
            It used to sit below, which put the rescue below the fold on the one
            screen that needs it most: a first run scoring zero showed a 64px
            zero and nothing else without scrolling. A perfect run renders this
            as nothing, so the verse card is still directly under the score
            there and that screen is unchanged. The verse keeps the last word —
            it is the keepsake, and the heart that keeps it lives with it. */}
        <MissedList questions={today.questions} result={result} featured={lowRun} />
        {lowRun && payoff}
        {!triviaDone && lowRun && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            onClick={() => navigate('/play/trivia')}
            className="card"
            style={{
              width: '100%', marginTop: 16, display: 'flex', alignItems: 'center', gap: 10,
              textAlign: 'left', cursor: 'pointer',
              borderColor: 'var(--sky)', background: 'rgba(93,211,255,0.10)',
            }}
          >
            <span style={{ fontSize: 22, flexShrink: 0 }}>✨</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 14 }}>Today’s trivia is still waiting</b>
              <span className="faint" style={{ fontSize: 12 }}>
                Five on {triviaBook ?? 'the whole Bible'} — the book itself, not the verse.
              </span>
            </span>
            <span style={{ color: 'var(--sky)', fontFamily: 'var(--font-display)', fontSize: 18 }}>→</span>
          </motion.button>
        )}


        {/* The teaching payoff: reveal what the verse actually was. */}
        <div className="card" style={{ marginTop: 18, textAlign: 'left' }}>
          {/* The heart sits with the verse, not with the score — keeping a verse
              is about the text, and it costs and pays nothing. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span className="pill">📖 Today’s verse</span>
            <div style={{ marginLeft: 'auto' }}>
              <FavoriteButton reference={today.reference} variant="icon" />
            </div>
          </div>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{today.reference}</b>
          <ScriptureQuote verse={today} style={{ marginTop: 6 }} />
          {today.facts[0] && <p className="faint" style={{ marginTop: 10, fontSize: 13 }}>💡 {today.facts[0]}</p>}
          <button
            onClick={() => setReaderOpen(true)}
            style={{
              marginTop: 14,
              width: '100%',
              padding: '11px 14px',
              borderRadius: 'var(--r-pill)',
              border: '1px solid var(--gold)',
              background: 'rgba(255,210,63,0.10)',
              color: 'var(--gold)',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            📖 Read the full chapter →
          </button>
        </div>

        {/* Under the verse, because it IS a verse — yesterday's, read aloud on
            whichever network they already use. Renders nothing at all unless
            there is a published video to point at, which is most days for most
            platforms; see the header in WatchYesterday.tsx. */}
        <WatchYesterday dropDate={today.dropDate} />

        {/* Only worth asking of a signed-in player with a streak to protect —
            a guest has no account for a subscription to hang off, and someone
            on run one has nothing to be reminded about yet. */}
        {!isGuest && <PushNudge reason="streak" when={(outcome.currentStreak ?? 0) >= 3} />}

        {/* A new player's first two streak days: what tomorrow holds, and on
            the App Store build the one reminder that fires (TomorrowCard). */}
        {(outcome.currentStreak ?? 0) <= 2 && <TomorrowCard todayDate={todayDate} streak={outcome.currentStreak ?? 1} />}

        {/* The first week's one tap to bring somebody in: today's verse, not
            the score (SendVerseCard). Later the result share below does it. */}
        {(outcome.currentStreak ?? 0) <= 7 && <SendVerseCard dropDate={today.dropDate} />}

        <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
          <Button variant="gold" full onClick={doShare}>📤 Share my result</Button>
          {shareState && <p className="faint" style={{ fontSize: 13 }}>{shareState}</p>}

          {/* The code used to live only behind a closed drawer on the You tab, at
              a neutral moment. This is the app's one reliably happy screen, so
              it's where the offer belongs — stated, not sold, and only to
              someone who hasn't finished the set yet. */}
          {!isGuest && profile.referralCode && (profile.referralCount ?? 0) < 5 && (
            <p className="faint" style={{ fontSize: 12, marginTop: -2, lineHeight: 1.5 }}>
              Your link carries code{' '}
              <b style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.12em', color: 'var(--gold)' }}>
                {profile.referralCode}
              </b>
              {' — '}
              {(profile.referralCount ?? 0) > 0
                ? `${profile.referralCount} of 5 friends joined so far.`
                : 'when 5 friends join with it, the carried-cross look unlocks.'}
            </p>
          )}
          {/* The drop is one run a day and then it's over, which is most of why
              27 of 68 players have exactly one day on record: they didn't reject
              the app, they ran out of it. Study has no cap and is already the
              most-used thing after the drop, so it — not "Back home" — is the
              answer to "that was fun, now what".

              For a guest that answer is behind the account wall, so the ask goes
              here instead of two buttons that would open a padlock. Same
              sentence either way: today's drop is over, here's what isn't. */}
          {locked ? (
            <>
              <Button variant="secondary" full onClick={() => navigate('/auth?mode=signup')}>
                ✨ Create a free account
              </Button>
              <p className="faint" style={{ fontSize: 12, marginTop: -2, lineHeight: 1.5 }}>
                That’s today’s drop. An account opens Study (unlimited, never ranks you),
                battles, Study and your own Bible — and keeps this streak safe.
              </p>
            </>
          ) : (
            <>
              <Button variant="secondary" full onClick={() => navigate('/battle/new')}>⚔️ Challenge a buddy</Button>
              <Button variant="secondary" full onClick={() => navigate('/study')}>
                📚 Keep playing in Study
              </Button>
              <p className="faint" style={{ fontSize: 12, marginTop: -2 }}>
                That’s today’s drop. Study is unlimited and never ranks you.
              </p>
            </>
          )}

          <Button variant="ghost" full onClick={() => navigate('/play')}>Back home</Button>
        </div>

        {/* The moment of highest intent: they just got the payoff. Ask guests to
            save it before they bounce. Since 2026-10-29 it sits UNDER Share and
            the next-step buttons in a plain card: it used to be the heaviest
            thing on the screen (gold border, three sign-in buttons) above the
            one action a result is for, and the XP and streak it protects were
            two screens down. The ask is the same; it is no longer the headline.

            The ask stays on run one — 71% of guests never come back, so that is
            the only shot at most of them and removing it would cost more than it
            saved. What changes is the pitch: once a guest has a streak, the
            thing they'd lose is concrete, and the copy names it instead of
            describing sync in the abstract. */}
        {isGuest && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 220, damping: 20 }}
            className="card"
            style={{ marginTop: 18, textAlign: 'left' }}
          >
            <div style={{ fontSize: 22 }}>{returningGuest ? <PaintedIcon id="streak" /> : '💾'}</div>
            <b style={{ fontSize: 15, display: 'block', marginTop: 2 }}>
              {returningGuest
                ? `Don’t lose your ${outcome.currentStreak}-day streak`
                : 'Save your streak'}
            </b>
            <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>
              {returningGuest
                ? `You’ve come back ${profile.totalPlays} times as a guest. It all lives on this device only — a free account keeps it on any phone.`
                : 'Totally optional — you can keep playing as a guest. A free account carries these to any phone:'}
            </p>
            <SyncStrip streak={outcome.currentStreak} reduceMotion={reduceMotion} />
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <OAuthButtons onError={setSignInErr} />
              <Button variant="ghost" full onClick={() => navigate('/auth?mode=signup')}>
                Use email instead
              </Button>
            </div>
            {signInErr && (
              <p style={{ color: 'var(--coral)', fontSize: 13, marginTop: 8, textAlign: 'center' }}>{signInErr}</p>
            )}
          </motion.div>
        )}

      </div>

      <AnimatePresence>
        {readerOpen && <ChapterReader verse={today} onClose={() => setReaderOpen(false)} />}
      </AnimatePresence>
    </Page>
  )
}

// What an account actually keeps, drawn rather than listed: your streak, your
// Upper Room, and the church you give to — three things a guest can SEE, each
// with the "on any device" fact under it. Optional in tone (the copy above it
// says so) and it adds no wall: the guest's next tap still plays.
function SyncStrip({ streak, reduceMotion }: { streak: number; reduceMotion: boolean }) {
  const items: { art: React.ReactNode; label: string }[] = [
    { art: <StreakFlame days={Math.max(1, streak)} size={22} />, label: `${Math.max(1, streak)}-day streak` },
    { art: <span style={{ fontSize: 26, lineHeight: 1 }}>🕯️</span>, label: 'Your Upper Room' },
    { art: <ChurchArt level={3} size={34} />, label: 'Giving to your church' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
      {items.map((it, i) => (
        <motion.div
          key={it.label}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 + i * 0.1 }}
          style={{
            display: 'grid', justifyItems: 'center', alignContent: 'start', gap: 4, padding: '10px 4px',
            borderRadius: 12, background: 'var(--card-raised)', textAlign: 'center', minWidth: 0,
          }}
        >
          <div style={{ height: 34, display: 'grid', placeItems: 'center' }}>{it.art}</div>
          <b style={{ fontSize: 11.5, lineHeight: 1.25 }}>{it.label}</b>
          <span className="faint" style={{ fontSize: 10.5 }}>synced 📱↔📱</span>
        </motion.div>
      ))}
    </div>
  )
}

function Tile({ label, value, accent, badge }: { label: string; value: string; accent?: string; badge?: string }) {
  return (
    <div className="card" style={{ padding: 12, position: 'relative' }}>
      {badge && (
        <span style={{ position: 'absolute', top: -8, right: -6, background: 'var(--good)', color: '#04210f', fontSize: 10, fontWeight: 900, padding: '2px 6px', borderRadius: 999 }}>{badge}</span>
      )}
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: accent }}>{value}</div>
      <div className="faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}
