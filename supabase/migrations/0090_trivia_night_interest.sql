-- "Host a trivia night" — the ask, not the sale.
--
-- The third thing a church can be sold, and the third to be sold the same way:
-- the `custom` church building (0051) and the sponsored slot (0077/0078) both
-- put an INQUIRY in the app and settle the money off the device. This follows
-- them exactly, and for the same reasons:
--
--   • No price, no plan names, no checkout. The surface is byte-identical on
--     the web and in the App Store build, so `commerce.ts` never has to gate it
--     and the App Store build never shows a shop it can't take money through.
--   • Ticking the box GRANTS NOTHING. There is no client-callable way to start
--     a trivia night, because there is nothing to start yet — this exists to
--     find out whether churches want one before anybody builds the room.
--   • It goes to a person to read, in the queue that already exists.
--
-- WHY IT IS NOT LEADERSHIP-ONLY, unlike the skin and the promotion.
--
-- Those two are the church exercising authority over itself: how the building
-- looks, and whether it advertises to strangers. A member cannot commit their
-- congregation to either, so the server nulls them on the member path.
--
-- An event request is a different kind of thing. "Our youth group would love
-- this" is a lead, not a decision, and it is exactly the demand signal this
-- migration exists to collect. The queue already carries `role`, so whoever
-- reads it knows whether they are talking to a decision-maker or to somebody
-- enthusiastic. Nothing is granted either way.
--
-- WHAT IS ENFORCED INSTEAD: contact details, on BOTH paths. Leadership already
-- has to give a name and an email; a trivia-night ask has to as well, whoever
-- sends it, because an inquiry nobody can answer is not an inquiry. That is the
-- one rule this adds and it is the only place the two asks differ in shape.

alter table public.church_info_requests
  add column if not exists wants_trivia_night boolean not null default false;

-- The 7-arg signature from 0078 has to go before the 8-arg one lands, or
-- PostgREST has two overloads to choose between and resolves by argument names
-- — the trap 0078 hit when it replaced 0051's 6-arg version.
drop function if exists public.submit_church_info_request(uuid, text, text, text, text, text, boolean);

create or replace function public.submit_church_info_request(
  p_church_id          uuid,
  p_role               text,
  p_note               text,
  p_name               text default null,
  p_email              text default null,
  p_skin               text default null,
  p_wants_promotion    boolean default false,
  p_wants_trivia_night boolean default false
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
  v_trivia boolean;
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
  -- NOT dropped on the member path — see the header. An event request is a
  -- lead, and the role travels with it so the queue can tell them apart.
  v_trivia := coalesce(p_wants_trivia_night, false);
  if v_role <> 'leadership' then
    v_skin := null;
    v_promo := false;
  elsif v_skin is not null and v_skin not in ('classic', 'modern', 'glass', 'tile', 'custom') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_skin');
  end if;

  -- Contact is required for leadership (they are claiming to speak for the
  -- church) and for any trivia-night ask (we have to be able to answer it).
  if v_role = 'leadership' or v_trivia then
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
    (church_id, user_id, role, contact_name, email, note, skin, wants_promotion, wants_trivia_night)
  values (p_church_id, uid, v_role, v_name, v_email, v_note, v_skin, v_promo, v_trivia);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function
  public.submit_church_info_request(uuid, text, text, text, text, text, boolean, boolean)
  to authenticated;

-- Without the flag on the row it is invisible to whoever works the queue — a
-- church would ask to host a trivia night and nobody would ever find out. That
-- is the exact failure 0051 predicted for `skin` and 0078 had to come back and
-- fix. Same signature, so this is a plain replace.
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
      'wants_trivia_night', r.wants_trivia_night,
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
