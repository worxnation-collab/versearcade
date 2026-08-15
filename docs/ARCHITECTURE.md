# Verse Arcade — architecture & design rationale

## Stack

- **React 18 + TypeScript + Vite** — fast, familiar, ships as static assets.
- **Zustand** — tiny global state (auth, game, groups, settings). No boilerplate.
- **Framer Motion** — springy, interruptible motion (the tactile feel).
- **canvas-confetti** — particle bursts.
- **Web Audio API** — *synthesized* SFX. Zero audio files: every blip/chime is
  generated in `src/juice/sound.ts`, so nothing to license or download and every
  sound is tunable. Master gain respects the volume/mute setting.
- **Supabase** — Auth (email + Google + Apple), Postgres, Row Level Security,
  SECURITY DEFINER functions for authoritative scoring, Edge Functions (optional).
- **Capacitor** — one codebase → web + iOS. Haptics, Preferences, Push, StatusBar,
  SplashScreen. HIG-aware: safe areas, native tab bar, in-app account deletion.

## Two runtime modes (why the app never dead-ends)

`src/lib/supabase.ts` returns `null` if env keys are absent.

- **LOCAL mode** — no backend. Guest profile + plays + cards persist to
  `localStorage` (`src/lib/localdb.ts`). The full solo loop, juice, streaks, XP,
  collectibles, and a *demo* group all work. Solo play is complete on its own.
- **ONLINE mode** — Supabase is the source of truth; scoring/streaks run in
  `submit_play()` so points can't be faked; presence + real groups turn on.

Client scoring (`src/lib/progress.ts`) **mirrors** the server function so LOCAL
mode and optimistic UI behave identically. Keep the two in sync if you tune them.

## Data model

`profiles · daily_verses · plays · answers · presence_events · groups ·
group_members · group_plays · collectibles · user_collectibles`
(see `supabase/migrations/0001_schema.sql`). Highlights:

- One shared drop per day → `daily_verses` keyed by `drop_date`.
- One play per user per day → `UNIQUE(user_id, drop_date)` on `plays`.
- No leaderboard table by design. `presence_events` is a warm, non-ranked feed.
- Groups pool each member's daily score in `group_plays` toward a shared goal.
- `book_accuracy` (0039) keeps an additive correct/answered tally per book of the
  Bible, written by `record_book_accuracy` from every finished run in any mode.
  Guests keep the same shape in localStorage. It feeds the Study tab's review
  chart (`lib/bookAccuracy.ts` → `features/study/BookAccuracyChart.tsx`).

## Folder map

```
src/
  juice/        sound + haptics + confetti + useJuice (the feedback system)
  components/   Button, CountUp, XpBar, StreakFlame, ComboMeter, Avatar, BottomNav, Page
  data/bible/   pool.ts (curated verses+metadata) · questions.ts (deterministic generator)
  data/         collectibles.ts
  lib/          supabase, config (translations/flags/scoring), progress, localdb, date, native
  store/        auth, game, groups, settings (zustand)
  features/     onboarding, auth, home, daily (quiz+result+share), presence, groups, collection, profile
  pages/        Landing (marketing)
```

## Retention & delight decisions (the "why")

Adapted from Wordle / Duolingo / BeReal, tuned for *learning without shame*:

1. **Shared daily drop + countdown** (Wordle ritual). One verse for everyone,
   deterministic by date (`getVerseForDate`) so results are comparable and the
   drop is a genuine appointment.
2. **Streaks with streak-freezes** (Duolingo, but kinder). A missed day is
   silently absorbed by a freeze — loss-aversion motivates without punishing the
   inevitable slip that otherwise makes people quit.
3. **Shame-free wrong answers** (core mission). Every answer — right or wrong or
   timed-out — reveals a genuinely interesting fact. You can't "lose," only learn.
4. **Combo multiplier + count-up points + confetti** — arcade dopamine on the
   core action, so answering *feels* good, not quiz-anxious.
