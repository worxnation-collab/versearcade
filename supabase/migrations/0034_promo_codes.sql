-- Promo codes — redeemable codes that grant an exclusive skin (e.g. a code
-- pinned in a TikTok live). Server-authoritative: only redeem_code (which sets
-- app.grant_ok) or an admin can add an exclusive skin to owned_skins, so the
-- lock can't be bypassed by a direct profile write.

create table if not exists public.promo_codes (
  code text primary key,
  skin_id text not null,
  active boolean not null default true,
  redeemed_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.promo_codes enable row level security;

-- Protect the exclusive skin the same way paid skins are protected: add 'shades'
-- to the entitlement trigger's guarded set so it can only be granted legitimately.
create or replace function public.enforce_skin_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  paid text[] := array['moses','esther','elijah','whale','shades'];
  added text[];
  caller_admin boolean;
begin
  added := array(
    select unnest(coalesce(new.owned_skins, '{}'::text[]))
    except
    select unnest(coalesce(old.owned_skins, '{}'::text[]))
  );
  if added && paid then
    select is_admin into caller_admin from public.profiles where id = auth.uid();
    if coalesce(current_setting('app.grant_ok', true), '') <> '1' and not coalesce(caller_admin, false) then
      new.owned_skins := array(
        select x from unnest(coalesce(new.owned_skins, '{}'::text[])) as x
        where not (x = any(paid)) or x = any(coalesce(old.owned_skins, '{}'::text[]))
      );
    end if;
  end if;
  return new;
end $$;

-- Redeem a code → grant its skin to the caller (idempotent).
create or replace function public.redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_skin text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select skin_id into v_skin from public.promo_codes where code = upper(trim(p_code)) and active;
  if v_skin is null then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if (select coalesce(owned_skins, '{}'::text[]) from public.profiles where id = uid) @> array[v_skin] then
    return jsonb_build_object('ok', true, 'skin', v_skin, 'already', true);
  end if;
  perform set_config('app.grant_ok', '1', true);
  update public.profiles
     set owned_skins = (select array(select distinct unnest(coalesce(owned_skins, '{}'::text[]) || v_skin)))
   where id = uid;
  update public.promo_codes set redeemed_count = redeemed_count + 1 where code = upper(trim(p_code));
  return jsonb_build_object('ok', true, 'skin', v_skin);
end $$;

-- Admin: list + create/update/toggle promo codes.
create or replace function public.admin_list_promo_codes()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('code', code, 'skin_id', skin_id, 'active', active,
      'redeemed_count', redeemed_count, 'created_at', created_at) order by created_at desc)
    from public.promo_codes
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_upsert_promo_code(p_code text, p_skin text, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if length(trim(coalesce(p_code, ''))) < 3 then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  insert into public.promo_codes(code, skin_id, active)
  values (upper(trim(p_code)), trim(p_skin), coalesce(p_active, true))
  on conflict (code) do update set skin_id = excluded.skin_id, active = excluded.active;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.redeem_code(text) to authenticated;
grant execute on function public.admin_list_promo_codes() to authenticated;
grant execute on function public.admin_upsert_promo_code(text, text, boolean) to authenticated;

-- Seed the live-drop code (grants the exclusive "shades" skin). Change or
-- disable it any time from the admin panel.
insert into public.promo_codes(code, skin_id, active) values ('DAYONE', 'shades', true)
on conflict (code) do nothing;

notify pgrst, 'reload schema';
