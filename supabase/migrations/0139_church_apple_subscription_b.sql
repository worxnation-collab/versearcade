-- 0139b — the cascading foreign keys for `church_apple_subscriptions`, kept
-- apart from 0139 because the Supabase MCP pauses on this clause for a
-- confirmation that never reaches a cloud session (see 0134b). Erasing an
-- account (0085) takes its binding with it; the church's `verified` flag is
-- left as it stands, and the next RevenueCat event finds nothing to renew.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'church_apple_subscriptions_user_fk') then
    alter table public.church_apple_subscriptions
      add constraint church_apple_subscriptions_user_fk foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'church_apple_subscriptions_church_fk') then
    alter table public.church_apple_subscriptions
      add constraint church_apple_subscriptions_church_fk foreign key (church_id) references public.churches(id) on delete cascade;
  end if;
end $$;
