-- 0144 b — the cascading foreign key for church_memo_uses, kept apart from
-- 0144 because the Supabase MCP waits on a confirmation for that clause.
-- Idempotent.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'church_memo_uses_church_fk') then
    alter table public.church_memo_uses
      add constraint church_memo_uses_church_fk
      foreign key (church_id) references public.churches (id) on delete cascade;
  end if;
end $$;
