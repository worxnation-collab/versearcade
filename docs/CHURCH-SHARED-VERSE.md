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
- **Since 0127 the church verse is its OWN lane, never the daily drop.**
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

## The congregation's numbers (0127: names included)

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
