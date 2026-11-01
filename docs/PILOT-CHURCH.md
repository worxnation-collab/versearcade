# Running a pilot church

The product for churches is built and tested; no congregation has used it. One
real pilot is worth more than any feature left on the list. This is the whole
playbook: who to ask, what to say, how to set them up, and what to watch.

The owner's standing calls that shape it: pilots get **Content Generation free**
(Admin → Founding Churches, once verified), verification is **manual** (a person
you have actually spoken to), and nothing here ranks a member.

---

## 1. Who to ask (in this order)

**A. Churches whose members already play.** A church row with active members is
a congregation where the habit has already started, and the member is your
introduction. Find them with:

```sql
select c.name, c.city, c.region, count(p.id) members,
       count(p.id) filter (where p.last_played_on >= current_date - 13) active_14d
from churches c join profiles p on p.church_id = c.id
where not exists (select 1 from church_admins a where a.church_id = c.id)
group by c.id order by active_14d desc, members desc limit 10;
```

Since 2026-11-01 those members also see **"Bring {church} to life → Ask your
pastor"** on their church tab, which sends the pastor the claim page. Watch
`church_claims` and the "Add info" queue for one arriving on its own.

**B. A church you or a player can walk into.** Your own, a friend's, a player
who emails you. Warm beats cold by an order of magnitude.

**C. Cold, only after A and B.** Small to mid churches (80–400 on a Sunday) with
a youth or small-group pastor, a website that posts a weekly sermon, and no
existing app. The youth pastor or the discipleship/small-groups lead is the
buyer, not the senior pastor; they own "what does the congregation read
between Sundays".

**Pick one, then a second.** Not five. One church you can text is a pilot; five
you can't is a mailing list.

## 2. The pitch (15 minutes, in person or a call)

Lead with their problem, not the app:

> "Most people don't open a Bible between Sundays. Verse Arcade is a free
> two-minute daily Bible game — today's verse, five questions, a streak. We'd
> like your church to be one of our founding churches: you'd pick the verse
> your congregation reads each day, tie it to Sunday's sermon, and see who's
> keeping up so you can encourage them. It's free for founding churches."

Then show, don't describe (have the app open on your phone):

1. Play today's verse (2 minutes). A wrong answer teaches something — say so.
2. Open a church page: the yard, the congregation, "Who plays here".
3. Open the leader screen (use the demo account): **Plan your week → your
   sermon**. Record or paste last Sunday's sermon; the week's verses draft
   themselves; they approve them.
4. Home: "This week's verse", "Who's playing", "Send a note".

What to promise, exactly:
- **Free** for the pilot (Content Generation included) while we learn together.
- **Five minutes a week** for the pastor: approve Monday's drafts.
- **Nobody is ranked.** Members aren't scored against each other; church vs
  church is the only competition, and it's folded away.
- **Their words, not ours.** Nothing reaches a member until a leader approves it.

What to ask for in return:
- Announce it **once from the front on a Sunday**, with the QR on a slide
  (the leader screen's Share tab → Sunday pack is a ready PDF).
- **One 20-minute call a week** for the first four weeks.
- Permission to quote them if it works.

Objections you'll hear:
- *"Our people aren't techy."* — Two minutes, one tap, works in a browser; no
  download needed to start.
- *"Is it doctrinally safe?"* — Scripture is the BSB; questions are about the
  text, never doctrine; trivia avoids anything traditions disagree on.
- *"What does it cost later?"* — Say it plainly: founding churches are free for
  the pilot; you'll agree a price together before it ends, and there is no
  obligation.

## 3. Setting them up (day 0, ~30 minutes, you do it)

1. **Find or create their church row.** Have the pastor search the church in
   the app (Church tab → picker). If it's wrong, fix the name with
   `set_church_name(id, name, true)` (locks it).
2. **Verify their leader.** They create an account; you grant leadership —
   Admin → Churches, or the one-time invite link (`admin_create_church_claim_code`,
   `docs/CHURCH-CLAIM.md`). Verification is you having spoken to them.
3. **Turn on Content Generation**: Admin → Founding Churches → toggle.
4. **Sit with them for their first week plan**: Plan → Your sermon → upload
   last Sunday's recording → Draft my week → approve. Turn on **Autopilot**
   with a fallback topic, and **Auto-publish** if they'd rather not approve by
   hand.
5. **Page**: tagline, service times, "This week" line (Your page tab).
6. **Digest**: Home → "Email me the Tuesday digest" on.
7. **Sunday**: the Sunday pack PDF on screen; members join from the QR.

## 4. What to watch (weeks 1–4)

Weekly, before the call. Replace `<church>` with their id.

```sql
select
  (select count(*) from profiles where church_id = '<church>') members,
  (select count(*) from profiles where church_id = '<church>' and last_played_on >= current_date - 6) active_7d,
  (select count(distinct user_id) from church_verse_plays where church_id = '<church>' and created_at > now() - interval '7 days') church_verse_players_7d,
  (select count(*) from church_verses where church_id = '<church>' and drop_date between current_date and current_date + 6 and status = 'approved' and discarded_at is null) days_covered_next7,
  (select count(*) from church_check_ins where church_id = '<church>' and created_at > now() - interval '7 days') notes_sent_7d,
  (select count(*) from church_auto_weeks where church_id = '<church>' and created_at > now() - interval '7 days') sermon_weeks_7d;
```

What "working" looks like, in order of importance:

| Signal | Week 1 | Week 4 |
|---|---|---|
| Members joined after the Sunday announcement | 15+ | 30+ |
| Of those, played in the last 7 days | 50% | 35%+ |
| Played the church verse (not just the daily) | 30% of active | 50% of active |
| Days covered by approved verses, next 7 | 7 (you helped) | 7 (they did it) |
| Leader opened the dashboard | 2×/week | 1×/week, unprompted |
| Notes sent to members | any | any, unprompted |

The two that decide whether this is a product:
1. **Week-4 retention of members** — does a congregation keep playing once the
   Sunday announcement is a month old?
2. **Does the pastor keep the week covered without you?** If days go empty by
   week 3, the leader loop is too heavy; that is the most important thing to
   learn, and the fix is product (more Autopilot), not persuasion.

## 5. The weekly call (20 minutes)

Ask, don't demo:
1. What did you use this week? What did you skip, and why?
2. Did anyone mention it to you? What did they say?
3. Read the numbers to them; ask what surprised them.
4. "If this disappeared tomorrow, what would you miss?" (Week 3 and 4.)
5. "What would you pay for this, and what would make that obvious?" (Week 4.)

Write down their exact words. Bring the friction points back here as tasks, in
their language.

## 6. Ending the pilot (week 6)

- **It worked**: agree a founding price (keep it low and locked), ask for a
  quote and a referral to one pastor they know.
- **It didn't**: ask the week-4 question again and thank them; the answer is
  the most valuable thing the pilot produced.
- Either way, do not switch anything off without telling them first.
