# The shared verse and the congregation's numbers

This is the **verified-church layer**: migration `0119`, applied on 2026-10-14.
It sits on top of the free church system (join, give, boards, pages, claims,
skins, the sponsored slot, the yard and the rivalry), and none of that changes.
Whether a church is "verified" is set by an operator with
`admin_set_church_package` (0116), and the money is handled off the device.
Players never see a price, a checkout, an upgrade line or a paid badge. That is
the same pattern skins and promotions follow.

## The shared verse

- **`church_verses`** holds one row per `(church_id, drop_date)`: a reference,
  the text, and **five questions** in the client's `Question` shape. RLS is on
  and there is **no policy**, so nothing can read or write the table directly.
- **`set_church_verse(church, date, reference, text, questions)`** saves a
  verse. It refuses anyone who isn't leadership of a *verified* church
  (`church_admin_can`, 0118).
  - It validates each question with `church_clean_questions`: a 1–300 character
    prompt, 2–4 distinct options, an integer `answerIndex` in range, and a
    1–400 character teach line. It stores a normalised copy, so extra keys are
    dropped.
  - Dates run from yesterday to a year ahead.
  - Saving the same day twice replaces the first save.
- **Since 0128 the church verse is its OWN lane, never the daily drop.**
  Everybody, members included, plays the global verse. A member of a verified
  church that set one for today also gets:
  - `my_church_verse(date)` — the verse, their own result, and their progress
    through its series. Null with no church, an unverified church, nothing set,
    or a date outside ±1 day.
  - `/play/church` (`ChurchVerseScreen`) — its own `QuizRunner` run with runId
    `church:<church>:<date>`, recorded by `submit_church_verse_play` in
    `church_verse_plays` (once per day, no XP).
  - `ChurchVerseBox` on the Play tab, the third box under the drop and trivia,
    and the church-verse card on the Church tab (`ChurchLife`).
- **`get_effective_verse(date)` now always returns null.** It used to make the
  church verse stand in for the drop (`churchVerseOr` in `store/game.ts`, now
  gone). The signature is kept because approved iOS builds still call it — null
  is "play the global verse" to that code, so they separate too.
- **Admin UI:** `/church/:id/admin` → **Today's verse** (`TodayVerseForm`).
  - It loads whatever is already set for the chosen date, so leaders edit it
    rather than overwrite it.
  - When the arcade's library has the verse, one tap fills in its five
    questions as a starting point.
  - **The week planner** sits above the form: seven day chips, each marked
    set or not, tapping one edits it, with ‹ › to step a week. After a save,
    one tap copies the verse to that window's other EMPTY days through the
    same `set_church_verse`. It re-reads each day just before writing, so a
    day already set is never overwritten. "Mix the order" (on by default)
    deals each copy's questions and options in a date-seeded order
    (`mixForDate`), with `answerIndex` remapped.
  - **Verified leadership sees one line on their own church card**
    (`WeekGapLine`): how many of the next seven days play the global verse.
    It is a fact about the schedule, never about a person, and it renders
    nothing once the week is covered.

## Series and notes (0123)

Pastors plan by the series, not only by the day. Migration `0123` adds two
optional, plain-text, length-capped columns to `church_verses`, and the planner
is built around them.

- **`series`** (60 chars) — a name for a run of days: "John 15–17", "Advent".
- **`note`** (280 chars) — a line from the pastor, shown to members beside that
  day's verse on the Play tab (`ChurchWindow`). That day only, members only:
  it travels through `get_effective_verse`, which already refuses anyone outside
  the church and any date outside ±1 day.
- Both are written by **`set_church_verse_extras(church, date, series, note)`**,
  for a day that already has a verse (`no_verse` otherwise), gated by the same
  `church_admin_can` as the verse. `set_church_verse` is untouched and is still
  the only verse write. NULL leaves a field as it is; `''` clears it. Text is
  cleaned by `church_clean_line` ↔ `cleanLine` (control characters become a
  space, trimmed, capped) — keep them in sync.
- **`church_verses_range(church, from, days ≤ 42)`** reads the planner's window
  in one call. A server without 0123 falls back to one `church_verse_for` per day,
  and a failed extras write still saves the verse and says the note didn't.

**The planner** (`TodayVerseForm`):

- **Three weeks at once** (21 day chips, ‹ › moves a week). ✓ marks a day with
  the church's verse, ✉ one with a note, and a bar along the top a day filed
  under a series. Under the strip, each run of a series is listed by date
  range ("Advent · Nov 30 – Dec 6"). An empty day right after a day in a series
  has that series name pre-filled.
