-- Verse Arcade — Apple in-app purchase fulfillment.
-- ---------------------------------------------------------------------------
-- The web sells cosmetic packs through Stripe (fulfill_skin, 0034/0043/0044).
-- The App Store build can't: Apple requires digital cosmetics to go through
-- in-app purchase (Review Guideline 3.1.1). Same catalog, same entitlements,
-- second checkout — so this is the StoreKit twin of fulfill_skin.
--
-- Why an RPC at all: enforce_skin_entitlement (0043, narrowed in 0044) blocks a
-- client from writing a paid skin onto its own profiles row. That's the whole
-- defense against "just PATCH owned_skins", and it must stay — so a purchase
-- lands through grant_skins(), which sets app.grant_ok, and never through the
-- plain profiles UPDATE that grantSkin() uses for free preview unlocks.
--
-- Client mirror: src/lib/iap.ts (product ids, pack expansion) and
-- src/store/iap.ts (the call). Keep the sku vocabulary identical to 0044 —
-- a bundle is 'pack_<id>', a single skin is its skin id.
--
-- Idempotent: create-or-replace throughout, `if not exists` on the table, so
-- re-running is a no-op (see CLAUDE.md — migrations here are applied by hand).
-- ---------------------------------------------------------------------------

-- Every Apple purchase we've fulfilled, so a replayed call can't double-grant
-- and so there's a paper trail to reconcile against App Store Connect.
create table if not exists public.apple_purchases (
  transaction_id text primary key,
  user_id        uuid references auth.users(id) on delete set null,
  sku            text,
  skins          text[]      not null default '{}',
  created_at     timestamptz not null default now()
);

alter table public.apple_purchases enable row level security;

-- Readable by the buyer, writable by nobody directly — only the SECURITY
-- DEFINER function below writes here.
drop policy if exists apple_purchases_select_own on public.apple_purchases;
create policy apple_purchases_select_own on public.apple_purchases
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Fulfill one Apple purchase.
--
-- p_skins is what the CLIENT believes it bought; it is never trusted as-is.
-- The sku is expanded server-side the same way the Stripe path expands it, and
-- the intersection is what actually gets granted — so a tampered client can't
-- ask for 'whale' by buying the cheapest pack. When p_sku is null (a restore,
-- where Apple hands back a set of product ids rather than one purchase), each
-- requested skin is checked against the known paid catalog instead.
--
-- House pattern: security definer, search_path pinned, auth.uid() for identity,
-- and a null-uid guard because Postgres grants EXECUTE to PUBLIC by default and
-- this project doesn't revoke it (see CLAUDE.md).
-- ---------------------------------------------------------------------------
create or replace function public.fulfill_apple_purchase(
  p_sku            text,
  p_skins          text[],
  p_transaction_id text
)
returns text[]
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_allowed text[];
  v_grant   text[];
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  -- What this purchase is genuinely worth.
  if p_sku is not null and coalesce(array_length(pack_skins(p_sku), 1), 0) > 0 then
    v_allowed := pack_skins(p_sku);            -- a bundle: all of it, or none
  elsif p_sku is not null then
    v_allowed := array[lower(trim(p_sku))];    -- a single skin sku
  else
    -- Restore: allow anything that is a real paid skin. Apple already told the
    -- client what this Apple ID owns; we're only refusing made-up ids.
    v_allowed := array[
      'moses','esther','elijah','whale','gabriel','michael','seraph','shades'
    ];
  end if;

  select array(
    select distinct x
      from unnest(coalesce(p_skins, '{}'::text[])) as x
     where x = any(v_allowed)
  ) into v_grant;

  if coalesce(array_length(v_grant, 1), 0) = 0 then
    return '{}'::text[];
  end if;

  -- Idempotency: Apple/RevenueCat can deliver the same transaction more than
  -- once, and a restore replays every past purchase every time it runs.
  if p_transaction_id is not null then
    insert into public.apple_purchases(transaction_id, user_id, sku, skins)
    values (p_transaction_id, v_uid, p_sku, v_grant)
    on conflict (transaction_id) do nothing;
  end if;

  -- The privileged write (0044). Distinct-union, so re-granting is harmless.
  perform grant_skins(v_uid, v_grant);
  return v_grant;
end $$;

grant execute on function public.fulfill_apple_purchase(text, text[], text) to authenticated;
