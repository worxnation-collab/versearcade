# 1.4.0 on a phone — the TestFlight pass before submitting

`scripts/native-shell.mjs` drives every one of these paths in a faked iOS shell
and they pass there. What it CANNOT prove is the half Apple owns: the real
system sheets, a real APNs token, StoreKit's sandbox, and the entitlements the
build was signed with. That is this list. About 20 minutes; tick as you go.

## Before you start

- [ ] Codemagic build of `main` finished, and its log says all three:
      `OK: com.versearcade.app URL scheme registered`,
      `OK: profile carries Push Notifications`, and the Sign in with Apple
      entitlement line. A build missing one still installs — it just fails one
      section below quietly, so check the log first.
- [ ] Settings → App Store → **Sandbox Account** on the phone is a sandbox
      tester from App Store Connect → Users and Access → Sandbox. Never your
      real Apple ID: a purchase on it is real money.
- [ ] Delete any older Verse Arcade from the phone, then install the build
      from TestFlight.

## 1. Sign in

| Do | Expect |
|---|---|
| You → sign in → **Sign in with Apple** | The system sheet (Face ID), no web page. Lands on today's verse (first time) or Play. |
| Sign out, Sign in with Apple, **cancel** the sheet | Back on sign-in, nothing else opens. |
| Sign out, **Sign in with Google** | An in-app browser (Done button top left, not Safari). Pick the account → "Return to Verse Arcade" → back in the app, signed in, browser gone. |
| Sign out, Google, then tap **Cancel/back** on Google's page | You're returned to the app's sign-in screen with the reason shown, and the browser is gone (fixed in #420). |

If Apple's sheet never appears and it falls straight to the browser: the
entitlement didn't make it into the build, or Supabase's Apple provider is
missing `com.versearcade.app` under Client IDs (CLAUDE.md → "Sign in with
Apple is the SYSTEM SHEET first").

## 2. Push (OWNER-TODO §3 — the last open box)

| Do | Expect |
|---|---|
| Fresh launch | **No** notification prompt. |
| You → gear → **Notes and news** on | The iOS prompt → Allow → switch stays on. |
| Admin → Push → **send yourself a test** | Arrives within a few seconds, phone locked or not. |
| Tap the notification | Opens the screen it names. |
| From a second account, play a battle this account sent | "@name played your battle" arrives. |
| iOS Settings → Verse Arcade → Notifications off, then flip the switch in the app | A line pointing you at iOS Settings, not a silent failure. |

If the test never arrives but the switch is on: check `push-send` logs for an
APNs 400 `BadDeviceToken` — a TestFlight build gets **production** tokens, so
the APNs environment must be production.

## 3. In-app purchase, sandbox

| Do | Expect |
|---|---|
| You → scroll to **"On this rock"** → buy | Apple's sheet says **[Sandbox]**. After paying: Cephas on, thank-you shown, no second checkout. |
| Delete the app, reinstall, sign in → You → Customize → Skins → **Restore purchases** | "Restored 1 item ✓", Cephas wearable again. |
| Restore on an account that bought nothing | "Nothing to restore on this Apple ID." |

**Church plan** (only once OWNER-TODO §4's products exist in App Store
Connect and RevenueCat):

| Do | Expect |
|---|---|
| Sign in as `applereview` → Church → **Leadership tools** | "You also lead · Verse Arcade Demo Chapel · not yet verified →" under the title (new, 0177). |
| Tap it → **Your page** → Plan & billing (open) → For Churches card | "Subscribe with Apple · $X / month" and "/ year", Apple's prices, with Terms and Privacy links. |
| **Don't buy on the demo chapel.** | Buying verifies it, and then App Review can't see the offer. Test the purchase on another unverified church you lead, or tell Claude to un-verify the chapel afterwards. |

## 4. The rest, quickly

- [ ] You → Upper Room → **Postcard** → the iOS share sheet with the picture; "Save Image" works; cancelling says nothing went wrong.
- [ ] In Notes, type `com.versearcade.app://church/f1b2cec8-5a2b-4ca7-824e-8399092ed325` and tap it → the app opens on the demo church (fixed in #420).
- [ ] Airplane mode → open the app → Play, Bible and your church still show; play today's verse → turn the network back on → the play counts (streak goes up).

## When it's all ticked

Tick OWNER-TODO §3's last box (and §4 if the church plan passed), then paste
the review notes and What's New from `docs/APP-STORE-LISTING.md`. If push
didn't pass, cut the NOTIFICATIONS block from What's New before submitting.
