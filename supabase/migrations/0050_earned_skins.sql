-- Verse Arcade — the skins stop being for sale.
-- ---------------------------------------------------------------------------
-- Everything in the catalog except the Founding Patron whale is now EARNED by
-- playing. Client catalog + the requirements themselves: FULL_SKINS in
-- src/data/avatar.ts.
--
--   moses    → 25 daily drops played        esther  → a 14-day streak
--   elijah   → a 60-day streak              baldwin → shared on 10 days
--   david    → shared on 25 days            cross   → 5 friends referred
--   angels   → add your church (all three)  eden    → daily reminders on
--   shades   → a free live-drop code (unchanged)
--   whale    → the one thing still sold
--
-- Two server-side rules follow from that:
--
--   1. enforce_skin_entitlement keeps refusing client writes to owned_skins,
--      and its protected list is restated here IN FULL (the function is
--      replaced wholesale, so a name dropped here is a skin silently unlocked
--      for anyone with a REST client). It stays long rather than shrinking to
--      just the whale on purpose: owned_skins is what set_card_background
--      trusts to gate the Angel Pack's two calling cards, and what
--      packEntitled() reads on the client. Earned skins get in through
--      claim_earned_skin below, which checks the requirement first.
--
--   2. claim_earned_skin() is new. Most requirements need no claim at all —
--      a longest streak, a level, a play count and a distinct-share count only
--      ever go up, so the client re-derives them correctly forever and nothing
--      is stored. Two of them can stop being true: a church you leave, and a
--      notification toggle you flip off. Nothing in this app ever takes a
--      cosmetic back, so those LATCH into owned_skins the moment they're met,
--      and this is the function that writes them.
--
-- On 'eden': its requirement is whether notifications are switched on, which is
-- a fact about a DEVICE and not about a row the server can read. It is granted
-- on the client's word for that reason. That is a deliberate, bounded
-- exception — the skin is free, forging it skips a toggle rather than a
-- payment, and it grants no calling cards. Every other requirement here is
-- re-checked against the caller's own profile row.
--
-- Idempotent — create-or-replace throughout; re-running is a no-op.
-- ---------------------------------------------------------------------------

-- 1. The entitlement lock, unchanged in behaviour and restated in full.
create or replace function public.enforce_skin_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  paid text[] := array[
    'moses','esther','elijah','whale','shades','gabriel','michael','seraph','eden'
  ];
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
      -- Strip only the unauthorized additions; keep everything else.
      new.owned_skins := array(
        select x from unnest(coalesce(new.owned_skins, '{}'::text[])) as x
        where not (x = any(paid)) or x = any(coalesce(old.owned_skins, '{}'::text[]))
      );
    end if;
  end if;
  return new;
end $$;

drop trigger if exists enforce_skin_entitlement_trg on public.profiles;
create trigger enforce_skin_entitlement_trg
  before update of owned_skins on public.profiles
  for each row execute function public.enforce_skin_entitlement();

-- 2. Is this account's earned requirement actually met? One place, so the RPC
-- below and anything added later can't disagree about what the goal was.
-- Mirrors requirementProgress() in src/data/avatar.ts — change one, change the
-- other (same rule as lib/practice.ts ↔ submit_practice; see CLAUDE.md).
create or replace function public.earned_skin_met(p_uid uuid, p_skin text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles%rowtype;
begin
  select * into p from public.profiles where id = p_uid;
  if not found then return false; end if;

  return case p_skin
    when 'baldwin' then (select count(distinct d) from unnest(coalesce(p.shared_days, '{}'::text[])) d) >= 10
    when 'david'   then (select count(distinct d) from unnest(coalesce(p.shared_days, '{}'::text[])) d) >= 25
    when 'cross'   then (select count(*) from public.profiles r where r.referred_by = p_uid) >= 5
    when 'moses'   then coalesce(p.total_plays, 0) >= 25
    when 'esther'  then coalesce(p.longest_streak, 0) >= 14
    when 'elijah'  then coalesce(p.longest_streak, 0) >= 60
    -- The Angel Pack: one requirement, three skins (granted together below).
    when 'gabriel' then p.church_id is not null
    when 'michael' then p.church_id is not null
    when 'seraph'  then p.church_id is not null
    -- Device fact — see the note at the top of this file.
    when 'eden'    then true
    -- 'shades' is code-only and 'whale' is sold. Neither is ever claimable.
    else false
  end;
end $$;

revoke all on function public.earned_skin_met(uuid, text) from public, anon, authenticated;

-- 3. The claim. Returns the account's full owned_skins so the client can adopt
-- the server's answer rather than guessing at it.
create or replace function public.claim_earned_skin(p_skin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  clean text := nullif(trim(coalesce(p_skin, '')), '');
  v_grant text[];
  v_skins text[];
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if clean is null then return jsonb_build_object('ok', false, 'reason', 'bad_skin'); end if;

  if not public.earned_skin_met(uid, clean) then
    return jsonb_build_object('ok', false, 'reason', 'not_earned');
  end if;

  -- A pack arrives whole or not at all: claiming any angel grants all three,
  -- which is also what makes the two pack calling cards light up (they gate on
  -- owning a skin from the pack — see set_card_background in 0043).
  v_grant := case
    when clean in ('gabriel','michael','seraph') then array['gabriel','michael','seraph']
    else array[clean]
  end;

  perform public.grant_skins(uid, v_grant);
  select coalesce(owned_skins, '{}'::text[]) into v_skins from public.profiles where id = uid;
  return jsonb_build_object('ok', true, 'skins', to_jsonb(v_skins));
end $$;

grant execute on function public.claim_earned_skin(text) to authenticated;

notify pgrst, 'reload schema';
