-- Merging duplicate keep decorations.
--
-- Putting a decoration you already have out somewhere merges the two into one
-- finer piece instead of standing a second identical one beside it. The tier
-- rides on the placement value as a suffix — `keep_woven_rug`, then
-- `keep_woven_rug.2`, then `.3` — which is the whole schema change: every row
-- written before this reads correctly as tier 1, `my_keep` and `keep_json`
-- pass the string through untouched, and nothing had to be backfilled.
--
-- Tier is a LOOK, not a count, and that is what keeps it inside 0059's rules:
-- reading a hall still tells you nothing about how many members own a rug or
-- who hung it. Ownership is still derived from the six battle counters, so a
-- merge is not a grant and there is nothing here to hoard or revoke — clear a
-- merged prop and it starts again at plain, because you never stopped owning
-- the rug. The client decides WHICH anchor absorbs a duplicate (planPlacement
-- in src/data/keep.ts); the server's job is only to keep the value well-formed.
--
-- Idempotent: create or replace only.

create or replace function public.set_keep_placement(p_anchor text, p_decor text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  -- The anchor set is fixed (src/data/keep.ts ANCHORS). Validating against it
  -- bounds rows per player and keeps free text out of the table entirely.
  if p_anchor !~ '^(banner_[lr]|wall_[123]|rafters_[12]|table_[12]|floor_[12]|stable_1)$' then
    raise exception 'bad anchor';
  end if;

  if p_decor is null then
    delete from public.keep_placements where user_id = uid and anchor = p_anchor;
    return json_build_object('ok', true);
  end if;

  -- `.2` / `.3` is the merge tier, and 3 is the ceiling. A tier above the
  -- number of anchors that mount has is unreachable by tapping and worth a
  -- gilt ellipse if forged anyway — the 0059 clamp doctrine: bounded, cosmetic,
  -- nothing rankable to protect.
  if p_decor !~ '^keep_[a-z_]{1,40}(\.[23])?$' then raise exception 'bad decor'; end if;

  insert into public.keep_placements (user_id, anchor, decor_id)
  values (uid, p_anchor, p_decor)
  on conflict (user_id, anchor) do update set decor_id = excluded.decor_id;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.set_keep_placement(text, text) to authenticated;

notify pgrst, 'reload schema';
