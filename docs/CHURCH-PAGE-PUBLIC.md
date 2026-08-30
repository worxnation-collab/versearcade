# The public church page

A church's page is the best-looking thing in this app — the building drawn wide,
the congregation standing on the grass outside it — and right now **a pastor
cannot link to it.** It lives inside `ChurchDetailSheet`, which opens from the
board on `/church`, which is behind `RequireAccount`.

Meanwhile the battle already proves the pattern works: `/battle/:id` is public,
draws something real to a stranger, gates at the point of action, and resumes
signup afterwards. `inviteUrl()` is sitting in `features/daily/shareCard.ts`
ready to point at anything. The church has all of the payload and none of the
door.

This is the scope for that door.

## What it is

`/church/:id` — a public, linkable page for one congregation. A pastor puts it
on a slide, in a bulletin, behind a QR code by the exit. A stranger opens it and
sees *their* building, at its real level, with people outside it, and one way in.

The route is free: `/church` is an exact path (the walled player tab) and
`/churches` is the For Churches funnel. Register `/church/:id` **outside** the
wall, beside `/battle/:id` in `App.tsx`.

## What's already public, and what isn't

Most of the building half needs no new server work at all:

| Piece | Today | Anon? |
|---|---|---|
| `churches` row | `for select using (true)` (0040) | **yes** |
| `church_json(churches)` | `grant execute ... to anon, authenticated` (0040) | **yes** |
| `church_profiles` | `for select using (published)`, no role clause (0050) | **yes** |
| `profiles` (the roster) | `for select using (auth.role() = 'authenticated')` (0002) | **no** |
| `get_church_page` | `revoke ... from public, anon`; raises `not authenticated` (0050) | **no** |

So exactly two things are missing: an anon-callable read, and a decision about
the roster.

## The decision to make first: the page does not name anybody

The signed-in page names the congregation — "Who plays here" — and that is right
where it is. It is **not** right on an anonymous URL. Publishing a list of real
usernames attached to a named physical address, crawlable by anything that
follows the link, is a different product than showing that list to a player who
is already inside. The 0002 policy says it plainly: profiles are readable by
anyone *signed in*, and that phrasing was a choice.

**Recommendation: the public page draws the crowd without naming it.** Figures on
the grass through `ChurchScene`, the head count, and nothing else about a person.
The names appear the moment you have an account.

That keeps "a crowd, not a ladder" intact, keeps the visual payload — which is
the entire reason to share the link — and gives the wall something real behind
it instead of a scold. It is also the version that needs no conversation with a
congregation about whether their members agreed to be listed on the open web.

Everything below assumes that answer. If it changes, only the RPC's `members`
block changes with it.

## Server: one new RPC, and no loosening of the old one

Do **not** relax `get_church_page`'s grant. It is viewer-shaped by construction —
`is_mine`, `miles`, `is_me`, `my_request_pending` all read `auth.uid()` — and a
function that must answer for a viewer who does not exist is a different
function. Add one:

```
public.public_church_page(p_church_id uuid, p_members_limit int default 12)
  → jsonb, stable, security definer, set search_path = public
```

Returns:

- `church` — `church_json(v_church)`, unchanged, minus `is_mine` and `miles`
  (both meaningless without a viewer).
- `info` — the published `church_profiles` row, or null. Same shape as today.
- `members` — the crowd sample: `avatar_emoji` and `avatar_character` only.
  **No `username`, no `is_me`.** Same join-date ordering as `get_church_page`,
  same `jsonb_agg(... order by ...)` fix, same 1–24 clamp.
- `member_total` — the count. A head count is a fact about a place; it is not a
  number on a person and it is already on the board.

Grant it to `anon, authenticated`.

**It will not raise on a null uid, and that is the one deliberate break with the
house pattern.** Every other `security definer` function here opens with
`if uid is null then raise` precisely because they are all viewer-shaped. This
one is not — it takes an id and returns a public record — so the guard would
make it useless rather than safe. Say so in the migration header, or a future
session will "fix" it.

Next free number is `0074`. Idempotent as usual (`create or replace`), and it
must be applied before the client merges.

Signed-in visitors landing on the same URL should get the full page, names and
all. Simplest correct shape: the screen calls `get_church_page` when there's a
session and `public_church_page` when there isn't. One URL that always works,
two levels of detail.

## Client

