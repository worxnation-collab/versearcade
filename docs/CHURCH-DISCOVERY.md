# Finding a church through its leader (0149)

A church's verified leader is recognisable on their own **player card** — the
card that pops when anybody taps their avatar anywhere in the app — and that
card is a door to their church.

## The marker

Under the portrait, above the numbers: one slim row, the church's building
(small, `ChurchArt` at its real level and skin) and **"Church leader · Leads
{church}"**. It says what the person does, the way the faction line above it
says which team they're on. It is not a badge of rank: no number, no "pastor
of the year", nothing that could be put in a row beside somebody else's. It is
drawn on the card and nowhere else — not on a board row, not in a crowd scene.

**Verified only.** `player_card_church(username)` answers for a leader of a
VERIFIED church and nobody else: a free claim (0137), an unverified church, a
member, a hidden profile — all null, and the card draws nothing. It is a
companion read rather than a change to `get_player_card`, which approved iOS
builds call; an older server simply shows no marker.

**What the card receives** is exactly what the church's public page already
shows: the church id and name, the building's level and skin, the tagline and
the "This week" line. No member count, no XP, no score, no ranking.

## The church sheet

Tapping the marker opens a sheet over the card (z 112, the room-visit tier):
the building, the name, "@leader leads this church", the tagline and "This
week". Then what THIS viewer can do:

| Viewer | Sees |
|---|---|
| Signed in, no church | **Inquire** (a short note) and **Join**, plus a link to the church's page |
| Signed in, already in a church | "You play for {theirs}" and **Visit church** — never a Join that would move them (the `JoinChurchButton` rule) |
| A guest | The account wall — "Create an account to inquire" — which remembers the church (`setPendingChurch`) so sign-up lands back on its page |
| The leader themselves | **Open your dashboard** |

**Join** is the church page's own path: `join_church` by id (0092). Every
church is open to any signed-in player — there is no closed state — so Join is
always offered to somebody without a church.

## Inquiries

**Inquire** sends one note, up to 280 characters, to the church's leadership
(`send_church_join_inquiry`). The rules, all server-side:

- signed in, with **no** church (`has_church` otherwise);
- to a **verified** church only, and never to a church you lead;
- **one note per player per church, ever** — the table's primary key; a
  dismissed note doesn't free another;
- five a day across all churches;
- the text is cleaned (control characters, runs of whitespace) and capped.

It lands in `church_join_inquiries` — not 0025's `church_inquiries`, which is
the For Churches contact form. No client reads the table.

**Leadership** (verified, `church_admin_can` for THAT church) sees them on the
dashboard: a Home to-do row ("{name} asked about your church") and an **Asking
about your church** list at the top of People — who, the note, when, and
whether they have since joined. Newest first and nothing else: no count beyond
the list, no "most asked about", nothing compared. **Dismiss** takes one off
the list. **Reply** answers it once (below).

## Replying (0155)

**Reply** on an inquiry row opens a short note (280 characters, a counter under
it) and **Send reply** answers it — `reply_church_join_inquiry(church,
username, message)`. The rules, all server-side:

- **verified leadership of THAT church only** (`church_admin_can`): a free
  claim, a member, and a leader of another church are refused;
- **one reply per inquiry**: it is a column on the inquiry row, not a table,
  and a second send answers `already`;
- the text is cleaned and capped the way the inquiry is;
- **the reply is the church's voice**: no author is stored, so nothing about
  which leader answered outlives a leader's account;
- a player who has **since joined** — this church or another — still receives
  it; the row already says where they went, and the send line repeats it
  ("They've since joined another church; it's still in their mailbox").

After sending, the row shows **✓ Replied** with the words and when, the Reply
button goes, and **Dismiss** still takes the row off the list.

**The asker** sees it in two places and nowhere else:

- **the mailbox** (`/mail`, "Replies from churches", `store/churchReplies.ts`
  over `my_church_join_replies`): the reply, "{church}'s leaders", the date,
  "You asked: …", and a Visit button. An unseen reply lights the same single
  mailbox dot a check-in does (the You tab), and opening the mailbox clears it
  (`mark_church_join_replies_seen`);
- **the church sheet they asked from** (`LeadsChurch`): "{church}'s leaders
  replied" and the words, in place of "Your note is with …"
  (`my_church_join_inquiry`, restated with the reply).

Nobody else: `my_church_join_replies` derives the owner from `auth.uid()` and
takes no user id; the leadership list (`church_join_inquiry_list`, restated
with `reply` / `replied_at`) is behind the same gate it always was. No count
beyond the existing list, no push and no email for this pass — in-app only.

Online-only, inherited from the church store: an inquiry needs a real
congregation on the other end, and a keyless build has no leader to tap.

Foreign keys (cascade on the church and the player) are
`0149_church_discovery_b.sql`, pasted in the SQL editor and verified on 2026-10-28.
