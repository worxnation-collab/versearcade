-- 0172: tell a player their address bounced.
--
-- 0171 stops all email to an address that hard-bounced, and the player has no
-- way to know: the switch in Settings still reads ON, and nothing arrives.
-- `my_email_prefs` (0169) is restated with two more keys, for the CALLER only:
--
--   • `bounced`: their current account address is on the suppression list
--     for a bounce. A complaint is deliberately NOT surfaced: the player
--     pressed "spam" themselves, and a note asking them to fix it would be
--     arguing with their own no.
--   • `email`: their own address, so the note can say which one bounced.
--     Nobody else's; the owner is auth.uid() and no user id is taken.
--
-- Changing the account address clears it by construction: the suppression is
-- keyed on the hash of the ADDRESS, and a new address has a different hash.

create or replace function public.my_email_prefs()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p jsonb;
  addr text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select email_prefs into p from profiles where id = uid;
  select nullif(btrim(u.email), '') into addr from auth.users u where u.id = uid;
  return jsonb_build_object(
    'comeback', coalesce((p->>'comeback')::boolean, true),
    'has_email', addr is not null,
    'email', addr,
    'bounced', addr is not null and exists (
      select 1 from email_suppressions s
       where s.email_hash = public.email_hash(addr) and s.reason = 'bounce'));
end $$;

revoke all on function public.my_email_prefs() from public, anon;
grant execute on function public.my_email_prefs() to authenticated;
