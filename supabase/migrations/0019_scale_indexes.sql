-- Verse Arcade — cover unindexed foreign keys (advisor: performance).
-- ---------------------------------------------------------------------------
-- Pure additive indexes. The Supabase performance advisor flagged these FK
-- columns as lacking a covering index, which slows joins and cascade deletes as
-- the user base grows. Safe and non-breaking.
-- ---------------------------------------------------------------------------

create index if not exists answers_play_id_idx
  on public.answers(play_id);

create index if not exists group_members_user_id_idx
  on public.group_members(user_id);

create index if not exists group_plays_user_id_idx
  on public.group_plays(user_id);

create index if not exists groups_owner_id_idx
  on public.groups(owner_id);

create index if not exists user_collectibles_collectible_id_idx
  on public.user_collectibles(collectible_id);
