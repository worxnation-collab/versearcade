-- 0148 part b — the foreign keys on `church_auto_weeks`, kept apart because
-- their cascade clause is the word the Supabase MCP stops on (CLAUDE.md, "Why
-- some Supabase MCP applies hang"). Paste into the SQL editor. Until it runs
-- nothing is wrong: the function writes the ids it was given, and a job is
-- only ever read through its church.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'church_auto_weeks_church_fk') then
    alter table public.church_auto_weeks
      add constraint church_auto_weeks_church_fk
      foreign key (church_id) references public.churches(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'church_auto_weeks_creator_fk') then
    alter table public.church_auto_weeks
      add constraint church_auto_weeks_creator_fk
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;
end $$;
