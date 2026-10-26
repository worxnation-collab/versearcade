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
the list. There is no reply path yet — the check-in note (0137) reaches members
only — so the welcome is for when they join.

Online-only, inherited from the church store: an inquiry needs a real
congregation on the other end, and a keyless build has no leader to tap.

Foreign keys (cascade on the church and the player) are
`0149_church_discovery_b.sql`, to paste in the SQL editor.