- **Copying across a series** (`SeriesCopyPanel`), after a save: the leader picks
  a "through" date (default: one week; at most 42 days). Before anything is
  written, the panel lists every day in the run that **already has a verse**, by
  date and reference. Those are left alone unless ticked one by one, and the
  button says what will happen ("Copy to 3 days and replace 1"). `fillDays`
  re-reads each day just before writing. It writes an empty day only if it is
  still empty, and a ticked day only if it still holds the reference that was on
  screen, so a stale screen can never overwrite another leader's day. Copies
  carry the series name and **clear the note**, because a note is about its own
  day. "Mix the order" still works as before.
- **"This week we're in …" on the church page.** After saving a day in a series,
  one tap writes `This week we're in <series>` to the page's "This week" line
  (0120) through **`set_church_this_week`**. That RPC writes that column only.
  `update_my_church_profile` would overwrite every other page field with
  whatever was sent. It is a deliberate tap, not automatic: the series stays
  private to leadership until they choose to publish it.
- **On the leadership card**, `WeekGapLine` leads with today's series ("This
  week: Advent") and stays visible while one is running, even once the week is
  covered.

Nothing here is about a person. A series and a note describe the schedule; no
count, no reader list, no "seen by".

**The demo** (`/churches/try`) seeds its `memoryVerseBackend` with a sample
three-day series ("Abiding (John 15)", from the library, one day with a note),
so the strip, the copy panel's replace list and the page line all have
something to show. The memory backend implements `range` and `setThisWeek`, so
none of the planner's actions reach the server. Checked by driving it with a
configured Supabase URL: saving, copying, replacing and the page line made
**zero** requests. The only requests on that page are the app shell's own
page-load reads (`content_catalog`, `list_buddies`, `list_buddy_requests`).
They are identical on the commit before this change.

## The congregation's numbers (0128: names included)

`church_leader_insights(church, date)` replaced `get_church_participation` on the
dashboard. It returns members, active this week, quiet, fourteen days of drop and
church-verse players, each series' completion, streak buckets, the live notice,
and the roster BY NAME — the owner's call (see docs/CHURCH-CLAIM.md). There is no
small-count floor for leadership any more. The roster is in join order and
never sorted by play; members with no play in seven days are folded into one
section where the only action is a hand-sent check-in (0137/0138).
`get_church_participation` is now unused: `ParticipationPanel` was deleted on
2026-10-23 and the public demo (`/churches/try`) draws the real `OverviewPanel`
and `PeoplePanel` over a sample congregation instead, so the demo and the sales
page show what leadership actually gets.

`church_feed(church)` is the activity feed: drop and church-verse plays with
scores, gifts, joins and notices from the last fourteen days, to members and
leadership of that verified church.

## What 0119 replaced

On the same unmerged branch, 0116/0118 had shipped two things this layer
replaces:

- **A windowed verse model** (`starts_on`/`ends_on`, no questions, playable only
  for verses already in the pool).
- **An opt-in "who's been away" list.**

Both were empty in production. The old table was **renamed** to
`church_verses_0116` rather than dropped, and the retired RPCs were **revoked**
from every client role rather than dropped. The reason is that the Supabase MCP
hangs on `DROP`/`DELETE`/`CREATE POLICY` from a cloud session. Dropping the
leftovers is a safe cleanup for the SQL editor later:

- `church_verses_0116`
- `schedule_church_verse`
- `list_church_verses`
- `church_participation_7d`
- `church_admin_overview`
- `church_care_list`
- `set_church_care_optin`
- `profiles.church_care_optin`

## Drafting the questions (0122, `church-draft`)

Inside **Edit one day**, under the verse, leadership gets **"✨ Draft five
questions from this passage"**. It works for any reference, not only the library's 726 verses.

- **Server-side.** The `church-draft` Edge Function asks Gemini. The key is
  `GEMINI_API_KEY` or Vault `tiktok_gemini_key()`, and it never reaches a
  device.
- **Gate and spend in one call.** The function calls `use_church_draft` (0122)
  with the caller's own token. That checks `church_admin_can` (leadership of a
  verified church) and spends one of the church's **30 drafts a day (UTC)**
  before the model is asked. Anybody else costs nothing.
- **A draft is a draft.** It fills the form and saves nothing.
  `set_church_verse` is still the only writer.
- **Every draft is checked three times** with the same rules: in the function,
  in `draftQuestions` (`cleanQuestions`) and on save. Options are re-dealt
  server-side, because models put the right answer first.
- **The prompt carries the house rules:**
  - answerable from the passage
  - a teach line on every answer, never scolding
  - nothing that splits denominations
  - no trick or "NOT" questions
  - plain words
- **It doesn't wipe the pastor's work.** Over questions the pastor already
  typed, the first tap only warns and the second replaces.
- **The demo (`/churches/try`) drafts from the library only** and makes no call.
  For any other reference it says a Founding Church can draft any passage.

Superseded in part by 0127 (below): the gate now also needs the Content
Generation add-on, and a draft is saved as a DRAFT rather than filling the
form for `set_church_verse`.

Not yet verified end to end against the model (as of 0122). Live checks:

