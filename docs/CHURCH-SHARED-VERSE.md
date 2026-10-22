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
count, no reader list, no "seen by". The Congregation panel is unchanged.

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
small-count floor any more. `get_church_participation` is kept, unused by the
dashboard, because the public demo (`/churches/try`) still draws its sample
numbers through `ParticipationPanel`.

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

Under the verse, leadership gets **"✨ Draft five questions from this
passage"**. It works for any reference, not only the library's 726 verses.

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
the draft button. There is no price or upgrade button anywhere.

**The engine** (`church-draft`): POST `{ church_id, reference, text,
guidance?, transcript? }`. The reference must be in citation form
(`bad_reference` otherwise). `guidance` is a focus line (300 chars) and
`transcript` is sermon notes or a voice-memo transcript (4,000 chars), pasted
in. Both steer emphasis and the suggested note only. It returns five questions
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
null, so no build, including approved iOS builds, swaps the daily drop.
Members see the church's approved verse in the church card on the Play tab,
with the note and a "Play your church's five →" button. That opens
`/play/church` (`ChurchVerseScreen`), which:

- reads `church_verse_today`: own verified church, non-draft, ±1 day;
- runs `QuizRunner` with `runId church:<id>:<date>`;
- pays nothing: no XP, no `plays`, no streak;
- records a device-local done flag with the score, the trivia round's shape.
