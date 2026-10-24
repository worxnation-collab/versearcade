import { TRANSCRIPT_DIRECT_MAX, TRANSCRIPT_SEND_MAX, type TranscriptUse } from '@/store/churchAdmin'

// What the three drafting forms (TodayVerseForm, WeekDraftPanel,
// StudyTopicWeek) say about a pasted sermon, in one place so they can't drift.
// The rule: a transcript is never cut without the leader being told. Under the
// box, BEFORE drafting, the meter says what will happen to a long paste; after
// drafting, `transcriptNote` says what actually did, from the function's own
// answer — a condense that failed is named, not glossed.

const n = (x: number) => x.toLocaleString()

/** The live count and, for a long paste, what will happen to it. */
export function TranscriptMeter({ value }: { value: string }) {
  const len = value.trim().length
  if (!len) return null
  const text =
    len <= TRANSCRIPT_DIRECT_MAX
      ? `${n(len)} characters.`
      : len <= TRANSCRIPT_SEND_MAX
        ? `${n(len)} characters — we’ll condense the whole thing to its key points, in order, before drafting, so the end of the sermon counts as much as the start.`
        : `${n(len)} characters. We’ll condense the first ${n(TRANSCRIPT_SEND_MAX)} (about an hour of speech) to its key points before drafting; the last ${n(len - TRANSCRIPT_SEND_MAX)} won’t be considered.`
  return (
    <span
      className={len > TRANSCRIPT_DIRECT_MAX ? 'dim' : 'faint'}
      style={{ fontSize: 11.5, lineHeight: 1.4, marginTop: -4 }}
      aria-live="polite"
    >
      {text}
    </span>
  )
}

/** One sentence on what the draft actually drew on, or '' when there's nothing to say. */
export function transcriptNote(sent: string, use?: TranscriptUse, read?: number): string {
  const len = Math.min(sent.trim().length, TRANSCRIPT_SEND_MAX)
  if (!len || !use || use === 'full') return ''
  if (use === 'condensed') {
    return sent.trim().length > TRANSCRIPT_SEND_MAX
      ? ` The first ${n(TRANSCRIPT_SEND_MAX)} characters of your sermon were condensed to their key points before drafting.`
      : ` Your whole sermon was condensed to its key points before drafting.`
  }
  return ` We couldn’t condense your sermon this time, so only its first ${n(read ?? TRANSCRIPT_DIRECT_MAX)} characters steered these drafts — draft again to use all of it.`
}