- a request with no token is refused at the gateway
- a signed-out caller is refused before any model call
- bad input is refused
- preflight answers

## Content Generation: the add-on, drafts and approval (0127)

**Its art** (2026-10-26): five paintings for the package's surfaces — the
pastor's study (`cg_study`), a week of light from one sermon (`cg_week`), a
draft awaiting its seal (`cg_draft`), the sealed approval (`cg_approved`), and
"for your congregation only" (`cg_private`) — in the verse-post style, from
`art/church-content.json` into `public/keep/cg_*.jpg`, wired through
`GENERATED_ART` like every other render. They are opaque 16:9 scenes (JPEG,
no key), so `check-art` has nothing to check on them. Nothing draws them yet;
a surface that wants one looks its id up in `GENERATED_ART` and keeps a drawn
or plain fallback, the house rule.

**Two entitlements.** `church_entitlements(church)` tells a church's own
leadership what it holds:

| | What it is | Gate | Unlocks |
|---|---|---|---|
| Church Leader (base) | leadership of a verified church | `church_admin_can` | every tool on this page, manual entry, approving drafts |
| Content Generation (add-on) | `church_addons.content_generation` | `church_gen_can` = base **and** add-on | `church-draft`, `save_church_verse_draft` |

The operator grants the add-on in Admin → Founding Churches
(`admin_set_church_content_generation`), which refuses (`needs_base`) a church
that isn't verified. Un-verifying a church leaves the add-on on its record but
inert, and `/church/:id/admin` says "on your plan, switches on with Church
Leader". The top of that screen shows both rows as Active or Locked; without
the add-on, the verse form shows a locked "Drafting assist" card in place of
the draft button. There is no price in the app; on the web only, the locked
row carries "Unlock with Church Suite" (docs/CHURCH-PACKAGES.md → Billing).

**The engine** (`church-draft`): POST `{ church_id, reference, text,
guidance?, transcript? }`. The reference must be in citation form
(`bad_reference` otherwise). `guidance` is a focus line (300 chars) and
`transcript` is sermon notes or a voice-memo transcript, pasted in (see
"Long transcripts" below for the limits). Both steer emphasis and the suggested note only. It returns five questions
and a `note`. The note fills the form's note only when that is empty. On-device
transcription of a voice memo isn't built; paste the transcript.

**Drafts and approval:**

- A drafted edit is saved with **Save as draft** (`save_church_verse_draft`):
  `status = 'draft'`, `generated = true`. Members can't see it.
- Saving a draft over a day that's already live needs a second tap, and the
  form says that the day leaves members' screens until it's approved
  (`p_replace`).
- **Approve for <day>** saves the edits as the draft and then calls
  `approve_church_verse`, which needs the base tier only. A church whose
  add-on lapsed can still approve what it made. Without the add-on the approve
  button goes through `set_church_verse`, which is also an approval.
- The planner marks a draft day ✎ with a dashed border, and counts it as "no
  church verse live" on the strip and on the leadership card.

**Audit fields on `church_verses`:** `created_by`, `created_at`, `updated_at`,
`visibility` ('congregation', the only value the check allows), `status`,
`generated`, `approved_by`, `approved_at`. `church_verse_for` and
`church_verses_range` return status, generated, visibility, created_at and
approved_at. `approved_by` stays server-side.

**The church verse is additive.** `get_effective_verse` is restated to return
null, so no build, including approved iOS builds, swaps the daily drop. What
members get instead is 0128's lane — `my_church_verse`, the box on the Play
tab and `/play/church` — which skips drafts, so a draft (and a discarded one,
which is always a draft) never reaches a member.

## Plan your week: the Plan tab's one flow (2026-10-26)

The planner used to stack four generators down one column — the study-topic
fill, "✨ Draft a week from a sermon", the per-day "✨ Draft five questions" and
the library fill — and a pastor had to work out which one they wanted. With the
Content Generation package, the Plan tab now opens on **Plan your week**
(`src/features/church/admin/PlanWeek.tsx`), three steps:

1. **Start from** — **Your sermon** (the hero and the default, drawn full
   width: upload or record the memo, or paste the transcript), **A topic**, or
   **One passage**.
2. **Draft the week** — the chosen source's form, embedded:
   `WeekDraftPanel source="sermon"` (sermon box FIRST, then passages, series,
   dates), `StudyTopicWeek`, or `WeekDraftPanel source="passage"` (one passage,
   no sermon box; a blank focus becomes "Stay with {passage} itself…", and the
   series defaults to the reference, because the week call needs notes or a
   focus line). All three stay mounted and only the chosen one shows, so
   switching source never loses a transcript or a memo mid-upload.
3. **Review and approve** — `DraftReview`, unchanged. A ⚠ day still holds
   "Approve all" back until it is opened and checked; the server skips it too.

