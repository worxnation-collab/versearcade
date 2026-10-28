# Small groups and discussion questions (0151)

A verified church's leadership can sort members into small groups, mark one or
more people in each group as its **group leader**, and give each day 2–3 open
**discussion questions** for those groups. Content Generation can write the
questions alongside the quiz it already drafts. The sermon or passage stays the
hero; discussion questions are an add-on.

## What exists

| Piece | Where |
|---|---|
| Tables | `church_groups` (church, name, optional description, `archived_at`), `church_group_members` (church, member, `group_id`, `role` member/leader), `church_verse_discussions` (church, day, the reference they were written against, 0–3 questions, `generated`) |
| Leadership RPCs | `church_groups_list`, `save_church_group` (create / rename), `archive_church_group`, `set_church_group_member` (assign / move / role / take out), `set_church_discussion`, `church_discussion_for` |
| Group leader RPC | `my_church_group(local_date)` — null for anybody who leads no group |
| Leadership UI | People → **Small groups** (`GroupsSection.tsx`); the day form's **Discussion questions for small groups** fields and the "Also write 2–3 discussion questions" toggle (`TodayVerseForm.tsx`, `DiscussionToggle` in `WeekDraftPanel.tsx`, also on the sermon week and the study-topic week) |
| Group leader UI | Church tab → **You lead a small group** (`MyGroupCard.tsx`, inside `ChurchLife`) |
| Engine | `church-draft` with `discussion: true` (one day returns them; a week saves them beside each saved day and lists the dates in `discussed`) |

All three tables have RLS on, no rules and no client grant. Every read and write
goes through the security-definer functions above, which are the house pattern
for church data.

## Who sees what

- **Verified leadership** (`church_admin_can`) creates, renames, retires and
  staffs groups, and writes discussion questions. This is the same gate that
  already sees every member by name (0128). A free claim (0137) does not get
  groups, because a free claim never sees names.
- **A group leader** sees, on their own church tab:
  - their group's name and description;
  - their group's members, by name and face;
  - the discussion questions for **approved** days from today through the next
    six, with each day's reference and series.

  - **"Haven't played this week"** (0156, `my_church_group_quiet`): folded
    behind one tap, their own members (role 'member') with no play in seven
    days, by name and face — the SAME rule as leadership's "Not active this
    week" fold (the later of the last daily play and the last church-verse
    play, older than today − 6, or none). Each name offers **Send a note**: the
    check-in note, through `send_group_check_in`, which refuses anybody outside
    this leader's group (`not_in_group`), shares the one-note-a-day per member
    with leadership's check-ins (whoever sends first), copies today's church
    verse when asked, and allows 10 a day. It lands in the member's mailbox
    from the group leader, with the push nudge where they have one.

  They see no score, no last-played day and no streak — the quiet line is a
  name in a folded list, never a number about a person. That means a group
  leader learns less about their people than leadership already sees, never
  more. They cannot edit anything; the leadership RPCs refuse them.
- **A regular member** sees nothing about groups in this pass, including which
  group they are in. `my_church_group` returns null for them. Showing a member
  their own group is a reasonable next step and needs no schema change.
- **Strangers and guests** see nothing.

There is no ranking surface anywhere in this. Groups are listed in the order
they were made. Inside a group, people are listed leaders first, then
alphabetically. There is no count about a person, no "most active group" and no
group-against-group anything.

## One group per member

The primary key of `church_group_members` is `(church_id, user_id)`, so a member
is in at most one group. Adding someone who is already in another group
**moves** them. The picker says "(moves from …)" so a move is never a surprise.

A member who leaves the church keeps their row, but every reader ignores it,
because readers join on `profiles.church_id`. If they rejoin, they land back in
the same group.

Retiring a group sets `archived_at` and unassigns its people. Nothing is ever
deleted, so there is no destructive SQL in 0151 (see the MCP note in CLAUDE.md).

## Discussion questions

- **What they are:** 2–3 open questions with no options and no right answer.
  Each is cleaned server-side by `church_clean_discussion`: plain text, 8–240
  characters, at most three.
- **How the engine writes them:** when asked, the engine prompt adds one rule
  covering what the passage says, what it shows about God, and living it out
  this week. It forbids anything a Catholic, Orthodox, Baptist or Pentecostal
  would answer differently, and anything that asks people to compare themselves
  with someone else.
- **Fewer than two usable questions counts as none.** A day is never refused
  for lacking them.
- **No extra draft unit is spent.**
- **They are tied to the day's reference.** `church_verse_discussions.reference`
  is copied from the day when the questions are saved. A reader shows them only
  while that is still the day's reference, so a day redrafted over never shows
  the old day's questions. The leader form re-saves them when the reference
  changes.
- **Group leaders see them only once the day is approved.** Drafts stay with
  leadership, like everything else a draft carries.
- **Typing them counts.** Writing or editing questions by hand is base-tier
  leadership. Only *generating* them needs Content Generation.
- **The automatic Sunday-memo week (0148) does not write them yet.** Its job row
  has no flag for it.

## Verified

- **Local Postgres 16:**
  - create, rename, bad name;
  - assign, move (still one row), not-a-member, another church's group, bad
    role;
  - discussion cleaned to the valid lines;
  - a draft day is stored but hidden from the group leader;
  - no day for that date gives `no_day`;
  - the group leader is refused every leadership RPC;
  - the group leader's view carries no score keys;
  - a plain member and anon get null;
  - a changed reference hides stale questions from both readers;
  - a member who left drops out of the list;
  - retiring unassigns the group;
  - a free claim and another church's leader are refused;
  - re-running the migration is a no-op.
- **Live, in a rolled-back transaction:** a real verified church's leader
  created a group, made a member its leader and saved questions for an approved
  day. That member's `my_church_group` returned the group and the questions,
  and `church_groups_list` refused them.
- **Browser, against a stub that follows these rules:** the pastor created two
  groups, assigned four members, made one leader in each, then drafted today
  with the toggle on. The form filled three questions, and approving saved
  them as generated. The group leader's church tab showed the group and today's
  questions. A plain member of that group and a member of the other group saw
  no card and no question text, and were refused the dashboard.
