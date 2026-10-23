-- 0134b — the cascading foreign keys for `church_claims`, kept apart from 0134
-- because the Supabase MCP pauses on this clause for a confirmation that never
-- reaches a cloud session. Erasing an account (0085) must take its claims with
-- it: a claim carries the claimant's name and email.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'church_claims_user_fk') then
    alter table public.church_claims
      add constraint church_claims_user_fk foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'church_claims_church_fk') then
    alter table public.church_claims
      add constraint church_claims_church_fk foreign key (church_id) references public.churches(id) on delete cascade;
  end if;
end $$;
