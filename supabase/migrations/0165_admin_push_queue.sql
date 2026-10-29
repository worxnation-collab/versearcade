-- 0165: is the quiet-hours queue (0164) actually draining?
--
-- One read for Admin -> Push: how many notes are waiting, when the next comes
-- due, how many are OVERDUE (due over twenty minutes ago and still waiting —
-- the flush runs every fifteen, so anything past that means it is not), how
-- many went out in the last day and when the last one did, how many people
-- have quiet hours on, and when the flush LAST RAN. Counts and times only: no
-- recipient, no note, no name. Operator only (require_admin).
--
-- "Last ran" is push-send's own word, not pg_cron's. A cron run reads
-- "succeeded" the moment net.http_post QUEUES the request, so a flush the
-- function refused with a 401 looked exactly like a good one — found on the
-- first morning, before push-send had deployed. So the flush stamps
-- `push_flush_status` (one row) after it has claimed and sent, and that row is
-- what the panel trusts; pg_cron's line is kept beside it as "last call".

create table if not exists public.push_flush_status (
  id int primary key default 1 check (id = 1),
  ran_at timestamptz not null,
  due int not null default 0,
  pushed int not null default 0
);
alter table public.push_flush_status enable row level security;
revoke all on table public.push_flush_status from public, anon, authenticated;
grant all on table public.push_flush_status to service_role;

create or replace function public.push_flush_note(p_due int, p_pushed int)
returns void language sql security definer set search_path = public as $$
  insert into push_flush_status (id, ran_at, due, pushed)
  values (1, now(), greatest(coalesce(p_due, 0), 0), greatest(coalesce(p_pushed, 0), 0))
  on conflict (id) do update set ran_at = excluded.ran_at, due = excluded.due, pushed = excluded.pushed;
$$;
revoke all on function public.push_flush_note(int, int) from public, anon, authenticated;
grant execute on function public.push_flush_note(int, int) to service_role;

create or replace function public.admin_push_queue()
returns jsonb language plpgsql stable security definer set search_path = public, cron as $$
declare
  q jsonb;
  run jsonb;
  flush jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
    'waiting',   count(*) filter (where sent_at is null),
    'overdue',   count(*) filter (where sent_at is null and deliver_after < now() - interval '20 minutes'),
    'next_due',  min(deliver_after) filter (where sent_at is null),
    'sent_24h',  count(*) filter (where sent_at > now() - interval '24 hours'),
    'last_sent', max(sent_at)
  ) into q from push_deferred;

  begin
    select jsonb_build_object('at', d.start_time, 'status', d.status, 'message', left(d.return_message, 200))
      into run
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
     where j.jobname = 'push-deferred-flush'
     order by d.start_time desc limit 1;
  exception when others then
    run := null;  -- pg_cron's tables unreadable: say nothing rather than fail the panel
  end;

  select jsonb_build_object('at', ran_at, 'due', due, 'pushed', pushed)
    into flush from push_flush_status where id = 1;

  return q || jsonb_build_object(
    'quiet_people', (select count(*) from profiles where quiet_hours is not null),
    'last_flush', flush,
    'last_call', run
  );
end $$;

revoke all on function public.admin_push_queue() from public, anon;
grant execute on function public.admin_push_queue() to authenticated;
