import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { useSettings } from '@/store/settings'
import { usePrayer } from '@/store/prayer'
import { useRoom } from '@/store/room'
import { roomPlacedTier } from '@/data/room'
import { CALM, LINE_PAUSE_MS, VOICE_KINDS, pickVoice, voicesReady, type VoiceKind } from '@/lib/voice'
import {
  MOVEMENTS,
  PRAYER_XP,
  OCCASIONS,
  buildPrayer,
  occasionById,
  prayerText,
  type Occasion,
  type Prayer,
} from '@/data/prayers'

// A practice prayer, in the one room in this app that belongs to one person.
//
// See data/prayers.ts for the design. The two things this surface has to get
// right, both of them about a person who is nervous:
//
//   IT NEVER WAITS FOR YOU. There is no "your turn", no microphone, no pause
//   for you to fill. It offers a prayer, you read it or listen to it, and that
//   is the whole interaction. A gap where somebody is expected to speak is
//   exactly the moment this feature is meant to remove.
//
//   THE SHAPE IS VISIBLE, AND OPTIONAL. "Show the shape" labels the four
//   movements, because the fear is usually of not knowing what comes next
//   rather than of the words themselves. It is off by default — a first-time
//   reader should meet a prayer, not a diagram — and remembered once turned on.
//
// SAYING AMEN IS WHAT RECORDS IT. Reading is invisible, so there has to be one
// deliberate act — and "Amen" is the act, not a Done button wearing a costume.
// Three a day pay 10 XP each (0073); the fourth is still a prayer and the sheet
// says so warmly rather than refusing. The count is never shown as a score to
// beat, and there is no Journal ladder for it.

