# Verse Arcade — Google Play submission

The Android app is the **same web build** as iOS/web, wrapped with Capacitor. All
the engineering is done and committed. What remains is account-gated stuff only
you can do (create the Play account, generate the keystore, wire up publishing).

Everything below is done on a browser — **zero Android tooling on your Windows PC.**

---

## What's already done (in the repo)

- `android/` native project committed (Capacitor 6). Unlike `ios/` (regenerated on
  CI), Android is committed so customizations survive.
- **OAuth deep link** — `android/app/src/main/AndroidManifest.xml` has the
  `com.versearcade.app://` intent filter, so Google/Apple sign-in returns to the app.
  Because Supabase brokers OAuth, **no new Google/Apple client is needed** — Android
  reuses the exact same redirect + provider config iOS already set up.
- **Release signing hook** — `android/app/build.gradle` reads Codemagic's keystore
  env vars (`CM_KEYSTORE_PATH`, …) and stamps `versionCode` from `BUILD_NUMBER`.
- **Icons + splash** generated for all densities (adaptive icons included).
- **Codemagic workflow** `android-googleplay` in `codemagic.yaml` — builds a signed
  `.aab`.

## One-time setup (you)

1. **Keystore (no Java needed):** Codemagic → *Team settings → Code signing
   identities → Android keystores → Generate keystore*. Reference name **exactly**
   `versearcade_upload`. Codemagic stores it and exposes it to the build.

2. **Play Developer account:** https://play.google.com/console — $25 one-time.
   (Personal accounts now require identity verification; allow a day or two.)

3. **Create the app** in Play Console (name *Verse Arcade*, app, free, category Education).

4. **Play App Signing:** accept it when creating the app — Google holds the real
   signing key; your `versearcade_upload` keystore is just the *upload* key.

5. **(For auto-publish) Service account:** Play Console → *Setup → API access* →
   link a Google Cloud project → create a service account → grant it *Release
   manager* → download the JSON. Add it to Codemagic (this app → *Environment
   variables*) as `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`, group `googleplay`, Secure.
   Then uncomment the `google_play:` block at the bottom of the `android-googleplay`
   workflow.

## First release

- Run the `android-googleplay` workflow in Codemagic (same "Start new build" flow as
  iOS, pick the workflow). It produces `app-release.aab` as an artifact.
- **First AAB must be uploaded by hand** in Play Console → *Testing → Internal
  testing → Create release* → upload the `.aab`. (Auto-publish via the service
  account works for *subsequent* releases.)
- ⚠️ **New personal accounts:** Google requires a **closed test with 12+ testers for
  14 continuous days** before you can apply for production. Start on **Internal**,
  then **Closed testing**, recruit 12 testers, wait 14 days, then apply for prod.

## Listing assets Play needs (that iOS didn't)

- **Feature graphic** 1024×500 PNG/JPG (required).
- Phone screenshots (min 2). `npm run screenshots` writes them; use
  `screenshots/iphone-6.5/` (1242×2688) — Play wants 1080px+ on the long edge and
  the 6.9" set is the same pictures at a taller ratio.
- **Data safety** form (declare: account/email for auth, no data sold; analytics if any).
- **Content rating** questionnaire (IARC) — Verse Arcade is "Everyone".
- Privacy policy URL (reuse the one from the App Store listing).

## Store text (reuse from App Store)

Same title / subtitle / description / keywords as the iOS listing.
