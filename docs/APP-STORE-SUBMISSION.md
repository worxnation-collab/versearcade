# Verse Arcade → App Store: the ordered runbook

This is the single path from "code on GitHub" to "in App Store review," on Windows,
with no Mac. Do the phases in order. Each step says who does it:
🧑 = you (browser clicks) · 🤖 = already done in the codebase · ☁️ = Codemagic (automatic).

Legend of the other docs:
- Apple identifiers / Sign in with Apple keys → `SETUP-APPLE.md`
- Listing copy, keywords, privacy answers, review notes → `APP-STORE-LISTING.md`
- The build pipeline → `codemagic.yaml`

---

## Phase 0 — Prerequisites (🧑, ~15 min)
1. **Apple Developer Program** membership, enrolled and paid ($99/yr).
   Confirm at <https://developer.apple.com/account> you can reach "Certificates,
   Identifiers & Profiles."
2. Repo is on GitHub (`worxnation-collab/verse-arcade`). Push if you haven't:
   ```bash
   git push -u origin main
   ```

## Phase 1 — Apple identifiers (🧑, ~15 min)
Follow **`SETUP-APPLE.md` §1–§3**. This registers:
- the **App ID** `com.versearcade.app` (with Sign in with Apple),
- the **Services ID** + **.p8 key** for Sign in with Apple (also used by Supabase).

You do NOT create distribution certificates or provisioning profiles by hand —
Codemagic does that automatically in Phase 4.

## Phase 2 — App Store Connect app record (🧑, ~10 min)
1. <https://appstoreconnect.apple.com> → **Apps → + → New App**.
2. Platform **iOS**; Name **Verse Arcade**; Primary language **English (U.S.)**;
   Bundle ID **com.versearcade.app**; SKU **versearcade-ios-001**.
3. After it's created, open **App Information** and note the **Apple ID** (a long
   number) — paste it into `codemagic.yaml` as `APP_STORE_APPLE_ID`.

## Phase 3 — App Store Connect API key for Codemagic (🧑, ~5 min)
1. App Store Connect → **Users and Access → Integrations → App Store Connect API**.
2. **+** to generate a key with **App Manager** access. Download the **.p8**
   (once only). Note the **Key ID** and the **Issuer ID** (top of the page).
3. Go to <https://codemagic.io> → sign in with GitHub → add the `verse-arcade` repo.
4. Codemagic → **Teams/User settings → Integrations → App Store Connect → Add key**.
   - Name it **exactly** `VerseArcade` (this matches `integrations:` in `codemagic.yaml`).
   - Upload the .p8, paste Key ID + Issuer ID.

## Phase 4 — First build to TestFlight (☁️, ~20 min, mostly waiting)
1. In Codemagic, open the `verse-arcade` app → it detects `codemagic.yaml`.
2. Start the **"Verse Arcade — iOS App Store"** workflow (branch `main`).
3. Codemagic will: install deps → `vite build` → `cap add ios` → `pod install` →
   auto-create signing cert + profile → build a signed IPA → upload to **TestFlight**.
