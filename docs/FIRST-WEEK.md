# The first week: onboarding, the low-score result, and one-time cues

Everything here exists to make a new player *feel* "wrong answers just teach
you something" before being told it, and to show them the app's size once
without leaving permanent clutter. Every cue is ONE-TIME, has a "Not now" that
never comes back, counts nothing about anybody else, and retires itself.

## Onboarding (`features/onboarding/Onboarding.tsx`)
Two steps. Step 1 is one real question (Psalm 23:1, "Who wrote these words?").
Any choice reveals the fact with QuizRunner's teach-card language ("Nice!" /
"Good to know"), `juice.correct` / `juice.wrong`, and the same height reveal —
no red, no "wrong". Step 2 is character + username + sound/haptic toggles. The
old "Feel the arcade" demo buttons are gone (the question fires the real
feedback). The music toast is held (`overlayHold`, reason `onboarding`).

## Low-score result (`ResultScreen`, `MissedList featured`)
At 0–1 correct the score is drawn compact (still visible) and the missed list
becomes the peak: per-fact gift cards, staggered spring, "Nothing lost" in its
header, the trivia nudge moved under it. Measured: a zero run's five facts fit a
390×844 phone. A card whose teach line already names the answer leads with the
fact instead of repeating it. Guests' account card shows a three-tile strip
(streak · Upper Room · church giving, "synced") and says it is optional.

## One-time cues (`features/home/FirstWeekCues.tsx`, flags in `store/settings.ts`)
| Cue | When | Retires |
|---|---|---|
| `FirstDropTour` sheet | back on Play after the FIRST daily verse | any tap, Not now, close (`firstDropTourSeen`) |
| its church card (`ChurchMoment`) | signed in: opens IN the tour — find (no church) or give & watch it grow (a church, nothing given); a guest's card opens `/church` | `churchMoment: 'done'` when the tour closes, unless the player tapped Find |
| the give follow-up | only after Find: back with a church, nothing given → one sheet with the give | `churchMoment: 'done'` after one go |
| `ArcadeCue` row | drop done, ≤14 plays, compass not already listing the arcade | lobby opened (`arcadeLobbySeen`) |
| `BibleCue` row | ≥3 verses lit, ≤14 plays | `/bible` opened (`bibleMapSeen`) |

One guided moment, not two: the church flow is the tour's middle card rather
than its own sheet on day 2–3. The sheets only open when Home is otherwise quiet (no tutorial, no
`?chest=1`, no other sheet, last week's recap not pending). The church card's
phase is frozen at the tap, or the give would unmount it as `myGiven` changes.
Church giving uses the store's own `contribute`; the moment is online-only
because a church is.

## Polish pass (2026-10-28)
- `Page`: transform/opacity only (no layout shift); reduce-motion = short fade.
- `WarmPlaceholder`: lamplit pulse that reserves a card's height while it
  loads; first use is Home's church window (it used to pop in ~240px late).
- Nav: locked icons at 0.58 opacity (0.42 lost the painting); no tap-scale
  under reduce-motion.
- Measured at 320 and 390: no horizontal overflow on Play, the run gate,
  Study, Church, Arcade, You; the bottom-most button clears the nav on each.

## Known rough edges (not fixed here)
- Keyless LOCAL build: the Church tab's guest card offers "Sign in / Create
  account" with no backend behind it.
- The church moment and tour were driven only in a keyless build; the give
  phase (online) is reasoned from the store shapes, not driven.
- Unlock toasts (e.g. "Reed Mat") can land at the same moment as the tour
  sheet; they sit above it and don't block it, but the beat is busy.
- Other screens' loading copy ("Reading the yard…", "Looking…") is warm text,
  not a placeholder, and can still shift layout when content arrives.
