// Choosing a calm reading voice.
//
// WHAT IS AND ISN'T POSSIBLE HERE, because it shapes everything below.
//
// The app can't ship a voice. Recording one means audio files, and the whole
// soundtrack exists as note data for exactly that reason (juice/music.ts: "no
// files to ship, cache or license") — a growing prayer set read aloud would be
// tens of megabytes inside an IPA and re-recorded every time a line changed.
// A cloud TTS API is worse for this feature specifically: it would mean sending
// what somebody is praying to a third party.
//
// So this uses the device's own voices (SpeechSynthesis) and PICKS WELL from
// them, which is genuinely most of the way there — iOS and Android both ship
// good natural ones. The trade is that quality varies by device and a device
// with no voices at all gets an honest message instead.
//
// GENDER IS NOT IN THE API. `SpeechSynthesisVoice` exposes name, lang, and
// nothing else — so the two options are resolved by a ranked list of the voices
// each platform actually ships, falling back to name matching, then to whatever
// English voice exists. A device that has only one voice gets that one for both
// options rather than an empty picker.

export type VoiceKind = 'female' | 'male'

export const VOICE_KINDS: { id: VoiceKind; label: string }[] = [
  { id: 'female', label: 'Softer' },
  { id: 'male', label: 'Deeper' },
]

// Ranked, best first, per platform. These are the names Apple, Google and
// Microsoft actually ship; anything not present is skipped, so the list can
// safely name voices this device has never heard of.
const PREFERRED: Record<VoiceKind, string[]> = {
  female: [
    // iOS / macOS — enhanced ones first, they are markedly warmer.
    'Ava (Premium)', 'Ava (Enhanced)', 'Samantha', 'Ava', 'Allison', 'Susan', 'Karen', 'Moira', 'Fiona', 'Serena',
    // Android / Chrome
    'Google US English', 'Google UK English Female', 'en-us-x-tpf-local', 'en-gb-x-rjs-local',
    // Windows
    'Microsoft Aria Online (Natural) - English (United States)', 'Microsoft Zira - English (United States)', 'Microsoft Jenny Online (Natural) - English (United States)',
  ],
  male: [
    'Tom (Premium)', 'Tom (Enhanced)', 'Daniel', 'Tom', 'Alex', 'Aaron', 'Oliver', 'Rishi',
    'Google UK English Male', 'en-us-x-tpd-local', 'en-gb-x-gbb-local',
    'Microsoft Guy Online (Natural) - English (United States)', 'Microsoft David - English (United States)',
  ],
}

// Last resort when nothing in the ranked list is installed: match on the given
// name inside the voice's name. Deliberately short — a wrong guess here is a
// voice that sounds unlike its label, which is better than no voice at all.
const NAME_HINTS: Record<VoiceKind, string[]> = {
  female: ['female', 'samantha', 'ava', 'karen', 'moira', 'fiona', 'zira', 'aria', 'jenny', 'serena', 'allison', 'susan', 'joanna', 'salli', 'emma'],
  male: ['male', 'daniel', 'alex', 'tom', 'aaron', 'oliver', 'david', 'guy', 'james', 'fred', 'rishi', 'matthew', 'brian'],
}

/**
 * The device's voices, once they exist.
 *
 * `getVoices()` is empty on the first call in Chrome and Android — the list
 * arrives asynchronously and announces itself with `voiceschanged`. Calling it
 * once and believing the empty array is the classic way to ship a voice picker
 * that is blank on every Android phone.
 */
export function voicesReady(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return resolve([])
    const now = window.speechSynthesis.getVoices()
    if (now.length) return resolve(now)

    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.speechSynthesis.removeEventListener('voiceschanged', finish)
      resolve(window.speechSynthesis.getVoices())
    }
    window.speechSynthesis.addEventListener('voiceschanged', finish)
    // Some engines never fire it. Give up rather than hang the button forever.
    setTimeout(finish, timeoutMs)
  })
}

/** The best available voice for this option, or null when the device has none. */
export function pickVoice(kind: VoiceKind, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'))
  const pool = english.length ? english : voices

  for (const name of PREFERRED[kind]) {
    const hit = pool.find((v) => v.name === name)
    if (hit) return hit
  }
  const hinted = pool.find((v) => NAME_HINTS[kind].some((h) => v.name.toLowerCase().includes(h)))
  if (hinted) return hinted

  // Nothing identifiable. A local voice beats a network one — it starts
  // instantly and doesn't leave the device, which matters here.
  return pool.find((v) => v.localService) ?? pool[0]
}

