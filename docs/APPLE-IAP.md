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
| `com.versearcade.app.patron_founding` | Founding Patron | $99.99 | "From $100" |

Two deliberate changes from the web catalog, both forced by Apple's pricing
model:

- **Pay-what-you-want is gone.** Apple sells at fixed price points only, so
  "From $2.99" becomes a flat $2.99 and the $100 patron tier becomes $99.99
  (the nearest tier). The website keeps pay-what-you-want through Stripe.
- **Prices in the app are Apple's, not ours.** The app displays the localized
  price StoreKit returns (£, €, ¥). The `price` strings in `src/data/avatar.ts`
  are the *web* prices and never render on native.

Each product needs a screenshot and a review note before it can be submitted.

## 3. RevenueCat

1. Create a project at [app.revenuecat.com](https://app.revenuecat.com), add an
   **App Store** app with bundle id `com.versearcade.app`.
2. Paste the **App Store Connect Shared Secret** (App Store Connect → your app →
   **App Information → App-Specific Shared Secret**) so RevenueCat can validate
   receipts.
3. Import the five products above.
4. Copy the **public iOS SDK key** (`appl_...`).

In Codemagic → **Environment variables**, add `REVENUECAT_IOS_KEY` = that key to
the **`appstore`** group. `codemagic.yaml` already passes it through as
`VITE_REVENUECAT_IOS_KEY`. It's a public key — it only identifies the app, and
the secret key never leaves RevenueCat.

## 4. Apply the migration

`supabase/migrations/0047_apple_iap.sql`, by hand against `verse-arcade`
(`visuppaucpzzigwtqmdd`), **before** shipping a build that can purchase — same
rule as every migration here. It's idempotent, so re-running is a no-op.

It adds `fulfill_apple_purchase`, which is a `security definer` RPC on purpose:
`enforce_skin_entitlement` blocks a client from writing a paid skin onto its own
profile, and that defense stays. The RPC re-derives what the sku is actually
worth server-side, so a tampered client can't buy the cheapest pack and ask for
the patron skin.

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
