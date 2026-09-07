-- 0107: the "Cool Dad" skin — the app's owner as a character.
--
-- Same shape as the creator-collab skins (0057 sonshine, 0082 porchlight,
-- 0088 lantern): a 'paid' + exclusive skin that rides the owned_skins
-- entitlement and is granted by promo code or grant_skins(), never sold.
--
-- What this does, and why each half exists:
--
--   1. 'cooldad' joins the protected list in enforce_skin_entitlement, so no
--      client can write it into its own owned_skins. The list is restated
--      WHOLESALE from 0095 (thirteen names) plus this one — copy forward from
--      THIS file next time, never from an earlier one (CLAUDE.md).
--   2. A promo_codes row, active, so the owner can hand the code to family
--      without an admin grant. Toggle it off in the admin panel to retire it;
--      never expire the skin.
--   3. Deliberately NOT added to fulfill_skin's allowlist, so neither Stripe
--      nor IAP can ever grant it.
--
-- Idempotent: create-or-replace plus on-conflict-do-nothing.

create or replace function public.enforce_skin_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  paid text[] := array[
    'moses','esther','elijah','whale','shades','gabriel','michael','seraph','eden','sonshine',
    'porchlight','lantern','cephas','cooldad'
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

insert into public.promo_codes(code, skin_id, active) values ('COOLDAD', 'cooldad', true)
on conflict (code) do nothing;

notify pgrst, 'reload schema';
