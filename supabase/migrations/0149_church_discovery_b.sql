-- 0149 part b — the foreign keys on `church_join_inquiries`, kept apart because
-- their cascade clause is the word the Supabase MCP stops on (CLAUDE.md, "Why
-- some Supabase MCP applies hang"). Paste into the SQL editor. Until it runs,
-- an erased account's inquiry simply drops out of the list (the reader joins
-- profiles) and an erased church's are never read again.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'church_join_inquiries_church_fk') then
    alter table public.church_join_inquiries
      add constraint church_join_inquiries_church_fk
      foreign key (church_id) references public.churches(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'church_join_inquiries_user_fk') then
    alter table public.church_join_inquiries
      add constraint church_join_inquiries_user_fk
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;
