# 1.3.0 → App Store: the submission packet

Everything App Store Connect will ask for, in the order it asks, for the update
whose build is **already on TestFlight**. The runbook (`APP-STORE-SUBMISSION.md`)
is the whole pipeline from an empty account; this is the short path for one
update. The copy lives in `APP-STORE-LISTING.md` and is not duplicated here
except for "What's New", which is the one block you have to paste today.

**An update carries its own metadata forward.** Description, keywords, subtitle,
support and privacy URLs, category and age rating are already on the app record
from 1.2.0 and stay unless you change them. Four things are genuinely per-version:
**What's New**, the **build**, the **screenshots** (optional to replace) and the
**demo account** in the review notes. Everything below is one of those four, or a
check.

---

## 0 — Two things this repo cannot check for itself

Do these first. Both have silently cost a build before.

- [ ] **Read what is actually APPROVED in App Store Connect.** The repo says 1.2.0
      is live and that `package.json`'s **1.3.0** is strictly higher. That is a
      claim about Apple's console, not about this repo, and nothing in CI verifies
      it. An approved version's train is closed: a build carrying it is rejected
      (`90062` + `90186`) about twenty minutes into a signed archive.
- [ ] **Confirm the TestFlight build actually contains what "What's New" claims.**
      Open the build in App Store Connect (or Codemagic) and read the commit it
      was built from, then check it against `git log --first-parent origin/main`.
      The last player-facing merges were **#270 room skins** and **#271 overlay
      skins**, both on 2026-09-08 — a build cut before them will not have the last
      two bullets in the list below. Everything merged after (#272–#275) is the
      TikTok operator tooling and is deliberately not announced.

If the build predates a feature, the fix is to cut the bullet, not to ship the
claim.

---

## 1 — Install it and play it

The one step auto-submit would skip, and crash-on-launch is the top avoidable
rejection. Open the app cold from TestFlight and walk the paths that changed most
this release:

- [ ] Today's verse, all five questions, through to the result screen.
- [ ] Today's trivia round (the second box on the Play tab).
- [ ] The You tab: your figure, the Upper Room, tap yourself and pray one.
- [ ] The arcade: one go on each of the three machines.
- [ ] `/pray` — the Prayer Wall: post a note, kneel at one.
- [ ] The compass, from the Play tab.

---

## 2 — "What's New" (paste as-is)

**3,962 characters against Apple's 4,000.** The source of truth is the fenced
block under `### 1.3.0` in `APP-STORE-LISTING.md`; if you edit one, edit both.

Three things are deliberately absent and each is a judgement, not an oversight:
the **Sharkey** skin (locked to one account — a bullet nobody can act on), **"Watch
yesterday's verse"** (a row that only appears when the TikTok account published
one, so it is not something a player can rely on doing), and the **whole TikTok
engine and operator voice loop** (`/admin` renders nothing for any other account).

---

## 3 — Screenshots

**`docs/app-store/screenshots/` — thirteen PNGs, every one exactly 1290 × 2796**,
which is the 6.7" iPhone size Apple requires. `npm run shots` regenerates them by
driving the real app; the script asserts the size and fails rather than handing you
an upload App Store Connect will refuse.

Upload the first eight, in this order. Minimum is three, maximum ten.

| # | File | What it shows |
|---|------|---------------|
| 1 | `01-play-tab` | The two daily boxes, the road, the compass — the whole tab |
| 2 | `02-verse-read` | The verse, before the clock starts |
| 3 | `03-question` | A question mid-run, points and the five-question rail |
| 4 | `04-teach` | The wrong-answer reveal — the no-shame promise on screen |
| 5 | `05-result` | The score, with "one thing you now know" above the verse |
| 6 | `07-you-room` | The full-length character and the Upper Room under it |
| 7 | `08-study-library` | Tabitha at the desk — the tab that is a room |
| 8 | `10-seals` | The Book Collection, wax pressed per book read |

Spares: `06-arcade`, `09-bible`, `11-wardrobe`, `12-road`, `13-journal`.

Church, Battle and the Prayer Wall are **not** in the set on purpose: they are
online-only, so in a keyless build they draw their own "create an account" card.
That is the honest state and a poor advertisement. Shoot those from the signed-in
TestFlight build on a real 6.7" phone if you want them.

> Existing screenshots carry over if you upload nothing. These are newer than the
> app they show if the last set was captured for 1.2.0 — the Play tab alone is a
> different screen now.

---

## 4 — Review notes, and the demo account

**The demo account is mandatory, not optional.** Since the account wall landed, a
reviewer without credentials reaches today's verse and their own profile and finds
four padlocked tabs, which reads as Guideline 2.1. The notes block in
`APP-STORE-LISTING.md` § "Review notes" is unchanged from 1.2.0 and still correct —
it explains the padlocks, the single in-app purchase, and the read-aloud voices.

- [ ] Create one real account in the app (App Store Connect wants an email and a
      password, not a social sign-in).
- [ ] Play a round on it so the profile is not empty.
- [ ] Paste its credentials over the two `[FILL IN]` lines in the notes.
- [ ] Delete it afterwards from inside the app if you want to.

---

## 5 — The answers that do not change

Already on the record from 1.2.0. Confirm rather than re-enter:

- **App Privacy** — the table in `APP-STORE-LISTING.md`. Email, name, user ID and
  gameplay content, all **linked**, **none used to track**. No tracking bucket.
- **Age rating** — 12+, every content question "None", unrestricted web access
  "No". Do **not** check "Made for Kids".
- **Category** — Education primary, Lifestyle secondary.
- **Export compliance** — nothing to answer. The build writes
  `ITSAppUsesNonExemptEncryption=false` into Info.plist, so the "Missing
  Compliance" gate never appears.
- **In-app purchase** — one non-consumable,
  `com.versearcade.app.patron_founding`. **Read its display name in App Store
  Connect**: the founding patron's skin changed from the whale to Cephas, and the
  name should read "Founding Patron", which outlives whichever skin the patron
  currently gets. That is a metadata edit and goes to review while the approved
  version stays on sale, so there is no gap.

---

## 6 — Submit

1. Attach the processed TestFlight build to the 1.3.0 version.
2. Choose **manual release**, so it goes live when you press Release rather than
   the instant review passes.
3. **Add for Review → Submit.** Typical review is 24–48 hours.

Do not bump the version for this. 1.3.0's train stays open until 1.3.0 itself is
approved — and when it is, `CLAUDE.md`'s version paragraph and
`APP-STORE-SUBMISSION.md` § Phase 9 both need updating in the same commit as the
next bump, or the next session inherits the same stale claim this file opens by
warning about.
