-- Welcome challenge — every new signup gets a starter Bible Battle waiting for
-- them from the official account (the "MySpace Tom" touch). It lands as a
-- pending, targeted challenge, so it shows up in the new user's "Challenges for
-- you" the first time they open the Battle tab. Pure server-side; no client
-- change needed — it flows through the existing invited-battle UI.
--
-- Failure is swallowed so a hiccup here can NEVER block account creation.

create or replace function public.create_starter_battle()
returns trigger language plpgsql security definer set search_path = public as $$
declare official uuid;
begin
  begin
    -- The official buddy account challenges the new user (skip if the new
    -- profile IS the official account, or one already exists).
    select id into official from public.profiles where official_buddy and id <> new.id limit 1;
    if official is not null and not exists (
      select 1 from public.battles where challenger_id = official and invited_id = new.id
    ) then
      insert into public.battles(challenger_id, invited_id, seed, challenger_score, challenger_time_ms, status)
      values (official, new.id, (floor(random() * 2147483647))::bigint, 900, 38000, 'pending');
    end if;
  exception when others then
    null; -- never block signup on a welcome-battle failure
  end;
  return new;
end; $$;

drop trigger if exists on_profile_created_starter_battle on public.profiles;
create trigger on_profile_created_starter_battle
  after insert on public.profiles
  for each row execute function public.create_starter_battle();
