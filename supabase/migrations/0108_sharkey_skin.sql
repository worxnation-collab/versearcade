-- 0108: "Sharkey" — the founder's own skin, locked to one account.
--
-- 0107 shipped this render as `cooldad`, a promo-code collab skin. The owner
-- renamed it and asked that nobody else be able to have it. Renaming an
-- entitlement id is normally forbidden — it silently un-owns the skin for
-- everybody who redeemed — and it is safe here ONLY because it was checked
-- first: at the time of writing zero profiles carried `cooldad`, zero
-- skin_purchases rows named it, and the code had been live about an hour.
-- Do not take this migration as licence to rename a live id.
--
-- What locks it, and it takes all three:
--
--   1. `sharkey` joins the protected list in enforce_skin_entitlement, so no
--      client can write it into its own owned_skins. The list is restated
--      WHOLESALE from 0107 (fourteen names) plus this one — copy forward from
--      THIS file next time, never from an earlier one (CLAUDE.md). `cooldad`
--      is KEPT in the list even though nothing reads it now: guarding a dead
--      id is free, and dropping names from this list is the one way to unlock
--      a protected skin for everybody by accident.
--   2. The COOLDAD promo code is DEACTIVATED rather than deleted, so the row
--      stays legible in the admin panel and the change is one toggle to undo.
--      No code is created for `sharkey` — a code is a way for somebody else to
--      have it, which is the thing being removed.
--   3. `sharkey` is deliberately absent from fulfill_skin's allowlist, so
--      neither Stripe nor IAP can ever grant it.
--
-- That leaves grant_skins() as the only door, and the grant at the bottom
-- walks through it once, for the founder. `sharkbait` is keyed by username the
-- way 0023, 0026 and 0027 key it.
--
-- Idempotent: create-or-replace, a guarded update, and a grant that is a
-- distinct-union (re-running adds nothing).

create or replace function public.enforce_skin_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  paid text[] := array[
    'moses','esther','elijah','whale','shades','gabriel','michael','seraph','eden','sonshine',
    'porchlight','lantern','cephas','cooldad','sharkey'
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
      -- Strip only the unauthorized paid additions; keep everything else.
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

-- 2. The code that used to grant it is off. Not deleted: a dead row in the
--    admin panel says what happened, and re-enabling is one toggle.
update public.promo_codes set active = false where code = 'COOLDAD';

-- 3. The one grant. Through grant_skins() rather than admin_grant_skin(),
--    which would file a skin_purchases row with reason='manual' and show a
--    free grant in the dashboard's Sales tab as though it were revenue.
do $$
declare v_uid uuid;
begin
  select id into v_uid from public.profiles where username = 'sharkbait';
  if v_uid is not null then
    perform public.grant_skins(v_uid, array['sharkey']);
  end if;
end $$;

notify pgrst, 'reload schema';
