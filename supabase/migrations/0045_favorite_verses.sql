-- Favorite verses. Any verse challenge (the daily drop, a practice replay, a
-- focus drill, a CPU or real battle, a review card) ends with a heart, and what
-- the player keeps lands on the /favorites shelf.
--
-- Deliberately inert: favoriting awards no XP, costs none, touches no streak and
-- is never shown to another player. It's a keepsake, not a score — so there's
-- nothing here to farm and nothing to rank.
--
-- Only the reference is stored; the text and metadata are rehydrated client-side
-- from the verse pool. LOCAL/guest play mirrors this in localStorage
-- (va.favorites.*) — see src/store/favorites.ts.

create table if not exists public.favorite_verses (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  reference  text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, reference)
);

-- The shelf is read newest-first, per player.
create index if not exists favorite_verses_user_created_idx
  on public.favorite_verses (user_id, created_at desc);

alter table public.favorite_verses enable row level security;
drop policy if exists "favorites self-select" on public.favorite_verses;
drop policy if exists "favorites self-write"  on public.favorite_verses;
create policy "favorites self-select" on public.favorite_verses
  for select using (auth.uid() = user_id);
-- Writes go through set_verse_favorite (security definer); still scope any
-- direct write to the owner as defense in depth.
create policy "favorites self-write" on public.favorite_verses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Add or remove one favorite. Returns the resulting state plus the player's
-- total, so the client can confirm what stuck.
--
-- The cap is a ceiling no real player reaches; it exists so a stuck button or a
-- scripted client can't write unbounded rows. Keep in sync with FAVORITES_CAP in
-- src/lib/favorites.ts, which enforces the same rule for guests.
create or replace function public.set_verse_favorite(
  p_reference text,
  p_favorite  boolean default true
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_ref text := btrim(coalesce(p_reference, ''));
  v_cap integer := 500;
  v_count integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if v_ref = '' or length(v_ref) > 64 then raise exception 'invalid reference'; end if;

  if coalesce(p_favorite, true) then
    select count(*) into v_count from public.favorite_verses where user_id = uid;
    -- An existing favorite re-saved is a no-op, so the cap only blocks growth.
    if v_count >= v_cap
       and not exists (select 1 from public.favorite_verses
                        where user_id = uid and reference = v_ref) then
      raise exception 'favorite limit reached';
    end if;
    insert into public.favorite_verses (user_id, reference)
    values (uid, v_ref)
    on conflict (user_id, reference) do nothing;
  else
    delete from public.favorite_verses where user_id = uid and reference = v_ref;
  end if;

  select count(*) into v_count from public.favorite_verses where user_id = uid;
  return json_build_object(
    'reference', v_ref,
    'favorite', coalesce(p_favorite, true),
    'count', v_count,
    'cap', v_cap
  );
end;
$$;

grant execute on function public.set_verse_favorite(text, boolean) to authenticated;

notify pgrst, 'reload schema';
