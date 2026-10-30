import { useState } from 'react'
import { useJuice } from '@/juice/useJuice'
import type { VerseBackend, WeekDay } from '@/store/churchAdmin'
import { DraftReview, WeekDraftPanel } from './WeekDraftPanel'
import { StudyTopicWeek } from './StudyTopicWeek'
import { AutoWeekCard, useAutoWeeks } from './autoWeek'
import { AutopilotCard, useAutopilot } from './autopilot'
import { AutoPublishToggle, useAutoPublish } from './AutoPublishToggle'

// "Plan your week" — the Plan tab's one drafting flow (2026-10-26).
//
// The planner used to stack four generators: the study-topic fill, "draft a
// week from a sermon", the per-day "draft five questions" and the library fill.
// A pastor reading that column had to work out which one they wanted. It is now
// one flow in three steps:
//
//   1. START FROM — the sermon (the hero, and the default: a pastor's week
//      begins on Sunday), a topic, or one passage. All three are the SAME
//      `church-draft` week call, so the 30-a-day draft allowance, the 10-a-day
//      memo allowance, the long-transcript condense, the server-side save, the
//      refunds and the answer check (0143) behave identically whichever door
//      was used.
//   2. DRAFT — the chosen source's form (`WeekDraftPanel` for sermon and
//      passage, `StudyTopicWeek` for a topic), embedded. All three stay MOUNTED
//      and only the chosen one is shown, so switching source never throws away
//      a transcript or a memo mid-upload.
//   3. REVIEW AND APPROVE — `DraftReview`, unchanged: open a day, reorder,
//      discard, approve the set. A flagged ⚠ day keeps "Approve all" waiting.
//
// AUTOPILOT (0152): `AutopilotCard` sits at the very top — the switch, where
// this week stands, "Skip this week", the cutoff and the fallback. With it on,
// a memo sent from the sermon source queues its week by itself, and a week with
// no memo by the cutoff drafts from the fallback; both land in step 3 as drafts.
//
// RECORD SUNDAY, REVIEW MONDAY (0148): the sermon source can hand the memo to
// the server, which drafts the week by itself. `AutoWeekCard` sits above step
// 1 and says what became of it — drafting, ready (the drafts are in step 3),
// or failed with Retry — and refreshes the planner when the week lands.
//
// Drawn only when the backend carries `draftWeek` (the Content Generation
// package). Without it the Plan tab is the day-by-day form, which is also what
// "Edit one day" opens under this flow — manual entry is never more than a tap
// away.

type Source = 'sermon' | 'topic' | 'passage'

const SOURCES: { key: Source; icon: string; label: string; line: string }[] = [
  { key: 'sermon', icon: '🎙️', label: 'Your sermon', line: 'Record or upload the memo, or paste the transcript. Sunday becomes the week.' },
  { key: 'topic', icon: '🧭', label: 'A topic', line: 'What your congregation is studying — we find the passages.' },
  { key: 'passage', icon: '📖', label: 'One passage', line: 'A week inside one passage, no sermon needed.' },
]

