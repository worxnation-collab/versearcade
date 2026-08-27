# Verse Arcade — Google Play submission

The Android app is the **same web build** as iOS/web, wrapped with Capacitor. All
the engineering is done and committed. What remains is account-gated: create the
Play account, generate the keystore, create one in-app product, wire publishing.

Everything below is done in a browser — **zero Android tooling on your PC.**

> **Read this first — the deadline is real.** Google Play requires **new apps and
> updates to target Android 16 (API 36) from 31 August 2026** (API 35 before
> that). Play enforces this **at upload**, after a full signed build, the same way
> the App Store rejects a stale version string 20 minutes in. Capacitor pins the
> target SDK to its major version, so hitting API 36 meant moving the app to
> **Capacitor 8** — that's done (see "What changed" below). An extension to
> 1 November 2026 can be requested in Play Console if you need it.

---

## What's already done (in the repo)

- `android/` native project committed (Capacitor 8). Unlike `ios/` (regenerated on
  CI every build), Android is committed so its customizations survive — which is
  why `codemagic.yaml` now **fails** if `android/` is missing rather than
  quietly running `cap add android` and shipping a default project without them.
- **API 36.** `android/variables.gradle` is on Capacitor 8's values (`minSdk 24`,
  `compileSdk`/`targetSdk 36`), AGP 8.13.0, Gradle 8.14.3. CI asserts
  `targetSdkVersion >= 36` before it spends 20 minutes building.
