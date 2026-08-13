-- Referral codes + attribution. Each account has a unique shareable code; a new
-- user can sign up "using" a code, which records who referred them. 5 referred
-- signups unlock the "Take Up Your Cross" avatar look (earned, never sold).

alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id) on delete set null;
create unique index if not exists profiles_referral_code_key on public.profiles(referral_code) where referral_code is not null;
create index if not exists profiles_referred_by_idx on public.profiles(referred_by);

-- 6-char code from an unambiguous alphabet (no O/0/I/1).
create or replace function public.gen_referral_code()
returns text language plpgsql set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = code);
  end loop;
  return code;
end $$;

-- Backfill existing accounts.
update public.profiles set referral_code = public.gen_referral_code() where referral_code is null;

-- New accounts get a code at creation (extends the existing handle_new_user).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_name text;
  final_name text;
  n integer := 0;
begin
  base_name := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username',
                split_part(new.email, '@', 1), 'player'), '[^a-z0-9_]', '', 'g'));
  if base_name = '' then base_name := 'player'; end if;
  final_name := base_name;
  while exists (select 1 from public.profiles where username = final_name) loop
    n := n + 1;
    final_name := base_name || n::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_emoji, referral_code)
  values (new.id, final_name, coalesce(new.raw_user_meta_data->>'display_name', final_name), '📖',
          public.gen_referral_code())
  on conflict (id) do nothing;
  return new;
end $$;

-- Record who referred me (once). Case-insensitive code; can't refer yourself.
create or replace function public.apply_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ref uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.profiles where id = uid and referred_by is not null) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  select id into ref from public.profiles where referral_code = upper(trim(p_code));
  if ref is null then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if ref = uid then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  update public.profiles set referred_by = ref where id = uid and referred_by is null;
  return jsonb_build_object('ok', true);
end $$;

-- My code + how many people I've referred (drives the cross unlock).
create or replace function public.my_referral_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', (select referral_code from public.profiles where id = auth.uid()),
    'count', (select count(*) from public.profiles where referred_by = auth.uid())
  );
$$;

grant execute on function public.apply_referral(text) to authenticated;
grant execute on function public.my_referral_stats() to authenticated;

notify pgrst, 'reload schema';