5. **Spoiler-free share card** (Wordle's emoji grid) — flex score/streak without
   leaking answers, so sharing pulls friends in instead of spoiling the drop.
6. **Ambient presence** (BeReal's "everyone at once") — a live opened-count and a
   scrolling feed of usernames earning points. Company, never ranking.
7. **Co-op groups** — climb a shared goal together against the clock; group XP,
   levels, and streaks. Nobody is ranked against a teammate.
8. **Collectible verse cards** — a visible set to complete; each locked card names
   exactly how to earn it, giving a concrete next goal every visit.
9. **Named level tiers + juicy level-up** — escalating XP curve (early levels come
   fast for early dopamine).
10. **Reduce-motion + sound/haptic toggles** — inclusive and Review-friendly.
11. **Per-book accuracy + the Study review chart** — every answer, in every mode,
    rolls up into "how well do I know this book?", ranked weakest first. It's the
    one place the app tells you where you actually stand, and each row is a tap
    into a focus drill on that book — so the honest read arrives with the fix
    attached rather than as a verdict. Deliberately rank-free: no XP, no ladder.
12. **Play for your church** (the Church tab) — pick the church you actually
    attend (found by name against OpenStreetMap near your location), then pour
    points into it. Giving costs the player nothing: lifetime XP is the *budget*,
    not the currency, so the pool only grows by playing and your own rank never
    moves. The church banks that XP on its own slower curve and its **building
    grows with it** — eight tiers from a house gathering to a basilica — and it's
    ranked only against churches within 10–50 miles of it. A real congregation
    of forty can win its own town, which a worldwide board could never offer.

### The Church tab, in files

| Piece | Where |
|---|---|
| Tables, level curve, join/give/board RPCs | `supabase/migrations/0040_churches.sql` |
| Map lookup (Overpass + Nominatim, key-less) | `src/lib/churchSearch.ts`, `src/lib/geo.ts` |
| Level curve + building ladder (mirrors SQL) | `src/features/church/levels.ts` |
| The eight buildings, as flat inline SVG | `src/features/church/ChurchArt.tsx` |
| Screen, picker, local board | `src/features/church/`, `src/store/church.ts` |

Two rules worth keeping if this is ever extended: the client curve in `levels.ts`
and `church_level_from_xp()` must stay identical, and a player's location is used
only to run a search — the only coordinates stored are the church's, which are
public map data. Note `/church` (this tab) is distinct from `/churches`, the
older B2B partnership inquiry funnel.

## Content pipeline (how to scale past the demo pool)

`src/data/bible/pool.ts` ships **18** curated verses with the metadata the
generator needs (speaker, audience, before/after, theme, keyword, facts). The
generator (`questions.ts`) builds 5 verse-specific MCQs with distractors pulled
from other verses, seeded by the date so everyone gets the same quiz.

**To reach 365+/year:** run an offline batch (LLM-assisted metadata extraction +
human review) that writes rows into `daily_verses`, and/or a scheduled Edge
Function that curates tomorrow's drop. Exact BSB text can be fetched live from the
public-domain bible-api (`config.ts → apiTemplate`); the generator only needs the
metadata, so it stays self-consistent either way.

---

## What's stubbed or deferred (and why)

| Item | State | Why |
|---|---|---|
| **iOS native project (`ios/`)** | Not generated | Needs macOS + Xcode; run `npx cap add ios` on a Mac. All Capacitor config + native init code is in place. |
| **Push notifications** | Registration stubbed (`native.ts`) | Full APNs needs an Apple push key **and** a backend scheduler to send the daily "your verse dropped" nudge. Capability + code hook are ready to turn on. |
| **In-app purchase for premium translations** | Gated in config, no purchase flow | Requires an IAP plugin + App Store Connect products (see SETUP-APPLE §5). ESV/NLT/CSB are wired as `premium:true` slots so adding them is config + data, not a rewrite. |
| **Server-side collectible grants** | Awarded client-side, persisted locally | The catalog + RLS tables exist; a `grant_collectible` RPC would move authority server-side. Fine for now; cosmetic. |
| **Real Google/Apple OAuth end-to-end** | Code complete, needs dashboard keys | Providers must be enabled in Supabase + Apple/Google portals (the two checklists). Can't be done from code. |
| **Daily verse cron** | Client self-seeds via `ensure_daily_verse` | Works without a cron. A scheduled Edge Function is the production upgrade for curated/edited drops. |
| **Verse pool size (18)** | Demo pool, cycles by date | Proves the mechanic; production needs the content pipeline above. |
| **Live BSB fetch** | `apiTemplate` configured, not called at runtime | Local pool text keeps the loop offline-first; wire the fetch when you want exact live passages / more verses. |
| **Group realtime** | Poll on load/refresh | Supabase Realtime subscriptions would make the group bar move live; polling is enough for MVP. |
| **Automated tests** | Manual verification done | Logic verified (typecheck + build + runtime checks of the generator/scoring). A Vitest suite on `progress.ts` + `questions.ts` is the natural next add. |

## Verified in this build

- `tsc` typecheck clean, `vite build` succeeds.
- Routes render (landing, onboarding, auth, home hub, quiz read-phase).
- Question generator: 5 verse-specific MCQs, 4 unique options each, valid answers, teach text.
- Scoring/streak: combo multiplier grows, wrong=0, streak advances 6→7, XP matches the server formula, level-up detected.
- No console errors; audio context initializes.
