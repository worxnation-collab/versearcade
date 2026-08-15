# 📖 Verse Arcade

Make opening the Bible feel exciting and habitual. A shared daily verse, a timed
arcade quiz about *that exact verse*, streaks, XP, co-op groups, and relentless
game "juice" — built React + Supabase + Capacitor, one codebase for web and iOS.

> **Mission:** stickiness without shame. Wrong answers teach instead of punish.
> No leaderboards — just warmth, streaks, and the pull to come back tomorrow.

---

## Quick start (play in 30 seconds, no backend)

```bash
npm install
npm run dev
```

Open the URL it prints. With **no Supabase keys**, the app runs in **LOCAL mode**:
the full solo daily loop, juice, streaks, XP, collectibles, and a demo group all
work, saved to your device. This is intentional — solo play is complete on its own.

## Connect the backend (accounts, sync, real groups, ambient presence)

1. Create a Supabase project and run the SQL in `supabase/migrations/` in order.
2. Copy `.env.example` → `.env.local` and paste your URL + anon key.
3. Enable Google + Apple providers — see **`docs/SETUP-SUPABASE.md`** (click-by-click).
4. Restart `npm run dev`. The app auto-detects the keys and switches to ONLINE mode.

## Ship to iOS

```bash
npm run build
npx cap add ios      # first time only
npm run cap:sync
npm run cap:ios      # opens Xcode
```

Full Apple Developer portal + Sign in with Apple + IAP checklist: **`docs/SETUP-APPLE.md`**.

## What's inside

| Area | Where |
|---|---|
| Data model + RLS + scoring functions | `supabase/migrations/` |
| Juice system (sound/haptics/confetti) | `src/juice/` |
| Core daily loop | `src/features/daily/` |
| Ambient presence | `src/features/presence/` |
| Co-op groups | `src/features/groups/`, `src/store/groups.ts` |
| Church tab (find, give, level, local board) | `src/features/church/`, `src/store/church.ts` |
| Bible content engine | `src/data/bible/` |
| Auth (email/Google/Apple + guest) | `src/features/auth/`, `src/store/auth.ts` |

See **`docs/ARCHITECTURE.md`** for the full design, the retention-feature
rationale, and the list of what's stubbed/deferred.
