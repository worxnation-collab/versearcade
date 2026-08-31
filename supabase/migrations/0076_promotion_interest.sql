-- "Tell us about promoting our church" — the ask, not the sale.
--
-- 0075 gave the operator a sponsored slot to grant. This is how a church asks
-- for one: a single box on the leadership path of the existing "Add info" form,
-- carried on the request that already goes to a person to read.
--
-- It is an INQUIRY and it stays one. No price, no checkout, no plan names —
-- the surface is byte-identical on the web and in the App Store build, exactly
-- like the `custom` church skin, and for the same reason: the money happens off
-- the device, so `commerce.ts` never has to gate this and the App Store build
-- never shows a storefront it can't take money through. Ticking the box grants
-- nothing. Only `admin_set_church_promotion` (0075) can start a slot.
--
-- Leadership only, and enforced here rather than in the form: a member telling
-- us about service times is not the person who decides a congregation's
-- advertising. The server nulls it on the member path the same way it nulls the
-- skin, and for the same reason — a stale or curious client sending one is not
-- a reason to lose the note it came with.

alter table public.church_info_requests
  add column if not exists wants_promotion boolean not null default false;

-- The 6-arg signature from 0051 has to go before the 7-arg one lands, or
-- PostgREST has two overloads to choose between and picks by argument names.
drop function if exists public.submit_church_info_request(uuid, text, text, text, text, text);

create or replace function public.submit_church_info_request(
  p_church_id      uuid,
  p_role           text,
  p_note           text,
  p_name           text default null,
  p_email          text default null,
  p_skin           text default null,
  p_wants_promotion boolean default false
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_role text;
  v_note text;
  v_name text;
  v_email text;
  v_skin text;
  v_promo boolean;
  v_cap integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_role := lower(btrim(coalesce(p_role, '')));
  if v_role not in ('leadership', 'member') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_role');
  end if;

  v_cap := case when v_role = 'leadership' then 500 else 180 end;
  v_note := btrim(coalesce(p_note, ''));
  if length(v_note) < 10 then
    return jsonb_build_object('ok', false, 'reason', 'note_too_short');
  end if;
  -- Trim rather than reject: the client caps the field at the same number, so
  -- anything longer arriving here is a stale build, not a person to scold.
  v_note := left(v_note, v_cap);

  v_name := nullif(left(btrim(coalesce(p_name, '')), 80), '');
  v_email := nullif(lower(left(btrim(coalesce(p_email, '')), 120)), '');

  -- Dropped on the member path rather than refused: a stale or curious client
  -- sending one is not a reason to lose the note it came with.
  v_skin := nullif(lower(btrim(coalesce(p_skin, ''))), '');
  v_promo := coalesce(p_wants_promotion, false);
  if v_role <> 'leadership' then
    v_skin := null;
    v_promo := false;
  elsif v_skin is not null and v_skin not in ('classic', 'modern', 'glass', 'tile', 'custom') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_skin');
  end if;

  if v_role = 'leadership' then
    if v_name is null or length(v_name) < 2 then
      return jsonb_build_object('ok', false, 'reason', 'name_required');
    end if;
    if v_email is null or position('@' in v_email) = 0 or length(v_email) < 5 then
      return jsonb_build_object('ok', false, 'reason', 'email_required');
    end if;
  end if;

  -- One open ask per person per church. Not a punishment — a second identical
  -- note doesn't get the page filled in any faster, and the queue is read by a
  -- human.
  if exists (
    select 1 from public.church_info_requests r
    where r.church_id = p_church_id and r.user_id = uid and not r.handled
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_pending');
  end if;

  insert into public.church_info_requests
    (church_id, user_id, role, contact_name, email, note, skin, wants_promotion)
  values (p_church_id, uid, v_role, v_name, v_email, v_note, v_skin, v_promo);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function
  public.submit_church_info_request(uuid, text, text, text, text, text, boolean)
  to authenticated;

-- Same signature as 0051, so this is a plain replace. Without `wants_promotion`
-- on the row the box is invisible to whoever works the queue — a church would
-- ask to be promoted and nobody would ever find out, which is the exact bug
-- 0051 called out when it added `skin`.
create or replace function public.admin_church_info_requests(p_limit integer default 50)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'church_id', r.church_id,
      'church_name', c.name,
      'city', c.city,
      'region', c.region,
      'role', r.role,
      'skin', r.skin,
      'wants_promotion', r.wants_promotion,
      'username', pr.username,
      'contact_name', r.contact_name,
      'email', r.email,
      'note', r.note,
      'handled', r.handled,
      'created_at', r.created_at
    ) order by r.created_at desc)
    from (select * from public.church_info_requests order by created_at desc limit greatest(coalesce(p_limit, 50), 1)) r
    join public.churches c on c.id = r.church_id
    left join public.profiles pr on pr.id = r.user_id
  ), '[]'::jsonb);
end;
$$;

notify pgrst, 'reload schema';
