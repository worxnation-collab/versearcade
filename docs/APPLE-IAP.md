# Apple in-app purchase — setup runbook

The site sells cosmetic packs through Stripe Payment Links. The App Store build
sells the same catalog through Apple in-app purchase (Review Guideline 3.1.1).
The code for the Apple half is already written and merged:

| Piece | Where |
|---|---|
| Product ids, pack expansion, StoreKit calls | `src/lib/iap.ts` |
| Purchase / restore state, entitlement writes | `src/store/iap.ts` |
| Which store applies, and what price to show | `src/lib/commerce.ts` |
| Server-side fulfillment | `supabase/migrations/0047_apple_iap.sql` |

**Nothing below can be done from a dev machine or from CI — every step needs
your Apple account.** Until it's done the app shows *no* storefront at all,
which is the compliant fallback, not a broken state. You can ship in that state
today; none of this blocks a release.

---

## 1. Paid Applications Agreement (the long pole)

App Store Connect → **Business** → sign the **Paid Applications Agreement**, then
fill in banking and tax (US W-9 plus any regions you sell in).

**You cannot create or even sandbox-test a paid product until this is
"Active".** Bank verification is typically 1–3 business days. Start here.

## 2. Create the products

App Store Connect → your app → **Monetization → In-App Purchases** → **+**, type
**Non-Consumable** for all five (they're permanent unlocks, not subscriptions).

The Product ID must match `APPLE_PRODUCT_IDS` in `src/lib/iap.ts` **exactly** — a
typo means the product silently never loads and its tile stays hidden:

| Product ID | Reference name | Price | Replaces on web |
|---|---|---|---|
| `com.versearcade.app.pack_angels` | Angel Pack | $5.99 | `$5.99` pack |
| `com.versearcade.app.skin_moses` | Moses skin | $2.99 | "From $2.99" |
| `com.versearcade.app.skin_esther` | Esther skin | $2.99 | "From $2.99" |
| `com.versearcade.app.skin_elijah` | Elijah skin | $2.99 | "From $2.99" |
| `com.versearcade.app.patron_founding` | Founding Patron | $9.99 | `$9.99` |

**The last row is the only one still on sale, and its product id outlives the
skin it grants.** It sold Jonah's whale and now sells `cephas` (the rock) plus
the Cornerstone card background — the sku in `APPLE_PRODUCT_IDS` changed, the
product id deliberately did not, because an approved product puts the new skin on
sale in every build already on a phone with no submission. Two consequences:

- **Name it for the tier, not the skin.** The reference name and, more
  importantly, the *display name* a buyer sees on Apple's purchase sheet should
  read "Founding Patron". If it currently names the whale, edit it — an IAP
  metadata change goes to review while the approved version stays purchasable,
  so there is no gap in sales. Nothing else Apple holds is user-visible: the app
  reads only `priceString` off a StoreKit product and drops its display name.
- **`iap-fulfill`'s map is what a purchase is WORTH.** That product id maps to
  `cephas` there, so a patron who taps Restore is granted the rock; their whale
  row is untouched, because grants union and never remove.

Two deliberate changes from the web catalog, both forced by Apple's pricing
model:

- **Pay-what-you-want is gone.** Apple sells at fixed price points only, so
  "From $2.99" became a flat $2.99. The patron tier is now a flat $9.99 on
  both sides, so this no longer diverges — but the rule stands for anything
  priced later.
- **Prices in the app are Apple's, not ours.** The app displays the localized
  price StoreKit returns (£, €, ¥). The `price` strings in `src/data/avatar.ts`
  are the *web* prices and never render on native.

Each product needs a screenshot and a review note before it can be submitted.

## 3. RevenueCat

> **Do not use the Test Store.** RevenueCat's onboarding offers one, and it is
> the wrong path here: it simulates purchases entirely inside RevenueCat, never
> touches StoreKit, and uses a *separate* API key that must never ship. Worse
> for us, a Test Store key would make `storefrontEnabled()` true with fake
> products. Choose **New app configuration → App Store** instead.

1. Create a project at [app.revenuecat.com](https://app.revenuecat.com), add an
   **App Store** app with bundle id `com.versearcade.app`.
2. Upload an **In-App Purchase Key**, *not* the App-Specific Shared Secret.

   This one is easy to get wrong and expensive when you do. We pin
   `@revenuecat/purchases-capacitor@9.2.2` → `PurchasesHybridCommon 13.26.0` →
   `RevenueCat 5.20.0` — purchases-ios **v5**, which uses **StoreKit 2** by
   default. RevenueCat requires the In-App Purchase Key for StoreKit 2; the
   shared secret is the StoreKit 1 path. With only the shared secret,
   transactions are not recorded against the subscriber — the purchase succeeds,
   Apple takes the money, and `iap-fulfill` asks RevenueCat what the user owns
   and is truthfully told "nothing". Silent, and indistinguishable from a bug in
   our code.

   Generate it at App Store Connect → **Users and Access → Integrations →
   In-App Purchase → +**, download the `.p8` (once only), and upload it to
   RevenueCat with its Key ID and Issuer ID.
3. Import the five products above.
4. Copy the **public iOS SDK key** (`appl_...`) *and* a **secret API key**
   (RevenueCat → Project settings → API keys). They go to different places and
   must not be swapped.

The **public** key goes to Codemagic → **Environment variables** as
`REVENUECAT_IOS_KEY` in the **`appstore`** group; `codemagic.yaml` passes it
through as `VITE_REVENUECAT_IOS_KEY`. It only identifies the app and is safe in
the bundle.

The **secret** key goes to Supabase → **Edge Functions → Secrets** as
`REVENUECAT_SECRET_KEY`. It must never reach the client — it is what lets the
server ask RevenueCat what someone actually bought.

> **Order matters.** The public key is the switch that turns the storefront on
> (`commerce.ts` fails closed without it). Add it to Codemagic **last** — after
> the migration is applied and `iap-fulfill` is deployed. Otherwise a build
> could take money and have nothing to fulfill it with.

## 4. Apply the migration

`supabase/migrations/0047_apple_iap.sql`, by hand against `verse-arcade`
(`visuppaucpzzigwtqmdd`), **before** shipping a build that can purchase — same
rule as every migration here. It's idempotent, so re-running is a no-op.

It creates the `apple_purchases` ledger and **no client-callable grant path at
all**. That absence is the point.

An earlier version of this file did expose an RPC, `fulfill_apple_purchase`,
which granted what the caller asked for after re-deriving what the sku was
worth. That stopped a client asking for *more* than it paid for, but nothing in
it established that a purchase had happened — so any signed-in user could have
taken every paid cosmetic for free. It was never applied; the migration was
rewritten before its first run (issue #88), and it now drops that function if a
branch or local stack ever created it.

## 4b. Deploy the fulfillment function

```bash
supabase functions deploy iap-fulfill --project-ref visuppaucpzzigwtqmdd
```

`iap-fulfill` is where verification lives. The client sends **nothing** about
the purchase — it asks the server to settle up, and the server asks RevenueCat
what that subscriber owns, using the secret key, then expands each product
through `pack_skins()` (the same authority the Stripe path uses) and grants via
`grant_skins()`, which is `service_role`-only. A tampered client gains nothing.

It fails closed: with `REVENUECAT_SECRET_KEY` unset it returns 503 and grants
nothing, rather than falling back to trusting the caller.

## 5. Sandbox test

App Store Connect → **Users and Access → Sandbox → Test Accounts** → create one
(use an email you control that is *not* your Apple ID). On the device: sign out
of the App Store, install a TestFlight build, buy, and check:

- the price shown is Apple's, in the sandbox account's currency
- the skin is wearable immediately after purchase
- **delete and reinstall → "Restore purchases" gets it back** (Apple tests this
  and rejects apps where it fails)
- cancelling the sheet leaves no entitlement and shows no error

## 6. Submit

The **first** in-app purchase must be submitted together with an app version —
attach all five products to the build in App Store Connect. Later products can
be submitted on their own.

---

## What is deliberately *not* sold in the app

- **The "Support Verse Arcade" button.** Pay-what-you-want outside IAP; web only.
- **Promo-code skins** (`Day One`). Redeemed free with `redeem_code`, never sold,
  so they stay visible on native exactly as on web.
- **Earned skins** (Baldwin, David, Take Up Your Cross). Unlocked by shared days
  and referrals — no money involved, identical in both builds.
- **Anything already owned.** A pack bought on the website stays wearable and
  visible on the profile in the app. Letting someone *use* content they bought
  elsewhere is always fine, and the app never links to, names, or prices the
  website's checkout.

## Why not just link to Stripe from the app?

On the **United States storefront** you now could. After the Epic v. Apple
injunction, Apple's guidelines say the entitlements "are not required for
developers to include buttons, external links, or other calls to action in their
United States storefront apps" — no entitlement, and no Apple commission.

That exception is US-only; every other storefront still prohibits linking out.
Since the storefront is a per-device runtime fact, this app takes the single path
that is correct everywhere and sells through IAP.

It's worth revisiting, because it's real money: Apple takes 15% under the Small
Business Program (30% above $1M/yr) against Stripe's ~2.9% + 30¢ — about $0.90 vs
$0.47 on a $5.99 pack, and $15 vs $3.20 on the $99.99 patron tier. Adding a
US-only Stripe path means asking StoreKit for the storefront country and
branching in `lib/commerce.ts` — and nowhere else.
