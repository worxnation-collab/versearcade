-- Church discovery: a public directory, the profile's extras, and the giving link.
--
-- Builds on 0116 (church packages) and REQUIRES it — every object here reads
-- `churches.verified` or `church_announcements`. Idempotent; safe to re-run.
--
-- What it adds, and where each line of the brief landed:
--
--   • `church_directory(q, limit)` — every church in the app, by name, with a
--     location and the published tagline. PUBLIC (anon), because "visible to
--     everyone" includes the person who followed a link from a bulletin. It is
--     ordered by congregation size and then name — never by `verified`. Sorting
--     paid churches first would be the auction CLAUDE.md refuses for the
--     sponsored slot ("a billboard, not an auction"); a verified church is more
--     USEFUL to its members, not higher on a list.
--   • `church_extras(church)` — what the profile page needs beyond 0074/0050:
--     verified, logo, the live announcement, and the giving link. PUBLIC too:
--     the announcement is the free layer's "simple local announcement", the same
--     kind of leadership-authored text a claimed church already publishes
--     through `update_my_church_profile`.
--   • `churches.giving_url` + `set_church_giving_url` — https only, verified
--     churches only. Returned by `church_extras` only while the church is
--     verified, so an un-renewed package goes quiet rather than half-working.
--     Whether a BUILD may show it is `givingLinkVisible()` in lib/commerce.ts.
--   • Announcements become a FREE-layer write: any claimed church's admin may
--     post one (0116 required verified). What stays paid is the member BANNER —
--     `my_church_today` still returns announcements only for a verified church.
--   • `my_church_today` restated to carry the church's name, so the daily drop
--     can say whose verse it is without a second round trip.

-- ---------------------------------------------------------------------------
-- Giving link
-- ---------------------------------------------------------------------------
alter table public.churches add column if not exists giving_url text;
alter table public.churches drop constraint if exists churches_giving_url_https;
alter table public.churches add constraint churches_giving_url_https
  check (giving_url is null or (giving_url ~ '^https://[^/\s]+/\S*$' and length(giving_url) <= 500));

-- A claimed, verified church sets its own giving link. '' or null clears it.
create or replace function public.set_church_giving_url(p_church_id uuid, p_url text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_church_admin(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;
  if not public.church_is_verified(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_verified');
  end if;
  if v_url is not null then
    -- A bare host gets https:// (the 0079 website rule); any other scheme,
    -- http: included, is refused rather than mangled — money goes over https.
    if v_url !~* '^[a-z][a-z0-9+.-]*:' then
      v_url := 'https://' || v_url;
    end if;
    if v_url ~ '^https://[^/\s]+$' then
      v_url := v_url || '/';
    end if;
    if v_url !~ '^https://[^/\s]+/\S*$' or length(v_url) > 500 then
      return jsonb_build_object('ok', false, 'reason', 'invalid_url');
    end if;
  end if;
  update public.churches set giving_url = v_url where id = p_church_id;
  return jsonb_build_object('ok', true, 'giving_url', v_url);
end;
$$;

grant execute on function public.set_church_giving_url(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Announcements: a free-layer write
-- ---------------------------------------------------------------------------
drop policy if exists church_announcements_admin_insert on public.church_announcements;
create policy church_announcements_admin_insert on public.church_announcements
  for insert to authenticated with check (public.is_church_admin(church_id));
drop policy if exists church_announcements_admin_update on public.church_announcements;
create policy church_announcements_admin_update on public.church_announcements
  for update to authenticated using (public.is_church_admin(church_id))
  with check (public.is_church_admin(church_id));

-- ---------------------------------------------------------------------------
-- The public directory
-- ---------------------------------------------------------------------------
-- Every word of the query must appear in the name or the town, in any order —
-- the per-word rule 0113 settled on, so "Appleton Alliance" finds
-- "Alliance Church - Appleton". LIKE metacharacters are escaped for the reason
-- 0113 gives: a search box, not a pattern. 23 rows today; a seq scan is right.
create or replace function public.church_directory(p_q text default null, p_limit int default 40)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_words text[];
  v_limit int := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  select coalesce(array_agg('%' || replace(replace(replace(w, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%'), '{}')
    into v_words
    from regexp_split_to_table(lower(btrim(coalesce(p_q, ''))), '[[:space:]]+') w
   where w <> '';

  return coalesce((
    select jsonb_agg(row_to_json(r)::jsonb order by r.members desc, r.name)
      from (
        select c.id, c.name, c.city, c.region, c.verified, c.logo_url,
               case when cp.published then cp.tagline end as tagline,
               (select count(*) from public.profiles p where p.church_id = c.id) as members
          from public.churches c
          left join public.church_profiles cp on cp.church_id = c.id
         where cardinality(v_words) = 0
            or lower(c.name || ' ' || coalesce(c.city, '') || ' ' || coalesce(c.region, ''))
               like all (v_words)
         order by members desc, c.name
         limit v_limit
      ) r
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.church_directory(text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the profile page adds
-- ---------------------------------------------------------------------------
create or replace function public.church_extras(p_church_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  c record;
  v_news jsonb;
begin
  select id, verified, logo_url, giving_url into c from public.churches where id = p_church_id;
  if c.id is null then
    return jsonb_build_object('ok', false);
  end if;

  select jsonb_build_object('id', a.id, 'message', a.message, 'created_at', a.created_at)
    into v_news
    from public.church_announcements a
   where a.church_id = p_church_id and (a.expires_at is null or a.expires_at > now())
   order by a.created_at desc
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'verified', c.verified,
    'logo_url', c.logo_url,
    'giving_url', case when c.verified then c.giving_url end,
    'announcement', v_news,
    'is_member', coalesce((select church_id = p_church_id from public.profiles where id = auth.uid()), false),
    'is_admin', public.is_church_admin(p_church_id)
  );
end;
$$;

grant execute on function public.church_extras(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- my_church_today, now with the church's name and giving link
-- ---------------------------------------------------------------------------
create or replace function public.my_church_today(p_local_date date default null)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_day date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_church uuid;
  v_name text;
  v_verified boolean;
  v_giving text;
  v_verse jsonb;
  v_news jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select p.church_id, c.name, c.verified, c.giving_url
    into v_church, v_name, v_verified, v_giving
    from public.profiles p join public.churches c on c.id = p.church_id
   where p.id = uid;

  if v_church is null then
    return jsonb_build_object('church_id', null, 'verified', false, 'verse', null, 'announcements', '[]'::jsonb);
  end if;

  if v_verified then
    select jsonb_build_object(
             'id', v.id, 'reference', v.verse_reference, 'text', v.verse_text,
             'pastor_note', v.pastor_note, 'starts_on', v.starts_on, 'ends_on', v.ends_on)
      into v_verse
      from public.church_verses v
     where v.church_id = v_church
       and v.starts_on <= v_day
       and (v.ends_on is null or v.ends_on >= v_day)
     order by v.starts_on desc, v.created_at desc
     limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id, 'message', a.message, 'expires_at', a.expires_at, 'created_at', a.created_at)
             order by a.created_at desc), '[]'::jsonb)
      into v_news
      from (select * from public.church_announcements
             where church_id = v_church and (expires_at is null or expires_at > now())
             order by created_at desc limit 5) a;
  end if;

  return jsonb_build_object(
    'church_id', v_church,
    'church_name', v_name,
    'verified', coalesce(v_verified, false),
    'giving_url', case when v_verified then v_giving end,
    'verse', v_verse,
    'announcements', coalesce(v_news, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.my_church_today(date) to authenticated;