export function PrayerSheet({ onClose }: { onClose: () => void }) {
  const juice = useJuice()
  const showShape = useSettings((s) => s.prayerShowShape ?? false)
  const voiceKind = useSettings((s) => s.prayerVoice ?? 'female')
  const setSettings = useSettings((s) => s.set)

  // The device's voices, loaded once. getVoices() is empty on the first call in
  // Chrome and Android — see lib/voice.ts — so this waits for voiceschanged
  // rather than believing an empty array.
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    let alive = true
    void voicesReady().then((v) => { if (alive) setVoices(v) })
    return () => { alive = false }
  }, [])

  const [occasion, setOccasion] = useState<Occasion | null>(null)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [speaking, setSpeaking] = useState(false)
  const [spokenLine, setSpokenLine] = useState(-1)
  // Whether THIS prayer has been said. Keyed off the seed so "another one"
  // arms the button again without a separate reset.
  const [saidSeed, setSaidSeed] = useState<number | null>(null)
  const [recording, setRecording] = useState(false)
  const [reward, setReward] = useState<string | null>(null)
  const todayCount = usePrayer((s) => s.today)
  const cap = usePrayer((s) => s.cap)
  // Whether there is a lampstand out to light. Said only on the prayer that
  // actually lights it, and only if the player has one in the room — telling
  // somebody their lamp is lit when there is no lamp is a lie about their own
  // room.
  const hasLamp = useRoom((s) => roomPlacedTier(s.placements, 'room_lampstand') > 0)

  useEffect(() => {
    void usePrayer.getState().load()
  }, [])

  const prayer: Prayer | null = occasion ? buildPrayer(occasion, seed) : null

  // Speech has to stop when this closes, when the prayer changes, and when the
  // tab goes away — a voice still talking after the sheet is gone is the worst
  // possible bug for this particular feature.
  const pauseRef = useRef<number | undefined>(undefined)

  const stop = useCallback(() => {
    if (pauseRef.current) { clearTimeout(pauseRef.current); pauseRef.current = undefined }
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* no speech synthesis here — the Listen button is hidden anyway */
    }
    setSpeaking(false)
    setSpokenLine(-1)
  }, [])

  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => () => stopRef.current(), [])
  useEffect(() => {
    const onHide = () => stopRef.current()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { stop(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, stop])

  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window
  const said = saidSeed === seed

  /**
   * Read it aloud, one line at a time.
   *
   * Line by line rather than one long utterance, because `boundary` events are
   * unreliable across browsers (Safari fires them sparsely or not at all) and
   * the whole point is that the line you can hear is the line lit up. Chaining
   * on `onend` is the one signal every engine actually sends.
   */
  const speak = (p: Prayer) => {
    if (!canSpeak) return
    window.speechSynthesis.cancel()
    setSpeaking(true)
    const chosen = pickVoice(voiceKind, voices)
    let i = 0
    const next = () => {
      if (i >= p.lines.length) { setSpeaking(false); setSpokenLine(-1); return }
      const idx = i++
      setSpokenLine(idx)
      const u = new SpeechSynthesisUtterance(p.lines[idx].text)
      // Calm for both options, and the chosen voice where the device has one.
      // Leaving `voice` unset is not a failure — the engine uses its default.
      //
      // Guarded because the setter THROWS SYNCHRONOUSLY on anything that isn't
      // a live SpeechSynthesisVoice, and a voice list can go stale under you
      // (the engine restarts, the user installs or removes one). Unguarded,
      // that takes the whole read-aloud down with an uncaught TypeError instead
      // of just reading in the default voice.
      try {
        if (chosen) { u.voice = chosen; u.lang = chosen.lang }
      } catch {
        /* stale or foreign voice object — the engine's default is fine */
      }
      u.rate = CALM.rate
      u.pitch = CALM.pitch
      // A beat between lines, so a prayer breathes instead of running on. The
      // timer is cleared by stop() through cancel(), which fires onerror with
      // `interrupted` — hence the guard there.
      u.onend = () => { pauseRef.current = window.setTimeout(next, LINE_PAUSE_MS) }
      u.onerror = (e) => {
        setSpeaking(false)
        setSpokenLine(-1)
        // A device can have the API and no voices at all — every headless
        // browser does, and so do some locked-down phones. Then `speak()`
        // fires synthesis-failed and NOTHING happens, which reads as a dead
        // button. Say so instead. `interrupted` and `canceled` are us calling
        // stop(), so they are not failures.
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          setReward('Read-aloud isn’t available on this device — the words are all here to read.')
        }
      }
      window.speechSynthesis.speak(u)
    }
    next()
  }

  const again = () => {
    stop()
    juice.select()
    setReward(null)
    setSeed(Math.floor(Math.random() * 1e9))
  }

  /**
   * Say amen.
   *
   * Over the cap this still succeeds and simply pays nothing — the server
   * returns ok with awarded 0 (0073), and the line under the button says the
   * warm version of that. A prayer is never an error and this sheet must never
   * draw one.
   */
  const amen = async () => {
    if (saidSeed === seed || recording) return
    setRecording(true)
    const res = await usePrayer.getState().record()
    setRecording(false)
    if (!res.ok) {
      setReward('That didn’t save, but it still counted where it matters.')
      setSaidSeed(seed)
      return
    }
    setSaidSeed(seed)
    if (res.awarded > 0) {
      if (res.leveledUp) juice.celebrate()
      else juice.coin()
      setReward(
        res.today === 1 && hasLamp
          ? `Amen. +${res.awarded} XP — the lamp in your room is lit.`
          : `Amen. +${res.awarded} XP — ${Math.max(0, res.cap - res.today)} more today.`,
      )
    } else {
      juice.select()
      setReward('Amen. That’s all three for today — the rest are just between you and God.')
    }
  }

  const choose = (id: Occasion) => {
    stop()
    juice.select()
    setSeed(Math.floor(Math.random() * 1e9))
    setOccasion(id)
  }

  if (typeof document === 'undefined') return null
  const def = occasion ? occasionById(occasion) : null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="pray-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => { stop(); onClose() }}
        style={{
          position: 'fixed',
          inset: 0,
          // The app's sheet tier. Opened from a page rather than from the
          // player card, so it sits at 100 like the keep and church sheets.
          zIndex: 100,
          background: 'rgba(8,3,24,0.78)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 520,
            maxHeight: '88dvh',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            background: 'var(--bg-1)',
            borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
            border: '1px solid var(--stroke)',
            borderBottom: 'none',
            padding: '14px 14px calc(var(--safe-bottom) + 20px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, flex: 1, minWidth: 0 }}>
              🙏 Pray
            </b>
            <button className="pill" onClick={() => { stop(); juice.select(); onClose() }} aria-label="Close">✕</button>
          </div>

          {!prayer ? (
            <>
              <p className="dim" style={{ fontSize: 13.5, margin: '0 0 14px', lineHeight: 1.6 }}>
                Read along or listen closely to this practice prayer. There is nothing to get right
                here — no one is listening but God, and nothing you do on this screen is saved,
                counted or shown to anybody.
              </p>
              <p className="faint" style={{ fontSize: 12, margin: '0 0 10px' }}>
                What’s it about?
                {todayCount < cap && (
                  <>
                    {' · '}
                    {cap - todayCount} of {cap} left today, {PRAYER_XP} XP each
                  </>
                )}
              </p>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                {OCCASIONS.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => choose(o.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      textAlign: 'left',
                      padding: '11px 12px',
                      borderRadius: 12,
                      background: 'var(--card-solid)',
                      border: '1px solid var(--stroke)',
                      cursor: 'pointer',
                      color: 'var(--ink)',
                    }}
                  >
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{o.emoji}</span>
                    <span style={{ minWidth: 0 }}>
                      <b style={{ display: 'block', fontSize: 13.5 }}>{o.label}</b>
                      <span className="faint" style={{ fontSize: 11, lineHeight: 1.35 }}>{o.blurb}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="dim" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>
                Read along or listen closely to this practice prayer.
              </p>

              <div
                className="card"
                style={{ marginBottom: 12, padding: '16px 16px 14px' }}
              >
                <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  {def?.emoji} {def?.label}
                </div>
                {prayer.lines.map((l, i) => (
                  <div key={`${l.movement}-${i}`} style={{ marginBottom: 12 }}>
                    {showShape && (
                      <div className="faint" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                        {MOVEMENTS.find((m) => m.key === l.movement)?.label}
                      </div>
                    )}
                    <p
                      style={{
                        margin: 0,
                        fontSize: 17,
                        lineHeight: 1.62,
                        // The line being spoken lights up. Colour AND weight,
                        // never colour alone — the chart rule applies to text.
                        color: spokenLine === i ? 'var(--gold)' : 'var(--ink)',
                        fontWeight: spokenLine === i ? 700 : 400,
                        transition: 'color 0.2s',
                      }}
                    >
                      {l.text}
                    </p>
                  </div>
                ))}
              </div>

              {/* Amen — the one deliberate act, and what records the prayer.
                  Full width and first, because it is the end of the thing you
                  came here to do; everything under it is a second lap. */}
              <button
                onClick={() => void amen()}
                disabled={said || recording}
                style={{
                  width: '100%',
                  padding: '13px 16px',
                  borderRadius: 999,
                  border: `1px solid ${said ? 'var(--good)' : 'var(--gold)'}`,
                  background: said ? 'transparent' : 'var(--gold)',
                  color: said ? 'var(--good)' : '#2b1a00',
                  fontFamily: 'var(--font-display)',
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: said || recording ? 'default' : 'pointer',
                  marginBottom: 10,
                }}
              >
                {recording ? '…' : said ? '✓ Amen' : 'Amen'}
              </button>

              {reward && (
                <p
                  className="center"
                  style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}
                >
                  {reward}
                </p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: canSpeak ? '1fr 1fr' : '1fr', gap: 10 }}>
                {canSpeak && (
                  <button
                    className="pill"
                    onClick={() => (speaking ? stop() : speak(prayer))}
                    style={{ fontWeight: 800, fontSize: 13, padding: '11px 14px' }}
                  >
                    {speaking ? '⏹ Stop' : '🔊 Listen'}
                  </button>
                )}
                <button
                  className="pill"
                  onClick={again}
                  style={{ fontWeight: 800, fontSize: 13, padding: '11px 14px' }}
                >
                  ↻ Another one
                </button>
              </div>

              {/* Which voice reads it. Two options rather than a list of the
                  device's twenty: this is a comfort setting, not a synth. The
                  labels say what they sound like rather than naming a gender
                  the API doesn't actually expose — see lib/voice.ts. */}
              {canSpeak && voices.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <span className="faint" style={{ fontSize: 11.5, fontWeight: 700 }}>Voice</span>
                  {VOICE_KINDS.map((v) => {
                    const on = voiceKind === v.id
                    return (
                      <button
                        key={v.id}
                        className="pill"
                        onClick={() => {
                          stop()
                          juice.select()
                          setSettings({ prayerVoice: v.id as VoiceKind })
                        }}
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          borderColor: on ? 'var(--gold)' : undefined,
                          color: on ? 'var(--gold)' : undefined,
                        }}
                      >
                        {on ? '✓ ' : ''}{v.label}
                      </button>
                    )
                  })}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <button
                  className="pill"
                  onClick={() => { juice.select(); setSettings({ prayerShowShape: !showShape }) }}
                  style={{ fontSize: 12, fontWeight: 800 }}
                >
                  {showShape ? '✓ Showing the shape' : 'Show the shape'}
                </button>
                <button
                  className="pill"
                  onClick={() => { stop(); juice.select(); setOccasion(null) }}
                  style={{ fontSize: 12, fontWeight: 800 }}
                >
                  Something else
                </button>
              </div>

              <p className="faint" style={{ fontSize: 11.5, margin: '14px 0 0', lineHeight: 1.55 }}>
                These are practice words, not a script — swap any line for your own the moment you
                want to. Nothing here is counted or kept.
              </p>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