/**
 * Calm, for both options.
 *
 * Slower and slightly lower than default: this is being read WITH somebody, not
 * announced at them. The numbers are conservative because the engines differ —
 * below about 0.8 several of them start slurring rather than sounding gentle.
 */
export const CALM = { rate: 0.84, pitch: 0.92 } as const

/** How long to leave between lines, so a prayer breathes instead of running on. */
export const LINE_PAUSE_MS = 420

// ── Reading scripture aloud ────────────────────────────────────────────────
//
// The prayer sheet had the only read-aloud in the app, and its mechanics were
// written inside that component — which was right while there was one caller
// and is the drift the `QuizRunner` rule exists to prevent now that there are
// several. `speakLines` is that logic lifted out unchanged in behaviour, and
// `ListenButton` (components/ListenButton.tsx) is the one control.
//
// Two things about reading SCRIPTURE rather than a prayer:
//
// - **A verse is read whole.** A prayer is four movements and the line you can
//   hear is meant to be the line lit up, so it is chained one line at a time.
//   A verse is one sentence and chopping it at commas makes it sound like a
//   list. `splitForReading` only breaks on sentence ends, and only past a
//   length where a single utterance starts to be refused by some engines.
// - **It stops when you leave.** A prayer sheet closing cancels it; a verse can
//   be started on a card that scrolls away, so every caller cancels on unmount.
//   A voice that follows somebody to another tab is the worst version of this.

/** Break a passage for reading: sentence ends only, and only when it is long. */
export function splitForReading(text: string, softLimit = 220): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= softLimit) return [clean]
  const parts: string[] = []
  let buf = ''
  for (const piece of clean.split(/(?<=[.!?;])\s+/)) {
    if (buf && (buf + ' ' + piece).length > softLimit) { parts.push(buf); buf = piece }
    else buf = buf ? `${buf} ${piece}` : piece
  }
  if (buf) parts.push(buf)
  return parts
}

export interface SpeakHandle {
  /** Stop and forget. Safe to call any number of times, including unmounted. */
  cancel: () => void
}

/**
 * Read lines aloud in order, calling back as each starts and when it all ends.
 *
 * Chained on `onend` rather than on `boundary`: Safari fires boundary events
 * sparsely or not at all, and `onend` is the one signal every engine actually
 * sends. Returns a handle rather than a promise so a caller can stop it.
 */
export function speakLines(
  lines: string[],
  opts: {
    voice?: SpeechSynthesisVoice | null
    pauseMs?: number
    onLine?: (index: number) => void
    onDone?: () => void
    /** A real failure — not us calling cancel(). A device can have the API and
     *  no voices at all, and then speak() does nothing and reads as a dead
     *  button, so callers are told rather than left silent. */
    onFail?: () => void
  } = {},
): SpeakHandle {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  if (!synth || lines.length === 0) {
    opts.onDone?.()
    return { cancel: () => {} }
  }
  let stopped = false
  let timer: number | undefined
  let i = 0

  const finish = () => { if (!stopped) { stopped = true; opts.onDone?.() } }
  const next = () => {
    if (stopped) return
    if (i >= lines.length) return finish()
    const idx = i++
    opts.onLine?.(idx)
    const u = new SpeechSynthesisUtterance(lines[idx])
    // The setter THROWS SYNCHRONOUSLY on anything that is not a live
    // SpeechSynthesisVoice, and a voice list goes stale under you when the
    // engine restarts or the user installs one. Unguarded that takes the whole
    // read-aloud down instead of falling back to the engine's default.
    try {
      if (opts.voice) { u.voice = opts.voice; u.lang = opts.voice.lang }
    } catch { /* stale or foreign voice object — the default is fine */ }
    u.rate = CALM.rate
    u.pitch = CALM.pitch
    u.onend = () => { timer = window.setTimeout(next, opts.pauseMs ?? LINE_PAUSE_MS) }
    u.onerror = (e) => {
      if (stopped) return
      // `interrupted` and `canceled` are us calling cancel().
      if (e.error !== 'interrupted' && e.error !== 'canceled') { stopped = true; opts.onFail?.() }
      else stopped = true
    }
    synth.speak(u)
  }
  next()
  return {
    cancel: () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
      try { synth.cancel() } catch { /* nothing playing */ }
    },
  }
}

/** Does this device have the API at all? Callers render nothing when it does not. */
export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}
