# Native push — setup runbook

Web Push already works: `src/lib/push.ts` subscribes the browser and
`save_push_subscription` (0037) stores it. The App Store / Play build cannot use
any of that — an iOS WKWebView has no `PushManager` — so native needs APNs, and
that means a device token instead of a push-service endpoint.

The client half is written and merged:

| Piece | Where |
|---|---|
| Permission, `register()`, token → server | `src/lib/native.ts` → `registerPush()` |
| Token storage + upsert RPC | `supabase/migrations/0053_device_tokens.sql` |
| The opt-in moment (web today) | `src/components/PushNudge.tsx` |

**Everything below needs your Apple account and cannot be done from the repo or
from CI.** Until it's finished nothing calls `registerPush()`, no tokens are
stored, and the app behaves exactly as it does now. That is the correct
fallback, not a broken state — local notifications (`src/lib/reminders.ts`)
already cover the daily verse and study nudges and need none of this.

What native push is actually *for* is the things another human triggers — a
battle invite, or a buddy request being accepted. Those are the ones a server
has to deliver because the person who caused them isn't you.

---

## 1. APNs auth key

Apple Developer → **Certificates, Identifiers & Profiles** → **Keys** → **+**

- Name it something like `Verse Arcade APNs`
- Tick **Apple Push Notifications service (APNs)**
- Download the `.p8` **once** — Apple will not let you download it again
- Record the **Key ID** and your **Team ID**

A key works for every app under the team and for both sandbox and production,
so this is a one-time job.

## 2. Push Notifications capability on the App ID

Same screen → **Identifiers** → `com.versearcade.app` → tick **Push
Notifications** → Save.

Without this, `register()` never calls back at all. That is why `registerPush()`
has a 15-second timeout rather than awaiting a promise that would hang forever.

## 3. The `aps-environment` entitlement

`ios/` is not committed — `cap add ios` regenerates it on every build — so the
entitlement has to be patched in by `codemagic.yaml`, the same way the marketing
version already is. The app needs an entitlements file containing:

```xml
<key>aps-environment</key>
<string>production</string>
```

referenced by `CODE_SIGN_ENTITLEMENTS` in both build configurations, and the
provisioning profile must be regenerated *after* step 2 or it won't carry the
capability and the archive will be rejected at upload.

> Do this on a branch and watch a full archive before merging. A malformed
> entitlement fails ~20 minutes into a signed build, which is the same way
> builds 22 and 23 were lost to the version-bump problem.

## 4. Store the key as a Codemagic / Supabase secret

The `.p8` contents, Key ID and Team ID go in as secrets. They must never be
committed — an APNs key can send notifications to every install of the app.

## 5. The sender

An Edge Function that reads `public.device_tokens` with the service role, signs
a JWT with the `.p8` (ES256, `iss` = Team ID, `kid` = Key ID, refreshed at most
once an hour), and POSTs to:

- `https://api.push.apple.com` for `environment = 'production'`
- `https://api.sandbox.push.apple.com` for `environment = 'development'`

Sending a sandbox token to the production host returns `400 BadDeviceToken`,
which is exactly why the column exists.

Handle `410 Unregistered` by deleting the row — that is Apple telling you the
app was uninstalled, and it is the only reliable way tokens get cleaned up.

## 6. Turn on the call

Only once 1–5 are done: call `registerPush()` from a deliberate opt-in, the way
`PushNudge` does on the web. **Not** from startup.

iOS shows the system permission dialog once per install. Spending it on
notifications that cannot be delivered wastes it permanently — a player who
declines can only be recovered by a trip to Settings, which nobody makes.

---

## Why this matters more than it looks

At the time of writing there is **one** row in `push_subscriptions` across the
entire user base, and **71% of every buddy request ever sent is still
unanswered**. People are inviting each other; the invite is not landing. Web
Push plus the in-app dot (`BottomNav`) covers browser players. Native players
have nothing until the above is done.

Track it on `/admin` → **Growth** → *Growth loops*, which shows the push
subscription count and pending-request share and refreshes every 12 hours.