**Every source is the same `church-draft` week call**, so nothing about the
engine changed: the Content Generation gate (`church_gen_can`), the 30 draft
units a day (one per day drafted, refunds for days not delivered — 0142), the
10 memo transcriptions a day (0144, no draft unit), the long-transcript
condense, the server-side save on each planned date, the planned-dates check
(live days skipped and named) and the blind answer check (0143).

**Manual entry is one tap away.** Under the flow sits the three-week strip and
**✎ Edit one day**, which unfolds the day-by-day form — reference, words, five
questions, series, note, save/approve/discard, copy-through and the visual
assets. Tapping a day on the strip, opening a draft from the review, or
arriving from a Home to-do (`initialDate`) opens it on that day. The per-day
"✨ Draft five questions" and the library fill live inside it, as tools for
editing one day rather than ways to plan a week. **Without the package** (and
in the public demo) there is no flow: the form is the tab, starts open, and the
locked card says what the package would add.

## A week from one sermon (0129)

With the add-on, the Plan tab's **Your sermon** source (above; it was the
Schedule tab's **✨ Draft a week from a sermon** before 2026-10-26) is
`WeekDraftPanel`: a series name, 1–3 passages, a start date, 2–7 days, and
the sermon pasted in (or at least a focus line). It produces one DRAFT per day,
each with its own verse focus inside those passages, five questions and a note.

- **One generator.** It is `church-draft` with `mode: 'week'`, not a second
  function. The gate is the same `church_gen_can`; the spend is
  `use_church_draft_units(church, days)` — one of the church's **30 drafts a
  day** per DAY drafted, taken atomically before the model is asked.
  `use_church_draft` is now `units = 1`.
- **The scripture never comes from the model.** The client fetches each
  passage's verses itself (`resolvePassage`: the BSB, the app's own unlicensed
  text — a licensed translation can't be stored on a church's day), sends them
  numbered, and the function builds every day's text from those verses. The
  model only picks which verse(s) a day is about; a day whose reference isn't
  inside a supplied passage is dropped, so a week can come back shorter than
  asked (the panel says so).
- **The dates are planned and named before anything is spent:** the next N
  days from the start with no LIVE verse. A live day is skipped and listed
  ("left alone"); a planned day holding an older draft is listed as replaced.
  Each day is then saved with `save_church_verse_draft` without `replace`, so
  a day that went live meanwhile refuses and is reported, never overwritten.
- **Review, one by one or as the set** (`DraftReview`, under the strip, base
  tier): every draft in the window grouped by series, each with Open →; per
  series **Approve all N** (`approve_church_verses`, exactly the dates listed,
  drafts only) and **Discard all**, both behind a second tap. A single draft has
  **Discard this draft** under the approve button.
- **Discard stamps rather than deletes** (`discarded_at`): every leadership
  reader treats the row as absent, every writer clears the stamp. Partly
  because the Supabase MCP can't apply a `DELETE` from a cloud session, partly
  because "generated, then thrown away" is worth keeping in the audit trail.

**Since 0142 the function saves the week itself.** A client that sends
`dates` (the planned dates, in order) gets the drafts saved on the server, as
the leader, through `save_church_verse_draft` without `replace`, and back only
`{ saved, refused: [{ date, reason }], missing, left }` — then re-reads the
window. Day k of the plan goes on dates[k] and nowhere else, so a day that came
back unusable leaves its own date empty instead of sliding the series a day
early, a phone that backgrounds mid-draft loses nothing, and a day that went
live meanwhile still refuses (`day_is_set`). A client that sends no `dates`
gets the old `days` answer. Every unit spent and not delivered (a failed run,
a short week, a refused day, a topic the model couldn't anchor) is refunded
(`refund_church_draft_units`), every run leaves one content-free row in
`church_draft_runs`, and questions are salvaged one at a time — clipped rather
than refused, a blank's answer checked against the verse, no prompt holding its
own answer, no repeat across the week — with one follow-up call for just the
missing ones. Failures name themselves (`model_busy`, `timeout`, `no_key`,
`not_saved`, …) and carry a real HTTP status when the request sends `api: 2`.

**The client (same change):** all three draft calls send `api: 2` and read a
failure's reason out of the response body (`invokeDraft` in
`store/churchAdmin.ts`, the one place that does). Both week panels send their
planned `dates`, save nothing themselves and re-read the strip. When NO answer
comes back (`no_reply` — the connection dropped, the phone suspended the tab)
they don't report a failure straight away: `recoverLanded`
(`features/church/admin/weekRun.tsx`) re-reads the planned dates a few times
across the function's budget, and a date now holding a draft that differs from
what it held before the run is reported as this run's work. Only when nothing
landed is it an error. The allowance line reads the `left` the engine last
returned (`useDraftAllowance`) instead of a fixed "of 30"; a `limit` refusal
carries no `left`, because it doesn't know how many remain. A function from
before 0142 still works with this client: a reply with `days` and no `saved`
is saved positionally on the client, as before.

