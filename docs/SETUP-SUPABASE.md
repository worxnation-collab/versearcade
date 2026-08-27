# Supabase setup — click-by-click

> ## ✅ Already done for this project
> A Supabase project **`verse-arcade`** (ref `visuppaucpzzigwtqmdd`, region us-east-1)
> is provisioned, all migrations are applied, and the live site
> (`versearcade.org`) is wired to it in ONLINE mode. Email/password
> sign-in, guest play, and all RPCs work now.
>
> **~2 minutes of dashboard toggles remain:**
> 1. **Authentication → Sign In / Providers → Email** → turn **Confirm email
>    = OFF**. This is the one that matters: with it ON, someone who signs up by
>    typing an email and password gets no session and has to go find a
>    confirmation email before they can play — a hard stop right at the moment
>    they were most willing to start. With it OFF, `signUp` returns a session
>    and they land in the game immediately. The app already handles both cases;
>    nothing in the code needs to change. (Guest play and Google/Apple sign-in
>    skip verification either way.)
>    Trade-off while it's off: nothing proves an address is real, so typo'd or
>    fake emails become accounts, and password reset won't reach those people.
>    Turn it back on before you lean on email for anything that matters.
> 2. **Authentication → URL Configuration** → set **Site URL** to
>    `https://versearcade.org` and add redirect
>    `https://versearcade.org/auth/callback`. (Makes OAuth + email links
>    return to the live app instead of localhost.)
> 3. Enable **Google** and **Apple** providers using §2 and §3 below.
>
> The rest of this doc is the full reference (and how to reproduce from scratch).

---

Everything here happens **outside the codebase**, in dashboards. Do it once.
Where you see 🔑 **PASTE**, that value goes into a specific box — I say exactly which.

---

## 1. Create the project & run the schema

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Name it `verse-arcade`, pick a region near your users, set a strong DB password.
3. When it finishes provisioning, open **Project Settings → API**. You'll see:
   - **Project URL** → 🔑 **PASTE** into `.env.local` as `VITE_SUPABASE_URL`
   - **anon public** key → 🔑 **PASTE** into `.env.local` as `VITE_SUPABASE_ANON_KEY`
4. Open **SQL Editor → New query**. Paste and **Run** each file, in order:
   `0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql`, `0004_seed.sql`, `0005_daily.sql`.
   (Or use the Supabase CLI: `supabase db push`.)
5. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:5173` (change to your real domain later).
   - **Redirect URLs**: add `http://localhost:5173/auth/callback` and, for iOS,
     `com.versearcade.app://auth/callback`.

---

## 2. Sign in with Google

### 2a. Google Cloud — create the OAuth client
1. <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → OAuth consent screen** → choose **External** → fill app
   name, support email, developer email → **Save**. Add yourself as a **Test user**
   while developing.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
4. Application type: **Web application**.
5. Under **Authorized redirect URIs**, add your Supabase callback — find the exact
   URL in Supabase at **Authentication → Providers → Google** (it looks like
   `https://<your-project-ref>.supabase.co/auth/v1/callback`). 🔑 **PASTE** it here.
6. Click **Create**. Google shows a **Client ID** and **Client secret** — keep this tab open.

### 2b. Supabase — turn Google on
1. Supabase → **Authentication → Providers → Google** → toggle **Enable**.
2. 🔑 **PASTE** the Google **Client ID** into **Client IDs**.
3. 🔑 **PASTE** the Google **Client secret** into **Client Secret**.
4. **Save**. Done — the app's "Sign in with Google" button now works on web.

---

## 3. Sign in with Apple

You need an Apple Developer account. The Apple-portal half is in
`docs/SETUP-APPLE.md`; complete **that first**, then return here with two values:
your **Services ID** and a generated **client secret / key**.

1. Supabase → **Authentication → Providers → Apple** → toggle **Enable**.
2. 🔑 **PASTE** your Apple **Services ID** (e.g. `com.versearcade.signin`) into
   **Client IDs**. (For native iOS you'll also add the app **Bundle ID**
   `com.versearcade.app` here as a second, comma-separated client ID.)
3. **Secret Key**: Apple doesn't give a static secret — you either
   (a) paste the **.p8 key** contents + **Key ID** + **Team ID** if the provider
   form offers those fields, or (b) generate the JWT client secret and paste it
   into **Secret Key**. The Supabase Apple provider page shows exactly which
   fields it wants; fill the ones it shows. 🔑 **PASTE** accordingly.
4. **Save**.

> On iOS, "Sign in with Apple" uses the native sheet; the deep-link redirect
> `com.versearcade.app://auth/callback` (added in step 1.5) carries the session back.

---

## 4. (Optional) daily verse cron

The app self-seeds each day's verse via the `ensure_daily_verse` RPC, so you can
skip this. To pre-generate/curate instead, create a scheduled **Edge Function**
that writes tomorrow's row into `daily_verses` — see `docs/ARCHITECTURE.md` →
*Content pipeline*.

---

## 5. Web Push (the admin broadcast)

The "Daily reminders" toggle in Settings subscribes the browser; `/admin` →
**Push** broadcasts to everyone opted in, through the `push-send` Edge Function.
That function needs **one secret** before any send works.

The key *pair* is yours to generate — Supabase doesn't issue it. The public half
ships in the client (`src/lib/config.ts` → `VAPID_PUBLIC_KEY`, mirrored as the
fallback in `supabase/functions/push-send/index.ts`); the private half lives only
as an Edge Function secret and is never in the repo.

1. **Generate a pair.** Public is an 87-char `B…`; private is the 43-char
   base64url EC private scalar (the JWK `d`) — a PEM block will **not** work.

   ```bash
   npx web-push generate-vapid-keys
   ```

2. **Supabase → Edge Functions → Secrets**
   (`https://supabase.com/dashboard/project/<ref>/functions/secrets`).
   Add `VAPID_PRIVATE_KEY` = the private half. 🔑 **PASTE**. Optional overrides:
   `VAPID_PUBLIC_KEY` and `VAPID_SUBJECT` (defaults to `mailto:worxnation@gmail.com`).
   Secrets apply immediately — no redeploy needed.

3. **Put the public half in the client** — edit `src/lib/config.ts` (and the
   `push-send` fallback), or set `VITE_VAPID_PUBLIC_KEY` in the build env. Either
   way the *web build* has to be redeployed before anyone can subscribe with it.

**Rotating invalidates every existing subscription.** A subscription is bound to
the public key it was created with, so after a rotation each player has to
re-toggle reminders. `push-send` only prunes 404/410 — a key mismatch answers
403 and the dead row stays. And the private key can't be derived from the public
one: if it's lost, the only fix is a new pair and rotating both halves together.

| Symptom | Cause |
|---|---|
| `500 VAPID_PRIVATE_KEY is not configured` (admin says "is VAPID_PRIVATE_KEY set in Supabase?") | the secret isn't set |
| `sent 0 · failed N` | halves don't match — the client subscribed with a different public key than the function signs with |

---

## Sanity check

- `.env.local` has both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Restart `npm run dev`. The Auth screen should now show the Google/Apple buttons
  and email fields (not the "Backend not connected" notice).
- Create an account → you should land on the home hub with a real profile row in
  the `profiles` table.
