# 1.3.0 → App Store: the submission packet

Everything App Store Connect will ask for, in the order it asks, for the update
whose build is **already on TestFlight**. The runbook (`APP-STORE-SUBMISSION.md`)
is the whole pipeline from an empty account; this is the short path for one
update. The copy lives in `APP-STORE-LISTING.md` and is not duplicated here
except for "What's New", which is the one block you have to paste today.

**An update carries its own metadata forward**, so most of the record needs
nothing. What this one changes: **What's New**, the **build**, the
**screenshots**, the **demo account** in the review notes — and, this release,
the **description, promotional text and keywords**, which were written for 1.0
and had gone stale enough to be worth replacing. Subtitle, support and privacy
URLs, category and age rating are untouched.

---

## 0 — The two checks this repo cannot make for itself

Do these first. Both have silently cost a build before. The first is now answered.

- [x] **What is APPROVED.** Confirmed on 2026-09-09 by the app's owner reading the
      console: **1.2.0 is live**, so `package.json`'s **1.3.0** is strictly higher
      and its train is open. No bump. (Kept as a step because it is the check that
      has gone stale silently before — an approved version's train is closed and a
      build carrying it is rejected, `90062` + `90186`, twenty minutes into a signed
      archive.)
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

**Which SLOT you drop a file into is what decides whether it is accepted**, and
this is the one that bit on the first attempt: App Store Connect validates a
screenshot against the display size of the slot and refuses a mismatch — *"The
dimensions of one or more screenshots are wrong"* — even though the file is a
perfectly good screenshot. So both sizes are generated:

| Slot on the record | Folder | Pixels | Slot also accepts |
|---|---|---|---|
| **iPhone 6.9" — the one to fill** | `docs/app-store/screenshots/6.9-1290x2796/` | 1290 × 2796 | 1260 × 2736, 1320 × 2868 |
| iPhone 6.5" — legacy, optional | `docs/app-store/screenshots/6.5-1284x2778/` | 1284 × 2778 | 1242 × 2688 |

**Fill the 6.9" slot and you are done — it covers every other size.** Its own help
text says so: *"we'll use these screenshots for all iOS display sizes and
localizations."* So the 6.9" set is the one that matters, and the 6.5" slot is
optional.

What it is NOT is harmless to leave alone. A 6.5" set, if one exists, is what 6.5"
devices are shown — and the three sitting there are from an earlier release, showing
screens this update changed or deleted (a "Bible Battle" page title 1.3.0 removed,
and a Play tab that is two daily boxes now). So either **delete them**, which lets
the 6.9" set serve those devices too, or **replace them** with the 6.5" folder.
Deleting is simpler and is the recommendation.

Note the two slots take disjoint sizes — 6.9" will not accept 1284 × 2778 and 6.5"
will not accept 1290 × 2796 — so a file that is refused is almost always in the
wrong box rather than the wrong size.

Thirteen files in each folder, each **captured at its own viewport** rather than
resized from the other, and `npm run shots` asserts every file against its set's
size before it exits.

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
TestFlight build on a real phone if you want them.

---

## 3b — Description, promotional text, keywords

All three are in `APP-STORE-LISTING.md` under their own headings, already inside
Apple's limits (3,974 / 4,000 · 159 / 170 · 98 / 100). Paste each over what is
there.

- **Description** — rewritten. The old one was written for 1.0: it said "Battle a
  friend" when quick match now puts you against a stranger in one tap, and it never
  mentioned the second daily round, the arcade, the Prayer Wall, the Upper Room,
  praying, or the seals. It is the evergreen pitch, so it describes the app as it
  IS — the changes belong in "What's New" and nothing in it reads as a change log.
- **Promotional text** — the one field that changes with no review at all. Use it
  between releases whenever there is something to say.
- **Keywords** — `battle` out, `prayer` in, `god` → `game`.

**Changing the description sends this version to review, which it is going to
anyway.** Doing it in the same submission costs nothing; doing it later is a
second review for a text edit.

---

## 4 — Review notes, and the demo account

- [x] **The account exists.** `applereview@versearcade.org` is in App Review
      Information → Sign-In Information with "Sign-in required" checked. Its
      password stays there and is deliberately not in this repo.
- [ ] **Play a round on it**, so the profile a reviewer lands on is not empty.
- [ ] **Join a church on it**, so the Church tab shows a congregation and a yard
      instead of the picker. A minute's work, and it turns two screens that look
      unfinished into the ones the description promises.
- [ ] **Replace the Notes text.** `APP-STORE-LISTING.md` § "Review notes" is
      REWRITTEN for 1.3.0 — do not leave what is in the field now.

**The note currently in that field opens with "No account is required", and that
sentence is now a liability.** It was true at 1.0 and stopped being true the moment
the account wall landed: a reviewer who reads it, declines to sign in and then
meets four padlocks has been told by the developer that what they are looking at
should not be there. That is Guideline 2.1 handed over voluntarily — and it also
contradicts the "Sign-in required" box checked directly above it.

The new note also volunteers something 1.3.0 needs: **the Prayer Wall is the first
user-generated text in this app**, so it describes the Guideline 1.2 controls (fixed
categories to strangers, the free line visible only to church-mates and accepted
buddies, report-hides-immediately, no browsing and no way to aim a note at a person)
before a reviewer has to go looking for them.

---

## 5 — The answers that do not change

Already on the record from 1.2.0 and untouched by this update. Confirm rather
than re-enter:

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

## 5b — One availability question worth answering deliberately

The Notes field carries Apple's boilerplate about **Chinese law requiring permits
for apps with religious content** on the China mainland App Store. This app has no
such permit, and Apple has removed Bible apps from that storefront before. Nothing
here is broken by it, but the honest options are: **exclude China mainland** in
Pricing and Availability, or accept that the listing may be refused or pulled
there. It is a checkbox either way and it is better decided than discovered.

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