**The answer check (0143).** Every finished set of five is read a second
time, blind, in one cheap call (`GEMINI_CHECK_MODEL`, else the drafting
model): the passage and each question's options, never which one was marked.
Where it picks a different option, the question carries `check: true` and
`checkPick`. "Can't tell" (-1) is NOT a flag: in one-day mode the checker sees
only the verse, which can't answer a before/after question, and a ⚠ on a right
answer teaches leaders to ignore the ⚠. It never blocks a draft — no
time left, a failed call or an unreadable answer leaves the questions as they
were — and it spends nothing. The leader sees it everywhere a draft is
reviewed: a ⚠ on the question in the form, with what the second read picked
and a "Looks right" button (editing the question also clears it); "⚠ N to
check" on the day in "Waiting for your approval"; ✎⚠ on the planner chip.
**Approve all is disabled while any day in the set carries a ⚠**, with the
days named, and the server enforces the same rule (`approve_church_verses`
skips a flagged day). Approving one day from the form is allowed and takes
its flags off — the leader approved it with the warning on screen. A flag is
only ever on a draft; a member never receives one.

**Limits, all enforced in the function:** 2–7 days; 1–3 passages, each inside
one chapter, ≤ 40 verses each and ≤ 6,000 characters of scripture in all; a
transcript ≤ 60,000 characters, condensed first above 12,000 (see "Long
transcripts");
a focus line ≤ 300; each day ≤ 3 consecutive verses and ≤ 1,000 characters of
text; one model call with a 90-second timeout and one retry only if the first
failed inside 50 seconds; 30 draft-days per church per UTC day.

**Members:** a week of approved days reads as a sequence in 0128's lane — the
box shows "<series> · day N of M" — counted over every approved day under that
series name. Days planned around a live day are not contiguous, which that
count handles; reusing a series name a year later would add to its total.

**Not verified end to end against the model**: the container has no leader
token. The flow was driven in the browser with the demo's memory backend and a
stand-in for the model call (removed again); the function's passage guards were
unit-checked.

## A week from a study topic

The **A topic** source in Plan your week asks **"What is your congregation
studying this week?"** (`src/features/church/admin/StudyTopicWeek.tsx`). Content
Generation only — it renders only when the backend carries `draftWeek`; a
base-tier leader sees the existing locked card and every manual tool.

**Autocomplete** (`suggestTopics` in `src/data/studyTopics.ts`): ~40 curated
series, seasons and themes, the 66 books, and the church's own series from the
last twelve weeks ("Used before", ranked first when they match). Keyboard:
↑/↓, Enter picks the highlighted row or commits what was typed, Esc closes.

**Anchoring** — generation never starts from the topic alone:

| The topic is… | Passages come from | Cost |
|---|---|---|
| typed with verse hints | the leader's hints (up to 3, each one chapter) | days |
| a curated topic | its catalog passages | days |
| a book, a past series, or free text | `church-draft` `mode: 'topic'` — references only | days + 1 |

Every passage is then fetched from the BSB (`resolvePassage`); the model never
supplies scripture. The week itself is `church-draft` `mode: 'week'` with the
topic as its focus line and an optional pasted transcript.

**What a day already holds:** the fill covers a fixed window (start + 2-7
days). Empty days are filled; waiting drafts are kept unless "Also redo drafts"
is ticked; approved days are never touched and are named in the plan. A day
that goes live between planning and saving refuses (`day_is_set`) and is
reported. One open day still drafts two (the week mode's minimum) and saves one.

**After:** the days show in the strip as ✎ and in "Waiting for your approval",
marked ✨ suggested, where each can be opened and edited (verse, questions,
note), moved ↑/↓, discarded ✕, or the set approved through `approve_church_verses`.
"Discard this suggested week" discards exactly the dates that run saved.

## What a member sees (0130)

A member of a VERIFIED church gets the church tab's `ChurchLife` block,
directly under the churchyard:

1. The leaders' live notice (one at a time, by
   design — `set_church_announcement` keeps one; older notices show up in the
   feed as "posted").
2. **Today's church verse** → `/play/church`, with the series as a trail of
   days (`SeriesTrail`): "Day 3 of 5 · Fruit of the Spirit", ✓ on the days you
   played, a ring on today, then "So far: …" with the references that have
   arrived. A future day shows only its weekday. A day you skipped is drawn
   neutral, never "missed".
3. **The series on a gap day**: when today has no church verse but a series is
   running (or starts within a week, or ended in the last three days), the
   trail still shows with a line that opens the Play tab.
4. **"This week in {church}"** (`church_week_summary`): church-verse days so
   far, members who played the church verse, members who played the daily
   verse. The week is the board's (UTC, the rivalry's). A player count under
   five is null and not drawn, and a card with no player count left is not
   drawn at all — which is every congregation under five.
5. The congregation feed (0128).

