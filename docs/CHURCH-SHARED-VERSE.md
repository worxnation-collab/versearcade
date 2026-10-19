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
- **`get_effective_verse(date)`** returns the caller's church verse for that
  date. It returns **null** when the caller has no church, the church isn't
  verified, no verse is set, or the date is outside ±1 day (so nobody can read
  tomorrow's questions today).
- **In the client, `loadToday()`** (`store/game.ts`, `churchVerseOr`) asks for
  the church verse alongside its usual calls, with a 2.5s deadline.
  - A null answer, an error or a timeout means the global verse, exactly as
    before. Local mode and guests never call it.
  - `dropDate` stays the real date, so the streak, `plays`, first light and the
    run lock don't notice which verse was played.
  - `ensure_daily_verse` still records the global verse, so one congregation
    never overwrites the day.
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

## The congregation's numbers: aggregates only, floored at five

`get_church_participation(church, days = 14)` is for verified leadership only,
and appears as the **Congregation** tab. It returns:

- members
- players in the window
- plays
- average score
- % who played today
- live-streak buckets: 1, 2–6, 7+

**Every number under 5 comes back null, including 0.** The screen shows it as
"fewer than 5". In a small group a total points at a person.

What it never returns, and what no RPC in this layer returns:

- usernames
- per-person rows
- per-day series
- "who hasn't played"

This is the church roster's *crowd, not a ladder* rule (docs/CHURCH-CLAIM.md),
and it holds harder here because the reader has authority over the people being
counted. Adding anything per-member needs its own argument. It must not grow out
of this function.

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

Not yet verified end to end against the model: production has no verified
church, so no real leader token has called it. Live checks:

- a request with no token is refused at the gateway
- a signed-out caller is refused before any model call
- bad input is refused
- preflight answers
