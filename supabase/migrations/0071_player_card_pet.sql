-- The player card carries the player's PET.
--
-- Until now a pet was visible only on its owner's own profile, and CLAUDE.md
-- recorded that as a decision rather than an oversight: "a pet visible to
-- strangers is one step from being compared." That rule is now narrower, and
-- the reason it can be is worth stating precisely, because it is the same
-- reason a skin, a border and a card background are already public here:
--
--   A PET ON A CARD IS A PICTURE, NOT A NUMBER. What this adds is one id out of
--   a fixed catalog, drawn beside the figure. It carries no count, no rarity
--   label, no "unlocked on", and no ordering. Nothing about it can be summed,
--   ranked or put in a row next to somebody else's — which is the actual thing
--   the old rule was protecting against.
--
-- WHAT IS STILL NOT WIDENED, deliberately: the leaderboard RPCs, church_json
-- and keep_json are untouched, so a pet does not appear beside a figure in a
-- crowd or on a board row. A card is a thing you open one at a time, on
-- purpose; a board is a list of people side by side, which is exactly where a
-- companion would start reading as a score. If those are ever widened it should
-- be a separate decision with its own argument, not a follow-on from this one.
--
-- `pet` is a plain text column on profiles holding a catalog id (data/pets.ts),
-- and petById() drops an id this build doesn't know — so an unknown value is a
-- figure with no companion, never a crash.

create or replace function public.get_player_card(p_username text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'username', p.username,
    'avatar_emoji', p.avatar_emoji,
    'avatar_character', p.avatar_character,
    'avatar_border', coalesce(p.avatar_border, 'default'),
    'avatar_badge', p.avatar_badge,
    'card_background', p.card_background,
    'pet', p.pet,
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
$function$;

notify pgrst, 'reload schema';
