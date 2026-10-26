-- 0140b — the two triggers for 0140, kept apart because their clause names a
-- destructive event and the Supabase MCP may pause on it (see 0134b). Created
-- only if missing, so a re-run is a no-op without having to replace one.

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'church_admins_end_apple'
                   and tgrelid = 'public.church_admins'::regclass) then
    create trigger church_admins_end_apple
      after delete on public.church_admins
      for each row execute function public.church_admin_gone_end_apple();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'church_apple_binding_gone'
                   and tgrelid = 'public.church_apple_subscriptions'::regclass) then
    create trigger church_apple_binding_gone
      after delete on public.church_apple_subscriptions
      for each row execute function public.church_apple_binding_gone();
  end if;
end $$;