**Cut in the first-week audit (2026-10-30)**, each because it repeated
something on screen or led nowhere: a "You're in {church} · N members ·
verified church" card (the yard above names the church and its head count;
"verified church" moved onto the yard's own line), the head-count tile on
"This week" (the third time that number appeared), a "Compete" card (a link to
the board one scroll down, the Battle tab, and worldwide ranks), and the empty
local board's "you're #1 by default" — it now offers "See every church
playing" in one tap, because most congregations have nobody near them.

The Play tab's church box and the `/play/church` result use the same trail
(compact on the box). `my_church_series` picks the series: today's verse's,
else one running across today, else the next within seven days, else one that
ended in the last three; a series is that name's approved days within thirty
days either side, so "Advent" next year is a new series.

**Data gaps, stated rather than papered over:** missed days in a series can be
read but not played (`submit_church_verse_play` records today only, ±1 day);
a series is identified by its NAME, so two overlapping series with one name
merge; there is no per-member series completion for members (by design — it
is leadership's `church_leader_insights`); and an unverified church gets none
of this.

## Long transcripts

A 30-minute sermon is 25-30k characters, and the forms used to cut a paste at
4,000 (one day) or 12,000 (a week) with nothing on screen — so the model drew
on the opening third and the arc was lost. Now, in both modes:

- **Up to 12,000 characters are read word for word.** The forms carry no
  `maxLength`; a live count sits under the box (`TranscriptMeter`).
- **Above that, the function condenses first.** One time-boxed call
  (`prepareTranscript`, ≤ 25s, `GEMINI_CHECK_MODEL`) turns the whole
  transcript into an ordered outline of the pastor's own points, and the draft
  is written from the outline plus the passage. The outline is held to the
  same rule as the transcript: emphasis and the note, never facts the passage
  doesn't contain. The meter says this will happen before anything is sent.
- **Up to 60,000 are accepted** (about an hour of speech); beyond that the
  meter names exactly how much won't be considered.
- **A condense that fails or runs late falls back** to the first 12,000 — what
  every draft got before — and never fails the draft. The answer carries
  `transcript_use` (`full` / `condensed` / `clipped`) and `transcript_read`,
  and the form's result line says which happened, so a clipped draft is never
  presented as having read the whole sermon. No unit is spent on the condense
  and `church_draft_runs` is unchanged.

## Voice memos

"Record Sunday's sermon, get Monday–Friday." Each of the three drafting forms
(one day, a week from a sermon, the study-topic week) has **Upload a voice
memo** and, where the browser can record, **Record here** beside the paste box
(`features/church/admin/memo.tsx`). The paste box is unchanged; this only
fills it.

1. **Upload.** `church-draft` `mode: 'memo_url'` checks the Content Generation
   gate (`church_memo_can`, 0144, spends nothing) and hands back a signed
   upload into the private `church-memos` bucket, under the church's own
   folder. The browser sends the file there directly. m4a/mp4, mp3, wav, aac,
   ogg/opus, flac, webm and aiff, up to 50 MB; the browser reads the length
   first and refuses past an hour before anything is sent.
2. **Transcribe.** `mode: 'transcribe'` spends one of the church's 10 daily
   transcriptions (`use_church_memo`), sends the audio to Gemini through the
   Files API, measures it with countTokens (32 tokens a second) and refuses
   past an hour, and transcribes it word for word — scripture written as heard,
   never swapped for a translation's wording. Any failure gives the
   transcription back (`release_church_memo`). A busy or timed-out model keeps
   the upload so **Try again** doesn't upload again; a refused format, a silent
   or overlong file, and every success remove it. Leftovers are pruned after
   six hours.
3. **Edit, then draft.** The transcript lands in the box (or, when the box
   already has text, the leader picks Replace it / Add below). Drafting is the
   ordinary call: a long transcript is condensed first, it spends exactly the
   draft units a paste would, and every other rule — BSB scripture, drafts
   until approved, the ⚠ check, refunds, the run log — is untouched.

No draft unit is ever spent on a transcription, and the replies carry
`memo_left` rather than `left`, because `left` is what every client shows as
the draft allowance.

**Not verified against the live model:** m4a and webm are on Vertex AI's audio
list but not the Gemini API's documented one; a refusal comes back as
`memo_format` ("try an M4A, MP3 or WAV"). And an hour of audio is a long
transcription inside the function's 140-second budget; a timeout keeps the
upload for a retry.

## Record Sunday, review Monday (0148)

**This is the highest-value loop the package has.** A pastor records Sunday's
sermon on the way out of the building, uploads it, closes the app — and on
Monday the week is sitting on Plan as drafts waiting for approval. No draft
button, no waiting on a spinner.

**How a leader starts it.** Plan → *Your sermon*. Under the memo buttons sits
**✨ Draft my week for me**. Since Autopilot (0152, below) it is ticked by
default only while **Autopilot is on** (and not skipped this week); with
Autopilot off it starts unticked, so nothing is automatic unless the pastor
ticks it for that one memo. The passage they preached is the one thing it needs before
the upload (the memo refuses to send without it and says so), plus the series
name (the reference if left blank), the start date and the number of days the
form already has.

**What happens.** The client fetches the passages' BSB words exactly as a
hand-drafted week does, uploads the memo (`memo_url`), and calls
`church-draft` with `mode: 'auto_week'`. The function checks the Content
Generation gate, writes a job row (`church_auto_weeks`), answers `{ ok, job }`
at once, and keeps working after the answer (`EdgeRuntime.waitUntil`):

1. **Transcribe** — the ordinary `transcribe` handler, as the leader: one of
   the church's 10 memo uses, released on any failure; the upload removed once
   heard, kept on a busy/timeout so a retry needn't re-upload.
2. **Draft the week** — in a FRESH invocation (the function calls itself with
   the leader's token, so the two stages never share one wall clock), the
   ordinary `week` handler with `dates`: the first N days from the start that
   hold **nothing at all** — a live day and a waiting draft are both left
   alone, so nothing a leader made is ever replaced. One draft unit per day,
   refunded for every day not saved; scripture only from the passages sent;
   the blind answer check; every day saved as a DRAFT.

Nothing is approved. A ⚠ day still holds "Approve all" back.

**Where the leader hears about it.** Home's "This week" list carries one row
for the job — *ready to review* (with the draft count, the dates and the ⚠
count), *being drafted*, or *didn't finish* — and Plan carries the same as a
card above step 1, which turns from "drafting" to "ready" by itself (it looks
again every 15 seconds while a job runs) and refreshes the planner when the
week lands. Seeing a ready job on Plan marks it seen, so Home stops announcing
it. The weekly digest will carry it too once the digest exists; it doesn't yet.

**Failures** are the stage's own reason (`model_busy`, `timeout`, `limit`,
`memo_limit`, `memo_silent`, `no_open_days`, …) on the job, with everything
that stage spent already given back. **Retry** (Plan) runs the job again from
where it stopped: a job whose transcript was made skips straight to the week,
so a busy model on Monday costs no second transcription. A job still "running"
twelve minutes after it last moved is treated as lost and offered the same
Retry. **Dismiss** clears it, and the transcript with it.

**What is stored.** The job keeps the memo path, the transcript once made, the
passages and the window — the least a retry needs. The transcript is cleared
when the week lands or the job is dismissed, and no reader ever returns it:
`church_auto_weeks` (verified leadership of that church) gives status,
references, dates, counts and reason only. The table has no client grant and
no policy; the function writes it as service_role. Two racing runners for one
stage (a chained call that did start after all, and its fallback) can't both
draft: each stage claims the job with an optimistic `updated_at` check.

`npm run check:church-draft` drives all of it against the real handler: the
week on the first empty days, drafts only, one memo use and N units, the flag
carried, the second invocation, a busy week stage refunded with the transcript
kept and a retry that doesn't re-transcribe, a busy transcription keeping the
upload, and the gates.


## Autopilot (0152)

**The week drafts itself, and waits for the pastor.** Autopilot is the 0148
loop made standing: one switch on Plan (`AutopilotCard`, top of the tab),
stored per church in `church_autopilot`, **default off**. It removes the "now
press draft" step and keeps every human review. It is the Content Generation
package's, so every RPC behind it is `church_gen_can`: verified leadership of
that church with the add-on. A free claim, an unverified church or a church
without the add-on never sees the switch.

**What it does each week.** A week runs **Sunday to Saturday in the church's
own time zone** (saved from the leader's device when the switch is set).

1. **A sermon memo arrives.** With Autopilot on, Plan → *Your sermon* ticks
   "✈️ Autopilot: draft my week from this memo" by itself. Sending the memo
   queues the 0148 job (`autopilot: true`) — the same transcription, the same
   week call, the same allowances and refunds. The passage preached is still
   required before the upload: scripture only ever comes from passages a
   person named. Any memo job made this week (Autopilot's or one ticked by
   hand) means the sermon arrived, and the fallback never fires.
2. **No memo by the CUTOFF** — Monday 9:00 PM unless the pastor sets another
   day and time — **and a FALLBACK is set**: the week is drafted from the
   fallback instead. The fallback is a **topic** or **one passage**, resolved
   to BSB verses **when it is saved**, exactly as the topic and passage
   sources do. A curated topic costs nothing; any other topic spends one unit
   on `church-draft`'s topic mode, once, at save time. Saving only the switch
   or the cutoff sends `"keep"` and never re-resolves. The fallback is the
   same 0148 job row with `source: 'fallback'`. It skips transcription and
   runs the ordinary `week` call:
   - one of the 30 daily units per day;
   - refunds for every day not saved;
   - the blind answer check;
   - every day saved as a DRAFT.

   It fills the seven days after the cutoff's day (from today, if the first
   visit comes later), and **only the empty ones inside that window**. A live
   day or a waiting draft is never touched, and a window with fewer than two
   empty days is recorded as `covered` — already planned, nothing drafted.
3. **No memo by the cutoff and NO fallback**: nothing is drafted, ever. The
   week is recorded as `no_source`, and Plan and Home say **"No source this
   week — Autopilot skipped"** (since 2026-10-28, in a quiet line: "Nothing
   drafted this week…"). Autopilot never drafts from nothing. **Switching it on
   with no fallback saved opens the fallback chooser first** and turns it on
   only when that is saved, so a midweek switch-on (after the cutoff, which
   settles the week at once) drafts this week's empty days instead of recording
   a skip.

**Skip this week** (`set_church_autopilot_skip`) pauses the current week only
— a guest speaker, a vacation — and the switch stays on. While skipped:
- the memo box starts unticked;
- the cutoff claims nothing;
- `church-draft` refuses an Autopilot memo job with `autopilot_paused`.

A memo the pastor ticks by hand is their own call and is never refused.
**Undo** restores the week.

**Nothing goes live without the pastor.** Every day Autopilot writes is a
draft. Approval is the unchanged 0127/0129 path: `DraftReview`, a ⚠ day
holding "Approve all" back. There is no auto-approve, and no setting adds one.

**How the cutoff is noticed — a clock, and a visit (0158).** Until 0158 there
was no cron and the week settled only on the next leadership visit, so a pastor
who didn't open the app by Monday night got nothing drafted and the Tuesday
digest said so. Now two doors reach the same claim:
- **Every hour at :23**, pg_cron (`church-autopilot-hourly`) posts
  `{ mode: 'autopilot_cron' }` to `church-draft` with `x-autopilot-token`
  (Vault `AUTOPILOT_CRON_TOKEN`). The platform's verify_jwt gate is met with
  the project's public legacy anon key (Vault `AUTOPILOT_CRON_ANON_KEY`, the
  same key every client bundle carries); the function's own check is the
  token. It reads `church_autopilot_due()` — churches whose week is `due`, each
  with the leader it runs as (the one who last set Autopilot if they still pass
  the Content Generation gate, else the longest-standing leader who does) — and
  for each calls `church_autopilot_claim` and runs the job.
