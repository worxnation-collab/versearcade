-- Verse Arcade — daily verse seeding RPC.
-- The daily drop is generated deterministically by date on the client, so any
-- client can safely seed the row (all clients produce identical content). This
-- avoids requiring a cron for MVP; a scheduled Edge Function can replace it
-- later for curated/edited content. Insert-if-absent, never overwrite.
create or replace function public.ensure_daily_verse(
  p_drop_date date,
  p_translation text,
  p_reference text,
  p_book text,
  p_chapter integer,
  p_verse_start integer,
  p_verse_end integer,
  p_text text,
  p_theme text,
  p_questions jsonb,
  p_facts jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.daily_verses (drop_date, translation, reference, book, chapter,
    verse_start, verse_end, verse_text, theme, questions, facts)
  values (p_drop_date, p_translation, p_reference, p_book, p_chapter,
    p_verse_start, p_verse_end, p_text, p_theme, p_questions, p_facts)
  on conflict (drop_date) do nothing;
end;
$$;

grant execute on function public.ensure_daily_verse(date,text,text,text,integer,integer,integer,text,text,jsonb,jsonb) to authenticated;
