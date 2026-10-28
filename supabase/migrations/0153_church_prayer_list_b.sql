-- 0153 part b — the foreign keys for church_prayer_marks, kept apart because
-- the Supabase MCP waits on a confirmation for any cascade clause. Paste into
-- the SQL editor; idempotent.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'church_prayer_marks_leader_fk') then
    alter table public.church_prayer_marks add constraint church_prayer_marks_leader_fk
      foreign key (leader_id) references public.profiles(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'church_prayer_marks_request_fk') then
    alter table public.church_prayer_marks add constraint church_prayer_marks_request_fk
      foreign key (request_id) references public.prayer_requests(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'church_prayer_marks_church_fk') then
    alter table public.church_prayer_marks add constraint church_prayer_marks_church_fk
      foreign key (church_id) references public.churches(id) on delete cascade;
  end if;
end $$;