- **A leadership visit** still sends `autopilot_tick` on load (Home, Plan, a
  leader's church tab), and settles the week first if it comes before the hour.

Either way the week is settled **once per church per week** by the primary key
of `church_autopilot_weeks`. A cron-run job acts AS the chosen leader through
`church_rpc_as` (service_role only): exactly the five leadership RPCs the week
stage uses (`church_autopilot`, `church_verses_range`, `use_church_draft[_units]`,
`save_church_verse_draft`, `set_church_discussion`), each still applying its own
gate as that leader — the `church_digest_build` impersonation, narrowed to an
allowlist. Inside the function the impersonated "auth header" carries a random
per-process prefix, and a request carrying anything shaped like it is refused,
so no caller can forge one. Units are spent and refunded as that leader's,
exactly as when they press Draft, and everything is still a DRAFT.
`npm run check:church-draft` drives the cron door (token, chosen leader, drafts
only, nothing re-claimed, a forged header refused).

**Where the pastor hears about it.**
- Home's "This week" list leads with **"Week drafted — review"** (the range,
  where it came from, the ⚠ count), which opens Plan.
- When the week was skipped for want of a source, Home shows the skip line
  instead.
- Plan's card says where the week stands: waiting (with the cutoff and what
  happens then), memo in, drafted from the fallback, skipped (paused), no
  source, or already planned.
