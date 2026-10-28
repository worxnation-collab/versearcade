# Your to-do list (checked against production on 2026-10-28)

Ordered quickest and highest-payoff first. Where you hand a key or a decision back, Claude does the rest.

## 1. Supabase SQL editor — DONE 2026-10-28 (verified)
Paste each of these files from `supabase/migrations/` into Supabase → SQL Editor, one at a time, and run it. All four are safe to re-run.
- [x] `0147_church_co_leaders_b.sql`: until this runs, **Remove / Step down for co-leaders doesn't work.**
- [x] `0148_church_auto_week_b.sql`: foreign keys only.
- [x] `0149_church_discovery_b.sql`: foreign keys only.
- [x] `0153_church_prayer_list_b.sql`: foreign keys only.
- [ ] Optional: the `church_announcements` policies in `docs/CHURCH-PACKAGES.md` → "Production state". Nothing needs them today.

## 2. Monday digest email — DONE 2026-10-28 (verified; now sends Tuesday 8am)
- [x] Create a Resend account and verify the `versearcade.org` sending domain. Resend gives you DNS records to add.
- [x] Create an API key and add it as Supabase → Edge Functions → Secrets → `RESEND_API_KEY`. It is not in Vault or the repo today, so **no digest has been sent yet**.
- [x] Decide the timing. Right now the digest goes out Monday morning but the Autopilot cutoff is Monday 9pm, so the email can say "no drafts yet". Pick one:
  - send it Tuesday, or
  - move the default cutoff to Sunday night.

## 3. Native push for the iOS app (`docs/NATIVE-PUSH.md`) — Apple side DONE 2026-10-28
- [x] APNs key made, `.p8` downloaded, Key ID + Team ID recorded.
- [x] Push Notifications ticked on `com.versearcade.app`; the stale App Store profile removed.
- [x] `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_P8` set as Supabase function secrets.
- [x] Code: APNs sender in `push-send`, the AppDelegate hooks + `aps-environment` entitlement in `codemagic.yaml`, the opt-in (PushNudge + Settings → Notes and news) and a silent token refresh on sign-in.
- [ ] **One Codemagic build**, then on your phone: install from TestFlight, sign in, Settings → turn on "Notes and news". Then Admin → Push → send yourself a test. The build log should say "OK: profile carries Push Notifications".

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

## 5. App Store 1.4.0 submission (the 1.3.0 packet `docs/APP-STORE-1.3.0-PACKET.md` is the template)
- [x] 1.3.0 turned out to be already approved (Codemagic build 39 was refused for it, 2026-10-28); the repo now carries **1.4.0**.
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
