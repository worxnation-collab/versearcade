// Pure, and in a file of its own so `npm run build` can check it in
// milliseconds rather than bundling the whole voice library (and, through
// its dynamic import of the listener, onnxruntime) to reach one function.
// Re-exported from `tiktokVoice`, which is where callers look for it.

/**
 * A verse take's text with the READING taken off the front.
 *
 * `refit` fits a correction onto `track.heard`, and on a verse take that is
 * the THOUGHT half alone — the reading has its own timings, matched against
 * the verse's known words by `splitRecording`. So a correction carrying BOTH
 * halves has nowhere to put the reading, and `fitWords` spreads it over the
 * thought instead: a real batch put 80 words onto ten seconds of audio at
 * 0.04s a word, which renders as a strobe of scripture over a hook and
 * reports a perfectly sensible word count. Nothing throws and the parked file
 * looks complete; only reading the timings shows it.
 *
 * The batch splitter is what hands both halves over, and it is right to: the
 * sitting's own transcript heard each take with the sentences either side of
 * it, which beats hearing a 25-second clip alone (that loses the tail and
 * keeps the spoken marker). So the trimming belongs here, at the one place
 * that knows what the verse is.
 *
 * It fails CLOSED, three ways, because the alternative is eating somebody's
 * words: the reading must be MOSTLY there (60% of the verse's words, in
 * order), it must be DENSE at the front rather than scattered incidental
 * matches, and something has to be left after it. A take that is pure hook —
 * the shape this format is moving to — matches a handful of short words and
 * is returned untouched.
 */
export function dropVerse(text: string, verseText: string): string {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '')
  const said = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const verse = verseText.trim().split(/\s+/).filter(Boolean).map(norm).filter(Boolean)
  if (!said.length || !verse.length) return text
  // Bounded to roughly where a reading of this verse can still be running, so
  // a "Christ" or a "me" late in the hook cannot drag the cut into it.
  const limit = Math.min(said.length, Math.ceil(verse.length * 1.6) + 8)
  // The walk SKIPS, and that is the whole of it. A strict in-order match
  // ends at the first word Whisper got wrong or the reader dropped, and on a
  // real week that was four takes of seven: "Solomon my son" heard as
  // "solemn in my son" stalled at the verse's FOURTH word and matched 6% of
  // it; "responsively" heard as "responsibly" did the same to Ezra; a verse
  // whose text reads "gave Himself up for me" against a reader who said
  // "gave Himself for me" stopped three words from the end and left "for
  // me." on the front of the hook; and "ever-flowing" is one token in the
  // pool and two out of Whisper. None of those is a take that failed to
  // contain its reading — they are one substitution each. So a said word may
  // match any of the next few verse words, and a verse word nothing said may
  // be passed over.
  const LOOK = 4
  let v = 0
  let matched = 0
  let cut = 0
  for (let i = 0; i < limit && v < verse.length; i++) {
    const t = norm(said[i])
    if (!t) continue
    for (let k = v; k < Math.min(verse.length, v + LOOK); k++) {
      if (verse[k] !== t) continue
      v = k + 1; matched++; cut = i + 1
      break
    }
  }
  // Mostly there, densely, with a thought left over. Each of the three
  // refuses a different way of being wrong, and all three have to hold.
  if (matched < verse.length * 0.6) return text
  if (cut >= said.length) return text
  if (matched / cut < 0.6) return text
  return said.slice(cut).join(' ')
}
