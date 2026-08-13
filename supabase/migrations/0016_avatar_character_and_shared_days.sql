-- Persist the composable character avatar + share-day history on the profile.
--
-- avatar_character: the equipped AvatarSpec (skin / robe / armor / regalia) as
--   JSON. null means the player hasn't built one and we fall back to
--   avatar_emoji (see components/Avatar + store/auth mapRow).
-- shared_days: the distinct daily-verse dates (YYYY-MM-DD) the player has
--   shared, driving share-count unlocks like the King Baldwin regalia.
--
-- Owners already update their own row via the existing "profiles self-update"
-- RLS policy, so no new policy is needed.

alter table public.profiles
  add column if not exists avatar_character jsonb,
  add column if not exists shared_days text[] not null default '{}'::text[];
