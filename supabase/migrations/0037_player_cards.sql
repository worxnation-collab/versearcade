-- Verse Arcade — player cards.
-- ---------------------------------------------------------------------------
-- Tapping anyone's avatar pulls up their player card: identity, level and the
-- six profile stats, painted on a background they equipped. Backgrounds are
-- earned rather than bought — each one is keyed to a collectible (an achievement
-- card or a Daily Chest relic), so owning the collectible unlocks the matching
-- background. Client catalog + styling: src/data/playerCards.ts.
--
-- Two additions:
--  1. profiles.card_background — the equipped background key, gated by
--     set_card_background() against the player's actual unlocks.
--  2. get_player_card() — the public view of another player, so a card can be
--     opened from the leaderboard/buddies/battles without exposing the rest of
--     the profiles row.
-- ---------------------------------------------------------------------------

-- null = the free 'default' background. Stored as the collectible key otherwise.
alter table public.profiles add column if not exists card_background text;

-- Equip a background. 'default' (or clearing it) is always allowed; anything
-- else must be a collectible this account has actually unlocked, so a crafted
-- client can't equip a background it didn't earn.
create or replace function public.set_card_background(p_key text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := nullif(trim(coalesce(p_key, '')), '');
begin
  if uid is null then raise exception 'not authenticated'; end if;

  if clean is null or clean = 'default' then
    update public.profiles set card_background = null where id = uid;
    return json_build_object('ok', true, 'key', 'default');
  end if;

  if not exists (
    select 1 from public.user_unlocks
    where user_id = uid and collectible_key = clean
  ) then
    return json_build_object('ok', false, 'error', 'not unlocked');
  end if;

  update public.profiles set card_background = clean where id = uid;
  return json_build_object('ok', true, 'key', clean);
end;
$$;

revoke all on function public.set_card_background(text) from public;
grant execute on function public.set_card_background(text) to authenticated;

-- The public card for a player, by handle. Every field here is already visible
-- on the leaderboard; `cards` is the collection count, which is what the card's
-- CARDS stat shows. Hidden accounts (app-review, etc.) return null, matching how
-- they're kept off the leaderboard.
create or replace function public.get_player_card(p_username text)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'username', p.username,
    'avatar_emoji', p.avatar_emoji,
    'avatar_character', p.avatar_character,
    'avatar_border', coalesce(p.avatar_border, 'default'),
    'avatar_badge', p.avatar_badge,
    'card_background', p.card_background,
    'xp', p.xp,
    'level', p.level,
    'current_streak', p.current_streak,
    'longest_streak', p.longest_streak,
    'total_plays', p.total_plays,
    'denomination', p.denomination,
    'cards', (select count(*) from public.user_unlocks u where u.user_id = p.id)
  )
  from public.profiles p
  where lower(p.username) = lower(trim(coalesce(p_username, '')))
    and not coalesce(p.hidden, false)
  limit 1;
$$;

revoke all on function public.get_player_card(text) from public;
grant execute on function public.get_player_card(text) to anon, authenticated;
