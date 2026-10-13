# Verse Arcade

**Make opening the Bible feel exciting and habitual.**

A shared daily verse, a timed arcade quiz about *that exact verse*, streaks, XP, co-op groups, and game juice — one codebase for web and iOS.

> **Mission:** stickiness without shame. Wrong answers teach instead of punish. No leaderboards — just warmth, streaks, and the pull to come back tomorrow.

## What it does
- Daily verse + timed quiz built specifically around that verse
- Streaks, XP, and collectibles that reward showing up
- Co-op groups and a church tab (find, give, local board)
- Works fully offline/local with no backend; switches to online when Supabase is connected
- Built with React + Supabase + Capacitor

## Tech
React · TypeScript · Supabase (Postgres, Auth, RLS) · Capacitor · Tailwind

## Quick start (no backend required)

```bash
npm install
npm run dev
```

With no Supabase keys the app runs in **LOCAL mode**: the full solo daily loop, juice, streaks, XP, and a demo group all work and save to the device.

## Connect Supabase
1. Create a Supabase project and run the SQL in `supabase/migrations/` in order.
2. Copy `.env.example` → `.env.local` and add your URL + anon key.
3. Enable Google + Apple providers (see `docs/SETUP-SUPABASE.md`).
4. Restart `npm run dev`. The app auto-detects the keys and switches to ONLINE mode.

## Ship to iOS
```bash
npm run build
npx cap add ios      # first time only
npm run cap:sync
npm run cap:ios
```

See `docs/SETUP-APPLE.md` for Sign in with Apple and IAP.

## What's inside

| Area | Where |
|---|---|
| Data model + RLS + scoring | `supabase/migrations/` |
| Juice system (sound/haptics/confetti) | `src/juice/` |
| Core daily loop | `src/features/daily/` |
| Groups & presence | `src/features/groups/`, `src/features/presence/` |
| Church tab | `src/features/church/` |
| Bible content | `src/data/bible/` |
| Auth | `src/features/auth/` |

Full design and retention rationale: `docs/ARCHITECTURE.md`.