- A failed fallback is the same Retry as a failed memo week. It keeps its
  passages, so it is always retryable, and its retry is gated on Content
  Generation, not the memo allowance. Everything spent is refunded as in the
  manual path.
- **The Monday digest carries this line** (0154, `docs/CHURCH-DIGEST.md`):
  "Week drafted — review" with the range, or "Nothing drafted this week", worded by
  the same builder Home uses.

**Driven in a browser** against a stub that follows these rules:
- **Off:** no tick claims anything, the memo box starts unticked, and a memo
  only fills the transcript box.
- **On + memo:** the job is queued as Autopilot's, Home leads with "Week
  drafted — review", and Approve all puts the days live.
- **On + no memo + a topic fallback:** the topic resolved to John 15:1-8 at
  save time; opening the dashboard after the cutoff claimed the week once and
  seven drafts waited for review.
- **On + no memo + no fallback:** the skip line on Home and Plan, no job and
  no drafts.
- **Skip this week:** the box unticked, a memo sent made no week, the cutoff
  claimed nothing, and a forced Autopilot job was refused `autopilot_paused`.

`npm run check:church-draft` covers the server half against the real handler:
off, waiting, no source, a fallback drafted only on empty days inside its
window, no second claim, a failed fallback refunded and retried past the memo
cap, the paused refusal, and the gate.