**A shared body, not a second page.** `ChurchDetailSheet` is 660 lines and knots
together the sheet chrome, `useChurch.page`, `useChurchYard`, the "Add info"
pill and yard editing. Don't reuse it and don't fork it — extract the
presentational middle (the building, the level rail, the info block, the scene)
into `ChurchPageBody`, and let the sheet and the new screen both mount it. The
one-component-per-world rule in `CLAUDE.md` exists for exactly this: two copies
of a church page will drift, and both halves will look right on their own.

New files:

- `features/church/ChurchPageBody.tsx` — extracted from the sheet, takes a
  `ChurchPage` and an optional `roster` (absent ⇒ the crowd is unnamed).
- `features/church/ChurchPublicScreen.tsx` — `Page noNav`, loads by `id`,
  renders `ChurchPageBody`, and ends in the one call to action.
- `features/church/pending.ts` + `ChurchResume.tsx` — copy `features/arena/`'s
  two files verbatim against `va.pendingChurch`, mount `ChurchResume` beside
  `BattleResume`. This is what carries someone through an OAuth page reload and
  lands them back on the church they came for.

Changed:

- `App.tsx` — the route, outside the wall.
- `ChurchDetailSheet` + `ChurchScreen` — a "Share this church" control using
  `inviteUrl(profile?.referralCode, `/church/${id}`)` and `shareResult`. Without
  a share affordance inside the app, the page has no way to get into a pastor's
  hands. **This is not optional polish; it is the distribution half of the
  feature.**

Reused unchanged: `ChurchScene`, `ChurchArt`, `ChurchFlora`, `levels.ts`,
`skins.ts`, `Page`, `Button`, `Avatar`.

The call to action goes to `/auth?mode=signup`, like every other one, after
`setPendingChurch(id)`. Stretch, worth doing: pre-select that church in the join
flow so someone who arrived from their own congregation's link doesn't have to
find it again in a radius search.

## The part that is more work than it looks: the link preview

`netlify.toml` rewrites `/*` → `index.html`, and `index.html` carries one static
set of OG tags: *"Verse Arcade — can you beat my score?"* So every church link
pasted into a Facebook group, a WhatsApp thread or a church newsletter previews
as the same generic card, with no church name on it.

For a feature whose entire purpose is that the link travels through social
channels, that is most of the value gone.

Fix it with a Netlify Edge Function on `/church/:id` that reads the church row
(name, city, level) and injects `og:title` / `og:description` / `og:url` into the
shell. Cheap, no image pipeline, and it makes the paste say *"Grace Community
Church on Verse Arcade"*. A per-church OG **image** is a bigger job — the scene
is SVG, and rendering it server-side is a real project — so ship text first and
treat the image as its own piece of work.

## Guardrails

Nothing here may become the thing the church rules already forbid:

- **No client can write this page.** The "Add info" pill stays exactly what it is
  — a queue submission through `submit_church_info_request`, which is
  `authenticated`-only. On the public page it either sits behind the sign-in
  call to action or isn't shown. It never becomes an open field on a stranger's
  congregation.
- **No per-person numbers**, signed in or out. The public page carries the
  church's level and its head count, both of which are already on the board, and
  nothing about an individual.
- **No prices, either mode.** The page must stay byte-identical on web and in the
  App Store build so `commerce.ts` never has to gate it. If a church page ever
  gets a price, that decision goes in `commerce.ts` and nowhere else.
- **`get_church_page` keeps its grant.** Adding a second function is the whole
  point; widening the first one silently hands the roster to anon.

## Out of scope for v1

- Universal links into the native app. `ios/` is regenerated every build and
  associated-domains config is its own runbook — and the recipient of a shared
  church link is precisely the person who doesn't have the app yet, so the web
  page is the correct destination.
- A per-church OG image.
- Anything that lets a pastor edit the page themselves.

## Shape of the work

| | |
|---|---|
| Migration `0074` | one function + grant. Small, and applied by hand before merge. |
| `ChurchPageBody` extraction | the only fiddly client work — untangling the sheet without changing it. |
| Public screen + route | small, mostly reuse. |
| pending/resume | two files copied from `features/arena/`. |
| Share controls | small, and the reason the rest exists. |
| Edge function for OG tags | separable; ship it in the same release or the link lands flat. |

Verify by driving it: open `/church/:id` in a private window with no session,
confirm no username appears anywhere in the response or the DOM, sign up from the
page, and confirm you land back on that church with the roster now named.
