-- 0142b — the cascading foreign key for `church_draft_runs`, kept apart from
-- 0142 because the Supabase MCP pauses on this clause for a confirmation that
-- never reaches a cloud session. A church's run log goes with the church.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'church_draft_runs_church_fk') then
    alter table public.church_draft_runs
      add constraint church_draft_runs_church_fk foreign key (church_id) references public.churches(id) on delete cascade;
  end if;
end $$;
