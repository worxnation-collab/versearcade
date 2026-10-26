-- 0141b — the cascading foreign keys for `church_plan_taps`, kept apart from
-- 0141 because the Supabase MCP pauses on this clause (see 0134b). Erasing an
-- account or a church (0085) takes its taps with it.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'church_plan_taps_user_fk') then
    alter table public.church_plan_taps
      add constraint church_plan_taps_user_fk foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'church_plan_taps_church_fk') then
    alter table public.church_plan_taps
      add constraint church_plan_taps_church_fk foreign key (church_id) references public.churches(id) on delete cascade;
  end if;
end $$;
