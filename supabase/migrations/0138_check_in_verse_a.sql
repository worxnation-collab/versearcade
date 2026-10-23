-- 0138a — a check-in can carry today's church verse, and can be reported.
--
-- The table half; the functions are 0138b. Kept apart so the one ALTER that
-- relaxes a column applies (or is pasted) on its own.
--
--   * verse_ref / verse_text: a SNAPSHOT of the church's own approved verse for
--     the day, copied by the server out of `church_verses` (0119/0127). The
--     client never sends scripture; it asks for "today's verse" and the server
--     finds it. A snapshot, not a key, so a leader editing tomorrow's verse
--     never rewrites a note somebody already has.
--   * message becomes optional: the leader's line is prefilled and may be
--     cleared, so a note can be the verse alone. A row must still carry one or
--     the other (check_in_has_body).
--   * reported_at / hidden: the Prayer Wall's moderation shape (0099). The only
--     person who can see a note is its recipient, so the reporter is always
--     recipient_id and needs no column. A report stores NO reason, and nothing
--     here blocks a sender.

alter table public.church_check_ins add column if not exists verse_ref   text;
alter table public.church_check_ins add column if not exists verse_text  text;
alter table public.church_check_ins add column if not exists reported_at timestamptz;
alter table public.church_check_ins add column if not exists hidden      boolean not null default false;

alter table public.church_check_ins alter column message drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'check_in_has_body') then
    alter table public.church_check_ins
      add constraint check_in_has_body check (message is not null or verse_ref is not null);
  end if;
end $$;

create index if not exists church_check_ins_reported
  on public.church_check_ins (reported_at desc) where reported_at is not null and not hidden;