export function PlanWeek({
  churchId,
  backend,
  today,
  week,
  selected,
  onDrafted,
  onChanged,
  onOpenDay,
}: {
  churchId: string
  backend: VerseBackend
  today: string
  /** The planner's window, for the review step. */
  week: WeekDay[] | null
  selected: string
  /** Drafts were saved — reload and open the first. */
  onDrafted: (dates: string[]) => void
  /** Something in the window changed (approve, discard, reorder). */
  onChanged: () => void
  /** Open one day in the day-by-day form. */
  onOpenDay: (date: string) => void
}) {
  const juice = useJuice()
  const [source, setSource] = useState<Source>('sermon')
  const waiting = (week ?? []).some((w) => w.verse?.status === 'draft')
  const auto = useAutoWeeks(churchId, !!backend.autoWeek)
  // Autopilot (0152) rides the same package: its card, its tick, and the memo
  // checkbox below defaulting to it.
  const pilot = useAutopilot(churchId, !!backend.autoWeek, () => { void auto.reload(); onChanged() })
  // Auto-publish (0176): the night-before safety net, beside Autopilot.
  const publish = useAutoPublish(churchId, !!backend.autoWeek)

  return (
    <section aria-label="Plan your week" style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontFamily: 'var(--font-display)' }}>Plan your week</h2>
        <p className="dim" style={{ margin: '2px 0 0', fontSize: 12.5, lineHeight: 1.45 }}>
          Drafts are saved for you to read and approve. Your members see nothing until you do.
        </p>
      </div>

      {backend.autoWeek && <AutopilotCard churchId={churchId} ap={pilot.ap} setAp={pilot.setAp} />}
      {backend.autoWeek && <AutoPublishToggle churchId={churchId} state={publish.state} setState={publish.setState} />}
      {backend.autoWeek && <AutoWeekCard churchId={churchId} jobs={auto.jobs} reload={auto.reload} onLanded={onChanged} />}

      {/* Wide web (≥900px, ChurchAdminScreen's `admin-wide`): steps 1–2 on the
          left and the review on the right. Everywhere else it stacks. */}
      <div className="plan-split">
      <div className="plan-split-main">
      <Step n={1} title="Start from">
        <div role="radiogroup" aria-label="Start from" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
          {SOURCES.map((s) => {
            const on = s.key === source
            const hero = s.key === 'sermon'
            return (
              <button
                key={s.key}
                role="radio"
                aria-checked={on}
                data-source={s.key}
                onClick={() => { juice.select?.(); setSource(s.key) }}
                className="card"
                style={{
                  gridColumn: hero ? '1 / -1' : undefined,
                  display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', cursor: 'pointer',
                  padding: hero ? '12px 14px' : '10px 12px', color: 'inherit', font: 'inherit', minWidth: 0,
                  background: on ? 'var(--select)' : 'var(--card-raised)',
                  borderColor: on ? 'var(--gold)' : 'var(--edge)',
                }}
              >
                <span aria-hidden style={{ fontSize: hero ? 24 : 18, lineHeight: 1.1 }}>{s.icon}</span>
                <span style={{ minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: hero ? 15 : 13.5 }}>{s.label}</b>
                  <span className="dim" style={{ display: 'block', fontSize: 11.5, lineHeight: 1.4, marginTop: 2 }}>{s.line}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Step>

      <Step n={2} title={source === 'sermon' ? 'Draft the week from your sermon' : source === 'topic' ? 'Draft the week from a topic' : 'Draft the week from a passage'}>
        <div hidden={source !== 'sermon'}>
          <WeekDraftPanel churchId={churchId} backend={backend} today={today} source="sermon" embedded onDrafted={onDrafted} onQueued={() => { void auto.reload(); void pilot.reload() }} autopilot={pilot.ap} />
        </div>
        <div hidden={source !== 'topic'}>
          <StudyTopicWeek churchId={churchId} backend={backend} today={today} embedded onDrafted={onDrafted} onChanged={onChanged} />
        </div>
        <div hidden={source !== 'passage'}>
          <WeekDraftPanel churchId={churchId} backend={backend} today={today} source="passage" embedded onDrafted={onDrafted} />
        </div>
      </Step>

      </div>
      <div className="plan-split-side">
      <Step n={3} title="Review and approve">
        {/* Always mounted: once the last draft is approved it still says so. */}
        <DraftReview churchId={churchId} backend={backend} week={week} selected={selected} onOpen={onOpenDay} onChanged={onChanged} />
        {!waiting && (
          <p className="faint" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
            Drafted days land here. Open one to edit it, check anything marked ⚠, then approve the set.
          </p>
        )}
      </Step>
      </div>
      </div>
    </section>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden
          style={{ width: 22, height: 22, borderRadius: 11, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, background: 'var(--card-raised)', border: '1px solid var(--edge)', flexShrink: 0 }}
        >
          {n}
        </span>
        <b style={{ fontSize: 14 }}>{title}</b>
      </div>
      {children}
    </div>
  )
}
