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
