# Your to-do list (checked against production on 2026-10-28)

Ordered quickest and highest-payoff first. Where you hand a key or a decision back, Claude does the rest.

## 1. Supabase SQL editor — about 10 minutes
Paste each of these files from `supabase/migrations/` into Supabase → SQL Editor, one at a time, and run it. All four are safe to re-run.
- [ ] `0147_church_co_leaders_b.sql`: until this runs, **Remove / Step down for co-leaders doesn't work.**
- [ ] `0148_church_auto_week_b.sql`: foreign keys only.
- [ ] `0149_church_discovery_b.sql`: foreign keys only.
- [ ] `0153_church_prayer_list_b.sql`: foreign keys only.
- [ ] Optional: the `church_announcements` policies in `docs/CHURCH-PACKAGES.md` → "Production state". Nothing needs them today.

## 2. Monday digest email — about 20 minutes
- [ ] Create a Resend account and verify the `versearcade.org` sending domain. Resend gives you DNS records to add.
- [ ] Create an API key and add it as Supabase → Edge Functions → Secrets → `RESEND_API_KEY`. It is not in Vault or the repo today, so **no digest has been sent yet**.
- [ ] Decide the timing. Right now the digest goes out Monday morning but the Autopilot cutoff is Monday 9pm, so the email can say "no drafts yet". Pick one:
  - send it Tuesday, or
  - move the default cutoff to Sunday night.

## 3. Native push for the iOS app (`docs/NATIVE-PUSH.md`) — about 45 minutes, plus one build
These steps need your Apple account:
- [ ] Apple Developer → Keys → **+** → tick APNs → download the `.p8` (**it can only be downloaded once**). Write down the Key ID and your Team ID.
- [ ] Apple Developer → Identifiers → `com.versearcade.app` → tick **Push Notifications** → Save.
- [ ] Regenerate the provisioning profile after that change, so Codemagic picks it up.
- [ ] Put the `.p8` contents, Key ID and Team ID in Supabase secrets (names below). **Never paste them into chat or a file.** Then tell Claude they're set.

After that, Claude will:
- patch the `aps-environment` entitlement into `codemagic.yaml`;
- build the APNs sender (`push-send` already has the spot marked);
- turn on the opt-in, followed by one test build.

Suggested secret names: `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`.

Check-ins already push to anyone on web push. Until this is done, the App Store build gets in-app notes only.

## 4. Verified Church plan through Apple (`docs/APPLE-IAP.md` → "Church plan")
The code is merged. It stays invisible until these are done:
- [ ] App Store Connect → Subscriptions → new group "Verified Church" with two products:
  - `com.versearcade.app.church_verified_monthly` (1 month, about $29)
  - `com.versearcade.app.church_verified_yearly` (1 year, about $290)
- [ ] For both: display name "Verified Church"; the review screenshot is the For Churches card on the leadership screen.
- [ ] RevenueCat → import both products.
- [ ] RevenueCat → Integrations → Webhooks:
  - URL: `https://visuppaucpzzigwtqmdd.supabase.co/functions/v1/revenuecat-webhook`
  - Authorization: a long random value.
- [ ] Supabase secret `REVENUECAT_WEBHOOK_AUTH` = that same value.
- [ ] Attach both subscriptions to the next App Store build's review.

## 5. App Store 1.3.0 submission (`docs/APP-STORE-1.3.0-PACKET.md`)
- [ ] Look at App Store Connect to confirm 1.2.0 is still the latest **approved** version. If anything newer is approved, tell Claude before building.
- [ ] Run a fresh Codemagic build from current `main`. The TestFlight build predates weeks of church features.
- [ ] Install it from TestFlight and play one round on a real phone.
- [ ] Ask Claude to refresh "What's New" in `docs/APP-STORE-LISTING.md` from the merged work.
- [ ] Fill in the version record:
  - What's New
  - screenshots
  - the demo account in the review notes
  - attach the church subscriptions from step 4
- [ ] Submit by hand. Codemagic stops at TestFlight on purpose.
- [ ] Rename the IAP display name to **"Founding Patron"**, in two places:
  - App Store Connect (the patron in-app purchase)
  - the product name in the Stripe dashboard

## 6. Check once (these were set up before; confirm they still are)
- [ ] Supabase → Authentication → URL Configuration: the redirect allow-list contains `https://versearcade.org/auth/native/` exactly, **with the trailing slash**.
- [ ] Supabase → Authentication → Providers → Apple: the bundle id `com.versearcade.app` is listed under Client IDs. Without it, native Sign in with Apple quietly falls back to the browser.
- [ ] Supabase → Edge Functions → Secrets: `VAPID_PRIVATE_KEY` is set. Web push depends on it, and so does the new check-in push.

## 7. Google Play (`docs/PLAY-STORE-SUBMISSION.md`) — can wait
- [ ] Play Console account ($25, then ID verification of 1–2 days).
- [ ] Codemagic → generate the keystore, named exactly `versearcade_upload`.
- [ ] Create the app and accept Play App Signing.
- [ ] Upload the first `.aab` by hand to Internal testing.
- [ ] Closed test: **12 testers for 14 days** before you can apply for production. Start this early; it's the long pole.
- [ ] Optional for auto-publish: create a service-account JSON and add it to Codemagic as `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`.

## Later, not blocking
- The US-only "Church plans" web link in the app needs Capacitor 7 (RevenueCat storefront). Ask Claude when you want it.
