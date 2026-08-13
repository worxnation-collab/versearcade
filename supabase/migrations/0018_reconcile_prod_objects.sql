-- Verse Arcade — reconcile committed migrations with production (audit #7).
-- ---------------------------------------------------------------------------
-- The live database had objects with no committed migration: the is_group_member()
-- helper, the "Keep it" spaced-repetition `verse_reviews` table, a chest_relics
-- read policy, and group policies rewritten to use is_group_member(). This
-- migration captures them so the repo faithfully reproduces production on a fresh
-- replay. It is idempotent and a no-op against the current prod schema.
-- ---------------------------------------------------------------------------

-- Helper used by the group RLS policies (avoids recursive policy evaluation).
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;
revoke execute on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;

-- Group visibility policies as they exist in production (is_group_member form).
drop policy if exists "group_members read own groups" on public.group_members;
drop policy if exists "group_members read" on public.group_members;
create policy "group_members read" on public.group_members
  for select using ((user_id = (select auth.uid())) or public.is_group_member(group_id));

drop policy if exists "groups readable by members" on public.groups;
create policy "groups readable by members" on public.groups
  for select using (public.is_group_member(id));

drop policy if exists "group_plays readable by members" on public.group_plays;
create policy "group_plays readable by members" on public.group_plays
  for select using (public.is_group_member(group_id));

-- Chest relic catalog is world-readable (labels + weights only).
alter table public.chest_relics enable row level security;
drop policy if exists "relics readable by all" on public.chest_relics;
create policy "relics readable by all" on public.chest_relics
  for select using (true);

-- "Keep it" spaced-repetition review schedule (one row per verse per user).
create table if not exists public.verse_reviews (
  user_id          uuid not null references auth.users(id) on delete cascade,
  reference        text not null,
  mastery          integer not null default 0,
  due              date not null,
  last_reviewed_on date,
  updated_at       timestamptz not null default now(),
  primary key (user_id, reference)
);
alter table public.verse_reviews enable row level security;

drop policy if exists "verse_reviews_select_own" on public.verse_reviews;
create policy "verse_reviews_select_own" on public.verse_reviews
  for select using ((select auth.uid()) = user_id);

drop policy if exists "verse_reviews_insert_own" on public.verse_reviews;
create policy "verse_reviews_insert_own" on public.verse_reviews
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "verse_reviews_update_own" on public.verse_reviews;
create policy "verse_reviews_update_own" on public.verse_reviews
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "verse_reviews_delete_own" on public.verse_reviews;
create policy "verse_reviews_delete_own" on public.verse_reviews
  for delete using ((select auth.uid()) = user_id);
