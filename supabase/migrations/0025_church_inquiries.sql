-- Church inquiries — the "For Churches" contact funnel. Groups moved off the
-- main app; churches interested in a congregation cohort submit an inquiry here.
-- Anyone (even a logged-out website visitor) can submit; only the admin reads.

create table if not exists public.church_inquiries (
  id uuid primary key default gen_random_uuid(),
  church_name text not null,
  contact_name text not null,
  email text not null,
  size text,
  message text,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.church_inquiries enable row level security;

-- Submit an inquiry. Open to anon + authenticated (it's a public contact form);
-- basic length guards keep out empty/garbage rows. Reads are admin-only (below).
create or replace function public.submit_church_inquiry(
  p_church text, p_name text, p_email text, p_size text default null, p_message text default null
)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if length(trim(coalesce(p_church, ''))) < 2
     or length(trim(coalesce(p_name, ''))) < 2
     or length(trim(coalesce(p_email, ''))) < 5
     or position('@' in coalesce(p_email, '')) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  insert into public.church_inquiries(church_name, contact_name, email, size, message)
  values (trim(p_church), trim(p_name), trim(p_email), nullif(trim(coalesce(p_size,'')), ''), nullif(trim(coalesce(p_message,'')), ''));
  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.submit_church_inquiry(text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