- **Edge-to-edge.** Android 15+ forces it. Capacitor 8's SystemBars plugin feeds
  the real window insets to CSS as `--safe-area-inset-*`, and `src/index.css`
  now reads those with `env()` as the fallback — Android's WebView does *not*
  populate `env()` for system bars, so without this the app would draw under the
  status and navigation bars. The bar style is pinned to `DARK` in
  `capacitor.config.ts` (the default follows the *device* theme, which on a phone
  in light mode paints dark icons onto this app's near-black background).
- **OAuth deep link** — `AndroidManifest.xml` has the `com.versearcade.app://`
  intent filter, so Google/Apple sign-in returns to the app. Because Supabase
  brokers OAuth, **no new Google/Apple client is needed**; Android reuses the
  exact redirect and provider config iOS already has.
- **Release signing hook** — `android/app/build.gradle` reads Codemagic's keystore
  env vars and stamps `versionCode` from `BUILD_NUMBER`. CI now **fails fast** if
  `CM_KEYSTORE_PATH` is unset, because that silently produces an *unsigned* AAB
  that only fails at upload.
- **One version, both stores** — `build.gradle` reads `versionName` straight out
  of `package.json` with `JsonSlurper`. There is no second place to bump and no
  CI step to forget. (iOS still needs the `sed` in `codemagic.yaml` because
  `ios/` is regenerated each build.)
- **No Firebase.** `@capacitor/push-notifications` was a dependency that nothing
  imported (`registerPush` in `src/lib/native.ts` is a stub). It's removed, which
  also removes `google-services.json` as a build requirement.
- **No exact-alarm permission.** `@capacitor/local-notifications` merges
  `SCHEDULE_EXACT_ALARM` into every app that uses it; the manifest removes it with
  `tools:node="remove"`. Play asks you to justify exact alarms, Android 14 makes
  the grant revocable, and a daily verse nudge doesn't need to-the-second
  delivery — the plugin checks `canScheduleExactAlarms()` and falls back to
  `setAndAllowWhileIdle()`, so reminders still fire.
- **Icons + splash** generated for all densities (adaptive icons included).
- **Codemagic workflow** `android-googleplay` in `codemagic.yaml` builds a signed
  `.aab` on Node 22 / Java 21 (both required by Capacitor 8).

## One-time setup (you)

1. **Keystore (no Java needed):** Codemagic → *Team settings → Code signing
   identities → Android keystores → Generate keystore*. Reference name **exactly**
   `versearcade_upload` — it must match `android_signing:` in `codemagic.yaml`.

2. **Play Developer account:** https://play.google.com/console — $25 one-time.
   Personal accounts require identity verification; allow a day or two.

3. **Create the app** in Play Console (name *Verse Arcade*, app, free, category
   Education).

4. **Play App Signing:** accept it when creating the app. Google holds the real
   signing key; your `versearcade_upload` keystore is only the *upload* key.

5. **(For auto-publish) Service account:** Play Console → *Setup → API access* →
   link a Google Cloud project → create a service account → grant it *Release
   manager* → download the JSON. Add it to Codemagic (this app → *Environment
   variables*) as `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`, group `googleplay`,
   Secure. Then uncomment the `google_play:` block at the bottom of the
   `android-googleplay` workflow.

## In-app purchase — the whale, and only the whale

The web sells the whole cosmetic catalog through Stripe. **The app sells exactly
one product: the founding-patron whale.** Everything else stays visible and
wearable if the player already owns it (bought on the website, earned, or
redeemed with a code) — it just isn't for sale inside the app. That decision
lives in `PRODUCT_IDS` in `src/lib/iap.ts`; `src/lib/commerce.ts` hides anything
the store can't actually sell.

**It fails closed, so you can ship before doing any of this.** With no
RevenueCat Android key, `iapAvailable()` is false, no products load, and the
entire marketplace stays hidden — which is a compliant app, just one that doesn't
sell. A shop that *can't take money* is what gets rejected; a hidden one doesn't.

To turn selling on:

1. **Play Console → Monetize → In-app products → Create product.**

   | Field | Value |
   | --- | --- |
   | Product ID | `patron_founding` — must match `PRODUCT_IDS.android.whale` **exactly** |
   | Name | Founding Patron |
   | Price | the local equivalent of $99.99 |

   Play product IDs are already scoped to the package name, so they're short —
   unlike Apple's reverse-DNS `com.versearcade.app.patron_founding`. Both are in
   `src/lib/iap.ts`. A typo here is a product that silently never loads, which
   (fail-closed) shows up as a missing tile rather than a crash.
   **A product ID can never be reused or renamed once created.**

2. **RevenueCat → add an Android app** to the existing Verse Arcade project (the
   same project the iOS app uses — that's what lets a purchase follow the
   *account* across stores). Upload the Play service-account credentials so
   RevenueCat can verify purchases, and add the product.

3. **Copy RevenueCat's public Android SDK key** (`goog_…`) into Codemagic as
   `REVENUECAT_ANDROID_KEY` in the `googleplay` variable group. The workflow
   already passes it through as `VITE_REVENUECAT_ANDROID_KEY`. It's public by
   design — it only identifies the app; the secret key stays server-side.

4. **Redeploy the `iap-fulfill` Edge Function.** Its allowlist now includes the
   Play product ID, and without that redeploy an Android purchase verifies but
   grants nothing:
   ```bash
   supabase functions deploy iap-fulfill
   ```
   That map is deliberately *wider* than what the app sells — it also carries the
   four Apple products that were sellable earlier, because it exists to **honor**
   purchases, not to make them. Never delete a line from it; that revokes a real
   entitlement.

5. Testing purchases requires the app to be on a Play track and your tester
   account added to *License testing* (Play Console → Setup → License testing),
   which makes purchases free.

## First release

- Run the `android-googleplay` workflow in Codemagic. It produces
  `app-release.aab` as an artifact.
- **The first AAB must be uploaded by hand** in Play Console → *Testing →
  Internal testing → Create release*. Auto-publish via the service account works
  for *subsequent* releases.
- ⚠️ **New personal accounts:** Google requires a **closed test with 12+ testers
  running for 14 continuous days** before you can apply for production. Start on
  **Internal**, move to **Closed testing**, recruit 12 testers, wait 14 days, then
  apply. Plan for this — it's the long pole, not the build.
- Once the app is **live on production**, flip `PLAY_LISTING_LIVE` to `true` in
  `src/lib/appStore.ts`. Until then Android web visitors are offered no download
  link, because a testing-track listing 404s for anyone not on the tester list.

## Store listing

- **Feature graphic** 1024×500 PNG/JPG (required) — `docs/play-assets/feature-graphic.png`.
- Phone screenshots (min 2). The iOS 1284×2778 shots work; Play accepts 16:9–9:16
  with 1080px+ on the long edge.
- Title / short description / full description: reuse the App Store listing
  (`docs/APP-STORE-LISTING.md`).
- Privacy policy URL: the same one the App Store listing uses.

## The forms Play makes you fill in

**Data safety** — declare honestly:

| Data | Collected | Why |
| --- | --- | --- |
| Email address | Yes, if they sign in | Account creation/auth (Supabase) |
| Name / username | Yes | Displayed on the player card and ranks |
| Approximate + precise location | Yes, optional | The Church tab's "find churches near me". One-shot, foreground only, **not stored** |
| Purchase history | Yes, if they buy | Entitlement (RevenueCat) |
| App activity | Yes | Streaks, XP, progress |

Say data is **encrypted in transit**, **not sold**, and that users can request
deletion. There is no `ACCESS_BACKGROUND_LOCATION` — that's the one that would
drag in Play's sensitive-permissions declaration form.

**Permissions Play will ask about:** `INTERNET`, `ACCESS_COARSE_LOCATION` /
`ACCESS_FINE_LOCATION` (foreground, Church tab), `POST_NOTIFICATIONS`,
`RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` (the last three merged in by
`@capacitor/local-notifications`, for the daily verse reminder).

**Content rating** (IARC questionnaire) — Verse Arcade is "Everyone".

**Ads** — none. Say so.

## What changed for iOS in this work

The Capacitor 8 upgrade is shared. The iOS workflow now needs **Node 22 and
Xcode 26+**, both already set in `codemagic.yaml`, and Capacitor 8's iOS
deployment target is 15.0 — which the existing `sed` step already enforced, so
that step is now a no-op rather than a change.

The native catalog narrowing to the whale **also applies to iOS**: the Angel
Pack, Moses, Esther and Elijah are no longer offered for sale inside the iPhone
app. Anyone who already bought them keeps them — the server still honors every
one of those product IDs. Bump `package.json`'s `version` before the next iOS
upload; App Store Connect rejects any build whose version isn't strictly higher
than an approved one, and Android now picks that same string up automatically.
