-- 0149 — a church's leader is recognisable on their own player card, and a
-- player can ask about their church from it.
--
-- Leader looks (0146) already stand beside the pastor's note, the live notice
-- and in the churchyard — but those are surfaces you only reach once you are
-- IN the church. The one place a stranger meets a pastor is the player card
-- that pops when anyone taps their avatar, and it said nothing. So:
--
--   * `player_card_church(username)` — a companion to `get_player_card`
--     (which is deliberately NOT restated: approved iOS builds call it, and an
--     older server simply draws no marker). It answers for a leader of a
--     VERIFIED church only — a free claim (0137) or an unverified church is
--     null — with the church's id and name and the public face its own page
--     already shows: the building's level and skin, the tagline and the
--     "This week" line. Never a member count, never XP, never a score. Anon
--     callable, because the card is.
--
--   * `church_join_inquiries` (not 0025's `church_inquiries`, the For Churches contact form) — "Inquire" from that sheet: one short note (280
--     characters) per player per church, the primary key's job. Sent only by a
--     signed-in player who has NO church, only to a verified church, never by
--     somebody to a church they lead, five a day across every church. Read and
--     dismissed only by that church's verified leadership
--     (`church_admin_can`), as a plain list newest first: name, note, time.
--     There is no count anywhere else, no "most asked about", nothing ranked.
--     No reply path exists yet — the check-in note (0137) reaches members only
--     — so this pass is dismiss; the note is the inquirer's own text, cleaned
--     and capped, reaching only leadership, the same audience a check-in
--     comes from.
--
-- Joining needs nothing new: `join_church` by id (0092) is open to any
-- signed-in player, so the sheet's Join is the church page's own path.
-- The cascading foreign keys are part b (the MCP stops on their clause).

create or replace function public.player_card_church(p_username text)
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'church_id', c.id,
    'church_name', c.name,
    'level', public.church_level_from_xp(c.xp),
    'skin', (select cp.skin from public.church_profiles cp where cp.church_id = c.id and cp.published),
    'tagline', (select cp.tagline from public.church_profiles cp where cp.church_id = c.id and cp.published),
    'this_week', (select cp.this_week from public.church_profiles cp where cp.church_id = c.id and cp.published)
  )
  from public.profiles p
  join public.church_admins a on a.user_id = p.id
  join public.churches c on c.id = a.church_id
  where lower(p.username) = lower(btrim(coalesce(p_username, '')))
    and not coalesce(p.hidden, false)
    and public.church_is_verified(c.id)
  -- The church they play for, if they lead it; else the one they have led longest.
  order by (c.id = p.church_id) desc, a.granted_at asc
  limit 1;
$$;
revoke all on function public.player_card_church(text) from public;
grant execute on function public.player_card_church(text) to anon, authenticated;

create table if not exists public.church_join_inquiries (
  church_id    uuid not null,
  user_id      uuid not null,
  note         text not null check (char_length(note) between 2 and 280),
  created_at   timestamptz not null default now(),
  dismissed_at timestamptz,
  primary key (church_id, user_id)
);
create index if not exists church_join_inquiries_user_idx on public.church_join_inquiries (user_id, created_at);
alter table public.church_join_inquiries enable row level security;
revoke all on table public.church_join_inquiries from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Send one. ok | already | has_church | not_verified | own_church | bad_note |
-- daily_cap. `already` is not an error to the player: their note is there.
-- ---------------------------------------------------------------------------
create or replace function public.send_church_join_inquiry(p_church_id uuid, p_note text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_note text := public.church_clean_line(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g'), 280);
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  if p_church_id is null or not public.church_is_verified(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_verified');
  end if;
  if exists (select 1 from public.church_admins where church_id = p_church_id and user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'own_church');
  end if;
  if (select church_id from public.profiles where id = uid) is not null then
    return jsonb_build_object('ok', false, 'reason', 'has_church');
  end if;
  if v_note is null or char_length(v_note) < 2 then return jsonb_build_object('ok', false, 'reason', 'bad_note'); end if;
  if exists (select 1 from public.church_join_inquiries where church_id = p_church_id and user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  if (select count(*) from public.church_join_inquiries where user_id = uid and created_at > now() - interval '1 day') >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap');
  end if;
  insert into public.church_join_inquiries (church_id, user_id, note) values (p_church_id, uid, v_note)
  on conflict (church_id, user_id) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.send_church_join_inquiry(uuid, text) from public, anon;
grant execute on function public.send_church_join_inquiry(uuid, text) to authenticated;

-- Whether the caller has already asked this church (so the sheet shows "sent").
create or replace function public.my_church_join_inquiry(p_church_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('sent', i.created_at is not null, 'at', i.created_at)
  from (select 1) one
  left join public.church_join_inquiries i on i.church_id = p_church_id and i.user_id = auth.uid();
$$;
revoke all on function public.my_church_join_inquiry(uuid) from public, anon;
grant execute on function public.my_church_join_inquiry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Leadership's list: newest first, not dismissed, at most 50. Name, look, note,
-- time — and whether they have since joined some church (so a stale ask reads
-- as such). No counts beyond the list itself.
-- ---------------------------------------------------------------------------
create or replace function public.church_join_inquiry_list(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  return jsonb_build_object('ok', true, 'inquiries', coalesce((
    select jsonb_agg(x.j order by x.at desc) from (
      select i.created_at as at, jsonb_build_object(
        'username', p.username,
        'avatar_emoji', p.avatar_emoji,
        'avatar_character', p.avatar_character,
        'note', i.note,
        'at', i.created_at,
        'joined_here', p.church_id is not distinct from p_church_id,
        'joined_elsewhere', p.church_id is not null and p.church_id <> p_church_id
      ) as j
      from public.church_join_inquiries i
      join public.profiles p on p.id = i.user_id
      where i.church_id = p_church_id and i.dismissed_at is null
      order by i.created_at desc
      limit 50
    ) x
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.church_join_inquiry_list(uuid) from public, anon;
grant execute on function public.church_join_inquiry_list(uuid) to authenticated;

create or replace function public.dismiss_church_join_inquiry(p_church_id uuid, p_username text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_user uuid;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  select id into v_user from public.profiles where lower(username) = lower(btrim(coalesce(p_username, ''))) limit 1;
  update public.church_join_inquiries set dismissed_at = coalesce(dismissed_at, now())
   where church_id = p_church_id and user_id = v_user;
  return jsonb_build_object('ok', found);
end;
$$;
revoke all on function public.dismiss_church_join_inquiry(uuid, text) from public, anon;
grant execute on function public.dismiss_church_join_inquiry(uuid, text) to authenticated;

notify pgrst, 'reload schema';
