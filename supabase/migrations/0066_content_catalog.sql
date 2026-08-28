-- Verse Arcade — the content catalog.
-- ---------------------------------------------------------------------------
-- Seasonal CONTENT — roads, waystation rewards, titles, confetti themes,
-- streak flames, chest skins, free skins and the art that goes with them —
-- becomes data served from here, so a Christmas road reaches an App Store
-- binary that shipped in August without a submission. Client half:
-- src/data/catalog.ts (shapes + sanitisers) and src/store/catalog.ts (fetch).
-- Design of record: docs/CONTENT-CATALOG.md.
--
-- WHAT THIS DELIBERATELY IS NOT
--
--   1. NOT A CODE CHANNEL. Everything here is data the client already knows how
--      to render. A catalog can name a quest verb but cannot add one — the
--      client drops any quest whose verb this build lacks (KNOWN_VERBS in
--      lib/season.ts), which is why the verb list is prepacked well ahead of
--      the quests that use it. Nothing served from this table is ever executed.
--
--   2. NOT A STOREFRONT. There is no price, sku, pack or checkout in the
--      schema and there must never be one. Whether the app may sell anything
--      lives in lib/commerce.ts and nowhere else (CLAUDE.md); a price in a row
--      an operator can edit is a storefront that skipped review, in every
--      storefront that forbids one. Catalog skins are free/earned/pass only,
--      enforced client-side in sanitizeSkins and by convention here.
--
--   3. NOT PLAYER-WRITABLE. Same rule as church_profiles (0050): no insert or
--      update policy, no player-callable write RPC. Publishing is
--      `admin_publish_catalog`, which requires profiles.is_admin. A client that
--      could write this table could hand every player any cosmetic in it.
--
-- WHAT IT CANNOT GRANT. Reward ids in a road are handed to claim_season_reward
-- (0058), which already accepts any id and writes it to season_unlocks — that
-- is unchanged and is safe for the same reason it always was: season unlocks
-- are cosmetic, feed no board, and set_seasonal_cosmetic still checks the
-- unlock row before it will equip one. A catalog CANNOT put a paid skin in
-- owned_skins; enforce_skin_entitlement (0057) is the gate for that and does
-- not consult this table.
--
-- Idempotent — create-if-not-exists plus create-or-replace; re-running is a
-- no-op.
-- ---------------------------------------------------------------------------

-- ── The table ───────────────────────────────────────────────────────────────
-- One row per published version, newest wins. Keeping history rather than
-- updating one row in place is what makes a bad publish recoverable: flip
-- `active` off and the previous version is live again on everyone's next
-- fetch, with no deploy and nothing to reconstruct by hand.
create table if not exists public.content_catalog (
  version     integer primary key,
  -- The whole catalog as the client expects it: { roads, titles, confetti,
  -- flames, chests, skins, art }. Kept as one document rather than six tables
  -- on purpose — it is published, fetched and rolled back as one thing, and a
  -- road that half-loads because a join failed is exactly the state
  -- data/catalog.ts is written to avoid.
  doc         jsonb   not null,
  active      boolean not null default false,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);

alter table public.content_catalog enable row level security;

-- No select policy for players: the table is reachable ONLY through the
-- function below, which returns the active document and nothing else. That
-- keeps drafts (active = false) genuinely private, so a season can be staged in
-- production without leaking what's in it.
drop policy if exists "catalog admin read" on public.content_catalog;
create policy "catalog admin read" on public.content_catalog
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

create index if not exists content_catalog_active_idx
  on public.content_catalog (active, version desc);

-- ── The read ────────────────────────────────────────────────────────────────
-- Deliberately executable by `anon`. A guest can reach /play and the seasonal
-- road, so gating the catalog behind auth would give signed-out players a
-- different season from everyone else — which is the shared-drop promise
-- broken, and for content that is identical for every player anyway.
--
-- Returns the highest active version, or a null doc when nothing is published
-- (a brand-new project, or every version rolled back). The client reads that as
-- "no overlay" and renders the bundled catalog, which is a complete app.
create or replace function public.content_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select doc
    from public.content_catalog
   where active
   order by version desc
   limit 1;
$$;

grant execute on function public.content_catalog() to anon, authenticated;

-- ── The write ───────────────────────────────────────────────────────────────
-- Admin only, and it is the ONLY way in. Note this is not the house
-- `auth.uid() is null then raise` pattern that most functions here use: those
-- guard "is this a player", this guards "is this an operator", so it checks
-- profiles.is_admin the way admin_upsert_church_profile (0050) does.
--
-- Publishing sets the new version active and deactivates every other one in the
-- same statement, so there is never a moment with two active catalogs.
create or replace function public.admin_publish_catalog(
  p_version integer,
  p_doc     jsonb,
  p_note    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_admin boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select is_admin into v_admin from public.profiles where id = uid;
  if not coalesce(v_admin, false) then raise exception 'not permitted'; end if;

  if p_version is null or p_version < 1 then raise exception 'bad version'; end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then raise exception 'bad doc'; end if;
  -- A catalog is a few tens of KB of text. Anything past this is a mistake, and
  -- every client fetches it on launch.
  if pg_column_size(p_doc) > 512000 then raise exception 'catalog too large'; end if;

  insert into public.content_catalog (version, doc, active, note, created_by)
  values (p_version, p_doc, true, p_note, uid)
  on conflict (version) do update
    set doc = excluded.doc,
        active = true,
        note = coalesce(excluded.note, content_catalog.note),
        created_by = excluded.created_by;

  update public.content_catalog set active = false where version <> p_version and active;

  return jsonb_build_object('version', p_version, 'ok', true);
end $$;

revoke all on function public.admin_publish_catalog(integer, jsonb, text) from public, anon;
grant execute on function public.admin_publish_catalog(integer, jsonb, text) to authenticated;

-- Roll back to whatever was published before, without needing the document.
create or replace function public.admin_rollback_catalog()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_admin boolean;
  v_current integer;
  v_prev integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select is_admin into v_admin from public.profiles where id = uid;
  if not coalesce(v_admin, false) then raise exception 'not permitted'; end if;

  select version into v_current from public.content_catalog where active order by version desc limit 1;
  if v_current is null then raise exception 'nothing published'; end if;

  select version into v_prev
    from public.content_catalog
   where version < v_current
   order by version desc
   limit 1;

  update public.content_catalog set active = (version = v_prev);
  -- v_prev null means we just rolled back the FIRST catalog ever published:
  -- nothing is active, the RPC returns null, and every client falls back to its
  -- bundled content. That is a valid, playable state, not an error.
  return jsonb_build_object('from', v_current, 'to', v_prev);
end $$;

revoke all on function public.admin_rollback_catalog() from public, anon;
grant execute on function public.admin_rollback_catalog() to authenticated;

notify pgrst, 'reload schema';
