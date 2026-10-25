-- 0137b — the cascading foreign keys for `church_check_ins`, kept apart from
-- 0137 because the Supabase MCP pauses on this clause for a confirmation that
-- never reaches a cloud session. Erasing an account (0085) must take the notes
-- it sent and received with it: a note is a leader's words about a person.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'church_check_ins_church_fk') then
    alter table public.church_check_ins
      add constraint church_check_ins_church_fk foreign key (church_id) references public.churches(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'church_check_ins_sender_fk') then
    alter table public.church_check_ins
      add constraint church_check_ins_sender_fk foreign key (sender_id) references public.profiles(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'church_check_ins_recipient_fk') then
    alter table public.church_check_ins
      add constraint church_check_ins_recipient_fk foreign key (recipient_id) references public.profiles(id) on delete cascade;
  end if;
end $$;
