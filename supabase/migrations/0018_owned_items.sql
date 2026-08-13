-- Wearable avatar items (hats, held objects, capes) the player has collected,
-- mostly from the Daily Chest. Cosmetic only, kept separate from the relic
-- collection (user_unlocks). Owners write via the existing "profiles
-- self-update" RLS policy.
alter table public.profiles
  add column if not exists owned_items text[] not null default '{}'::text[];
