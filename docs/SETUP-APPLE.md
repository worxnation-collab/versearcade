# Apple Developer + App Store setup — click-by-click

Goal: register the app, enable **Sign in with Apple**, wire the iOS build, and
line up **in-app purchase** so premium translations route through Apple (a Review
requirement). Do the portal steps first, then the Xcode steps.

Bundle ID used throughout: **`com.versearcade.app`** (matches `capacitor.config.ts`).

---

## 1. App ID (identifier)

1. <https://developer.apple.com/account> → **Certificates, Identifiers & Profiles → Identifiers**.
2. **+** → **App IDs** → **App** → Continue.
3. Description: `Verse Arcade`. Bundle ID: **Explicit** → `com.versearcade.app`.
4. Under **Capabilities**, check **Sign In with Apple**. → **Continue → Register**.

## 2. Services ID (this is Supabase's Apple "Client ID" for web/OAuth)

1. **Identifiers → + → Services IDs → Continue**.
2. Description: `Verse Arcade Sign In`. Identifier: `com.versearcade.signin`. → Register.
3. Open it → check **Sign In with Apple → Configure**:
   - **Primary App ID**: select `com.versearcade.app`.
   - **Domains**: `<your-project-ref>.supabase.co`.
   - **Return URLs**: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
   - Save.
4. 🔑 The **Services ID** `com.versearcade.signin` → goes into Supabase Apple
   provider **Client IDs** (see `SETUP-SUPABASE.md` §3).

## 3. Sign in with Apple key (.p8)

1. **Keys → + → Register a New Key**. Name: `Verse Arcade SIWA`.
2. Check **Sign In with Apple → Configure** → pick Primary App ID `com.versearcade.app` → Save → Continue → Register.
3. **Download** the `.p8` file (you can only download it once — keep it safe).
4. Note the **Key ID** (shown on the key page) and your **Team ID** (top-right of the portal).
5. 🔑 The **.p8 contents**, **Key ID**, and **Team ID** → Supabase Apple provider
   (used to mint the client secret; the provider form tells you which boxes).

---

## 4. Build the iOS app (Capacitor + Xcode)

```bash
npm run build
npx cap add ios      # first time; creates the ios/ native project
npm run cap:sync
npm run cap:ios      # opens Xcode
```

In **Xcode**:
1. Select the **App** target → **Signing & Capabilities**.
2. Set **Team** (your Apple developer team). Confirm **Bundle Identifier** = `com.versearcade.app`.
3. **+ Capability → Sign in with Apple**.
4. **+ Capability → Push Notifications** (needed later for the daily reminder;
   the code registration is stubbed in `src/lib/native.ts`).
5. **Info** tab → add a **URL Type** with URL Scheme `com.versearcade.app` so the
   OAuth deep link `com.versearcade.app://auth/callback` returns to the app.
6. Run on a simulator/device (▶). The synthesized sounds + haptics work on device.

---

## 5. In-app purchase (for premium translations: ESV / NLT / CSB)

Premium translations are defined in `src/lib/config.ts` with `premium: true` and
are **not** wired to any external payment — per **App Store Review Guideline 3.1.1**,
unlocking digital content must use Apple IAP.

1. **App Store Connect → your app → Features → In-App Purchases → +**.
2. Create **Non-Consumable** products, e.g. `translation_esv`, `translation_nlt`.
3. Fill display name, price tier, review screenshot.
4. In the app, add a purchase flow using a Capacitor IAP plugin (e.g.
   `@capacitor-community/in-app-purchases` or RevenueCat) that, on success,
   flips the translation's gate. **← deferred / stubbed** (see ARCHITECTURE).

> Do **not** add an external "buy on our website" link for these — that alone can
> fail review. Keep digital unlocks inside Apple IAP.

---

## 6. App Store Review readiness (already handled in-app)

- ✅ **In-app account deletion** — Profile → Delete my account (calls
  `delete_my_account` RPC / clears local). Required by Guideline 5.1.1(v).
- ✅ **Sign in with Apple offered** alongside other social logins (Guideline 4.8).
- ✅ **Sound/haptics toggles** in Settings (reviewers expect a way to silence).
- ✅ **Safe-area / notch handling** and native-feeling tab bar + gestures.
- ✅ **No external payment links** for digital goods.
- ⚠️ **Privacy**: fill the **App Privacy** questionnaire in App Store Connect.
  Verse Arcade collects: email (auth), username, gameplay stats. No tracking SDKs.
- ⚠️ Add a **Privacy Policy URL** and **Support URL** (App Store Connect requires both).
