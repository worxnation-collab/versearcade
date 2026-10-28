# The weekly digest (0154; Tuesday since 0157)

**Since 0157 (2026-10-28, the owner's call) it goes out TUESDAY 08:00 church
time, not Monday**: the Monday email went out before Autopilot's Monday 21:00
cutoff, so it described a week that was about to be drafted. The cron job is
`church-digest-tuesday` (`7 * * * 1,2,3` UTC); `week` is still that week's
Monday date, so nobody gets two across the switch. Where this page says
Monday about the SEND, read Tuesday.

An opt-in email to a verified church's leadership that carries the "This week"
to-do from the dashboard's Home — nothing more. Home is still the place the
work is done; the email is a nudge with a door to each row.

## The opt-in

- **Where:** Home, under the "This week" list — "Email me the Monday digest"
  (`DigestToggle.tsx`). **Default off.**
- **Per leader, per church** (`church_digest_optins`, primary key
  `(church_id, user_id)`). It is that person's inbox: one pastor switching it
  on never starts emailing a co-leader, and a leader of two churches decides
  for each. Switching off writes `enabled = false`; nothing is removed.
- **Verified leadership only.** `church_digest_setting` / `set_church_digest`
  are gated by `church_admin_can`, so a free claim (unverified) and every
  member are refused, and the card draws nothing for them.
- **"Send me this week's now"** sends the same email to your own address on
  demand — the test send, and a way to get it mid-week.

## What it contains

Only rows Home already shows, worded by the SAME builder
(`supabase/functions/church-digest/home.ts`, which `HomePanel` imports too), so
the two cannot drift:

| Row | Home's wording | Link lands on |
|---|---|---|
| Sermon week / Autopilot | "Week drafted — review" with the range (or ready / being drafted / didn't finish), or "Nothing drafted this week" | Plan, on the first drafted day (or today) |
| Drafts waiting | "N drafts are waiting for your approval", first date | Plan, on the first draft |
| Flagged questions | "N drafted questions need a second look", first date | Plan, on that day |
| Inquiries waiting | "N players asked about your church" — **a count, no names, no notes** | People, the inquiries section |
| Quiet members | "N members could use a check-in" — **a count, never names**; leaders never counted | People, the "Not active this week" fold open |

Home's other two rows (open days without a verse, the notice) stay Home-only.
An empty week sends one line: "you're all set". No member is ever emailed, and
nothing in it is a per-person number.

The sermon-week and Autopilot rows need Content Generation, exactly as on Home.
Note the timing: the email goes out Monday morning, and Autopilot's default
cutoff is Monday 9pm — so "Nothing drafted this week" for THIS week usually appears on
Home after the email has gone. A church that wants it in the digest can set its
cutoff to Sunday.

## The links

`/church/:id/admin?go=plan&date=YYYY-MM-DD`, `?go=people&focus=quiet`,
`?go=people&focus=inquiries`, `?go=page&focus=notice` — the same `HomeGo`
doors a Home row opens (`homeGoQuery` / `parseHomeGo`). `ChurchAdminScreen`
reads them once at mount, strips them from the URL, and applies them after the
dashboard loads. A non-leader following a link gets the dashboard's ordinary
"This page is for church leadership" wall.

## How it is sent

- **`church-digest` Edge Function** (verify_jwt off in `config.toml`; each
  door checks its own credential):
  - the **weekly run**: `pg_cron` job `church-digest-monday` (0154 part 2,
    `7 * * * 0,1,2` UTC) posts with `x-digest-token` = Vault
    `DIGEST_CRON_TOKEN`. `church_digest_due()` returns who is owed one — opted
    in, still leadership of a verified church, an address on file, the
    church's clock (Autopilot's time zone, else America/New_York) past Monday
    08:00, not sent for this Monday. Each is built and sent, and marked sent
    only once the provider accepts it.
  - a **leader's test**: `{ action: 'test', church_id }` with their own
    session, sent to their own address. `dry_run: true` returns the email.
- **`church_digest_build(church, leader)`** (service_role only) reads Home's own
  RPCs — `church_auto_weeks`, `church_autopilot`, `church_verses_range`,
  `church_join_inquiry_list`, `church_leader_insights` — **as that leader**, so
  their gates decide: a removed leader or an unverified church gets a refusal
  and no email.
- **Provider: Resend.** The key is `RESEND_API_KEY` (a function secret, or the
  Vault secret of that name). The sender is `DIGEST_FROM` (default
  `Verse Arcade <digest@versearcade.org>`; the domain must be verified in
  Resend). **With no key nothing is sent and nothing is marked sent**, so the
  first Monday after the key lands still goes out.

`npm run check:church-digest` drives the real function under Node against a
fake database and provider: rows, wording, every link, the gates, and that a
refused send is never marked sent.
