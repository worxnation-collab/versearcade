import { useEffect, useRef, useState } from 'react'
import { useJuice } from '@/juice/useJuice'
import { useSettings } from '@/store/settings'
import { Icon } from '@/data/icons'
import { canSpeak, pickVoice, speakLines, splitForReading, voicesReady, type SpeakHandle } from '@/lib/voice'

// "Listen" — scripture read aloud, wherever scripture is on screen.
//
// The app had a read-aloud for exactly one thing (a generated prayer) and none
// for the text it is actually about, while both apps this one is measured
// against lead a screenshot with an audio player. This is the same engine
// pointed at the verse, as ONE control — the choke-point habit, so the daily
// verse, a game's payoff card and a chapter of the Bible cannot drift into
// three different buttons with three different behaviours.
//
// Four things about it are load-bearing:
//
// - **It fails closed and renders NOTHING.** No SpeechSynthesis at all ⇒ no
//   button, no greyed control, no "coming soon" — the shape `FirstLight` and
//   `WatchYesterday` already have. A device that HAS the API and no installed
//   voices is the nastier case: `speak()` then does nothing at all and reads as
//   a dead button, so that one says so in a line rather than staying silent.
// - **It stops when it leaves.** Cancelled on unmount, so a verse started on a
//   card that scrolls away or a tab you navigate off does not follow you around
//   the app. This is the single worst failure mode a read-aloud has.
// - **It is not a reward and it is not recorded.** No XP, no quest verb, no
//   count of what was listened to, nothing sent anywhere. The words are already
//   on screen; this is a second way to take them in, and it ranks nobody.
// - **The voice is the player's, once.** `settings.readingVoice` is shared with
//   the prayer sheet, because which of the two device voices somebody prefers
//   is a fact about them and not about the screen they are on.
export function ListenButton({
  text,
  label = 'Listen',
  compact,
  style,
}: {
  /** The passage. Split on sentence ends only when it is long — see voice.ts. */
  text: string
  label?: string
  /** Icon only, for a row that already has its own words. */
  compact?: boolean
  style?: React.CSSProperties
}) {
  const juice = useJuice()
  const kind = useSettings((s) => s.readingVoice)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const handle = useRef<SpeakHandle | null>(null)
  // A generation counter rather than a boolean read back out of state: the
  // voice list is awaited between the tap and the first word, and a stop() (or
  // a second tap) inside that window has to win. Reading `playing` back with a
  // setState updater would NOT work — React 18 runs those at render time, not
  // synchronously — which is the kind of thing that looks fine until a slow
  // Android voice list makes the gap long enough to hit.
  const run = useRef(0)

  // Cancel on unmount, always — including while it is mid-sentence.
  useEffect(() => () => handle.current?.cancel(), [])

  if (!canSpeak()) return null

  const stop = () => {
    run.current += 1
    handle.current?.cancel()
    handle.current = null
    setPlaying(false)
  }

  const start = async () => {
    juice.select?.()
    setFailed(false)
    setPlaying(true)
    const mine = ++run.current
    // The voice list is empty on the first call in Chrome and Android and
    // arrives asynchronously — asking for it here rather than at mount means
    // the button works on the first tap of a cold page.
    const voices = await voicesReady()
    if (run.current !== mine) return
    handle.current = speakLines(splitForReading(text), {
      voice: pickVoice(kind, voices),
      onDone: () => { handle.current = null; setPlaying(false) },
      onFail: () => { handle.current = null; setPlaying(false); setFailed(true) },
    })
  }
  return (
    <>
      <button
        className="pill"
        onClick={playing ? stop : start}
        aria-label={playing ? 'Stop reading' : 'Read this aloud'}
        style={{
          gap: 7,
          color: playing ? 'var(--gold)' : 'var(--ink)',
          borderColor: playing ? 'var(--edge)' : undefined,
          ...style,
        }}
      >
        <Icon id="listen" size={14} />
        {!compact && (playing ? 'Stop' : label)}
      </button>
      {failed && (
        <p className="faint" style={{ fontSize: 11.5, margin: '6px 0 0', lineHeight: 1.4, width: '100%' }}>
          Read-aloud isn’t available on this device — the words are all here to read.
        </p>
      )}
    </>
  )
}
