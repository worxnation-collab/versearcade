# Supabase setup — click-by-click

> ## ✅ Already done for this project
> A Supabase project **`verse-arcade`** (ref `visuppaucpzzigwtqmdd`, region us-east-1)
> is provisioned, all migrations are applied, and the live Netlify site
> (`verse-arcade.netlify.app`) is wired to it in ONLINE mode. Email/password
> sign-in, guest play, and all RPCs work now.
>
> **~2 minutes of dashboard toggles remain (only for a smoother auth UX):**
> 1. **Authentication → URL Configuration** → set **Site URL** to
>    `https://verse-arcade.netlify.app` and add redirect
>    `https://verse-arcade.netlify.app/auth/callback`. (Makes OAuth + email links
>    return to the live app instead of localhost.)
> 2. **Authentication → Providers → Email** → if you want frictionless signup,
>    turn **Confirm email = OFF** (a game usually doesn't need email verification;
>    guest + Google/Apple avoid it entirely either way).
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

## Sanity check

- `.env.local` has both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Restart `npm run dev`. The Auth screen should now show the Google/Apple buttons
  and email fields (not the "Backend not connected" notice).
- Create an account → you should land on the home hub with a real profile row in
  the `profiles` table.
