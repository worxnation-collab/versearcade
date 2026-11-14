-- 0180 — a member chooses whether their church sees their scores.
--
-- church_feed (0128) showed every member's score on every play to the whole
-- congregation ("qamember played the church verse — 2/5, 446 pts"), which let
-- members measure themselves against each other. The owner's call
-- (2026-11-14): each player hides or shows their own score to the other
-- members; the church's LEADERSHIP always sees it (they already see names
-- and plays by design since 0128).
--
--   profiles.church_scores_shown  boolean, default FALSE — hidden unless the
--                                 player chooses to show it. The feed still
--                                 says that they played; only the numbers go.
--   set_church_scores_shown(bool) the caller's own flag, nobody else's.
--   church_feed                   restated from production's 0128 body with
--                                 one rule: score/correct/total are nulled
--                                 on a play event unless the viewer leads the
--                                 church, the play is the viewer's own, or
--                                 the player chose to show it.

alter table public.profiles add column if not exists church_scores_shown boolean not null default false;

create or replace function public.set_church_scores_shown(p_shown boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_shown is null then return jsonb_build_object('ok', false, 'reason', 'bad_value'); end if;
  update public.profiles set church_scores_shown = p_shown where id = uid;
  return jsonb_build_object('ok', true, 'shown', p_shown);
end; $$;
revoke all on function public.set_church_scores_shown(boolean) from public, anon;
grant execute on function public.set_church_scores_shown(boolean) to authenticated;

create or replace function public.church_feed(p_church_id uuid, p_limit integer default 40)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 40), 1), 100);
  v_since timestamptz := now() - interval '14 days';
  v_uid uuid := auth.uid();
  v_leader boolean;
  v jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.church_insider(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  v_leader := public.is_church_admin(p_church_id);

  with members as (
    select id, username, avatar_emoji, avatar_character, church_joined_at,
           (v_leader or id = v_uid or church_scores_shown) as open
      from public.profiles where church_id = p_church_id
  ), ev as (
    select 'church_verse'::text as kind, cvp.created_at as at, m.username, m.avatar_emoji, m.avatar_character,
           case when m.open then cvp.score end as score,
           case when m.open then cvp.correct end as correct,
           case when m.open then cvp.total end as total,
           cv.reference as detail, null::int as points
      from public.church_verse_plays cvp
      join members m on m.id = cvp.user_id
      left join public.church_verses cv on cv.church_id = cvp.church_id and cv.drop_date = cvp.drop_date
     where cvp.church_id = p_church_id and cvp.created_at >= v_since
    union all
    select 'drop', pl.created_at, m.username, m.avatar_emoji, m.avatar_character,
           case when m.open then pl.score end,
           case when m.open then pl.correct_count end,
           case when m.open then pl.total_questions end,
           null, null
      from public.plays pl join members m on m.id = pl.user_id
     where pl.created_at >= v_since
    union all
    select 'gave', g.created_at, m.username, m.avatar_emoji, m.avatar_character,
           null, null, null, null, g.points
      from (select user_id, created_at, points from public.church_contributions where church_id = p_church_id
            union all select user_id, created_at, points from public.church_offerings where church_id = p_church_id
            union all select user_id, created_at, points from public.keep_offerings where church_id = p_church_id) g
      join members m on m.id = g.user_id
     where g.created_at >= v_since
    union all
    select 'joined', m.church_joined_at, m.username, m.avatar_emoji, m.avatar_character,
           null, null, null, null, null
      from members m where m.church_joined_at >= v_since
    union all
    select 'notice', a.created_at, p.username, p.avatar_emoji, p.avatar_character,
           null, null, null, a.message, null
      from public.church_announcements a left join public.profiles p on p.id = a.created_by
     where a.church_id = p_church_id and a.created_at >= v_since
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', kind, 'at', at, 'username', username, 'avatar_emoji', avatar_emoji,
           'avatar_character', avatar_character, 'score', score, 'correct', correct,
           'total', total, 'detail', detail, 'points', points) order by at desc), '[]'::jsonb)
    into v
    from (select * from ev order by at desc limit v_limit) x;

  return jsonb_build_object('ok', true, 'events', v);
end;
$function$;
