-- 0146 — the leader's look, as the congregation and its visitors see it.
--
-- 0136 gave every verified church's leadership a look (five defaults, or the
-- $79 Custom Leader Avatar) and stored it on `church_admins.leader_look`. The
-- only reader was `church_entitlements`, which returns the CALLER's own look to
-- the caller — so the look was drawn in exactly one place, the leader's own
-- picker, and nobody it was meant for ever saw it. This is the read that lets
-- the church's own surfaces draw it: beside the pastor's note, beside the live
-- notice, and standing in the churchyard.
--
-- What it returns is deliberately ONE face and nothing else:
--   • look — one of the six ids the 0136 check constraint allows;
--   • art_url — only for 'custom', and only a DELIVERED https url (0136
--     already refuses anything else on write);
--   • skin / hair / figure — three keys copied out of the leader's own
--     `avatar_character`, each checked as a short lowercase key, so the drawn
--     fallback and the tone/hair painting match them. Never the whole spec,
--     never a skin id, never a username, never a user id.
--
-- Rules:
--   • Verified churches only. A look is the Church Leader tier (0136 gates
--     `set_my_leader_look` on `church_admin_can`), so an unverified church
--     answers null rather than showing a look nobody there could have chosen.
--   • Only a leader who CHOSE a look is shown. No look ⇒ null ⇒ the surfaces
--     draw nothing, rather than putting a stranger in a cassock in front of a
--     church whose leadership never picked one.
--   • One leader per church: a delivered custom look first (it was bought to
--     be seen), then the longest-standing leader. Never a list — a row of
--     leaders is one step from comparing them.
--   • Public (anon + authenticated), like `public_church_page`: the yard is on
--     the church's public page, and a church's leadership is a public role.
--   • Read-only and writes nothing. `avatar_character` is untouched; the look
--     still lives on `church_admins` alone.
create or replace function public.church_leader_look(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_user uuid;
  v_look text;
  v_art  text;
  v_spec jsonb;
  v_skin text;
  v_hair text;
  v_fig  text;
begin
  if p_church_id is null or not public.church_is_verified(p_church_id) then
    return null;
  end if;

  select a.user_id, a.leader_look into v_user, v_look
    from public.church_admins a
   where a.church_id = p_church_id
     and a.leader_look is not null
   order by (a.leader_look = 'custom' and exists (
              select 1 from public.church_avatar_requests r
               where r.church_id = a.church_id and r.user_id = a.user_id
                 and r.status = 'delivered' and r.art_url is not null)) desc,
            a.granted_at asc
   limit 1;
  if v_user is null then return null; end if;

  if v_look = 'custom' then
    select r.art_url into v_art from public.church_avatar_requests r
     where r.church_id = p_church_id and r.user_id = v_user
       and r.status = 'delivered' and r.art_url is not null
     order by r.updated_at desc limit 1;
  end if;

  select p.avatar_character into v_spec from public.profiles p where p.id = v_user;
  if jsonb_typeof(v_spec) = 'object' then
    v_skin := v_spec ->> 'skin';
    v_hair := v_spec ->> 'hair';
    v_fig  := v_spec ->> 'figure';
  end if;
  if v_skin is not null and v_skin !~ '^[a-z]{1,16}$' then v_skin := null; end if;
  if v_hair is not null and v_hair !~ '^[a-z]{1,16}$' then v_hair := null; end if;
  if v_fig is not null and v_fig not in ('masc', 'fem') then v_fig := null; end if;

  return jsonb_build_object(
    'look', v_look,
    'art_url', v_art,
    'skin', v_skin,
    'hair', v_hair,
    'figure', v_fig);
end;
$$;
revoke all on function public.church_leader_look(uuid) from public;
grant execute on function public.church_leader_look(uuid) to anon, authenticated;
