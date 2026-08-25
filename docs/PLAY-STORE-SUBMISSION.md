# Verse Arcade — Google Play submission

The Android app is the **same web build** as iOS/web, wrapped with Capacitor. The
engineering is done and committed, including the Capacitor 8 / targetSdk 36
upgrade Play requires. What remains is account-gated: create the Play account,
generate the keystore, fill in the listing, run the closed test.

Everything below is done in a browser — **zero Android tooling on your Windows PC.**

**v1 ships with the shop hidden.** That is a deliberate choice, not an oversight —
see "Commerce" below.

---

## What's already done (in the repo)

- **Capacitor 8**, which is what makes this shippable at all: Play requires
  `targetSdk` 36 for every new app and update from **31 August 2026** (35 before
  that), and Capacitor pins the target SDK to its major version. The old
  Capacitor 6 project targeted 34 and would have been refused at upload.
  `android/variables.gradle` holds the numbers — don't raise them without raising
  Capacitor, and don't raise Capacitor without re-testing the iOS build too.
- `android/` native project committed. Unlike `ios/` (regenerated on CI), Android
  is committed so customizations survive.
- **OAuth deep link** — `AndroidManifest.xml` has the `com.versearcade.app://`
  intent filter, so Google/Apple sign-in returns to the app. Because Supabase
  brokers OAuth, **no new Google/Apple client is needed** — Android reuses the
  exact redirect + provider config iOS already has.
- **Edge-to-edge handled.** Android 15+ forces it and targetSdk 36 has no opt-out.
  Capacitor injects the real window insets as `--safe-area-inset-*`, and
  `src/index.css` reads them with an `env()` fallback so one expression is right
  on Android, iOS and the web.
- **No `SCHEDULE_EXACT_ALARM`.** The local-notifications plugin declares it; we
  strip it in our manifest and pass `isExactNotification: false`. Exact alarms are
  a restricted permission for alarm-clock and calendar apps — asking for one here
  invites a rejection, and the plugin's default would also throw players out to
  the system "Alarms & reminders" screen on every app resume.
- **Store links are platform-aware.** Before this, the in-app "leave a review"
  nudge opened *apps.apple.com* on Android. See `src/lib/appStore.ts`.
- **Release signing hook** — `android/app/build.gradle` reads Codemagic's keystore
  env vars and stamps `versionCode` from `BUILD_NUMBER`.
- **Icons + splash** generated for all densities (adaptive icons included).
- **Codemagic workflow** `android-googleplay` builds a signed `.aab` and asserts
  `versionName` matches `package.json` before it does.

A signed release AAB has been built from this tree (Gradle 8.14.3 / AGP 8.13.0 /
JDK 21) and its merged manifest verified: `targetSdk=36`, `minSdk=24`,
`versionName=1.2.0`, `POST_NOTIFICATIONS` present, `SCHEDULE_EXACT_ALARM` absent.

## Commerce: why v1 sells nothing on Android

`lib/commerce.ts` fails closed — on native, the storefront appears only once the
store has actually returned products. `lib/iap.ts` only knows Apple product ids
and only reads `VITE_REVENUECAT_IOS_KEY`, so on Android `iapAvailable()` is false
and **the whole marketplace stays hidden**. That's compliant and shippable; it
just earns nothing on Android.

Everything else is identical to iOS: earned skins, promo-code skins, churches,
battles, and every cosmetic the player already owns — including packs bought on
the website, which stay wearable.

The bundled Play Billing library is **8.3.0** (via RevenueCat 13.x), which already
satisfies Play's 31 August 2026 Billing-8 requirement — so turning billing on
later is a code change, not another dependency migration. To sell on Play you
would need, in code: a `goog_` RevenueCat key, a Play product-id map beside the
Apple one in `src/lib/iap.ts`, and those same ids added to `SKU_BY_PRODUCT_ID` in
`supabase/functions/iap-fulfill/index.ts`. Out of code: products created in Play
Console and a Play service account linked into RevenueCat.

## One-time setup (you)

**You do NOT add a new application in Codemagic.** A Codemagic application is a
connected *repository*, and this repo is already connected for the iOS build.
Both workflows live in the one `codemagic.yaml`, so you pick the workflow when
you start the build: *Start new build → choose branch → choose
`Verse Arcade — Android Google Play`*. Adding the repo a second time would just
give you two apps fighting over the same `$BUILD_NUMBER`.

What you do add, inside that existing app/team:

1. **Keystore (no Java needed):** Codemagic → *Team settings → Code signing
   identities → Android keystores → Generate keystore*. Reference name **exactly**
   `versearcade_upload`. Codemagic stores it and exposes it to the build.

2. **Play Developer account:** https://play.google.com/console — $25 one-time.
   Personal accounts require identity verification; allow a day or two.

3. **Create the app** in Play Console (name *Verse Arcade*, app, free, category
   Education).

4. **Play App Signing:** accept it when creating the app — Google holds the real
   signing key; your `versearcade_upload` keystore is just the *upload* key.

5. **(For auto-publish) Service account:** Play Console → *Setup → API access* →
   link a Google Cloud project → create a service account → grant it *Release
   manager* → download the JSON. Add it to Codemagic (this app → *Environment
   variables*) as `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`, group `googleplay`, Secure.
   Then uncomment **both** the `groups: - googleplay` block and the `google_play:`
   block in the workflow — they go together. Until then both stay commented out,
   because Codemagic fails any build that references a variable group which
   doesn't exist yet, and skipping that is one wasted build.

## First release

- Run the `android-googleplay` workflow in Codemagic. It produces
  `app-release.aab` as an artifact.
- **The first AAB must be uploaded by hand** in Play Console → *Testing → Internal
  testing → Create release*. Auto-publish via the service account works for
  *subsequent* releases.
- ⚠️ **New personal accounts:** Google requires a **closed test with 12+ testers
  opted in for 14 continuous days** before you can apply for production, and since
  2026 it also checks the testers genuinely used the app. A tester who opts out and
  back in restarts their clock. Start on **Internal**, then **Closed testing**,
  recruit 12, wait 14 days, then apply for production.

## Listing assets Play needs (that iOS didn't)

- **Feature graphic** 1024×500 PNG/JPG (required) — `docs/play-assets/feature-graphic.png`.
- Phone screenshots (min 2). The iOS 1284×2778 shots work — Play accepts 16:9–9:16,
  1080px+ on the long edge.
- **Data safety** form. Declare: account/email for auth, no data sold. It also asks
  for a **deletion URL reachable without the app** — use
  `https://versearcade.org/privacy.html#delete`, which documents both the in-app
  path (Profile → Delete my account) and the email request route.
- **Content rating** questionnaire (IARC) — Verse Arcade is "Everyone".
- **Target audience & content** — answer honestly; declaring children in the
  audience pulls the app into the Families policy program and its extra review.
- Privacy policy URL: `https://versearcade.org/privacy.html`.

## Store text (reuse from App Store)

Same title / subtitle / description as the iOS listing.

## Still missing on Android (deliberate, not blockers)

- **Push notifications.** No `google-services.json` ⇒ no FCM ⇒ battle-invite push
  doesn't arrive on Android. The daily verse and study nudges are *local*
  notifications and work fine. Add Firebase when battle invites matter.
- **No in-app purchases**, per "Commerce" above.