4. First run may fail if a value is off (e.g. `APP_STORE_APPLE_ID` still `0000000000`,
   or the integration name doesn't match). Read the log, fix, re-run. This is normal.
5. Success → the build appears in App Store Connect → **TestFlight** (a few min to process).

> **Strongly recommended even though your goal is public review:** install the
> TestFlight build on your iPhone and play through it once. It's free, automatic, and
> catches a crash-on-launch before a reviewer does (a top rejection reason). To do it:
> App Store Connect → TestFlight → enable internal testing → install the TestFlight app
> on your iPhone with your Apple ID.

## Phase 5 — App icon (🤖 source ready / ☁️ applied at build)
The icon source lives at `assets/icon.png` (1024×1024) and `assets/splash.png`.
`codemagic.yaml` regenerates the full iOS icon set from it during the build via
`@capacitor/assets`. To change the icon, replace `assets/icon.png` and push.

## Phase 6 — Fill the listing (🧑, ~30 min)
In App Store Connect → your app → the version (e.g. **1.0**), paste from
**`APP-STORE-LISTING.md`**:
- Name, Subtitle, Promotional text, Description, Keywords.
- **Support URL** `https://versearcade.org/support.html`
- **Privacy Policy URL** `https://versearcade.org/privacy.html`
  (until DNS is live, use the `verse-arcade.netlify.app` versions — they work now).
- **App Privacy** questionnaire → use the table in the listing doc. Key point: **no tracking**.
- **Age rating** → answer "None" to all → lands at **12+**. Do **NOT** check "Made for Kids."
- **Category**: Education (primary), Lifestyle (secondary).
- **Notes for reviewer** → paste from the listing doc, and fill in a demo account
  (create one real account in the app first).

## Phase 7 — Screenshots (🧑, ~20 min)
Apple requires **6.7-inch iPhone** screenshots at **1290 × 2796 px** (min 3, max 10).
Three ways, easiest first:
- **A. Real device (nicest):** open the TestFlight build on an iPhone 15/16 Pro Max
  (or any 6.7" iPhone), play, and screenshot. Dimensions are already correct.
- **B. Browser emulation (no device):** open <https://versearcade.org> (or the
  netlify URL) in Chrome → DevTools (F12) → device toolbar → set a custom device
  1290 × 2796 → capture full-size screenshots of the 6 screens listed in the listing doc.
- **C. Ask me:** I can attempt to capture them from the running app at iPhone size and
  hand you PNGs (works when the preview can render; otherwise fall back to A or B).

Upload the 6 shots in the order recommended in `APP-STORE-LISTING.md`.

## Phase 8 — Submit for review (🧑, ~2 min)
1. Ensure the processed TestFlight **Build** is attached to the 1.0 version.
2. Answer **Export Compliance** (uses standard HTTPS encryption only → typically
   "No" to the question about non-exempt encryption; the app adds no custom crypto).
3. **Add for Review → Submit**. Typical review time: 24–48 hours.
4. When you're confident, you can also flip `submit_to_app_store: true` in
   `codemagic.yaml` so future builds auto-submit — but for v1, submitting manually
   in App Store Connect gives you the final eyes-on before it goes live.

## Phase 9 — Shipping an update (🧑 + ☁️, ~5 min of your time)

**A version that has been approved can never be uploaded again.** Its "train" closes,
and App Store Connect refuses any further build carrying that number. Builds 22 and 23
died exactly here — signed fine, archived fine, then the upload came back with `90062`
("must contain a higher version than that of the previously approved version [1.0]")
and `90186` ("the train version '1.0' is closed for new build submissions"). Nothing
was wrong with the key, the certificate, or the profile. The rejection arrives ~20
minutes into a signed archive, so guessing low costs a whole build.

**Where we are: 1.2.0 is the live, approved version, so its train is CLOSED.**
`package.json` and `android/app/build.gradle` now carry **1.3.0**, which has never
been uploaded — that is the number the next archive will build, and it is already
strictly higher than what is approved.

**1.3.0's train is open, so keep landing features under that number** — an unuploaded
version absorbs any amount of work, and a per-feature bump just burns numbers. Bump
again only once 1.3.0 itself is approved. What a new feature changes is "What's New",
not the version.

So far 1.3.0 carries live battles (`/battle/live`) and the weekly church rivalry, and
more is expected before it goes up — treat the list in `APP-STORE-LISTING.md` as a
running draft and re-read it against `git log` on the day you submit, not before.
**Also check the uploaded 1.2.0 binary before trusting that split**: if live battles
were inside it, trim them rather than announcing a feature the store already showed
people.

This paragraph is a claim about App Store Connect, not about the repo, and nothing in
CI verifies it. It has gone stale once already. Re-read it against the real console
every release, and update it in the same commit as the bump.

For the release after this one:

1. Bump `"version"` in **`package.json`** — the source of truth. Strictly higher than
   the last *approved* version (check App Store Connect for what is actually approved,
   not what the repo last said).
2. Bump `versionName` in **`android/app/build.gradle`** to the same string, so the
   two stores don't drift.
3. Rewrite the "What's New" block in `APP-STORE-LISTING.md` for the new version.
4. Push to `main`. `codemagic.yaml` reads the version out of `package.json`, patches
   `MARKETING_VERSION` into the regenerated Xcode project, and asserts it landed in
   both build configurations before archiving. The build number (`CFBundleVersion`)
   is Codemagic's `$BUILD_NUMBER` and takes care of itself.

Do **not** bump the version by editing `ios/` — that directory is not committed and
is regenerated by `cap add ios` on every build, so the Capacitor template default
(`MARKETING_VERSION = 1.0`) comes back every time. The patch in `codemagic.yaml` is
the only thing standing between you and that default.

### Submitting: Codemagic gets it to TestFlight, you press Submit

`submit_to_testflight` and `submit_to_app_store` are BOTH `false` on purpose, and the
build still reaches TestFlight either way — uploading is what the `app_store_connect`
publishing block does, and those two flags only decide whether Codemagic then submits
the uploaded build to one of Apple's two review queues. Codemagic builds, signs,
uploads and stops. You install it, play a round, and submit by hand — which keeps a
real device between the archive and the reviewer, and crash-on-launch is the top
avoidable rejection.

> **`submit_to_testflight` is about EXTERNAL testers, not about reaching TestFlight.**
> It was `true` and it failed a build that had already uploaded and processed
> perfectly: *"Complete test information is required... missing required Beta App
> Information: Feedback Email... Beta App Review Information: First Name, Last Name,
> Phone Number, Email."* That is Apple's gate on TestFlight **beta review**, which only
> applies to testers outside your team. Internal testing — you, on your own phone, up
> to 100 people — needs none of it. If you ever do want outside testers, fill the test
> info once at
> <https://appstoreconnect.apple.com/apps/6798202287/testflight/test-info> and flip the
> flag back.

The order that works:

1. **Push to `main`.** Codemagic builds and uploads; the build shows up in App Store
   Connect → TestFlight a few minutes later, once Apple finishes processing.
2. **Install it from TestFlight and play a round.** This is the step auto-submit would
   have skipped. Open the app cold, play today's verse, open the You tab, tap your own
   figure and pray one — the paths that changed most this release.
3. **Fill the version record** in App Store Connect (**+ Version or Platform** → the
   version in `package.json`):
   - [ ] Description, keywords, support + privacy URLs, category, age rating.
   - [ ] **"What's New" pasted in** from `APP-STORE-LISTING.md`.
   - [ ] Screenshots (6.7" iPhone, 1290 × 2796, at least 3).
   - [ ] App Privacy answers — the table in the listing doc. No tracking.
   - [ ] **Demo account credentials in the review notes.** Mandatory since the account
         wall: a reviewer without them sees four padlocked tabs, which reads as
         Guideline 2.1.
4. **Attach the processed build** to that version.
5. **Add for Review → Submit.** Export compliance needs no answer — the build writes
   `ITSAppUsesNonExemptEncryption=false` into Info.plist, so the "Missing Compliance"
   gate never appears.

Typical review: 24–48 hours. Choose **manual release** on the version so the app goes
live when you press Release rather than the instant review passes.

If you ever want CI to submit for you, `codemagic.yaml` says exactly which three keys
to set and what the trade is — everything in step 3 must be complete *before* the
build lands, or the publishing step fails after a good 20-minute archive.

---

---

## Likely rejection traps (already handled 🤖, but verify)
- ✅ **In-app account deletion** — Profile → Delete my account (Guideline 5.1.1(v)).
- ✅ **Sign in with Apple** offered alongside Google (Guideline 4.8).
- ✅ **No external payment links** for digital goods. 1.0 shipped with no paid
   features at all; from 1.0.1 the native build hides the storefront entirely
   and sells only through Apple IAP (see `docs/APPLE-IAP.md` and `lib/commerce.ts`).
   From 1.2.0 there is exactly ONE product — the founding-patron tip. Say so in the
   review notes: metadata that claims "no in-app purchases" while the binary carries
   StoreKit is its own rejection.
- ✅ **Sound/haptics can be silenced** (Settings).
- ✅ **Privacy Policy + Support URLs** live and reachable.
- ⚠️ **The account wall is the #1 metadata trap now.** Guest-first stopped being the
   whole story when `WALL` landed in `App.tsx`: a guest gets today's verse and their
   own profile, and Battle, Study, Bible and Church show a padlock. A reviewer without
   credentials sees four locked tabs, which reads as "features behind a login"
   (Guideline 2.1). **The demo account is now mandatory**, and the review notes must
   say plainly that the padlocks are deliberate. Both are handled in
   `APP-STORE-LISTING.md` — fill in the credentials before you submit.
- ⚠️ **Crash on launch** is the #1 avoidable rejection — do the Phase 4 TestFlight
   smoke test on a real device.

## Age rating — the one strategic call
Verse Arcade is for a "younger audience," but we deliberately target **12+, not the
Kids Category.** Reasons: the Kids Category triggers COPPA obligations (verifiable
parental consent, no third-party analytics, parental gates) and much heavier review.
12+ reaches the same teen audience with none of that overhead. If you ever want the
under-13 market, that's a separate, larger project — talk to me first.
