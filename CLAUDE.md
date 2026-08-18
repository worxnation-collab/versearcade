# Verse Arcade — working notes

Read this before changing anything. It's the stuff that isn't obvious from the
files and that has bitten previous sessions.

**Mission constraint, not a slogan:** stickiness without shame. Wrong answers
teach (every answer reveals a fact), and nothing ranks a player against a
friend. If a feature idea needs a loser, it's the wrong feature.

## Commands

```bash
npm install        # node_modules is NOT in the container image — do this first
npm run dev        # LOCAL mode with no .env.local; the full solo loop works
npm run typecheck  # tsc -b --noEmit
npm run build      # tsc -b && vite build
```

Use `npm run typecheck`, never a bare `npx tsc` — the repo pins TypeScript 5.x
and `tsconfig.json` still sets `baseUrl`, which a globally-installed tsc 6.x
rejects outright (TS5101) before it checks a single file.

`tsconfig.tsbuildinfo` is tracked and gets rewritten by every build. Don't
commit that churn — `git checkout tsconfig.tsbuildinfo` before staging.

## The one invariant: every feature works in both modes

The app runs **LOCAL** (no Supabase keys, or a guest) and **ONLINE** (signed in),
and the promise is that solo play is complete on its own. So any feature that
persists something needs both paths, or it's half-built:

- ONLINE → a table + an RPC, through `supabase.rpc(...)`.
- LOCAL/guest → `localdb` (`va.*` keys) or a per-account `localStorage` key.

Every store follows this shape: a private `isOnline()`, a `load()` that reads
whichever source is authoritative, and a writer that optimistically updates
in-memory state first so the UI is instant. Copy `store/reviews.ts` or
`store/bookAccuracy.ts` — don't invent a third pattern.

**Guest-mode writes must merge onto what's on disk, not onto in-memory state.**
A store is empty after a reload, and a run can finish before anything called
`load()` (deep link straight into a quiz). Merging onto `{}` and writing that
back silently erases everything else. This has already happened once; see the
comment in `store/bookAccuracy.ts:record`.

## Content is deterministic — keep it that way

`getVerseForDate(date)` must return the same verse for the same date for every
player, forever. It's a no-repeat rotation: one fixed shuffle of the whole pool
seeded `'verse-order-v1'`, indexed by day number, so every verse appears once
before any repeat. Changing that seed or the shuffle reshuffles history and
breaks the shared daily drop. Questions are seeded off the date string for the
same reason.

Add verses by appending to `VERSE_POOL` (`src/data/bible/pool.ts`) with full
metadata — the generator needs `speaker`, `audience`, `before`, `after`,
`theme`, `keyword`, `facts` to build its five MCQs.

## Supabase

Migrations live in `supabase/migrations/`, numbered, and are **applied by hand**
against project `visuppaucpzzigwtqmdd` (`verse-arcade`). Nothing applies them on
deploy, so a merged PR whose migration hasn't been run means online accounts hit
a missing table. Apply the schema *before* merging the client.

Numbering has scars: `0034` is used twice (`promo_codes`, `skin_purchases`), and
`0038_focus_practice_xp.sql` is a re-add of a file that shipped as `0036` and was
lost when PR #58 landed from a stale branch. Take the next free number and write
migrations idempotently (`create table if not exists`, `drop policy if exists`,
`create or replace function`) so a re-run is a no-op.

House pattern for writes: a `security definer` function with
`set search_path = public`, `auth.uid()` for identity, validated inputs, and
`grant execute ... to authenticated`. Note that Postgres also grants EXECUTE to
PUBLIC by default and this project never revokes it — all 40 SECURITY DEFINER
functions are `anon`-executable, which the Supabase linter flags. Each one
guards itself with `if uid is null then raise`. Don't tighten one function in
isolation; either leave the pattern alone or fix all of them deliberately.

**Dates are the user's local date.** The client sends `todayLocalDate()` and the
server clamps it to ±1 day rather than trusting it (see `submit_focus_practice`,
`record_book_accuracy`). Streaks and daily caps roll over at the player's
midnight, not UTC.

## Client mirrors server rules — both sides, every time

Reward math exists twice on purpose: once in SQL for online accounts, once in TS
for guests. `lib/practice.ts` ↔ `submit_practice` (0014), `store/focus.ts` ↔
`submit_focus_practice` (0043). Change one, change the other, and say so in the
comment — they already carry "keep in sync with the SQL" notes.

## Shared choke points

`QuizRunner` (`features/daily/QuizRunner.tsx`) owns quiz gameplay and scoring for
*every* mode — daily drop, practice replay, focus drill, CPU race, real battle.
The caller decides what "done" means via `onComplete`. Anything that should
count for all modes belongs here, once, rather than in five screens.

Same idea elsewhere: `CpuVersusQuiz` for anything racing a simulated opponent,
`Page`/`Button`/`Avatar` for chrome, `useJuice()` for sound + haptics + confetti
(respecting the user's reduce-motion and sound settings — always go through it).

## UI conventions

Design tokens live at the top of `src/index.css` — use the CSS variables, never
raw hexes. Numbers and headings wear `var(--font-display)`; that's the brand.
Motion is springy `framer-motion`, mobile-first, max width 520px.

The Study tab is rank-free in the sense that matters: it never puts you head to
head with another player. It is no longer XP-free. Focus practice pays a flat
5 XP per session with **no daily cap** (0043) — a deliberate reversal of the
0038 cap, so players can farm small amounts to give to their church, whose
giving budget is lifetime XP minus what's already been given. That XP is
ordinary XP, so grinding focus practice does move level and the worldwide
leaderboard. That trade was made knowingly; don't "fix" it back to a cap.

Still true: "study the last five" pays only for beating your own best, once per
7 days per verse (0014). That gate is untouched.

For charts, check colorblind separation rather than eyeballing it. The Study
accuracy chart uses mint/gold/coral because green↔amber fails deutan separation
against the card surface (ΔE 5.7); mint↔gold clears it at 17.5. Tiers are also
spelled out in text, so meaning never rides on color alone.

## Deploy

Netlify builds and publishes every push to `main` through its own GitHub
integration, which also posts a deploy preview on every PR. Deploying is *not*
part of CI: `.github/workflows/deploy.yml` was removed because it never had a
`NETLIFY_AUTH_TOKEN` and skipped every step of all 30 runs while reporting
green. Merges to `main` use a **merge commit** titled `<PR title> (#NN)` —
match the existing history.

## Verify by running it, not by reading it

The build passing means very little here — the bugs in this codebase have been
state and persistence bugs that only appear when you actually play. Chromium is
available (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); drive the real app,
seed `localStorage` with a profile to skip onboarding, play a full run, reload,
and check what survived. Both of the last two real bugs were caught that way and
neither was visible in the diff.
